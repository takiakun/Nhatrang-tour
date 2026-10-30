// Kiểm tra giao diện chạm trên điện thoại (bản stub, không cần GPU): vùng trống quanh la bàn, nút ⟲ 2D ⟳, thẻ tên, thước tỉ lệ
// phải để chạm xuyên xuống canvas (kéo bản đồ), còn nút thật vẫn bấm được.
const { chromium } = require('playwright'); const { mount, DIST_TEST } = require('./serve');
(async () => {
  const browser = await chromium.launch(); let fail = 0;
  for (const vp of [{ w:932, h:430, name:'ngang' }, { w:430, h:932, name:'dọc' }]){
    const ctx = await browser.newContext({ viewport:{ width:vp.w, height:vp.h }, isMobile:true, hasTouch:true });
    const page = await ctx.newPage(), errs = [];
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
    page.on('pageerror', e => errs.push(e.message));
    await mount(page, DIST_TEST, { stub:true });
    await page.goto('http://local/index.html');
    await page.waitForFunction(() => window.__nt, null, { timeout:90000 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const box = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x:b.left, y:b.top, w:b.width, h:b.height, r:b.right, b:b.bottom }; };
      const tools = box('.tools'), cam = box('.camctl'), comp = box('#compass'), row = box('.tool-row');
      // lưới điểm trong hộp .tools nhưng không thuộc phần tử bấm được nào: phải là canvas
      const bad = []; let n = 0;
      for (let x = tools.x; x < tools.r; x += 8) for (let y = tools.y; y < tools.b; y += 8){
        const e = document.elementFromPoint(x, y); if (!e) continue; n++;
        if (e.closest('.tool-row,.tool-menu,.camctl,#compass,.brand,.scalebar,.rail-inner,.card,.hint')) continue;
        if (e.tagName !== 'CANVAS') bad.push(Math.round(x) + ',' + Math.round(y) + ':' + e.tagName + '.' + e.className); }
      const at = (b) => document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2);
      return { tools, cam:cam && cam.h, bad:bad.slice(0, 5), nbad:bad.length, n, onBtn:at(row).closest('.tool-row') ? 'ok' : at(row).tagName, onTilt:at(box('#tilt')).id, scrollW:document.documentElement.scrollWidth,
        // điểm cố định ngay bên trái la bàn
        left: (() => { const e = document.elementFromPoint(comp.x - 40, comp.y + comp.h / 2); return e ? e.tagName : null; })() }; });
    // vào chế độ lái: giao diện gọn, mini map có hình, ghi nguồn còn truy cập được, vùng trống vẫn chạm xuyên
    await page.tap('#btnPlay'); await page.waitForTimeout(1900);
    const p = await page.evaluate(() => {
      const vis = s => { const e = document.querySelector(s); if (!e) return false; const cs = getComputedStyle(e), b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0; };
      const mm = document.getElementById('minimap'), b = mm.getBoundingClientRect(), g = mm.getContext('2d');
      const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
      const S = mm.width, N = window.__nt, draw = (az, yaw, tgt) => { N.minimap.draw(N.PL.x, N.PL.z, az, yaw, tgt); return g.getImageData(0, 0, S, S).data; };
      const d0 = draw(0, Math.PI), cols = new Set(); for (let i = 0; i < d0.length; i += 4 * 37) cols.add(d0[i] + ',' + d0[i + 1] + ',' + d0[i + 2]);
      const center = px(S >> 1, S >> 1), corner = px(1, 1);
      // quay camera 180° thì chữ B phải nằm ở đáy thay vì đỉnh: so điểm gần đỉnh giữa hai ảnh
      const topN = Array.from(d0.slice(((S * 0.1 | 0) * S + (S >> 1)) * 4, ((S * 0.1 | 0) * S + (S >> 1)) * 4 + 4)); const d1 = draw(Math.PI, Math.PI), topS = Array.from(d1.slice(((S * 0.1 | 0) * S + (S >> 1)) * 4, ((S * 0.1 | 0) * S + (S >> 1)) * 4 + 4));
      const tgt = draw(0, Math.PI, { x:N.PL.x + 30, z:N.PL.z }); let orange = 0; for (let i = 0; i < tgt.length; i += 4) if (tgt[i] > 240 && tgt[i + 1] > 90 && tgt[i + 1] < 125 && tgt[i + 2] < 70) orange++;
      draw(0, Math.PI);
      const mid = document.elementFromPoint(innerWidth / 2, innerHeight / 2), tl = document.querySelector('.tools').getBoundingClientRect();
      const ptn = document.querySelector('#btnInfo'); ptn.click(); const pop = document.getElementById('attribPop');
      return { brand:vis('.brand'), locate:vis('#btnLocate'), compass:vis('#compass'), camctl:vis('.camctl'), mini:vis('#minimap'), info:vis('#btnInfo'), joy:vis('#joy'), speedo:vis('#speedo'), exit:document.querySelector('#btnPlay span').textContent,
        colors:cols.size, center, corner, topDiff:topN.join() !== topS.join(), orange, attrib:!pop.hidden && /OpenStreetMap/.test(pop.textContent) && /Copernicus/.test(pop.textContent), mid:mid.tagName,
        overlap: (() => { const a = mm.getBoundingClientRect(), t = document.querySelector('.tool-row').getBoundingClientRect(); return !(a.right <= t.left || t.right <= a.left || a.bottom <= t.top || t.bottom <= a.top); })(), scrollW:document.documentElement.scrollWidth }; });
    const okPlay = !p.brand && !p.locate && !p.compass && !p.camctl && p.mini && p.info && p.joy && p.exit === '✕ Thoát' && p.colors > 5 && p.center[0] > 240 && p.center[1] > 90 && p.center[1] < 125 && p.corner[3] === 0
      && p.topDiff && p.orange > 20 && p.attrib && p.mid === 'CANVAS' && !p.overlap && p.scrollW <= vp.w;
    console.log((okPlay ? 'OK  ' : 'FAIL') + ' lái ' + vp.name, JSON.stringify(p)); if (!okPlay) fail++;
    const ok = r.nbad === 0 && r.left === 'CANVAS' && r.onBtn === 'ok' && r.onTilt === 'tilt' && r.scrollW <= vp.w && errs.length === 0;
    if (!ok) fail++;
    console.log((ok ? 'OK  ' : 'FAIL') + ' chạm ' + vp.name, JSON.stringify(r), errs.join(' | '));
    await ctx.close(); }
  await browser.close(); process.exit(fail ? 1 : 0);
})();
