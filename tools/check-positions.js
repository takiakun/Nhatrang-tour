// Kiểm vị trí theo bản đồ thật: so toạ độ địa danh (LM_DEF, LM_EXTRA trong geo.js) với đối tượng OSM đã ghi (osm:'way/123'),
// so đường bờ đang dùng với bờ OSM, và chắc địa danh trên đất nằm trên đất. Thoát mã 1 nếu có mục vượt ngưỡng.
// Dùng: node tools/check-positions.js [--refresh]      (tải đối tượng OSM qua API, lưu ở .cache/osm-ref/)
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), CACHE = path.join(ROOT, '.cache/osm-ref'), JS = f => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
const G = { atob:s => Buffer.from(s, 'base64').toString('latin1') };
vm.runInNewContext(JS('terrain-data.js') + JS('osm-data.js') + JS('geo.js') + '\nthis.o = { LM_DEF, LM_EXTRA, P, coastX, H, COAST_REAL, OSM_DATA };', G);
const { LM_DEF, LM_EXTRA, P, coastX, H, COAST_REAL, OSM_DATA } = G.o;
// ngưỡng lệch (m): công trình 60; đảo, bãi biển, núi là nhãn vùng nên rộng hơn
const TOL = { 'Đảo':400, 'Biển đảo':400, 'Đảo nhỏ':80, 'Bãi biển':1500, 'Núi':800, 'Thắng cảnh':120, 'Cửa sông':400 };
const M = (a, b) => Math.hypot((a[0] - b[0]) * 110574, (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180));

function osmCenter(ref){
  const base = ref.split('#')[0], f = path.join(CACHE, base.replace('/', '-') + '.json'); let j;
  if (fs.existsSync(f) && !process.argv.includes('--refresh')) j = JSON.parse(fs.readFileSync(f, 'utf8'));
  else { const [t] = base.split('/'); const url = 'https://api.openstreetmap.org/api/0.6/' + base + (t === 'node' ? '' : '/full') + '.json';
    j = JSON.parse(execFileSync('curl', ['-s', '-m', '60', '-A', 'Nhatrang-tour-check/1.0', url]).toString()); fs.mkdirSync(CACHE, { recursive:true }); fs.writeFileSync(f, JSON.stringify(j)); }
  const ns = j.elements.filter(e => e.type === 'node'); if (!ns.length) throw new Error('không đọc được ' + ref);
  const wy = j.elements.find(e => e.type === 'way'), end = ref.split('#')[1];   // way/123#first, #last: đầu, cuối một tuyến (cáp treo)
  if (end && wy){ const id = end === 'first' ? wy.nodes[0] : wy.nodes[wy.nodes.length - 1], n = ns.find(q => q.id === id); return [n.lat, n.lon]; }
  if (ns.length === 1) return [ns[0].lat, ns[0].lon];
  const la = ns.map(n => n.lat), lo = ns.map(n => n.lon);   // tâm khung bao
  return [(Math.min(...la) + Math.max(...la)) / 2, (Math.min(...lo) + Math.max(...lo)) / 2];
}

let bad = 0; const rows = [];
function check(id, name, ll, ref, tol, onLand){
  if (!ll){ rows.push([id, name, '-', 'không có toạ độ']); return; }
  const [x, z] = P(ll[0], ll[1]), h = H(x, z), land = onLand && h < 0.05 ? ' ⚠ nằm dưới nước' : '';
  if (land) bad++;
  if (!ref){ rows.push([id, name, '—', 'không có trong OSM, ước lượng' + land]); return; }
  const c = osmCenter(ref), d = Math.round(M(ll, c)), over = d > tol; if (over) bad++;
  rows.push([id, name, d + ' m', (over ? '✗ quá ' + tol + ' m' : 'ok') + land + '  (' + ref + ')']);
}
LM_DEF.forEach(L => check(L.id, L.name, L.ll, L.osm, TOL[L.cat] || 60, !/Đảo|Biển đảo|Cửa sông|Cảng|Sông/.test(L.cat)));
Object.keys(LM_EXTRA).forEach(k => { const e = LM_EXTRA[k]; check(k, '(phụ)', e, e[2], 60, k !== 'cableB'); });
const w = [12, 26, 9]; rows.forEach(r => console.log(r[0].padEnd(w[0]) + ' ' + r[1].padEnd(w[1]) + ' ' + r[2].padStart(w[2]) + '  ' + r[3]));

// bờ biển: đang dùng bờ OSM chưa, và lệch bao nhiêu so với các điểm bờ OSM
if (!COAST_REAL){ console.log('\n✗ bờ đất liền đang là ước lượng (osm-data.js thiếu coast): chạy node tools/fetch-osm.js'); bad++; }
else { let mx = 0; OSM_DATA.coast.forEach(c => { const [x, z] = P(c[0], c[1]); mx = Math.max(mx, Math.abs(coastX(z) - x) * 50); });
  console.log('\nbờ đất liền: ' + OSM_DATA.coast.length + ' điểm OSM, lệch lớn nhất ' + Math.round(mx) + ' m'); if (mx > 30){ bad++; console.log('✗ bờ lệch quá 30 m'); } }
console.log(bad ? '\n' + bad + ' mục cần xem lại' : '\nTất cả vị trí khớp OSM'); process.exit(bad ? 1 : 0);
