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
    // chip gió (#windchip): hiện, không nhận chạm, không đè lên nút, la bàn, thước tỉ lệ
    const wc = await page.evaluate(() => { const c = document.getElementById('windchip'), b = c.getBoundingClientRect(), cs = getComputedStyle(c); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      const rects = ['.tool-row', '.camctl', '#compass', '#scale', '.brand'].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
      const over = rects.some(a => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
      return { vis:!c.hidden && b.width > 0, pe:cs.pointerEvents, hit:hit && hit.tagName, over, inView:b.right <= innerWidth && b.bottom <= innerHeight, txt:c.textContent.replace(/\s+/g, ' ').trim() }; });
    const okWc = wc.vis && wc.pe === 'none' && wc.hit === 'CANVAS' && !wc.over && wc.inView && /km\/h/.test(wc.txt) && /cấp/.test(wc.txt);
    console.log((okWc ? 'OK  ' : 'FAIL') + ' chip gió ' + vp.name, JSON.stringify(wc)); if (!okWc) fail++;
    // bấm THẬT nút thời tiết trong menu (một chú thích từng nuốt mất dòng gắn sự kiện, trong khi test chỉ dùng hook): thật → nắng → mưa → thật; không lưu chế độ mô phỏng
    await page.tap('#btnMenu'); const wxSeq = [];
    for (let i = 0; i < 4; i++){ wxSeq.push([await page.textContent('#btnWxText'), (await page.textContent('#wx')).trim()]); if (i < 3){ await page.tap('#btnWx'); await page.waitForTimeout(50); } }
    await page.waitForFunction(() => document.getElementById('btnWxText').textContent === 'Thời tiết thật', null, { timeout:3000 });
    await page.tap('#btnWx'); await page.tap('#btnWx');   // về chế độ mưa để kiểm chip gió ghi "mô phỏng"
    const rainSrc = await page.waitForFunction(() => { const s = document.getElementById('windSrc'); return s && s.textContent === 'mô phỏng'; }, null, { timeout:5000 }).then(() => true, () => false);
    const saved = await page.evaluate(() => { try { return localStorage.getItem('nt-wx'); } catch (e){ return null; } });
    await page.tap('#btnWx'); await page.tap('#btnMenu');   // về thật, đóng menu
    const okWx = wxSeq[0][0] === 'Thời tiết thật' && wxSeq[1][0] === 'Trời nắng' && wxSeq[2][0] === 'Trời mưa' && wxSeq[3][0] === 'Thời tiết thật'
      && /ước lượng/.test(wxSeq[0][1]) && wxSeq[1][1] === 'Mô phỏng: trời nắng' && wxSeq[2][1] === 'Mô phỏng: trời mưa' && /ước lượng/.test(wxSeq[3][1]) && rainSrc && saved === null;
    console.log((okWx ? 'OK  ' : 'FAIL') + ' nút thời tiết ' + vp.name, JSON.stringify({ wxSeq, rainSrc, saved })); if (!okWx) fail++;
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
    // joystick và nút không được để pointermove/pointerup nổi bọt lên document (OrbitControls nghe ở đó và sẽ xoay camera theo ngón chạm joystick)
    const leak = await page.evaluate(() => { const seen = {}; const h = e => { seen[e.target.id || e.target.tagName] = (seen[e.target.id || e.target.tagName] || 0) + 1; }; document.addEventListener('pointermove', h); document.addEventListener('pointerup', h);
      const fire = (id, type) => document.getElementById(id).dispatchEvent(new PointerEvent(type, { bubbles:true, pointerId:7, pointerType:'touch', clientX:60, clientY:300 }));
      ['joy', 'btnHorn', 'btnCam', 'minimap'].forEach(id => { fire(id, 'pointermove'); fire(id, 'pointerup'); }); window.__nt.THREE && document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove', { bubbles:true, pointerId:9 }));
      document.removeEventListener('pointermove', h); document.removeEventListener('pointerup', h); return seen; });
    // chip gió khi lái: vẫn hiện, không đè mini map, đồng hồ tốc độ (hiện tạm để đo), nút điều khiển, joystick, khung ghi nguồn
    const wp = await page.evaluate(() => { const sp = document.getElementById('speedo'), was = sp.hidden; sp.hidden = false; const c = document.getElementById('windchip'), b = c.getBoundingClientRect(), cs = getComputedStyle(c);
      const rects = ['#minimap', '#btnInfo', '#speedo', '.play-btns', '#joy', '.tool-row'].map(s => document.querySelector(s)).filter(e => e && getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect());
      const over = rects.some(a => a.width > 0 && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)); sp.hidden = was;
      return { vis:!c.hidden && b.width > 0 && cs.display !== 'none', pe:cs.pointerEvents, over, inView:b.right <= innerWidth && b.bottom <= innerHeight }; });
    const okWp = wp.vis && wp.pe === 'none' && !wp.over && wp.inView; console.log((okWp ? 'OK  ' : 'FAIL') + ' chip gió khi lái ' + vp.name, JSON.stringify(wp)); if (!okWp) fail++;
    p.leak = leak; const okLeak = Object.keys(leak).every(k => k === 'CANVAS');
    if (!okLeak){ console.log('FAIL rò sự kiện con trỏ', JSON.stringify(leak)); fail++; }
    const okPlay = !p.brand && !p.locate && !p.compass && !p.camctl && p.mini && p.info && p.joy && p.exit === '✕ Thoát' && p.colors > 5 && p.center[0] > 240 && p.center[1] > 90 && p.center[1] < 125 && p.corner[3] === 0
      && p.topDiff && p.orange > 20 && p.attrib && p.mid === 'CANVAS' && !p.overlap && p.scrollW <= vp.w;
    console.log((okPlay ? 'OK  ' : 'FAIL') + ' lái ' + vp.name, JSON.stringify(p)); if (!okPlay) fail++;
    const ok = r.nbad === 0 && r.left === 'CANVAS' && r.onBtn === 'ok' && r.onTilt === 'tilt' && r.scrollW <= vp.w && errs.length === 0;
    if (!ok) fail++;
    console.log((ok ? 'OK  ' : 'FAIL') + ' chạm ' + vp.name, JSON.stringify(r), errs.join(' | '));
    await ctx.close(); }
  await browser.close(); process.exit(fail ? 1 : 0);
})();
