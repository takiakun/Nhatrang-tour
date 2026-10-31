/* ======================= TOÁN THỜI TIẾT (JS thuần, không DOM, không three.js: chạy được trong Node) ======================= */
// Các hàm thuần cho mưa, ướt, sét, vận tốc hạt mưa. weather.js dùng chúng; tests/weather-check.js kiểm bằng Node.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Sàn cường độ mưa (0..1) theo weather_code của Open-Meteo (WMO): khi lượng mưa đo được nhỏ hơn sàn thì lấy sàn.
// nhẹ 0,2 / vừa 0,5 / nặng 0,9+. Mã tuyết (71–77, 85, 86) không có sàn (Nha Trang không có tuyết).
export const RAIN_CODE_FLOOR = {
  51: 0.12, 53: 0.18, 55: 0.26,                 // mưa phùn
  56: 0.15, 57: 0.26,                           // mưa phùn đóng băng (hiếm)
  61: 0.2, 63: 0.5, 65: 0.9,                    // mưa nhẹ / vừa / to
  66: 0.4, 67: 0.8,                             // mưa đóng băng
  80: 0.3, 81: 0.6, 82: 0.95,                   // mưa rào nhẹ / vừa / dữ dội
  95: 0.7, 96: 0.85, 99: 1.0,                   // dông, dông kèm mưa đá
};
export const RAIN_MM_FULL = 8;                  // 8 mm/h trở lên là mưa tối đa
// cường độ mưa 0..1 từ lượng mưa hiện tại (mm/h) và mã thời tiết
export function rainFromWeather(mm, code){ const a = clamp((mm || 0) / RAIN_MM_FULL, 0, 1), f = RAIN_CODE_FLOOR[code] || 0; return Math.max(a, f); }
// mức dông 0..1 (sét, sấm): từ mưa to trở lên, hoặc mã dông
export function stormK(rain, code){ return Math.max(clamp((rain - 0.7) / 0.2, 0, 1), code === 95 ? 0.6 : (code === 96 || code === 99 ? 1 : 0)); }
// mức ướt mục tiêu 0..1 theo cường độ mưa (mưa phùn cũng làm ướt đường)
export function wetTarget(rain){ return clamp(rain * 1.8, 0, 1); }
// độ ướt chạy về mục tiêu: lên trong ~10 s, khô trong ~40 s (tuyến tính, dt giây)
export function wetStep(wet, target, dt, up, down){ up = up || 10; down = down || 40;
  return target > wet ? Math.min(target, wet + dt / up) : Math.max(target, wet - dt / down); }

// sét: t giây từ lúc bắt đầu → độ sáng 0..1. Hai nháy: một nháy chính ~0,07 s, nghỉ ~0,05 s, nháy thứ hai yếu hơn ~0,09 s
export const LIGHTNING_LEN = 0.3;
export function lightningFlash(t){ if (t < 0 || t > LIGHTNING_LEN) return 0;
  if (t < 0.075) return Math.sin(t / 0.075 * Math.PI) ** 0.6;
  if (t > 0.13 && t < 0.23) return 0.6 * Math.sin((t - 0.13) / 0.1 * Math.PI) ** 0.8;
  return 0; }
// khoảng nghỉ (giây) tới cú sét kế tiếp, theo mức dông storm (0..1) và số ngẫu nhiên r (0..1): dông mạnh thì dày hơn (≈6–18 s), dông yếu thưa (≈20–70 s)
export function lightningGap(storm, r){ return (1 - 0.6 * storm) * (14 + 56 * r) * (storm > 0.01 ? 1 : 1e9); }
// độ trễ (giây) của sấm sau chớp theo khoảng cách ước lượng dist01 (0 gần, 1 xa): 340 m/s, 0,3–3 km
export function thunderDelay(dist01){ return (300 + 2700 * clamp(dist01, 0, 1)) / 340; }

// vận tốc hạt mưa (đơn vị bản đồ / giây; 1 đơn vị = 50 m) cho gió windKmh thổi tới hướng (dx, dz) và hệ số giật gust (0..): rơi xuống vfall, trôi ngang ≈ 55% tốc độ gió.
// scale = hệ số tỉ lệ hộp mưa (xa camera thì hộp lớn, tốc độ nhân theo để nhìn không đổi)
export const RAIN_FALL = 0.3;                   // 15 m/s: nhanh hơn mưa thật một chút vì người chơi nhỏ ×0,35
export function rainVelocity(windKmh, dx, dz, gust, scale){ const h = windKmh / 3.6 * 0.55 / 50 * (1 + (gust || 0) * 0.8), k = scale || 1;
  return [dx * h * k, -RAIN_FALL * k, dz * h * k]; }
// góc nghiêng của vệt mưa so với phương thẳng đứng (độ)
export function rainSlantDeg(windKmh, gust){ const v = rainVelocity(windKmh, 1, 0, gust, 1); return Math.atan2(Math.abs(v[0]), -v[1]) * 180 / Math.PI; }
// số vệt mưa vẽ theo cường độ rain (0..1) trên tổng n: 12% khi mưa phùn, đủ 100% khi rain ≥ 0,8
export function rainCount(n, rain){ return rain < 0.02 ? 0 : Math.round(n * (0.12 + 0.88 * clamp(rain * 1.25, 0, 1))); }
// cỡ hộp mưa (đơn vị) theo khoảng cách camera tới tâm nhìn: sát đất thì hộp ~20 m (0,4), xa thì to dần để vệt mưa vẫn thấy trên màn hình
export function rainBoxScale(camDist){ return clamp(camDist * 0.8, 0.4, 40); }
// sương khi mưa: cận/xa của Fog (đơn vị) theo cường độ rain và khoảng cách camera dist, nội suy từ giá trị gốc base = { near, far }
export function rainFog(base, rain, dist){ const far = Math.max(60, dist * 1.6 + 20), near = Math.max(2, dist * 0.4), t = clamp(rain, 0, 1);
  return { near: base.near + (Math.min(near, base.near) - base.near) * t, far: base.far + (Math.min(far, base.far) - base.far) * t }; }
