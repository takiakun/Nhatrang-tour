// Tải đường xá, nhà, mặt nước, đường sắt, bờ biển từ OpenStreetMap (© OpenStreetMap contributors, ODbL) qua API OSM
// (api/0.6/map, tối đa 50.000 điểm mỗi lần: chia ô, quá dày thì chia tiếp), lưu bản gốc vào .cache/osm/
// rồi rút gọn thành src/js/osm-data.js (toạ độ đơn vị bản đồ ×20, Int16; base64; mặt nước là mặt nạ 12,5 m nén RLE).
// Dùng: node tools/fetch-osm.js [--refresh]
// (Overpass từng dùng nhưng máy chủ công cộng hay quá tải 504, nên bỏ.)
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), CACHE = path.join(ROOT, '.cache/osm');
const G = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/js/geo.js'), 'utf8') + '\nthis.out = { P, toLL, BX0, BX1, BZ0, BZ1, inBoard };', G);
const { P, toLL, BX0, BX1, BZ0, BZ1, inBoard } = G.out;
const Q = 20;   // lượng tử hoá: 1/20 đơn vị = 2,5 m

// loại đường -> mã (thứ tự = độ quan trọng). Bỏ lối đi bộ, đường mòn, bậc thang, đường nội bộ nhỏ.
const HW = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service'];
const HWRE = new RegExp('^(' + HW.join('|') + ')(_link)?$');
function link(h){ return h.replace('_link', ''); }

const [latN] = toLL(0, BZ0), [latS] = toLL(0, BZ1), lonW = toLL(BX0, 0)[1], lonE = toLL(BX1, 0)[1];
const NT = 4, coastAll = new Map(), roads = new Map(), builds = new Map(), waters = new Map(), lines = new Map(), rails = new Map(), plain = new Map(), rels = new Map();
const un = v => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (t, k) => { const m = t.match(new RegExp(' ' + k + '="([^"]*)"')); return m ? m[1] : null; };
const tagsOf = b => { const t = {}; for (const m of b.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)) t[un(m[1])] = un(m[2]); return t; };
function isWater(t){ return t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin'; }
function osmApi(s, w, n, e, file){
  const f = path.join(CACHE, file); let x = null;
  if (fs.existsSync(f) && !process.argv.includes('--refresh')) x = fs.readFileSync(f, 'utf8');
  else for (let k = 0; k < 3 && x === null; k++){
    try { const out = execFileSync('curl', ['-s', '-m', '120', '-A', 'Nhatrang-tour-fetch/1.0', '-w', '\n%{http_code}', 'https://api.openstreetmap.org/api/0.6/map?bbox=' + [w, s, e, n].map(v => v.toFixed(5)).join(',')], { maxBuffer:1 << 28 }).toString();
      const code = out.slice(out.lastIndexOf('\n') + 1), body = out.slice(0, out.lastIndexOf('\n'));
      if (code === '200'){ fs.mkdirSync(CACHE, { recursive:true }); fs.writeFileSync(f, body); x = body; }
      else if (code === '400') return false;   // quá nhiều điểm: chia nhỏ
      else { console.log('  API ' + code + ', thử lại ' + file); execFileSync('sleep', ['5']); } } catch (err){ console.log('  lỗi mạng API, thử lại ' + file); execFileSync('sleep', ['5']); } }
  if (x === null) throw new Error('API OSM không trả lời: ' + file);
  const nodes = new Map();
  for (const m of x.matchAll(/<node ([^>]*?)\/?>/g)) nodes.set(attr(' ' + m[1], 'id'), { lat:+attr(' ' + m[1], 'lat'), lon:+attr(' ' + m[1], 'lon') });
  for (const m of x.matchAll(/<way ([^>]*)>([\s\S]*?)<\/way>/g)){
    const id = attr(' ' + m[1], 'id'), tags = tagsOf(m[2]), refs = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(r => r[1]);
    const geometry = refs.map(r => nodes.get(r)).filter(Boolean); if (geometry.length < 2) continue;
    const el = { id, tags, refs, geometry };
    if (tags.building) builds.set(id, el);
    else if (tags.highway && HWRE.test(tags.highway)) roads.set(id, el);
    else if (isWater(tags)) waters.set(id, el);
    else if (tags.waterway === 'river' || tags.waterway === 'canal') lines.set(id, el);
    else if (tags.railway === 'rail' && !tags.service) rails.set(id, el);
    else if (tags.natural === 'coastline') coastAll.set(id, el);
    else plain.set(id, el); }   // còn lại (kể cả có thẻ như place=islet): có thể là thành viên của relation mặt nước
  for (const m of x.matchAll(/<relation ([^>]*)>([\s\S]*?)<\/relation>/g)){
    const tags = tagsOf(m[2]); if (!isWater(tags) || tags.type !== 'multipolygon') continue;
    rels.set(attr(' ' + m[1], 'id'), { tags, members:[...m[2].matchAll(/<member type="way" ref="(\d+)" role="(\w*)"\/>/g)].map(r => ({ ref:r[1], role:r[2] || 'outer' })) }); }
  return true;
}
function apiTile(s, w, n, e, name, depth){
  if (osmApi(s, w, n, e, name + '.osm')) return;
  if (depth >= 4) throw new Error('Ô quá dày: ' + name);
  const ms = (s + n) / 2, mw = (w + e) / 2;
  apiTile(s, w, ms, mw, name + 'a', depth + 1); apiTile(s, mw, ms, e, name + 'b', depth + 1); apiTile(ms, w, n, mw, name + 'c', depth + 1); apiTile(ms, mw, n, e, name + 'd', depth + 1); }
for (let a = 0; a < NT; a++) for (let b = 0; b < NT; b++){
  console.log('ô ' + (a * NT + b + 1) + '/' + NT * NT);
  apiTile(latS + (latN - latS) * a / NT, lonW + (lonE - lonW) * b / NT, latS + (latN - latS) * (a + 1) / NT, lonW + (lonE - lonW) * (b + 1) / NT, 'tile-' + a + '-' + b, 0);
}
// ---- bờ biển đất liền: natural=coastline dọc dải ven bờ (API OSM, ô 0,02°), nối thành chuỗi; chuỗi khép kín là đảo nên bỏ.
// Với mỗi vĩ độ (bước 0,001°) lấy giao điểm xa nhất về phía đông của chuỗi đất liền -> COAST thật (x theo z, như coastX).
const coastWays = new Map();
for (let la = 12.12; la < 12.33; la += 0.02) for (const lo of [109.17, 109.19, 109.21, 109.23]){
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
// chỉ có chuỗi đất liền (đảo là vòng khép kín đã bỏ) nên lấy giao điểm xa nhất về phía đông, không giới hạn quanh bờ ước lượng cũ
for (let la = +latN.toFixed(3); la >= latS - 0.0005; la -= 0.001){ let best = null;
  for (const c of chains) for (let i = 0; i < c.length - 1; i++){ const a = c[i], b = c[i + 1]; if ((a[0] - la) * (b[0] - la) > 0 || a[0] === b[0]) continue;
    const lo = a[1] + (b[1] - a[1]) * (la - a[0]) / (b[0] - a[0]); if (best === null || lo > best) best = lo; }
  if (best !== null) coast.push([+la.toFixed(4), +best.toFixed(5)]); }
console.log('[osm] bờ biển: ' + coastWays.size + ' đoạn, ' + chains.length + ' chuỗi đất liền, ' + coast.length + ' điểm COAST');
// ---- đường: polyline, mã loại, số làn, tên (mọi đường có tên, để làm nhãn và tra "đang ở đường nào")
const R = [], names = [];
for (const el of roads.values()){ const t = el.tags, c = HW.indexOf(link(t.highway)); if (c < 0) continue;
  if (t.highway === 'service' && !['alley', undefined].includes(t.service)) continue;   // bỏ bãi đỗ, lối vào nhà
  const pts = el.geometry.map(g => P(g.lat, g.lon)); if (!pts.some(p => inBoard(p[0], p[1], 0))) continue;
  let ni = -1; if (t.name){ ni = names.indexOf(t.name); if (ni < 0){ names.push(t.name); ni = names.length - 1; } }
  R.push({ c, l:Math.min(6, +t.lanes || 0), ni, b:(t.bridge && t.bridge !== 'no' ? 1 : 0) | (t.oneway === 'yes' || t.oneway === '-1' || /_link$/.test(t.highway) && t.oneway !== 'no' ? 2 : 0) | (/^(roundabout|circular)$/.test(t.junction) ? 4 : 0), pts }); }   // cờ: 1 cầu, 2 một chiều (nửa đường đôi), 4 bùng binh
// ---- nhà: đa giác chân đế + số tầng / chiều cao nếu có
const B = [];
for (const el of builds.values()){ const t = el.tags, g = el.geometry; if (g.length < 4) continue;
  const pts = g.slice(0, -1).map(q => P(q.lat, q.lon)); if (!inBoard(pts[0][0], pts[0][1], 0)) continue;
  const lv = +t['building:levels'] || (t.height ? Math.round(parseFloat(t.height) / 3.4) : 0);
  B.push({ lv:Math.min(60, lv || 0), k:/^(house|detached|residential|apartments|terrace|semidetached_house)$/.test(t.building) ? 0 : (/^(commercial|retail|office|hotel)$/.test(t.building) ? 1 : 2), pts }); }
// nối các đường (way) chung đầu mút thành chuỗi, cho phép đảo chiều; trả về danh sách mảng toạ độ [lat, lon]
function joinChains(ways){
  const left = new Set(ways.map((w, i) => i)), ends = new Map(), out = [];
  ways.forEach((w, i) => [w.refs[0], w.refs[w.refs.length - 1]].forEach(r => { if (!ends.has(r)) ends.set(r, []); ends.get(r).push(i); }));
  while (left.size){ const i0 = left.values().next().value; left.delete(i0); let refs = ways[i0].refs.slice(), pts = ways[i0].geometry.slice();
    for (let side = 0; side < 2; side++){
      for (;;){ const tip = refs[refs.length - 1], j = (ends.get(tip) || []).find(q => left.has(q)); if (j === undefined || refs[0] === tip && refs.length > 2) break;
        left.delete(j); let r2 = ways[j].refs, g2 = ways[j].geometry; if (r2[0] !== tip){ r2 = r2.slice().reverse(); g2 = g2.slice().reverse(); }
        refs = refs.concat(r2.slice(1)); pts = pts.concat(g2.slice(1)); }
      refs.reverse(); pts.reverse(); }
    out.push({ refs, pts }); }
  return out; }
// ---- mặt nước (sông, hồ, đầm, ao): đa giác OSM + relation multipolygon (chẵn–lẻ, nên đảo giữa sông vẫn là đất) + sông/kênh dạng đường
// -> mặt nạ ô 0,25 đơn vị (12,5 m), nén RLE theo hàng (Uint16: số ô 0, số ô 1, ...)
const WS = 0.25, MW = Math.ceil((BX1 - BX0) / WS), MH = Math.ceil((BZ1 - BZ0) / WS), wm = new Uint8Array(MW * MH);
const wayById = id => waters.get(id) || plain.get(id) || lines.get(id) || roads.get(id) || rails.get(id);
const polys = [];
for (const w of waters.values()) if (w.refs[0] === w.refs[w.refs.length - 1]) polys.push({ outer:[w.geometry], inner:[], src:'way/' + w.id });
const rings = (r, role) => joinChains(r.members.filter(m => m.role === role).map(m => wayById(m.ref)).filter(Boolean)).filter(c => c.refs[0] === c.refs[c.refs.length - 1]).map(c => c.pts);
for (const [rid, r] of rels) polys.push({ outer:rings(r, 'outer'), inner:rings(r, 'inner'), src:'relation/' + rid });
let filled = 0; const DBG = process.env.DEBUG_PT ? P(...process.env.DEBUG_PT.split(',').map(Number)) : null;
// tô từng vòng (chẵn–lẻ trong một vòng): vòng ngoài của mọi đa giác trước, sau đó khoét các vòng trong (cù lao, đảo giữa sông)
let wmTarget = null;   // fillRing tô vào wm (mặt nước) hoặc mặt nạ khác khi đặt wmTarget
function fillRing(g, v){ const wm2 = wmTarget || wm, R = g.map(q => P(q.lat, q.lon)); let z0 = 1e9, z1 = -1e9; R.forEach(p => { z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
  for (let j = Math.max(0, Math.floor((z0 - BZ0) / WS)); j <= Math.min(MH - 1, Math.ceil((z1 - BZ0) / WS)); j++){ const zc = BZ0 + (j + 0.5) * WS, xs = [];
    for (let i = 0; i < R.length - 1; i++){ const a = R[i], b = R[i + 1]; if ((a[1] > zc) !== (b[1] > zc)) xs.push(a[0] + (b[0] - a[0]) * (zc - a[1]) / (b[1] - a[1])); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil((xs[k] - BX0) / WS - 0.5)); i <= Math.min(MW - 1, Math.floor((xs[k + 1] - BX0) / WS - 0.5)); i++){ if (wm2[j * MW + i] !== v) filled += v ? 1 : -1; wm2[j * MW + i] = v; } } }
polys.forEach(p => p.outer.forEach(g => fillRing(g, 1)));
polys.forEach(p => p.inner.forEach(g => fillRing(g, 0)));
if (DBG){ const k = Math.floor((DBG[1] - BZ0) / WS) * MW + Math.floor((DBG[0] - BX0) / WS); console.log('  [debug] điểm ' + process.env.DEBUG_PT + ': ' + (wm[k] ? 'nước' : 'đất')); }
for (const w of lines.values()){ const wm_ = parseFloat(w.tags.width) || (w.tags.waterway === 'river' ? 16 : 8), hw = wm_ / 100, pts = w.geometry.map(q => P(q.lat, q.lon));   // sông chỉ có đường tâm: rộng theo thẻ width, không có thì sông 16 m, kênh 8 m
  for (let i = 0; i < pts.length - 1; i++){ const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / (WS * 0.5));
    for (let k = 0; k <= n; k++){ const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      for (let jj = Math.floor((z - hw - BZ0) / WS); jj <= Math.floor((z + hw - BZ0) / WS); jj++) for (let ii = Math.floor((x - hw - BX0) / WS); ii <= Math.floor((x + hw - BX0) / WS); ii++){
        if (ii < 0 || jj < 0 || ii >= MW || jj >= MH) continue; const cx = BX0 + (ii + 0.5) * WS, cz = BZ0 + (jj + 0.5) * WS; if (Math.hypot(cx - x, cz - z) <= hw) wm[jj * MW + ii] = 1; } } } }
// ---- đảo: đường bờ OSM khép kín (natural=coastline) trên toàn bàn -> mặt nạ đất đảo cùng lưới (đất lấn biển mới hơn DEM vẫn đúng)
const lm = new Uint8Array(MW * MH); { let n = 0;
  for (const [id, w] of coastWays) if (!coastAll.has(id)) coastAll.set(id, { id, refs:w.ids, geometry:w.pts.map(p => ({ lat:p[0], lon:p[1] })) });
  const isl = joinChains([...coastAll.values()].filter(w => w.geometry.length === w.refs.length)).filter(c => c.refs[0] === c.refs[c.refs.length - 1]);
  wmTarget = lm; isl.forEach(c => { fillRing(c.pts, 1); n++; }); wmTarget = null;
  console.log('[osm] đảo: ' + n + ' vòng bờ khép kín'); }
function rle(m){ const r = []; let cur = 0, n = 0; for (let k = 0; k < m.length; k++){ if (m[k] !== cur){ while (n > 65535){ r.push(65535, 0); n -= 65535; } r.push(n); cur = m[k]; n = 0; } n++; } r.push(n); return r; }
const runs = []; { let cur = 0, n = 0; for (let k = 0; k < wm.length; k++){ if (wm[k] !== cur){ while (n > 65535){ runs.push(65535, 0); n -= 65535; } runs.push(n); cur = wm[k]; n = 0; } n++; } runs.push(n); }
console.log('[osm] mặt nước: ' + waters.size + ' đa giác, ' + rels.size + ' relation, ' + lines.size + ' sông/kênh dạng đường; mặt nạ ' + MW + '×' + MH + ', ' + runs.length + ' đoạn RLE');
// ---- đường sắt: nối railway=rail (không phải đường nhánh) thành chuỗi, lấy chuỗi dài nhất (tuyến Bắc–Nam qua ga Nha Trang)
const railChains = joinChains([...rails.values()]).map(c => c.pts.map(q => P(q.lat, q.lon))).map(p => ({ p, L:p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0) }));
railChains.sort((a, b) => b.L - a.L);   // chuỗi đầu (dài nhất) cho tàu chạy; mọi chuỗi đều vẽ ray
console.log('[osm] đường sắt: ' + rails.size + ' đoạn, chuỗi dài nhất ' + (railChains.length ? (railChains[0].L * 50 / 1000).toFixed(1) : 0) + ' km');
// ---- đóng gói: một mảng Int16 toạ độ; bảng chỉ mục [số điểm, loại, ...]
function packPolys(list, head){ const co = [], hd = []; list.forEach(o => { hd.push(o.pts.length, ...head(o)); o.pts.forEach(p => co.push(Math.round(p[0] * Q), Math.round(p[1] * Q))); });
  return { co:Buffer.from(Int16Array.from(co).buffer).toString('base64'), hd:Buffer.from(Int16Array.from(hd).buffer).toString('base64') }; }
const pr = packPolys(R, o => [o.c, o.l, o.ni, o.b]), pb = packPolys(B, o => [o.lv, o.k]);
const out = '/* Tự sinh bởi tools/fetch-osm.js, đừng sửa tay. Dữ liệu © OpenStreetMap contributors, giấy phép ODbL (openstreetmap.org/copyright). */\n' +
  'var OSM_DATA = { q:' + Q + ', classes:' + JSON.stringify(HW) + ',\n  roads:{ n:' + R.length + ', hd:"' + pr.hd + '", co:"' + pr.co + '" },\n  names:' + JSON.stringify(names) + ',\n  coast:' + JSON.stringify(coast) + ',\n' +
  '  builds:{ n:' + B.length + ', hd:"' + pb.hd + '", co:"' + pb.co + '" },\n' +
  '  water:{ step:' + WS + ', w:' + MW + ', h:' + MH + ', rle:"' + Buffer.from(Uint16Array.from(runs).buffer).toString('base64') + '" },\n' +
  '  land:{ step:' + WS + ', w:' + MW + ', h:' + MH + ', rle:"' + Buffer.from(Uint16Array.from(rle(lm)).buffer).toString('base64') + '" },\n' +
  '  rails:' + JSON.stringify(railChains.filter(c => c.L > 0.5).map(c => Buffer.from(Int16Array.from(c.p.flatMap(p => [Math.round(p[0] * Q), Math.round(p[1] * Q)])).buffer).toString('base64'))) + ' };\n';
fs.writeFileSync(path.join(ROOT, 'src/js/osm-data.js'), out);
const cnt = {}; R.forEach(r => cnt[HW[r.c]] = (cnt[HW[r.c]] || 0) + 1);
console.log('[osm] ' + R.length + ' đoạn đường ' + JSON.stringify(cnt) + ', ' + B.length + ' nhà (' + B.filter(b => b.lv).length + ' có số tầng), ' + names.length + ' tên đường, ' + (out.length / 1024).toFixed(0) + ' KB');
