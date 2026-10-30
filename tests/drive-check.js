// Lái thử xe máy qua các cầu lớn (three.js thay bằng stub như smoke test, vật lý xe chạy thật):
// đặt xe trước đầu cầu, giữ ga, xe phải sang tới đầu bên kia. Bắt các lỗi "cầu không đi được": khe nước ở đầu cầu,
// bờ thấp bị coi là nước, mặt cầu đứt, vướng nhà. Dùng: node tests/drive-check.js
const { chromium } = require('playwright'); const { mount, DIST_TEST } = require('./serve');
const BRIDGES = ['Cầu Xóm Bóng', 'Cầu Trần Phú'];
(async () => {
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport:{ width:1200, height:800 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await mount(page, DIST_TEST, { stub:true });
  await page.goto('http://local/index.html'); await page.waitForFunction(() => window.__nt, null, { timeout:90000 });
  await page.click('#btnPlay'); await page.waitForTimeout(1500); await page.evaluate(() => __nt.toggleMount()); await page.waitForTimeout(300);
  let bad = 0;
  for (const name of BRIDGES){
    // đoạn cầu: đường mang tên này có nhiều điểm mặt cầu nhất; đặt xe trên đường dẫn, cách đầu cầu ~75 m, hướng về đầu kia
    // tuyến lái: ~300 m đường dẫn thật nối vào đầu cầu + cầu + ~300 m đường nối ở đầu kia (đường OSM chung đầu mút)
    const seg = await page.evaluate(n => { let best = null; __nt.ROADS_S.forEach(R => { if (R.name !== n) return; const k = R.pts.filter(p => p.br).length; if (k && (!best || k > best.k)) best = { k, R }; });
      if (!best) return null; const B = best.R.pts.map(p => [p.x, p.z]);
      function link(end, other){ let got = null, gd = 0.35; __nt.ROADS_S.forEach(R => { if (R === best.R || R.rail) return; const q = R.pts.map(p => [p.x, p.z]);
          [[q[0], q], [q[q.length - 1], q.slice().reverse()]].forEach(([e, seq]) => { const d = Math.hypot(e[0] - end[0], e[1] - end[1]); if (d < gd && Math.hypot(seq[seq.length - 1][0] - other[0], seq[seq.length - 1][1] - other[1]) > Math.hypot(e[0] - other[0], e[1] - other[1])){ gd = d; got = seq; } }); });
        return got ? got.slice(0, 13) : []; }
      const pre = link(B[0], B[B.length - 1]).reverse(), post = link(B[B.length - 1], B[0]);
      const path = pre.slice(0, -1).concat(B, post.slice(1)), i0 = Math.max(0, pre.length - 1); return { path, i0, i1:i0 + B.length - 1 }; }, name);
    if (!seg){ console.log('✗ ' + name + ': không tìm thấy mặt cầu'); bad++; continue; }
    for (const [path, endIdx] of [[seg.path, seg.i1], [seg.path.slice().reverse(), seg.path.length - 1 - seg.i0]]){   // hai chiều, bám tim đường; đạt khi vượt đầu cầu bên kia ≥ 50 m
      const from = path[0], to = path[path.length - 1], ux0 = path[1][0] - from[0], uz0 = path[1][1] - from[1], l0 = Math.hypot(ux0, uz0), ux = ux0 / l0, uz = uz0 / l0, sx = from[0] - ux * 1.5, sz = from[1] - uz * 1.5;
      const L = path.reduce((a, p, i) => i ? a + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0, 0);
      await page.evaluate(([x, z, yaw]) => { const b = __nt.PL.bike; b.x = x; b.z = z; b.yaw = yaw; b.speed = 0; }, [sx, sz, Math.atan2(ux, uz)]);
      await page.keyboard.down('KeyW'); let prog = 0, msg = '', t0 = Date.now();
      while (Date.now() - t0 < 4000 + L * 900){ await page.waitForTimeout(250);
        const s = await page.evaluate(() => { const b = __nt.PL.bike, m = document.getElementById('playMsg'); return { x:b.x, z:b.z, m:m ? m.textContent : '' }; });
        // lái theo tim đường (vật lý thật, chỉ chỉnh hướng): điểm trên đường cách xe ~1 đơn vị về phía trước
        let ni = 0, nd = 1e9; path.forEach((p, i) => { const d = Math.hypot(p[0] - s.x, p[1] - s.z); if (d < nd){ nd = d; ni = i; } });
        const tg = path[Math.min(path.length - 1, ni + 2)], ex = to[0] + (to[0] - path[path.length - 2][0]) * 6, ez = to[1] + (to[1] - path[path.length - 2][1]) * 6, aim = ni >= path.length - 2 ? [ex, ez] : tg;
        await page.evaluate(([x, z]) => { const b = __nt.PL.bike; b.yaw = Math.atan2(x - b.x, z - b.z); }, aim);
        prog = Math.max(prog, ni); if (s.m) msg = s.m; if (prog >= Math.min(path.length - 1, endIdx + 2)) break; }
      await page.keyboard.up('KeyW'); await page.waitForTimeout(200);
      const ok = prog >= Math.min(path.length - 1, endIdx + 2); if (!ok) bad++;
      console.log((ok ? '✓ ' : '✗ ') + name + ' (tuyến ' + Math.round(L * 50) + ' m, đầu cầu bên kia ở mét ' + endIdx * 50 / 2 + '): tới mét ' + prog * 50 / 2 + (ok ? '' : ' — dừng' + (msg ? ': "' + msg + '"' : '')));
    } }
  // đường lớn OSM phải được dựng liền: lấy điểm mỗi ~10 m trên đường OSM gốc, phải nằm trong lòng một đường đã dựng (ROADS_S)
  const gap = await page.evaluate(() => { const segs = new Map(), key = (x, z) => Math.floor(x) + ',' + Math.floor(z);
    __nt.ROADS_S.forEach(R => { if (R.rail) return; for (let i = 0; i < R.pts.length - 1; i++){ const a = R.pts[i], b = R.pts[i + 1], k = key(a.x, a.z); if (!segs.has(k)) segs.set(k, []); segs.get(k).push([a, b, R.w]); } });
    let tot = 0, miss = 0; const where = {};
    __nt.OSM.roads.forEach(R => { if (R.c > 4 || R.round) return; for (let i = 0; i < R.pts.length - 1; i++){ const a = R.pts[i], b = R.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.2));
      for (let k = 0; k <= n; k++){ const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; if (!__nt.inBoard(x, z, 1.5) || __nt.G.hAt(x, z) < 0.05) continue; tot++; let ok = false;
        for (let u = -1; u <= 1 && !ok; u++) for (let v = -1; v <= 1 && !ok; v++){ const L2 = segs.get((Math.floor(x) + u) + ',' + (Math.floor(z) + v)); if (L2) for (const [p, q, w] of L2){ const vx = q.x - p.x, vz = q.z - p.z, l = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - p.x) * vx + (z - p.z) * vz) / l)); if (Math.hypot(x - p.x - vx * t, z - p.z - vz * t) < w / 2){ ok = true; break; } } }
        if (!ok){ miss++; where[R.name || '?'] = (where[R.name || '?'] || 0) + 1; } } } });
    return { tot, miss, top:Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 6) }; });
  const gp = gap.miss / Math.max(1, gap.tot), gok = gp < 0.003; if (!gok) bad++;
  console.log((gok ? '✓ ' : '✗ ') + 'Đường lớn OSM dựng liền: hở ' + (gp * 100).toFixed(2) + '% (' + Math.round(gap.miss * 10) + ' m)' + (gok ? '' : ' — nhiều nhất: ' + gap.top.map(e => e[0] + ' ' + e[1] * 10 + ' m').join(', ')));
  if (errs.length){ console.log('Lỗi JS: ' + errs.join(' | ')); bad++; }
  await browser.close(); console.log(bad ? '[drive] ' + bad + ' lượt không qua được cầu' : '[drive] Qua được mọi cầu'); process.exit(bad ? 1 : 0);
})();
