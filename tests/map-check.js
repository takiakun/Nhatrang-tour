// Kiểm map dựng ra có khớp bản đồ thật (OSM) không — chạy bằng Node, không cần trình duyệt (gọi trong npm test).
// Dùng hàm độ cao H(x, z) thật của geo.js (địa hình + bờ + sông) để xem cái gì đang nằm dưới nước mà lẽ ra trên đất:
//  1. đường OSM (không phải cầu) chạy qua nước > 50 m liền       5. mặt nước OSM có thật sự là nước trên map, đất ven sông có là đất
//  2. đầu cầu OSM rơi xuống nước (cầu bị "cắt")                  6. vị trí địa danh, bờ biển (tools/check-positions.js)
//  3. nhà OSM nằm dưới nước                                      (kích thước, hướng mô hình: tools/check-sizes.js, cần WebGL)
//  4. đường sắt OSM chạy qua nước > 150 m liền (chưa có cờ cầu cho ray)
// Thoát mã 1 nếu có mục sai. Dùng: node tests/map-check.js [--verbose]
const path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), V = process.argv.includes('--verbose');
const { OSM, H, inBoard, coastX, osmWaterS, toLL, BX0, BZ0 } = require('../src/js/geo.js');   // ES module (Node ≥ 22.12)
if (!OSM){ console.log('✗ thiếu src/js/osm-data.js (chạy node tools/fetch-osm.js)'); process.exit(1); }
const WET = -0.02, rows = []; let bad = 0;
const wet = (x, z) => inBoard(x, z, 0.5) && H(x, z) < WET;
const ll = (x, z) => toLL(x, z).map(v => v.toFixed(4)).join(', ');
function report(name, errs, total, unit, maxShow){
  const ok = !errs.length; if (!ok) bad++;
  rows.push((ok ? '✓ ' : '✗ ') + name + ': ' + (ok ? 'ổn' : errs.length + ' chỗ sai') + (total ? ' / ' + total + ' ' + unit : ''));
  errs.slice(0, V ? 1e9 : maxShow || 6).forEach(e => rows.push('    - ' + e)); if (!V && errs.length > (maxShow || 6)) rows.push('    … (--verbose để xem hết)'); }
// đi dọc polyline, trả về các quãng liên tiếp nằm dưới nước dài hơn minLen (đơn vị bản đồ)
function wetRuns(pts, minLen){ const out = []; let run = 0, s0 = null;
  for (let i = 0; i < pts.length - 1; i++){ const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.2));
    for (let k = 0; k < n; k++){ const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      if (wet(x, z)){ if (!run) s0 = [x, z]; run += L / n; } else { if (run > minLen) out.push({ at:s0, len:run }); run = 0; } } }
  if (run > minLen) out.push({ at:s0, len:run }); return out; }

// 1. đường không phải cầu chạy qua nước
const roadErr = []; let nRoad = 0;
OSM.roads.forEach(R => { if (R.bridge || R.c > 7) return; nRoad++;
  wetRuns(R.pts, 1.0).forEach(r => roadErr.push((R.name || OSM.classes[R.c]) + ' — ' + Math.round(r.len * 50) + ' m dưới nước tại ' + ll(r.at[0], r.at[1]))); });
report('Đường không phải cầu nằm dưới nước', roadErr, nRoad, 'đường');
// 2. đầu cầu: hai đầu mỗi chuỗi cầu phải chạm đất (trong 60 m quanh đầu cầu có đất)
const bridgeErr = []; let nBr = 0;
OSM.roads.forEach(R => { if (!R.bridge) return; nBr++;
  [R.pts[0], R.pts[R.pts.length - 1]].forEach(p => { if (!inBoard(p[0], p[1], 0.5)) return;
    // đầu cầu nối tiếp một đường khác (cầu nhiều nhịp) thì bỏ qua
    const joined = OSM.roads.some(Q => Q !== R && Q.bridge && [Q.pts[0], Q.pts[Q.pts.length - 1]].some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.02)); if (joined) return;
    let land = false; for (let a = 0; a < 8 && !land; a++) for (const r of [0, 0.4, 0.8, 1.2]) if (H(p[0] + Math.cos(a * 0.785) * r, p[1] + Math.sin(a * 0.785) * r) > 0.05){ land = true; break; }
    if (!land) bridgeErr.push((R.name || 'cầu') + ' — đầu cầu rơi xuống nước tại ' + ll(p[0], p[1])); }); });
report('Đầu cầu chạm đất', bridgeErr, nBr, 'cầu');
// 3. nhà OSM dưới nước
const bErr = []; OSM.builds.forEach(b => { const x = b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length, z = b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length; if (wet(x, z)) bErr.push('nhà tại ' + ll(x, z)); });
report('Nhà OSM nằm trên đất', bErr.length > OSM.builds.length * 0.005 ? bErr : [], OSM.builds.length, 'nhà (cho phép 0,5% nhà sàn, nhà bè)');
// 4. đường sắt
const railErr = []; OSM.rails.forEach((r, i) => wetRuns(r, 3).forEach(w => railErr.push('ray ' + (i ? 'phụ ' + i : 'chính') + ' — ' + Math.round(w.len * 50) + ' m dưới nước tại ' + ll(w.at[0], w.at[1]))));
report('Đường sắt nằm trên đất', railErr, OSM.rails.length, 'tuyến');
// 5. mặt nước: ô OSM là nước phải thấp hơn mặt biển; đất cách nước 25–100 m phải là đất
const W = OSM.water; let nW = 0, dryW = 0, nL = 0, wetL = 0; const wErr = [];
for (let j = 2; j < W.h - 2; j += 3) for (let i = 2; i < W.w - 2; i += 3){ const x = BX0 + (i + 0.5) * W.step, z = BZ0 + (j + 0.5) * W.step, s = W.f[j * W.w + i];
  if (!inBoard(x, z, 1) || x > coastX(z) - 0.5) continue;
  if (s < -0.3){ nW++; if (H(x, z) > 0.02){ dryW++; if (wErr.length < 200) wErr.push('nước OSM thành đất tại ' + ll(x, z)); } }
  else if (s > 0.5 && s < 2){ nL++; if (H(x, z) < WET){ wetL++; if (wErr.length < 200) wErr.push('đất ven nước thành nước tại ' + ll(x, z)); } } }
const pw = dryW / Math.max(1, nW), pl = wetL / Math.max(1, nL);
report('Mặt nước khớp OSM (sai ' + (pw * 100).toFixed(1) + '% ô nước, ' + (pl * 100).toFixed(1) + '% ô đất ven sông)', pw > 0.03 || pl > 0.03 ? wErr : [], nW + nL, 'ô mẫu');
// 6a. nhà và cây không đè đường (dựng lại nhà, cây bằng chính hàm của trang, mặt nạ đường xấp xỉ từ OSM)
{ const { buildGrid, genBuildings, genTrees, genStreetTrees, resample, SIDEWALK } = require('../src/js/geo.js'), key = (x, z) => (Math.floor(x * 2) + 2000) * 4000 + Math.floor(z * 2) + 2000;
  const addSeg = (map, a, b, r) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.1)); for (let j = 0; j <= n; j++){ const x = a[0] + (b[0] - a[0]) * j / n, z = a[1] + (b[1] - a[1]) * j / n, k = key(x, z); (map.get(k) || map.set(k, []).get(k)).push([x, z, r]); } };
  const roads = OSM.roads.filter(R => !R.round), maskM = new Map(), carM = new Map(), swM = new Map();
  roads.forEach(R => { for (let i = 0; i < R.pts.length - 1; i++){ addSeg(maskM, R.pts[i], R.pts[i + 1], R.w / 2 + (R.c <= 4 ? 0.17 : 0.05)); addSeg(carM, R.pts[i], R.pts[i + 1], R.w / 2); addSeg(swM, R.pts[i], R.pts[i + 1], R.w / 2 + SIDEWALK(R.c)); } });
  const near = (m, x, z) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++){ const a = m.get(key(x + i * 0.5, z + j * 0.5)); if (a) for (const q of a) if (Math.hypot(q[0] - x, q[1] - z) < q[2]) return true; } return false; };
  const MK = (x, z) => !inBoard(x, z, 0.5) || near(maskM, x, z), Gd = buildGrid(1.0), B = genBuildings(Gd, MK, 1, []);
  const p8 = b => { const c = Math.cos(b.r), sn = Math.sin(b.r), hw = b.w / 2, hd = b.d / 2; return [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([u, v]) => [b.x + u * hw * c + v * hd * sn, b.z - u * hw * sn + v * hd * c]); };
  let nb = 0, onCar = 0, onSw = 0; ['tubes', 'towers', 'mids', 'villas'].forEach(k => B[k].forEach(b => { nb++; const q = p8(b); if (q.some(p => near(carM, p[0], p[1]))) onCar++; if (q.some(p => near(swM, p[0], p[1]))) onSw++; }));
  const T = genTrees(Gd, MK, 1.4, 1), forest = T.round.concat(T.cones, T.palms), badF = forest.filter(t => near(swM, t.x, t.z) || (coastX(t.z) - t.x > 0 && coastX(t.z) - t.x < 1.0));
  const rl = roads.filter(R => R.c <= 4).map(R => { const L = R.pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - R.pts[i - 1][0], p[1] - R.pts[i - 1][1]) : 0, 0), sm = resample(R.pts, L / Math.max(1, Math.ceil(L / 0.5)) * 0.9999);
    return { w:R.w, c:R.c, rail:false, pts:sm.map((p, i) => { const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { x:p[0], z:p[1], fx:(b[0] - a[0]) / l, fz:(b[1] - a[1]) / l, br:false, cw:false }; }) }; });
  const S = genStreetTrees(rl, Gd, MK), badS = S.trees.filter(t => near(swM, t.x, t.z)).concat(S.palms.filter(t => near(swM, t.x, t.z) || coastX(t.z) - t.x < 0.6));
  const errs = [];
  if (onCar / nb > 0.001) errs.push((onCar) + '/' + nb + ' nhà đè lên lòng đường (cho phép 0,1%: chân đế OSM thật có thể chạm)');
  if (onSw / nb > 0.02) errs.push((onSw) + '/' + nb + ' nhà chạm vỉa hè (cho phép 2%)');
  if (badF.length) errs.push(badF.length + ' cây rừng/vườn trên vỉa hè hoặc trên cát sát bờ (vd ' + ll(badF[0].x, badF[0].z) + ')');
  if (badS.length) errs.push(badS.length + ' cây ven đường/dừa trên vỉa hè hoặc sát bãi cát (vd ' + ll(badS[0].x, badS[0].z) + ')');
  if (S.palms.length < 100) errs.push('hàng dừa dọc bãi biển chỉ có ' + S.palms.length + ' cây (cần ≥ 100)');
  report('Nhà, cây không đè đường (' + (onSw / nb * 100).toFixed(1) + '% nhà chạm vỉa hè, ' + S.palms.length + ' dừa ven bãi)', errs, nb + forest.length + S.trees.length + S.palms.length, 'nhà, cây'); }
// 6. vị trí địa danh, bờ biển
const cp = spawnSync(process.execPath, [path.join(ROOT, 'tools/check-positions.js')], { encoding:'utf8' }), posBad = cp.status !== 0;
report('Vị trí địa danh, bờ biển (tools/check-positions.js)', posBad ? cp.stdout.split('\n').filter(l => /✗|⚠/.test(l)) : [], 0, '');

console.log('[map] So với bản đồ thật (OSM):\n' + rows.join('\n'));
console.log(bad ? '[map] ' + bad + ' nhóm sai' : '[map] Tất cả khớp'); process.exit(bad ? 1 : 0);
