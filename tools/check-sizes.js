// Kiểm kích thước và hướng mô hình địa danh so với chân đế OSM: mở dist/index.html trong Chromium (WebGL qua SwiftShader),
// đo khung bao của từng mô hình theo trục riêng của nó (bỏ góc quay, nhân tỷ lệ), so với hình chữ nhật bao nhỏ nhất của đối tượng OSM.
// Dùng: node tools/check-sizes.js        (cần Playwright và bản dist/ thật: npm run build). Chạy node tools/check-positions.js trước để có .cache/osm-ref/.
const fs = require("fs"), path = require("path"), { chromium } = require("playwright");
const ROOT = path.join(__dirname, '..'), REF = path.join(ROOT, '.cache/osm-ref');
// địa danh có chân đế công trình trong OSM (khu đất, quần thể thì không so): id mô hình -> mã OSM
const ITEMS = { 'cho-dam':'relation/21159862', 'nha-tho':'way/162818208', 'tram-huong':'way/232454020', 'ga':'way/232457135', 'hon-chong':'way/792392852', pagoda:'way/196896036', 'hai-dang':'way/1241245408' };

function obb(ref){   // hình chữ nhật bao nhỏ nhất (m) và hướng trục dài (độ, từ hướng Đông, ngược chiều kim đồng hồ)
  const j = JSON.parse(fs.readFileSync(path.join(REF, ref.replace('/', '-') + '.json'), 'utf8')), ns = j.elements.filter(e => e.type === 'node');
  const la0 = ns[0].lat, lo0 = ns[0].lon, xy = ns.map(n => [(n.lon - lo0) * 111320 * Math.cos(la0 * Math.PI / 180), (n.lat - la0) * 110574]); let best = null;
  for (let a = 0; a < 180; a++){ const t = a * Math.PI / 180, u = xy.map(p => p[0] * Math.cos(t) + p[1] * Math.sin(t)), v = xy.map(p => -p[0] * Math.sin(t) + p[1] * Math.cos(t));
    const L = Math.max(...u) - Math.min(...u), W = Math.max(...v) - Math.min(...v); if (!best || L * W < best.L * best.W) best = L >= W ? { L, W, a } : { L:W, W:L, a:(a + 90) % 180 }; }
  return best;
}
(async () => {
  const browser = await chromium.launch({ args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport:{ width:1100, height:720 } })).newPage();
  await require('../tests/serve').mount(page, path.join(ROOT, 'dist'));
  await page.goto('http://local/index.html'); await page.waitForFunction(() => window.__nt, null, { timeout:240000 });
  const got = await page.evaluate(ids => { const out = {}, T = __nt.THREE;
    __nt.scene.children.forEach(g => { const id = g.userData && g.userData.lmId; const key = id === 'long-son' && g.scale.x < 0.2 && !out.pagoda && g.rotation.y > 1 ? 'pagoda' : id; if (!ids.includes(key) || out[key]) return;
      const ry = g.rotation.y; g.rotation.y = 0; g.updateMatrixWorld(true); const b = new T.Box3().setFromObject(g); g.rotation.y = ry; g.updateMatrixWorld(true);
      const sx = (b.max.x - b.min.x) * 50, sz = (b.max.z - b.min.z) * 50;
      // trục dài trên bản đồ: trục x của mô hình quay ry quanh trục y (three: x' = cos, z' = −sin) -> góc từ hướng Đông (z hướng Nam)
      const ax = sx >= sz ? ry : ry + Math.PI / 2; out[key] = { L:Math.max(sx, sz), W:Math.min(sx, sz), a:((ax * 180 / Math.PI) % 180 + 180) % 180 }; });
    return out; }, Object.keys(ITEMS));
  await browser.close();
  let bad = 0;
  for (const [id, ref] of Object.entries(ITEMS)){ const o = obb(ref), m = got[id]; if (!m){ console.log(id.padEnd(11) + ' không tìm thấy mô hình'); bad++; continue; }
    const rL = m.L / o.L, rW = m.W / o.W, da = Math.abs(((m.a - o.a) % 180 + 270) % 180 - 90), sq = o.L / o.W < 1.3 || m.L / m.W < 1.15;   // một trong hai gần vuông thì không xét hướng
    const ok = rL > 0.6 && rL < 1.7 && rW > 0.5 && rW < 2.2 && (sq || da < 20); if (!ok) bad++;
    console.log(id.padEnd(11) + ' mô hình ' + Math.round(m.L) + '×' + Math.round(m.W) + ' m, OSM ' + Math.round(o.L) + '×' + Math.round(o.W) + ' m (×' + rL.toFixed(2) + ', ×' + rW.toFixed(2) + ')' +
      (sq ? '' : ', lệch hướng ' + Math.round(da) + '°') + (ok ? '  ok' : '  ✗'));
  }
  console.log(bad ? '\n' + bad + ' mô hình sai kích thước/hướng' : '\nKích thước, hướng khớp OSM'); process.exit(bad ? 1 : 0);
})();
