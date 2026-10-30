import { ST } from '../state.js';
import { BD, BW, BX0, BZ0 } from './geo.js';
import { LM, LITE, lampK } from './scene.js';
import { PL, PLAY } from './player.js';
/* ======================= MINI MAP (chế độ lái) ======================= */
// Cắt từ canvas mặt đất (ST.groundCv, đã có đường, nước, vỉa hè, bùng binh, ray) bằng một phép biến đổi 2D: quay theo hướng camera
// (hướng nhìn lên trên) hoặc giữ Bắc lên trên (chạm vào bản đồ để đổi). Vẽ nhẹ: ≤ 20 Hz (máy yếu 10 Hz), chỉ khi có gì đổi.
//   toạ độ thế giới → màn hình: sx = dx·cosθ − dz·sinθ, sy = dx·sinθ + dz·cosθ (θ = góc phương vị camera) = ctx.rotate(θ)
var RADIUS = 9;                        // bán kính hiển thị, đơn vị bản đồ (450 m)
var MM = { cv:null, ctx:null, size:0, north:false, last:0, key:'', dots:[] };
ST.navTarget = -1;   // chỉ số địa danh làm đích (chọn thẻ địa danh rồi bấm Lái xe, hoặc chạm một chấm trên mini map); -1 là không có

function sizeCanvas(){ var cv = MM.cv; if (!cv) return; var css = cv.clientWidth || 130, S = Math.round(css * Math.min(window.devicePixelRatio || 1, 2));
  if (cv.width !== S){ cv.width = S; cv.height = S; MM.key = ''; } MM.size = S; MM.ctx = cv.getContext('2d'); }

// vẽ một khung: (x, z) là vị trí người chơi, az là góc phương vị camera, yaw là hướng người chơi, tgt = { x, z } địa danh đang chọn (hoặc null)
function drawMinimap(x, z, az, yaw, tgt, night){
  var ctx = MM.ctx, S = MM.size; if (!ctx || !S) return; var c = S / 2, th = MM.north ? 0 : az, k = c / RADIUS;   // px canvas trên một đơn vị bản đồ
  ctx.save(); ctx.clearRect(0, 0, S, S); ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#2b7fa6'; ctx.fillRect(0, 0, S, S);   // ngoài bàn bản đồ: màu nước
  var gcv = ST.groundCv;
  if (gcv){ var s = k * BW / gcv.width;   // px canvas trên một px texture
    ctx.save(); ctx.translate(c, c); ctx.rotate(th); ctx.scale(s, s); ctx.translate(-(x - BX0) * gcv.width / BW, -(z - BZ0) * gcv.height / BD);
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(gcv, 0, 0); ctx.restore(); }
  if (night > 0.02){ ctx.fillStyle = 'rgba(8,16,40,' + (0.5 * night).toFixed(3) + ')'; ctx.fillRect(0, 0, S, S); }
  var cs = Math.cos(th), sn = Math.sin(th), to = function(wx, wz){ var dx = wx - x, dz = wz - z; return [c + (dx * cs - dz * sn) * k, c + (dx * sn + dz * cs) * k]; };
  // địa danh trong tầm: chấm nhỏ (bỏ khi bộ điều tốc đã hạ cấp)
  MM.dots.length = 0;
  if (!ST.GOV || ST.GOV.level < 2){ ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = 'rgba(20,40,60,.8)'; ctx.lineWidth = Math.max(1, S / 90);
    for (var i = 0; i < LM.length; i++){ var a = LM[i].anchor; if (!a) continue; var q = to(a.x, a.z); if (Math.hypot(q[0] - c, q[1] - c) > c - 4) continue;
      MM.dots.push({ i:i, x:q[0], y:q[1] }); ctx.beginPath(); ctx.arc(q[0], q[1], S / 60, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } }
  // địa danh đang chọn: vòng cam; ngoài tầm thì mũi tên ở mép chỉ hướng kèm khoảng cách
  if (tgt){ var t = to(tgt.x, tgt.z), d = Math.hypot(t[0] - c, t[1] - c), ang = Math.atan2(t[1] - c, t[0] - c);
    ctx.fillStyle = '#ff6a2b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, S / 60);
    if (d < c - S * 0.08){ ctx.beginPath(); ctx.arc(t[0], t[1], S / 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else { var e = c - S * 0.07, ex = c + Math.cos(ang) * e, ey = c + Math.sin(ang) * e, m = S / 20;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(m * 1.1, 0); ctx.lineTo(-m, -m * 0.95); ctx.lineTo(-m * 0.45, 0); ctx.lineTo(-m, m * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      var km = Math.hypot(tgt.x - x, tgt.z - z) * 0.05, txt = km >= 1 ? km.toFixed(1).replace('.', ',') + ' km' : Math.round(km * 100) * 10 + ' m';
      ctx.font = '700 ' + Math.round(S / 10) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = S / 30; ctx.strokeStyle = 'rgba(10,30,50,.85)'; ctx.fillStyle = '#fff';
      var tx = c + Math.cos(ang) * (e - S * 0.2), ty = c + Math.sin(ang) * (e - S * 0.2); ctx.strokeText(txt, tx, ty); ctx.fillText(txt, tx, ty); } }
  // chữ B (hướng Bắc) ở mép
  var bx = c + Math.sin(th) * (c - S * 0.09), by = c - Math.cos(th) * (c - S * 0.09);
  ctx.font = '800 ' + Math.round(S / 9) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = S / 28; ctx.strokeStyle = 'rgba(10,30,50,.9)'; ctx.fillStyle = '#ffd35c'; ctx.strokeText('B', bx, by); ctx.fillText('B', bx, by);
  // mũi tên người chơi ở tâm: hướng đi so với hướng "lên" của bản đồ
  ctx.translate(c, c); ctx.rotate(Math.PI - yaw + th); var r = S / 15;
  ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * 0.9, r * 0.95); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.9, r * 0.95); ctx.closePath();
  ctx.fillStyle = '#ff6a2b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, S / 55); ctx.lineJoin = 'round'; ctx.stroke(); ctx.fill();
  ctx.restore(); }

// gọi mỗi khung từ frame(): vẽ lại khi người chơi dịch, camera quay, địa danh chọn đổi hoặc trời tối dần, tối đa 20 Hz (LITE 10 Hz)
function updateMinimap(now){
  if (!MM.cv || !PLAY.on || !PL) return;
  var L = ST.navTarget >= 0 ? LM[ST.navTarget] : null, tgt = L ? L.anchor : null;
  if (tgt && Math.hypot(tgt.x - PL.x, tgt.z - PL.z) < 0.9){ ST.navTarget = -1; tgt = null; }   // tới nơi (~45 m) thì bỏ đích if (now - MM.last < (LITE ? 100 : 50)) return;
  var az = ST.controls.getAzimuthalAngle(), night = Math.round(lampK * 20) / 20, key = (PL.x * 50 | 0) + ',' + (PL.z * 50 | 0) + ',' + Math.round((MM.north ? 0 : az) * 120) + ',' + Math.round(PL.yaw * 60) + ',' + (tgt ? tgt.x | 0 : '') + (tgt ? tgt.z | 0 : '') + ',' + night + ',' + MM.north;
  if (key === MM.key) return; MM.key = key; MM.last = now; drawMinimap(PL.x, PL.z, az, PL.yaw, tgt, night); }

function initMinimap(){
  MM.cv = document.getElementById('minimap'); if (!MM.cv) return; sizeCanvas();
  // chạm gần một chấm địa danh thì đặt (hoặc bỏ) đích; chạm chỗ khác thì đổi giữa quay theo hướng nhìn và Bắc lên trên
  MM.cv.addEventListener('click', function(e){ var r = MM.cv.getBoundingClientRect(), f = MM.size / r.width, px = (e.clientX - r.left) * f, py = (e.clientY - r.top) * f, best = null, bd = MM.size * 0.11;
    MM.dots.forEach(function(d){ var q = Math.hypot(d.x - px, d.y - py); if (q < bd){ bd = q; best = d; } });
    if (best) ST.navTarget = ST.navTarget === best.i ? -1 : best.i; else MM.north = !MM.north; MM.key = ''; });
  addEventListener('resize', sizeCanvas);
  // ghi nguồn bắt buộc khi thước tỉ lệ bị ẩn lúc lái: nút "i" mở khung nguyên văn ghi nguồn
  var b = document.getElementById('btnInfo'), pop = document.getElementById('attribPop'), src = document.querySelector('.attrib');
  if (b && pop && src){ pop.innerHTML = src.innerHTML;
    b.addEventListener('click', function(){ pop.hidden = !pop.hidden; b.setAttribute('aria-expanded', String(!pop.hidden)); }); } }
// khi vào chế độ lái canvas mới hiện ra, đo lại kích thước
function showMinimap(){ if (!MM.cv) return; sizeCanvas(); MM.key = ''; var pop = document.getElementById('attribPop'); if (pop) pop.hidden = true; }

export { MM, drawMinimap, initMinimap, showMinimap, updateMinimap };
