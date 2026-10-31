import { THREE } from './three.js';
import { ST } from '../state.js';
import { clamp, mulberry32 } from './geo.js';
import { LITE, anim, applyTod, camera, hemi, renderer, scene, setWet, stage, sun, sunDir } from './scene.js';
import { PLAY } from './player.js';
import { thunder } from './audio.js';
import { OC } from './ocean-waves.js';
import { LIGHTNING_LEN, lightningFlash, lightningGap, rainBoxScale, rainCount, rainFog, rainFromWeather, rainVelocity, stormK, thunderDelay, wetStep, wetTarget } from './weather-math.js';
/* ======================= GIỜ THẬT & THỜI TIẾT THẬT ======================= */
// Chế độ "Giờ thật": vị trí mặt trời tính theo giờ hiện tại ở Nha Trang (công thức thiên văn rút gọn của NOAA),
// từ đó chọn sáng / hoàng hôn / đêm và hướng nắng, bóng đổ. Thời tiết lấy từ Open-Meteo (miễn phí, không cần khoá):
// mây, mưa, gió. Không tải được (ví dụ khi đăng làm Claude artifact, mạng bị chặn) thì trời quang, không có lỗi.
ST.WX = { real:true, ok:false, cloud:0.3, rain:0, wind:3, windDeg:null, gust:null, temp:null, code:null, rainOv:null, lightning:true, k:{ cloud:0.3, rain:0 }, next:0, sunEl:45, sunAz:120 };
var WX_LAT = 12.24, WX_LON = 109.19;
// chế độ thời tiết người dùng chọn: 'real' theo Open-Meteo, 'sun' trời nắng, 'rain' mưa (lưu trong localStorage)
var WX_MODES = ['real', 'sun', 'rain'], WX_MODE_NAMES = { real:'Thời tiết thật', sun:'Trời nắng', rain:'Trời mưa' };
ST.WX.mode = 'real'; try { var _wm = localStorage.getItem('nt-wx'); if (WX_MODES.indexOf(_wm) >= 0) ST.WX.mode = _wm; } catch (e){}
function setWxMode(m){ ST.WX.mode = m; try { localStorage.setItem('nt-wx', m); } catch (e){} syncWxBtn(); }
function syncWxBtn(){ var t = document.getElementById('btnWxText'), b = document.getElementById('btnWx'); if (!t) return; t.textContent = WX_MODE_NAMES[ST.WX.mode];
  if (b) b.setAttribute('aria-label', 'Đổi thời tiết, hiện: ' + WX_MODE_NAMES[ST.WX.mode]); }

// độ cao (el) và phương vị (az, tính từ Bắc theo chiều kim đồng hồ) của mặt trời, đơn vị độ
function sunPos(date){
  var d2r = Math.PI / 180, jd = date.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0;
  var L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * d2r, lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * d2r, eps = (23.439 - 0.0000004 * n) * d2r;
  var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  var gmst = (18.697374558 + 24.06570982441908 * n) % 24, ha = ((gmst * 15 + WX_LON) * d2r - ra), lat = WX_LAT * d2r;
  var el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
  return { el:el / d2r, az:((az / d2r) + 360) % 360 }; }
// mặt trời cao → ban ngày (0); quanh lúc mọc/lặn → hoàng hôn (1); dưới −10° → đêm (2)
function todFromSun(el){ return el >= 12 ? 0 : (el >= -2 ? (12 - el) / 14 : (el >= -10 ? 1 + (-2 - el) / 8 : 2)); }
function realTod(){ var s = sunPos(new Date()); ST.WX.sunEl = s.el; ST.WX.sunAz = s.az; return todFromSun(s.el); }

// hướng nắng thật (khi mặt trời còn trên đường chân trời) đè lên hướng mặc định của bảng màu
function realSunDir(){ if (!ST.WX.real || ST.WX.sunEl < -2) return; var e = Math.max(ST.WX.sunEl, 4) * Math.PI / 180, a = ST.WX.sunAz * Math.PI / 180;
  var v = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize(), k = clamp((ST.WX.sunEl + 2) / 10, 0, 1);
  sunDir.lerp(v, k).normalize(); }

var WX_NAMES = { 0:'Trời quang', 1:'Ít mây', 2:'Mây rải rác', 3:'Nhiều mây', 45:'Sương mù', 48:'Sương mù', 51:'Mưa phùn', 53:'Mưa phùn', 55:'Mưa phùn', 61:'Mưa nhỏ', 63:'Mưa vừa', 65:'Mưa to',
  80:'Mưa rào', 81:'Mưa rào', 82:'Mưa rào to', 95:'Dông', 96:'Dông', 99:'Dông' };
function fetchWeather(){
  if (!window.fetch) return;
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + WX_LAT + '&longitude=' + WX_LON + '&current=temperature_2m,cloud_cover,precipitation,rain,showers,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code&timezone=Asia%2FHo_Chi_Minh';
  fetch(url).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){ var c = j && j.current; if (!c) return;
    ST.WX.ok = true; ST.WX.cloud = clamp((c.cloud_cover || 0) / 100, 0, 1); ST.WX.wind = c.wind_speed_10m || 0; ST.WX.windDeg = c.wind_direction_10m == null ? null : c.wind_direction_10m; ST.WX.temp = c.temperature_2m; ST.WX.code = c.weather_code;
    ST.WX.gust = c.wind_gusts_10m == null ? null : c.wind_gusts_10m;
    ST.WX.rain = rainFromWeather(Math.max(c.precipitation || 0, c.rain || 0, c.showers || 0), ST.WX.code);   // mm/h → 0..1, có sàn theo weather_code (weather-math.js)
    syncWeatherChip(); }).catch(function(){});
}
function syncWeatherChip(){ var el = document.getElementById('wx'); if (!el) return;
  if (!ST.WX.ok){ el.hidden = true; return; } el.hidden = false;
  el.textContent = (ST.WX.temp != null ? Math.round(ST.WX.temp) + '°C · ' : '') + (WX_NAMES[ST.WX.code] || (ST.WX.cloud > 0.6 ? 'Nhiều mây' : 'Trời đẹp')); }   // gió có chip riêng (#windchip, theo OC) nên không lặp ở đây

/* ---------- mưa 3D ---------- */
// Vệt mưa nằm trong cảnh: InstancedBufferGeometry, mỗi vệt là một quad quay về camera, kéo dài theo vận tốc tương đối (mưa − camera). Mọi chuyển động nằm trong
// vertex shader: vị trí cố định trong thế giới, trôi theo vận tốc mưa rồi cuộn vòng (mod) trong một hộp quanh camera nên không cần cập nhật từng vệt.
// Ba lớp: xa (mảnh, mờ, hộp lớn), vừa, gần (dày, sáng, hộp nhỏ). Hộp ~20 m khi camera sát đất (0,4 đơn vị), to dần theo khoảng cách camera
// (rainBoxScale) kèm tốc độ và độ dài vệt nhân theo, nên nhìn từ xa vẫn thấy mưa với cùng số vệt. Tâm hộp nằm trên trục nhìn của camera (lớp xa ở ~0,8× khoảng cách tới
// tâm nhìn, lớp gần ở 0,3×) để vệt luôn trong khung hình. Bề rộng tối thiểu ~1,3 px trên màn hình, mảnh hơn thì mờ bớt (không dưới 50%).
var RN = { mesh:null, n:0, camPrev:new THREE.Vector3(), vel:new THREE.Vector3(), has:false };
var RU = { uCam:{ value:new THREE.Vector3() }, uFwd:{ value:new THREE.Vector3(0, 0, -1) }, uS:{ value:0.4 }, uD:{ value:0.2 }, uVel:{ value:new THREE.Vector3(0, -0.3, 0) }, uCamVel:{ value:new THREE.Vector3() },
  uT:{ value:0 }, uPx:{ value:0.001 }, uLen:{ value:0.06 }, uCol:{ value:new THREE.Color('#dfe9f2') }, uAlpha:{ value:0.5 } };
var RAIN_VS = [
  'uniform vec3 uCam; uniform vec3 uFwd; uniform float uS; uniform float uD; uniform vec3 uVel; uniform vec3 uCamVel; uniform float uT; uniform float uPx; uniform float uLen;',
  'attribute vec2 aQ; attribute vec4 aR; varying vec2 vQ; varying float vA;',
  'void main(){',
  '  float tier = aR.w; float ts = step(0.5, tier) + step(0.85, tier);',                       // 0 xa, 1 vừa, 2 gần
  '  float bs = uS * (ts < 0.5 ? 1.0 : (ts < 1.5 ? 0.6 : 0.3));',
  '  float sp = (ts < 0.5 ? 0.9 : (ts < 1.5 ? 1.0 : 1.12)) * (0.92 + 0.16 * fract(tier * 37.0));',
  '  vec3 v = uVel * sp;',
  '  vec3 c = uCam + uFwd * uD * (ts < 0.5 ? 1.0 : (ts < 1.5 ? 0.6 : 0.3));',                    // tâm hộp trên trục nhìn: lớp gần sát camera, lớp xa tới gần điểm nhìn
  '  vec3 w = aR.xyz * bs + v * uT;',
  '  vec3 rel = mod(w - c + 0.5 * bs, bs) - 0.5 * bs;',
  '  vec3 head = c + rel;',
  '  float edge = max(max(abs(rel.x), abs(rel.y)), abs(rel.z)) / bs;',
  '  vec3 vr = v - uCamVel; float vl = max(length(vr), 1e-5); vec3 tail = head - vr / vl * (vl * uLen);',
  '  vec3 vh = (viewMatrix * vec4(head, 1.0)).xyz; vec3 vt = (viewMatrix * vec4(tail, 1.0)).xyz;',
  '  vec3 cr = cross(vt - vh, vh); float cl = length(cr); vec3 lat = cl > 1e-9 ? cr / cl : vec3(1.0, 0.0, 0.0);',
  '  float depth = max(-vh.z, 0.001);',
  '  float w0 = 0.00022 * (uS / 0.4) * (ts < 0.5 ? 0.7 : (ts < 1.5 ? 1.0 : 1.7));',
  '  float wid = max(w0, uPx * depth * 1.3);',
  '  vec3 vp = mix(vt, vh, aQ.y) + lat * aQ.x * wid * mix(0.45, 1.0, aQ.y);',
  '  vQ = aQ;',
  '  vA = (1.0 - smoothstep(0.38, 0.5, edge)) * clamp(w0 / wid, 0.5, 1.0) * (ts < 0.5 ? 0.6 : (ts < 1.5 ? 0.85 : 1.0)) * smoothstep(0.005, 0.04, depth / (uS / 0.4));',
  '  gl_Position = projectionMatrix * vec4(vp, 1.0);',
  '}'].join('\n');
var RAIN_FS = ['uniform vec3 uCol; uniform float uAlpha; varying vec2 vQ; varying float vA;',
  'void main(){ float e = 1.0 - abs(vQ.x); float a = e * e * mix(0.12, 1.0, vQ.y) * vA * uAlpha; if (a < 0.004) discard;',
  '  gl_FragColor = vec4(uCol, a);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}'].join('\n');
function buildRain(){
  // lớp phủ tối nền (và nháy sáng khi có sét): thẻ div, không còn canvas vẽ vạch 2D
  var c = document.createElement('div'); c.id = 'rain'; c.setAttribute('aria-hidden', 'true'); stage.parentNode.insertBefore(c, stage.nextSibling); ST.WX.rainEl = c;
  var N = LITE ? 500 : 1400, rr = mulberry32(77), R = new Float32Array(N * 4); for (var i = 0; i < N * 4; i++) R[i] = rr();
  var g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)); g.setAttribute('aQ', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1)); g.setAttribute('aR', new THREE.InstancedBufferAttribute(R, 4)); g.instanceCount = N;
  var m = new THREE.ShaderMaterial({ uniforms:RU, vertexShader:RAIN_VS, fragmentShader:RAIN_FS, transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false });
  var mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; scene.add(mesh); RN.mesh = mesh; RN.n = N; ST.rainMesh = mesh; }
// gọi mỗi khung TRƯỚC khi vẽ (camera đã ở vị trí cuối): số vệt theo cường độ mưa, hộp theo khoảng cách camera, vận tốc mưa theo gió và giật, màu theo sương
function updateRain(dt, ts){
  var m = RN.mesh; if (!m) return; var k = ST.WX.k.rain, cnt = rainCount(RN.n, k);
  if (cnt === 0){ m.visible = false; RN.has = false; return; }
  var cp = camera.position, dist = cp.distanceTo(ST.controls.target), S = rainBoxScale(dist);
  if (RN.has && dt > 0 && dt < 0.5){ _rv.copy(cp).sub(RN.camPrev).divideScalar(dt); if (_rv.length() > 3) _rv.setLength(3); RN.vel.lerp(_rv, Math.min(1, dt * 8)); } else RN.vel.set(0, 0, 0);
  RN.camPrev.copy(cp); RN.has = true;
  var to = (OC.from + 180) * Math.PI / 180, v = rainVelocity(OC.kmh, Math.sin(to), -Math.cos(to), OC.gust, S / 0.4);
  m.visible = true; m.geometry.instanceCount = cnt; camera.getWorldDirection(_fw);
  RU.uCam.value.copy(cp); RU.uFwd.value.copy(_fw); RU.uS.value = S; RU.uD.value = Math.max(dist * 0.8, S * 0.5); RU.uVel.value.set(v[0], v[1], v[2]); RU.uCamVel.value.copy(RN.vel).multiplyScalar(0.35 * Math.min(1, 0.4 / S + 0.2));
  RU.uT.value = ts % 1000; RU.uPx.value = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, innerHeight * renderer.getPixelRatio());
  RU.uCol.value.copy(scene.fog.color).multiplyScalar(1.2).addScalar(0.1 + LN.flash * 0.5); RU.uAlpha.value = (0.35 + 0.45 * k) * (1 + LN.flash); }
var _rv = new THREE.Vector3(), _fw = new THREE.Vector3();

/* ---------- sét và sấm ---------- */
// mức dông: chế độ mưa 0,5 (thỉnh thoảng có sét), thật thì theo mưa to / mã dông; sét làm hemi và lớp phủ nháy sáng hai lần (~0,3 s), sấm đến sau vài giây (audio.js)
var LN = { t:-1, next:15, flash:0, added:0, rng:mulberry32(9137), storm:0 };
function updateLightning(dt, k){
  var W = ST.WX, storm = W.rainOv != null ? stormK(W.rainOv) : (W.mode === 'rain' ? 0.5 : (W.mode === 'sun' ? 0 : stormK(W.rain, W.code))); LN.storm = k.rain > 0.5 ? storm : 0;
  if (!W.lightning) LN.storm = 0;
  if (LN.t < 0){ LN.next -= dt; if (LN.next <= 0 && LN.storm > 0.01){ LN.t = 0; LN.next = lightningGap(LN.storm, LN.rng());
      if (typeof thunder === 'function') thunder(thunderDelay(LN.rng()), 0.35 + 0.65 * LN.storm); }
    else if (LN.storm <= 0.01 && LN.next < 8) LN.next = 8 + LN.rng() * 10; }   // chưa có dông: chờ vài giây rồi mới có sét đầu tiên khi dông bắt đầu
  var f = 0; if (LN.t >= 0){ f = lightningFlash(LN.t); LN.t += dt; if (LN.t > LIGHTNING_LEN){ LN.t = -1; f = 0; } }
  LN.flash = f; var add = f * 3.4; hemi.intensity += add - LN.added; LN.added = add; }
ST.strike = function(){ LN.t = 0; LN.next = 20; thunder(0.4, 0.8); };   // thử: __nt.strike()

function initWeather(){ buildRain(); syncWxBtn();
  try { var rq = parseFloat(new URLSearchParams(location.search).get('rain')); if (isFinite(rq)) ST.WX.rainOv = clamp(rq, 0, 1); } catch (e){}   // ?rain=<0..1> ép cường độ mưa (thử, chụp ảnh) var b = document.getElementById('btnWx'); if (b) b.addEventListener('click', function(){ setWxMode(WX_MODES[(WX_MODES.indexOf(ST.WX.mode) + 1) % WX_MODES.length]); });
  fetchWeather(); setInterval(fetchWeather, 15 * 60 * 1000); }
// Gọi ở cuối applyTod(): chỉnh ánh sáng theo mây/mưa và hướng nắng thật (applyTod luôn đặt lại giá trị gốc nên không bị cộng dồn)
function weatherLight(){ var k = ST.WX.k, dim = clamp(k.cloud * 0.35 + k.rain * 0.45, 0, 0.75);
  sun.intensity *= 1 - dim; hemi.intensity *= 1 + dim * 0.25; scene.fog.color.lerp(_wxGrey, k.rain * 0.65); renderer.toneMappingExposure *= 1 - k.rain * 0.15; LN.added = 0;   // applyTod vừa đặt lại hemi nên bỏ phần nháy sét đã cộng
  if (anim.cloudMat){ anim.cloudMat.color.multiplyScalar(1 - (k.cloud * 0.35 + k.rain * 0.3) * 0.5); anim.cloudMat.emissive.copy(anim.cloudMat.color); }
  ST.wetSky.value.copy(scene.fog.color).multiplyScalar(0.9).addScalar(0.05);   // vũng nước phản chiếu màu trời xám (≈ màu sương)
  realSunDir(); }
ST.weatherLight = weatherLight;
var wxT = 0, _wxGrey = new THREE.Color('#9aa5ad'), skyRain = 0, wetApplied = 0, tintKey = '';
// gọi mỗi khung từ frame(): làm mượt mây/mưa, độ ướt, sương, sét; ẩn bớt mây khi trời quang; mỗi giây áp lại ánh sáng; chế độ giờ thật đổi todTarget.
// dt >= 1 là cú đặt ngay (hook __nt.setWx / setRain): mọi thứ nhảy thẳng tới đích thay vì nội suy
function updateWeather(dt, ts, dist){
  var W = ST.WX, k = W.k, snap = dt >= 1, a = Math.min(1, dt * 0.5), tc = W.mode === 'rain' ? 0.9 : (W.mode === 'sun' ? 0.15 : (W.ok ? W.cloud : 0.3)),
    tr = W.rainOv != null ? W.rainOv : (W.mode === 'rain' ? 0.8 : (W.mode === 'sun' ? 0 : W.rain));
  if (W.rainOv != null) tc = Math.max(tc, 0.25 + 0.65 * W.rainOv);
  k.cloud += (tc - k.cloud) * a; k.rain += (tr - k.rain) * a;
  var wv = snap ? wetTarget(k.rain) : wetStep(ST.wetU.value, wetTarget(k.rain), dt);   // ướt lên trong ~10 s, khô trong ~40 s
  ST.wetU.value = wv; if (Math.abs(wv - wetApplied) > 0.02 || (wv < 0.001 && wetApplied > 0) || (wv > 0.999 && wetApplied < 1)){ wetApplied = wv; setWet(wv); }
  // sương dày dần khi mưa; nền trời xám dần (applyTod vẽ lại khi mưa đổi > 0,02)
  var ff = rainFog(ST.fogBase, k.rain, dist); scene.fog.near = ff.near; scene.fog.far = ff.far;
  var redraw = Math.abs(k.rain - skyRain) > 0.02 || (k.rain < 0.005 && skyRain > 0); if (redraw){ skyRain = k.rain; applyTod(ST.tod); }
  wxT -= dt; if (wxT <= 0){ wxT = 1; if (W.real) ST.todTarget = realTod(); if (Math.abs(ST.tod - ST.todTarget) <= 0.003 && !redraw) applyTod(ST.tod);
    anim.clouds.forEach(function(c, i){ c.visible = i / anim.clouds.length < 0.25 + k.cloud * 0.85; }); }
  updateLightning(dt, k);
  // lớp phủ: xám nhẹ khi mưa, trắng xanh khi có sét (chỉ ghi DOM khi giá trị đổi)
  var el = W.rainEl; if (el){ var near = PLAY.on ? 1 : clamp(1.4 - dist / 120, 0, 1), tint = 0.16 * k.rain * near, fl = LN.flash * 0.55, key = fl > 0.01 ? 'f' + fl.toFixed(2) : 't' + tint.toFixed(3);
    if (key !== tintKey){ tintKey = key; if (fl > 0.01){ el.style.display = 'block'; el.style.background = 'rgba(225,232,255,' + fl.toFixed(3) + ')'; } else if (tint > 0.004){ el.style.display = 'block'; el.style.background = 'rgba(70,84,98,' + tint.toFixed(3) + ')'; } else el.style.display = 'none'; } }
}
// đặt ngay cường độ mưa 0..1 (null: bỏ ép), cho thử và chụp ảnh
function setRain(v){ ST.WX.rainOv = v == null ? null : clamp(v, 0, 1); updateWeather(2, 0, camera.position.distanceTo(ST.controls.target)); }

export { initWeather, realTod, setRain, sunPos, syncWxBtn, updateRain, updateWeather };
