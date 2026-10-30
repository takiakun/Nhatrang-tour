import { TERRAIN_DATA } from './terrain-data.js';
import { OSM_DATA } from './osm-data.js';
/* ======================= GEOGRAPHY (pure JS, no three.js) ======================= */
/* 1 unit = 50 m on the ground. Terrain heights are exaggerated (VE), buildings less so (VB). */
var LAT0 = 12.226, LON0 = 109.240, KX = 2176, KZ = 2212;
function P(lat, lon){ return [(lon - LON0) * KX, -(lat - LAT0) * KZ]; }
function toLL(x, z){ return [LAT0 - z / KZ, LON0 + x / KX]; }
var BX0 = -192, BX1 = 196, BZ0 = -165, BZ1 = 168, BR = 28, BW = BX1 - BX0, BD = BZ1 - BZ0;
var VE = 0.06, VB = 0.032, FLOOR = 3.4 * VB;

function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function smooth(a, b, x){ var t = (x - a) / (b - a); t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }
function lerp(a, b, t){ return a + (b - a) * t; }
function ih(a, b){ var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function hash(x, z){ var s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z){ var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, z){ var s = 0, a = 0.5, f = 1; for (var i = 0; i < 4; i++){ s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s / 0.9375; }
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function inPoly(x, z, poly){ var c = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++){ var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
  if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
function segD2(px, pz, ax, az, bx, bz){ var vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz, t = l > 0 ? ((px - ax) * vx + (pz - az) * vz) / l : 0; t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var dx = px - ax - vx * t, dz = pz - az - vz * t; return dx * dx + dz * dz; }
function polyEdgeDist(x, z, poly){ var m = 1e18, n = poly.length; for (var i = 0; i < n; i++){ var a = poly[i], b = poly[(i + 1) % n]; var d = segD2(x, z, a[0], a[1], b[0], b[1]); if (d < m) m = d; } return Math.sqrt(m); }
function lineDist(x, z, pts){ var m = 1e18; for (var i = 0; i < pts.length - 1; i++){ var d = segD2(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); if (d < m) m = d; } return Math.sqrt(m); }
function bboxOf(pts, pad){ var a = 1e9, b = 1e9, c = -1e9, d = -1e9; pts.forEach(function(p){ a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }); return [a - pad, b - pad, c + pad, d + pad]; }
function inBox(x, z, b){ return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]; }
function LLs(a){ return a.map(function(q){ var p = P(q[0], q[1]); for (var i = 2; i < q.length; i++) p.push(q[i]); return p; }); }
function PK(a){ return a.map(function(q){ var p = P(q[0], q[1]); return [p[0], p[1], q[2] / 50, q[3] * VE]; }); }
function boardClamp(x, z){ var cx = clamp(x, BX0 + BR, BX1 - BR), cz = clamp(z, BZ0 + BR, BZ1 - BR), dx = x - cx, dz = z - cz, d = Math.sqrt(dx * dx + dz * dz);
  if (d > BR) return [cx + dx / d * BR, cz + dz / d * BR]; return [x, z]; }
function inBoard(x, z, m){ m = m || 0; if (x < BX0 + m || x > BX1 - m || z < BZ0 + m || z > BZ1 - m) return false;
  var cx = clamp(x, BX0 + BR, BX1 - BR), cz = clamp(z, BZ0 + BR, BZ1 - BR); return Math.hypot(x - cx, z - cz) <= BR - m; }
function resample(pts, step){ var out = [[pts[0][0], pts[0][1]]], carry = 0;
  for (var i = 0; i < pts.length - 1; i++){ var a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), s = step - carry;
    while (s <= L){ var t = s / L; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); s += step; }
    carry = L - (s - step); }
  return out; }

/* ---------- coastline of the mainland, north → south (sea lies east) ---------- */
var COAST = LLs([
  [12.315,109.2200],[12.300,109.2160],[12.292,109.2130],[12.285,109.2100],[12.279,109.2078],[12.2755,109.2072],
  [12.2735,109.2090],[12.2715,109.2082],[12.2690,109.2050],[12.2665,109.2025],[12.2640,109.2015],[12.2600,109.2005],
  [12.2540,109.1990],[12.2460,109.1980],[12.2390,109.1983],[12.2300,109.2003],[12.2220,109.2038],[12.2150,109.2075],
  [12.2100,109.2108],[12.2075,109.2140],[12.2062,109.2178],[12.2045,109.2172],[12.2025,109.2152],[12.2000,109.2112],
  [12.1975,109.2085],[12.1950,109.2080],[12.1925,109.2098],[12.1880,109.2118],[12.1800,109.2135],[12.1700,109.2150],
  [12.1600,109.2172],[12.1500,109.2195],[12.1400,109.2230]
]);
// có dữ liệu OSM: bờ đất liền theo natural=coastline (tools/fetch-osm.js rút mỗi 0,001° vĩ độ một điểm), không thêm dao động
var COAST_REAL = typeof OSM_DATA !== 'undefined' && OSM_DATA && OSM_DATA.coast && OSM_DATA.coast.length > 20;
if (COAST_REAL) COAST = LLs(OSM_DATA.coast);
function coastX(z){ var lo = 0, hi = COAST.length - 1;
  if (z <= COAST[0][1]) return COAST[0][0]; if (z >= COAST[hi][1]) return COAST[hi][0];
  while (hi - lo > 1){ var mid = (lo + hi) >> 1; if (COAST[mid][1] <= z) lo = mid; else hi = mid; }
  var a = COAST[lo], b = COAST[hi], t = (z - a[1]) / (b[1] - a[1]);
  return a[0] + (b[0] - a[0]) * t + (COAST_REAL ? 0 : 0.22 * Math.sin(z * 0.37) + 0.12 * Math.sin(z * 1.13 + 1)); }

/* ---------- rivers: lat, lon, width (units) ---------- */
var RIVERS = [
  { id:'cai', pts: LLs([[12.2460,109.1500,3.0],[12.2500,109.1600,3.0],[12.2545,109.1680,3.2],[12.2600,109.1745,3.2],[12.2640,109.1800,3.4],[12.2655,109.1860,3.4],[12.2645,109.1910,3.6],[12.2635,109.1950,3.8],[12.2630,109.1990,4.2],[12.2628,109.2045,6]]) },
  { id:'be', pts: LLs([[12.2410,109.1500,2.4],[12.2330,109.1620,2.4],[12.2250,109.1720,2.6],[12.2170,109.1820,2.8],[12.2100,109.1900,3.0],[12.2030,109.1980,3.6],[12.1985,109.2040,5.0],[12.1955,109.2075,5.0],[12.1950,109.2115,6]]) }
];
RIVERS.forEach(function(r){ r.box = bboxOf(r.pts, 10); });
function riverS(x, z){ if (OSM && OSM.water) return osmWaterS(x, z); var best = 1e9;
  for (var k = 0; k < RIVERS.length; k++){ var R = RIVERS[k]; if (!inBox(x, z, R.box)) continue; var p = R.pts;
    for (var i = 0; i < p.length - 1; i++){ var a = p[i], b = p[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], l = vx * vx + vz * vz, t = ((x - a[0]) * vx + (z - a[1]) * vz) / l; t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var dx = x - a[0] - vx * t, dz = z - a[1] - vz * t, d = Math.sqrt(dx * dx + dz * dz) - (a[2] + (b[2] - a[2]) * t) * 0.5; if (d < best) best = d; } }
  return best + 0.35 * Math.sin(x * 0.29 + z * 0.17); }

/* ---------- islands ---------- */
var ISLANDS = [
  { id:'hon-tre', seed:1.3, nz:1.6, poly:[[12.2200,109.2365],[12.2265,109.2420],[12.2330,109.2500],[12.2390,109.2600],[12.2440,109.2720],[12.2460,109.2850],[12.2430,109.2980],[12.2380,109.3080],[12.2300,109.3170],[12.2200,109.3210],[12.2100,109.3180],[12.2020,109.3100],[12.1960,109.2990],[12.1990,109.2900],[12.1935,109.2820],[12.1960,109.2700],[12.2020,109.2600],[12.2060,109.2520],[12.2100,109.2450],[12.2140,109.2400]],
    peaks:[], ridges:[
      [[12.2238,109.2470,450,90],[12.2290,109.2560,800,250],[12.2300,109.2650,1000,340],[12.2270,109.2830,1300,470],[12.2210,109.2980,1100,360],[12.2160,109.3090,900,270]],
      [[12.2270,109.2830,900,420],[12.2385,109.2760,800,260],[12.2425,109.2860,700,220]],
      [[12.2270,109.2830,900,400],[12.2110,109.2770,850,240],[12.2050,109.2680,700,170]],
      [[12.2210,109.2980,800,330],[12.2350,109.3060,750,240]],
      [[12.2300,109.2650,700,300],[12.2390,109.2620,600,180]] ] },
  { id:'hon-mieu', seed:2.1, nz:1.0, poly:[[12.1990,109.2270],[12.1975,109.2310],[12.1935,109.2322],[12.1890,109.2292],[12.1870,109.2242],[12.1895,109.2205],[12.1945,109.2212]], peaks:[[12.1935,109.2282,380,75]] },
  { id:'hon-mot', seed:3.3, nz:0.5, cliff:true, poly:[[12.1915,109.2370],[12.1906,109.2397],[12.1884,109.2392],[12.1888,109.2364]], peaks:[[12.1899,109.2381,170,45]] },
  { id:'hon-tam', seed:3.7, nz:1.0, poly:[[12.1800,109.2300],[12.1792,109.2380],[12.1762,109.2420],[12.1732,109.2402],[12.1740,109.2322],[12.1765,109.2290]], peaks:[[12.1766,109.2368,480,110]] },
  { id:'hon-mun', seed:4.2, nz:0.8, cliff:true, poly:[[12.1700,109.2995],[12.1695,109.3045],[12.1665,109.3062],[12.1640,109.3030],[12.1650,109.2990],[12.1680,109.2978]], peaks:[[12.1672,109.3022,330,100]] },
  { id:'hon-do', seed:5.1, nz:0.25, cliff:true, poly:[[12.2672,109.2082],[12.2670,109.2091],[12.2662,109.2092],[12.2660,109.2082],[12.2666,109.2077]], peaks:[[12.2666,109.2085,70,14]] }
].map(function(d){ var poly = LLs(d.poly); return { id:d.id, seed:d.seed, nz:d.nz, cliff:!!d.cliff, poly:poly, peaks:PK(d.peaks), ridges:d.ridges ? prepRidges(d.ridges) : null, box:bboxOf(poly, 18) }; });
function islandSD(x, z, I){ var e = polyEdgeDist(x, z, I.poly), s = inPoly(x, z, I.poly) ? e : -e; return s + (fbm(x * 0.11 + I.seed * 7, z * 0.11 - I.seed * 3) - 0.5) * I.nz; }
function islandH(x, z, I){
  if (!inBox(x, z, I.box)) return -99;
  var sd = islandSD(x, z, I);
  if (sd < 0) return -0.15 + sd * 0.26 * (0.65 + 0.7 * fbm(x * 0.04 + I.seed, z * 0.04));
  var h = 0.05 + 0.33 * smooth(0, 1.1, sd), m = 0, wx = x + (fbm(x * 0.06 + I.seed, z * 0.06) - 0.5) * 5, wz = z + (fbm(x * 0.06, z * 0.06 + I.seed) - 0.5) * 5;
  for (var i = 0; i < I.peaks.length; i++){ var q = I.peaks[i], ux = q[2] > 6 ? wx : x, uz = q[2] > 6 ? wz : z, dx = ux - q[0], dz = uz - q[1], t = (dx * dx + dz * dz) / (q[2] * q[2]); if (t < 1){ var k = 1 - t; m += q[3] * k * k; } }
  if (m > 0){ m *= 0.85 + 0.3 * fbm(x * 0.09 + 3, z * 0.09 + I.seed); m += m * 0.22 * (Math.abs(fbm(x * 0.18, z * 0.18) * 2 - 1) - 0.3); }
  if (I.ridges) m = Math.max(m, ridgesAt(x, z, I.ridges, 8) + 1.6 * fbm(x * 0.07, z * 0.07 + 3) * smooth(2, 6, sd));
  if (m > 0) h += m * smooth(I.cliff ? 0.05 : 0.4, I.cliff ? 1.0 : 3.2, sd);
  return h;
}
function islandAt(x, z, pad){ for (var i = 0; i < ISLANDS.length; i++){ var I = ISLANDS[i]; if (inBox(x, z, I.box) && islandSD(x, z, I) > -(pad || 0)) return I; } return null; }

/* ---------- mountains as ridgelines: [lat, lon, half-width (m), height (m)] per vertex ---------- */
function RG(a){ return a.map(function(q){ var p = P(q[0], q[1]); return [p[0], p[1], q[2] / 50, q[3] * VE]; }); }
function prepRidges(list){ return list.map(function(r){ var pts = RG(r), maxw = 0; pts.forEach(function(p){ maxw = Math.max(maxw, p[2]); }); return { pts:pts, box:bboxOf(pts, maxw + 6) }; }); }
var RIDGES = prepRidges([
  [[12.2765,109.2068,260,70],[12.2805,109.2035,520,250],[12.2865,109.2012,820,420],[12.2925,109.1985,800,370],[12.2990,109.2040,900,320],[12.3060,109.2085,900,280]],
  [[12.2890,109.2060,420,200],[12.2865,109.2012,600,380]],
  [[12.2840,109.1585,700,170],[12.2925,109.1620,1100,300],[12.2985,109.1715,1000,330],[12.3060,109.1765,1000,300]],
  [[12.1955,109.1530,1000,220],[12.1830,109.1690,1000,250],[12.1720,109.1850,1100,300],[12.1655,109.2000,1150,380],[12.1560,109.2085,900,300],[12.1450,109.2120,900,250]],
  [[12.1520,109.1760,1300,320],[12.1655,109.2000,1000,360]],
  [[12.2300,109.1500,900,120],[12.2120,109.1575,950,160],[12.2010,109.1540,900,180]]
]);
// đồi nhỏ có địa danh, tâm theo OSM: Tháp Bà (đồi Cù Lao), đồi Trại Thủy sau chùa Long Sơn, Nhà thờ Núi, mũi Chụt (Lầu Bảo Đại), Hòn Chồng
var HILLS = PK([[12.2654,109.1952,150,16],[12.2522,109.1808,260,50],[12.2467,109.1881,80,12],[12.2103,109.2154,170,42],[12.2728,109.2066,140,14]]);
function ridgeH(x, z, R){ var best = 0, p = R.pts;
  for (var i = 0; i < p.length - 1; i++){ var a = p[i], b = p[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], l = vx * vx + vz * vz, t = ((x - a[0]) * vx + (z - a[1]) * vz) / l; t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var dx = x - a[0] - vx * t, dz = z - a[1] - vz * t, w = a[2] + (b[2] - a[2]) * t, hh = a[3] + (b[3] - a[3]) * t, q = (dx * dx + dz * dz) / (w * w);
    if (q < 1){ var k = 1 - q, v = hh * k * Math.sqrt(k); if (v > best) best = v; } }
  return best; }
function ridgesAt(x, z, list, warp){ var m = 0, wx = x, wz = z, near = false;
  for (var i = 0; i < list.length; i++) if (inBox(x, z, list[i].box)){ near = true; break; }
  if (!near) return 0;
  wx = x + (fbm(x * 0.05, z * 0.05) - 0.5) * warp; wz = z + (fbm(x * 0.05 + 5.2, z * 0.05 + 9.1) - 0.5) * warp;
  for (i = 0; i < list.length; i++) if (inBox(wx, wz, list[i].box)) m = Math.max(m, ridgeH(wx, wz, list[i]));
  if (m > 0){ var r1 = 1 - Math.abs(fbm(x * 0.09 + 1.7, z * 0.09 - 2.2) * 2 - 1), r2 = 1 - Math.abs(fbm(x * 0.22, z * 0.22) * 2 - 1);
    m *= 0.62 + 0.3 * r1 + 0.16 * r2; }
  return m; }
function mountains(x, z){ var m = ridgesAt(x, z, RIDGES, 12);
  for (var i = 0; i < HILLS.length; i++){ var q = HILLS[i], dx = x - q[0], dz = z - q[1], r = q[2];
    if (dx > -r && dx < r && dz > -r && dz < r){ var t = (dx * dx + dz * dz) / (r * r); if (t < 1){ var k = 1 - t; m += q[3] * k * k; } } }
  return m; }
var PADS = [ (function(){ var p = P(12.2192,109.2410); return [p[0], p[1], 6.5, 0.5]; })() ];

function mainlandH(x, z){
  var d = coastX(z) - x;
  if (d < 0) return -0.24 - Math.min(-d, 40) * 0.15 * (0.7 + 0.6 * fbm(x * 0.02 + 3, z * 0.02)) - fbm(x * 0.03 + 7, z * 0.03) * 0.5;
  var h = 0.05 + 0.37 * smooth(0, 1.6, d);
  h += 0.12 * (fbm(x * 0.05 + 11, z * 0.05 - 3) - 0.3) * smooth(2, 8, d);
  var m = mountains(x, z);
  if (m > 0) h += m * smooth(0.6, 4.5, d);
  return h;
}
/* ---------- địa hình thật (terrain-data.js, sinh bởi tools/fetch-terrain.js) ---------- */
// Lưới độ cao Copernicus 100 m (m), khoảng cách tới đất thật gần nhất (đơn vị bản đồ), lớp phủ ESA WorldCover 50 m.
// Không có dữ liệu (ví dụ khi tools/ chạy geo.js trong Node) thì dùng địa hình ước lượng như trước.
var TR = (function(){ if (typeof TERRAIN_DATA === 'undefined') return null; var T = TERRAIN_DATA;
  function bytes(s){ var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  var raw = new Int16Array(bytes(T.elev).buffer), N = T.nx * T.nz, e = new Float32Array(N), dist = new Float32Array(N);
  for (var i = 0; i < N; i++){ e[i] = raw[i] / 10; dist[i] = e[i] > 0.5 ? 0 : 1e9; }
  // khoảng cách chamfer 2 lượt (đủ chính xác để làm độ sâu biển dần dần)
  var nx = T.nx, nz = T.nz, D1 = T.step, D2 = T.step * 1.4142;
  for (var j = 0; j < nz; j++) for (i = 0; i < nx; i++){ var k = j * nx + i, v = dist[k];
    if (i > 0) v = Math.min(v, dist[k - 1] + D1); if (j > 0){ v = Math.min(v, dist[k - nx] + D1); if (i > 0) v = Math.min(v, dist[k - nx - 1] + D2); if (i < nx - 1) v = Math.min(v, dist[k - nx + 1] + D2); } dist[k] = v; }
  for (j = nz - 1; j >= 0; j--) for (i = nx - 1; i >= 0; i--){ k = j * nx + i; v = dist[k];
    if (i < nx - 1) v = Math.min(v, dist[k + 1] + D1); if (j < nz - 1){ v = Math.min(v, dist[k + nx] + D1); if (i < nx - 1) v = Math.min(v, dist[k + nx + 1] + D2); if (i > 0) v = Math.min(v, dist[k + nx - 1] + D2); } dist[k] = v; }
  var rl = bytes(T.lc), lc = new Uint8Array(T.lcx * T.lcz), p = 0; for (i = 0; i < rl.length; i += 2){ lc.fill(T.lcClasses[rl[i + 1]], p, p + rl[i]); p += rl[i]; }
  return { nx:nx, nz:nz, step:T.step, e:e, dist:dist, lc:lc, lcx:T.lcx, lcz:T.lcz, lcStep:T.lcStep }; })();
function trSample(arr, x, z){ var gx = clamp((x - BX0) / TR.step, 0, TR.nx - 1.001), gz = clamp((z - BZ0) / TR.step, 0, TR.nz - 1.001), i = gx | 0, j = gz | 0, u = gx - i, v = gz - j, k = j * TR.nx + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + TR.nx] * (1 - u) + arr[k + TR.nx + 1] * u) * v; }
// mã lớp phủ ESA WorldCover: 10 cây, 20 cây bụi, 30 cỏ, 40 ruộng, 50 nhà cửa, 60 đất trống, 80 nước, 90 đất ngập, 95 rừng ngập mặn; 0 = không có dữ liệu
function lcAt(x, z){ if (!TR) return 0; var i = clamp(Math.round((x - BX0) / TR.lcStep), 0, TR.lcx - 1), j = clamp(Math.round((z - BZ0) / TR.lcStep), 0, TR.lcz - 1); return TR.lc[j * TR.lcx + i]; }
var HON_DO = null;
// Đất liền giữ đường bờ ước lượng (khớp với đường Trần Phú, bãi biển, khu phố) và nền phố phẳng; đồi núi dùng độ cao thật,
// bỏ phần dưới ~15 m vì Copernicus là mô hình bề mặt (DSM) có cả mái nhà, tán cây. Đảo lấy hình dạng và độ cao thật;
// Hòn Đỏ quá nhỏ so với lưới 100 m nên giữ hình ước lượng. Biển sâu dần theo khoảng cách tới đất gần nhất.
function realH(x, z){
  var d = coastX(z) - x, e = trSample(TR.e, x, z), h;
  if (d >= 0){ h = 0.05 + 0.37 * smooth(0, 1.6, d) + 0.12 * (fbm(x * 0.05 + 11, z * 0.05 - 3) - 0.3) * smooth(2, 8, d);
    var hl = 0; for (var i = 0; i < HILLS.length; i++){ var q = HILLS[i], dx = x - q[0], dz = z - q[1], t = (dx * dx + dz * dz) / (q[2] * q[2]); if (t < 1){ var k = 1 - t; hl += q[3] * k * k; } }
    h += Math.max(hl, VE * Math.max(0, e - 15) * smooth(15, 45, e)) * smooth(0.6, 4.5, d); }   // đồi nhỏ có địa danh (Tháp Bà, Nhà thờ Núi…) giữ dáng ước lượng
  else if (OSM && OSM.land){ var ls = osmLandS(x, z);   // đảo theo đường bờ OSM; độ cao trong đảo theo DEM
    if (ls < 0) h = 0.05 + 0.33 * smooth(0, 1.2, -ls) + VE * Math.max(0, e - 4) * (0.9 + 0.2 * fbm(x * 0.2, z * 0.2)) * smooth(0, 1.5, -ls);
    else { var sd2 = Math.min(-d, ls); h = -0.24 - Math.min(sd2, 40) * 0.15 * (0.7 + 0.6 * fbm(x * 0.02 + 3, z * 0.02)) - fbm(x * 0.03 + 7, z * 0.03) * 0.5 * smooth(0, 3, sd2); } }
  else if (d < -3 && e > 0.5) h = 0.05 + 0.33 * smooth(0.5, 6, e) + VE * Math.max(0, e - 4) * (0.9 + 0.2 * fbm(x * 0.2, z * 0.2));
  else { var sd = Math.min(-d, trSample(TR.dist, x, z)); h = -0.24 - Math.min(sd, 40) * 0.15 * (0.7 + 0.6 * fbm(x * 0.02 + 3, z * 0.02)) - fbm(x * 0.03 + 7, z * 0.03) * 0.5 * smooth(0, 3, sd); }
  if (!HON_DO) HON_DO = ISLANDS.filter(function(I){ return I.id === 'hon-do'; })[0];
  var hd = islandH(x, z, HON_DO); if (hd > h) h = hd;
  return h; }
function H(x, z){
  if (TR) return carveH(x, z, realH(x, z));
  var h = mainlandH(x, z);
  for (var i = 0; i < ISLANDS.length; i++){ var v = islandH(x, z, ISLANDS[i]); if (v > h) h = v; }
  return carveH(x, z, h); }
// sông và bãi đáp (dùng chung cho cả địa hình thật lẫn ước lượng)
function carveH(x, z, h){
  var rs = riverS(x, z);
  if (OSM && OSM.water){   // mặt nước OSM: dưới nước sâu dần từ đúng mép thật, đất sát bờ hạ về ngang bờ nhưng vẫn là đất (đê, đường ven sông)
    if (rs < 0){ var cv = -0.05 - 0.57 * smooth(0, 0.5, -rs); if (cv < h) h = cv; }
    else if (rs < 0.4 && h > 0.06) h = lerp(0.06, h, smooth(0, 0.4, rs)); }
  else if (rs < 2.4 && h > -0.7){ var carve = lerp(-0.62, h, smooth(-0.3, 2.2, rs)); if (carve < h) h = carve; }
  for (var j = 0; j < PADS.length; j++){ var p = PADS[j], dd = Math.hypot(x - p[0], z - p[1]); if (dd < p[2] + 3) h = lerp(h, p[3], smooth(p[2] + 3, p[2], dd)); }
  return h;
}

/* ---------- districts: local street grids ---------- */
var DIST = [
  { id:'oldq', style:'city', coastal:false, ang:38, su:1.9, sv:1.7, dens:1, poly:[[12.2618,109.1880],[12.2624,109.1935],[12.2620,109.1993],[12.2532,109.1990],[12.2532,109.1880]] },
  { id:'center', style:'city', coastal:true, ang:6, su:2.6, sv:2.1, dens:1, poly:[[12.2600,109.1800],[12.2618,109.1880],[12.2532,109.1880],[12.2532,109.1990],[12.2386,109.1985],[12.2386,109.1808],[12.2470,109.1802]] },
  { id:'south', style:'city', coastal:true, ang:22, su:2.6, sv:2.1, dens:0.95, poly:[[12.2386,109.1812],[12.2386,109.1990],[12.2300,109.2008],[12.2200,109.2045],[12.2120,109.2090],[12.2092,109.2118],[12.2075,109.2060],[12.2090,109.1960],[12.2180,109.1870],[12.2300,109.1830]] },
  { id:'cauda', style:'city', coastal:false, ang:34, su:2.0, sv:1.8, dens:0.85, poly:[[12.2096,109.2058],[12.2094,109.2112],[12.2072,109.2168],[12.2040,109.2166],[12.2012,109.2112],[12.2016,109.2052]] },
  { id:'north', style:'city', coastal:true, ang:-14, su:2.3, sv:2.3, dens:0.8, poly:[[12.2672,109.1860],[12.2700,109.1850],[12.2790,109.1870],[12.2805,109.1960],[12.2775,109.2060],[12.2700,109.2075],[12.2668,109.2010]] },
  { id:'west', style:'suburb', coastal:false, ang:3, su:3.2, sv:2.8, dens:0.45, poly:[[12.2520,109.1560],[12.2535,109.1790],[12.2440,109.1800],[12.2420,109.1700],[12.2430,109.1560]] },
  { id:'vinhngoc', style:'village', coastal:false, ang:-20, su:3.4, sv:3.0, dens:0.35, poly:[[12.2720,109.1580],[12.2735,109.1820],[12.2680,109.1840],[12.2640,109.1720],[12.2600,109.1580]] },
  { id:'phuocdong', style:'village', coastal:false, ang:30, su:3.4, sv:3.0, dens:0.35, poly:[[12.2150,109.1780],[12.2240,109.1840],[12.2090,109.1950],[12.2020,109.1960],[12.2010,109.1800]] },
  { id:'honro', style:'village', coastal:false, ang:12, su:1.6, sv:1.5, dens:1.1, poly:[[12.1938,109.2035],[12.1935,109.2100],[12.1860,109.2112],[12.1850,109.2050]] },
  { id:'trinhuyen', style:'village', coastal:false, ang:40, su:1.4, sv:1.3, dens:1.0, poly:[[12.1960,109.2212],[12.1960,109.2248],[12.1905,109.2242],[12.1905,109.2208]] },
  { id:'bichdam', style:'village', coastal:false, ang:0, su:1.4, sv:1.3, dens:0.9, poly:[[12.2020,109.2860],[12.2015,109.2925],[12.1975,109.2918],[12.1980,109.2860]] },
  { id:'resort', style:'resort', coastal:false, ang:-30, su:2.2, sv:2.0, dens:0.8, poly:[[12.2235,109.2378],[12.2250,109.2470],[12.2135,109.2480],[12.2145,109.2392]] },
  { id:'hontam', style:'resort', coastal:false, ang:5, su:1.5, sv:1.5, dens:0.8, poly:[[12.1800,109.2302],[12.1797,109.2345],[12.1782,109.2345],[12.1784,109.2302]] }
].map(function(d, i){ var poly = LLs(d.poly), o = poly[0], a = d.ang * Math.PI / 180;
  return { id:d.id, i:i, style:d.style, coastal:d.coastal, poly:poly, box:bboxOf(poly, 0), ox:o[0], oz:o[1], ang:a, ca:Math.cos(a), sa:Math.sin(a), su:d.su, sv:d.sv,
    sw: d.style === 'village' ? 0.14 : (d.style === 'resort' ? 0.12 : 0.21), dens:d.dens }; });
function districtAt(x, z){ for (var i = 0; i < DIST.length; i++){ var D = DIST[i]; if (inBox(x, z, D.box) && inPoly(x, z, D.poly)) return i; } return -1; }
function toLocal(D, x, z){ var lx = x - D.ox, lz = z - D.oz; return [lx * D.ca + lz * D.sa, -lx * D.sa + lz * D.ca]; }
function toWorld(D, u, v){ return [D.ox + u * D.ca - v * D.sa, D.oz + u * D.sa + v * D.ca]; }

var PONDS = [
  LLs([[12.2075,109.1955],[12.2068,109.2045],[12.2030,109.2075],[12.1995,109.2030],[12.2000,109.1950]]),
  LLs([[12.1975,109.1960],[12.1968,109.2030],[12.1940,109.2032],[12.1945,109.1960]])
];
function inPonds(x, z){ if (OSM && OSM.water) return false; for (var i = 0; i < PONDS.length; i++) if (inPoly(x, z, PONDS[i])) return true; return false; }

/* ---------- roads & railway ---------- */
var zRiverMouth = P(12.2630, 0)[1], zHonChong = P(12.2735, 0)[1];
function coastalRoad(){ var pts = [], z0 = P(12.2985, 0)[1], z1 = P(12.2090, 0)[1];
  for (var z = z0; z <= z1; z += 0.8){ var off = lerp(2.0, 2.6, smooth(zRiverMouth - 3, zRiverMouth + 3, z)) + 2.4 * Math.exp(-Math.pow((z - zHonChong) / 4, 2)); pts.push([coastX(z) - off, z]); }
  return pts; }
var ROADS = [
  { id:'tranphu', w:0.56, pts: coastalRoad() },
  { id:'24', w:0.5, pts: LLs([[12.2560,109.1915],[12.2610,109.1925],[12.2640,109.1938],[12.2680,109.1945],[12.2760,109.1925],[12.2860,109.1880],[12.2960,109.1840],[12.3002,109.1840]]) },
  { id:'2310', w:0.5, pts: LLs([[12.2482,109.1855],[12.2478,109.1760],[12.2478,109.1650],[12.2470,109.1515]]) },
  { id:'lhp', w:0.5, pts: LLs([[12.2440,109.1858],[12.2350,109.1866],[12.2250,109.1890],[12.2150,109.1932],[12.2085,109.1990],[12.2040,109.2030],[12.1950,109.2050],[12.1900,109.2062],[12.1800,109.2095],[12.1700,109.2105],[12.1600,109.2125],[12.1500,109.2155],[12.1428,109.2185]]) },
  { id:'vn', w:0.4, pts: LLs([[12.2690,109.1850],[12.2690,109.1780],[12.2660,109.1700],[12.2600,109.1600],[12.2565,109.1515]]) },
  { id:'cauda', w:0.42, pts: LLs([[12.2090,109.2005],[12.2088,109.2060],[12.2082,109.2105],[12.2068,109.2150]]) }
];
var RAIL = LLs([[12.3005,109.1818],[12.2900,109.1812],[12.2780,109.1812],[12.2700,109.1825],[12.2600,109.1835],[12.2475,109.1840],[12.2400,109.1832],[12.2300,109.1800],[12.2200,109.1760],[12.2100,109.1720],[12.2000,109.1690],[12.1850,109.1660],[12.1700,109.1640],[12.1505,109.1620]]);

/* ---------- height grid ---------- */
function buildGrid(cell){
  var GX = Math.round(BW / cell) + 1, GZ = Math.round(BD / cell) + 1, cx = BW / (GX - 1), cz = BD / (GZ - 1), N = GX * GZ;
  var h = new Float32Array(N), n = new Float32Array(N), zone = new Uint8Array(N), slope = new Float32Array(N), sea = new Uint8Array(N), lcz = new Uint8Array(N);
  for (var j = 0; j < GZ; j++){ var z = BZ0 + j * cz; for (var i = 0; i < GX; i++){ var x = BX0 + i * cx, k = j * GX + i; h[k] = H(x, z); n[k] = fbm(x * 0.045 + 31, z * 0.045 - 17); } }
  for (j = 0; j < GZ; j++) for (i = 0; i < GX; i++){ k = j * GX + i;
    var hl = h[k - (i > 0 ? 1 : 0)], hr = h[k + (i < GX - 1 ? 1 : 0)], hu = h[k - (j > 0 ? GX : 0)], hd = h[k + (j < GZ - 1 ? GX : 0)];
    slope[k] = Math.max(Math.abs(hr - hl) / (2 * cx), Math.abs(hd - hu) / (2 * cz)); }
  for (j = 0; j < GZ; j++){ z = BZ0 + j * cz; var cxz = coastX(z); for (i = 0; i < GX; i++){ x = BX0 + i * cx; k = j * GX + i; var hh = h[k], d = cxz - x;
    sea[k] = (d < 0.6 || riverS(x, z) > 0.5) ? 1 : 0;
    if (hh < 0.3){ zone[k] = 0; continue; }
    var di = districtAt(x, z);
    if (di >= 0 && slope[k] < 0.4 && hh < 2.4){ zone[k] = 10 + di; continue; }
    if (inPonds(x, z) && slope[k] < 0.25){ zone[k] = 3; continue; }
    if (TR){ var c = lcAt(x, z); lcz[k] = c;   // ruộng, ao đầm theo lớp phủ thật
      zone[k] = (c === 40 && slope[k] < 0.2 && hh < 2) ? 2 : ((c === 80 || c === 90) && d > 3 && hh < 1.5 && slope[k] < 0.25 ? 3 : 1); }
    else zone[k] = (d > 3 && hh < 1.5 && slope[k] < 0.14 && n[k] > 0.3) ? 2 : 1; } }
  var G = { GX:GX, GZ:GZ, cx:cx, cz:cz, h:h, n:n, zone:zone, slope:slope, sea:sea, lc:lcz };
  G.lcAt = function(x, z){ return lcz[G.idx(x, z)]; };
  G.hAt = function(x, z){ var gx = (x - BX0) / cx, gz = (z - BZ0) / cz; if (gx < 0) gx = 0; if (gz < 0) gz = 0; if (gx > GX - 1.001) gx = GX - 1.001; if (gz > GZ - 1.001) gz = GZ - 1.001;
    var i0 = gx | 0, j0 = gz | 0, fx = gx - i0, fz = gz - j0, k0 = j0 * GX + i0;
    return (h[k0] * (1 - fx) + h[k0 + 1] * fx) * (1 - fz) + (h[k0 + GX] * (1 - fx) + h[k0 + GX + 1] * fx) * fz; };
  G.idx = function(x, z){ var i0 = Math.round((x - BX0) / cx), j0 = Math.round((z - BZ0) / cz); i0 = clamp(i0, 0, GX - 1); j0 = clamp(j0, 0, GZ - 1); return j0 * GX + i0; };
  G.zoneAt = function(x, z){ return zone[G.idx(x, z)]; };
  G.slopeAt = function(x, z){ return slope[G.idx(x, z)]; };
  G.nAt = function(x, z){ return n[G.idx(x, z)]; };
  return G;
}

/* ---------- ground texture ---------- */
function hex3(h){ return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
var PAL = { deep:hex3('#2d6a83'), shoal:hex3('#b7d1a9'), wet:hex3('#cbb88a'), sand:hex3('#eddcab'), sand2:hex3('#e0cb95'),
  grass:hex3('#a7c36f'), grass2:hex3('#86b25b'), scrub:hex3('#b2aa6c'), forest:hex3('#5b9046'), forest2:hex3('#3b7335'), rock:hex3('#9e937f'), rock2:hex3('#bcb19c'),
  street:hex3('#96989a'), walk:hex3('#dcd5c6'), curb:hex3('#a59e90'), mark:hex3('#f4f1e8'), lane:hex3('#cdc3a2'), urban:hex3('#d2ccbe'), lawn:hex3('#94c867'), path:hex3('#ece4d0'), bund:hex3('#c4ba8b'), dike:hex3('#c8b98e'), village:hex3('#b7b27c') };
var LC_TINT = { 10:[PAL.forest, 0.55], 20:[PAL.scrub, 0.45], 30:[PAL.grass, 0.35], 50:[PAL.urban, 0.55], 60:[PAL.rock2, 0.5], 90:[PAL.wet, 0.4], 95:[PAL.forest2, 0.6] };
var URB = ['#d6d0c3','#cbc4b5','#ddd7cb','#c2c7b4','#cdbfaa','#d9d3c4','#b8c2a8','#c9c9c2'].map(hex3);
var RICE = ['#9cc95a','#93c257','#a6cb60','#8fbd55','#b2cd66','#9fc45c','#c4c56c','#87b85a','#a9c463'].map(hex3), FLOOD = hex3('#8fb3a6'), FALLOW = hex3('#b9ab78');
var PONDC = ['#6fa2a6','#5f969b','#7aab9d','#86b0a8','#5a8f99'].map(hex3);
function mixc(a, b, t, o){ o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; }
function setc(a, o){ o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; }
var FCA = Math.cos(0.28), FSA = Math.sin(0.28), PCA = Math.cos(0.45), PSA = Math.sin(0.45);
function groundColor(x, z, hh, nn, zn, sl, o, lc){
  if (hh < 0){ if (hh > -0.7) mixc(PAL.wet, PAL.shoal, smooth(0, -0.7, hh), o); else mixc(PAL.shoal, PAL.deep, smooth(-0.7, -3.4, hh), o); return; }
  if (hh < 0.36 && zn < 10){ mixc(PAL.wet, PAL.sand, smooth(0.02, 0.22, hh), o); if (nn > 0.55) mixc(o, PAL.sand2, (nn - 0.55) * 1.2, o); return; }
  mixc(PAL.grass, PAL.grass2, nn, o);
  if (hh > 0.9){ mixc(o, PAL.forest, smooth(0.9, 2.6, hh) * (0.6 + 0.4 * nn), o); mixc(o, PAL.forest2, smooth(3, 14, hh) * (0.4 + 0.6 * nn), o); }
  if (hh > 0.6) mixc(o, PAL.scrub, smooth(0.42, 0.2, nn) * 0.7, o);
  if (sl > 1.3) mixc(o, PAL.rock, smooth(1.3, 2.8, sl) * 0.75, o);
  if (hh > 20) mixc(o, PAL.rock2, smooth(20, 27, hh) * 0.5, o);
  // lớp phủ thật (ngoài khu phố): rừng, cây bụi, cỏ, đất trống, xóm nhà, rừng ngập mặn
  if (lc && zn === 1){ var lt = LC_TINT[lc]; if (lt) mixc(o, lt[0], lt[1] * (0.75 + 0.25 * nn), o); }
  if (zn >= 10){ var D = DIST[zn - 10];
    var lx = x - D.ox, lz = z - D.oz, u = lx * D.ca + lz * D.sa, v = -lx * D.sa + lz * D.ca;
    var fu = u / D.su, fv = v / D.sv, iu = Math.floor(fu), iv = Math.floor(fv); fu = (fu - iu) * D.su; fv = (fv - iv) * D.sv;
    var du = Math.min(fu, D.su - fu), dv = Math.min(fv, D.sv - fv), hw = D.sw * 0.5;
    if (D.style === 'city' || D.style === 'suburb'){
      // Đường phố: lòng đường nhựa, vạch giữa nét đứt, vạch qua đường ở đầu giao lộ, vỉa hè có bó vỉa.
      if (!OSM && (du < hw || dv < hw)){ setc(PAL.street, o);
        if (du < hw && dv < hw) return;
        var ac = du < hw ? du : dv, al = du < hw ? fv : fu, xd = du < hw ? dv : du;
        if (xd < hw + 0.07){ if (((du < hw ? u : v) * 22 & 1) === 0 && ac < hw - 0.015) setc(PAL.mark, o); return; }
        if (ac < 0.014 && (al * 6 & 1) === 0) setc(PAL.mark, o);
        return; }
      if (!OSM && (du < hw + 0.034 || dv < hw + 0.034)){ setc((du < hw + 0.008 || dv < hw + 0.008) ? PAL.curb : PAL.walk, o); return; }
      var c = URB[(ih(Math.floor(u / 0.3) + D.i * 7777, Math.floor(v / 0.3)) * URB.length) | 0];
      if (D.style === 'suburb') mixc(o, c, 0.5, o); else mixc(PAL.urban, c, 0.75, o);
    } else if (D.style === 'village'){
      mixc(o, PAL.village, 0.35, o);
      if (dv < 0.07 && ih(iv, D.i * 31 + 5) < 0.75) setc(PAL.lane, o);
      else if (du < 0.06 && ih(iu, D.i * 17 + 3) < 0.35) setc(PAL.lane, o);
    } else {
      mixc(o, PAL.lawn, 0.75, o);
      if (du < 0.06 || dv < 0.06) setc(PAL.path, o);
    }
  } else if (zn === 2){
    var a = x * FCA + z * FSA, b = -x * FSA + z * FCA, cu = Math.floor(a / 0.7), cv = Math.floor(b / 1.25), fa = a / 0.7 - cu, fb = b / 1.25 - cv;
    var blk = ih(cu >> 2, (cv >> 1) + 99), r = ih(cu, cv), c2 = blk < 0.05 ? FLOOD : (blk > 0.95 ? FALLOW : RICE[(r * RICE.length) | 0]);
    mixc(o, c2, 0.8, o); var lift = (r - 0.5) * 8; o[0] += lift; o[1] += lift; o[2] += lift * 0.6;
    if (fa < 0.07 || fb < 0.045) mixc(o, PAL.bund, 0.8, o);
  } else if (zn === 3){
    var pa = x * PCA + z * PSA, pb = -x * PSA + z * PCA, ca3 = Math.floor(pa / 0.7), cb3 = Math.floor(pb / 0.55), a3 = pa / 0.7 - ca3, b3 = pb / 0.55 - cb3;
    if (a3 < 0.13 || b3 < 0.15) mixc(o, PAL.dike, 0.9, o); else mixc(o, PONDC[(ih(ca3, cb3) * PONDC.length) | 0], 0.95, o);
  }
}
function paintGround(data, TW, TH, G, rx, rz, rw, rd, row0, row1){
  if (rx == null){ rx = BX0; rz = BZ0; rw = BW; rd = BD; } if (row0 == null){ row0 = 0; row1 = TH; }
  var GX = G.GX, GZ = G.GZ, hA = G.h, nA = G.n, zA = G.zone, sA = G.slope, lA = G.lc, cx = G.cx, cz = G.cz, sx = rw / TW, sz = rd / TH, o = [0, 0, 0];
  for (var py = row0; py < row1; py++){
    var z = rz + (py + 0.5) * sz, gzf = (z - BZ0) / cz, j0 = gzf | 0; if (j0 > GZ - 2) j0 = GZ - 2; if (j0 < 0) j0 = 0; var fz = gzf - j0;
    for (var px = 0; px < TW; px++){
      var x = rx + (px + 0.5) * sx, gxf = (x - BX0) / cx, i0 = gxf | 0; if (i0 > GX - 2) i0 = GX - 2; if (i0 < 0) i0 = 0; var fx = gxf - i0, k = j0 * GX + i0;
      var hh = (hA[k] * (1 - fx) + hA[k + 1] * fx) * (1 - fz) + (hA[k + GX] * (1 - fx) + hA[k + GX + 1] * fx) * fz;
      var nn = (nA[k] * (1 - fx) + nA[k + 1] * fx) * (1 - fz) + (nA[k + GX] * (1 - fx) + nA[k + GX + 1] * fx) * fz;
      var r1 = ih((x * 8) | 0, (z * 8) | 0), r2 = ih(((z * 8) | 0) + 7919, (x * 8) | 0);
      var ii = (gxf + (r1 - 0.5) * 0.9 + 0.5) | 0, jj = (gzf + (r2 - 0.5) * 0.9 + 0.5) | 0;
      if (ii > GX - 1) ii = GX - 1; if (jj > GZ - 1) jj = GZ - 1; if (ii < 0) ii = 0; if (jj < 0) jj = 0;
      var kk = jj * GX + ii;
      groundColor(x, z, hh, nn, zA[kk], sA[kk], o, lA ? lA[kk] : 0);
      var q = (py * TW + px) * 4, g = (r1 - 0.5) * 7;
      data[q] = o[0] + g; data[q + 1] = o[1] + g; data[q + 2] = o[2] + g; data[q + 3] = 255;
    }
  }
}
function worldCtx(ctx, W, Hh, rx, rz, rw, rd){ if (rx == null){ rx = BX0; rz = BZ0; rw = BW; rd = BD; } ctx.setTransform(W / rw, 0, 0, Hh / rd, -rx * W / rw, -rz * Hh / rd); }
function strokeLine(ctx, pts){ ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
function fillPoly(ctx, pts){ ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); }
function landRuns(samples){ var runs = [], cur = []; samples.forEach(function(s){ if (!s.br){ cur.push([s.x, s.z]); } else { if (cur.length > 1) runs.push(cur); cur = []; } }); if (cur.length > 1) runs.push(cur); return runs; }

/* ---------- buildings ---------- */
var TUBE_C = ['#f4e2a1','#cfe8d6','#d3dde3','#d5e3f1','#ffffff','#f5d6df','#eadcc6','#fff1cf','#c9e2e8','#f6f0e4','#dfe6dc'];
var VILLA_C = ['#fbf3e4','#fff8ee','#f3e3c3','#e6efe0','#f6e6d6'];
var ROOF_C = ['#b94a34','#a8432f','#9c5a3c','#66705f','#5f7380'];
var TOWER_C = ['#ffffff','#e7f1f6','#f6efe3','#dcebe8','#cfe1ec','#f3f3f3','#e9e4da'];
var TUBE_F = [2,3,4,5,6], TOWER_F = [8,12,18,26,36,46], MID_F = [3,5,7,9];
function nearestIdx(arr, v){ var b = 0; for (var i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[b] - v)) b = i; return b; }
function genBuildings(G, MK, dens, extraTowers){
  if (OSM) return genBuildingsOSM(G, MK, dens, extraTowers);
  var out = { tubes:[], towers:[], mids:[], villas:[], tanks:[], yard:[] }, rb = mulberry32(77);
  function R(a, b){ return a + (b - a) * rb(); }
  function ok(D, x, z, hw, hd, ang){
    if (!inBoard(x, z, 2)) return false;
    if (G.zoneAt(x, z) !== 10 + D.i) return false;
    var cd = coastX(z) - x; if (cd > 0 && cd < 3.0) return false;
    if (MK(x, z)) return false;
    var c = Math.cos(ang), s = Math.sin(ang), h = G.hAt(x, z), lo = h, hi = h;
    for (var k = 0; k < 4; k++){ var sx = (k & 1 ? 1 : -1) * hw, sz = (k & 2 ? 1 : -1) * hd, px = x + sx * c - sz * s, pz = z + sx * s + sz * c, hh = G.hAt(px, pz);
      if (hh < lo) lo = hh; if (hh > hi) hi = hh; if (MK(px, pz)) return false; }
    if (hi - lo > 0.3 || lo < 0.3 || hi > 2.6) return false;
    return lo - 0.02;
  }
  // fc: mặt tiền quay về +z (1) hay −z (−1) của khung toạ độ riêng căn nhà, tức là quay ra đường
  function tube(D, u, v, w, d, rot90, fl, fc){ var p = toWorld(D, u, v), ang = D.ang + (rot90 ? Math.PI / 2 : 0), y = ok(D, p[0], p[1], w / 2, d / 2, ang); if (y === false) return;
    var f = TUBE_F[nearestIdx(TUBE_F, fl)];
    out.tubes.push({ x:p[0], z:p[1], y:y, w:w, d:d, h:f * FLOOR, r:-ang, fc:fc || 1, f:f, c:TUBE_C[(rb() * TUBE_C.length) | 0] });
    if (rb() < 0.45) out.tanks.push({ x:p[0] + (rb() - 0.5) * w * 0.4, z:p[1] + (rb() - 0.5) * d * 0.5, y:y + f * FLOOR, r:-ang }); }
  function villa(D, u, v, w, d, fl, roofed, wall, roofC, fc){ var p = toWorld(D, u, v), y = ok(D, p[0], p[1], w / 2, d / 2, D.ang); if (y === false) return;
    out.villas.push({ x:p[0], z:p[1], y:y, w:w, d:d, h:fl * FLOOR * 0.95, r:-D.ang, fc:fc || 1, roof:roofed, c:wall || VILLA_C[(rb() * VILLA_C.length) | 0], rc:roofC || ROOF_C[(rb() * ROOF_C.length) | 0] }); }
  function tower(D, u, v, w, d, fl, kind){ var p = toWorld(D, u, v), y = ok(D, p[0], p[1], w / 2, d / 2, D.ang); if (y === false) return;
    var arr = kind === 'mid' ? MID_F : TOWER_F, f = arr[nearestIdx(arr, fl)];
    (kind === 'mid' ? out.mids : out.towers).push({ x:p[0], z:p[1], y:y, w:w, d:d, h:f * FLOOR, r:-D.ang, f:f, c:TOWER_C[(rb() * TOWER_C.length) | 0], pool: kind !== 'mid' && rb() < 0.35 }); }
  DIST.forEach(function(D){
    var us = [], vs = []; D.poly.forEach(function(p){ var l = toLocal(D, p[0], p[1]); us.push(l[0]); vs.push(l[1]); });
    var i0 = Math.floor(Math.min.apply(null, us) / D.su), i1 = Math.floor(Math.max.apply(null, us) / D.su), j0 = Math.floor(Math.min.apply(null, vs) / D.sv), j1 = Math.floor(Math.max.apply(null, vs) / D.sv);
    var hw = D.sw / 2 + 0.03, keep = D.dens * dens;
    for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++){
      var u0 = i * D.su + hw, u1 = (i + 1) * D.su - hw, v0 = j * D.sv + hw, v1 = (j + 1) * D.sv - hw;
      var bc = toWorld(D, (u0 + u1) / 2, (v0 + v1) / 2);
      if (!inPoly(bc[0], bc[1], D.poly) && !inPoly(toWorld(D, u0, v0)[0], toWorld(D, u0, v0)[1], D.poly) && !inPoly(toWorld(D, u1, v1)[0], toWorld(D, u1, v1)[1], D.poly)) continue;
      if (D.style === 'city'){
        var cd = coastX(bc[1]) - bc[0];
        if (D.coastal && cd > 2.8 && cd < 7.4){
          var n = cd < 4.8 && rb() < 0.6 ? 2 : 1, span = (u1 - u0) / n;
          for (var t = 0; t < n; t++){ if (rb() > Math.min(1, keep + 0.25)) continue;
            tower(D, u0 + (t + 0.5) * span, (v0 + v1) / 2 + R(-0.1, 0.1), Math.min(R(0.55, 0.95), span - 0.15), Math.min(R(0.7, 1.3), v1 - v0 - 0.2), cd < 4.8 ? R(14, 46) : R(8, 24), 'tower'); }
          continue;
        }
        var maxd = Math.min(0.62, (v1 - v0) / 2 - 0.02), boost = (D.id === 'center' || D.id === 'oldq') ? 0.6 : 0;
        [[v0, 1], [v1, -1]].forEach(function(e){ var u = u0; while (u < u1 - 0.14){ var lw = R(0.15, 0.26); if (u + lw > u1) break; var dep = Math.min(R(0.36, 0.62), maxd);
            if (rb() < keep) tube(D, u + lw / 2, e[0] + e[1] * dep / 2, lw - 0.014, dep, false, 2 + Math.floor(Math.pow(rb(), 1.6) * 5 + boost * rb()), -e[1]);
            u += lw; } });
        [[u0, 1], [u1, -1]].forEach(function(e){ var v = v0 + maxd + 0.02; while (v < v1 - maxd - 0.14){ var lw = R(0.15, 0.26); if (v + lw > v1 - maxd) break; var dep = Math.min(R(0.36, 0.6), (u1 - u0) / 2 - 0.02);
            if (rb() < keep) tube(D, e[0] + e[1] * dep / 2, v + lw / 2, lw - 0.014, dep, true, 2 + Math.floor(Math.pow(rb(), 1.6) * 5 + boost * rb()), e[1]);
            v += lw; } });
        var iw = (u1 - u0) - 1.34, idp = (v1 - v0) - 1.34;
        if (iw > 0.35 && idp > 0.3){ var r = rb(), ic = toWorld(D, (u0 + u1) / 2, (v0 + v1) / 2);
          if (r < 0.42 && rb() < keep) tower(D, (u0 + u1) / 2, (v0 + v1) / 2, iw * R(0.55, 0.9), idp * R(0.55, 0.9), R(3, 9), 'mid');
          else if (r < 0.85) for (var q = 0; q < 3; q++) out.yard.push({ x:ic[0] + (rb() - 0.5) * iw, z:ic[1] + (rb() - 0.5) * idp }); }
      } else if (D.style === 'suburb'){
        [[v0, 1], [v1, -1]].forEach(function(e){ var u = u0; while (u < u1 - 0.3){ var lw = R(0.3, 0.5); if (rb() < keep){ var dep = R(0.3, 0.45);
              if (rb() < 0.55) villa(D, u + lw / 2, e[0] + e[1] * (dep / 2 + 0.05), lw - 0.08, dep, 1 + Math.floor(rb() * 2.4), rb() < 0.7, null, null, -e[1]);
              else tube(D, u + lw / 2, e[0] + e[1] * dep / 2, Math.min(0.26, lw - 0.05), dep + 0.1, false, 2 + Math.floor(rb() * 3), -e[1]); }
            u += lw; } });
        var yc = toWorld(D, (u0 + u1) / 2, (v0 + v1) / 2); for (var y2 = 0; y2 < 3; y2++) out.yard.push({ x:yc[0] + (rb() - 0.5) * 2, z:yc[1] + (rb() - 0.5) * 1.5 });
      } else if (D.style === 'village'){
        var cnt = Math.round((u1 - u0) * (v1 - v0) * 1.1 * keep);
        for (var c = 0; c < cnt; c++){ var uu = R(u0 + 0.2, u1 - 0.2), vv = R(v0 + 0.2, v1 - 0.2);
          if (rb() < 0.3) tube(D, uu, vv, R(0.18, 0.24), R(0.32, 0.45), false, 2, ih(uu * 31, vv * 17) < 0.5 ? 1 : -1);
          else villa(D, uu, vv, R(0.2, 0.32), R(0.24, 0.4), 1, true, null, null, ih(uu * 31, vv * 17) < 0.5 ? 1 : -1); }
      } else {
        [[v0, 1], [v1, -1]].forEach(function(e){ var u = u0; while (u < u1 - 0.3){ if (rb() < keep) villa(D, u + 0.22, e[0] + e[1] * 0.3, 0.3, 0.3, 1, true, '#fbf8f1', rb() < 0.5 ? '#5b4636' : '#2f5d62', -e[1]); u += R(0.55, 0.75); } });
      }
    }
  });
  (extraTowers || []).forEach(function(t){ var p = P(t[0], t[1]), y = G.hAt(p[0], p[1]); out.towers.push({ x:p[0], z:p[1], y:y - 0.02, w:t[2], d:t[3], h:t[4] * FLOOR, r:t[5] || 0, f:TOWER_F[nearestIdx(TOWER_F, t[4])], c:'#fbf7ef', pool:false }); });
  return out;
}

/* ---------- OpenStreetMap (osm-data.js, sinh bởi tools/fetch-osm.js; © OpenStreetMap contributors, ODbL) ---------- */
// OSM.roads: { c: loại (chỉ số trong OSM_DATA.classes), l: số làn, name, bridge, w: bề rộng (đơn vị), pts:[[x,z]…] }
// OSM.builds: { lv: số tầng (0 = không rõ), k: 0 nhà ở / 1 thương mại / 2 khác, pts: đa giác chân đế }
var ROAD_W = [0.56, 0.56, 0.5, 0.42, 0.34, 0.24, 0.2, 0.16, 0.12];   // motorway … service(alley), đã phóng to như đường cũ
var OSM = (function(){ if (typeof OSM_DATA === 'undefined') return null; var D = OSM_DATA;
  function i16(s){ var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Int16Array(u.buffer); }
  function polys(o, hn, mk){ var hd = i16(o.hd), co = i16(o.co), out = [], h = 0, p = 0;
    for (var n = 0; n < o.n; n++){ var np = hd[h], meta = []; for (var k = 1; k <= hn; k++) meta.push(hd[h + k]); h += hn + 1;
      var pts = []; for (k = 0; k < np; k++){ pts.push([co[p] / D.q, co[p + 1] / D.q]); p += 2; } out.push(mk(meta, pts)); }
    return out; }
  // cờ m[3]: 1 cầu, 2 một chiều — đường đôi trong OSM là hai đường một chiều song song, mỗi bên chỉ rộng ~nửa đường hai chiều; 4 bùng binh
  var roads = polys(D.roads, 4, function(m, pts){ var ow = !!(m[3] & 2); return { c:m[0], l:m[1], name:m[2] >= 0 ? D.names[m[2]] : '', bridge:!!(m[3] & 1), round:!!(m[3] & 4), oneway:ow, w:ow ? Math.max(ROAD_W[m[0]] * 0.55, m[1] * 0.09, 0.12) : Math.max(ROAD_W[m[0]], m[1] * 0.09), pts:pts }; });
  var builds = polys(D.builds, 2, function(m, pts){ return { lv:m[0], k:m[1], pts:pts }; });
  var rails = (D.rails || []).map(function(r){ var c = i16(r), o = []; for (var i = 0; i + 1 < c.length; i += 2) o.push([c[i] / D.q, c[i + 1] / D.q]); return o; }), i;
  // mặt nạ RLE (mặt nước, đất đảo) -> trường khoảng cách có dấu (đơn vị bản đồ; âm = trong mặt nạ), chamfer hai lượt
  function field(W){ if (!W) return null; var b = atob(W.rle), u = new Uint8Array(b.length), i; for (i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    var runs = new Uint16Array(u.buffer), N = W.w * W.h, m = new Uint8Array(N), p = 0, v = 0; for (i = 0; i < runs.length; i++){ if (v) m.fill(1, p, p + runs[i]); p += runs[i]; v ^= 1; }
    var dIn = new Float32Array(N), dOut = new Float32Array(N), nx = W.w, nz = W.h, D1 = W.step, D2 = W.step * 1.4142;
    for (i = 0; i < N; i++){ dOut[i] = m[i] ? 0 : 1e9; dIn[i] = m[i] ? 1e9 : 0; }
    [dOut, dIn].forEach(function(d){ var j, k, q, x;
      for (j = 0; j < nz; j++) for (x = 0; x < nx; x++){ k = j * nx + x; q = d[k]; if (q === 0) continue;
        if (x > 0) q = Math.min(q, d[k - 1] + D1); if (j > 0){ q = Math.min(q, d[k - nx] + D1); if (x > 0) q = Math.min(q, d[k - nx - 1] + D2); if (x < nx - 1) q = Math.min(q, d[k - nx + 1] + D2); } d[k] = q; }
      for (j = nz - 1; j >= 0; j--) for (x = nx - 1; x >= 0; x--){ k = j * nx + x; q = d[k]; if (q === 0) continue;
        if (x < nx - 1) q = Math.min(q, d[k + 1] + D1); if (j < nz - 1){ q = Math.min(q, d[k + nx] + D1); if (x < nx - 1) q = Math.min(q, d[k + nx + 1] + D2); if (x > 0) q = Math.min(q, d[k + nx - 1] + D2); } d[k] = q; } });
    var f = new Float32Array(N); for (i = 0; i < N; i++) f[i] = m[i] ? -(dIn[i] - W.step / 2) : dOut[i] - W.step / 2;
    return { f:f, w:nx, h:nz, step:W.step }; }
  var wd = field(D.water), ld = field(D.land);
  return { roads:roads, builds:builds, classes:D.classes, rails:rails, water:wd, land:ld }; })();
// bùng binh: OSM chia một vòng xoay thành nhiều cung; gom các cung chung đầu mút (hoặc gần nhau) thành một vòng, tâm = trung bình điểm,
// bán kính tim đường = khoảng cách trung bình tới tâm, bề rộng làn theo cấp đường lớn nhất của vòng (hẹp hơn bán kính)
function osmRoundabouts(){ var arcs = OSM.roads.filter(function(R){ return R.round; }), grp = arcs.map(function(a, i){ return i; });
  function root(i){ while (grp[i] !== i) i = grp[i] = grp[grp[i]]; return i; }
  for (var i = 0; i < arcs.length; i++) for (var j = i + 1; j < arcs.length; j++){ var A = arcs[i].pts, B = arcs[j].pts, hit = false;
    [A[0], A[A.length - 1]].forEach(function(p){ [B[0], B[B.length - 1]].forEach(function(q){ if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.25) hit = true; }); });
    if (hit) grp[root(i)] = root(j); }
  // tâm, bán kính: nội suy đường tròn bình phương tối thiểu (Kåsa) — cung hở thì trung bình điểm lệch khỏi tâm
  function fit(pts){ var n = pts.length, mx = 0, mz = 0; pts.forEach(function(p){ mx += p[0]; mz += p[1]; }); mx /= n; mz /= n;
    var Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
    pts.forEach(function(p){ var u = p[0] - mx, v = p[1] - mz; Suu += u * u; Svv += v * v; Suv += u * v; Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u; });
    var det = Suu * Svv - Suv * Suv, uc, vc; if (Math.abs(det) < 1e-9){ uc = 0; vc = 0; }
    else { var b1 = (Suuu + Suvv) / 2, b2 = (Svvv + Svuu) / 2; uc = (b1 * Svv - b2 * Suv) / det; vc = (Suu * b2 - Suv * b1) / det; }
    var cx = mx + uc, cz = mz + vc, r = 0; pts.forEach(function(p){ r += Math.hypot(p[0] - cx, p[1] - cz); }); return { x:cx, z:cz, r:r / n }; }
  var G0 = {}; arcs.forEach(function(a, i){ (G0[root(i)] = G0[root(i)] || []).push(a); });
  var L = Object.keys(G0).map(function(k){ var pts = []; G0[k].forEach(function(a){ pts = pts.concat(a.pts); }); var f = fit(pts); f.arcs = G0[k]; f.pts = pts; return f; });
  for (var m = 0; m < L.length; m++) for (var q = m + 1; q < L.length; q++){ var A2 = L[m], B2 = L[q];   // gộp các cung rời của cùng một vòng xoay
    if (A2.arcs && B2.arcs && Math.hypot(A2.x - B2.x, A2.z - B2.z) < Math.max(A2.r, B2.r) * 0.6 && Math.abs(A2.r - B2.r) < Math.max(A2.r, B2.r) * 0.6){
      var pts2 = A2.pts.concat(B2.pts), f2 = fit(pts2); f2.arcs = A2.arcs.concat(B2.arcs); f2.pts = pts2; L[m] = f2; L.splice(q, 1); q = m; } }
  return L.map(function(o){ var c = 9; o.arcs.forEach(function(a){ c = Math.min(c, a.c); }); var w = Math.min(ROAD_W[c] * 0.6, o.r * 0.75);
    // vòng khép kín theo đúng hình OSM: điểm các cung xếp theo góc quanh tâm (vòng xoay hình trứng vẫn đúng hình)
    var ring = o.pts.slice().sort(function(a, b){ return Math.atan2(a[1] - o.z, a[0] - o.x) - Math.atan2(b[1] - o.z, b[0] - o.x); });
    w = Math.max(w, 0.08); var inner = ring.map(function(p){ var d = Math.hypot(p[0] - o.x, p[1] - o.z) || 1, k = Math.max(0, d - w / 2 - 0.01) / d; return [o.x + (p[0] - o.x) * k, o.z + (p[1] - o.z) * k]; });
    return { x:o.x, z:o.z, r:o.r, w:w, c:c, arcs:o.arcs, ring:ring, inner:inner }; }).filter(function(o){ return o.r > 0.08 && o.r < 3; }); }
// khoảng cách tới bùng binh gần nhất trừ bán kính ngoài (âm = trên vòng hoặc đảo)
function roundD(x, z){ var m = 1e9; for (var i = 0; i < ROUNDS.length; i++){ var o = ROUNDS[i], d = Math.hypot(x - o.x, z - o.z) - o.r - o.w / 2; if (d < m) m = d; } return m; }
var ROUNDS = OSM ? osmRoundabouts() : [];
if (OSM && OSM.rails.length) RAIL = OSM.rails[0];   // đường sắt thật: chuỗi dài nhất cho tàu chạy, các chuỗi khác (bãi ga, đường vòng) chỉ vẽ ray
// khoảng cách có dấu tới mặt nước OSM (nội suy song tuyến); ngoài lưới coi như xa nước
function osmLandS(x, z){ return fieldS(OSM.land, x, z); }   // khoảng cách có dấu tới đất đảo OSM (âm = trên đảo)
function osmWaterS(x, z){ return fieldS(OSM.water, x, z); }
function fieldS(W, x, z){ var gx = (x - BX0) / W.step - 0.5, gz = (z - BZ0) / W.step - 0.5;
  if (gx < 0 || gz < 0 || gx >= W.w - 1 || gz >= W.h - 1) return 1e3; var i = gx | 0, j = gz | 0, a = gx - i, c = gz - j, k = j * W.w + i, f = W.f;
  return (f[k] * (1 - a) + f[k + 1] * a) * (1 - c) + (f[k + W.w] * (1 - a) + f[k + W.w + 1] * a) * c; }

// hình chữ nhật bao nhỏ nhất (thử hướng của từng cạnh): tâm, rộng (theo hướng ang), sâu
function obbOf(pts){ var best = null;
  for (var i = 0; i < pts.length; i++){ var a = pts[i], b = pts[(i + 1) % pts.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang), u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (var k = 0; k < pts.length; k++){ var u = pts[k][0] * c + pts[k][1] * s, v = -pts[k][0] * s + pts[k][1] * c; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    var area = (u1 - u0) * (v1 - v0); if (!best || area < best.area){ var cu = (u0 + u1) / 2, cv = (v0 + v1) / 2; best = { area:area, ang:ang, w:u1 - u0, d:v1 - v0, x:cu * c - cv * s, z:cu * s + cv * c }; } }
  return best; }

// Sinh nhà khi có OSM: (1) chân đế thật từ OSM; (2) chỗ còn trống thì xếp nhà dọc hai bên đường thật, quay mặt ra phố;
// (3) lõi khối phố thì thêm chung cư thấp tầng / sân vườn. Kiểu nhà theo khu (DIST: city/suburb/village/resort) như cũ.
function genBuildingsOSM(G, MK, dens, extraTowers){
  var out = { tubes:[], towers:[], mids:[], villas:[], tanks:[], yard:[] }, rb = mulberry32(77), occ = new Map();
  function R(a, b){ return a + (b - a) * rb(); }
  function key(x, z){ return (Math.floor(x * 2) + 2000) * 4000 + Math.floor(z * 2) + 2000; }
  function free(x, z, r){ for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++){ var a = occ.get(key(x + i * 0.5, z + j * 0.5)); if (a) for (var k = 0; k < a.length; k++){ var q = a[k]; if (Math.hypot(q[0] - x, q[1] - z) < q[2] + r) return false; } } return true; }
  function mark(x, z, r){ var k = key(x, z), a = occ.get(k); if (!a){ a = []; occ.set(k, a); } a.push([x, z, r]); }
  // mặt bằng: trên đất, không phải bãi biển sát bờ, không đè đường / địa danh (MK), không quá dốc; trả về độ cao đặt nhà
  // back ≠ 0: lô mặt tiền, mặt sau theo hướng pháp tuyến back. Mặt nạ MK (ô 12,5 m, khử răng cưa) phủ lấn mép đường nhỏ,
  // nên lô mặt tiền chỉ hỏi MK ở nửa sau (địa danh, sông, đường lớn); khoảng cách tới đường nhỏ khác kiểm bằng ROCC.
  function ok(x, z, hw, hd, ang, needDist, back){
    if (!inBoard(x, z, 2)) return false; var zn = G.zoneAt(x, z); if (needDist && zn < 10) return false;
    var cd = coastX(z) - x; if (cd > 0 && cd < 2.6) return false;
    var c = Math.cos(ang), s = Math.sin(ang), lo = 1e9, hi = -1e9;
    if (back){ var bx = x - s * back * hd * 0.5, bz = z + c * back * hd * 0.5; if (MK(bx, bz)) return false; } else if (MK(x, z)) return false;
    for (var k = 0; k < 4; k++){ var sx = (k & 1 ? 1 : -1) * hw, sz = (k & 2 ? 1 : -1) * hd, px = x + sx * c - sz * s, pz = z + sx * s + sz * c, hh = G.hAt(px, pz);
      if (hh < lo) lo = hh; if (hh > hi) hi = hh;
      if (back){ var rf = rfree(px, pz, 0); if (!rf || (sz * back > 0 && rf === 1 && MK(px, pz))) return false; } else if (MK(px, pz)) return false; }
    if (back){ for (var t = -0.3; t <= 0.31; t += 0.3) if (!rfree(x - s * t * hd * 2, z + c * t * hd * 2, 0)) return false; }
    if (hi - lo > 0.3 || lo < 0.3 || hi > 2.6) return false; return lo - 0.02; }
  // chiếm chỗ của đường thật (tâm đường, bán kính = nửa bề rộng): rfree trả 0 nếu đè đường, 1 nếu trống, 2 nếu trống mà gần đường (MK đỏ do khử răng cưa)
  var rocc = new Map();
  OSM.roads.forEach(function(Rd){ var hw = Rd.w / 2 + SIDEWALK(Rd.c) + 0.02, Q = Rd.pts; for (var i = 0; i < Q.length - 1; i++){ var dx = Q[i + 1][0] - Q[i][0], dz = Q[i + 1][1] - Q[i][1], L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / 0.1));
    for (var j = 0; j <= n; j++){ var x = Q[i][0] + dx * j / n, z = Q[i][1] + dz * j / n, k = key(x, z), a = rocc.get(k); if (!a){ a = []; rocc.set(k, a); } a.push([x, z, hw]); } } });
  function rfree(x, z, r){ var near = false; for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++){ var a = rocc.get(key(x + i * 0.5, z + j * 0.5)); if (a) for (var k = 0; k < a.length; k++){ var q = a[k], d = Math.hypot(q[0] - x, q[1] - z) - q[2] - r; if (d < 0) return 0; if (d < 0.45) near = true; } } return near ? 2 : 1; }
  function cornersFree(x, z, hw, hd, ang){ var c = Math.cos(ang), s = Math.sin(ang); for (var k = 0; k < 4; k++){ var sx = (k & 1 ? 1 : -1) * hw, sz = (k & 2 ? 1 : -1) * hd; if (!rfree(x + sx * c - sz * s, z + sx * s + sz * c, 0)) return false; } return rfree(x, z, 0) !== 0; }
  function styleAt(x, z){ var zn = G.zoneAt(x, z); return zn >= 10 ? DIST[zn - 10] : null; }
  function addTube(x, z, y, w, d, ang, fl, fc){ var f = TUBE_F[nearestIdx(TUBE_F, fl)];
    out.tubes.push({ x:x, z:z, y:y, w:w, d:d, h:f * FLOOR, r:-ang, fc:fc, f:f, c:TUBE_C[(rb() * TUBE_C.length) | 0] });
    if (rb() < 0.45) out.tanks.push({ x:x + (rb() - 0.5) * w * 0.4, z:z + (rb() - 0.5) * d * 0.5, y:y + f * FLOOR, r:-ang }); }
  function addVilla(x, z, y, w, d, ang, fl, fc, D){ var res = D && D.style === 'resort';
    out.villas.push({ x:x, z:z, y:y, w:w, d:d, h:fl * FLOOR * 0.95, r:-ang, fc:fc, roof:res || rb() < 0.7, c:res ? '#fbf8f1' : VILLA_C[(rb() * VILLA_C.length) | 0], rc:res ? (rb() < 0.5 ? '#5b4636' : '#2f5d62') : ROOF_C[(rb() * ROOF_C.length) | 0] }); }
  function addBlock(list, F, C, x, z, y, w, d, ang, fl, pool){ var f = F[nearestIdx(F, fl)]; list.push({ x:x, z:z, y:y, w:w, d:d, h:f * FLOOR, r:-ang, f:f, c:C[(rb() * C.length) | 0], pool:!!pool }); }
  // (1) chân đế OSM
  OSM.builds.forEach(function(b){ var o = obbOf(b.pts); if (!o || o.w * o.d < 0.006) return;
    var w = Math.max(o.w, 0.12), d = Math.max(o.d, 0.12), ang = o.ang; if (w > 3 || d > 3) return;
    var y = ok(o.x, o.z, w / 2, d / 2, ang, false); if (y === false) return;
    var D = styleAt(o.x, o.z), st = D ? D.style : 'village', lv = b.lv || (st === 'city' ? 2 + Math.floor(Math.pow(rb(), 1.6) * 5) : 1 + Math.floor(rb() * 2));
    if (lv >= 8) addBlock(out.towers, TOWER_F, TOWER_C, o.x, o.z, y, w, d, ang, lv, rb() < 0.3);
    else if (w * d > 0.3 && lv >= 3) addBlock(out.mids, MID_F, TOWER_C, o.x, o.z, y, w, d, ang, lv);
    else if (st === 'city' || Math.min(w, d) < 0.24) addTube(o.x, o.z, y, w, d, ang, lv, rb() < 0.5 ? 1 : -1);
    else addVilla(o.x, o.z, y, w, d, ang, lv, rb() < 0.5 ? 1 : -1, D);
    mark(o.x, o.z, Math.min(w, d) * 0.5); });
  // (2) mặt tiền dọc đường thật (bỏ cao tốc, quốc lộ; chỉ trong các khu dân cư DIST)
  OSM.roads.forEach(function(Rd){ if (Rd.c <= 1 || Rd.bridge) return; var P2 = Rd.pts;
    for (var i = 0; i < P2.length - 1; i++){ var ax = P2[i][0], az = P2[i][1], dx = P2[i + 1][0] - ax, dz = P2[i + 1][1] - az, L = Math.hypot(dx, dz); if (L < 0.3) continue;
      var fx = dx / L, fz = dz / L, nx = -fz, nz = fx, ang = Math.atan2(fz, fx);
      [1, -1].forEach(function(s){ var u = 0.12;
        while (u < L - 0.12){ var mx = ax + fx * u + nx * s * 0.6, mz = az + fz * u + nz * s * 0.6, D = styleAt(mx, mz);
          if (!D){ u += 0.5; continue; }
          var city = D.style === 'city', lw = city ? R(0.15, 0.26) : R(0.3, 0.5), dep = city ? R(0.36, 0.6) : R(0.3, 0.45); if (u + lw > L - 0.08) break;
          var off = Rd.w / 2 + SIDEWALK(Rd.c) + 0.03 + dep / 2, cx = ax + fx * (u + lw / 2) + nx * s * off, cz = az + fz * (u + lw / 2) + nz * s * off, r = Math.min(lw, dep) * 0.5;
          if (rb() < D.dens * dens * (city ? 1.15 : 0.9) && free(cx, cz, r * 0.95)){
            var y = ok(cx, cz, (lw - 0.014) / 2, dep / 2, ang, true, s);
            if (y !== false){ if (city || (D.style === 'suburb' && rb() < 0.45)) addTube(cx, cz, y, lw - 0.014, dep, ang, city ? 2 + Math.floor(Math.pow(rb(), 1.6) * 5) : 2 + Math.floor(rb() * 3), -s);
              else addVilla(cx, cz, y, lw - 0.08, dep, ang, D.style === 'suburb' ? 1 + Math.floor(rb() * 2.4) : 1, -s, D);
              mark(cx, cz, r); } }
          u += lw; } }); } });
  // (3) lõi khối phố: chung cư thấp tầng hoặc sân vườn có cây
  DIST.forEach(function(D){ if (D.style !== 'city') return; var b = D.box, n = Math.round((b[2] - b[0]) * (b[3] - b[1]) * 0.35 * dens);
    for (var k = 0; k < n; k++){ var x = R(b[0], b[2]), z = R(b[1], b[3]); if (!inPoly(x, z, D.poly) || !free(x, z, 0.45)) continue;
      if (rb() < 0.45){ var w = R(0.5, 0.9), d = R(0.45, 0.8), ang = R(0, Math.PI), y = ok(x, z, w / 2, d / 2, ang, true); if (y !== false && cornersFree(x, z, w / 2, d / 2, ang)){ addBlock(out.mids, MID_F, TOWER_C, x, z, y, w, d, ang, R(3, 9)); mark(x, z, Math.min(w, d) / 2); } }
      else if (!MK(x, z)) out.yard.push({ x:x, z:z }); } });
  (extraTowers || []).forEach(function(t){ var p = P(t[0], t[1]), y = G.hAt(p[0], p[1]); out.towers.push({ x:p[0], z:p[1], y:y - 0.02, w:t[2], d:t[3], h:t[4] * FLOOR, r:t[5] || 0, f:TOWER_F[nearestIdx(TOWER_F, t[4])], c:'#fbf7ef', pool:false }); });
  return out;
}

/* ---------- vegetation ---------- */
// lề (vỉa hè) mỗi bên đường theo cấp OSM c, đơn vị bản đồ: đường lớn (c ≤ 4) vỉa hè 6,5 m (vẽ ở drawOverlays: w + 0,26), đường nhỏ 2,5 m
function SIDEWALK(c){ return c <= 4 ? 0.13 : 0.05; }
var LC_TREES = { 10:0.85, 20:0.4, 30:0.12, 40:0.05, 50:0.12, 60:0.02, 80:0, 90:0.08, 95:0.9 };
function genTrees(G, MK, stepSize, dens){
  var round = [], cones = [], palms = [], rt = mulberry32(99);
  for (var z = BZ0 + 1; z < BZ1 - 1; z += stepSize) for (var x = BX0 + 1; x < BX1 - 1; x += stepSize){
    var jx = x + rt() * stepSize, jz = z + rt() * stepSize; if (!inBoard(jx, jz, 1.5)) continue;
    var h = G.hAt(jx, jz); if (h < 0.3) continue;
    var zn = G.zoneAt(jx, jz), sl = G.slopeAt(jx, jz), n = G.nAt(jx, jz), p;
    if (zn >= 10){ var st = DIST[zn - 10].style; p = st === 'village' ? 0.45 : (st === 'resort' ? 0.4 : (st === 'suburb' ? 0.25 : 0.03)); }
    else if (zn === 2) p = 0.03; else if (zn === 3) p = 0.05;
    else { p = h > 1.1 ? 0.6 + 0.4 * n : 0.2 + 0.35 * n; if (sl > 1.3) p *= 0.5; if (h < 0.7) p = 0.35;
      var lc = G.lcAt ? G.lcAt(jx, jz) : 0; if (lc && LC_TREES[lc] != null) p = LC_TREES[lc] * (0.7 + 0.6 * n); }   // mật độ cây theo lớp phủ thật
    if (rt() > p * dens) continue;
    if (MK(jx, jz) || MK(jx + 0.12, jz) || MK(jx - 0.12, jz) || MK(jx, jz + 0.12) || MK(jx, jz - 0.12)) continue;   // tán cây không chồm lên đường
    var cd0 = coastX(jz) - jx; if (cd0 > 0 && cd0 < 1.3) continue;   // dải cát sát biển không trồng gì; hàng dừa dọc đường là genStreetTrees
    var big = h > 1.1 ? 1.35 : 1, s = (0.32 + rt() * 0.26) * big;
    if (h < 0.75 && zn < 10 && coastX(jz) - jx < 6) { palms.push({ x:jx, z:jz, y:h, s:0.8 + rt() * 0.5, a:rt() * 6.28, t:(rt() - 0.5) * 0.3 }); continue; }
    if (zn >= 10 && DIST[zn - 10].style !== 'city' && rt() < 0.4){ palms.push({ x:jx, z:jz, y:h, s:0.7 + rt() * 0.5, a:rt() * 6.28, t:(rt() - 0.5) * 0.3 }); continue; }
    if (h > 8 && rt() < 0.3) cones.push({ x:jx, z:jz, y:h, s:s * 1.1, a:rt() * 6.28 });
    else round.push({ x:jx, z:jz, y:h, s:s, a:rt() * 6.28, sq:0.75 + rt() * 0.35 });
  }
  return { round:round, cones:cones, palms:palms };
}

// cây ven đường và MỘT hàng dừa sát bãi biển (phía biển của đường chạy dọc bờ). roads: [{ w, c, rail, pts:[{ x, z, fx, fz, br, cw }] }] (fx, fz là hướng đường); MK(x, z) true nếu đã là mặt đường/vỉa hè/địa danh.
// Không cây nào đứng trên mặt đường hay vỉa hè của đường nào; dừa chỉ ở cách bờ ≥ 0,6 đơn vị (30 m, đường Trần Phú phía bắc cách bờ chỉ ~53 m) và chỉ một bên.
function genStreetTrees(roads, G, MK){
  var trees = [], palms = [], zN = P(12.2985, 0)[1], zS = P(12.2104, 0)[1];
  roads.forEach(function(R){ if (R.rail) return; var c = R.c != null ? R.c : (R.cls != null ? R.cls : 2), acc = 0;
    R.pts.forEach(function(p, i){ if (p.br || p.cw) return;
      if (i % 3 === 0 && coastX(p.z) - p.x >= 4) [-1, 1].forEach(function(sd){   // phố sát biển (Trần Phú...) chỉ có hàng dừa phía biển
        var x = p.x - p.fz * sd * (R.w / 2 + 0.2), z = p.z + p.fx * sd * (R.w / 2 + 0.2), y = G.hAt(x, z), zn = G.zoneAt(x, z);
        if (roundD(x, z) < 0.15 || MK(x, z)) return;
        if (y > 0.36 && (zn >= 10 || zn === 1) && coastX(z) - x > 2.3) trees.push({ x:x, z:z, y:y, s:0.2 + ih(i, sd + 5) * 0.06, a:0, sq:1 }); });
      if (i) acc += Math.hypot(p.x - R.pts[i - 1].x, p.z - R.pts[i - 1].z);
      var cd = coastX(p.z) - p.x;
      if (c <= 4 && Math.abs(p.fz) >= 0.7 && cd > 0.5 && cd < 3.4 && p.z > zN && p.z < zS && acc >= 0.42){ acc = 0;
        var nx = -p.fz, nz = p.fx; if (nx < 0){ nx = -nx; nz = -nz; }   // pháp tuyến hướng ra biển
        var off = R.w / 2 + SIDEWALK(c) + 0.12, x2 = p.x + nx * off, z2 = p.z + nz * off, y2 = G.hAt(x2, z2);
        if (coastX(z2) - x2 >= 0.6 && y2 > 0.25 && !MK(x2, z2) && roundD(x2, z2) > 0.2) palms.push({ x:x2, z:z2, y:y2, s:0.95 + ih(z2 * 10, 12) * 0.35, a:ih(z2 * 3, 7) * 6.28, t:(ih(z2 * 5, 3) - 0.5) * 0.25 }); } }); });
  return { trees:trees, palms:palms }; }

/* ---------- landmarks ---------- */
// điểm phụ của địa danh (toạ độ OSM; null = không có trong OSM, ước lượng theo ảnh/độ cao): ga cáp treo hai đầu, vòng quay, chùa và tượng Phật Long Sơn
var LM_EXTRA = { cableA:[12.2034, 109.2176, 'way/71375373#first'], cableB:[12.2150, 109.2391, 'way/71375373#last'], wheel:[12.2219, 109.2429, 'node/7040432885'],
  pagoda:[12.2513, 109.1805, 'way/196896036'], buddha:[12.2522, 109.1808, null] };
// osm:null = OSM không có điểm này: Núi Cô Tiên lấy đỉnh đầu tiên trên đường mòn theo DEM, Cửa Bé lấy chỗ sông Tắc – Quán Trường đổ ra biển theo mặt nước OSM
var LM_DEF = [
  { id:'co-tien', name:'Núi Cô Tiên', cat:'Núi', ll:[12.2935,109.1980], osm:null, zoom:46, ring:0, top:1.5,
    desc:'Dãy núi phía bắc thành phố. Ba ngọn núi nối nhau, nhìn từ trung tâm giống dáng một nàng tiên nằm ngửa. Đường mòn lên đỉnh là điểm ngắm toàn cảnh vịnh Nha Trang.', facts:['Ba đỉnh núi','Ngắm toàn cảnh vịnh'] },
  { id:'hon-chong', name:'Hòn Chồng', cat:'Thắng cảnh', ll:[12.2728,109.2066], osm:'way/792392852', zoom:9, ring:1.6,
    desc:'Bãi đá granite chồng lên nhau ở mũi biển phía bắc, dưới chân núi Cô Tiên. Một tảng đá có vết lõm như bàn tay khổng lồ, gắn với truyền thuyết về chàng khổng lồ và nàng tiên.', facts:['Đá granite','Ngắm bình minh'] },
  { id:'hon-do', name:'Hòn Đỏ', cat:'Đảo nhỏ', ll:[12.2666,109.2085], osm:'way/265148348', zoom:9, ring:1.8,
    desc:'Hòn đảo nhỏ ngay trước mũi Hòn Chồng, trên đảo có một ngôi chùa nhỏ. Từ bãi đá Hòn Chồng nhìn ra, đảo nằm giữa biển như một hòn non bộ.', facts:['Ngoài khơi Hòn Chồng','Chùa trên đảo'] },
  { id:'ponagar', name:'Tháp Bà Ponagar', cat:'Di tích Chăm', ll:[12.2654,109.1952], osm:'way/146780347', zoom:9, ring:2.4,
    desc:'Quần thể tháp Chăm cổ trên đồi Cù Lao, bên bờ bắc sông Cái. Tháp thờ Nữ thần Thiên Y A Na, người Chăm gọi là Po Inư Nagar, Mẹ xứ sở.', facts:['Thế kỷ 7–12','Đồi Cù Lao'] },
  { id:'xom-bong', name:'Cầu Xóm Bóng', cat:'Sông Cái', ll:[12.2636,109.1957], osm:'way/1423622837', zoom:12, ring:0,
    desc:'Cây cầu nối trung tâm với phía bắc thành phố, ngay dưới chân Tháp Bà. Gần cửa sông, những chiếc thuyền đánh cá sơn xanh neo đậu san sát.', facts:['Bắc qua sông Cái','Cạnh Tháp Bà'] },
  { id:'cau-tran-phu', name:'Cầu Trần Phú', cat:'Sông Cái', ll:[12.2620,109.1993], osm:'way/1423622839', zoom:12, ring:0, top:1.0,
    desc:'Cây cầu bắc qua cửa sông Cái, nối đường Trần Phú ven biển với đường Phạm Văn Đồng đi Hòn Chồng. Từ cầu nhìn thấy thuyền đánh cá neo ở cửa sông và Tháp Bà phía trong.', facts:['Cửa sông Cái','Trần Phú – Phạm Văn Đồng'] },
  { id:'cho-dam', name:'Chợ Đầm', cat:'Chợ', ll:[12.2553,109.1917], osm:'relation/21159862', zoom:8, ring:1.9,
    desc:'Chợ lớn nhất trung tâm Nha Trang, mái tròn nhiều tầng. Nơi mua hải sản khô, yến sào, nem chả và đặc sản Khánh Hòa.', facts:['Hải sản khô','Yến sào'] },
  { id:'yersin', name:'Viện Pasteur Nha Trang', cat:'Lịch sử', ll:[12.2517,109.1962], osm:'way/1193057647', zoom:7, ring:1.2,
    desc:'Viện do bác sĩ Alexandre Yersin lập năm 1895. Bảo tàng Yersin trong khuôn viên viện lưu giữ phòng làm việc, kính hiển vi và thư từ của ông.', facts:['Lập năm 1895','Bảo tàng Yersin'] },
  { id:'long-son', name:'Chùa Long Sơn', cat:'Tôn giáo', ll:[12.2513,109.1805], osm:'way/196896036', zoom:11, ring:2.6,
    desc:'Ngôi chùa dưới chân đồi Trại Thủy. Trên đỉnh đồi là tượng Kim Thân Phật Tổ màu trắng cao 24 m, từ đây nhìn bao quát cả thành phố.', facts:['Lập năm 1886','Tượng Phật cao 24 m'] },
  { id:'ga', name:'Ga Nha Trang', cat:'Đường sắt', ll:[12.2485,109.1842], osm:'way/232457135', zoom:8, ring:1.6,
    desc:'Nhà ga trên tuyến đường sắt Bắc – Nam, ở rìa tây trung tâm. Đường ray chạy theo hướng bắc – nam, sát chân đồi Long Sơn.', facts:['Đường sắt Bắc – Nam','Gần chùa Long Sơn'] },
  { id:'nha-tho', name:'Nhà thờ Núi', cat:'Tôn giáo', ll:[12.2467,109.1881], osm:'way/162818208', zoom:8, ring:1.8,
    desc:'Nhà thờ Chánh tòa Kitô Vua, xây bằng đá theo kiến trúc Gothic Pháp, trên một ngọn đồi nhỏ giữa trung tâm. Tháp chuông nhìn từ xa như một ngọn núi đá.', facts:['Xây 1928–1933','Kiến trúc Gothic'] },
  { id:'xom-moi', name:'Chợ Xóm Mới', cat:'Chợ', ll:[12.2428,109.1904], osm:'way/266497124', zoom:8, ring:1.0,
    desc:'Chợ truyền thống trong lòng phố, người dân địa phương đi chợ hằng ngày: hải sản tươi và khô, rau trái, đồ ăn vặt.', facts:['Chợ truyền thống','Hải sản khô'] },
  { id:'tram-huong', name:'Tháp Trầm Hương', cat:'Biểu tượng', ll:[12.2406,109.1969], osm:'way/232454020', zoom:9, ring:1.4,
    desc:'Tháp hình búp sen ở Quảng trường 2/4, nhìn ra bãi biển Trần Phú. Tên tháp gợi đến trầm hương, đặc sản quý của Khánh Hòa. Tối đến tháp lên đèn.', facts:['Quảng trường 2/4','Hình búp sen'] },
  { id:'tran-phu', name:'Bãi biển Trần Phú', cat:'Bãi biển', ll:[12.2363,109.1979], osm:'way/207742943', zoom:22, ring:0,
    desc:'Bãi cát vàng cong dọc trung tâm, hàng dừa và khách sạn cao tầng nhìn ra vịnh. Sáng sớm là lúc người dân xuống tắm biển đông nhất.', facts:['Dài khoảng 6 km','Hàng dừa, khách sạn'] },
  { id:'cap-treo', name:'Cáp treo Hòn Tre', cat:'Giao thông', ll:null, zoom:40, ring:0,
    desc:'Tuyến cáp treo vượt biển dài khoảng 3,3 km nối đất liền với đảo Hòn Tre. Cabin chạy trên những trụ cao giữa vịnh, nhìn xuống toàn cảnh thành phố.', facts:['Dài ~3,3 km','Vượt biển'] },
  { id:'hon-tre', name:'Đảo Hòn Tre', cat:'Đảo', ll:[12.2270,109.2830], zoom:75, ring:0, focus:[12.2215,109.2720], top:1.6,
    desc:'Đảo lớn nhất vịnh Nha Trang. Mũi phía tây có khu nghỉ dưỡng, công viên giải trí và vòng quay lớn nhìn về thành phố; phía nam là làng chài Bích Đầm.', facts:['Đảo lớn nhất vịnh','Cáp treo hoặc tàu'] },
  { id:'vinwonders', name:'VinWonders Nha Trang', cat:'Vui chơi', ll:[12.2219,109.2429], osm:'node/7040432885', zoom:14, ring:0, top:2.2,
    desc:'Khu vui chơi trên đảo Hòn Tre, dễ nhận ra nhờ vòng quay Bánh xe Bầu trời nhìn ra vịnh. Đi bằng cáp treo vượt biển hoặc tàu từ bến Cầu Đá.', facts:['Đảo Hòn Tre','Vòng quay bên vịnh'] },
  { id:'vien-hdh', name:'Viện Hải dương học', cat:'Khoa học', ll:[12.2076,109.2147], osm:'way/1158459582', zoom:8, ring:1.5,
    desc:'Viện nghiên cứu biển lâu đời ở Cầu Đá. Bảo tàng của viện trưng bày hàng chục nghìn mẫu sinh vật biển, trong đó có bộ xương cá voi lớn.', facts:['Thành lập 1922','Hơn 20.000 mẫu vật'] },
  { id:'cang', name:'Cảng Nha Trang', cat:'Cảng biển', ll:[12.2070,109.2168], osm:'node/1403104892', zoom:12, ring:0,
    desc:'Cảng ở mũi Cầu Đá, nơi tàu du lịch quốc tế cập bến và tàu khách đi các đảo trong vịnh xuất phát.', facts:['Mũi Cầu Đá','Tàu đi các đảo'] },
  { id:'bao-dai', name:'Biệt điện Bảo Đại', cat:'Lịch sử', ll:[12.2103,109.2154], osm:'way/272268190', zoom:8, ring:1.8,
    desc:'Quần thể biệt thự kiểu Pháp trên ngọn đồi nhỏ ở Cầu Đá, xây trong thập niên 1920, từng là nơi nghỉ của vua Bảo Đại. Từ đồi nhìn thẳng ra vịnh và đảo Hòn Tre.', facts:['Thập niên 1920','Đồi Cầu Đá'] },
  { id:'hai-dang', name:'Hải đăng Mũi Chụt', cat:'Hải đăng', ll:[12.2106,109.2167], osm:'way/1241245408', zoom:6, ring:0.8,
    desc:'Ngọn hải đăng trên mũi Chụt, ngay cạnh Lầu Bảo Đại, soi đường cho tàu thuyền ra vào vịnh và cảng Cầu Đá.', facts:['Mũi Chụt','Cạnh Lầu Bảo Đại'] },
  { id:'cua-be', name:'Cửa Bé', cat:'Cửa sông', ll:[12.1942,109.2060], osm:null, zoom:18, ring:0,
    desc:'Cửa sông phía nam thành phố, nơi sông Quán Trường đổ ra biển. Bờ nam là làng chài Hòn Rớ với rất nhiều thuyền đánh cá; quanh cửa sông là các đầm nuôi tôm.', facts:['Làng chài Hòn Rớ','Đầm nuôi tôm'] },
  { id:'hon-mieu', name:'Hòn Miễu', cat:'Đảo', ll:[12.1901,109.2245], osm:'way/816512133', zoom:20, ring:0, top:1.2,
    desc:'Đảo nhỏ gần cảng Cầu Đá, có làng chài Trí Nguyên. Quanh đảo là những làng bè nuôi cá, tôm hùm trên mặt nước.', facts:['Làng chài Trí Nguyên','Làng bè'] },
  { id:'hon-tam', name:'Hòn Tằm', cat:'Đảo', ll:[12.1747,109.2447], osm:'way/147536067', zoom:20, ring:0, top:1.2,
    desc:'Đảo nhỏ phía nam vịnh với bãi cát và khu nghỉ dưỡng, thích hợp tắm biển và chơi thể thao nước.', facts:['Bãi tắm','Thể thao nước'] },
  { id:'hon-mot', name:'Hòn Một', cat:'Đảo', ll:[12.1775,109.2742], osm:'way/24029932', zoom:18, ring:0, top:1.0,
    desc:'Hòn đảo nhỏ phía nam Hòn Tre, có bến tàu đón khách trong các chuyến đi thăm đảo quanh vịnh.', facts:['Phía nam Hòn Tre','Có bến tàu'] },
  { id:'hon-mun', name:'Hòn Mun', cat:'Biển đảo', ll:[12.1667,109.3049], osm:'relation/6726645', zoom:18, ring:0, top:1.2,
    desc:'Khu bảo tồn biển với rạn san hô và đàn cá nhiều màu, điểm lặn ngắm san hô nổi tiếng nhất vịnh Nha Trang.', facts:['Khu bảo tồn biển','Lặn ngắm san hô'] }
];
var GEO_LABELS = [
  { t:'Vịnh Nha Trang', ll:[12.2390,109.2330], y:1, max:2.2 },
  { t:'Biển Đông', ll:[12.2620,109.3150], y:1, max:2.2 },
  { t:'Sông Cái', ll:[12.2552,109.1690], y:0.8, max:0.9 },
  { t:'Sông Quán Trường', ll:[12.2245,109.1740], y:0.8, max:0.7 },
  { t:'Hòn Một', ll:[12.1899,109.2381], y:3.4, max:0.6 },
  { t:'Bích Đầm', ll:[12.2000,109.2890], y:1.2, max:0.6 },
  { t:'Hòn Rớ', ll:[12.1893,109.2078], y:1.2, max:0.6 },
  { t:'Phước Đồng', ll:[12.2120,109.1850], y:1.2, max:0.7 },
  { t:'Vĩnh Hải', ll:[12.2745,109.1965], y:1.2, max:0.7 },
  { t:'Vĩnh Ngọc', ll:[12.2690,109.1700], y:1.2, max:0.7 },
  { t:'Trí Nguyên', ll:[12.1938,109.2222], y:1.0, max:0.5 }
];
var ROAD_LABELS = [
  { t:'Đường Trần Phú', ll:[12.2455,null], off:2.6 },
  { t:'Đường Trần Phú', ll:[12.2200,null], off:2.6 },
  { t:'Đường Phạm Văn Đồng', ll:[12.2840,null], off:2.0 },
  { t:'Đường 2 Tháng 4', ll:[12.2780,109.1918] },
  { t:'Đường 23 Tháng 10', ll:[12.2478,109.1700] },
  { t:'Đường Lê Hồng Phong', ll:[12.2300,109.1877] }
];

export { SIDEWALK, genStreetTrees, BD, BR, BW, BX0, BX1, BZ0, BZ1, COAST, COAST_REAL, DIST, FALLOW, FCA, FLOOD, FLOOR, FSA, GEO_LABELS, H, HILLS, HON_DO, ISLANDS, KX, KZ, LAT0, LC_TINT, LC_TREES, LLs, LM_DEF, LM_EXTRA, LON0, MID_F, OSM, P, PADS, PAL, PCA, PK, PONDC, PONDS, PSA, RAIL, RG, RICE, RIDGES, RIVERS, ROADS, ROAD_LABELS, ROAD_W, ROOF_C, ROUNDS, TOWER_C, TOWER_F, TR, TUBE_C, TUBE_F, URB, VB, VE, VILLA_C, bboxOf, boardClamp, buildGrid, carveH, clamp, coastX, coastalRoad, districtAt, fbm, fieldS, fillPoly, genBuildings, genBuildingsOSM, genTrees, groundColor, hash, hex3, ih, inBoard, inBox, inPoly, inPonds, islandAt, islandH, islandSD, landRuns, lcAt, lerp, lineDist, mainlandH, mixc, mountains, mulberry32, nearestIdx, obbOf, osmLandS, osmRoundabouts, osmWaterS, paintGround, polyEdgeDist, prepRidges, realH, resample, ridgeH, ridgesAt, riverS, roundD, segD2, setc, smooth, strokeLine, toLL, toLocal, toWorld, trSample, vnoise, worldCtx, zHonChong, zRiverMouth };
