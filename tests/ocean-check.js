// Kiểm bảng sóng biển (src/js/ocean-waves.js) bằng Node, không cần trình duyệt: độ cao có chu kỳ và giới hạn đúng, về 0 ở bờ,
// sóng đi theo hướng gió, đổi gió thì liên tục, pháp tuyến khớp đạo hàm độ cao. Dùng: node tests/ocean-check.js (cũng chạy trong npm test)
const W = require('../src/js/ocean-waves.js');   // ES module (Node ≥ 22.12)
const { OC, oceanStep, setWindOverride, waveHeightAt, waveNormalAt, windState, depthFade, windTargetFrom, seasonalWind, N_WAVES, WAVE_LAM } = W;
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
console.log(bad ? '[ocean] ' + bad + ' mục sai' : '[ocean] Sóng biển đúng'); process.exit(bad ? 1 : 0);
