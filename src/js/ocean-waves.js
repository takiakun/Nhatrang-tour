/* ======================= SÓNG BIỂN (JS thuần, không dùng three.js) ======================= */
// Tổng các sóng Gerstner (sóng nước sâu), dùng chung cho GPU (ocean.js đẩy đúng các mảng này lên uniform) và CPU
// (thuyền, người bơi, test): cùng một bảng tham số nên hai bên không lệch nhau.
//   toạ độ như phần còn lại của dự án: 1 đơn vị = 50 m, x hướng Đông, z hướng Nam; độ cao y tính từ mặt nước (y = 0).
//   gió: hướng tính theo quy ước khí tượng (độ, từ Bắc theo chiều kim đồng hồ, là hướng gió THỔI TỪ ĐÂU tới), tốc độ km/h.
// Mỗi sóng i: hướng truyền d = (dx, dz), số sóng k = 2π/λ, biên độ A, tần số ω = √(g·k). Với Q = 1:
//   θ = k·(d·p) − ω·t;  độ dịch ngang = d·A·cos θ;  độ cao = A·sin θ;  độ dốc tối đa của sóng i là s = k·A (tổng s phải < 1 để mặt nước không tự cắt).
// Sóng gió (bước sóng ngắn) lớn dần theo tốc độ gió và quay theo hướng gió; sóng lừng (bước sóng dài) đổi chậm, theo hướng mùa.
// Gió mạnh: một biến duy nhất `OC.windK` = smoothstep(0, 75 km/h) (kèm cấp Beaufort `OC.bf`) cho mọi hiệu ứng (sóng, bọt, cây lay, âm thanh, mây, HUD);
// `OC.gust` là cơn giật tức thời (tổng ba sin 0,11 / 0,23 / 0,41 Hz, nhân tỉ lệ giật/gió thật). Tổng độ dốc Σk·A giữ ≤ 0,85 tới ~85 km/h.

export const N_WAVES = 6;
const G_EFF = 0.35;                     // gia tốc rơi quy ra đơn vị bản đồ / s² (thật 9,8/50 = 0,196; tăng nhẹ cho sóng chạy đủ nhanh để nhìn thấy)
// lam: bước sóng (đơn vị), off: lệch hướng so với hướng gió (độ), s: độ dốc k·A ở gió mạnh (≥ 32 km/h), kind: 0 sóng gió ngắn, 1 sóng gió vừa, 2 sóng lừng
const TABLE = [
  { lam:0.42, off: 22, s:0.075, kind:0 },
  { lam:0.85, off:-28, s:0.095, kind:0 },
  { lam:1.7,  off: 10, s:0.110, kind:1 },
  { lam:3.4,  off:-12, s:0.100, kind:1 },
  { lam:8,    off: 18, s:0.045, kind:2 },
  { lam:16,   off:-8,  s:0.028, kind:2 },
];
export const WAVE_LAM = TABLE.map(w => w.lam);
export const WIND_MAX_KMH = 75;          // windK = 1 ở tốc độ này (Beaufort 9: gió bão)
export const BEAUFORT_KMH = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];   // cận dưới của cấp 1..12

// trạng thái hiện tại (đã làm mượt); ocean.js đọc dir/amp/k/om mỗi khung
export const OC = {
  t: 0,                                 // đồng hồ sóng (s), tăng theo dt đã chặn của khung hình
  kmh: 8, from: 45, swellFrom: 45,      // gió làm mượt: tốc độ, hướng thổi từ (độ), hướng sóng lừng
  tKmh: 8, tFrom: 45, tSwell: 45,       // mục tiêu
  windK: 0, bf: 0,                      // cường độ gió 0..1 (từ kmh đã làm mượt) và cấp Beaufort
  gust: 0, gustR: 0, tGustR: 0.3, kmhNow: 8,   // cơn giật tức thời 0..gustR (nhân vào kmh), tỉ lệ giật/gió, tốc độ tức thời km/h
  steep: 0,                             // tổng độ dốc Σk·A (đã gồm hệ số gió), quyết định số vòng lặp đảo ngược dịch ngang
  override: null,                       // { kmh, from, gust } khi ép bằng ?wind=&wdir=&gust= hoặc __nt.setWind
  ph: new Float64Array(N_WAVES),        // pha tích luỹ ω·dt từng sóng (đổi bước sóng theo gió mà sóng không bị trượt pha)
  dir: new Float32Array(N_WAVES * 2),   // dx, dz từng sóng
  k: new Float32Array(N_WAVES),
  amp: new Float32Array(N_WAVES),       // A đã nhân hệ số gió
  om: new Float32Array(N_WAVES),
  depthFn: null,                        // (x, z) -> độ sâu (đơn vị; ≤ 0 là đất), do scene gắn vào
};
TABLE.forEach((w, i) => { OC.k[i] = 2 * Math.PI / w.lam; OC.om[i] = Math.sqrt(G_EFF * OC.k[i]); });
const phaseOf = (i, t) => t === undefined ? OC.ph[i] : OC.om[i] * t;   // t cho trước (kiểm thử, game) thì pha = ω·t; không thì pha tích luỹ

const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerpAngle = (a, b, f) => a + (((b - a) % 360 + 540) % 360 - 180) * f;   // theo đường ngắn nhất, độ

// gió mặc định theo mùa khi không có dữ liệu thời tiết: gió mùa Đông Bắc tháng 10–3, gió Tây Nam/Nam tháng 4–9 (Nha Trang)
export function seasonalWind(date){
  const m = (date || new Date()).getMonth() + 1;   // 1..12
  return (m >= 10 || m <= 3) ? { kmh:14, from:45 } : (m >= 4 && m <= 5 ? { kmh:10, from:150 } : { kmh:12, from:215 });
}
// cường độ gió 0..1: smoothstep(0, 75 km/h). Dùng chung cho sóng, bọt, cây lay, âm thanh, mây, HUD
export function windK(kmh){ return smooth(0, WIND_MAX_KMH, kmh); }
// cấp Beaufort 0..12 theo tốc độ gió (km/h)
export function beaufort(kmh){ let b = 0; while (b < 12 && kmh >= BEAUFORT_KMH[b]) b++; return b; }
// cơn giật 0..1 (nhọn, nhiều lúc lặng) ở thời điểm t (s): tổng ba sin chu kỳ ~9 s, 4,3 s, 2,4 s
export function gustWave(t){ const s = 0.5 * Math.sin(2 * Math.PI * 0.11 * t) + 0.3 * Math.sin(2 * Math.PI * 0.23 * t + 1.3) + 0.2 * Math.sin(2 * Math.PI * 0.41 * t + 2.1), v = clamp(0.5 + 0.5 * s, 0, 1); return v * v; }
// hệ số biên độ của sóng loại kind theo tốc độ gió (km/h). Tới 32 km/h giữ đúng đường cong cũ; từ 32 tới ~85 km/h tiếp tục lên (u = 0 → 1 ở 75 km/h):
// sóng gió ngắn và vừa dốc thêm, sóng lừng cao thêm; tổng Σ s·hệ số ≤ 0,85 ở mọi tốc độ (kiểm trong tests/ocean-check.js)
function windScale(kind, kmh){ const g = clamp(kmh / 32, 0, 1), u = clamp((kmh - 32) / (WIND_MAX_KMH - 32), 0, 1.12);
  return kind === 0 ? 0.12 + 0.88 * Math.pow(g, 1.3) + 0.65 * u : kind === 1 ? 0.2 + 0.8 * g + 0.95 * u : 0.4 + 0.45 * g + 0.5 * u; }
// gió mạnh thì bước sóng gió dài ra (tới ×1,3 ở 75 km/h, cùng độ dốc nên sóng cao thêm); sóng lừng giữ nguyên
function lamStretch(kind, wk){ return kind === 2 ? 1 : 1 + 0.3 * wk; }

// ép gió (kiểm thử, chụp ảnh lặp lại được); null để bỏ ép
export function setWindOverride(kmh, from, gust){ OC.override = kmh == null ? null : { kmh, from, gust:gust == null || !isFinite(gust) ? null : gust }; }
// mục tiêu gió từ cấu hình: weather = { mode, ok, wind, windDeg, gust } (ST.WX). gust = giật tối đa km/h (Open-Meteo wind_gusts_10m), thiếu thì ×1,3.
// Chế độ mưa dùng max(gió thật, 28 km/h): mưa thật gần như luôn kèm gió, nhưng không để lặng gió.
export function windTargetFrom(weather, date){
  if (OC.override) return { kmh:OC.override.kmh, from:OC.override.from, swell:OC.override.from + 15, gust:OC.override.gust != null ? OC.override.gust : OC.override.kmh * 1.3 };
  const sea = seasonalWind(date), real = weather && weather.ok, mode = weather ? weather.mode : 'real';
  const from = real && weather.windDeg != null ? weather.windDeg : sea.from;
  const realKmh = real ? weather.wind : sea.kmh, kmh = Math.max(mode === 'sun' ? 8 : (mode === 'rain' ? Math.max(realKmh, 28) : realKmh), 2);
  const realGust = real && weather.gust != null && isFinite(weather.gust) ? weather.gust : 0;
  const gust = Math.max(mode === 'sun' ? 10 : (realGust > kmh ? realGust : kmh * (mode === 'rain' ? 1.4 : 1.3)), kmh);
  return { kmh, from, swell:sea.from, gust };
}
function rebuild(){
  OC.windK = windK(OC.kmh); OC.bf = beaufort(OC.kmh); let steep = 0;
  for (let i = 0; i < N_WAVES; i++){ const w = TABLE[i], base = w.kind === 2 ? OC.swellFrom : OC.from, to = (base + 180 + w.off) * Math.PI / 180;
    OC.k[i] = 2 * Math.PI / (w.lam * lamStretch(w.kind, OC.windK)); OC.om[i] = Math.sqrt(G_EFF * OC.k[i]);
    OC.dir[i * 2] = Math.sin(to); OC.dir[i * 2 + 1] = -Math.cos(to);
    OC.amp[i] = w.s / OC.k[i] * windScale(w.kind, OC.kmh); steep += OC.k[i] * OC.amp[i]; }   // A = s·hệ số/k nên k·A = s·hệ số: sóng dài ra thì cao thêm, độ dốc giữ nguyên
  OC.steep = steep; }
// một bước thời gian: làm mượt gió về mục tiêu (rate = tốc độ bám, 1/s; snap = đặt ngay) rồi tính lại bảng sóng
export function oceanStep(dt, target, snap){
  if (target){ OC.tKmh = target.kmh; OC.tFrom = target.from; OC.tSwell = target.swell; OC.tGustR = clamp((target.gust != null ? target.gust : target.kmh * 1.3) / Math.max(target.kmh, 3) - 1, 0, 1.2); }
  const a = snap ? 1 : Math.min(1, dt * 0.35), b = snap ? 1 : Math.min(1, dt * 0.06);
  OC.kmh += (OC.tKmh - OC.kmh) * a; OC.from = (lerpAngle(OC.from, OC.tFrom, a) + 360) % 360; OC.swellFrom = (lerpAngle(OC.swellFrom, OC.tSwell, b) + 360) % 360;
  OC.gustR += (OC.tGustR - OC.gustR) * a;
  OC.t += snap ? 0 : dt; rebuild();
  if (!snap) for (let i = 0; i < N_WAVES; i++) OC.ph[i] += OC.om[i] * dt;
  OC.gust = OC.gustR * gustWave(OC.t); OC.kmhNow = OC.kmh * (1 + OC.gust); }
rebuild();
export function windState(){ const to = (OC.from + 180) * Math.PI / 180;
  return { kmh:OC.kmh, from:OC.from, swellFrom:OC.swellFrom, dx:Math.sin(to), dz:-Math.cos(to), height:waveScale(), windK:OC.windK, bf:OC.bf, gust:OC.gust, kmhNow:OC.kmhNow, windKNow:windK(OC.kmhNow), steep:OC.steep }; }
// độ cao sóng đặc trưng tương đối (tổng biên độ), để âm thanh, nhãn, game dùng
export function waveScale(){ let s = 0; for (let i = 0; i < N_WAVES; i++) s += OC.amp[i]; return s; }

// hệ số tắt dần theo độ sâu (đồng bộ với shader): sóng lặng dần khi vào cạn, bằng 0 ở bờ
export function depthFade(depth){ return smooth(0.05, 1.8, depth); }
function fadeAt(x, z){ return OC.depthFn ? depthFade(OC.depthFn(x, z)) : 1; }

// độ dịch (dx, dy, dz) của điểm mặt nước gốc (x, z) tại thời điểm t, chưa nhân hệ số độ sâu
function disp(x, z, t, out){
  let ox = 0, oy = 0, oz = 0;
  for (let i = 0; i < N_WAVES; i++){ const dx = OC.dir[i * 2], dz = OC.dir[i * 2 + 1], th = OC.k[i] * (dx * x + dz * z) - phaseOf(i, t), A = OC.amp[i], c = Math.cos(th) * A;
    ox += dx * c; oz += dz * c; oy += A * Math.sin(th); }
  out[0] = ox; out[1] = oy; out[2] = oz; return out; }
const _o = [0, 0, 0];
// Đảo ngược phép dịch ngang: tìm điểm gốc (px, pz) sao cho (px, pz) + f·D(px, pz) = (x, z). Lặp điểm bất động chỉ co với hệ số ≈ độ dốc tổng Σk·A
// (gió mạnh ~0,8 thì 3 vòng còn sai lệch lớn, đạo hàm sai nhiều), nên dùng Newton với ma trận Jacobi 2×2 giải tích: hội tụ bậc hai, 3 vòng khi lặng, 5 vòng khi dốc tổng > 0,5.
function invert(x, z, t){ let px = x, pz = z, f = 1; const n = OC.steep > 0.5 ? 5 : 3;
  for (let it = 0; it < n; it++){ f = fadeAt(px, pz); let ox = 0, oz = 0, a = 0, b = 0, c = 0;
    for (let i = 0; i < N_WAVES; i++){ const dx = OC.dir[i * 2], dz = OC.dir[i * 2 + 1], th = OC.k[i] * (dx * px + dz * pz) - phaseOf(i, t), A = OC.amp[i], co = Math.cos(th) * A, q = -OC.k[i] * A * Math.sin(th) * f;
      ox += dx * co; oz += dz * co; a += q * dx * dx; b += q * dx * dz; c += q * dz * dz; }
    const rx = px + ox * f - x, rz = pz + oz * f - z, j11 = 1 + a, j22 = 1 + c, det = j11 * j22 - b * b || 1;
    px -= (j22 * rx - b * rz) / det; pz -= (j11 * rz - b * rx) / det; }
  return [px, pz, fadeAt(px, pz)]; }
// độ cao mặt nước (y) tại điểm (x, z) trên bản đồ, tại thời điểm t (mặc định đồng hồ sóng hiện tại)
export function waveHeightAt(x, z, t){
  const [px, pz, f] = invert(x, z, t); disp(px, pz, t, _o); return _o[1] * f; }
// pháp tuyến đơn vị (nx, ny, nz) của mặt nước tại (x, z)
export function waveNormalAt(x, z, t){
  const [px, pz, f] = invert(x, z, t);
  let gx = 0, gz = 0, comp = 0;
  for (let i = 0; i < N_WAVES; i++){ const dx = OC.dir[i * 2], dz = OC.dir[i * 2 + 1], th = OC.k[i] * (dx * px + dz * pz) - phaseOf(i, t), wa = OC.k[i] * OC.amp[i] * f;
    gx += dx * wa * Math.cos(th); gz += dz * wa * Math.cos(th); comp += wa * Math.sin(th); }
  const nx = -gx, ny = Math.max(0.2, 1 - comp), nz = -gz, l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; }
