/* ======================= SÓNG BIỂN (JS thuần, không dùng three.js) ======================= */
// Tổng các sóng Gerstner (sóng nước sâu), dùng chung cho GPU (ocean.js đẩy đúng các mảng này lên uniform) và CPU
// (thuyền, người bơi, test): cùng một bảng tham số nên hai bên không lệch nhau.
//   toạ độ như phần còn lại của dự án: 1 đơn vị = 50 m, x hướng Đông, z hướng Nam; độ cao y tính từ mặt nước (y = 0).
//   gió: hướng tính theo quy ước khí tượng (độ, từ Bắc theo chiều kim đồng hồ, là hướng gió THỔI TỪ ĐÂU tới), tốc độ km/h.
// Mỗi sóng i: hướng truyền d = (dx, dz), số sóng k = 2π/λ, biên độ A, tần số ω = √(g·k). Với Q = 1:
//   θ = k·(d·p) − ω·t;  độ dịch ngang = d·A·cos θ;  độ cao = A·sin θ;  độ dốc tối đa của sóng i là s = k·A (tổng s phải < 1 để mặt nước không tự cắt).
// Sóng gió (bước sóng ngắn) lớn dần theo tốc độ gió và quay theo hướng gió; sóng lừng (bước sóng dài) đổi chậm, theo hướng mùa.

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

// trạng thái hiện tại (đã làm mượt); ocean.js đọc dir/amp/k/om mỗi khung
export const OC = {
  t: 0,                                 // đồng hồ sóng (s), tăng theo dt đã chặn của khung hình
  kmh: 8, from: 45, swellFrom: 45,      // gió làm mượt: tốc độ, hướng thổi từ (độ), hướng sóng lừng
  tKmh: 8, tFrom: 45, tSwell: 45,       // mục tiêu
  override: null,                       // { kmh, from } khi ép bằng ?wind=&wdir= hoặc __nt.setWind
  dir: new Float32Array(N_WAVES * 2),   // dx, dz từng sóng
  k: new Float32Array(N_WAVES),
  amp: new Float32Array(N_WAVES),       // A đã nhân hệ số gió
  om: new Float32Array(N_WAVES),
  depthFn: null,                        // (x, z) -> độ sâu (đơn vị; ≤ 0 là đất), do scene gắn vào
};
TABLE.forEach((w, i) => { OC.k[i] = 2 * Math.PI / w.lam; OC.om[i] = Math.sqrt(G_EFF * OC.k[i]); });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerpAngle = (a, b, f) => a + (((b - a) % 360 + 540) % 360 - 180) * f;   // theo đường ngắn nhất, độ

// gió mặc định theo mùa khi không có dữ liệu thời tiết: gió mùa Đông Bắc tháng 10–3, gió Tây Nam/Nam tháng 4–9 (Nha Trang)
export function seasonalWind(date){
  const m = (date || new Date()).getMonth() + 1;   // 1..12
  return (m >= 10 || m <= 3) ? { kmh:14, from:45 } : (m >= 4 && m <= 5 ? { kmh:10, from:150 } : { kmh:12, from:215 });
}
// hệ số biên độ của sóng loại kind theo tốc độ gió (km/h): sóng ngắn lên nhanh theo gió, sóng lừng chỉ phụ thuộc nhẹ
function windScale(kind, kmh){ const g = clamp(kmh / 32, 0, 1.3);
  return kind === 0 ? 0.12 + 0.88 * Math.pow(g, 1.3) : kind === 1 ? 0.2 + 0.8 * Math.pow(g, 1.0) : 0.4 + 0.45 * g; }

// ép gió (kiểm thử, chụp ảnh lặp lại được); null để bỏ ép
export function setWindOverride(kmh, from){ OC.override = kmh == null ? null : { kmh, from }; }
// mục tiêu gió từ cấu hình: weather = { mode, ok, wind, windDeg } (ST.WX)
export function windTargetFrom(weather, date){
  if (OC.override) return { kmh:OC.override.kmh, from:OC.override.from, swell:OC.override.from + 15 };
  const sea = seasonalWind(date), real = weather && weather.ok, mode = weather ? weather.mode : 'real';
  const from = real && weather.windDeg != null ? weather.windDeg : sea.from;
  const kmh = mode === 'sun' ? 8 : (mode === 'rain' ? 28 : (real ? weather.wind : sea.kmh));
  return { kmh:Math.max(kmh, 2), from, swell:sea.from };
}
function rebuild(){
  for (let i = 0; i < N_WAVES; i++){ const w = TABLE[i], base = w.kind === 2 ? OC.swellFrom : OC.from, to = (base + 180 + w.off) * Math.PI / 180;
    OC.dir[i * 2] = Math.sin(to); OC.dir[i * 2 + 1] = -Math.cos(to);
    OC.amp[i] = w.s / OC.k[i] * windScale(w.kind, OC.kmh); } }
// một bước thời gian: làm mượt gió về mục tiêu (rate = tốc độ bám, 1/s; snap = đặt ngay) rồi tính lại bảng sóng
export function oceanStep(dt, target, snap){
  if (target){ OC.tKmh = target.kmh; OC.tFrom = target.from; OC.tSwell = target.swell; }
  const a = snap ? 1 : Math.min(1, dt * 0.35), b = snap ? 1 : Math.min(1, dt * 0.06);
  OC.kmh += (OC.tKmh - OC.kmh) * a; OC.from = (lerpAngle(OC.from, OC.tFrom, a) + 360) % 360; OC.swellFrom = (lerpAngle(OC.swellFrom, OC.tSwell, b) + 360) % 360;
  OC.t += snap ? 0 : dt; rebuild(); }
rebuild();
export function windState(){ const to = (OC.from + 180) * Math.PI / 180; return { kmh:OC.kmh, from:OC.from, swellFrom:OC.swellFrom, dx:Math.sin(to), dz:-Math.cos(to), height:waveScale() }; }
// độ cao sóng đặc trưng tương đối (tổng biên độ), để âm thanh, nhãn, game dùng
export function waveScale(){ let s = 0; for (let i = 0; i < N_WAVES; i++) s += OC.amp[i]; return s; }

// hệ số tắt dần theo độ sâu (đồng bộ với shader): sóng lặng dần khi vào cạn, bằng 0 ở bờ
export function depthFade(depth){ return smooth(0.05, 1.8, depth); }
function fadeAt(x, z){ return OC.depthFn ? depthFade(OC.depthFn(x, z)) : 1; }

// độ dịch (dx, dy, dz) của điểm mặt nước gốc (x, z) tại thời điểm t, chưa nhân hệ số độ sâu
function disp(x, z, t, out){
  let ox = 0, oy = 0, oz = 0;
  for (let i = 0; i < N_WAVES; i++){ const dx = OC.dir[i * 2], dz = OC.dir[i * 2 + 1], th = OC.k[i] * (dx * x + dz * z) - OC.om[i] * t, A = OC.amp[i], c = Math.cos(th) * A;
    ox += dx * c; oz += dz * c; oy += A * Math.sin(th); }
  out[0] = ox; out[1] = oy; out[2] = oz; return out; }
const _o = [0, 0, 0];
// độ cao mặt nước (y) tại điểm (x, z) trên bản đồ, tại thời điểm t (mặc định đồng hồ sóng hiện tại)
export function waveHeightAt(x, z, t){
  if (t === undefined) t = OC.t; let px = x, pz = z, f = 1;
  for (let it = 0; it < 3; it++){ f = fadeAt(px, pz); disp(px, pz, t, _o); px = x - _o[0] * f; pz = z - _o[2] * f; }   // đảo ngược phép dịch ngang bằng lặp điểm bất động
  return _o[1] * f; }
// pháp tuyến đơn vị (nx, ny, nz) của mặt nước tại (x, z)
export function waveNormalAt(x, z, t){
  if (t === undefined) t = OC.t; let px = x, pz = z, f = 1;
  for (let it = 0; it < 3; it++){ f = fadeAt(px, pz); disp(px, pz, t, _o); px = x - _o[0] * f; pz = z - _o[2] * f; }
  let gx = 0, gz = 0, comp = 0;
  for (let i = 0; i < N_WAVES; i++){ const dx = OC.dir[i * 2], dz = OC.dir[i * 2 + 1], th = OC.k[i] * (dx * px + dz * pz) - OC.om[i] * t, wa = OC.k[i] * OC.amp[i] * f;
    gx += dx * wa * Math.cos(th); gz += dz * wa * Math.cos(th); comp += wa * Math.sin(th); }
  const nx = -gx, ny = Math.max(0.2, 1 - comp), nz = -gz, l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; }
