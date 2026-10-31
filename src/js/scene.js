import { THREE } from './three.js';
import { ST } from '../state.js';
import { genStreetTrees, BD, BR, BW, BX0, BX1, BZ0, BZ1, DIST, FLOOR, H, ISLANDS, LLs, LM_DEF, LM_EXTRA, OSM, P, RAIL, ROUNDS, TOWER_F, TUBE_F, VB, boardClamp, clamp, coastX, fillPoly, ih, inBoard, landRuns, lerp, mulberry32, paintGround, resample, roundD, segD2, smooth, strokeLine, toLocal, toWorld, worldCtx } from './geo.js';
import { MODEL_DATA } from './models.js';
/* ======================= SCENE (three.js r186) ======================= */
var errEl = document.getElementById('err'), loader = document.getElementById('loader'), loaderText = document.getElementById('loaderText');
function fail(msg){ loader.hidden = true; errEl.textContent = msg; errEl.hidden = false; }
if (!THREE || !THREE.OrbitControls){ fail('Không tải được thư viện 3D. Hãy kiểm tra kết nối mạng rồi tải lại trang.'); throw new Error('nt-stop'); }

var stage = document.getElementById('stage');
var renderer;
try { renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' }); }
catch (e){ fail('Trình duyệt này chưa bật WebGL nên không hiển thị được bản đồ 3D. Hãy thử Chrome, Safari hoặc Firefox bản mới.'); throw new Error('nt-stop'); }
// Chất lượng: LITE = giảm mật độ thế giới (nhà, cây, người, xe) lúc dựng; SMALL = màn hình nhỏ, giảm độ phân giải, bóng.
// Điện thoại mạnh (≥ 6 nhân, hoặc iPhone màn hình dpr 3) vẫn dựng bản đầy đủ; nếu chạy không nổi, bộ điều tốc trong ui.js
// tự hạ chất lượng và ghi nhớ để lần sau dựng bản LITE. Ép bằng ?q=lite hoặc ?q=full.
var QP = (location.search.match(/[?&]q=(lite|full)/) || [])[1], QSAVED = null; try { QSAVED = localStorage.getItem('nt-q'); } catch (e){}
var SMALL = Math.min(innerWidth, innerHeight) < 700, CORES = navigator.hardwareConcurrency || 8, APPLE = /iPhone|iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
var LITE = QP ? QP === 'lite' : (QSAVED === 'lite' || CORES <= 2 || (SMALL && CORES < 6 && !(APPLE && devicePixelRatio >= 3)));
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE || SMALL ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // r186: PCFSoftShadowMap đã bỏ, PCFShadowMap đã mềm
renderer.shadowMap.autoUpdate = false;
stage.appendChild(renderer.domElement);
var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd4eff2, 400, 1300);
ST.fogBase = { near:400, far:1300 };   // cận/xa sương gốc; weather.js thu hẹp lại khi mưa (rainFog)
var camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 4000);
// r155+ bỏ chế độ ánh sáng cũ (legacy), nơi cường độ bị nhân π: nhân LIGHT_K = π để giữ nguyên độ sáng đã chỉnh cho r147
var LIGHT_K = Math.PI;
var hemi = new THREE.HemisphereLight(0xe3f6ff, 0x93a46a, 0.72 * LIGHT_K); scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff1d6, 1.35 * LIGHT_K);
sun.castShadow = true;
sun.shadow.mapSize.set(LITE || SMALL ? 1024 : 2048, LITE || SMALL ? 1024 : 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 1.6;   // bóng mềm hơn (PCF lấy mẫu rộng hơn)
var SC = sun.shadow.camera; SC.near = 1; SC.far = 900;
scene.add(sun); scene.add(sun.target);

/* ---------- material & geometry helpers ---------- */
var matCache = {}, glowMats = [], wetMats = [];
function mat(color, extra){ var key = color + (extra ? JSON.stringify(extra) : ''); if (matCache[key]) return matCache[key];
  var o = { color:color, roughness:0.82, metalness:0 }; if (extra) for (var k in extra) o[k] = extra[k];
  return (matCache[key] = wetReg(new THREE.MeshStandardMaterial(o))); }
function lowMat(c, s){ return (typeof c === 'string' && s <= 8) ? mat(c, { flatShading:true }) : c; }
function mesh(geo, c, extra){ var m = new THREE.Mesh(geo, typeof c === 'string' ? mat(c, extra) : c); m.castShadow = true; m.receiveShadow = true; return m; }
function box(w, h, d, c){ return mesh(new THREE.BoxGeometry(w, h, d), c); }
function cyl(rt, rb, h, s, c){ return mesh(new THREE.CylinderGeometry(rt, rb, h, s), lowMat(c, s)); }
function cone(r, h, s, c){ return mesh(new THREE.ConeGeometry(r, h, s), lowMat(c, s)); }
function sph(r, c, ws, hs){ return mesh(new THREE.SphereGeometry(r, ws || 12, hs || 8), c); }
function at(o, x, y, z){ o.position.set(x, y, z); return o; }
function glowMat(color, emissive, base, peak){ var m = new THREE.MeshStandardMaterial({ color:color, roughness:0.7, emissive:emissive, emissiveIntensity:base }); glowMats.push({ m:m, base:base, peak:peak }); return wetReg(m); }
function prism(w, h, len, c){ var s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath(); var geo = new THREE.ExtrudeGeometry(s, { depth:len, bevelEnabled:false }); geo.translate(0, 0, -len / 2); return mesh(geo, mat(c, { flatShading:true })); }
function beam(a, b, r, c){ var dir = new THREE.Vector3().subVectors(b, a), len = dir.length(), m = cyl(r, r, len, 5, c); m.position.copy(a).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); return m; }
function MX(x, y, z, rx, ry, rz, sx, sy, sz){ if (sx == null) sx = 1; if (sy == null) sy = sx; if (sz == null) sz = sx;
  return new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx, sy, sz)); }
function merge(parts){ var P_ = [], N_ = [], C_ = [];
  parts.forEach(function(p){ var g = p[0].index ? p[0].toNonIndexed() : p[0].clone(); g.applyMatrix4(p[1]); var a = g.attributes.position, n = g.attributes.normal, c = new THREE.Color(p[2]);
    for (var i = 0; i < a.count; i++){ P_.push(a.getX(i), a.getY(i), a.getZ(i)); N_.push(n.getX(i), n.getY(i), n.getZ(i)); C_.push(c.r, c.g, c.b); } });
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P_, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N_, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C_, 3)); g.computeBoundingSphere(); return g; }
function blobGeo(){ var g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(); for (var i = 0; i < p.count; i++){ v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); } return g; }
var VCM = wetReg(new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.8 }));
var VCM2 = wetReg(new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.85, side:THREE.DoubleSide }));

/* ---------- ướt (mưa) và lay theo gió: uniform dùng chung ---------- */
// ST.wetU: độ ướt 0..1 (weather.js ghi: lên ~10 s, khô ~40 s). Địa hình đọc thẳng trong shader (tối đi, vũng nước, phản chiếu trời giả);
// vật liệu nhà, cây, xe chỉ chỉnh màu (tối đi ≤ 16%) và độ nhám (≤ 30%) qua setWet(), gọi khi độ ướt đổi > 0,02, không biên dịch lại shader.
ST.wetU = { value:0 }; ST.wetSky = { value:new THREE.Color(0.5, 0.55, 0.6) };   // wetSky: màu trời phản chiếu trong vũng nước (weather.js cập nhật theo sương)
function wetReg(m){ wetMats.push({ m:m, c:null, r:0 }); return m; }   // màu, độ nhám gốc lấy lúc setWet đầu tiên (kitMat... còn chỉnh sau khi tạo)
function setWet(w){ for (var i = 0; i < wetMats.length; i++){ var e = wetMats[i]; if (!e.c){ e.c = e.m.color.clone(); e.r = e.m.roughness; } e.m.roughness = e.r * (1 - 0.3 * w); e.m.color.copy(e.c).multiplyScalar(1 - 0.16 * w); } }
// ST.swayU: thời gian lay, gió (hướng thổi tới × cường độ tức thời gồm cả giật; độ dài ≈ windK), cơn giật 0..1. ui.js ghi mỗi khung từ OC.
// swayMat({ amp, hRef, attr, flutter, double }) = MeshStandardMaterial vertexColors, đỉnh nghiêng theo gió sau phép biến đổi instance (không cần sửa hình):
//   amp = độ lệch tối đa của ngọn (đơn vị bản đồ) khi windK = 1; hRef = độ cao hình gốc để trọng số = (y/hRef)² (gốc đứng yên, ngọn lay nhiều nhất);
//   attr = true thì trọng số lấy từ thuộc tính đỉnh `aSway` (0 gốc → 1 ngọn lá) của geometry thay vì theo độ cao (cho cây dừa); flutter > 0 thêm run rẩy khi giật (ô, lá).
// Một chương trình shader dùng chung cho mọi swayMat cùng kiểu (amp, hRef là uniform riêng từng vật liệu). Bóng đổ không lay theo (depth material riêng, chênh nhỏ).
ST.swayU = { uT:{ value:0 }, uWind:{ value:new THREE.Vector2() }, uG:{ value:0 } };
var SWAY_VS = `
vec4 mvPosition = vec4( transformed, 1.0 );
vec2 swO_ = vec2( 0.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition; swO_ = instanceMatrix[3].xz;
#endif
#ifdef SWAY_ATTR
  float swW_ = aSway;
#else
  float swW_ = clamp( position.y / uSwH, 0.0, 1.0 ); swW_ *= swW_;
#endif
float swPh_ = swO_.x * 7.3 + swO_.y * 5.1;
float swV_ = sin( uSwT * 1.9 + swPh_ ) * 0.55 + sin( uSwT * 3.3 + swPh_ * 1.7 ) * 0.45 + uSwG * 0.5 * sin( uSwT * 8.0 + swPh_ * 2.0 );
float swA_ = length( uSwWind );
vec2 swD_ = uSwWind / max( swA_, 1e-4 );
float swL_ = swA_ * ( 0.55 + 0.45 * swV_ );
mvPosition.xz += ( swD_ * swL_ + vec2( -swD_.y, swD_.x ) * swV_ * swA_ * 0.25 ) * uSwAmp * swW_;
mvPosition.y += ( swV_ * swA_ * uSwFl * 0.35 - swL_ * swL_ * 0.2 ) * uSwAmp * swW_;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`;
function swayMat(o){ o = o || {}; var attr = !!o.attr, uAmp = { value:o.amp || 0.08 }, uH = { value:o.hRef || 1 }, uFl = { value:o.flutter || 0 };
  var m = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:o.roughness || 0.8, side:o.double ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = function(sh){ var U = ST.swayU; sh.uniforms.uSwT = U.uT; sh.uniforms.uSwWind = U.uWind; sh.uniforms.uSwG = U.uG; sh.uniforms.uSwAmp = uAmp; sh.uniforms.uSwH = uH; sh.uniforms.uSwFl = uFl;
    sh.vertexShader = (attr ? '#define SWAY_ATTR\nattribute float aSway;\n' : '') + 'uniform float uSwT; uniform vec2 uSwWind; uniform float uSwG; uniform float uSwAmp; uniform float uSwH; uniform float uSwFl;\n' + sh.vertexShader.replace('#include <project_vertex>', SWAY_VS); };
  m.customProgramCacheKey = function(){ return 'sway1' + (attr ? 'a' : ''); };
  return wetReg(m); }
ST.swayMat = swayMat;

/* ---------- mô hình Kenney (dữ liệu trong models.js) ---------- */
// Geometry chuẩn hoá: chân đế x, z ∈ [−0.5, 0.5], y ∈ [0, 1] => đặt bằng scale (rộng, cao, sâu) như khối hộp.
// userData.size = kích thước gốc của mô hình, để tính tỷ lệ cao tự nhiên.
var modelCache = {};
function b64arr(s, T){ var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); }
function modelGeo(id){ if (modelCache[id]) return modelCache[id];
  var m = MODEL_DATA[id], q = b64arr(m.p, Int16Array), n = b64arr(m.n, Int8Array), c = b64arr(m.c, Uint8Array), mk = m.m ? b64arr(m.m, Uint8Array) : null, N = q.length / 3;
  var P = new Float32Array(N * 3), NN = new Float32Array(N * 3), CC = new Float32Array(N * 3), MK = new Float32Array(N);
  for (var k = 0; k < N * 3; k++){ var a = k % 3, t = (q[k] + 32768) / 65535; P[k] = a === 1 ? t : t - 0.5; NN[k] = n[k] / 127; var v = c[k] / 255; CC[k] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  if (mk) for (k = 0; k < N; k++) MK[k] = mk[k] / 255;
  var sx = m.size[0], sy = m.size[1], sz = m.size[2];
  for (k = 0; k < N; k++){ var nx = NN[k * 3] / sx, ny = NN[k * 3 + 1] / sy, nz = NN[k * 3 + 2] / sz, l = Math.hypot(nx, ny, nz) || 1; NN[k * 3] = nx / l; NN[k * 3 + 1] = ny / l; NN[k * 3 + 2] = nz / l; }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(NN, 3)); g.setAttribute('color', new THREE.BufferAttribute(CC, 3)); g.setAttribute('aMask', new THREE.BufferAttribute(MK, 1));
  g.setIndex(new THREE.BufferAttribute(b64arr(m.i, Uint16Array), 1)); g.computeBoundingSphere(); g.userData.size = [sx, sy, sz];
  return (modelCache[id] = g); }
// Vật liệu cho mô hình: màu đỉnh × màu từng căn (instanceColor), riêng phần mái (aMask) × màu mái (aRoof).
// Pháp tuyến được scale lại trong modelGeo theo kích thước gốc nên chỉ cần scale instance theo đúng tỷ lệ đó.
// r186: vColor luôn là vec4 nên gán vec4(rgb, 1)
function kitMat(){ var m = glowMat('#ffffff', '#ffd38a', 0, 0.85); m.vertexColors = true; m.roughness = 0.78;
  // Ban đêm: ô cửa sổ sáng rải theo thủ tục trên tường phẳng, thay cho phát sáng cam đều cả khối
  m.onBeforeCompile = function(sh){ sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMask;\nattribute vec3 aRoof;\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying vec2 vWM;\nvarying float vBaseH;')
    .replace('#include <color_vertex>', `vColor = vec4(color * mix(instanceColor, aRoof, aMask), 1.0);
      vec4 wp_ = vec4(position, 1.0); vec3 wn_ = normal;
      #ifdef USE_INSTANCING
        wp_ = instanceMatrix * wp_; wn_ = mat3(instanceMatrix) * wn_;
      #endif
      vWP = (modelMatrix * wp_).xyz; vWN = normalize(mat3(modelMatrix) * wn_); vWM = vec2(dot(color, vec3(0.299, 0.587, 0.114)), aMask);
      float by_ = 0.0;
      #ifdef USE_INSTANCING
        by_ = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).y;
      #endif
      vBaseH = (vWP.y - by_) / ${FLOOR.toFixed(4)};`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying vec2 vWM;\nvarying float vBaseH;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 1.0, vBaseH));')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // ô cửa sổ sáng rải trên tường phẳng (màu đỉnh sáng, không phải mái, gờ, khung tối): lưới theo tầng × bề ngang, ~58% ô sáng
        vec3 n_ = normalize(vWN); float wall_ = (1.0 - smoothstep(0.2, 0.35, abs(n_.y))) * step(0.3, vWM.x) * (1.0 - step(0.5, vWM.y));
        float along_ = dot(vWP.xz, vec2(-n_.z, n_.x)) / ${(FLOOR * 1.05).toFixed(4)}, up_ = vWP.y / ${FLOOR.toFixed(4)};
        vec2 cell_ = floor(vec2(along_, up_)), f_ = vec2(fract(along_), fract(up_));
        float h_ = fract(sin(dot(cell_, vec2(12.9898, 78.233))) * 43758.5453);
        float win_ = step(0.26, f_.x) * step(f_.x, 0.74) * step(0.3, f_.y) * step(f_.y, 0.78) * step(0.42, h_);
        totalEmissiveRadiance *= wall_ * win_;
      }`); };
  m.customProgramCacheKey = function(){ return 'kit3'; };
  return m; }
var KIT = null; function kit(){ return KIT || (KIT = kitMat()); }
// Kích thước (rộng, cao, dài) để mô hình dài đúng len theo trục z mà vẫn giữ tỷ lệ gốc
function fitLen(id, len){ var s = modelGeo(id).userData.size, k = len / s[2]; return new THREE.Vector3(s[0] * k, s[1] * k, len); }
// Mô hình đặt riêng lẻ (không instancing): màu mái/tán nướng thẳng vào màu đỉnh, dùng VCM.
// Mũi tàu, đầu xe Kenney hướng +z; flip quay 180° cho các đối tượng code cũ coi −z là phía trước.
function kitMesh(id, len, roof, flip){ var g = modelGeo(id).clone(), mk = g.attributes.aMask.array, a = g.attributes.color.array.slice(), rc = new THREE.Color(roof || '#d9483b');
  for (var i = 0; i < mk.length; i++) if (mk[i] > 0){ a[i * 3] *= rc.r; a[i * 3 + 1] *= rc.g; a[i * 3 + 2] *= rc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); var m = new THREE.Mesh(g, VCM); m.scale.copy(fitLen(id, len)); if (flip) m.rotation.y = Math.PI;
  m.castShadow = m.receiveShadow = true; var o = new THREE.Group(); o.add(m); return o; }
// Mô hình giữ đúng toạ độ gốc lúc dựng (không chuẩn hoá về gốc), dùng cho địa danh dựng bằng Blender
function kitNative(id, material){ var d = MODEL_DATA[id], m = new THREE.Mesh(modelGeo(id), material || VCM); m.scale.set(d.size[0], d.size[1], d.size[2]);
  m.position.set(d.min[0] + d.size[0] / 2, d.min[1], d.min[2] + d.size[2] / 2); m.castShadow = m.receiveShadow = true; var g = new THREE.Group(); g.add(m); return g; }
// InstancedMesh động dùng kitMat: màu từng chiếc = instanceColor (mặc định trắng), mái = aRoof
function kitDyn(id, n, cast){ var g = modelGeo(id).clone(), N = Math.max(n, 1), im = dynInst(g, kit(), n, cast);
  g.setAttribute('aRoof', new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(0.85), 3)); for (var i = 0; i < N; i++){ _c.setRGB(1, 1, 1); im.setColorAt(i, _c); } return im; }

var CHX = 4, CHZ = 4, _d = new THREE.Object3D(), _c = new THREE.Color(), _c2 = new THREE.Color();
function chunkOf(x, z){ return clamp(Math.floor((z - BZ0) / BD * CHZ), 0, CHZ - 1) * CHX + clamp(Math.floor((x - BX0) / BW * CHX), 0, CHX - 1); }
function instChunks(geo, material, items, setter, opt){ opt = opt || {};
  var buckets = []; for (var i = 0; i < CHX * CHZ; i++) buckets.push([]);
  items.forEach(function(it){ buckets[chunkOf(it.x, it.z)].push(it); });
  var out = [];
  buckets.forEach(function(list){ if (!list.length) return;
    var g = geo.clone(), im = new THREE.InstancedMesh(g, material, list.length), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    var roof = opt.roof ? new Float32Array(list.length * 3) : null; if (roof) g.setAttribute('aRoof', new THREE.InstancedBufferAttribute(roof, 3));
    list.forEach(function(it, k){ _d.position.set(0, 0, 0); _d.rotation.set(0, 0, 0); _d.scale.set(1, 1, 1); _c.setRGB(1, 1, 1); setter(_d, it, _c); _d.updateMatrix();
      im.setMatrixAt(k, _d.matrix); im.setColorAt(k, _c); if (roof){ _c2.set(opt.roof(it)); roof[k * 3] = _c2.r; roof[k * 3 + 1] = _c2.g; roof[k * 3 + 2] = _c2.b; } var p = _d.position; mn[0] = Math.min(mn[0], p.x); mn[1] = Math.min(mn[1], p.y); mn[2] = Math.min(mn[2], p.z); mx[0] = Math.max(mx[0], p.x); mx[1] = Math.max(mx[1], p.y); mx[2] = Math.max(mx[2], p.z); });
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2), Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 + (opt.pad || 4));
    im.castShadow = opt.cast !== false; im.receiveShadow = opt.receive !== false;
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im); out.push(im); });
  return out; }
function dynInst(geo, material, n, cast){ var im = new THREE.InstancedMesh(geo, material, Math.max(n, 1)); im.count = n; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = cast !== false; im.receiveShadow = true; scene.add(im); return im; }
// Quầng sáng tròn: ImageData 128², alpha = pow(1 − r², e) (lõi sáng, quầng mượt, không viền, không banding); chỉ lấy màu RGB của `inner`, `outer` bỏ qua (giữ chữ ký cũ)
function radialTex(inner, outer, e){ var m = /(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(inner || ''), rgb = m ? [+m[1], +m[2], +m[3]] : [255, 255, 255], N = 128, d = new Uint8Array(N * N * 4), pw = e || 2.2;
  for (var j = 0; j < N; j++) for (var i = 0; i < N; i++){ var dx = (i + 0.5) / N * 2 - 1, dy = (j + 0.5) / N * 2 - 1, r2 = Math.min(1, dx * dx + dy * dy), k = (j * N + i) * 4;
    d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = Math.round(255 * Math.pow(1 - r2, pw)); }
  var t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; }
function glowPoints(positions, colors, size, color){ var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  var m = new THREE.PointsMaterial({ size:size, sizeAttenuation:true, map:radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color:color || '#ffffff', vertexColors:!!colors, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
  // điểm sáng nhỏ theo khoảng cách thật (size ~0,06 = 3 m); chặn 2..80 px để sát camera không phình thành đĩa lấp màn hình (iOS giới hạn ~511 px)
  m.onBeforeCompile = function(sh){ sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n\tgl_PointSize = clamp(gl_PointSize, 2.0, 80.0);'); };
  var p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 5; scene.add(p); return p; }

/* ---------- landmark builders (model units, scaled when placed) ---------- */
// Dựng bằng Blender (tools/blender/ponagar.py), cùng hệ đơn vị mô hình với bản khối hộp cũ nên place() giữ nguyên tỷ lệ 0.22
function buildPonagar(){ return kitNative('ponagar'); }
function buildHonChong(){ var g = new THREE.Group(), geo = new THREE.DodecahedronGeometry(1, 0);
  [[0,0.4,0,2.3,1.4,1.9,'#c2b6a2'],[0.9,2.1,0.2,1.5,1.05,1.3,'#b3a691'],[0.5,3.5,0,1.15,0.95,1,'#c8bca8'],[-2.2,0.2,1.6,1.7,1.1,1.5,'#ab9f8b'],[2.6,-0.1,-1.6,1.9,1.1,1.6,'#b8ac97'],[3.6,-0.4,1.4,1.3,0.9,1.2,'#a89a86'],[-1.2,0,-2.4,1.2,0.8,1.1,'#bdb19c'],[4.6,-0.6,-0.2,1.4,0.8,1.3,'#b0a38f']].forEach(function(r){
    var m = mesh(geo, mat(r[6], { flatShading:true })); m.scale.set(r[3], r[4], r[5]); m.position.set(r[0], r[1], r[2]); m.rotation.set(r[0], r[2], r[1]); g.add(m); });
  return g; }
function buildChoDam(){ return kitNative('chodam'); }   // Blender: tools/blender/chodam.py
function buildBuddha(){ return kitNative('buddha'); }   // Blender: tools/blender/buddha.py, mặt quay hướng đông
function buildPagoda(){ var g = new THREE.Group();
  g.add(at(box(5.2, 1.6, 3.6, '#f2d27a'), 0, 0.8, 0));
  for (var i = 0; i < 4; i++) g.add(at(cyl(0.14, 0.14, 1.6, 6, '#b8402c'), 2.65, 0.8, -1.35 + i * 0.9));
  var r1 = cone(1, 1.5, 4, '#d6492f'); r1.rotation.y = Math.PI / 4; r1.scale.set(4.4, 1, 3.2); g.add(at(r1, 0, 2.35, 0));
  g.add(at(box(2.8, 0.7, 2, '#f2d27a'), 0, 3.3, 0));
  var r2 = cone(1, 1, 4, '#d6492f'); r2.rotation.y = Math.PI / 4; r2.scale.set(2.4, 1, 1.8); g.add(at(r2, 0, 4.1, 0)); return g; }
function buildCathedral(){ return kitNative('cathedral'); }   // Blender: tools/blender/cathedral.py
// Blender: tools/blender/tramhuong.py. Ban đêm cả tháp sáng lên (vật liệu phát sáng theo giờ, như bản cũ)
var towerGlowVC = glowMat('#ffffff', '#ffb37a', 0.05, 1.2); towerGlowVC.vertexColors = true;
function buildTramHuong(){ return kitNative('tramhuong', towerGlowVC); }
function buildInstitute(){ var g = new THREE.Group();
  g.add(at(box(7, 2.6, 3.8, '#efbd4a'), 0, 1.3, 0));
  var r = cone(1, 1.6, 4, '#c9452f'); r.rotation.y = Math.PI / 4; r.scale.set(5.4, 1, 3.1); g.add(at(r, 0, 3.4, 0));
  g.add(at(box(2.2, 3.1, 4.4, '#f3c95c'), 0, 1.55, 0));
  var r2 = cone(1, 1.3, 4, '#c9452f'); r2.rotation.y = Math.PI / 4; r2.scale.set(1.9, 1, 3.4); g.add(at(r2, 0, 3.75, 0));
  for (var i = 0; i < 4; i++) g.add(at(cyl(0.14, 0.14, 2.4, 6, '#ffffff'), 3.75, 1.2, -1.35 + i * 0.9));
  g.add(at(box(0.6, 0.1, 4.4, '#ffffff'), 3.75, 2.45, 0)); return g; }
function buildColonial(w, d, floors, wall, roof){ var g = new THREE.Group(), h = floors * 1.3;
  g.add(at(box(w, h, d, wall), 0, h / 2, 0)); g.add(at(box(w + 0.2, 0.15, d + 0.2, '#ffffff'), 0, h, 0));
  var r = cone(1, 1.1, 4, roof); r.rotation.y = Math.PI / 4; r.scale.set(w * 0.78, 1, d * 0.78); g.add(at(r, 0, h + 0.62, 0));
  for (var i = 0; i < Math.floor(w / 0.9); i++) g.add(at(box(0.45, 0.8, 0.06, '#6f8ea3'), -w / 2 + 0.6 + i * 0.9, h * 0.55, d / 2 + 0.02));
  return g; }
function buildStation(){ return kitNative('station'); }   // Blender: tools/blender/station.py
// hải đăng Mũi Chụt, kích thước thật (tháp ~12 m, chiều cao theo VB): tháp trắng có dải đỏ, buồng đèn sáng vàng
function buildLighthouse(){ var g = new THREE.Group(), H = 12 * VB;
  g.add(at(box(0.4, 0.06, 0.28, '#d8d2c6'), 0, 0.03, 0)); g.add(at(box(0.16, 0.1, 0.12, '#f3ead8'), -0.1, 0.11, 0.04));   // nền 20 × 14 m (chân đế OSM) + nhà trực đèn
  g.add(at(cyl(0.032, 0.046, H, 10, '#f7f5ef'), 0.08, 0.06 + H / 2, 0));
  g.add(at(cyl(0.036, 0.04, H * 0.14, 10, '#c8452f'), 0.08, 0.06 + H * 0.62, 0));
  var lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), new THREE.MeshBasicMaterial({ color:0xffd56a })); g.add(at(lamp, 0.08, 0.06 + H + 0.025, 0));
  var cap = cone(0.045, 0.05, 10, '#c8452f'); g.add(at(cap, 0.08, 0.06 + H + 0.075, 0)); return g; }
function buildTemple(){ var g = new THREE.Group();
  g.add(at(box(2.2, 1.1, 1.8, '#f2d27a'), 0, 0.55, 0));
  var r1 = cone(1, 0.9, 4, '#c8452f'); r1.rotation.y = Math.PI / 4; r1.scale.set(2, 1, 1.7); g.add(at(r1, 0, 1.55, 0));
  g.add(at(box(1.1, 0.5, 0.9, '#f2d27a'), 0, 2.1, 0));
  var r2 = cone(1, 0.6, 4, '#c8452f'); r2.rotation.y = Math.PI / 4; r2.scale.set(1.1, 1, 0.95); g.add(at(r2, 0, 2.65, 0));
  g.add(at(cyl(0.35, 0.45, 0.4, 10, '#e9e4d8'), 1.8, 0.2, 0.6)); g.add(at(sph(0.32, '#f7f5ef'), 1.8, 0.75, 0.6)); g.add(at(sph(0.17, '#f7f5ef'), 1.8, 1.15, 0.6));
  return g; }
function buildCablePylon(h){ var g = new THREE.Group(), tw = cyl(0.12, 0.42, h + 1.5, 4, '#f2f2f2'); tw.rotation.y = Math.PI / 4; g.add(at(tw, 0, (h + 1.5) / 2 - 1.5, 0));
  g.add(at(box(1.6, 0.14, 0.2, '#e0473a'), 0, h, 0)); g.add(at(box(0.5, 0.3, 0.5, '#e0473a'), 0, h - 0.5, 0)); return g; }
function buildCableStation(){ var g = new THREE.Group(); g.add(at(box(1.3, 1.1, 1.3, '#ffffff'), 0, 0.55, 0)); g.add(at(box(1.6, 0.16, 1.6, '#f2592c'), 0, 1.18, 0)); g.add(at(box(0.06, 0.5, 0.8, '#3f7fae'), 0.66, 0.6, 0)); return g; }
function buildCruiseShip(){ return kitMesh('ship-liner', 6.4, null, true); }
function buildCargoShip(){ return kitMesh('ship-cargo', 5.4, null, true); }

/* ---------- boats ---------- */
// Thuyền Kenney (Watercraft Kit). Chiều dài theo đơn vị bản đồ; mũi hướng −z như code chuyển động đang dùng.
var BOAT_L = 0.46;
function fishingBoat(hull, trim, s){ return kitMesh('boat-fishing', BOAT_L * (s || 1), trim, true); }
function ferryBoat(){ return kitMesh('boat-ferry', 0.84, '#1e6fa8', true); }
var speedN = 0; function speedBoat(){ return kitMesh(speedN++ % 2 ? 'boat-speed-e' : 'boat-speed-a', 0.42, null, true); }
var sailN = 0; function sailBoat(){ return kitMesh(sailN++ % 2 ? 'boat-sail-b' : 'boat-sail-a', 0.5, null, true); }
var coracleGeo = (function(){ var g = new THREE.SphereGeometry(0.8, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.scale(1, 0.5, 1); g.translate(0, 0.25, 0); return merge([[g, MX(0, 0, 0, 0, 0, 0, 0.11), '#3c5d93'], [new THREE.TorusGeometry(0.8, 0.06, 4, 16), MX(0, 0.25 * 0.11, 0, Math.PI / 2, 0, 0, 0.11), '#24375a']]); })();

/* ---------- vegetation & small object geometries ---------- */
var canopyGeo = merge([[blobGeo(), MX(0, 0.56, 0, 0, 0, 0, 0.5, 0.42, 0.5), '#ffffff'], [new THREE.CylinderGeometry(0.045, 0.065, 0.42, 5), MX(0, 0.21, 0), '#8a6a4a']]);
var forestGeo = merge([[blobGeo(), MX(0, 0.3, 0, 0, 0, 0, 0.58, 0.52, 0.58), '#ffffff']]);
var coneTreeGeo = merge([[new THREE.ConeGeometry(0.34, 1.0, 7), MX(0, 0.62, 0), '#ffffff'], [new THREE.CylinderGeometry(0.04, 0.05, 0.2, 5), MX(0, 0.1, 0), '#7a5a40']]);
// Cây dừa: thân cong có vòng đốt và phình gốc, cổ ngọn xanh, vài quả dừa, 9–12 tàu lá đặt theo góc vàng (cong rồi rủ ngọn, mép răng cưa, mặt cắt gập chữ V, gân giữa sáng).
// Tự phát position / normal / color (tuyến tính) và `aSway`: 0 ở gốc thân → 0,35 ở ngọn thân → 1 ở đầu tàu lá (trọng số lay theo gió; palmMat = swayMat({ attr:true }) dùng nó).
// Không dùng merge() (nó phát non-indexed và không có aSway). Chỉ dùng toán thuần, chiều cao tổng ~0,64–0,70 đơn vị (như dừa cũ) nên KEEP và hàng dừa ven biển giữ nguyên.
// seed 0..2: độ nghiêng thân, số tàu, số quả, tàu vàng úa khác nhau; opt.lite: ít vòng, ít tàu (~240 tam giác thay vì ~430).
function makePalmGeo(seed, opt){
  var lite = !!(opt && opt.lite), rnd = mulberry32(101 + seed * 17), P_ = [], C_ = [], S_ = [], IX = [];
  function lin(h){ var n = parseInt(h.slice(1), 16), f = function(v){ v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]; }
  function mixc(a, b, t){ return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function vert(x, y, z, c, s){ P_.push(x, y, z); C_.push(c[0], c[1], c[2]); S_.push(s); return P_.length / 3 - 1; }
  var sd = seed % 3, H = [0.54, 0.56, 0.53][sd], lean = [0.02, 0.05, 0.08][sd], ph = seed * 2.1 + 0.7;
  /* ---- thân: R vòng × SD cạnh, tâm cong x = lean·t^1.7 + uốn nhẹ; bán kính thon, phình gốc; vòng đốt chẵn tối hơn ---- */
  var R = lite ? 6 : 8, SD = lite ? 5 : 6, ring = [], bark0 = lin('#7a6046'), bark1 = lin('#a08868'), green0 = lin('#5a9a48'), green1 = lin('#86bb5e');
  function trunkC(t){ return [lean * Math.pow(t, 1.7) + 0.012 * t * Math.sin(t * 3.4 + ph), H * t, 0.010 * t * Math.sin(t * 2.6 + ph * 1.7)]; }
  for (var k = 0; k < R; k++){ var t = k / (R - 1), c = trunkC(t), r = 0.0325 - 0.0105 * t + 0.022 * Math.exp(-t * 10), col, row = [];
    if (k >= R - 2){ r = k === R - 2 ? 0.027 : 0.017; col = mixc(green0, green1, k - (R - 2)); }
    else { r *= k % 2 ? 1.07 : 0.95; col = mixc(bark0, bark1, t); if (k && k % 2 === 0) col = [col[0] * 0.68, col[1] * 0.68, col[2] * 0.68]; }
    for (var j = 0; j < SD; j++){ var a = j / SD * Math.PI * 2 + k * 0.35; row.push(vert(c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r, col, 0.35 * t * t)); }
    ring.push(row); }
  for (var k2 = 0; k2 < R - 1; k2++) for (var j2 = 0; j2 < SD; j2++){ var a1 = ring[k2][j2], b1 = ring[k2][(j2 + 1) % SD], c1 = ring[k2 + 1][j2], d1 = ring[k2 + 1][(j2 + 1) % SD]; IX.push(a1, c1, b1, b1, c1, d1); }
  var cr = trunkC(1), apex = vert(cr[0], cr[1] + 0.014, cr[2], green1, 0.35);
  for (var j3 = 0; j3 < SD; j3++) IX.push(ring[R - 1][j3], apex, ring[R - 1][(j3 + 1) % SD]);
  /* ---- quả dừa: lưỡng chóp 6 cạnh dưới tán, xanh và nâu ---- */
  var NN = lite ? 2 : [3, 4, 3][sd], nutG = lin('#78a448'), nutB = lin('#6b4a26');
  for (var q = 0; q < NN; q++){ var qa = q / NN * Math.PI * 2 + ph, qx = cr[0] + Math.cos(qa) * 0.03, qy = cr[1] - 0.03 - (q % 2) * 0.012, qz = cr[2] + Math.sin(qa) * 0.03, qc = q % 2 ? nutB : nutG, eq = [];
    var qt = vert(qx, qy + 0.026, qz, qc, 0.35), qb = vert(qx, qy - 0.026, qz, qc, 0.35);
    for (var e = 0; e < 6; e++){ var ea = e / 6 * Math.PI * 2; eq.push(vert(qx + Math.cos(ea) * 0.021, qy, qz + Math.sin(ea) * 0.021, qc, 0.35)); }
    for (var e2 = 0; e2 < 6; e2++){ var e3 = (e2 + 1) % 6; IX.push(eq[e2], qt, eq[e3], eq[e3], qb, eq[e2]); } }
  /* ---- tàu lá: góc vàng; pitch(u) = pitch0 − droop·u^1.3; bề rộng thon; hàng lẻ hẹp 0,6× tạo răng cưa; hai mép nâng lên thành chữ V ---- */
  var NF = lite ? [9, 8, 9][sd] : [11, 10, 12][sd], SG = lite ? 5 : 7, a0 = rnd() * 6.28, GREEN = ['#3f9a45', '#4aa84a', '#37893f'].map(lin), rib = lin('#c4e68a'), dead = lin('#b5a63c');
  for (var i = 0; i < NF; i++){ var tf = i / (NF - 1), phi = a0 + i * 2.39996, jit = rnd(), pitch0 = 0.95 - 0.8 * tf + (jit - 0.5) * 0.1, droop = 0.8 + 0.9 * tf + jit * 0.2, L = 0.29 * (0.88 + 0.24 * rnd()), Wm = 0.078 * (0.9 + 0.2 * rnd());
    var base = i >= NF - (sd === 1 ? 2 : 1) ? dead : GREEN[(rnd() * 3) | 0], rx = Math.cos(phi), rz = Math.sin(phi), sx = -rz, sz = rx, px = cr[0], py = cr[1] - 0.004, pz = cr[2], rows = [];
    for (var s = 0; s <= SG; s++){ var u = s / SG, pit = pitch0 - droop * Math.pow(u, 1.3), sw = 0.35 + 0.65 * u, nx = -Math.sin(pit) * rx, ny = Math.cos(pit), nz = -Math.sin(pit) * rz;
      if (s === SG){ rows.push([vert(px, py, pz, mixc(rib, base, 0.3), 1)]); break; }
      var w = Math.max(Math.sin(Math.PI * Math.pow(u, 0.6)) * Wm, 0.005) * (s % 2 ? 0.62 : 1), fold = 0.5 * w, ce = mixc(base, [base[0] * 0.55, base[1] * 0.55, base[2] * 0.55], 1 - u), cm = mixc(ce, rib, 0.5 * (1 - 0.4 * u));
      rows.push([vert(px + sx * w + nx * fold, py + ny * fold, pz + sz * w + nz * fold, ce, sw), vert(px, py, pz, cm, sw), vert(px - sx * w + nx * fold, py + ny * fold, pz - sz * w + nz * fold, ce, sw)]);
      var pm = pitch0 - droop * Math.pow((s + 0.5) / SG, 1.3), st = L / SG; px += Math.cos(pm) * rx * st; py += Math.sin(pm) * st; pz += Math.cos(pm) * rz * st; }
    for (var s2 = 0; s2 < SG; s2++){ var A = rows[s2], B = rows[s2 + 1];
      if (B.length === 1) IX.push(A[0], B[0], A[1], A[1], B[0], A[2]);
      else IX.push(A[0], B[0], A[1], A[1], B[0], B[1], A[1], B[1], A[2], A[2], B[1], B[2]); } }
  /* ---- pháp tuyến mượt: cộng pháp tuyến mặt (theo diện tích) vào đỉnh chung ---- */
  var N_ = new Array(P_.length).fill(0);
  for (var f = 0; f < IX.length; f += 3){ var i0 = IX[f] * 3, i1 = IX[f + 1] * 3, i2 = IX[f + 2] * 3,
      e1x = P_[i1] - P_[i0], e1y = P_[i1 + 1] - P_[i0 + 1], e1z = P_[i1 + 2] - P_[i0 + 2], e2x = P_[i2] - P_[i0], e2y = P_[i2 + 1] - P_[i0 + 1], e2z = P_[i2 + 2] - P_[i0 + 2],
      fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    [i0, i1, i2].forEach(function(o){ N_[o] += fx; N_[o + 1] += fy; N_[o + 2] += fz; }); }
  for (var v = 0; v < N_.length; v += 3){ var l = Math.hypot(N_[v], N_[v + 1], N_[v + 2]) || 1; N_[v] /= l; N_[v + 1] /= l; N_[v + 2] /= l; }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P_, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N_, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C_, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(S_, 1)); g.setIndex(IX); g.computeBoundingSphere(); return g; }
var PALM_GEOS = [0, 1, 2].map(function(k){ return makePalmGeo(k, { lite:LITE }); });
var palmMat = swayMat({ attr:true, amp:0.07, flutter:1, double:true });   // vật liệu riêng (VCM dùng chung với dù, thuyền thúng); lay theo gió bằng thuộc tính đỉnh `aSway` (ngọn lá lay nhiều nhất, tàu lá run rẩy khi giật)
var umbGeo = merge([[new THREE.CylinderGeometry(0.006, 0.006, 0.13, 4), MX(0, 0.065, 0), '#dddddd'], [new THREE.ConeGeometry(0.085, 0.035, 8), MX(0, 0.14, 0), '#ffffff']]);
var tankGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.075, 10); tankGeo.translate(0, 0.04, 0);

/* ---------- textures for windows ---------- */
function winTex(cols, rows, o){ var W = cols * 32, Hh = rows * 32, c1 = document.createElement('canvas'), c2 = document.createElement('canvas'); c1.width = c2.width = W; c1.height = c2.height = Hh;
  var a = c1.getContext('2d'), b = c2.getContext('2d'); a.fillStyle = '#ffffff'; a.fillRect(0, 0, W, Hh); b.fillStyle = '#000000'; b.fillRect(0, 0, W, Hh);
  for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++){ var x = i * 32, y = j * 32;
    a.fillStyle = o.glass; a.fillRect(x + o.mx, y + o.my, 32 - 2 * o.mx, o.wh);
    if (o.balcony){ a.fillStyle = 'rgba(0,0,0,0.14)'; a.fillRect(x, y + o.my + o.wh + 2, 32, 3); }
    b.fillStyle = ih(i * 13 + cols, j * 7 + rows + o.seed) > 0.42 ? '#ffd38a' : '#060606'; b.fillRect(x + o.mx, y + o.my, 32 - 2 * o.mx, o.wh); }
  var t1 = new THREE.CanvasTexture(c1), t2 = new THREE.CanvasTexture(c2);
  [t1, t2].forEach(function(t){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
  return { map:t1, emis:t2 }; }
function boxUV(uRep, vRep, blankSides){ var g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); var uv = g.attributes.uv;
  for (var f = 0; f < 6; f++) for (var k = 0; k < 4; k++){ var i = f * 4 + k;
    if (f === 2 || f === 3 || (blankSides && (f === 0 || f === 1))) uv.setXY(i, 0.01, 0.995); else uv.setXY(i, uv.getX(i) * uRep, uv.getY(i) * vRep); }
  uv.needsUpdate = true; return g; }
// Tối dần về chân tường: phần tầng trệt (từ chân nhà lên một tầng) tối tới ~22% như bóng đổ ở chân, nhà có chiều sâu. Độ cao tính từ gốc của instance (instanceMatrix[3].y là chân nhà).
function baseShade(m, key){ var prev = m.onBeforeCompile;
  m.onBeforeCompile = function(sh, r){ if (prev) prev.call(this, sh, r);
    if (sh.vertexShader.indexOf('vBaseH') < 0){
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vBaseH;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { float by_ = 0.0; vec4 pw_ = modelMatrix * vec4(position, 1.0);
        #ifdef USE_INSTANCING
          pw_ = modelMatrix * (instanceMatrix * vec4(position, 1.0)); by_ = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).y;
        #endif
        vBaseH = (pw_.y - by_) / ${FLOOR.toFixed(4)}; }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBaseH;').replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 1.0, vBaseH));'); } };
  m.customProgramCacheKey = function(){ return key; }; return m; }
function bmat(t, peak){ var m = new THREE.MeshStandardMaterial({ color:'#ffffff', map:t.map, emissiveMap:t.emis, emissive:'#ffffff', emissiveIntensity:0, roughness:0.75 }); glowMats.push({ m:m, base:0, peak:peak }); baseShade(m, 'bmat-base'); return wetReg(m); }

/* ======================= BUILD ======================= */
/* trong ST: G, groundTex, terrain, water, MK, ring */ ST.ROADS_S = []; ST.RAIL_S = null; var KEEP = []; var LM = []; var LMI = {}; var pickGroups = []; var anim = { boats:[], movers:[], gondolas:[], birds:null, clouds:[], wheel:null, train:null, parasail:null, vehicles:null };
var lampPts; var carPts;
function step(msg){ loaderText.textContent = msg; return new Promise(function(r){ setTimeout(r, 20); }); }
function hAt(x, z){ return ST.G.hAt(x, z); }
function gy(x, z){ return Math.max(ST.G.hAt(x, z), 0); }

// lấy mẫu đều, bước ≤ 0,5 vừa khít chiều dài (giữ đủ hai đầu; đường ngắn hơn 25 m vẫn có ít nhất 2 điểm — trước đây bị bỏ, đường lớn đứt quãng)
function sampleRoad(pts, w, rail){ var Lt = 0; for (var q = 0; q < pts.length - 1; q++) Lt += Math.hypot(pts[q + 1][0] - pts[q][0], pts[q + 1][1] - pts[q][1]);
  var step = Lt > 0 ? Lt / Math.max(1, Math.ceil(Lt / 0.5)) : 0.5, s = resample(pts, step * 0.9999), last = pts[pts.length - 1], raw = [];
  if (Math.hypot(s[s.length - 1][0] - last[0], s[s.length - 1][1] - last[1]) > step * 0.5) s.push([last[0], last[1]]); else s[s.length - 1] = [last[0], last[1]];
  for (var i = 0; i < s.length; i++){ var x = s[i][0], z = s[i][1]; if (!inBoard(x, z, 1.2)){ raw.push(null); continue; } raw.push({ x:x, z:z, h:H(x, z) }); }
  var best = [], cur = []; raw.forEach(function(p){ if (p) cur.push(p); else { if (cur.length > best.length) best = cur; cur = []; } }); if (cur.length > best.length) best = cur;
  var out = best; out.forEach(function(o, i){ o.br = o.h < 0.16; });
  var br2 = out.map(function(o, i){ return o.br || (out[i - 1] && out[i - 1].br) || (out[i + 1] && out[i + 1].br) || (out[i - 2] && out[i - 2].br) || (out[i + 2] && out[i + 2].br); });
  out.forEach(function(o, i){ o.br = br2[i]; o.y0 = o.br ? 0.66 : ST.G.hAt(o.x, o.z) + 0.015; });
  out.forEach(function(o, i){ var sum = 0, n = 0; for (var k = -2; k <= 2; k++){ var q = out[i + k]; if (q){ sum += q.y0; n++; } } o.y = o.br ? Math.max(0.66, sum / n) : sum / n; });
  for (i = 0; i < out.length; i++){ var a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; out[i].fx = dx / l; out[i].fz = dz / l; }
  return { pts:out, w:w, rail:!!rail, step:step, L:(out.length - 1) * step }; }
// Đường lớn từ OSM (tới cấp tertiary) thành ROADS_S: xe chạy, đèn, cây ven đường, mặt cầu. Chỉ đường có thẻ bridge mới
// được bắc cầu qua nước; đường khác đi qua chỗ nước (do bờ, sông ước lượng lệch) thì cắt bỏ đoạn đó.
// Đường nhỏ (OSM_MINOR) chỉ vẽ lên mặt đất, chừa chỗ cho nhà và làm vỉa hè cho người đi bộ.
var OSM_MINOR = [];
function osmMajorRoads(){ var out = [], bEnds = {}, ek = function(q){ return Math.round(q[0] * 20) + ',' + Math.round(q[1] * 20); };
  OSM.roads.forEach(function(Rd){ if (Rd.bridge && Rd.c <= 4) [Rd.pts[0], Rd.pts[Rd.pts.length - 1]].forEach(function(q){ bEnds[ek(q)] = (bEnds[ek(q)] || 0) + 1; }); });   // đầu mút chung giữa các đoạn cầu
  OSM.roads.forEach(function(Rd){ if (Rd.round) return;   // bùng binh vẽ riêng thành vòng tròn (ROUNDS)
    if (Rd.c > 4){ OSM_MINOR.push(Rd); return; }
    var S = sampleRoad(Rd.pts, Rd.w); if (S.pts.length < 2) return; S.name = Rd.name; S.cls = Rd.c;
    if (Rd.bridge){   // cầu OSM: mặt cầu suốt cả đường, hai đầu dốc từ mặt đất lên (không cụt giữa không trung)
      var Q = S.pts, n = Q.length, ramp = Math.min(2.4, (n - 1) * S.step * 0.34), gA = Math.max(ST.G.hAt(Q[0].x, Q[0].z), 0) + 0.015, gB = Math.max(ST.G.hAt(Q[n - 1].x, Q[n - 1].z), 0) + 0.015;
      // đầu cầu trên mặt nước mà nối tiếp đoạn cầu khác thì giữ độ cao; đầu trên đất luôn dốc xuống (kể cả chỗ hai đường một chiều nhập lại)
      if (bEnds[ek(Rd.pts[0])] > 1 && ST.G.hAt(Q[0].x, Q[0].z) < 0.05) gA = Math.max(0.66, gA); if (bEnds[ek(Rd.pts[Rd.pts.length - 1])] > 1 && ST.G.hAt(Q[n - 1].x, Q[n - 1].z) < 0.05) gB = Math.max(0.66, gB);
      Q.forEach(function(p, i){ var sA = i * S.step, sB = (n - 1 - i) * S.step, top = Math.max(0.66, gA, gB), g = Math.max(ST.G.hAt(p.x, p.z), 0) + 0.015;
        var y = sA < sB ? lerp(gA, top, smooth(0, ramp, sA)) : lerp(gB, top, smooth(0, ramp, sB)); p.br = true; p.y = Math.max(y, g); });
      out.push(S); return; }
    // đường thường (không phải cầu OSM) đi qua chỗ thấp sát nước (cù lao, bờ sông, bờ đê): giữ thành đường đắp có mặt đường cho xe chạy,
    // không cắt bỏ (trước đây cắt thì giữa cầu Xóm Bóng trên cù lao mất mặt đường, xe bị chặn "dưới nước")
    S.pts.forEach(function(p){ if (p.br){ p.br = false; p.cw = true; p.y = Math.max(ST.G.hAt(p.x, p.z), 0.04) + 0.03; } });
    out.push(S); });
  return out; }
function roadPoint(R, s, o){ var f = s / (R.step || 0.5), i = f | 0, n = R.pts.length; if (i > n - 2) i = n - 2; if (i < 0) i = 0; var t = clamp(f - i, 0, 1), a = R.pts[i], b = R.pts[i + 1];
  o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; o.z = a.z + (b.z - a.z) * t; o.fx = a.fx + (b.fx - a.fx) * t; o.fz = a.fz + (b.fz - a.fz) * t; var l = Math.hypot(o.fx, o.fz) || 1; o.fx /= l; o.fz /= l; return o; }

var JETTIES = [], LMP = {}, RESORT_HOTELS = [[12.2200,109.2428,1.2,0.6,8,0.5],[12.2172,109.2445,1.0,0.55,6,-0.4],[12.2228,109.2452,0.9,0.5,10,0.2]];
(function(){ LM_DEF.forEach(function(d){ var p = d.ll ? P(d.ll[0], d.ll[1]) : [0, 0]; LMP[d.id] = p; });
  for (var k in LM_EXTRA) LMP[k] = P(LM_EXTRA[k][0], LM_EXTRA[k][1]);
  KEEP = [['ponagar', 2.8], ['cho-dam', 1.6], ['nha-tho', 1.0], ['ga', 1.6], ['yersin', 1.2], ['tram-huong', 2.2], ['vien-hdh', 1.8], ['bao-dai', 1.6], ['cang', 1.6], ['hon-chong', 1.4]].map(function(k){ var p = LMP[k[0]]; return [p[0], p[1], k[1]]; });
  RESORT_HOTELS.forEach(function(h){ var p = P(h[0], h[1]); KEEP.push([p[0], p[1], 1.0]); });
  KEEP.push([LMP.cableA[0], LMP.cableA[1], 1.3], [LMP.cableB[0], LMP.cableB[1], 1.3], [LMP.wheel[0], LMP.wheel[1], 2.4], [LMP.pagoda[0], LMP.pagoda[1], 1.6], [LMP.buddha[0], LMP.buddha[1], 1.8]);
})();

function drawOverlays(ctx, isMask){
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  var zA = P(12.2622, 0)[1], zB = P(12.2102, 0)[1], prom = [], z;
  for (z = zA; z <= zB; z += 0.8) prom.push([coastX(z) - 1.65, z]);
  var zT = LMP['tram-huong'][1], plaza = [[coastX(zT - 1.7) - 2.25, zT - 1.7], [coastX(zT - 1.7) - 0.8, zT - 1.7], [coastX(zT + 1.7) - 0.8, zT + 1.7], [coastX(zT + 1.7) - 2.25, zT + 1.7]];
  if (isMask){ ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    ST.ROADS_S.concat([ST.RAIL_S]).forEach(function(R){ ctx.lineWidth = R.rail ? 0.8 : R.w + 0.34; landRuns(R.pts).forEach(function(run){ strokeLine(ctx, run); });
      if (!R.rail && R.pts.some(function(p){ return p.br; })) strokeLine(ctx, R.pts.map(function(p){ return [p.x, p.z]; })); });   // cầu: chừa cả dốc hai đầu
    OSM_MINOR.forEach(function(R){ ctx.lineWidth = R.w + 0.1; strokeLine(ctx, R.pts); });
    if (OSM) OSM.rails.slice(1).forEach(function(r){ ctx.lineWidth = 0.4; strokeLine(ctx, r); });
    ROUNDS.forEach(function(o){ ctx.lineWidth = o.w + 0.2; ctx.lineJoin = 'round'; strokeLine(ctx, o.ring.concat([o.ring[0]])); fillPoly(ctx, o.ring); });
    fillPoly(ctx, plaza); KEEP.forEach(function(k){ ctx.beginPath(); ctx.arc(k[0], k[1], k[2], 0, Math.PI * 2); ctx.fill(); }); return; }
  ctx.strokeStyle = '#9fc46d'; ctx.lineWidth = 1.2; strokeLine(ctx, prom);
  ctx.strokeStyle = '#e9e1cc'; ctx.lineWidth = 0.3; strokeLine(ctx, prom);
  ctx.fillStyle = '#e2dac8'; fillPoly(ctx, plaza);
  ctx.strokeStyle = '#d5ccb7'; ctx.lineWidth = 0.05; for (var q = -1.5; q <= 1.5; q += 0.5){ strokeLine(ctx, [[coastX(zT + q) - 2.2, zT + q], [coastX(zT + q) - 0.85, zT + q]]); }
  // Đường vẽ theo LỚP cho mọi đường (không vẽ trọn từng đường một, vì vỉa hè đường sau sẽ đè lòng đường và vạch đường trước ở giao lộ):
  // vỉa hè → bó vỉa → lòng đường → vạch biên, vạch giữa → xoá vạch ở giao lộ bằng đĩa nhựa đường
  var MAJ = []; ST.ROADS_S.forEach(function(R){ landRuns(R.pts).forEach(function(run){ MAJ.push({ R:R, pts:run }); }); });
  var MIN = OSM_MINOR.map(function(R){ return { R:R, pts:R.pts }; }), ALL = MIN.concat(MAJ), ASP = '#86898c';
  function pass(list, c, wf, dash){ ctx.strokeStyle = c; if (dash) ctx.setLineDash(dash); list.forEach(function(u){ var w = wf(u.R); if (w > 0){ ctx.lineWidth = w; strokeLine(ctx, u.pts); } }); ctx.setLineDash([]); }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  pass(ALL, '#dcd5c6', function(R){ return R.w + (R.c > 4 ? 0.1 : 0.26); });           // vỉa hè
  pass(MAJ, '#a59e90', function(R){ return R.w + 0.07; });                             // bó vỉa đường lớn
  pass(ALL, ASP, function(R){ return R.w; });                                          // lòng đường (đường nhỏ cùng màu đường lớn)
  ctx.lineCap = 'butt';
  pass(MAJ, 'rgba(255,255,255,0.75)', function(R){ return R.w - 0.07; }); pass(MAJ, ASP, function(R){ return R.w - 0.11; });   // hai vạch biên liền
  pass(MAJ.filter(function(u){ return !u.R.oneway; }), 'rgba(255,255,255,0.85)', function(R){ return R.w > 0.5 ? 0.04 : 0; });  // dải giữa đường rộng hai chiều
  pass(MAJ.filter(function(u){ return !u.R.oneway; }), 'rgba(255,255,255,0.85)', function(R){ return R.w > 0.5 ? 0 : 0.03; }, [0.26, 0.3]);   // vạch giữa nét đứt
  pass(MIN.filter(function(u){ return u.R.c <= 6 && !u.R.oneway && u.R.w > 0.15; }), 'rgba(255,255,255,0.6)', function(){ return 0.016; }, [0.18, 0.22]);
  // giao lộ: điểm đầu mút / điểm chung của ≥ 2 đường -> đĩa nhựa đường bán kính = nửa bề rộng đường lớn nhất tại đó (xoá vạch cắt ngang)
  // (dùng điểm gốc OSM: đường lớn đã lấy mẫu lại nên điểm không trùng điểm nối của đường nhỏ)
  var J = new Map(); if (OSM) OSM.roads.forEach(function(R){ if (R.bridge || R.round || R.c > 7) return; R.pts.forEach(function(p){ var k = Math.round(p[0] * 20) + ',' + Math.round(p[1] * 20), e = J.get(k);
    if (!e){ e = { x:p[0], z:p[1], n:0, w:0, ids:[] }; J.set(k, e); } if (e.ids.indexOf(R) < 0){ e.ids.push(R); e.n++; e.w = Math.max(e.w, R.w); } }); });
  J.forEach(function(e){ if (e.n === 2 && e.ids[0].name && e.ids[0].name === e.ids[1].name) e.n = 1; });   // hai khúc của cùng một đường nối nhau: không phải giao lộ
  ctx.fillStyle = ASP; J.forEach(function(e){ if (e.n < 2) return; ctx.beginPath(); ctx.arc(e.x, e.z, e.w / 2 - 0.005, 0, Math.PI * 2); ctx.fill(); });
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  // bùng binh: vỉa hè, lòng đường vòng tròn đều, vạch biên, vạch chia làn nét đứt, đảo giữa có bó vỉa và cỏ (vẽ đè lên đầu các đường dẫn vào)
  ROUNDS.forEach(function(o){ var R = o.ring.concat([o.ring[0]]), I = o.inner, ir = o.r - o.w / 2; ctx.lineJoin = 'round';
    function band(w, c, dash){ ctx.strokeStyle = c; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); strokeLine(ctx, R); ctx.setLineDash([]); }
    band(o.w + 0.2, '#dcd5c6'); band(o.w + 0.05, '#a59e90'); band(o.w, '#86898c'); if (o.w > 0.18) band(0.02, 'rgba(255,255,255,0.75)', [0.15, 0.18]);
    if (ir > 0.04){ ctx.fillStyle = '#a59e90'; fillPoly(ctx, I); ctx.save(); ctx.translate(o.x, o.z); ctx.scale(0.9, 0.9); ctx.translate(-o.x, -o.z); ctx.fillStyle = '#8cbf5f'; fillPoly(ctx, I);
      if (ir > 0.2){ ctx.scale(0.55, 0.55); ctx.translate(o.x / 0.55 - o.x, o.z / 0.55 - o.z); ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 0.08; ctx.setLineDash([0.05, 0.05]); strokeLine(ctx, I.concat([I[0]])); ctx.setLineDash([]); }
      ctx.restore(); } });   // vòng xoay theo đúng hình OSM; đảo giữa: bó vỉa, cỏ, viền hoa
  if (OSM) OSM.rails.slice(1).forEach(function(r){ ctx.strokeStyle = '#a89c88'; ctx.lineWidth = 0.26; strokeLine(ctx, r); ctx.setLineDash([0.05, 0.07]); ctx.strokeStyle = '#6c5a48'; ctx.lineWidth = 0.18; strokeLine(ctx, r); ctx.setLineDash([]); });   // ray phụ: bãi ga, đường vòng
  landRuns(ST.RAIL_S.pts).forEach(function(run){ ctx.strokeStyle = '#a89c88'; ctx.lineWidth = 0.46; strokeLine(ctx, run); ctx.setLineDash([0.05, 0.07]); ctx.strokeStyle = '#6c5a48'; ctx.lineWidth = 0.3; strokeLine(ctx, run); ctx.setLineDash([]); ctx.strokeStyle = '#4f4b47'; ctx.lineWidth = 0.06; strokeLine(ctx, run); });
  ctx.fillStyle = '#4fc3dd'; [[12.2196,109.2399,0.9,0.45],[12.2176,109.2424,0.6,0.38],[12.2206,109.2448,0.7,0.34],[12.1792,109.2318,0.5,0.3]].forEach(function(p){ var c = P(p[0], p[1]); ctx.fillRect(c[0] - p[2] / 2, c[1] - p[3] / 2, p[2], p[3]); });
}

function buildTerrain(){
  var GX = ST.G.GX, GZ = ST.G.GZ, N = GX * GZ, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2);
  for (var j = 0; j < GZ; j++) for (var i = 0; i < GX; i++){ var k = j * GX + i, x = BX0 + i * ST.G.cx, z = BZ0 + j * ST.G.cz, h = ST.G.h[k], c = boardClamp(x, z);
    if (c[0] !== x || c[1] !== z){ x = c[0]; z = c[1]; h = ST.G.hAt(x, z); }
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = (x - BX0) / BW; uv[k * 2 + 1] = (z - BZ0) / BD; }
  var idx = new Uint32Array((GX - 1) * (GZ - 1) * 6), q = 0;
  for (j = 0; j < GZ - 1; j++) for (i = 0; i < GX - 1; i++){ var a = j * GX + i, b = a + 1, c2 = a + GX, d = c2 + 1; idx[q++] = a; idx[q++] = c2; idx[q++] = b; idx[q++] = b; idx[q++] = c2; idx[q++] = d; }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  var tm = new THREE.MeshStandardMaterial({ map:ST.groundTex, roughness:0.95, metalness:0 });
  // Ướt (ST.wetU, 0..1): mặt đất tối đi ~28%, vũng nước ở chỗ phẳng và thấp (nhiễu giá trị theo toạ độ thế giới): độ nhám thấp + phản chiếu trời giả kiểu Fresnel (ST.wetSky)
  tm.onBeforeCompile = function(sh){ sh.uniforms.uDetail = DU.tex; sh.uniforms.uDBox = DU.box; sh.uniforms.uDOn = DU.on; sh.uniforms.uWet = ST.wetU; sh.uniforms.uWetSky = ST.wetSky;
    sh.vertexShader = 'varying vec2 vWXZ;\nvarying float vWY;\nvarying float vWNy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz; vWY = transformed.y; vWNy = (modelMatrix * vec4(normal, 0.0)).y;');
    sh.fragmentShader = ['uniform sampler2D uDetail;\nuniform vec4 uDBox;\nuniform float uDOn;\nuniform float uWet;\nuniform vec3 uWetSky;\nvarying vec2 vWXZ;\nvarying float vWY;\nvarying float vWNy;',
      'float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float wNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y); }'].join('\n') + '\n' + sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * (1.0 - 0.35 * uWet), 0.06, puddle_);')
      .replace('#include <emissivemap_fragment>', ['#include <emissivemap_fragment>',
      '{ float fr_ = 0.16 + 0.84 * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.0); totalEmissiveRadiance += uWetSky * fr_ * puddle_ * 0.8; }'].join('\n'))
      .replace('#include <map_fragment>', [
      'float puddle_ = 0.0;',
      '#ifdef USE_MAP',
      '  vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
      '  vec2 dq = (vWXZ - uDBox.xy) / uDBox.zw;',
      '  if (uDOn > 0.5 && dq.x > 0.0 && dq.x < 1.0 && dq.y > 0.0 && dq.y < 1.0){',
      '    float de = min(min(dq.x, 1.0 - dq.x), min(dq.y, 1.0 - dq.y));',
      '    sampledDiffuseColor = mix(sampledDiffuseColor, texture2D(uDetail, dq), smoothstep(0.0, 0.07, de));',
      '  }',
      '  diffuseColor *= sampledDiffuseColor;',
      '#endif',
      'if (uWet > 0.001){',
      '  float pn_ = wNoise(vWXZ * 14.0) * 0.55 + wNoise(vWXZ * 37.0 + 3.1) * 0.45;',   // vũng ~3–7 m
      '  puddle_ = smoothstep(0.6 - 0.12 * uWet, 0.78 - 0.06 * uWet, pn_) * smoothstep(0.25, 0.65, uWet) * smoothstep(0.86, 0.97, vWNy) * (1.0 - smoothstep(0.7, 1.5, vWY));',   // pháp tuyến đỉnh nội suy nên ngưỡng dốc phải mềm (hẹp quá hiện ra hình tam giác ô lưới)
      '  diffuseColor.rgb *= 1.0 - 0.26 * uWet - 0.14 * puddle_;',
      '}'].join('\n')); };
  tm.customProgramCacheKey = function(){ return 'terrain-wet'; };
  var m = new THREE.Mesh(g, tm); m.receiveShadow = true; m.castShadow = true; scene.add(m); return m; }

/* ---------- high-resolution ground patch that follows the camera / player ---------- */
var DU = { tex:{ value:null }, box:{ value:new THREE.Vector4(0, 0, 1, 1) }, on:{ value:0 } };
var DP = { size:LITE ? 26 : 34, base:LITE ? 26 : 34, res:LITE ? 768 : 1024, job:null, valid:false, cx:1e9, cz:1e9, textures:[], cur:0 };
function initDetail(){
  for (var i = 0; i < 2; i++){ var c = document.createElement('canvas'); c.width = c.height = DP.res; var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); DP.textures.push({ c:c, t:t }); }
  DU.tex.value = DP.textures[0].t; }
// cỡ mảng mặt đất nét cao theo khoảng cách camera (đơn vị): sát đất 6 (0,3 m/px), gần 14, xa như cũ; lên bậc xa chỉ khi vượt ngưỡng ×1,25 để không chớp
function detailSize(dist){ var cur = DP.size, s = dist < 1.4 ? 6 : (dist < 5 ? 14 : DP.base);
  if (s > cur){ if (cur === 6 && dist < 1.75) return 6; if (cur === 14 && dist < 6.25) return 14; } return s; }
function updateDetail(fx, fz, want, dist){
  if (!want){ DU.on.value = 0; return; }
  if (DP.valid) DU.on.value = 1;
  if (!DP.job){ var ws = detailSize(dist), far = ws !== DP.size || Math.max(Math.abs(fx - DP.cx), Math.abs(fz - DP.cz)) > DP.size * 0.2;
    if (!DP.valid || far){ var cx = Math.round(fx), cz = Math.round(fz), slot = DP.textures[1 - DP.cur], sz = ws;
      DP.job = { cx:cx, cz:cz, size:sz, x0:cx - sz / 2, z0:cz - sz / 2, row:0, slot:slot, ctx:slot.c.getContext('2d') };
      DP.job.img = DP.job.ctx.createImageData(DP.res, DP.res); } }
  var J = DP.job; if (!J) return;
  var rows = DP.valid ? (LITE ? 48 : 96) : DP.res, r1 = Math.min(DP.res, J.row + rows);
  paintGround(J.img.data, DP.res, DP.res, ST.G, J.x0, J.z0, J.size, J.size, J.row, r1); J.row = r1;
  if (J.row >= DP.res){ var ctx = J.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(J.img, 0, 0); worldCtx(ctx, DP.res, DP.res, J.x0, J.z0, J.size, J.size); drawOverlays(ctx, false);
    J.slot.t.needsUpdate = true; DU.tex.value = J.slot.t; DU.box.value.set(J.x0, J.z0, J.size, J.size); DP.size = J.size; DP.cur = DP.textures.indexOf(J.slot); DP.cx = J.cx; DP.cz = J.cz; DP.valid = true; DU.on.value = 1; DP.job = null; } }

function perimeter(stepL){ var pts = [], C = [[BX1 - BR, BZ0 + BR, -Math.PI / 2], [BX1 - BR, BZ1 - BR, 0], [BX0 + BR, BZ1 - BR, Math.PI / 2], [BX0 + BR, BZ0 + BR, Math.PI]];
  var L = [[BX0 + BR, BZ0, BX1 - BR, BZ0], [BX1, BZ0 + BR, BX1, BZ1 - BR], [BX1 - BR, BZ1, BX0 + BR, BZ1], [BX0, BZ1 - BR, BX0, BZ0 + BR]];
  for (var s = 0; s < 4; s++){ var l = L[s], n = Math.ceil(Math.hypot(l[2] - l[0], l[3] - l[1]) / stepL); for (var k = 0; k < n; k++) pts.push([l[0] + (l[2] - l[0]) * k / n, l[1] + (l[3] - l[1]) * k / n]);
    var c = C[s]; for (k = 0; k < 10; k++){ var a = c[2] + k / 10 * Math.PI / 2; pts.push([c[0] + Math.cos(a) * BR, c[1] + Math.sin(a) * BR]); } }
  return pts; }

function buildSkirt(){
  var per = perimeter(1.2); per.push(per[0]);
  var pos = [], col = [], soil = [new THREE.Color('#9c6b43'), new THREE.Color('#7d5434'), new THREE.Color('#4b3a30')], seaC = [new THREE.Color('#47bfd0'), new THREE.Color('#2a8fb0'), new THREE.Color('#bfa77e'), new THREE.Color('#4b3a30')];
  var cols = [], ys = [];
  per.forEach(function(p){ var h = ST.G.hAt(p[0], p[1]);
    if (h > 0.02){ ys.push([h, h - 0.5, -3, -10]); var top = new THREE.Color().setRGB(0.55, 0.62, 0.38); cols.push([top, soil[0], soil[1], soil[2]]); }
    else { ys.push([0, Math.max(h, -6), Math.max(h, -6) - 0.4, -10]); cols.push(seaC); } });
  function v(i, r){ pos.push(per[i][0], ys[i][r], per[i][1]); var c = cols[i][r]; col.push(c.r, c.g, c.b); }
  for (var i = 0; i < per.length - 1; i++) for (var r = 0; r < 3; r++){ v(i, r); v(i + 1, r); v(i, r + 1); v(i + 1, r); v(i + 1, r + 1); v(i, r + 1); }
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.95, side:THREE.DoubleSide })));
  var cv = document.createElement('canvas'); cv.width = cv.height = 128; var cx = cv.getContext('2d'), gr = cx.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(10,40,70,.32)'); gr.addColorStop(0.7, 'rgba(10,40,70,.1)'); gr.addColorStop(1, 'rgba(10,40,70,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  var sh = new THREE.Mesh(new THREE.PlaneGeometry(BW * 1.8, BD * 1.8), new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(cv), transparent:true, depthWrite:false, fog:false }));
  sh.rotation.x = -Math.PI / 2; sh.position.set((BX0 + BX1) / 2, -40, (BZ0 + BZ1) / 2); scene.add(sh); }

function place(g, id, x, z, y, rot, s){ g.position.set(x, y == null ? gy(x, z) : y, z); if (rot) g.rotation.y = rot; if (s) g.scale.setScalar(s);
  if (id) g.userData.lmId = id; g.traverse(function(o){ if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } }); scene.add(g); if (id) pickGroups.push(g); return g; }
// địa danh theo kích thước thật: bề ngang khớp chân đế OSM, chiều cao nhân 1,6 như nhà phố (VB so với 1/50)
function realY(g){ g.scale.y *= VB * 50; return g; }
function topOf(g){ g.updateMatrixWorld(true); return new THREE.Box3().setFromObject(g).max.y; }

function buildLandmarks(){
  var p, g;
  p = LMP.ponagar; g = place(buildPonagar(), 'ponagar', p[0], p[1], null, 0, 0.22); LMP.ponagarTop = topOf(g);
  p = LMP['hon-chong']; g = place(buildHonChong(), 'hon-chong', p[0], p[1], Math.max(ST.G.hAt(p[0], p[1]) - 0.2, -0.2), 0.4, 0.24);   // bãi đá OSM ~115 × 60 m LMP.honchongTop = topOf(g);
  p = LMP['cho-dam']; g = realY(place(buildChoDam(), 'cho-dam', p[0], p[1], null, 0, 0.235));   // OSM ~125 × 116 m LMP.chodamTop = topOf(g);
  p = LMP.buddha; g = realY(place(buildBuddha(), 'long-son', p[0], p[1], null, 0, 0.09));   // tượng 24 m trên bệ hoa sen, bệ ~35 m LMP.buddhaTop = topOf(g);
  p = LMP.pagoda; realY(place(buildPagoda(), 'long-son', p[0], p[1], null, 1.17, 0.075));   // chính điện OSM 40 × 30 m, trục 67°
  p = LMP['nha-tho']; g = realY(place(buildCathedral(), 'nha-tho', p[0], p[1], null, 1.78, 0.073)); LMP.nhathoTop = topOf(g);   // chân đế OSM 41 × 20 m, trục 102° từ hướng đông; mặt tiền + cửa chính (entrance=main) quay về bắc–tây bắc
  p = LMP['tram-huong']; g = realY(place(buildTramHuong(), 'tram-huong', p[0], p[1], null, 0, 0.078));   // bệ OSM 25 × 25 m LMP.tramTop = topOf(g);
  p = LMP['vien-hdh']; g = place(buildInstitute(), 'vien-hdh', p[0], p[1], null, 0.6, 0.28); LMP.vienTop = topOf(g);
  p = LMP.yersin; g = place(buildColonial(3.2, 1.8, 2, '#f1c75a', '#c6503a'), 'yersin', p[0], p[1], null, 0, 0.3); LMP.yersinTop = topOf(g);
  p = LMP.ga; var ri = 0, rb = 1e9; for (var q = 0; q < RAIL.length - 1; q++){ var dq = segD2(p[0], p[1], RAIL[q][0], RAIL[q][1], RAIL[q + 1][0], RAIL[q + 1][1]); if (dq < rb){ rb = dq; ri = q; } }   // ga song song đoạn ray gần nhất
  var ra = Math.atan2(RAIL[ri + 1][0] - RAIL[ri][0], RAIL[ri + 1][1] - RAIL[ri][1]); g = realY(place(buildStation(), 'ga', p[0], p[1], null, ra, 0.196));   // nhà ga OSM 110 × 25 m dọc đường ray LMP.gaTop = topOf(g);
  p = LMP['bao-dai']; var bd = new THREE.Group();
  [[0, 0, 3.2, 2.2, 2], [2.8, 1.6, 2.4, 1.8, 1], [-2.6, 1.8, 2.4, 1.8, 1], [0.6, -2.6, 2.2, 1.6, 1]].forEach(function(v, i){ var c = buildColonial(v[2], v[3], v[4], i ? '#f3d27e' : '#f0c868', '#b84a34'); var BS = 0.17, BR = 0.63, wx = p[0] + (v[0] * Math.cos(BR) + v[1] * Math.sin(BR)) * BS, wz = p[1] + (-v[0] * Math.sin(BR) + v[1] * Math.cos(BR)) * BS;   // cùng tỷ lệ, góc quay với place() bên dưới
    c.position.set(v[0], (gy(wx, wz) - gy(p[0], p[1])) / (BS * VB * 50), v[1]); c.rotation.y = i * 0.4; bd.add(c); });
  g = realY(place(bd, 'bao-dai', p[0], p[1], null, 0.63, 0.17));   // biệt thự chính OSM 25 × 13 m, trục 36° LMP.baodaiTop = topOf(g);
  p = LMP['hai-dang']; g = place(buildLighthouse(), 'hai-dang', p[0], p[1], null, 1.745, 1);   // nền theo chân đế OSM, trục 100° từ hướng đông LMP.haidangTop = topOf(g);
  var hd = ISLANDS.filter(function(I){ return I.id === 'hon-do'; })[0], hp = LMP['hon-do'];
  g = place(buildTemple(), 'hon-do', hp[0], hp[1], ST.G.hAt(hp[0], hp[1]) - 0.05, 0.5, 0.32); LMP.hondoTop = topOf(g);
  /* port: jetties + cruise ship */
  [[12.2062,109.2176,12.2082,109.2205,0.7],[12.2048,109.2168,12.2036,109.2196,0.5],[12.2188,109.2392,12.2168,109.2372,0.45],[12.1940,109.2207,12.1946,109.2190,0.35],[12.1798,109.2318,12.1810,109.2306,0.3]].forEach(function(j){
    var a = P(j[0], j[1]), b = P(j[2], j[3]), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), m = box(j[4], 0.6, L, '#cfc8b8');
    m.position.set((a[0] + b[0]) / 2, 0.32, (a[1] + b[1]) / 2); m.rotation.y = Math.atan2(dx, dz); scene.add(m); JETTIES.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, j[4] / 2, L / 2, Math.atan2(dx, dz)]); });
  var ja = P(12.2062, 109.2176), jb = P(12.2082, 109.2205), jdx = jb[0] - ja[0], jdz = jb[1] - ja[1], jl = Math.hypot(jdx, jdz);
  var cs = buildCruiseShip(); place(cs, 'cang', (ja[0] + jb[0]) / 2 + (-jdz / jl) * -0.95, (ja[1] + jb[1]) / 2 + (jdx / jl) * -0.95, -0.05, Math.atan2(jdx, jdz), 1); LMP.cangTop = 2.2;
  var cg = buildCargoShip(); var cgp = P(12.2420, 109.2470); place(cg, null, cgp[0], cgp[1], 0, 0.9, 1);
}

function buildCable(){
  var A = LMP.cableA, B = LMP.cableB, ya = gy(A[0], A[1]), yb = gy(B[0], B[1]);
  place(buildCableStation(), 'cap-treo', A[0], A[1], ya, Math.atan2(B[0] - A[0], B[1] - A[1]) + Math.PI / 2, 1);
  place(buildCableStation(), 'cap-treo', B[0], B[1], yb, Math.atan2(B[0] - A[0], B[1] - A[1]) + Math.PI / 2, 1);
  var dx = B[0] - A[0], dz = B[1] - A[1], rot = Math.atan2(dx, dz), px = -dz, pz = dx, pl = Math.hypot(px, pz); px /= pl; pz /= pl;
  var sup = [new THREE.Vector3(A[0], ya + 1.0, A[1])], NT = 9;
  for (var i = 1; i <= NT; i++){ var f = i / (NT + 1), x = A[0] + dx * f, z = A[1] + dz * f, h = 2.4 + 2.6 * Math.sin(Math.PI * f), base = Math.max(ST.G.hAt(x, z), -0.5);
    var tw = buildCablePylon(h); place(tw, 'cap-treo', x, z, base, rot, 1); sup.push(new THREE.Vector3(x, base + h + 0.05, z)); }
  sup.push(new THREE.Vector3(B[0], yb + 1.0, B[1]));
  LMP.cableMid = sup[5].clone().setY(sup[5].y + 0.8); LMP.cableFocus = new THREE.Vector3(A[0] + dx * 0.5, 2, A[1] + dz * 0.5);
  var cm = mat('#3a3f47'), GC = ['#f2592c','#ffd23f','#3fb6c9','#ffffff','#ff8fab','#7bd389','#4d7cf0'];
  [-1, 1].forEach(function(k, ci){ var pts = [];
    for (var s = 0; s < sup.length - 1; s++){ var p0 = sup[s].clone(), p1 = sup[s + 1].clone(); p0.x += px * 0.62 * k; p0.z += pz * 0.62 * k; p1.x += px * 0.62 * k; p1.z += pz * 0.62 * k;
      var sag = p0.distanceTo(p1) * 0.035; for (var j = (s === 0 ? 0 : 1); j <= 12; j++){ var t = j / 12, q = new THREE.Vector3().lerpVectors(p0, p1, t); q.y -= sag * 4 * t * (1 - t); pts.push(q); } }
    var curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 300, 0.025, 4, false), cm));
    for (var n = 0; n < 12; n++){ var g = new THREE.Group(); g.add(at(box(0.025, 0.3, 0.025, '#3a3f47'), 0, -0.15, 0)); g.add(at(box(0.28, 0.26, 0.34, GC[(n + ci * 3) % GC.length]), 0, -0.42, 0)); g.add(at(box(0.29, 0.09, 0.35, '#bfe6f2'), 0, -0.36, 0));
      g.traverse(function(o){ if (o.isMesh) o.castShadow = true; }); g.userData = { curve:curve, off:n / 12, dir:ci === 0 ? 1 : -1 }; scene.add(g); anim.gondolas.push(g); } });
}

function buildResort(){
  var w = LMP.wheel, base = gy(w[0], w[1]), Rw = 1.7, hub = Rw + 0.45, g = new THREE.Group(), leg = '#e7e2d8';
  [-0.3, 0.3].forEach(function(z){ g.add(beam(new THREE.Vector3(-0.9, 0, z), new THREE.Vector3(0, hub, z), 0.05, leg)); g.add(beam(new THREE.Vector3(0.9, 0, z), new THREE.Vector3(0, hub, z), 0.05, leg)); });
  var wh = new THREE.Group(); wh.position.set(0, hub, 0);
  var rim = glowMat('#ffffff', '#ffd27a', 0, 1.3);
  [-0.15, 0.15].forEach(function(z){ var t = new THREE.Mesh(new THREE.TorusGeometry(Rw, 0.04, 6, 48), rim); t.position.z = z; wh.add(t); });
  for (var i = 0; i < 16; i++){ var sp = box(0.025, Rw, 0.025, '#ffffff'), a = i / 16 * Math.PI * 2; sp.position.set(Math.cos(a) * Rw / 2, Math.sin(a) * Rw / 2, 0); sp.rotation.z = a - Math.PI / 2; wh.add(sp); }
  var cabins = [], CC = ['#f2592c','#ffd23f','#3fb6c9','#ff8fab','#7bd389','#4d7cf0'];
  for (var j = 0; j < 16; j++){ var a2 = j / 16 * Math.PI * 2, c = box(0.22, 0.22, 0.22, CC[j % CC.length]); c.position.set(Math.cos(a2) * Rw, Math.sin(a2) * Rw - 0.12, 0); wh.add(c); cabins.push(c); }
  g.add(wh); place(g, 'hon-tre', w[0], w[1], base, -0.9, 1); anim.wheel = { w:wh, cabins:cabins };
  var fun = new THREE.Group(), FC = ['#ff6b6b','#ffd166','#06d6a0','#4cc9f0','#f72585'];
  for (var k = 0; k < 5; k++){ var d = mesh(new THREE.SphereGeometry(0.35 + k * 0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), FC[k]); d.position.set(Math.cos(k * 1.3) * 1.6, 0, Math.sin(k * 1.3) * 1.1); fun.add(d); }
  var loop = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 40), mat('#e63946')); loop.position.set(0.4, 0.75, -1.6); fun.add(loop);
  var fp = P(12.2228, 109.2430); place(fun, null, fp[0], fp[1], gy(fp[0], fp[1]), 0.3, 1);
}

// dải liền theo tim đường cho mặt cầu và lan can (thay cho các hộp rời bị răng cưa ở khúc cong)
function ribbon(runs, mk){ var pos = [], idx = [];
  runs.forEach(function(run){ mk(run).forEach(function(strip){ var base = pos.length / 3, n = strip.length;
    strip.forEach(function(q){ pos.push(q[0][0], q[0][1], q[0][2], q[1][0], q[1][1], q[1][2]); });
    for (var i = 0; i < n - 1; i++){ var a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }); });
  var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
function buildBridges(){
  var piers = [], lights = [], runs = [];
  ST.ROADS_S.concat([ST.RAIL_S]).forEach(function(R){ var cur = []; R.pts.forEach(function(p){ if (p.br) cur.push(p); else { if (cur.length > 1) runs.push({ R:R, pts:cur }); cur = []; } }); if (cur.length > 1) runs.push({ R:R, pts:cur }); });
  ST.ROADS_S.concat([ST.RAIL_S]).forEach(function(R){ R.pts.forEach(function(p, i){ if (!p.br) return; var w = R.rail ? 0.5 : R.w + 0.16;
    var gH = ST.G.hAt(p.x, p.z);
    if (i % 4 === 0 && p.y - Math.max(gH, 0) > 0.3) piers.push({ x:p.x, z:p.z, y:Math.min(gH, 0) - 0.4, top:p.y - 0.12, r:Math.atan2(p.fx, p.fz), w:w * 0.8 });   // trụ chỉ ở chỗ cầu cao hơn đất, cao vừa tới mặt cầu
    if (!R.rail && i % 3 === 0) lights.push(p.x - p.fz * w / 2, p.y + 0.3, p.z + p.fx * w / 2, p.x + p.fz * w / 2, p.y + 0.3, p.z - p.fx * w / 2); }); });
  var bx = new THREE.BoxGeometry(1, 1, 1);
  [false, true].forEach(function(isRail){ var rs = runs.filter(function(u){ return !!u.R.rail === isRail; }); if (!rs.length) return;
    var W = function(u){ return u.R.rail ? 0.5 : u.R.w + 0.16; }, off = function(p, s, w){ return [p.x - p.fz * s * w / 2, p.z + p.fx * s * w / 2]; };
    var deck = ribbon(rs, function(u){ var w = W(u), top = [], bot = [], sl = [], sr = [];   // mặt trên, đáy, hai thành bên
      u.pts.forEach(function(p){ var a = off(p, 1, w), b = off(p, -1, w), y = p.y - 0.005, y0 = p.y - 0.13;
        top.push([[a[0], y, a[1]], [b[0], y, b[1]]]); bot.push([[b[0], y0, b[1]], [a[0], y0, a[1]]]); sl.push([[a[0], y0, a[1]], [a[0], y, a[1]]]); sr.push([[b[0], y, b[1]], [b[0], y0, b[1]]]); });
      return [top, bot, sl, sr]; });
    var dm = mat(isRail ? '#8b7f73' : '#d3cfc6').clone(); dm.side = THREE.DoubleSide; var dk = new THREE.Mesh(deck, dm); dk.receiveShadow = true; dk.castShadow = true; scene.add(dk);
    var hh = isRail ? 0.16 : 0.07, rail = ribbon(rs, function(u){ var w = W(u), L = [], Rr = [];   // lan can liền hai bên
      u.pts.forEach(function(p){ var a = off(p, 1, w), b = off(p, -1, w); L.push([[a[0], p.y, a[1]], [a[0], p.y + hh, a[1]]]); Rr.push([[b[0], p.y + hh, b[1]], [b[0], p.y, b[1]]]); }); return [L, Rr]; });
    var rm = mat(isRail ? '#7a3b2e' : '#f4f4f4').clone(); rm.side = THREE.DoubleSide; scene.add(new THREE.Mesh(rail, rm)); });
  instChunks(bx, mat('#bdb6a6'), piers, function(d, it){ d.position.set(it.x, (it.y + it.top) / 2, it.z); d.rotation.y = it.r; d.scale.set(it.w, it.top - it.y, 0.18); });
  return lights; }

function buildCity(B){
  var winT = winTex(2, 2, { mx:6, my:7, wh:13, balcony:true, glass:'#8aaabd', seed:1 }), winTw = winTex(4, 4, { mx:5, my:6, wh:17, glass:'#7ea4bd', seed:2 });
  var tubeMat = bmat(winT, 0.75), towerMat = bmat(winTw, 1.0);
  TUBE_F.forEach(function(f){ instChunks(boxUV(1, f / 2, true), tubeMat, B.tubes.filter(function(t){ return t.f === f; }), function(d, it, c){ d.position.set(it.x, it.y, it.z); d.rotation.y = it.r; d.scale.set(it.w, it.h, it.d); c.set(it.c); }); });
  TOWER_F.forEach(function(f){ instChunks(boxUV(1.5, f / 4, false), towerMat, B.towers.filter(function(t){ return t.f === f; }), function(d, it, c){ d.position.set(it.x, it.y, it.z); d.rotation.y = it.r; d.scale.set(it.w, it.h, it.d); c.set(it.c); }, { pad:8 }); });
  // Chung cư thấp tầng giữa khối phố: mô hình Kenney Commercial, kéo theo số tầng
  var kit = kitMat(), BLOCKS = ['block-b','block-c','block-d','block-e'];
  BLOCKS.forEach(function(id, bi){ instChunks(modelGeo(id), kit, B.mids.filter(function(t){ return ((ih(t.x * 13, t.z * 7) * BLOCKS.length) | 0) === bi; }), function(d, it, c){
    d.position.set(it.x, it.y, it.z); d.rotation.y = it.r; d.scale.set(it.w, it.h, it.d); c.set(it.c); }, { roof:function(it){ return '#7fb08a'; } }); });
  var bx = new THREE.BoxGeometry(1, 1, 1); bx.translate(0, 0.5, 0);
  // Mặt tiền nhà ống: bảng hiệu, mái hiên di động (bạt) che tầng trệt, "tum" cầu thang và mái tôn trên sân thượng.
  // it.y nằm dưới đất 0,02 (ok() trong geo.js trừ sẵn cho chân nhà không hở); phụ kiện mặt tiền neo vào đất thật ở chân tường phía trước (lô dốc thì tường trước cao hơn it.y)
  function front(d, it, out){ d.position.set(it.x, it.y, it.z); d.rotation.y = it.r + (it.fc > 0 ? 0 : Math.PI); d.translateZ(it.d / 2 + out); d.position.y = Math.max(it.y + 0.02, ST.G.hAt(d.position.x, d.position.z)); }
  var PH = 0.054;   // chiều cao người chơi (KS = 0,35 trong player.js); các phụ kiện thấp tính theo người, không theo hằng tuyệt đối
  var SIGN_C = ['#d7263d','#f4b400','#1b6fd1','#1f9d55','#e8590c','#ffffff','#c2185b','#00838f'], AWN_C = ['#e03131','#1c7ed6','#2f9e44','#f08c00','#5f3dc4','#0b7285'];
  var shop = B.tubes.filter(function(t){ return t.w < 0.32 && ih(t.x * 41, t.z * 23) < 0.72; });   // nhà quá rộng (> 16 m) không gắn biển, mái hiên
  instChunks(bx, mat('#ffffff', { roughness:0.6 }), shop, function(d, it, c){ front(d, it, 0.006); d.position.y += FLOOR * 0.87; d.scale.set(Math.min(it.w * 0.86, 0.22), FLOOR * 0.3, 0.012); c.set(SIGN_C[(ih(it.x * 7, it.z * 5) * SIGN_C.length) | 0]); }, { cast:false });
  // mái hiên (bạt): mép trong cao 1,45 người, vươn 0,045, nghiêng 0,24 nên mép ngoài vẫn cao hơn đầu người; dải rủ ở mép ngoài cho đọc ra là mái bạt, không phải tấm ván
  var awnGeo = new THREE.BoxGeometry(1, 1, 1); awnGeo.translate(0, 0, 0.5);
  var AWN_Y = PH * 1.45, AWN_P = 0.045, AWN_T = 0.24, awnShops = shop.filter(function(t){ return ih(t.x * 13, t.z * 37) < 0.6; }), awnW = function(it){ return Math.min(it.w * 0.92, 0.26); }, awnC = function(it, c){ c.set(AWN_C[(ih(it.x * 3, it.z * 11) * AWN_C.length) | 0]); };
  instChunks(awnGeo, mat('#ffffff', { roughness:0.85 }), awnShops, function(d, it, c){ front(d, it, 0); d.position.y += AWN_Y; d.rotateX(AWN_T); d.scale.set(awnW(it), 0.004, AWN_P); awnC(it, c); });
  instChunks(bx, mat('#ffffff', { roughness:0.85 }), awnShops, function(d, it, c){ front(d, it, AWN_P * Math.cos(AWN_T)); d.position.y += AWN_Y - AWN_P * Math.sin(AWN_T) - 0.012; d.scale.set(awnW(it), 0.012, 0.004); awnC(it, c); }, { cast:false });
  // Dù hàng rong trên vỉa hè trước một số cửa hàng (mô hình Kenney, tán đổi màu qua aRoof)
  var DU_C = ['#e03131','#1c7ed6','#f08c00','#2f9e44','#ffffff'], vend = shop.filter(function(t){ return ih(t.x * 59, t.z * 43) < 0.12; });
  ['parasol-a','parasol-b'].forEach(function(id, k){ instChunks(modelGeo(id), kitMat(), vend.filter(function(t){ return (ih(t.x * 7, t.z * 71) < 0.5) === (k === 0); }), function(d, it, c){
    front(d, it, 0.05); d.translateX((ih(it.x * 3, it.z * 9) - 0.5) * it.w * 0.6); d.scale.set(0.07, 0.065, 0.07); }, { roof:function(it){ return DU_C[(ih(it.x * 11, it.z * 13) * DU_C.length) | 0]; }, cast:false }); });
  var tum = B.tubes.filter(function(t){ return t.f >= 3 && ih(t.x * 17, t.z * 29) < 0.45; });
  instChunks(bx, mat('#ffffff'), tum, function(d, it, c){ d.position.set(it.x, it.y + it.h, it.z); d.rotation.y = it.r + (it.fc > 0 ? 0 : Math.PI); d.translateZ(-it.d * 0.22); d.scale.set(it.w * 0.62, FLOOR * 0.72, it.d * 0.34); c.set(it.c); });
  var tole = new THREE.BoxGeometry(1, 1, 1); tole.translate(0, 0.5, 0);
  instChunks(tole, mat('#ffffff', { roughness:0.5, metalness:0.25 }), tum, function(d, it, c){ d.position.set(it.x, it.y + it.h + FLOOR * 0.72, it.z); d.rotation.y = it.r + (it.fc > 0 ? 0 : Math.PI); d.translateZ(-it.d * 0.22); d.rotateX(0.12); d.position.y += it.d * 0.4 * 0.5 * Math.sin(0.12); d.scale.set(it.w * 0.7, 0.008, it.d * 0.4); c.set(['#c0504d','#4f81bd','#9aa3a8','#c0504d'][(ih(it.x * 5, it.z * 3) * 4) | 0]); });
  instChunks(bx, mat('#9aa3a8'), B.towers, function(d, it){ d.position.set(it.x, it.y + it.h, it.z); d.rotation.y = it.r; d.scale.set(it.w * 0.55, 0.12, it.d * 0.45); });
  instChunks(bx, mat('#54c6e0', { roughness:0.2 }), B.towers.filter(function(t){ return t.pool; }), function(d, it){ d.position.set(it.x, it.y + it.h, it.z); d.rotation.y = it.r; d.translateZ(it.d * 0.22); d.scale.set(it.w * 0.6, 0.03, it.d * 0.3); }, { cast:false });
  instChunks(tankGeo, mat('#e3e7ec', { metalness:0.6, roughness:0.3 }), B.tanks, function(d, it){ d.position.set(it.x, it.y, it.z); });
  // Nhà vườn, biệt thự: mô hình Kenney Suburban. Giữ tỷ lệ cao tự nhiên của mô hình (nhân VH như cách nhà được phóng đại),
  // quay mặt tiền ra đường (fc), mái lấy màu rc của từng căn.
  var PITCH = ['house-a','house-c','house-g','house-h','house-i','house-j','house-k','house-l','house-m','house-r','house-s','house-u'], FLAT = ['house-o','house-p','house-q'], VH = 1.6;
  function villaSet(ids, list){ ids.forEach(function(id, bi){ var sz = modelGeo(id).userData.size;
    instChunks(modelGeo(id), kit, list.filter(function(t){ return ((ih(t.x * 29, t.z * 11) * ids.length) | 0) === bi; }), function(d, it, c){
      d.position.set(it.x, it.y, it.z); d.rotation.y = it.r + (it.fc > 0 ? 0 : Math.PI);
      var kx = it.w / sz[0], kz = it.d / sz[2]; d.scale.set(it.w, sz[1] * Math.sqrt(kx * kz) * VH, it.d); c.set(it.c); }, { roof:function(it){ return it.rc; } }); }); }
  villaSet(PITCH, B.villas.filter(function(v){ return v.roof; })); villaSet(FLAT, B.villas.filter(function(v){ return !v.roof; }));
}

function buildVegetation(T, B){
  var forest = [], round = [];
  T.round.forEach(function(t){ if (t.y > 1.1 && ST.G.zoneAt(t.x, t.z) < 10) forest.push(t); else round.push(t); });
  B.yard.forEach(function(p){ var y = ST.G.hAt(p.x, p.z); if (y > 0.3 && !ST.MK(p.x, p.z)) round.push({ x:p.x, z:p.z, y:y, s:0.22 + ih(p.x * 10, p.z * 10) * 0.12, a:0, sq:1 }); });
  var SW = genStreetTrees(ST.ROADS_S, ST.G, ST.MK); SW.trees.forEach(function(t){ round.push(t); });   // cây ven đường, hàng dừa sát bãi biển (geo.js)
  var TC = ['#5f9e48','#4f9140','#6aa84f','#3f8636','#78ad52','#58923f'], FC = ['#4a8a3c','#3f7d36','#56913f','#467f35','#5a8f3e','#6d9442','#7f9a4a'];
  instChunks(forestGeo, VCM, forest, function(d, it, c){ d.position.set(it.x, it.y - 0.05, it.z); d.rotation.y = it.a; d.scale.set(it.s, it.s * it.sq, it.s); c.set(FC[(ih(it.x * 7, it.z * 3) * FC.length) | 0]); });
  // cây tán tròn, cây thông, ô bãi biển lay theo gió (swayMat); rừng đồi xa (forestGeo) đứng yên; dừa lay bằng palmMat = swayMat({ attr:true }) (thuộc tính `aSway` của makePalmGeo)
  var swTree = swayMat({ amp:0.1, hRef:0.8 }), swCone = swayMat({ amp:0.07, hRef:1.12 }), swUmb = swayMat({ amp:0.03, hRef:0.16, flutter:1, double:true });
  instChunks(canopyGeo, swTree, round, function(d, it, c){ d.position.set(it.x, it.y - 0.02, it.z); d.rotation.y = it.a; d.scale.setScalar(it.s * 1.5); c.set(TC[(ih(it.x * 5, it.z * 9) * TC.length) | 0]); });
  instChunks(coneTreeGeo, swCone, T.cones, function(d, it, c){ d.position.set(it.x, it.y - 0.05, it.z); d.rotation.y = it.a; d.scale.setScalar(it.s * 1.4); c.set(['#3e7a38','#356f31','#4a8a3e'][(ih(it.x, it.z) * 3) | 0]); });
  var palms = T.palms.slice();
  ROUNDS.forEach(function(o, k){ var ir = o.r - o.w / 2; if (ir < 0.22) return; var y = ST.G.hAt(o.x, o.z), n = ir > 0.5 ? 4 : 2;   // cây cọ trên đảo bùng binh
    palms.push({ x:o.x, z:o.z, y:y, s:0.9, a:k, t:0.05 }); for (var i = 0; i < n; i++){ var a = i / n * 6.283 + k; palms.push({ x:o.x + Math.cos(a) * ir * 0.5, z:o.z + Math.sin(a) * ir * 0.5, y:y, s:0.75, a:a, t:0.1 }); } });
  palms = palms.concat(SW.palms); ST.streetPalms = SW.palms;
  var keepClear = function(p){ for (var i = 0; i < KEEP.length; i++) if (Math.hypot(p.x - KEEP[i][0], p.z - KEEP[i][1]) < KEEP[i][2] * 0.8) return false; return true; };
  palms = palms.filter(keepClear);
  // 3 biến thể dáng dừa (nghiêng, số tàu, quả khác nhau): chọn theo vị trí, mỗi biến thể một lượt instChunks
  PALM_GEOS.forEach(function(pg, v){
    instChunks(pg, palmMat, palms.filter(function(it){ return ((ih(it.x * 3, it.z) * 3) | 0) === v; }), function(d, it, c){ d.position.set(it.x, it.y - 0.02, it.z); d.rotation.set(it.t, it.a, 0); d.scale.setScalar(it.s); c.set(['#ffffff','#eef6df','#f6f1e2'][(ih(it.x * 5, it.z * 7) * 3) | 0]); }).forEach(function(m){ m.userData.palm = true; }); });
  var umb = [], lounge = [], UC = ['#f2592c','#3fb6c9','#ffd23f','#ffffff','#ff8fab','#2a9d8f'];
  for (var z = P(12.2600, 0)[1]; z <= P(12.2125, 0)[1]; z += 0.2){ var sec = ih(Math.floor(z / 6), 4); if (sec < 0.25) continue; var x = coastX(z) - 0.42 - ih(z * 13, 1) * 0.42, y = ST.G.hAt(x, z); if (y < 0.08) continue;
    var col = UC[(Math.floor(z / 6) * 7 + 3) % UC.length]; umb.push({ x:x, z:z, y:y, c:col }); lounge.push({ x:x + 0.035, z:z + 0.015, y:y }, { x:x + 0.035, z:z - 0.025, y:y }); }
  instChunks(umbGeo, swUmb, umb, function(d, it, c){ d.position.set(it.x, it.y, it.z); d.scale.setScalar(0.5); c.set(it.c); }, { cast:true });   // ô cao ~4 m (thật 2,2 m; ×1,6 thế giới ≈ 3,5 m)
  var lg = new THREE.BoxGeometry(0.045, 0.01, 0.0175); lg.translate(0, 0.01, 0);
  instChunks(lg, mat('#fbfbf7'), lounge, function(d, it){ d.position.set(it.x, it.y, it.z); }, { cast:false });
}

function buildBoats(){
  var hulls = [], coracles = [], HC = ['#ffffff','#e6f0ff','#dcebf5','#fff4e8','#e8f6f0'];
  function okW(x, z, r){ return ST.G.hAt(x, z) < -0.32 && ST.G.hAt(x + r, z) < -0.25 && ST.G.hAt(x - r, z) < -0.25 && ST.G.hAt(x, z + r) < -0.25 && ST.G.hAt(x, z - r) < -0.25; }
  function cluster(lat, lon, rad, n, list, align){ var c = P(lat, lon), tries = 0, made = 0; while (made < n && tries < n * 30){ tries++; var a = ih(tries, lat * 1e4) * Math.PI * 2, r = Math.sqrt(ih(lon * 1e4, tries)) * rad, x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r;
      if (!inBoard(x, z, 2) || !okW(x, z, 0.28)) continue; var ok = true; for (var k = list.length - 1; k >= Math.max(0, list.length - 60); k--){ if (Math.hypot(list[k].x - x, list[k].z - z) < 0.36){ ok = false; break; } } if (!ok) continue;
      list.push({ x:x, z:z, r:align != null ? align + (ih(tries, 3) - 0.5) * 0.5 : ih(tries, 9) * 6.28, c:HC[(ih(x * 9, z * 9) * HC.length) | 0], ph:ih(x, z) * 6.28 }); made++; } }
  cluster(12.1962, 109.2068, 6, LITE ? 50 : 110, hulls, 0.7); cluster(12.2632, 109.2010, 3.2, LITE ? 20 : 40, hulls, Math.PI / 2); cluster(12.2632, 109.1975, 2.5, 18, hulls, Math.PI / 2);
  cluster(12.2058, 109.2192, 2.2, 10, hulls); cluster(12.1966, 109.2888, 3, 18, hulls, 0); cluster(12.1942, 109.2194, 2.4, 12, hulls); cluster(12.2775, 109.2098, 2.4, 8, hulls);
  cluster(12.1950, 109.2102, 3.5, LITE ? 30 : 60, coracles); cluster(12.2628, 109.2030, 2.5, 25, coracles); cluster(12.2748, 109.2098, 2.5, 15, coracles); cluster(12.1946, 109.2190, 2, 15, coracles);
  anim.boats = hulls;
  anim.hullIM = kitDyn('boat-fishing', hulls.length); anim.hullK = fitLen('boat-fishing', BOAT_L);
  hulls.forEach(function(b, i){ _c.set(b.c); anim.hullIM.setColorAt(i, _c); });
  instChunks(coracleGeo, VCM, coracles, function(d, it, c){ d.position.set(it.x, 0.02, it.z); d.rotation.y = it.r; c.set(['#3c5d93','#2f4f7f','#4a6aa0'][(ih(it.x, it.z) * 3) | 0]); }, { cast:false });
  /* floating fish farms */
  var cells = [], huts = [];
  [[12.1915,109.2186,7,4,0.6],[12.1862,109.2262,5,4,0.3],[12.1968,109.2878,6,3,0.1],[12.1972,109.2640,5,3,-0.2],[12.1788,109.2272,4,3,0.5],[12.1950,109.3040,4,3,0.8]].forEach(function(f){
    var c = P(f[0], f[1]), ca = Math.cos(f[4]), sa = Math.sin(f[4]), S = 0.34;
    for (var i = 0; i < f[2]; i++) for (var j = 0; j < f[3]; j++){ var u = (i - f[2] / 2) * S, v = (j - f[3] / 2) * S, x = c[0] + u * ca - v * sa, z = c[1] + u * sa + v * ca; if (ST.G.hAt(x, z) > -0.3) continue;
      cells.push({ x:x, z:z, r:-f[4] }); if ((i * 7 + j * 3) % 9 === 0) huts.push({ x:x, z:z, r:-f[4] }); } });
  var fr = merge([[new THREE.BoxGeometry(0.34, 0.03, 0.03), MX(0, 0.03, 0.155), '#8b6b4a'], [new THREE.BoxGeometry(0.34, 0.03, 0.03), MX(0, 0.03, -0.155), '#8b6b4a'], [new THREE.BoxGeometry(0.03, 0.03, 0.34), MX(0.155, 0.03, 0), '#8b6b4a'], [new THREE.BoxGeometry(0.03, 0.03, 0.34), MX(-0.155, 0.03, 0), '#8b6b4a'], [new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), MX(0.155, 0.02, 0.155), '#2f6fb0']]);
  instChunks(fr, VCM, cells, function(d, it){ d.position.set(it.x, 0, it.z); d.rotation.y = it.r; }, { cast:false });
  var hut = merge([[new THREE.BoxGeometry(0.2, 0.12, 0.16), MX(0, 0.1, 0), '#a5835f'], [new THREE.ConeGeometry(0.17, 0.08, 4), MX(0, 0.2, 0, 0, Math.PI / 4, 0), '#3d6f9e']]);
  instChunks(hut, VCM, huts, function(d, it){ d.position.set(it.x, 0, it.z); d.rotation.y = it.r; });
  /* moving boats */
  function route(ll, mk, speed, loop){ var pts = LLs(ll).map(function(p){ return new THREE.Vector3(p[0], 0, p[1]); }), curve = new THREE.CatmullRomCurve3(pts, !!loop, 'centripetal');
    var g = mk(); scene.add(g); g.traverse(function(o){ if (o.isMesh) o.castShadow = true; }); anim.movers.push({ g:g, curve:curve, len:curve.getLength(), sp:speed, loop:!!loop, t:ih(pts.length, speed * 100) }); }
  route([[12.2048,109.2195],[12.2090,109.2262],[12.2152,109.2345]], ferryBoat, 0.7);
  route([[12.2040,109.2188],[12.1992,109.2196],[12.1950,109.2198]], ferryBoat, 0.6);
  route([[12.2040,109.2200],[12.2000,109.2350],[12.1880,109.2600],[12.1760,109.2850],[12.1690,109.2955]], speedBoat, 2.6);
  route([[12.2035,109.2198],[12.2000,109.2300],[12.1950,109.2345],[12.1860,109.2342],[12.1812,109.2320]], speedBoat, 2.0);
  route([[12.2300,109.2100],[12.2450,109.2250],[12.2550,109.2250],[12.2500,109.2120]], function(){ return fishingBoat('#ffffff', '#2f8f9a', 2.2); }, 0.45, true);
  route([[12.1955,109.2100],[12.1880,109.2150],[12.1700,109.2200]], function(){ return fishingBoat('#2f6fd6', '#d9483b', 1.6); }, 0.5);
  route([[12.2500,109.2600],[12.2480,109.2900],[12.2400,109.3150]], function(){ return fishingBoat('#1f8fb0', '#ffd23f', 1.6); }, 0.4);
  route([[12.2420,109.2150],[12.2480,109.2300],[12.2580,109.2280],[12.2540,109.2120]], sailBoat, 0.35, true);
  route([[12.2250,109.2200],[12.2300,109.2320],[12.2200,109.2330],[12.2170,109.2230]], sailBoat, 0.3, true);
  route([[12.2700,109.2200],[12.2780,109.2350],[12.2650,109.2400]], sailBoat, 0.3, true);
  /* parasailing off Trần Phú */
  var pb = fishingBoat('#ffffff', '#e0473a', 1.3); scene.add(pb);
  var chute = new THREE.Group(), cm = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color:'#ff5d73', side:THREE.DoubleSide, roughness:0.8 }));
  cm.scale.set(1, 0.45, 0.7); chute.add(cm); chute.add(at(sph(0.05, '#2b2d42', 6, 4), 0, -0.55, 0)); scene.add(chute);
  var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  var line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color:'#444444' })); line.frustumCulled = false; scene.add(line);
  anim.parasail = { boat:pb, chute:chute, line:line, c:P(12.2345, 109.2050) };
}

function buildTraffic(){
  // Xe máy tự dựng (xe tay ga + người lái đội mũ bảo hiểm); phần trắng nhận màu từng chiếc. Ô tô dùng mô hình Kenney (CARS).
  var wheel = new THREE.CylinderGeometry(0.021, 0.021, 0.012, 8); wheel.rotateZ(Math.PI / 2);
  var vehGeo = { moto: merge([[wheel, MX(0, 0.021, 0.042), '#2b2b2b'], [wheel, MX(0, 0.021, -0.042), '#2b2b2b'],
      [new THREE.BoxGeometry(0.032, 0.028, 0.08), MX(0, 0.042, -0.008), '#ffffff'], [new THREE.BoxGeometry(0.03, 0.055, 0.012), MX(0, 0.058, 0.036, -0.25, 0, 0), '#ffffff'],
      [new THREE.BoxGeometry(0.052, 0.006, 0.006), MX(0, 0.088, 0.036), '#3b3b3b'], [new THREE.BoxGeometry(0.03, 0.012, 0.05), MX(0, 0.062, -0.018), '#262626'],
      [new THREE.BoxGeometry(0.03, 0.012, 0.044), MX(0, 0.072, 0.004), '#3c4a63'], [new THREE.BoxGeometry(0.032, 0.042, 0.022), MX(0, 0.095, -0.012, 0.15, 0, 0), '#e9e4da'],
      [new THREE.BoxGeometry(0.044, 0.008, 0.008), MX(0, 0.104, 0.008), '#d9b48f'], [new THREE.SphereGeometry(0.0145, 8, 6), MX(0, 0.128, -0.006), '#ffffff']]),
    bus: merge([[new THREE.BoxGeometry(0.12, 0.11, 0.44), MX(0, 0.075, 0), '#ffffff'], [new THREE.BoxGeometry(0.124, 0.035, 0.42), MX(0, 0.095, 0), '#3d4a57']]) };
  var NV = LITE ? 240 : 560, roads = ST.ROADS_S.filter(function(R){ return R.L > 4; }), tot = roads.reduce(function(s, R){ return s + R.L; }, 0), rv = mulberry32(5);
  var V = { moto:[], car:[], bus:[] }, MC = ['#d62828','#1d3557','#f1faee','#2a2a2a','#457b9d','#e9c46a','#8d99ae','#e76f51'], CC = ['#ffffff','#c0c4c8','#d62828','#1d3557','#2a2a2a','#e9ecef','#3a86ff'], BC = ['#2f8f5f','#e0a020','#2e6fb5','#e85d04'];
  for (var i = 0; i < NV; i++){ var pick = rv() * tot, R = roads[0]; for (var k = 0; k < roads.length; k++){ if (pick < roads[k].L){ R = roads[k]; break; } pick -= roads[k].L; }
    var r = rv(), type = r < 0.74 ? 'moto' : (r < 0.95 ? 'car' : 'bus');
    var pal = type === 'moto' ? MC : (type === 'car' ? CC : BC);
    V[type].push({ R:R, s:rv() * R.L, dir:rv() < 0.5 ? 1 : -1, sp:(type === 'moto' ? 0.21 : type === 'car' ? 0.25 : 0.18) * (0.8 + rv() * 0.4), l:rv(), c:pal[(rv() * pal.length) | 0], ks:type === 'bus' ? 0.75 : (type === 'car' ? 0.5 : 0.45), len:type === 'bus' ? 0.33 : type === 'car' ? 0.105 : 0.054 }); }   // xe NPC thu nhỏ (ô tô ×0,5, xe máy ×0,45, buýt ×0,75), tốc độ ×0,5
  var all = []; ['moto', 'bus'].forEach(function(t){ var im = dynInst(vehGeo[t], VCM, V[t].length, t !== 'moto'); V[t].forEach(function(v, i){ v.im = im; v.k = i; _c.set(v.c || '#ffffff'); im.setColorAt(i, _c); all.push(v); }); });
  var CARS = ['car-sedan','car-sedan-sports','car-hatchback','car-suv','car-suv-luxury','car-taxi','car-van','car-pickup'], CT = ['#ffffff','#ffffff','#eef2f7','#f7f0e6'];
  CARS.forEach(function(id, m){ var list = V.car.filter(function(v, i){ return ((ih(i * 7 + 3, 13) * CARS.length) | 0) === m; }), im = kitDyn(id, list.length, true), sc = fitLen(id, 0.105);
    list.forEach(function(v, i){ v.im = im; v.k = i; v.sc = sc; _c.set(CT[(ih(i, m) * CT.length) | 0]); im.setColorAt(i, _c); all.push(v); }); });
  var pos = new Float32Array(all.length * 6), col = new Float32Array(all.length * 6);
  all.forEach(function(v, i){ col.set([1, 0.93, 0.78, 1, 0.16, 0.12], i * 6); });
  carPts = glowPoints(pos, col, 0.03); anim.vehicles = { list:all, pos:pos };
  /* train */
  // tàu hoả: 1 đầu máy diesel + 9 toa khách (Kenney Train Kit)
  anim.train = { loco:kitDyn('train-loco', 1), im:kitDyn('train-coach', 9), kl:fitLen('train-loco', 0.56), kc:fitLen('train-coach', 0.56), s:20, dir:1, wait:0 };
}

// Đèn đường: điểm sáng nhỏ (lampPts) + vệt sáng cam cộng sáng trên mặt đường dưới chân đèn (decal theo instance, không phải đèn thật nên không tốn gì ở shader mặt đất).
// `big` = đèn đường lớn/cầu/bờ biển (LITE chỉ giữ nhóm này); đường nhỏ OSM và lưới phố ước lượng không có decal ở LITE.
var poolMat, poolMeshes = [];
function buildLamps(bridgeLights){
  var pos = [], feet = [];
  function lamp(x, y, z, h, big){ pos.push(x, y + h, z); if (big || !LITE) feet.push({ x:x, y:y, z:z, big:big }); }
  for (var bi = 0; bi < bridgeLights.length; bi += 3) lamp(bridgeLights[bi], bridgeLights[bi + 1] - 0.3, bridgeLights[bi + 2], 0.3, true);
  ST.ROADS_S.forEach(function(R){ R.pts.forEach(function(p, i){ if (i % 2 || p.br || p.cw) return; var s = (i / 2) % 2 ? 1 : -1, off = R.w / 2 + 0.1; lamp(p.x - p.fz * s * off, p.y, p.z + p.fx * s * off, 0.3, true); }); });
  for (var z = P(12.2620, 0)[1]; z <= P(12.2104, 0)[1]; z += 0.9){ var x = coastX(z) - 1.65, gh = ST.G.hAt(x, z); lamp(x, gh, z, 0.28, true); }
  // có OSM: đèn dọc đường nhỏ thật (cách ~60 m), không rải theo lưới phố ước lượng
  if (OSM) OSM_MINOR.forEach(function(R){ if (R.c > 6) return; var acc = 0.6, Q = R.pts;
    for (var i = 0; i < Q.length - 1; i++){ var dx = Q[i + 1][0] - Q[i][0], dz = Q[i + 1][1] - Q[i][1], L = Math.hypot(dx, dz);
      while (acc < L){ var t = acc / L, x = Q[i][0] + dx * t - dz / L * (R.w / 2 + 0.06), z = Q[i][1] + dz * t + dx / L * (R.w / 2 + 0.06), y = ST.G.hAt(x, z); if (y > 0.25) lamp(x, y, z, 0.24, false); acc += 1.2; }
      acc -= L; } });
  if (!OSM) DIST.forEach(function(D){ if (D.style === 'village') return; var us = [], vs = []; D.poly.forEach(function(p){ var l = toLocal(D, p[0], p[1]); us.push(l[0]); vs.push(l[1]); });
    var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs), st = D.style === 'city' ? 1.05 : 1.6;
    for (var i = Math.ceil(u0 / D.su); i * D.su <= u1; i++) for (var v = v0; v <= v1; v += st){ var w = toWorld(D, i * D.su, v); if (ST.G.zoneAt(w[0], w[1]) === 10 + D.i) lamp(w[0], ST.G.hAt(w[0], w[1]), w[1], 0.24, false); }
    for (var j = Math.ceil(v0 / D.sv); j * D.sv <= v1; j++) for (var u = u0; u <= u1; u += st){ var w2 = toWorld(D, u, j * D.sv); if (ST.G.zoneAt(w2[0], w2[1]) === 10 + D.i) lamp(w2[0], ST.G.hAt(w2[0], w2[1]), w2[1], 0.24, false); } });
  lampPts = glowPoints(pos, null, 0.06, '#ffcf8a');
  // decal: mặt phẳng nằm ngang, cộng sáng, đường kính 0,7 (~35 m, chồng lên khoảng cách đèn 50–60 m); LITE nới 0,9 vì thưa hơn
  var PD = LITE ? 0.9 : 0.7, pg = new THREE.PlaneGeometry(PD, PD); pg.rotateX(-Math.PI / 2);
  poolMat = new THREE.MeshBasicMaterial({ map:radialTex('rgba(255,255,255,1)', '', 1.5), color:'#ffa24a', transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
  // mờ dần khi camera xa (12→45 đơn vị): nhìn toàn cảnh 15k vệt chồng nhau sẽ thành màng cam
  poolMat.onBeforeCompile = function(sh){ sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying float vPoolFade;\nvoid main() {').replace('#include <project_vertex>', '#include <project_vertex>\n\tvPoolFade = 1.0 - smoothstep(12.0, 45.0, -mvPosition.z);');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vPoolFade;\nvoid main() {').replace('#include <opaque_fragment>', '#include <opaque_fragment>\n\tgl_FragColor.a *= vPoolFade;'); };
  poolMat.customProgramCacheKey = function(){ return 'lampPool'; };
  poolMeshes = instChunks(pg, poolMat, feet, function(d, it, c){ d.position.set(it.x, it.y + 0.02, it.z); d.scale.setScalar(it.big ? 1 : 0.85); c.setRGB(1, 1, 1); }, { cast:false, receive:false, pad:0.5 });
  poolMeshes.forEach(function(m){ m.renderOrder = 4; m.visible = false; });
  setLampLight(lampK); }
// thang sáng của điểm sáng/decal: ban ngày và hoàng hôn sớm = 0 (không còn đốm trắng); bloom, mini map, đèn xe máy vẫn dùng lampK gốc
function setLampLight(k){ var v = smooth(0.3, 0.75, k);
  if (lampPts){ lampPts.material.opacity = v; lampPts.visible = v > 0.01; }
  if (carPts){ carPts.material.opacity = v * 0.9; carPts.visible = v > 0.01; }
  if (poolMat){ poolMat.opacity = v * 0.45; poolMeshes.forEach(function(m){ m.visible = v > 0.01; }); } }

function buildSky(){
  var cm = new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:1, emissive:'#ffffff', emissiveIntensity:0.2, transparent:true, opacity:0.92 }), cg = new THREE.IcosahedronGeometry(1, 2), rc = mulberry32(11);
  for (var i = 0; i < (LITE ? 8 : 13); i++){ var g = new THREE.Group(), n = 4 + Math.floor(rc() * 4);
    for (var j = 0; j < n; j++){ var s = 3 + rc() * 5, m = new THREE.Mesh(cg, cm); m.scale.set(s, s * 0.62, s); m.position.set((j - n / 2) * (3 + rc() * 2.5), rc() * 1.5, (rc() - 0.5) * 4); m.castShadow = true; g.add(m); }
    g.position.set(BX0 + rc() * BW, 42 + rc() * 16, BZ0 + rc() * BD); g.userData.sp = 0.6 + rc() * 0.8; scene.add(g); anim.clouds.push(g); }
  anim.cloudMat = cm;
  var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.16, 0.04, -0.05, -0.05, 0, 0.02, 0, 0, 0, 0.16, 0.04, -0.05, 0.05, 0, 0.02], 3)); bg.computeVertexNormals();
  var birds = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color:'#f7f7f2', side:THREE.DoubleSide }), 40); birds.frustumCulled = false; scene.add(birds);
  var bl = []; for (var b = 0; b < 40; b++){ var c = b < 22 ? P(12.2745, 109.2112) : P(12.2068, 109.2205); bl.push({ cx:c[0], cz:c[1], r:2 + rc() * 4, h:2.5 + rc() * 3, sp:(0.25 + rc() * 0.3) * (rc() < 0.5 ? 1 : -1), a:rc() * 6.28, f:rc() * 6 }); }
  anim.birds = { im:birds, list:bl };
}

/* ======================= TIME OF DAY ======================= */
function C(h){ return new THREE.Color(h); }
var TOD = [
  { top:'#4fb6e6', mid:'#9fdcf0', bot:'#e6f8f3', fog:'#d4eff2', hs:'#b4dcff', hg:'#b3a67a', hi:0.55, sun:'#fff1d6', si:1.5, sp:[0.55, 0.78, 0.3], sh:'#3fc8cf', dp:'#0f5f8c', foam:'#ffffff', sky:'#bfe6f5', cloud:'#ffffff', exp:0.95, lamp:0, glow:0 },
  { top:'#27306a', mid:'#9b5d8f', bot:'#ffad74', fog:'#d9958a', hs:'#9a8fe0', hg:'#3a3550', hi:0.58, sun:'#ffad6b', si:1.1, sp:[-0.8, 0.32, -0.2], sh:'#4aa6b8', dp:'#1b3b6a', foam:'#ffe2cf', sky:'#f3a383', cloud:'#ffcdbd', exp:1.05, lamp:0.75, glow:0.6 },
  { top:'#070d22', mid:'#132042', bot:'#2a3762', fog:'#141c38', hs:'#5d74b8', hg:'#1a2036', hi:0.6, sun:'#9fb4ff', si:0.32, sp:[0.3, 0.85, -0.45], sh:'#1d4a66', dp:'#071b33', foam:'#7f93b5', sky:'#22305a', cloud:'#3a4670', exp:1.15, lamp:1, glow:1 }
].map(function(t){ var o = {}; for (var k in t) o[k] = typeof t[k] === 'string' ? C(t[k]) : t[k]; o.sp = new THREE.Vector3(t.sp[0], t.sp[1], t.sp[2]).normalize(); return o; });
ST.tod = 0; ST.todTarget = 0; ST.todUser = false; var sunDir = new THREE.Vector3(); var lampK = 0; var _t1 = new THREE.Color(); var _t2 = new THREE.Color(); var _t3 = new THREE.Color(); var _tg = new THREE.Color();
function applyTod(k){
  var i = k <= 1 ? 0 : 1, f = k - i, a = TOD[i], b = TOD[i + 1];
  _t1.lerpColors(a.top, b.top, f); _t2.lerpColors(a.mid, b.mid, f); _t3.lerpColors(a.bot, b.bot, f);
  var rk = ST.WX && ST.WX.k ? ST.WX.k.rain : 0;   // mưa: ba màu nền trời xám dần (giữ độ sáng từng màu, tối đi ~20%), nối với sương xám ở weatherLight
  if (rk > 0.01){ [_t1, _t2, _t3].forEach(function(c){ var l = (c.r * 0.3 + c.g * 0.59 + c.b * 0.11) * (1 - 0.2 * rk); _tg.setRGB(l * 0.97, l, l * 1.04); c.lerp(_tg, 0.78 * rk); }); }
  stage.style.background = 'linear-gradient(180deg,#' + _t1.getHexString() + ' 0%,#' + _t2.getHexString() + ' 55%,#' + _t3.getHexString() + ' 100%)';
  scene.fog.color.lerpColors(a.fog, b.fog, f);
  hemi.color.lerpColors(a.hs, b.hs, f); hemi.groundColor.lerpColors(a.hg, b.hg, f); hemi.intensity = lerp(a.hi, b.hi, f) * LIGHT_K;
  sun.color.lerpColors(a.sun, b.sun, f); sun.intensity = lerp(a.si, b.si, f) * LIGHT_K; sunDir.lerpVectors(a.sp, b.sp, f).normalize();
  renderer.toneMappingExposure = lerp(a.exp, b.exp, f);
  if (typeof ST.oceanTod === 'function') ST.oceanTod(a, b, f);   // màu biển theo giờ (ocean.js)
  if (anim.cloudMat){ anim.cloudMat.color.lerpColors(a.cloud, b.cloud, f); anim.cloudMat.emissive.copy(anim.cloudMat.color); }
  if (typeof ST.crowdU !== 'undefined'){ var cl = ST.crowdU.uLight.value; cl.copy(hemi.color).multiplyScalar(hemi.intensity / LIGHT_K * 0.95); _t1.copy(sun.color).multiplyScalar(sun.intensity / LIGHT_K * 0.45); cl.add(_t1); cl.r = Math.max(cl.r, 0.3); cl.g = Math.max(cl.g, 0.33); cl.b = Math.max(cl.b, 0.45); }
  var gk = lerp(a.glow, b.glow, f); glowMats.forEach(function(g){ g.m.emissiveIntensity = g.base + (g.peak - g.base) * gk; });
  lampK = lerp(a.lamp, b.lamp, f); setLampLight(lampK);
  if (typeof ST.weatherLight === 'function') ST.weatherLight();
  ST.shadowDirty = true;
}

export { setWet, DP, JETTIES, LITE, LM, LMI, LMP, RESORT_HOTELS, SC, _d, anim, applyTod, b64arr, box, buildBoats, buildBridges, buildCable, buildCity, buildLamps, buildLandmarks, buildResort, buildSkirt, buildSky, buildTerrain, buildTraffic, buildVegetation, camera, carPts, cyl, drawOverlays, fail, glowMat, gy, hemi, initDetail, lampK, loader, mat, osmMajorRoads, pickGroups, radialTex, reduceMotion, renderer, roadPoint, sampleRoad, scene, stage, step, sun, sunDir, updateDetail };
