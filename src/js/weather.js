import { THREE } from './three.js';
import { ST } from '../state.js';
import { clamp, mulberry32 } from './geo.js';
import { anim, applyTod, hemi, renderer, scene, stage, sun, sunDir } from './scene.js';
import { PLAY } from './player.js';
/* ======================= GIỜ THẬT & THỜI TIẾT THẬT ======================= */
// Chế độ "Giờ thật": vị trí mặt trời tính theo giờ hiện tại ở Nha Trang (công thức thiên văn rút gọn của NOAA),
// từ đó chọn sáng / hoàng hôn / đêm và hướng nắng, bóng đổ. Thời tiết lấy từ Open-Meteo (miễn phí, không cần khoá):
// mây, mưa, gió. Không tải được (ví dụ khi đăng làm Claude artifact, mạng bị chặn) thì trời quang, không có lỗi.
ST.WX = { real:true, ok:false, cloud:0.3, rain:0, wind:3, windDeg:null, temp:null, code:null, k:{ cloud:0.3, rain:0 }, next:0, sunEl:45, sunAz:120 };
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
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + WX_LAT + '&longitude=' + WX_LON + '&current=temperature_2m,cloud_cover,precipitation,rain,wind_speed_10m,wind_direction_10m,weather_code&timezone=Asia%2FHo_Chi_Minh';
  fetch(url).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){ var c = j && j.current; if (!c) return;
    ST.WX.ok = true; ST.WX.cloud = clamp((c.cloud_cover || 0) / 100, 0, 1); ST.WX.rain = clamp((c.precipitation || c.rain || 0) / 4, 0, 1); ST.WX.wind = c.wind_speed_10m || 0; ST.WX.windDeg = c.wind_direction_10m == null ? null : c.wind_direction_10m; ST.WX.temp = c.temperature_2m; ST.WX.code = c.weather_code;
    if (ST.WX.rain === 0 && ST.WX.code >= 51 && ST.WX.code <= 99 && ST.WX.code !== 71) ST.WX.rain = 0.25;
    syncWeatherChip(); }).catch(function(){});
}
function syncWeatherChip(){ var el = document.getElementById('wx'); if (!el) return;
  if (!ST.WX.ok){ el.hidden = true; return; } el.hidden = false;
  el.textContent = (ST.WX.temp != null ? Math.round(ST.WX.temp) + '°C · ' : '') + (WX_NAMES[ST.WX.code] || (ST.WX.cloud > 0.6 ? 'Nhiều mây' : 'Trời đẹp')) + ' · gió ' + Math.round(ST.WX.wind) + ' km/h'; }

// mưa: lớp canvas 2D phủ lên khung cảnh (vạch mưa xiên + phủ xám nhẹ). Vạch 3D chỉ rộng 1 px nên gần như không thấy trên điện thoại.
function buildRain(){ var c = document.createElement('canvas'); c.id = 'rain'; c.setAttribute('aria-hidden', 'true'); stage.parentNode.insertBefore(c, stage.nextSibling);
  var rr = mulberry32(77), drops = []; for (var i = 0; i < 260; i++) drops.push({ x:rr(), y:rr(), l:0.5 + rr(), v:0.8 + rr() * 0.5 });
  ST.WX.rainCv = c; ST.WX.drops = drops; }
function drawRain(dt, k, near){ var c = ST.WX.rainCv; if (!c) return; var on = k > 0.02 && near > 0.05;
  if (!on){ if (c.style.display !== 'none'){ c.style.display = 'none'; } return; }
  var dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, Hh = innerHeight; if (c.width !== Math.round(W * dpr)){ c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr); }
  c.style.display = 'block'; var x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, Hh);
  x.fillStyle = 'rgba(70,84,98,' + (0.18 * k * near).toFixed(3) + ')'; x.fillRect(0, 0, W, Hh);
  var n = Math.round(ST.WX.drops.length * Math.min(1, k * 1.3)), L = Hh * 0.045, sl = 0.18;
  x.strokeStyle = 'rgba(225,235,245,' + (0.55 * near).toFixed(3) + ')'; x.lineWidth = 1.3; x.beginPath();
  for (var i = 0; i < n; i++){ var d = ST.WX.drops[i]; d.y += dt * d.v * 1.6; d.x -= dt * d.v * 1.6 * sl * Hh / W; if (d.y > 1){ d.y -= 1.1; d.x = (d.x + 0.37) % 1; } if (d.x < 0) d.x += 1;
    var px = d.x * W, py = d.y * Hh, ll = L * d.l; x.moveTo(px, py); x.lineTo(px - ll * sl, py + ll); }
  x.stroke(); }

function initWeather(){ buildRain(); syncWxBtn(); var b = document.getElementById('btnWx'); if (b) b.addEventListener('click', function(){ setWxMode(WX_MODES[(WX_MODES.indexOf(ST.WX.mode) + 1) % WX_MODES.length]); });
  fetchWeather(); setInterval(fetchWeather, 15 * 60 * 1000); }
// Gọi ở cuối applyTod(): chỉnh ánh sáng theo mây/mưa và hướng nắng thật (applyTod luôn đặt lại giá trị gốc nên không bị cộng dồn)
function weatherLight(){ var k = ST.WX.k, dim = clamp(k.cloud * 0.35 + k.rain * 0.45, 0, 0.75);
  sun.intensity *= 1 - dim; hemi.intensity *= 1 + dim * 0.25; scene.fog.color.lerp(_wxGrey, k.rain * 0.45); renderer.toneMappingExposure *= 1 - k.rain * 0.15;
  if (anim.cloudMat){ anim.cloudMat.color.multiplyScalar(1 - (k.cloud * 0.35 + k.rain * 0.3) * 0.5); anim.cloudMat.emissive.copy(anim.cloudMat.color); }
  realSunDir(); }
ST.weatherLight = weatherLight;
var wxT = 0, _wxGrey = new THREE.Color('#9aa5ad');
// gọi mỗi khung từ frame(): làm mượt mây/mưa, ẩn bớt mây khi trời quang, mưa quanh camera; mỗi giây áp lại ánh sáng; chế độ giờ thật đổi todTarget
function updateWeather(dt, ts, dist){
  var k = ST.WX.k, a = Math.min(1, dt * 0.5), tc = ST.WX.mode === 'rain' ? 0.9 : (ST.WX.mode === 'sun' ? 0.15 : (ST.WX.ok ? ST.WX.cloud : 0.3)), tr = ST.WX.mode === 'rain' ? 0.75 : (ST.WX.mode === 'sun' ? 0 : ST.WX.rain);
  k.cloud += (tc - k.cloud) * a; k.rain += (tr - k.rain) * a;
  wxT -= dt; if (wxT <= 0){ wxT = 1; if (ST.WX.real) ST.todTarget = realTod(); if (Math.abs(ST.tod - ST.todTarget) <= 0.003) applyTod(ST.tod);
    anim.clouds.forEach(function(c, i){ c.visible = i / anim.clouds.length < 0.25 + k.cloud * 0.85; }); }
  drawRain(dt, k.rain, PLAY.on ? 1 : clamp(1.4 - dist / 120, 0, 1));
}

export { initWeather, realTod, sunPos, syncWxBtn, updateWeather };
