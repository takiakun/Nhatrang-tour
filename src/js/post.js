import { THREE } from './three.js';
import { ST } from '../state.js';
import { clamp, smooth } from './geo.js';
import { LITE, camera, lampK, reduceMotion, renderer, scene } from './scene.js';
import { PLAY } from './player.js';
/* ======================= HẬU KỲ (viền nét, sa bàn tilt-shift, toả sáng ban đêm) ======================= */
// Không dùng EffectComposer: một render target (kèm độ sâu) + một chuỗi mờ độ phân giải 1/4 + một lượt ghép cuối.
//  - Viền: dò cạnh trên độ sâu tuyến tính, tô nét màu chì, đậm khi nhìn gần (phong cách tranh vẽ, giữ màu cũ)
//  - Sa bàn: xem toàn cảnh thì trên/dưới khung hình mờ dần (lấy từ ảnh mờ 1/4), giống chụp mô hình thu nhỏ
//  - Toả sáng: ban đêm phần sáng của ảnh mờ được cộng lại quanh đèn
// Lượt cuối tự làm tone mapping ACES + sRGB vì r147 chỉ làm việc đó khi vẽ thẳng ra màn hình.
// Chỉ bật khi có ít nhất một hiệu ứng; máy yếu (LITE) hoặc bộ điều tốc đã hạ chất lượng thì vẽ thẳng như cũ.
// ?aa=0 tắt FXAA, ?grade=0 tắt chấm màu (so sánh, gỡ lỗi)
var QS = location.search, AA_ON = !/[?&]aa=0/.test(QS), GRADE_ON = !/[?&]grade=0/.test(QS);
var POST = { ok:false, on:false, rt:null, out:null, a:null, b:null, quad:null, scene:null, cam:null, mats:null, k:{ edge:0, tilt:0, bloom:0 } };
function initPost(){
  if (LITE || !renderer.capabilities.isWebGL2 || !THREE.DepthTexture) return;
  var type = THREE.HalfFloatType, opt = { type:type, depthBuffer:true };
  POST.rt = new THREE.WebGLRenderTarget(4, 4, opt); POST.rt.depthTexture = new THREE.DepthTexture(4, 4); POST.rt.depthTexture.type = THREE.UnsignedIntType;
  POST.out = new THREE.WebGLRenderTarget(4, 4, { type:THREE.UnsignedByteType, depthBuffer:false });   // ảnh đã tone map (sRGB 8 bit) cho FXAA
  POST.a = new THREE.WebGLRenderTarget(4, 4, { type:type, depthBuffer:false }); POST.b = new THREE.WebGLRenderTarget(4, 4, { type:type, depthBuffer:false });
  var vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  var blur = 'uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;\n' +
    'void main(){ vec4 c = texture2D(tSrc, vUv) * 0.2270; vec2 o1 = uDir * 1.3846, o2 = uDir * 3.2308;\n' +
    ' c += (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.3162 + (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.0703; gl_FragColor = c; }';
  // Lượt cuối: tilt-shift, viền nét, toả sáng, tone mapping ACES, chấm màu. Đầu ra là PREMULTIPLIED alpha (canvas có alpha, nền trời là CSS phía sau):
  // pixel trống của render target có alpha 0 nên trời CSS lộ ra (trước đây ghi alpha 1 làm nền quanh bàn bản đồ đen kịt).
  var fin = 'uniform sampler2D tCol, tDep, tBlur; uniform vec2 uPx; uniform float uNear, uFar, uEdge, uTilt, uBloom, uExp, uGrade, uAsp; varying vec2 vUv;\n' +
    'float lin(vec2 p){ float z = texture2D(tDep, p).x * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }\n' +
    'vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }\n' +
    'vec3 aces(vec3 c){ const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));\n' +
    ' const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));\n' +
    ' c *= uExp / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0); }\n' +
    'vec3 srgb(vec3 c){ return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c)); }\n' +
    'void main(){ vec4 c4 = texture2D(tCol, vUv), b4 = texture2D(tBlur, vUv); vec3 col = c4.rgb, bl = b4.rgb; float al = c4.a;\n' +
    ' if (uTilt > 0.0){ float t = smoothstep(0.12, 0.45, abs(vUv.y - 0.52)) * uTilt; col = mix(col, bl, t); al = mix(al, b4.a, t); }\n' +
    ' if (uEdge > 0.0){ float d = lin(vUv), s = 0.0;\n' +
    '  s += abs(lin(vUv + vec2(uPx.x, 0.0)) + lin(vUv - vec2(uPx.x, 0.0)) - 2.0 * d) + abs(lin(vUv + vec2(0.0, uPx.y)) + lin(vUv - vec2(0.0, uPx.y)) - 2.0 * d);   // sai phân bậc hai: mặt phẳng nghiêng (đất sát chân trời) cho 0, chỉ bậc thang độ sâu mới ra viền\n' +
    '  float e = smoothstep(0.035, 0.09, s / d) * uEdge * (1.0 - smoothstep(25.0, 120.0, d)); col = mix(col, col * vec3(0.45, 0.46, 0.5), e); }\n' +
    ' if (uBloom > 0.0){ vec3 add = max(bl - 0.75, 0.0) * 1.6 * uBloom; col += add; al = clamp(al + dot(add, vec3(0.3333)), 0.0, 1.0); }\n' +
    ' vec3 un = al > 0.002 ? col / al : col;   // bỏ premultiplied trước khi tone map rồi nhân lại\n' +
    ' vec3 o = srgb(aces(un));\n' +
    ' if (uGrade > 0.0){ float l = dot(o, vec3(0.299, 0.587, 0.114)); o = mix(vec3(l), o, 1.0 + 0.12 * uGrade);   // bão hoà\n' +
    '  o = mix(o, o * o * (3.0 - 2.0 * o), 0.18 * uGrade);   // tương phản nhẹ (đường cong S)\n' +
    '  o *= 1.0 - 0.16 * uGrade * smoothstep(0.55, 1.25, length((vUv - 0.5) * vec2(uAsp, 1.0))); }   // vignette\n' +
    ' o += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;   // dither nhẹ: bầu trời, quầng đèn ban đêm không còn bậc màu\n' +
    ' gl_FragColor = vec4(clamp(o, 0.0, 1.0) * al, al); }';
  // FXAA 3.11 rút gọn trên ảnh đã tone map (RGBA premultiplied: pha cả bốn kênh cùng trọng số nên mép vật thể với bầu trời vẫn đúng)
  var fx = 'uniform sampler2D tSrc; uniform vec2 uPx; varying vec2 vUv;\n' +
    'void main(){ vec4 M = texture2D(tSrc, vUv), NW = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uPx), NE = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uPx), SW = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uPx), SE = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uPx);\n' +
    ' const vec3 LU = vec3(0.299, 0.587, 0.114); float lM = dot(M.rgb, LU) + M.a * 0.3, lNW = dot(NW.rgb, LU) + NW.a * 0.3, lNE = dot(NE.rgb, LU) + NE.a * 0.3, lSW = dot(SW.rgb, LU) + SW.a * 0.3, lSE = dot(SE.rgb, LU) + SE.a * 0.3;   // + alpha: mép vật thể/trời cũng là cạnh\n' +
    ' float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));\n' +
    ' vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));\n' +
    ' float dr = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125), rc = 1.0 / (min(abs(dir.x), abs(dir.y)) + dr);\n' +
    ' dir = clamp(dir * rc, vec2(-8.0), vec2(8.0)) * uPx;\n' +
    ' vec4 A = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)) + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)));\n' +
    ' vec4 B = A * 0.5 + 0.25 * (texture2D(tSrc, vUv + dir * -0.5) + texture2D(tSrc, vUv + dir * 0.5));\n' +
    ' float lB = dot(B.rgb, LU) + B.a * 0.3; gl_FragColor = (lB < lMin || lB > lMax) ? A : B; }';
  function sm(frag, u){ return new THREE.ShaderMaterial({ vertexShader:vs, fragmentShader:frag, uniforms:u, depthTest:false, depthWrite:false }); }
  POST.mats = { blur:sm(blur, { tSrc:{ value:null }, uDir:{ value:new THREE.Vector2() } }),
    fin:sm(fin, { tCol:{ value:POST.rt.texture }, tDep:{ value:POST.rt.depthTexture }, tBlur:{ value:POST.a.texture }, uPx:{ value:new THREE.Vector2() }, uNear:{ value:1 }, uFar:{ value:100 },
      uEdge:{ value:0 }, uTilt:{ value:0 }, uBloom:{ value:0 }, uExp:{ value:1 }, uGrade:{ value:GRADE_ON ? 1 : 0 }, uAsp:{ value:1 } }),
    fxaa:sm(fx, { tSrc:{ value:POST.out.texture }, uPx:{ value:new THREE.Vector2() } }) };
  POST.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), POST.mats.fin); POST.quad.frustumCulled = false;
  POST.scene = new THREE.Scene(); POST.scene.add(POST.quad); POST.cam = new THREE.Camera();
  POST.ok = true; resizePost();
}
function resizePost(){ if (!POST.ok) return; var pr = renderer.getPixelRatio(), w = Math.max(4, Math.floor(innerWidth * pr)), h = Math.max(4, Math.floor(innerHeight * pr));
  POST.rt.setSize(w, h); POST.a.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2)); POST.b.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2)); POST.out.setSize(w, h); POST.mats.fin.uniforms.uPx.value.set(1 / w, 1 / h); POST.mats.fin.uniforms.uAsp.value = w / h; POST.mats.fxaa.uniforms.uPx.value.set(1 / w, 1 / h); }
// gọi thay cho renderer.render(scene, camera)
function renderFrame(dist, dt){
  var k = POST.k, want = POST.ok && ST.GOV.level <= 2 && !document.hidden;   // bậc 3 mới tắt hậu kỳ
  var tEdge = want ? 1 - smooth(30, 140, dist) : 0, tTilt = want && !PLAY.on && !reduceMotion ? smooth(90, 260, dist) : 0, tBloom = want ? Math.max(clamp((lampK - 0.2) / 0.6, 0, 1), 0.05) : 0,   // ban ngày bloom rất nhẹ cho chói nắng trên biển, tường trắng
     a = Math.min(1, dt * 3);
  k.edge += (tEdge - k.edge) * a; k.tilt += (tTilt - k.tilt) * a; k.bloom += (tBloom - k.bloom) * a;
  if (!want || k.edge + k.tilt + k.bloom < 0.02){ renderer.render(scene, camera); return; }
  var tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;   // render target: giữ tuyến tính, lượt cuối tự tone map
  renderer.setRenderTarget(POST.rt); renderer.render(scene, camera);
  var B = POST.mats.blur, sx = 1 / POST.a.width, sy = 1 / POST.a.height; POST.quad.material = B;
  B.uniforms.tSrc.value = POST.rt.texture; B.uniforms.uDir.value.set(sx * 2, 0); renderer.setRenderTarget(POST.b); renderer.render(POST.scene, POST.cam);
  B.uniforms.tSrc.value = POST.b.texture; B.uniforms.uDir.value.set(0, sy * 2); renderer.setRenderTarget(POST.a); renderer.render(POST.scene, POST.cam);
  B.uniforms.tSrc.value = POST.a.texture; B.uniforms.uDir.value.set(sx, 0); renderer.setRenderTarget(POST.b); renderer.render(POST.scene, POST.cam);
  B.uniforms.tSrc.value = POST.b.texture; B.uniforms.uDir.value.set(0, sy); renderer.setRenderTarget(POST.a); renderer.render(POST.scene, POST.cam);
  var F = POST.mats.fin.uniforms; F.uNear.value = camera.near; F.uFar.value = camera.far; F.uEdge.value = k.edge * 0.85; F.uTilt.value = k.tilt; F.uBloom.value = k.bloom; F.uExp.value = renderer.toneMappingExposure;
  POST.quad.material = POST.mats.fin;
  var aa = AA_ON && ST.GOV.level === 0;   // FXAA: lượt cuối ra RGBA8 rồi làm mượt ra màn hình (máy đã hạ bậc thì bỏ lượt này)
  renderer.setRenderTarget(aa ? POST.out : null); renderer.render(POST.scene, POST.cam);
  if (aa){ POST.quad.material = POST.mats.fxaa; renderer.setRenderTarget(null); renderer.render(POST.scene, POST.cam); }
  renderer.toneMapping = tm; }

export { POST, initPost, renderFrame, resizePost };
