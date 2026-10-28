// Tải đường xá và nhà từ OpenStreetMap (© OpenStreetMap contributors, ODbL) qua Overpass, chia ô nhỏ, có thử lại,
// lưu bản gốc vào .cache/osm/ rồi rút gọn thành src/js/osm-data.js (toạ độ đơn vị bản đồ ×20, Int16; base64).
// Dùng: node tools/fetch-osm.js [--refresh]       (OVERPASS=<url> để đổi máy chủ; Overpass bận thì tự dùng API OSM)
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), CACHE = path.join(ROOT, '.cache/osm');
const G = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/js/geo.js'), 'utf8') + '\nthis.out = { P, toLL, BX0, BX1, BZ0, BZ1, inBoard, coastX };', G);
const { P, toLL, BX0, BX1, BZ0, BZ1, inBoard, coastX } = G.out;
const SERVERS = (process.env.OVERPASS || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass-api.de/api/interpreter').split(',');
const Q = 20;   // lượng tử hoá: 1/20 đơn vị = 2,5 m

// loại đường -> mã (thứ tự = độ quan trọng). Bỏ lối đi bộ, đường mòn, bậc thang, đường nội bộ nhỏ.
const HW = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service'];
function link(h){ return h.replace('_link', ''); }

function overpass(q, file){
  const f = path.join(CACHE, file); if (fs.existsSync(f) && !process.argv.includes('--refresh')) return JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.mkdirSync(CACHE, { recursive:true });
  for (let k = 0; k < 2; k++){ const url = SERVERS[0];
    try { const out = execFileSync('curl', ['-s', '-m', '180', '--data-urlencode', 'data=' + q, url], { maxBuffer:1 << 28 }).toString();
      if (out.trim().startsWith('{')){ const j = JSON.parse(out); if (!j.remark || !/error/i.test(j.remark)){ fs.writeFileSync(f, out); return j; } }
      console.log('  thử lại (' + (k + 1) + ') ' + file); } catch (e){ console.log('  lỗi mạng, thử lại (' + (k + 1) + ') ' + file); }
    execFileSync('sleep', ['4']); }
  return null;   // để nơi gọi chia ô nhỏ hơn
}

const [latN] = toLL(0, BZ0), [latS] = toLL(0, BZ1), lonW = toLL(BX0, 0)[1], lonE = toLL(BX1, 0)[1];
const NT = 4, roads = new Map(), builds = new Map();
// API OSM chính (api/0.6/map, giới hạn 50.000 điểm mỗi lần): dự phòng khi Overpass quá tải. Trả về dạng giống Overpass.
const HWRE = new RegExp('^(' + HW.join('|') + ')(_link)?$');
function osmApi(s, w, n, e, file){
  const f = path.join(CACHE, file); let x = null;
  if (fs.existsSync(f) && !process.argv.includes('--refresh')) x = fs.readFileSync(f, 'utf8');
  else for (let k = 0; k < 3 && x === null; k++){
    try { const out = execFileSync('curl', ['-s', '-m', '120', '-A', 'Nhatrang-tour-fetch/1.0', '-w', '\n%{http_code}', 'https://api.openstreetmap.org/api/0.6/map?bbox=' + [w, s, e, n].map(v => v.toFixed(5)).join(',')], { maxBuffer:1 << 28 }).toString();
      const code = out.slice(out.lastIndexOf('\n') + 1), body = out.slice(0, out.lastIndexOf('\n'));
      if (code === '200'){ fs.mkdirSync(CACHE, { recursive:true }); fs.writeFileSync(f, body); x = body; }
      else if (code === '400') return null;   // quá nhiều điểm: chia nhỏ
      else { console.log('  API ' + code + ', thử lại ' + file); execFileSync('sleep', ['5']); } } catch (err){ console.log('  lỗi mạng API, thử lại ' + file); execFileSync('sleep', ['5']); } }
  if (x === null) throw new Error('API OSM không trả lời: ' + file);
  const nodes = new Map(), els = [], attr = (t, k) => { const m = t.match(new RegExp(' ' + k + '="([^"]*)"')); return m ? m[1] : null; };
  const un = v => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const m of x.matchAll(/<node ([^>]*?)\/?>/g)) nodes.set(attr(' ' + m[1], 'id'), { lat:+attr(' ' + m[1], 'lat'), lon:+attr(' ' + m[1], 'lon') });
  for (const m of x.matchAll(/<way ([^>]*)>([\s\S]*?)<\/way>/g)){
    const tags = {}; for (const t of m[2].matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)) tags[un(t[1])] = un(t[2]);
    if (!(tags.building || (tags.highway && HWRE.test(tags.highway)))) continue;
    const geometry = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(r => nodes.get(r[1])).filter(Boolean);
    if (geometry.length > 1) els.push({ id:+attr(' ' + m[1], 'id'), tags, geometry }); }
  return { elements:els };
}
function apiTile(s, w, n, e, name, depth){
  const j = osmApi(s, w, n, e, name + '.osm');
  if (j){ for (const el of j.elements){ (el.tags.building ? builds : roads).set(el.id, el); } return; }
  if (depth >= 4) throw new Error('Ô quá dày: ' + name);
  const ms = (s + n) / 2, mw = (w + e) / 2;
  apiTile(s, w, ms, mw, name + 'a', depth + 1); apiTile(s, mw, ms, e, name + 'b', depth + 1); apiTile(ms, w, n, mw, name + 'c', depth + 1); apiTile(ms, mw, n, e, name + 'd', depth + 1); }
// ô nào Overpass không trả lời thì lấy từ API OSM (chia 2×2 trước, quá dày thì chia tiếp)
function tile(s, w, n, e, name){
  if (fs.existsSync(path.join(CACHE, name + '.osm')) || fs.existsSync(path.join(CACHE, name + 'a.osm'))) return apiTile(s, w, n, e, name, 0);   // lần trước đã lấy qua API
  const bb = [s, w, n, e].map(v => v.toFixed(5)).join(',');
  const j = overpass('[out:json][timeout:170];(way["highway"~"^(' + HW.join('|') + ')(_link)?$"](' + bb + ');way["building"](' + bb + '););out tags geom;', name + '.json');
  if (j){ for (const el of j.elements) if (el.geometry){ (el.tags.building ? builds : roads).set(el.id, el); } return; }
  console.log('  Overpass bận, dùng API OSM cho ' + name); apiTile(s, w, n, e, name, 0); }
for (let a = 0; a < NT; a++) for (let b = 0; b < NT; b++){
  console.log('ô ' + (a * NT + b + 1) + '/' + NT * NT);
  tile(latS + (latN - latS) * a / NT, lonW + (lonE - lonW) * b / NT, latS + (latN - latS) * (a + 1) / NT, lonW + (lonE - lonW) * (b + 1) / NT, 'tile-' + a + '-' + b);
}
// ---- bờ biển đất liền: natural=coastline dọc dải ven bờ (API OSM, ô 0,02°), nối thành chuỗi; chuỗi khép kín là đảo nên bỏ.
// Với mỗi vĩ độ (bước 0,001°) lấy giao điểm xa nhất về phía đông của chuỗi đất liền -> COAST thật (x theo z, như coastX).
const coastWays = new Map();
for (let la = 12.12; la < 12.33; la += 0.02) for (const lo of [109.17, 109.19, 109.21]){
  const nm = 'coast-' + la.toFixed(2) + '-' + lo.toFixed(2), f = path.join(CACHE, nm + '.osm'); let x;
  if (fs.existsSync(f)) x = fs.readFileSync(f, 'utf8');
  else { x = execFileSync('curl', ['-s', '-m', '120', '-A', 'Nhatrang-tour-fetch/1.0', 'https://api.openstreetmap.org/api/0.6/map?bbox=' + [lo, la, lo + 0.02, la + 0.02].map(v => v.toFixed(3)).join(',')], { maxBuffer:1 << 28 }).toString();
    if (!x.includes('<osm')) throw new Error('API OSM lỗi: ' + nm); fs.writeFileSync(f, x); execFileSync('sleep', ['1']); }
  const nodes = new Map(); for (const m of x.matchAll(/<node id="(\d+)"[^>]*?lat="([\d.-]+)" lon="([\d.-]+)"/g)) nodes.set(m[1], [+m[2], +m[3]]);
  for (const m of x.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)){ if (!/k="natural" v="coastline"/.test(m[2])) continue;
    const ids = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(r => r[1]); if (ids.every(i => nodes.has(i))) coastWays.set(m[1], { ids, pts:ids.map(i => nodes.get(i)) }); } }
const chains = []; { const left = new Map(coastWays), byStart = new Map(); for (const [k, w] of left) byStart.set(w.ids[0], k);
  while (left.size){ const [k0, w0] = left.entries().next().value; left.delete(k0); let ids = w0.ids.slice(), pts = w0.pts.slice();
    for (;;){ const k = byStart.get(ids[ids.length - 1]); if (!k || !left.has(k)) break; const w = left.get(k); left.delete(k); ids = ids.concat(w.ids.slice(1)); pts = pts.concat(w.pts.slice(1)); }
    for (;;){ const k = [...left.keys()].find(q => { const w = left.get(q); return w.ids[w.ids.length - 1] === ids[0]; }); if (!k) break; const w = left.get(k); left.delete(k); ids = w.ids.concat(ids.slice(1)); pts = w.pts.concat(pts.slice(1)); }
    if (ids[0] !== ids[ids.length - 1]) chains.push(pts); } }   // chuỗi khép kín = đảo
const coast = [];
// chỉ xét giao điểm gần bờ ước lượng cũ (−0,015°…+0,01°) để bỏ mảnh bờ đảo bị cắt dở ở rìa dải tải về
for (let la = +latN.toFixed(3); la >= latS - 0.0005; la -= 0.001){ let best = null; const zz = P(la, 109.2)[1], est = toLL(coastX(zz), zz)[1];
  for (const c of chains) for (let i = 0; i < c.length - 1; i++){ const a = c[i], b = c[i + 1]; if ((a[0] - la) * (b[0] - la) > 0 || a[0] === b[0]) continue;
    const lo = a[1] + (b[1] - a[1]) * (la - a[0]) / (b[0] - a[0]); if (lo < est - 0.015 || lo > est + 0.01) continue; if (best === null || lo > best) best = lo; }
  if (best !== null) coast.push([+la.toFixed(4), +best.toFixed(5)]); }
console.log('[osm] bờ biển: ' + coastWays.size + ' đoạn, ' + chains.length + ' chuỗi đất liền, ' + coast.length + ' điểm COAST');
// ---- đường: polyline, mã loại, số làn, tên (chỉ giữ tên đường lớn để làm nhãn)
const R = [], names = [];
for (const el of roads.values()){ const t = el.tags, c = HW.indexOf(link(t.highway)); if (c < 0) continue;
  if (t.highway === 'service' && !['alley', undefined].includes(t.service)) continue;   // bỏ bãi đỗ, lối vào nhà
  const pts = el.geometry.map(g => P(g.lat, g.lon)); if (!pts.some(p => inBoard(p[0], p[1], 0))) continue;
  let ni = -1; if (t.name && c <= 4){ ni = names.indexOf(t.name); if (ni < 0){ names.push(t.name); ni = names.length - 1; } }
  R.push({ c, l:Math.min(6, +t.lanes || 0), ni, b:t.bridge === 'yes' ? 1 : 0, pts }); }
// ---- nhà: đa giác chân đế + số tầng / chiều cao nếu có
const B = [];
for (const el of builds.values()){ const t = el.tags, g = el.geometry; if (g.length < 4) continue;
  const pts = g.slice(0, -1).map(q => P(q.lat, q.lon)); if (!inBoard(pts[0][0], pts[0][1], 0)) continue;
  const lv = +t['building:levels'] || (t.height ? Math.round(parseFloat(t.height) / 3.4) : 0);
  B.push({ lv:Math.min(60, lv || 0), k:/^(house|detached|residential|apartments|terrace|semidetached_house)$/.test(t.building) ? 0 : (/^(commercial|retail|office|hotel)$/.test(t.building) ? 1 : 2), pts }); }
// ---- đóng gói: một mảng Int16 toạ độ; bảng chỉ mục [số điểm, loại, ...]
function packPolys(list, head){ const co = [], hd = []; list.forEach(o => { hd.push(o.pts.length, ...head(o)); o.pts.forEach(p => co.push(Math.round(p[0] * Q), Math.round(p[1] * Q))); });
  return { co:Buffer.from(Int16Array.from(co).buffer).toString('base64'), hd:Buffer.from(Int16Array.from(hd).buffer).toString('base64') }; }
const pr = packPolys(R, o => [o.c, o.l, o.ni, o.b]), pb = packPolys(B, o => [o.lv, o.k]);
const out = '/* Tự sinh bởi tools/fetch-osm.js, đừng sửa tay. Dữ liệu © OpenStreetMap contributors, giấy phép ODbL (openstreetmap.org/copyright). */\n' +
  'var OSM_DATA = { q:' + Q + ', classes:' + JSON.stringify(HW) + ',\n  roads:{ n:' + R.length + ', hd:"' + pr.hd + '", co:"' + pr.co + '" },\n  names:' + JSON.stringify(names) + ',\n  coast:' + JSON.stringify(coast) + ',\n' +
  '  builds:{ n:' + B.length + ', hd:"' + pb.hd + '", co:"' + pb.co + '" } };\n';
fs.writeFileSync(path.join(ROOT, 'src/js/osm-data.js'), out);
const cnt = {}; R.forEach(r => cnt[HW[r.c]] = (cnt[HW[r.c]] || 0) + 1);
console.log('[osm] ' + R.length + ' đoạn đường ' + JSON.stringify(cnt) + ', ' + B.length + ' nhà (' + B.filter(b => b.lv).length + ' có số tầng), ' + names.length + ' tên đường, ' + (out.length / 1024).toFixed(0) + ' KB');
