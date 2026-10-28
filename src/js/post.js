/* ======================= HẬU KỲ (viền nét, sa bàn tilt-shift, toả sáng ban đêm) ======================= */
// Không dùng EffectComposer: một render target (kèm độ sâu) + một chuỗi mờ độ phân giải 1/4 + một lượt ghép cuối.
//  - Viền: dò cạnh trên độ sâu tuyến tính, tô nét màu chì, đậm khi nhìn gần (phong cách tranh vẽ, giữ màu cũ)
//  - Sa bàn: xem toàn cảnh thì trên/dưới khung hình mờ dần (lấy từ ảnh mờ 1/4), giống chụp mô hình thu nhỏ
//  - Toả sáng: ban đêm phần sáng của ảnh mờ được cộng lại quanh đèn
// Lượt cuối tự làm tone mapping ACES + sRGB vì r147 chỉ làm việc đó khi vẽ thẳng ra màn hình.
// Chỉ bật khi có ít nhất một hiệu ứng; máy yếu (LITE) hoặc bộ điều tốc đã hạ chất lượng thì vẽ thẳng như cũ.
var POST = { ok:false, on:false, rt:null, a:null, b:null, quad:null, scene:null, cam:null, mats:null, k:{ edge:0, tilt:0, bloom:0 } };
function initPost(){
  if (LITE || !renderer.capabilities.isWebGL2 || !THREE.DepthTexture) return;
  var type = THREE.HalfFloatType, opt = { type:type, depthBuffer:true };
  POST.rt = new THREE.WebGLRenderTarget(4, 4, opt); POST.rt.depthTexture = new THREE.DepthTexture(4, 4); POST.rt.depthTexture.type = THREE.UnsignedIntType;
  POST.a = new THREE.WebGLRenderTarget(4, 4, { type:type, depthBuffer:false }); POST.b = new THREE.WebGLRenderTarget(4, 4, { type:type, depthBuffer:false });
  var vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  var blur = 'uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;\n' +
    'void main(){ vec4 c = texture2D(tSrc, vUv) * 0.2270; vec2 o1 = uDir * 1.3846, o2 = uDir * 3.2308;\n' +
    ' c += (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.3162 + (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.0703; gl_FragColor = c; }';
  var fin = 'uniform sampler2D tCol, tDep, tBlur; uniform vec2 uPx; uniform float uNear, uFar, uEdge, uTilt, uBloom, uExp; varying vec2 vUv;\n' +
    'float lin(vec2 p){ float z = texture2D(tDep, p).x * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }\n' +
    'vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }\n' +
    'vec3 aces(vec3 c){ const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));\n' +
    ' const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));\n' +
    ' c *= uExp / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0); }\n' +
    'vec3 srgb(vec3 c){ return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c)); }\n' +
    'void main(){ vec3 col = texture2D(tCol, vUv).rgb, bl = texture2D(tBlur, vUv).rgb;\n' +
    ' if (uTilt > 0.0){ float t = smoothstep(0.12, 0.45, abs(vUv.y - 0.52)) * uTilt; col = mix(col, bl, t); }\n' +
    ' if (uEdge > 0.0){ float d = lin(vUv), s = 0.0;\n' +
    '  s += abs(lin(vUv + vec2(uPx.x, 0.0)) - d) + abs(lin(vUv - vec2(uPx.x, 0.0)) - d) + abs(lin(vUv + vec2(0.0, uPx.y)) - d) + abs(lin(vUv - vec2(0.0, uPx.y)) - d);\n' +
    '  float e = smoothstep(0.035, 0.09, s / d) * uEdge * (1.0 - smoothstep(25.0, 120.0, d)); col = mix(col, col * vec3(0.32, 0.33, 0.38), e); }\n' +
    ' if (uBloom > 0.0) col += max(bl - 0.75, 0.0) * 1.6 * uBloom;\n' +
    ' gl_FragColor = vec4(srgb(aces(col)), 1.0); }';
  function sm(frag, u){ return new THREE.ShaderMaterial({ vertexShader:vs, fragmentShader:frag, uniforms:u, depthTest:false, depthWrite:false }); }
  POST.mats = { blur:sm(blur, { tSrc:{ value:null }, uDir:{ value:new THREE.Vector2() } }),
    fin:sm(fin, { tCol:{ value:POST.rt.texture }, tDep:{ value:POST.rt.depthTexture }, tBlur:{ value:POST.a.texture }, uPx:{ value:new THREE.Vector2() }, uNear:{ value:1 }, uFar:{ value:100 },
      uEdge:{ value:0 }, uTilt:{ value:0 }, uBloom:{ value:0 }, uExp:{ value:1 } }) };
  POST.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), POST.mats.fin); POST.quad.frustumCulled = false;
  POST.scene = new THREE.Scene(); POST.scene.add(POST.quad); POST.cam = new THREE.Camera();
  POST.ok = true; resizePost();
}
function resizePost(){ if (!POST.ok) return; var pr = renderer.getPixelRatio(), w = Math.max(4, Math.floor(innerWidth * pr)), h = Math.max(4, Math.floor(innerHeight * pr));
  POST.rt.setSize(w, h); POST.a.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2)); POST.b.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2)); POST.mats.fin.uniforms.uPx.value.set(1 / w, 1 / h); }
// gọi thay cho renderer.render(scene, camera)
function renderFrame(dist, dt){
  var k = POST.k, want = POST.ok && GOV.level === 0 && !document.hidden;
  var tEdge = want ? 1 - smooth(30, 140, dist) : 0, tTilt = want && !PLAY.on && !reduceMotion ? smooth(90, 260, dist) : 0, tBloom = want ? clamp((lampK - 0.2) / 0.6, 0, 1) : 0, a = Math.min(1, dt * 3);
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
  POST.quad.material = POST.mats.fin; renderer.setRenderTarget(null); renderer.render(POST.scene, POST.cam); renderer.toneMapping = tm; }
