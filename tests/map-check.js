// Kiểm map dựng ra có khớp bản đồ thật (OSM) không — chạy bằng Node, không cần trình duyệt (gọi trong npm test).
// Dùng hàm độ cao H(x, z) thật của geo.js (địa hình + bờ + sông) để xem cái gì đang nằm dưới nước mà lẽ ra trên đất:
//  1. đường OSM (không phải cầu) chạy qua nước > 50 m liền       5. mặt nước OSM có thật sự là nước trên map, đất ven sông có là đất
//  2. đầu cầu OSM rơi xuống nước (cầu bị "cắt")                  6. vị trí địa danh, bờ biển (tools/check-positions.js)
//  3. nhà OSM nằm dưới nước                                      (kích thước, hướng mô hình: tools/check-sizes.js, cần WebGL)
//  4. đường sắt OSM chạy qua nước > 150 m liền (chưa có cờ cầu cho ray)
// Thoát mã 1 nếu có mục sai. Dùng: node tests/map-check.js [--verbose]
const fs = require('fs'), path = require('path'), vm = require('vm'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), JS = f => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), V = process.argv.includes('--verbose');
const G = { atob:s => Buffer.from(s, 'base64').toString('latin1') };
vm.runInNewContext(JS('terrain-data.js') + JS('osm-data.js') + JS('geo.js') + '\nthis.o = { OSM, H, inBoard, coastX, osmWaterS, toLL, BX0, BZ0 };', G);
const { OSM, H, inBoard, coastX, osmWaterS, toLL } = G.o;
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
for (let j = 2; j < W.h - 2; j += 3) for (let i = 2; i < W.w - 2; i += 3){ const x = G.o.BX0 + (i + 0.5) * W.step, z = G.o.BZ0 + (j + 0.5) * W.step, s = W.f[j * W.w + i];
  if (!inBoard(x, z, 1) || x > coastX(z) - 0.5) continue;
  if (s < -0.3){ nW++; if (H(x, z) > 0.02){ dryW++; if (wErr.length < 200) wErr.push('nước OSM thành đất tại ' + ll(x, z)); } }
  else if (s > 0.5 && s < 2){ nL++; if (H(x, z) < WET){ wetL++; if (wErr.length < 200) wErr.push('đất ven nước thành nước tại ' + ll(x, z)); } } }
const pw = dryW / Math.max(1, nW), pl = wetL / Math.max(1, nL);
report('Mặt nước khớp OSM (sai ' + (pw * 100).toFixed(1) + '% ô nước, ' + (pl * 100).toFixed(1) + '% ô đất ven sông)', pw > 0.03 || pl > 0.03 ? wErr : [], nW + nL, 'ô mẫu');
// 6. vị trí địa danh, bờ biển
const cp = spawnSync(process.execPath, [path.join(ROOT, 'tools/check-positions.js')], { encoding:'utf8' }), posBad = cp.status !== 0;
report('Vị trí địa danh, bờ biển (tools/check-positions.js)', posBad ? cp.stdout.split('\n').filter(l => /✗|⚠/.test(l)) : [], 0, '');

console.log('[map] So với bản đồ thật (OSM):\n' + rows.join('\n'));
console.log(bad ? '[map] ' + bad + ' nhóm sai' : '[map] Tất cả khớp'); process.exit(bad ? 1 : 0);
