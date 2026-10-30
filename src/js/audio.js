import { ST } from '../state.js';
import { OC } from './ocean-waves.js';
import { DIST, clamp } from './geo.js';
import { anim, roadPoint } from './scene.js';
import { KS, KV, PL, PLAY, groundAt } from './player.js';
/* ======================= ÂM THANH (Web Audio, sinh bằng code) ======================= */
// Không có file âm thanh: sóng biển, gió, phố xá, còi xe, chim, dế, tiếng xe máy, bước chân, té nước đều tổng hợp từ nhiễu và dao động.
// Âm lượng từng lớp theo vị trí "người nghe" (nhân vật khi lái, tâm camera khi xem bản đồ) và độ cao camera.
var AU = { ctx:null, on:false, want:true, layers:null, nextHorn:0, nextBird:0, nextTrain:0, lastPhase:0, lastMode:'', lastVy:0, eng:null };
try { AU.want = localStorage.getItem('nt-sound') !== 'off'; } catch (e){}

function noiseBuf(ctx, kind){ var n = ctx.sampleRate * 3, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), last = 0, p = [0, 0, 0, 0, 0, 0, 0];
  for (var i = 0; i < n; i++){ var w = Math.random() * 2 - 1;
    if (kind === 'brown'){ last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === 'pink'){ p[0] = 0.99886 * p[0] + w * 0.0555179; p[1] = 0.99332 * p[1] + w * 0.0750759; p[2] = 0.969 * p[2] + w * 0.153852; p[3] = 0.8665 * p[3] + w * 0.3104856; p[4] = 0.55 * p[4] + w * 0.5329522; p[5] = -0.7616 * p[5] - w * 0.016898;
      d[i] = (p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + w * 0.5362) * 0.11; p[6] = w * 0.115926; }
    else d[i] = w; }
  return b; }
function loopSrc(buf){ var s = AU.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.start(0, Math.random() * 2); return s; }
function chain(nodes){ for (var i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
function gainN(v){ var g = AU.ctx.createGain(); g.gain.value = v; return g; }
function filt(type, f, q){ var b = AU.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
function lfo(freq, depth, target){ var o = AU.ctx.createOscillator(), g = gainN(depth); o.frequency.value = freq; o.connect(g); g.connect(target); o.start(); return o; }

function startAudio(){
  if (AU.ctx){ if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  var ctx = AU.ctx = new AC(), L = AU.layers = {};
  ctx.onstatechange = function(){ if (ctx.state !== 'running' && AU.want) armAudio(); };   // iOS: 'interrupted' sau cuộc gọi, khoá màn hình
  var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(ctx.destination);
  // giảm dải cao cho đỡ rè (các lớp nền đều làm từ nhiễu)
  var shelf = filt('highshelf', 5000); shelf.gain.value = -12; shelf.connect(comp);
  AU.master = gainN(0); AU.master.connect(shelf); AU.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
  var white = noiseBuf(ctx, 'white'), pink = noiseBuf(ctx, 'pink'), brown = noiseBuf(ctx, 'brown'); AU.white = white;
  // sóng biển: nhiễu nâu qua lọc thấp, biên độ dâng hạ chậm như sóng vỗ
  L.sea = gainN(0); var swell = gainN(0.55); lfo(0.11, 0.35, swell.gain); lfo(0.067, 0.2, swell.gain);
  var seaF = filt('lowpass', 620, 0.4); lfo(0.11, 260, seaF.frequency);
  chain([loopSrc(brown), seaF, swell, L.sea, AU.master]);
  var surf = gainN(0.1); lfo(0.11, 0.16, surf.gain); chain([loopSrc(white), filt('bandpass', 2400, 0.5), surf, L.sea]);
  // gió: nhiễu trắng qua lọc dải, tần số trôi chậm
  L.wind = gainN(0); var wf = filt('bandpass', 520, 0.7); lfo(0.05, 240, wf.frequency); var wg = gainN(0.5); lfo(0.08, 0.3, wg.gain);
  chain([loopSrc(white), wf, filt('lowpass', 1600), wg, L.wind, AU.master]);
  // phố: tiếng xe cộ ầm ầm ở xa
  L.city = gainN(0); var cf = filt('lowpass', 750, 0.5); lfo(0.13, 180, cf.frequency); chain([loopSrc(pink), cf, filt('highpass', 80), L.city, AU.master]);
  // dế ban đêm: dao động cao, ngắt nhịp
  L.night = gainN(0); var cr = ctx.createOscillator(); cr.type = 'triangle'; cr.frequency.value = 4300; var crg = gainN(0); lfo(28, 0.5, crg.gain); var crg2 = gainN(0.5); lfo(0.7, 0.5, crg2.gain);
  cr.start(); chain([cr, crg, crg2, filt('bandpass', 4300, 6), L.night, AU.master]);
  // mưa: nhiễu hồng lọc dải cao, rì rào; âm lượng theo lượng mưa thật (weather.js)
  L.rain = gainN(0); chain([loopSrc(pink), filt('highpass', 900), filt('lowpass', 7000), L.rain, AU.master]);
  L.fx = gainN(1); L.fx.connect(AU.master);
  // xe máy: răng cưa + vuông, nổ "bành bạch" bằng điều biên theo vòng tua
  var e = AU.eng = { g:gainN(0), o1:ctx.createOscillator(), o2:ctx.createOscillator(), am:gainN(0.6), f:filt('lowpass', 700, 2) };
  e.o1.type = 'sawtooth'; e.o2.type = 'square'; e.o1.frequency.value = 38; e.o2.frequency.value = 19;
  var o2g = gainN(0.35); e.o2.connect(o2g); o2g.connect(e.am); e.o1.connect(e.am);
  e.pop = ctx.createOscillator(); e.pop.type = 'square'; e.pop.frequency.value = 19; var popG = gainN(0.4); e.pop.connect(popG); popG.connect(e.am.gain);
  chain([e.am, e.f, e.g, AU.master]); e.o1.start(); e.o2.start(); e.pop.start();
}
function setSound(on){ AU.want = on; try { localStorage.setItem('nt-sound', on ? 'on' : 'off'); } catch (e){}
  if (on){ startAudio(); if (AU.master) AU.master.gain.setTargetAtTime(0.9, AU.ctx.currentTime, 0.3); }
  else if (AU.master) AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.15);
  AU.on = on && !!AU.ctx; syncSoundBtn(); }
function syncSoundBtn(){ var b = document.getElementById('btnSound'); if (!b) return; var on = AU.want; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Tắt âm thanh' : 'Bật âm thanh');
  document.getElementById('sndOn').style.display = on ? '' : 'none'; document.getElementById('sndOff').style.display = on ? 'none' : ''; }
// Trình duyệt chỉ cho phát âm thanh sau thao tác đầu tiên của người dùng.
// Safari iOS chỉ mở khoá âm thanh ở touchend / click (không phải pointerdown khi bắt đầu kéo bản đồ), nên nghe mọi loại thao tác,
// phát một mẫu im lặng để mở khoá, và chỉ gỡ nghe khi AudioContext đã thật sự chạy. Bị hệ thống ngắt (cuộc gọi…) thì nghe lại.
var AU_EV = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
function armAudio(){ function go(){ if (!AU.want) return; startAudio(); AU.on = !!AU.ctx; if (!AU.ctx) return;
    try { var b = AU.ctx.createBufferSource(); b.buffer = AU.ctx.createBuffer(1, 1, 22050); b.connect(AU.ctx.destination); b.start(0); } catch (e){}
    if (AU.ctx.state === 'running') AU_EV.forEach(function(t){ removeEventListener(t, go, true); });
    else if (AU.ctx.resume) AU.ctx.resume().then(function(){ if (AU.ctx.state === 'running') AU_EV.forEach(function(t){ removeEventListener(t, go, true); }); }, function(){}); }
  AU_EV.forEach(function(t){ addEventListener(t, go, true); });
  if (!AU.armed){ AU.armed = true; document.addEventListener('visibilitychange', function(){ if (!document.hidden && AU.ctx && AU.ctx.state !== 'running') armAudio(); }); } }

/* ---------- âm thanh ngắn ---------- */
function env(g, t, a, peak, d){ g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function burst(t, f, q, peak, d, type){ var s = AU.ctx.createBufferSource(); s.buffer = AU.white; var b = filt(type || 'bandpass', f, q), g = gainN(0); env(g, t, 0.004, peak, d); chain([s, b, g, AU.layers.fx]); s.start(t, Math.random() * 2); s.stop(t + d + 0.05); }
function tone(t, f0, f1, peak, d, type, dest){ var o = AU.ctx.createOscillator(), g = gainN(0); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d); env(g, t, 0.01, peak, d); chain([o, g, dest || AU.layers.fx]); o.start(t); o.stop(t + d + 0.05); }
// còi xe máy kiểu "bíp bíp": hai nốt vuông lệch nhau, lọc cho đục
function horn(t, vol, n){ var f = 380 + Math.random() * 140; for (var i = 0; i < (n || 2); i++){ var tt = t + i * 0.2, b = filt('lowpass', 1800, 1), g = gainN(0); env(g, tt, 0.01, vol, 0.13); b.connect(g); g.connect(AU.layers.fx);
  [f, f * 1.26].forEach(function(ff){ var o = AU.ctx.createOscillator(); o.type = 'square'; o.frequency.value = ff; o.connect(b); o.start(tt); o.stop(tt + 0.18); }); } }
function chirp(t, vol){ var f = 2600 + Math.random() * 2400, n = 2 + (Math.random() * 4 | 0); for (var i = 0; i < n; i++) tone(t + i * 0.09, f, f * (0.7 + Math.random() * 0.6), vol, 0.06); }
function splash(t, vol){ burst(t, 900, 0.6, vol, 0.35, 'lowpass'); burst(t + 0.03, 2600, 0.8, vol * 0.5, 0.25); }
function trainHorn(t, vol){ [311, 370].forEach(function(f){ var o = AU.ctx.createOscillator(), g = gainN(0), b = filt('lowpass', 1400); o.type = 'sawtooth'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); chain([o, b, g, AU.layers.fx]); o.start(t); o.stop(t + 1.6); }); }
function honk(){ if (AU.on && AU.ctx) horn(AU.ctx.currentTime, 0.32, 2); }

/* ---------- cập nhật mỗi khung hình ---------- */
function envAt(x, z){ var water = 0, city = 0, wild = 0, n = 0;
  for (var a = 0; a < 8; a++) for (var r = 1; r <= 3; r++){ var px = x + Math.cos(a * 0.785) * r * 1.4, pz = z + Math.sin(a * 0.785) * r * 1.4, h = ST.G.hAt(px, pz), zn = ST.G.zoneAt(px, pz); n++;
    if (h < 0) water++; else if (zn >= 10 && DIST[zn - 10].style !== 'resort') city += DIST[zn - 10].style === 'city' ? 1 : 0.45; else if (h > 0.9) wild++; }
  return { water:water / n, city:city / n, wild:wild / n }; }
function updateAudio(dt, dist){
  if (!AU.on || !AU.ctx || AU.ctx.state !== 'running') return;
  var ctx = AU.ctx, t = ctx.currentTime, L = AU.layers, play = PLAY.on && PL;
  var lx = play ? PL.x : ST.controls.target.x, lz = play ? PL.z : ST.controls.target.z, E = envAt(lx, lz);
  var near = play ? 1 : clamp(1.25 - dist / 140, 0.08, 1), high = play ? 0 : clamp((dist - 40) / 260, 0, 1);
  var night = clamp(ST.tod - 1, 0, 1);
  var shore = clamp(E.water * (1 - E.water) * 4.2, 0, 1), sea = clamp(shore * 0.85 + E.water * 0.3, 0, 1);
  if (play && PL.mode === 'swim') sea = 1;
  function set(g, v){ g.gain.setTargetAtTime(v, t, 0.4); }
  set(L.sea, (0.12 + 0.75 * sea * near + 0.18 * high) * 0.55 * (0.7 + 0.55 * clamp(OC.kmh / 32, 0, 1.3)));   // sóng ồn hơn khi gió mạnh
  set(L.wind, (0.05 + 0.3 * high + 0.25 * E.wild * near + (play && PL.mode === 'bike' ? clamp(Math.abs(PL.bike.speed) / (2.4 * KV), 0, 1) * 0.25 : 0)) * (0.8 + clamp(OC.kmh / 25, 0, 1.2)));  // gió (km/h; thật hoặc theo chế độ thời tiết) làm gió to nhỏ
  set(L.city, E.city * near * (0.5 - 0.3 * night) * 0.6);
  set(L.night, night * (0.03 + 0.08 * (1 - E.city) * near) * (1 - ST.WX.k.rain));
  set(L.rain, ST.WX.k.rain * (0.15 + 0.35 * near));
  // còi xe ngẫu nhiên trong phố, nhiều hơn khi ở gần
  if (t > AU.nextHorn){ AU.nextHorn = t + 1.2 + Math.random() * (7 - 5 * E.city); if (E.city > 0.15 && near > 0.3 && Math.random() < 0.8) horn(t, 0.02 + 0.07 * E.city * near * Math.random(), 1 + (Math.random() < 0.6)); }
  // chim hót ban ngày ở đồi, vườn, ven biển
  if (t > AU.nextBird){ AU.nextBird = t + 0.6 + Math.random() * 3.5; var bird = (1 - night) * (0.25 + E.wild + 0.3 * (1 - E.city)) * near; if (Math.random() < bird) chirp(t, 0.012 + 0.025 * Math.random() * near); }
  // tàu hoả kéo còi khi chạy gần
  var tr = anim.train && ST.RAIL_S ? roadPoint(ST.RAIL_S, anim.train.s, {}) : null; if (tr && t > AU.nextTrain){ var td = Math.hypot(tr.x - lx, tr.z - lz); if (td < 14 && anim.train.wait <= 0){ trainHorn(t, 0.05 * clamp(1.4 - td / 14, 0, 1) * near); AU.nextTrain = t + 25 + Math.random() * 20; } }
  // xe máy của nhân vật
  var e = AU.eng, sp = play && PL.mode === 'bike' ? Math.abs(PL.bike.speed) : 0, rpm = 19 + sp / KV * 26 + (play && PL.mode === 'bike' && (ST.keys.ShiftLeft || ST.keys.ShiftRight || ST.boostBtn) ? 8 : 0);
  e.o1.frequency.setTargetAtTime(rpm * 2, t, 0.12); e.o2.frequency.setTargetAtTime(rpm, t, 0.12); e.pop.frequency.setTargetAtTime(rpm, t, 0.12); e.f.frequency.setTargetAtTime(500 + sp * 700, t, 0.15);
  set(e.g, play && PL.mode === 'bike' ? 0.05 + clamp(sp / (2.4 * KV), 0, 1) * 0.07 : 0);
  if (play){
    if (AU.lastMode && AU.lastMode !== PL.mode){
      if (PL.mode === 'swim') splash(t, 0.35);
      else if (PL.mode === 'bike'){ tone(t, 60, 140, 0.15, 0.25, 'sawtooth'); tone(t + 0.22, 140, 70, 0.1, 0.3, 'sawtooth'); }
      else if (AU.lastMode === 'bike') tone(t, 90, 40, 0.08, 0.4, 'sawtooth'); }
    // bước chân (đi, chạy) và quạt nước (bơi), theo nhịp hoạt ảnh
    if (PL.mode !== 'bike'){ var step = Math.floor(PL.phase / Math.PI);
      if (step !== AU.lastPhase && PL.speed > 0.03 * KV){ var onSand = ST.G.hAt(PL.x, PL.z) < 0.36 && ST.G.zoneAt(PL.x, PL.z) < 10;
        if (PL.mode === 'swim') burst(t, 1300, 0.7, 0.07, 0.22, 'lowpass'); else if (PL.y <= groundAt(PL.x, PL.z).y + 0.01 * KS) burst(t, onSand ? 700 : 1700, onSand ? 0.7 : 1.4, onSand ? 0.06 : 0.09, onSand ? 0.12 : 0.06); }
      AU.lastPhase = step;
      if (AU.lastVy < -0.3 * KS && PL.vy === 0) burst(t, 300, 0.8, 0.14, 0.12, 'lowpass'); }
    AU.lastVy = PL.vy; AU.lastMode = PL.mode;
  } else AU.lastMode = '';
}

export { AU, armAudio, honk, setSound, syncSoundBtn, updateAudio };
