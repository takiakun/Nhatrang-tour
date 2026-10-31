// Kiểm bảng sóng biển (src/js/ocean-waves.js) bằng Node, không cần trình duyệt: độ cao có chu kỳ và giới hạn đúng, về 0 ở bờ,
// sóng đi theo hướng gió, đổi gió thì liên tục, pháp tuyến khớp đạo hàm độ cao. Dùng: node tests/ocean-check.js (cũng chạy trong npm test)
const W = require('../src/js/ocean-waves.js');   // ES module (Node ≥ 22.12)
const { OC, oceanStep, setWindOverride, waveHeightAt, waveNormalAt, waveScale, windState, depthFade, windTargetFrom, seasonalWind, windK, beaufort, gustWave, N_WAVES, WAVE_LAM } = W;
let bad = 0; const ok = (c, msg) => { if (!c) bad++; console.log((c ? '✓ ' : '✗ ') + msg); };
const deep = () => 10; OC.depthFn = deep;
const wind = (kmh, from) => { setWindOverride(kmh, from); oceanStep(0, windTargetFrom(null), true); };

wind(20, 45);
let mx = 0, mn = 0, sum = 0, n = 0; for (let i = 0; i < 4000; i++){ const h = waveHeightAt((i * 7.31) % 120, (i * 3.17) % 90, i * 0.37); mx = Math.max(mx, h); mn = Math.min(mn, h); sum += h; n++; }
const A = OC.amp.reduce((a, b) => a + b, 0);
ok(mx <= A + 1e-6 && mn >= -A - 1e-6, 'độ cao nằm trong ±tổng biên độ (' + mn.toFixed(3) + '…' + mx.toFixed(3) + ' ≤ ±' + A.toFixed(3) + ')');
ok(Math.abs(sum / n) < A * 0.25, 'trung bình độ cao gần 0 (' + (sum / n).toFixed(4) + ')');
let steep = 0; for (let i = 0; i < N_WAVES; i++) steep += OC.k[i] * OC.amp[i];
wind(60, 45); steep = 0; for (let i = 0; i < N_WAVES; i++) steep += OC.k[i] * OC.amp[i]; ok(steep < 1, 'tổng độ dốc ở gió mạnh < 1, mặt nước không tự cắt (' + steep.toFixed(2) + ')');
wind(20, 45);

// chu kỳ theo thời gian: sóng i lặp lại sau 2π/ω_i; kiểm với sóng đơn (đặt biên độ các sóng khác về 0)
const amp0 = OC.amp.slice(); for (let i = 0; i < N_WAVES; i++) if (i !== 2) OC.amp[i] = 0;
const T = 2 * Math.PI / OC.om[2], h1 = waveHeightAt(3, 4, 1.7), h2 = waveHeightAt(3, 4, 1.7 + T); ok(Math.abs(h1 - h2) < 1e-4, 'sóng lặp lại sau một chu kỳ ' + T.toFixed(2) + ' s');
// đỉnh sóng đi đúng hướng: tại thời điểm t+Δ, đỉnh dịch theo vector hướng (dx, dz) một quãng c·Δ
const dx = OC.dir[4], dz = OC.dir[5], c = OC.om[2] / OC.k[2], dt = 0.5;
const ph = (x, z, t) => OC.k[2] * (dx * x + dz * z) - OC.om[2] * t;
ok(Math.abs(ph(1, 1, 0) - ph(1 + dx * c * dt, 1 + dz * c * dt, dt)) < 1e-5, 'pha giữ nguyên khi đi theo hướng sóng với vận tốc ω/k (sóng truyền đúng hướng)');
// đạo hàm số của độ cao so với pháp tuyến
let maxErr = 0; for (let i = 0; i < 200; i++){ const x = 5 + i * 0.37, z = 8 + i * 0.21, e = 1e-4, hx = (waveHeightAt(x + e, z, 2.2) - waveHeightAt(x - e, z, 2.2)) / (2 * e), hz = (waveHeightAt(x, z + e, 2.2) - waveHeightAt(x, z - e, 2.2)) / (2 * e), nrm = waveNormalAt(x, z, 2.2);
  const nx = -hx, ny = 1, nz = -hz, l = Math.hypot(nx, ny, nz); maxErr = Math.max(maxErr, Math.hypot(nx / l - nrm[0], ny / l - nrm[1], nz / l - nrm[2])); }
ok(maxErr < 0.02, 'pháp tuyến khớp đạo hàm độ cao (sai số lớn nhất ' + maxErr.toFixed(4) + ')');
for (let i = 0; i < N_WAVES; i++) OC.amp[i] = amp0[i];

// bờ: độ sâu 0 thì sóng tắt hẳn; nông dần thì nhỏ dần
ok(depthFade(0) === 0 && depthFade(0.05) === 0 && depthFade(5) === 1 && depthFade(0.4) > 0 && depthFade(0.4) < depthFade(1.2), 'hệ số độ sâu: 0 ở bờ, tăng dần, 1 ở nước sâu');
OC.depthFn = () => 0; ok(waveHeightAt(10, 10, 3) === 0, 'độ cao = 0 ở bờ');
OC.depthFn = (x, z) => x < 50 ? 0.3 : 10; let nearMax = 0, farMax = 0; for (let i = 0; i < 600; i++){ nearMax = Math.max(nearMax, Math.abs(waveHeightAt(40 + (i % 8), i * 0.9, i * 0.3))); farMax = Math.max(farMax, Math.abs(waveHeightAt(60 + (i % 8), i * 0.9, i * 0.3))); }
ok(nearMax < farMax * 0.5, 'nước cạn sóng nhỏ hơn nước sâu (' + nearMax.toFixed(3) + ' < ' + farMax.toFixed(3) + ')'); OC.depthFn = deep;

// gió: hướng sóng gió theo hướng gió; tăng gió thì sóng cao hơn; đổi hướng liên tục
wind(25, 0);   // gió thổi từ Bắc → sóng chạy về Nam (z dương)
const ws = windState(); ok(ws.dz > 0.99 && Math.abs(ws.dx) < 0.05, 'gió từ Bắc: sóng chạy về hướng Nam (dx=' + ws.dx.toFixed(2) + ', dz=' + ws.dz.toFixed(2) + ')');
wind(90, 90); ok(windState().dx < -0.99, 'gió từ Đông: sóng chạy về hướng Tây');
const lo = (wind(5, 45), windState().height), hi = (wind(40, 45), windState().height); ok(hi > lo * 1.6, 'gió mạnh làm sóng cao hơn (5 km/h → ' + lo.toFixed(3) + ', 40 km/h → ' + hi.toFixed(3) + ')');
setWindOverride(null); wind(10, 10); setWindOverride(25, 350); let prev = OC.from, worst = 0; for (let i = 0; i < 200; i++){ oceanStep(0.05, windTargetFrom(null)); const d = Math.abs(((OC.from - prev) % 360 + 540) % 360 - 180); worst = Math.max(worst, d); prev = OC.from; }
ok(worst < 2 && Math.abs(((OC.from - 350) % 360 + 540) % 360 - 180) < 3, 'đổi hướng gió 10°→350° mượt, đi đường ngắn (bước lớn nhất ' + worst.toFixed(2) + '°/bước, kết thúc ' + OC.from.toFixed(0) + '°)');
setWindOverride(null);
const s1 = seasonalWind(new Date(2026, 0, 15)), s2 = seasonalWind(new Date(2026, 7, 15)); ok(s1.from === 45 && s2.from > 150 && s2.from < 250, 'gió mặc định theo mùa: Đông Bắc mùa đông, Tây Nam mùa hè');
const tg = windTargetFrom({ mode:'rain', ok:true, wind:12, windDeg:200 }, new Date(2026, 5, 1)); ok(tg.kmh === 28 && tg.from === 200, 'chế độ mưa: gió 28 km/h, hướng thật');
ok(WAVE_LAM.every((v, i, a) => !i || v > a[i - 1]), 'bước sóng tăng dần trong bảng');

// ---- gió mạnh (PR mưa-gió): windK, Beaufort, độ dốc tới 85 km/h, giật, pha liên tục, CPU khớp công thức GPU ----
ok(waveScale() >= 0 && (wind(40, 45), waveScale()) < (wind(60, 45), waveScale()) && waveScale() < (wind(75, 45), waveScale()), 'chiều cao sóng tăng đều 40 → 60 → 75 km/h (60 km/h khác 40 km/h)');
const sc = {}; for (const k of [40, 60]){ wind(k, 45); sc[k] = waveScale(); } ok(sc[60] > sc[40] * 1.15, 'waveScale(60) > waveScale(40) (' + sc[60].toFixed(3) + ' > ' + sc[40].toFixed(3) + ')');
let mono = true, pk = -1, pb = -1; for (let k = 0; k <= 130; k += 1){ const w = windK(k), b = beaufort(k); if (w < pk - 1e-12 || b < pb) mono = false; pk = w; pb = b; }
ok(mono && windK(0) === 0 && windK(75) === 1 && windK(130) === 1 && windK(37.5) > 0.45 && windK(37.5) < 0.55, 'windK đơn điệu, 0 ở lặng gió, 1 từ 75 km/h (windK(37,5) = ' + windK(37.5).toFixed(2) + ')');
ok(beaufort(0) === 0 && beaufort(3) === 1 && beaufort(28) === 4 && beaufort(40) === 6 && beaufort(75) === 9 && beaufort(200) === 12, 'cấp Beaufort đúng cận (0→0, 28→4, 40→6, 75→9, 200→12)');
let worstSteep = 0, steepAt = 0; for (let k = 0; k <= 90; k += 2){ wind(k, 45); if (OC.steep > worstSteep){ worstSteep = OC.steep; steepAt = k; } }
ok(worstSteep <= 0.85 + 1e-9, 'tổng độ dốc Σk·A ≤ 0,85 ở mọi gió 0–90 km/h (lớn nhất ' + worstSteep.toFixed(3) + ' ở ' + steepAt + ' km/h)');
wind(80, 45); let s80 = 0; for (let i = 0; i < N_WAVES; i++) s80 += OC.k[i] * OC.amp[i]; ok(s80 < 0.9, 'độ dốc ở 80 km/h < 0,9 (' + s80.toFixed(3) + ')');
// pháp tuyến, độ cao CPU (đảo ngược dịch ngang) so với công thức "GPU": GPU không đảo ngược mà tính tại điểm gốc rồi đẩy đỉnh đi, nên lấy điểm gốc b, tính vị trí dịch p, hỏi CPU tại p
for (const k of [30, 60, 80]){ wind(k, 45); let eN = 0, eH = 0; const dd = [0, 0, 0];
  for (let i = 0; i < 400; i++){ const bx = 10 + (i * 0.731) % 30, bz = 6 + (i * 0.417) % 20, t = 3.3 + i * 0.01; let ox = 0, oz = 0, oy = 0, gx = 0, gz = 0, comp = 0;
    for (let j = 0; j < N_WAVES; j++){ const dx = OC.dir[j * 2], dz = OC.dir[j * 2 + 1], th = OC.k[j] * (dx * bx + dz * bz) - OC.om[j] * t, A = OC.amp[j], wa = OC.k[j] * A;
      ox += dx * Math.cos(th) * A; oz += dz * Math.cos(th) * A; oy += Math.sin(th) * A; gx += dx * wa * Math.cos(th); gz += dz * wa * Math.cos(th); comp += wa * Math.sin(th); }
    const ny = Math.max(0.2, 1 - comp), l = Math.hypot(gx, ny, gz), cpu = waveNormalAt(bx + ox, bz + oz, t);
    eN = Math.max(eN, Math.hypot(-gx / l - cpu[0], ny / l - cpu[1], -gz / l - cpu[2])); eH = Math.max(eH, Math.abs(oy - waveHeightAt(bx + ox, bz + oz, t))); }
  ok(eN < 0.1 && eH < 0.012, 'CPU khớp công thức GPU ở ' + k + ' km/h: pháp tuyến lệch ≤ ' + eN.toFixed(3) + ' (< 0,1), độ cao lệch ≤ ' + eH.toFixed(4) + ' (< 0,012)'); }
// so với đạo hàm số của độ cao CPU: công thức pháp tuyến Gerstner nhiều sóng chỉ gần đúng (sai số bậc hai theo độ dốc), nên ngưỡng nới dần theo gió; đảo ngược dịch ngang (Newton) đã hội tụ
const derivErr = k => { wind(k, 45); let e = 0; for (let i = 0; i < 200; i++){ const x = 12 + i * 0.173, z = 9 + i * 0.121, d = 1e-4, hx = (waveHeightAt(x + d, z, 2.2) - waveHeightAt(x - d, z, 2.2)) / (2 * d), hz = (waveHeightAt(x, z + d, 2.2) - waveHeightAt(x, z - d, 2.2)) / (2 * d), n = waveNormalAt(x, z, 2.2), l = Math.hypot(hx, 1, hz);
  e = Math.max(e, Math.hypot(-hx / l - n[0], 1 / l - n[1], -hz / l - n[2])); } return e; };
const e30 = derivErr(30), e70 = derivErr(70); ok(e30 < 0.08 && e70 < 0.22, 'pháp tuyến CPU khớp đạo hàm số của độ cao (30 km/h lệch ≤ ' + e30.toFixed(3) + ', 70 km/h ≤ ' + e70.toFixed(3) + ')');
// pha tích luỹ: gió tăng dần 20 → 60 km/h (bước sóng dài ra) thì độ cao tại một điểm không nhảy (không có "trượt pha")
setWindOverride(null); wind(20, 45); setWindOverride(60, 45); let hPrev = waveHeightAt(20, 20), hJump = 0; for (let i = 0; i < 400; i++){ oceanStep(0.05, windTargetFrom(null)); const h = waveHeightAt(20, 20); hJump = Math.max(hJump, Math.abs(h - hPrev)); hPrev = h; }
ok(hJump < 0.05, 'đổi gió 20 → 60 km/h: độ cao một điểm liên tục (bước nhảy lớn nhất ' + hJump.toFixed(4) + ')'); setWindOverride(null);
// giật: gustWave trong [0,1]; OC.gust ≤ tỉ lệ giật; mục tiêu giật lấy từ dữ liệu thật; chế độ mưa không để lặng gió
let gmin = 9, gmax = -9; for (let i = 0; i < 3000; i++){ const g = gustWave(i * 0.1); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
ok(gmin >= 0 && gmax <= 1 && gmax - gmin > 0.6, 'gustWave nằm trong [0,1] và dao động rõ (' + gmin.toFixed(2) + '…' + gmax.toFixed(2) + ')');
const tg2 = windTargetFrom({ mode:'real', ok:true, wind:20, windDeg:10, gust:38 }, new Date(2026, 5, 1)); ok(tg2.kmh === 20 && tg2.gust === 38, 'giật lấy từ dữ liệu thật (wind_gusts_10m)');
const tg3 = windTargetFrom({ mode:'rain', ok:true, wind:50, windDeg:10, gust:70 }, new Date(2026, 5, 1)); ok(tg3.kmh === 50 && tg3.gust === 70, 'chế độ mưa: gió thật lớn hơn 28 km/h thì giữ nguyên (max(gió thật, 28))');
setWindOverride(30, 45, 50); oceanStep(0, windTargetFrom(null), true); let gm = 0, gok = true; for (let i = 0; i < 400; i++){ oceanStep(0.1, windTargetFrom(null)); gm = Math.max(gm, OC.gust); if (OC.gust > OC.gustR + 1e-9 || OC.gust < 0) gok = false; }
ok(gok && Math.abs(OC.gustR - (50 / 30 - 1)) < 0.02 && gm > 0.3 && windState().kmhNow >= windState().kmh, 'OC.gust ∈ [0, gustR], gustR = giật/gió − 1 (' + OC.gustR.toFixed(2) + '), cơn giật cao nhất ' + gm.toFixed(2)); setWindOverride(null);
console.log(bad ? '[ocean] ' + bad + ' mục sai' : '[ocean] Sóng biển đúng'); process.exit(bad ? 1 : 0);
