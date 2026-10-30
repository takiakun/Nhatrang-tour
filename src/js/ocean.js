import { THREE } from './three.js';
import { ST } from '../state.js';
import { BD, BR, BW, BX0, BZ0, clamp } from './geo.js';
import { LITE, camera, sun, sunDir } from './scene.js';
import { N_WAVES, OC, WAVE_LAM, oceanStep, setWindOverride, waveScale, windTargetFrom } from './ocean-waves.js';
/* ======================= BIỂN: sóng Gerstner theo gió, lưới clipmap bám theo camera ======================= */
// Hình học: các vòng vuông đồng tâm bám theo camera (ô nhỏ nhất ở giữa, mỗi vòng ngoài ô gấp đôi), gộp thành một mesh một lần vẽ.
// Mỗi đỉnh nhận toạ độ lưới (aRing.xy, đơn vị ô) và cỡ ô (aRing.z); shader tự tính tâm vòng (làm tròn theo ô để lưới không "bơi") rồi dịch đỉnh theo
// các sóng Gerstner trong bảng ocean-waves.js (cùng bảng CPU dùng cho thuyền, người bơi). Sóng nhỏ tắt dần theo khoảng cách (tránh răng cưa thưa mẫu),
// mọi sóng tắt dần khi vào cạn (độ sâu từ uDepth) và ở mép bàn bản đồ. Pháp tuyến tính giải tích trong fragment (tầm nhìn xa hơn hình học), cộng thêm
// hai lớp nhiễu cuộn theo gió; bọt: mép bờ chạy theo pha, mũ bạc (whitecap) ở đỉnh sóng dốc khi gió mạnh; trời phản chiếu theo Fresnel và chói nắng.
var M = LITE ? 48 : 64, C0 = LITE ? 0.09 : 0.05;
var oceanU = null;

// bản đồ nhiễu tuần hoàn 256²: rg = pháp tuyến (đã mã hoá), b = độ cao (dùng làm hoa văn bọt)
function noiseTexture(){
  var S = 256, h = new Float32Array(S * S), seed = 12345;
  function rnd(){ seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  var amp = 1, tot = 0;
  for (var o = 0; o < 5; o++){ var f = 4 << o, lat = new Float32Array(f * f); for (var q = 0; q < lat.length; q++) lat[q] = rnd();
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++){ var u = x / S * f, v = y / S * f, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      fu = fu * fu * (3 - 2 * fu); fv = fv * fv * (3 - 2 * fv);
      var a = lat[(j % f) * f + (i % f)], b = lat[(j % f) * f + ((i + 1) % f)], c = lat[((j + 1) % f) * f + (i % f)], d = lat[((j + 1) % f) * f + ((i + 1) % f)];
      h[y * S + x] += amp * (a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv); }
    tot += amp; amp *= 0.55; }
  var data = new Uint8Array(S * S * 4);
  for (var y2 = 0; y2 < S; y2++) for (var x2 = 0; x2 < S; x2++){ var k = y2 * S + x2, hx = h[y2 * S + (x2 + 1) % S] - h[y2 * S + (x2 + S - 1) % S], hy = h[((y2 + 1) % S) * S + x2] - h[((y2 + S - 1) % S) * S + x2];
    data[k * 4] = clamp(0.5 - hx * 3.2, 0, 1) * 255; data[k * 4 + 1] = clamp(0.5 - hy * 3.2, 0, 1) * 255; data[k * 4 + 2] = clamp(h[k] / tot, 0, 1) * 255; data[k * 4 + 3] = 255; }
  var t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; }

function ringGeometry(){
  var levels = 1, need = Math.max(BW, BD) * 1.05; while (M / 2 * C0 * Math.pow(2, levels - 1) < need) levels++;
  var W = M + 1, quarter = M / 4 - 1, pos = [], ring = [], idx = [];
  for (var l = 0; l < levels; l++){ var c = C0 * Math.pow(2, l), base = pos.length / 3;
    for (var j = 0; j <= M; j++) for (var i = 0; i <= M; i++){ var lx = i - M / 2, lz = j - M / 2; pos.push(lx * c, 0, lz * c); ring.push(lx, lz, c); }
    for (var j2 = 0; j2 < M; j2++) for (var i2 = 0; i2 < M; i2++){ var cx = i2 + 0.5 - M / 2, cz = j2 + 0.5 - M / 2;
      if (l > 0 && Math.abs(cx) < quarter && Math.abs(cz) < quarter) continue;   // lỗ giữa chừa cho vòng mịn hơn (hơi nhỏ hơn để hai vòng gối nhau; shader bỏ phần chồng)
      var a = base + j2 * W + i2, b = a + 1, d = a + W, e = d + 1; idx.push(a, d, b, b, d, e); } }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aRing', new THREE.Float32BufferAttribute(ring, 3));
  var nrm = new Float32Array(pos.length); for (var n = 1; n < nrm.length; n += 3) nrm[n] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx); return g; }

var NW = N_WAVES;
var GLSL_WAVES = [
  'uniform float uT;', 'uniform vec4 uWV[' + NW + '];', 'uniform float uOm[' + NW + '];',
  'uniform sampler2D uDepth;', 'uniform vec4 uBox;', 'uniform vec2 uGrid;', 'uniform vec3 uBoard;'   // uBoard: bề rộng/2, sâu/2 trừ bo góc, bán kính bo
].join('\n');
function boardGLSL(){ return 'uniform vec4 uBoardC;\nfloat boardSD(vec2 p){ vec2 q = abs(p - uBoardC.xy) - uBoardC.zw + vec2(uBoard.z); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uBoard.z; }\n'; }

export function buildOcean(){
  var GX = ST.G.GX, GZ = ST.G.GZ, data = new Uint8Array(GX * GZ * 4);
  for (var k = 0; k < GX * GZ; k++){ data[k * 4] = clamp(((-ST.G.h[k]) + 1) / 7, 0, 1) * 255; data[k * 4 + 1] = ST.G.sea[k] * 255; data[k * 4 + 2] = 0; data[k * 4 + 3] = 255; }
  var dt = new THREE.DataTexture(data, GX, GZ, THREE.RGBAFormat); dt.magFilter = THREE.LinearFilter; dt.minFilter = THREE.LinearFilter; dt.generateMipmaps = false; dt.needsUpdate = true;
  var wv = [], om = []; for (var i = 0; i < NW; i++){ wv.push(new THREE.Vector4()); om.push(0); }
  oceanU = { uT:{ value:0 }, uWV:{ value:wv }, uOm:{ value:om }, uDepth:{ value:dt }, uBox:{ value:new THREE.Vector4(BX0, BZ0, BW, BD) }, uGrid:{ value:new THREE.Vector2(GX, GZ) },
    uBoard:{ value:new THREE.Vector3(0, 0, BR) }, uBoardC:{ value:new THREE.Vector4(BX0 + BW / 2, BZ0 + BD / 2, BW / 2, BD / 2) },
    uM:{ value:M }, uC0:{ value:C0 }, uNoise:{ value:noiseTexture() }, uWind:{ value:new THREE.Vector2(1, 0) }, uDetail:{ value:0.5 }, uCap:{ value:0.9 },
    uShallow:{ value:new THREE.Color('#3fc8cf') }, uDeep:{ value:new THREE.Color('#0f5f8c') }, uFoam:{ value:new THREE.Color('#ffffff') }, uSky:{ value:new THREE.Color('#bfe6f5') },
    uSkyTop:{ value:new THREE.Color('#4fb6e6') }, uSkyHor:{ value:new THREE.Color('#e6f8f3') }, uSunDir:{ value:new THREE.Vector3(0, 1, 0) }, uSunCol:{ value:new THREE.Color(0xffffff) } };
  var lam = WAVE_LAM;
  var wm = new THREE.MeshStandardMaterial({ color:'#ffffff', transparent:true, roughness:0.2, metalness:0.0 });
  wm.onBeforeCompile = function(sh){
    for (var key in oceanU) sh.uniforms[key] = oceanU[key];
    var wfd = lam.map(function(v){ return v < 1.5 ? [v * 25, v * 70] : (v < 5 ? [v * 12, v * 35] : [v * 5, v * 14]); }), wfdArr = 'const vec2 WFD[' + NW + '] = vec2[' + NW + '](' + wfd.map(function(f){ return 'vec2(' + f[0].toFixed(2) + ',' + f[1].toFixed(2) + ')'; }).join(',') + ');\n';
    var lamArr = 'const float WLAM[' + NW + '] = float[' + NW + '](' + lam.map(function(v){ return v.toFixed(3); }).join(',') + ');\n';
    sh.vertexShader = 'attribute vec3 aRing;\nvarying vec2 vBase;\nvarying float vCell;\nvarying float vFade;\n' + GLSL_WAVES + '\n' + boardGLSL() + lamArr + sh.vertexShader.replace('#include <begin_vertex>', [
      'vec2 ctr = floor(cameraPosition.xz / (2.0 * aRing.z) + 0.5) * 2.0 * aRing.z;',
      'vec2 base = ctr + aRing.xy * aRing.z;',
      'vec2 gq0 = vec2((base.x - uBox.x) / uBox.z, (base.y - uBox.y) / uBox.w) * (uGrid - 1.0);',
      'float dep0 = texture2D(uDepth, (gq0 + 0.5) / uGrid).r * 7.0 - 1.0;',
      'float fade = smoothstep(0.05, 1.8, dep0) * smoothstep(0.0, 5.0, -boardSD(base));',
      'float cd = length(base - cameraPosition.xz);',
      'vec3 dsp = vec3(0.0);',
      'for (int i = 0; i < ' + NW + '; i++){ vec4 w = uWV[i]; float th = w.z * dot(w.xy, base) - uOm[i] * uT; float fd = 1.0 - smoothstep(WLAM[i] * 2.5, WLAM[i] * 5.0, cd);',
      '  float cs = cos(th) * w.w * fd; dsp += vec3(w.x * cs, sin(th) * w.w * fd, w.y * cs); }',
      'dsp *= fade;',
      'vBase = base; vCell = aRing.z; vFade = fade;',
      'vec3 transformed = vec3(base.x + dsp.x, dsp.y, base.y + dsp.z);'
    ].join('\n')).replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = transformed;');
    sh.fragmentShader = [
      'uniform float uT; uniform vec4 uWV[' + NW + ']; uniform float uOm[' + NW + ']; uniform sampler2D uDepth; uniform vec4 uBox; uniform vec2 uGrid; uniform vec3 uBoard; uniform sampler2D uNoise;',
      'uniform float uM; uniform float uC0; uniform vec2 uWind; uniform float uDetail; uniform float uCap; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uSky;',
      'uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uSunDir; uniform vec3 uSunCol;',
      'varying vec2 vBase; varying float vCell; varying float vFade; varying vec3 vWPos;', boardGLSL(), lamArr, wfdArr, sh.fragmentShader].join('\n')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'if (boardSD(vBase) > 0.0) discard;',
        'if (vCell > uC0 * 1.5){ float cf = vCell * 0.5; vec2 fc = floor(cameraPosition.xz / (2.0 * cf) + 0.5) * 2.0 * cf; vec2 q = abs(vBase - fc); if (max(q.x, q.y) < 0.5 * uM * cf) discard; }',
        'vec2 gq = vec2((vBase.x - uBox.x) / uBox.z, (vBase.y - uBox.y) / uBox.w) * (uGrid - 1.0);',
        'vec4 dt = texture2D(uDepth, (gq + 0.5) / uGrid);',
        'float dep = dt.r * 7.0 - 1.0;',
        'float sea = dt.g;',
        'vec3 wvec = cameraPosition - vWPos; float wdist = length(wvec); vec3 vd = wvec / wdist;',
        // sóng giải tích (tầm nhìn xa hơn hình học): độ dốc, độ nhô crest
        'vec2 gr = vec2(0.0); float comp = 0.0, hgt = 0.0;',
        'for (int i = 0; i < ' + NW + '; i++){ vec4 w = uWV[i]; float th = w.z * dot(w.xy, vBase) - uOm[i] * uT; float fd = 1.0 - smoothstep(WFD[i].x, WFD[i].y, wdist);\n' +
        '  if (i >= 2){ float nz = texture2D(uNoise, vBase * 0.013 + vec2(float(i) * 0.31, 0.17)).b; th += (nz - 0.5) * 4.0; fd *= mix(0.45, 1.25, nz); }',
        '  float wa = w.z * w.w * fd * vFade; gr += w.xy * wa * cos(th); comp += wa * sin(th); hgt += w.w * fd * sin(th); }',
        // lớp nhiễu cuộn theo gió
        'vec2 wp = vBase;',
        'vec4 n1 = texture2D(uNoise, wp * 0.31 + uWind * uT * 0.045); vec4 n2 = texture2D(uNoise, wp * 0.93 - uWind.yx * vec2(1.0, -1.0) * uT * 0.07 + 0.37);',
        'float dfade = (1.0 - smoothstep(30.0, 200.0, wdist)) * uDetail * (0.35 + 0.65 * smoothstep(0.05, 0.8, dep));',
        'vec2 dn = ((n1.rg - 0.5) * 1.5 + (n2.rg - 0.5) * 1.0) * dfade;',
        'vec3 wn = normalize(vec3(-gr.x - dn.x, max(0.2, 1.0 - comp), -gr.y - dn.y));',
        'float noiseH = n1.b * 0.6 + n2.b * 0.4;',
        // màu nước: nông → sâu, đỉnh sóng sáng hơn (ánh xuyên nước), hõm sóng tối hơn
        'diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.1, 3.4, dep));',
        'diffuseColor.a = mix(0.32, 0.94, smoothstep(0.0, 2.4, dep));',
        'float crestK = clamp(hgt * 6.0, -1.0, 1.0); diffuseColor.rgb = mix(diffuseColor.rgb, uShallow * 1.15, clamp(crestK, 0.0, 1.0) * 0.38 * smoothstep(0.5, 2.0, dep)); diffuseColor.rgb *= 1.0 + crestK * 0.06;',
        // bọt: mép bờ chạy theo pha sóng + mũ bạc ở đỉnh dốc
        'float fw = 0.32 + 0.12 * sin(uT * 1.2 + dot(vBase, uWind) * 1.7 + vBase.x * 0.5);',
        'float foam = (1.0 - smoothstep(fw * 0.35, fw, dep)) * step(-0.02, dep);',
        'float lines = smoothstep(0.82, 0.97, sin(dep * 16.0 - uT * 2.1 + dot(vBase, uWind) * 0.6)) * (1.0 - smoothstep(0.15, 0.75, dep)) * step(0.0, dep);',
        'foam = clamp(foam + lines * 0.7, 0.0, 1.0) * mix(0.25, 1.0, sea);',
        'float capK = smoothstep(uCap, uCap + 0.18, comp) * smoothstep(0.35, 0.62, noiseH + (comp - uCap) * 1.4) * (1.0 - smoothstep(60.0, 220.0, wdist));',
        'foam = max(foam, capK * 0.78);',
        // Fresnel: phản chiếu trời
        'vec3 rf = reflect(-vd, wn); float fres = pow(1.0 - clamp(dot(wn, vd), 0.0, 1.0), 5.0);',
        'vec3 skyC = mix(uSkyHor, uSkyTop, smoothstep(0.0, 0.7, rf.y)); skyC = mix(skyC, uSky, 0.35);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, skyC, clamp(fres * 0.6 + 0.03, 0.0, 0.7));',
        'diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, foam * 0.85);',
        'diffuseColor.a = max(diffuseColor.a, max(foam, fres * 0.6) * 0.92);'
      ].join('\n'))
      .replace('#include <normal_fragment_begin>', [
        '#include <normal_fragment_begin>',
        'normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);'
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        'totalEmissiveRadiance += uSunCol * pow(max(dot(rf, uSunDir), 0.0), 260.0) * 1.7 * (1.0 - foam) * smoothstep(0.1, 1.2, dep);'
      ].join('\n'));
  };
  wm.customProgramCacheKey = function(){ return 'ocean-' + M; };
  var m = new THREE.Mesh(ringGeometry(), wm); m.frustumCulled = false; m.receiveShadow = true; m.renderOrder = 2; ST.oceanU = oceanU;
  OC.depthFn = function(x, z){ return -ST.G.hAt(x, z); };
  // gió ép bằng URL: ?wind=<km/h>&wdir=<độ thổi từ>
  try { var qs = new URLSearchParams(location.search), w = parseFloat(qs.get('wind')), d = parseFloat(qs.get('wdir')); if (isFinite(w) || isFinite(d)) setWindOverride(isFinite(w) ? w : 14, isFinite(d) ? d : 45); } catch (e){}
  oceanTarget(); oceanStep(0, oceanTarget(), true); return m; }

function oceanTarget(){ return windTargetFrom(ST.WX, new Date()); }
// đặt ngay gió (kiểm thử, chụp ảnh); kmh == null để bỏ ép
export function setWind(kmh, from){ setWindOverride(kmh, from); oceanStep(0, oceanTarget(), true); }
// gọi mỗi khung từ frame()
export function updateOcean(dt){
  if (!oceanU) return; oceanStep(dt, oceanTarget());
  var wv = oceanU.uWV.value, om = oceanU.uOm.value; for (var i = 0; i < NW; i++){ wv[i].set(OC.dir[i * 2], OC.dir[i * 2 + 1], OC.k[i], OC.amp[i]); om[i] = OC.om[i]; }
  oceanU.uT.value = OC.t;
  var to = (OC.from + 180) * Math.PI / 180; oceanU.uWind.value.set(Math.sin(to), -Math.cos(to));
  var g = clamp(OC.kmh / 32, 0, 1.3); oceanU.uDetail.value = 0.35 + 0.65 * Math.min(g, 1); oceanU.uCap.value = 0.7 - 0.4 * Math.min(g, 1.2) + 0.28 * (1 - Math.min(g, 1));
  oceanU.uSunDir.value.copy(sunDir); oceanU.uSunCol.value.copy(sun.color).multiplyScalar(clamp(sun.intensity / Math.PI, 0, 1.4)); }
// bảng màu theo giờ trong ngày (applyTod gọi)
ST.oceanTod = function(a, b, f){ if (!oceanU) return;
  oceanU.uShallow.value.lerpColors(a.sh, b.sh, f); oceanU.uDeep.value.lerpColors(a.dp, b.dp, f); oceanU.uFoam.value.lerpColors(a.foam, b.foam, f); oceanU.uSky.value.lerpColors(a.sky, b.sky, f);
  oceanU.uSkyTop.value.lerpColors(a.top, b.top, f); oceanU.uSkyHor.value.lerpColors(a.bot, b.bot, f); };
export { waveScale };
