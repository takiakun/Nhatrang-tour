// Kiểm các hàm thuần của mưa, ướt, sét (src/js/weather-math.js) bằng Node, không cần trình duyệt:
// bảng cường độ mưa theo mm/h và weather_code, độ ướt (lên ~10 s, khô ~40 s), sét, vận tốc hạt mưa theo gió, hộp mưa và sương.
// Dùng: node tests/weather-check.js (cũng chạy trong npm test)
const M = require('../src/js/weather-math.js');   // ES module (Node ≥ 22.12)
const { rainFromWeather, stormK, wetTarget, wetStep, lightningFlash, LIGHTNING_LEN, lightningGap, thunderDelay, rainVelocity, rainSlantDeg, rainCount, rainBoxScale, rainFog, RAIN_FALL, RAIN_CODE_FLOOR } = M;
let bad = 0; const ok = (c, msg) => { if (!c) bad++; console.log((c ? '✓ ' : '✗ ') + msg); };

// ---- cường độ mưa ----
ok(rainFromWeather(0, 0) === 0 && rainFromWeather(0, 1) === 0 && rainFromWeather(undefined, undefined) === 0, 'trời quang (0 mm, mã 0–3) → không mưa');
ok(rainFromWeather(0, 61) === 0.2 && rainFromWeather(0, 63) === 0.5 && rainFromWeather(0, 65) >= 0.9, 'sàn theo mã: mưa nhẹ 0,2 / vừa 0,5 / to ≥ 0,9 (khi đo được 0 mm)');
ok(Math.abs(rainFromWeather(4, 0) - 0.5) < 1e-9 && rainFromWeather(8, 0) === 1 && rainFromWeather(30, 0) === 1, 'lượng mưa: 4 mm/h → 0,5; ≥ 8 mm/h → 1');
ok(rainFromWeather(0.4, 63) === 0.5 && rainFromWeather(7, 61) > 0.85, 'lấy max(đo được, sàn theo mã): mưa đo lớn hơn sàn thì theo đo');
let mono = true; for (const [a, b] of [[61, 63], [63, 65], [80, 81], [81, 82], [95, 96], [96, 99]]) if (RAIN_CODE_FLOOR[a] > RAIN_CODE_FLOOR[b]) mono = false;
ok(mono, 'sàn tăng theo mức mưa (nhẹ < vừa < to; rào; dông)');
ok(rainFromWeather(0, 71) === 0 && rainFromWeather(0, 75) === 0, 'mã tuyết (71, 75) không có sàn: bỏ ngoại lệ !== 71 cũ, Nha Trang không có tuyết');
ok(rainFromWeather(0, 53) > 0 && rainFromWeather(0, 53) < 0.25 && rainFromWeather(0, 80) >= 0.3 && rainFromWeather(0, 82) > 0.9, 'mưa phùn nhẹ, mưa rào 0,3–0,95');
let all = true; for (let mm = 0; mm <= 20; mm += 0.5) for (const c of [0, 3, 45, 51, 61, 65, 80, 82, 95, 99]){ const r = rainFromWeather(mm, c); if (!(r >= 0 && r <= 1)) all = false; } ok(all, 'cường độ luôn trong [0,1]');
ok(stormK(0.5, 63) === 0 && stormK(0.95, 65) === 1 && stormK(0.8, 63) > 0.4 && stormK(0.8, 63) < 0.6 && stormK(0.1, 99) === 1 && stormK(0.1, 95) > 0, 'mức dông: không sét khi mưa vừa, có khi mưa to hoặc mã dông (95/96/99)');

// ---- ướt ----
ok(wetTarget(0) === 0 && wetTarget(0.2) > 0.3 && wetTarget(0.6) === 1, 'độ ướt mục tiêu: mưa phùn đã ướt, mưa vừa ướt hẳn');
let w = 0, t = 0; while (w < 1 && t < 100){ w = wetStep(w, 1, 0.1); t += 0.1; } ok(Math.abs(t - 10) < 0.3, 'ướt lên tối đa trong ~10 s (' + t.toFixed(1) + ' s)');
t = 0; while (w > 0 && t < 100){ w = wetStep(w, 0, 0.1); t += 0.1; } ok(Math.abs(t - 40) < 0.3, 'khô hẳn sau ~40 s (' + t.toFixed(1) + ' s)');
ok(wetStep(0.5, 0.5, 1) === 0.5 && wetStep(0.9, 0.95, 100) === 0.95 && wetStep(0.1, 0.05, 100) === 0.05, 'độ ướt không vượt mục tiêu');

// ---- sét ----
let peak = 0, dark = 0, n = 0; for (let x = 0; x <= LIGHTNING_LEN + 0.05; x += 0.005){ const f = lightningFlash(x); peak = Math.max(peak, f); if (f > 0.05) n++; if (f < 0 || f > 1.0001) dark = 99; }
ok(peak > 0.9 && peak <= 1 && dark === 0, 'sét nháy sáng tối đa ~1 trong [0,1] (' + peak.toFixed(2) + ')');
ok(lightningFlash(-1) === 0 && lightningFlash(LIGHTNING_LEN + 0.01) === 0 && lightningFlash(0.1) < 0.05, 'sét tắt trước lúc bắt đầu, sau ' + LIGHTNING_LEN + ' s và giữa hai nháy');
let up = 0, prev = 0; for (let x = 0; x < LIGHTNING_LEN; x += 0.005){ const f = lightningFlash(x); if (f > 0.3 && prev <= 0.3) up++; prev = f; } ok(up === 2, 'hai nháy (' + up + ')');
ok(lightningGap(0.01, 0.5) > 1e6 && lightningGap(1, 0) >= 5 && lightningGap(1, 1) <= 30 && lightningGap(0.2, 0.5) > lightningGap(1, 0.5), 'khoảng cách giữa các cú sét: không dông thì không sét, dông mạnh thì dày hơn');
ok(Math.abs(thunderDelay(0) - 300 / 340) < 1e-9 && thunderDelay(1) > 8 && thunderDelay(0.5) > thunderDelay(0), 'sấm trễ 0,9–9 s theo khoảng cách (340 m/s)');

// ---- hạt mưa theo gió ----
const v0 = rainVelocity(0, 1, 0, 0, 1), v28 = rainVelocity(28, 1, 0, 0, 1), v60 = rainVelocity(60, 0, 1, 0, 1), vg = rainVelocity(28, 1, 0, 0.5, 1), vs = rainVelocity(28, 1, 0, 0, 10);
ok(v0[0] === 0 && v0[1] === -RAIN_FALL && v0[2] === 0, 'lặng gió: mưa rơi thẳng đứng');
ok(v28[0] > 0 && v28[2] === 0 && v60[2] > v28[0] && v60[0] === 0, 'mưa trôi theo hướng gió thổi tới và mạnh dần theo tốc độ gió');
ok(vg[0] > v28[0] * 1.3, 'giật làm mưa xiên thêm');
ok(Math.abs(vs[1] / v28[1] - 10) < 1e-9 && Math.abs(vs[0] / v28[0] - 10) < 1e-9, 'tỉ lệ hộp nhân vận tốc (nhìn xa vẫn cùng góc nghiêng)');
const s0 = rainSlantDeg(0, 0), s28 = rainSlantDeg(28, 0), s60 = rainSlantDeg(60, 0), s60g = rainSlantDeg(60, 0.5);
ok(s0 === 0 && s28 > 8 && s28 < 25 && s60 > s28 && s60 < 55 && s60g > s60, 'góc nghiêng vệt mưa: 0° lặng, ' + s28.toFixed(0) + '° ở 28 km/h, ' + s60.toFixed(0) + '° ở 60 km/h, ' + s60g.toFixed(0) + '° khi giật');

// ---- số vệt, hộp, sương ----
ok(rainCount(1400, 0) === 0 && rainCount(1400, 0.01) === 0 && rainCount(1400, 0.05) > 150 && rainCount(1400, 0.8) === 1400 && rainCount(500, 0.4) > 250 && rainCount(500, 0.4) < 500, 'số vệt mưa tăng theo cường độ (0 → 0, phùn → ~12%, ≥ 0,8 → đủ)');
ok(rainBoxScale(0.3) === 0.4 && rainBoxScale(10) > 4 && rainBoxScale(1000) === 40, 'hộp mưa: 20 m khi sát đất, to dần theo khoảng cách camera, trần 40');
const fb = { near: 190, far: 640 }, f0 = rainFog(fb, 0, 200), f1 = rainFog(fb, 1, 200), fl = rainFog({ near: 400, far: 1300 }, 1, 0.5);
ok(f0.near === 190 && f0.far === 640 && f1.far < f0.far && f1.near < f0.near && f1.far > f1.near, 'sương: không mưa giữ nguyên, mưa to thu hẹp (' + f1.near + '–' + f1.far + ')');
ok(fl.far >= 60 && fl.far <= 61 && fl.near >= 2, 'sát đất khi mưa to: tầm nhìn ~60 đơn vị (3 km), cận 2');
console.log(bad ? '[weather] ' + bad + ' mục sai' : '[weather] Mưa, ướt, sét đúng'); process.exit(bad ? 1 : 0);
