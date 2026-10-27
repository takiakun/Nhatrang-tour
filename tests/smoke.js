// Smoke test chạy trang trong Chromium không cần GPU.
// three.js được thay bằng một "stub" (tests/stub-three.js): mọi lệnh 3D thành no-op, còn toàn bộ
// logic của mình (địa hình, sinh nhà/cây/người, va chạm, điều khiển nhân vật, UI) chạy thật.
// => bắt được lỗi JS, lỗi logic, lỗi bố cục; KHÔNG kiểm tra được hình ảnh 3D hay shader.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  const stub = fs.readFileSync(path.join(__dirname, 'stub-three.js'), 'utf8');
  const browser = await chromium.launch(); let fail = 0;
  for (const vp of [{ w:1440, h:900, name:'desktop' }, { w:390, h:844, name:'phone', mobile:true }]){
    const ctx = await browser.newContext({ viewport:{ width:vp.w, height:vp.h }, isMobile:!!vp.mobile, hasTouch:!!vp.mobile });
    const page = await ctx.newPage(), errs = [];
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ contentType:'application/javascript', body:stub });
      if (u.includes('OrbitControls')) return r.fulfill({ contentType:'application/javascript', body:'' });
      if (u.startsWith('http://local/')) return r.fulfill({ contentType:'text/html', body:html });
      return r.abort(); });
    const t0 = Date.now(); await page.goto('http://local/');
    await page.waitForFunction(() => window.__nt || !document.getElementById('err').hidden, null, { timeout:90000 });
    const r = await page.evaluate(() => { const n = window.__nt; if (!n) return { err:document.getElementById('err').textContent };
      return { houses:n.B.tubes.length + n.B.villas.length, towers:n.B.towers.length, trees:n.T.round.length + n.T.cones.length, people:n.anim.crowd.n, vehicles:n.anim.vehicles.list.length, landmarks:n.LM.length, scrollW:document.documentElement.scrollWidth }; });
    // vào chế độ lái xe, lên xe, chạy 2 giây
    await page.click('#btnPlay'); await page.waitForTimeout(1900); await page.evaluate(() => window.__nt.toggleMount());
    if (!vp.mobile){ await page.keyboard.down('KeyW'); await page.waitForTimeout(2000); await page.keyboard.up('KeyW'); }
    const pl = await page.evaluate(() => { const P = window.__nt.PL; return P.mode + ' @ ' + P.x.toFixed(1) + ',' + P.z.toFixed(1); });
    const ok = !r.err && errs.length === 0 && r.scrollW <= vp.w;
    if (!ok) fail++;
    console.log((ok ? 'OK  ' : 'FAIL') + ' ' + vp.name + ' build ' + (Date.now() - t0) + 'ms', JSON.stringify(r), 'player:', pl, errs.length ? '\n  errors: ' + errs.join(' | ') : '');
    await ctx.close(); }
  await browser.close(); process.exit(fail ? 1 : 0);
})();
