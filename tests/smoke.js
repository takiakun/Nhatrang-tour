// Smoke test chạy trang trong Chromium không cần GPU.
// three.js được thay bằng một "stub" (tests/stub-three.js): mọi lệnh 3D thành no-op, còn toàn bộ
// logic của mình (địa hình, sinh nhà/cây/người, va chạm, điều khiển nhân vật, UI) chạy thật.
// => bắt được lỗi JS, lỗi logic, lỗi bố cục; KHÔNG kiểm tra được hình ảnh 3D hay shader.
const { chromium } = require('playwright'); const { mount, DIST_TEST } = require('./serve');
(async () => {
  const browser = await chromium.launch(); let fail = 0;
  // phone = điện thoại mạnh (8 nhân) dựng bản đầy đủ; phone-lite ép bản nhẹ bằng ?q=lite
  for (const vp of [{ w:1440, h:900, name:'desktop' }, { w:390, h:844, name:'phone', mobile:true }, { w:390, h:844, name:'phone-lite', mobile:true, q:'?q=lite' }]){
    const ctx = await browser.newContext({ viewport:{ width:vp.w, height:vp.h }, isMobile:!!vp.mobile, hasTouch:!!vp.mobile });
    const page = await ctx.newPage(), errs = [];
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));
    page.on('pageerror', e => errs.push(e.message));
    await mount(page, DIST_TEST, { stub:true });
    const t0 = Date.now(); await page.goto('http://local/index.html' + (vp.q || ''));
    await page.waitForFunction(() => window.__nt || !document.getElementById('err').hidden, null, { timeout:90000 });
    const r = await page.evaluate(() => { const n = window.__nt; if (!n) return { err:document.getElementById('err').textContent };
      return { houses:n.B.tubes.length + n.B.villas.length, towers:n.B.towers.length, trees:n.T.round.length + n.T.cones.length, people:n.anim.crowd.n, vehicles:n.anim.vehicles.list.length, landmarks:n.LM.length, scrollW:document.documentElement.scrollWidth }; });
    // vào chế độ lái xe, lên xe, chạy 2 giây
    await page.click('#btnPlay'); await page.waitForTimeout(1900); await page.evaluate(() => window.__nt.toggleMount());
    if (!vp.mobile){ await page.keyboard.down('KeyW'); await page.waitForTimeout(2000); await page.keyboard.up('KeyW'); }
    // điện thoại: nút Tăng ga là công tắc (chạm bật, chạm lần nữa tắt)
    if (vp.mobile){ await page.tap('#btnBoost'); const on = await page.getAttribute('#btnBoost', 'aria-pressed'); await page.tap('#btnBoost'); const off = await page.getAttribute('#btnBoost', 'aria-pressed');
      if (on !== 'true' || off !== 'false') errs.push('nút Tăng ga không bật/tắt được: ' + on + '/' + off); }
    const pl = await page.evaluate(() => { const P = window.__nt.PL; return P.mode + ' @ ' + P.x.toFixed(1) + ',' + P.z.toFixed(1); });
    // gió mạnh, mưa to, sét: chạy vài khung không lỗi; chip gió đúng chữ; mưa và gió đặt được rồi bỏ ép
    const wx = await page.evaluate(async () => { const n = window.__nt; n.setWind(60, 45, 90); n.setRain(1); n.strike(); await new Promise(r => setTimeout(r, 700));
      const chip = n.windChip(), k = n.wx.k.rain, ws = n.waves.windState(); n.setRain(null); n.setWx('sun'); n.setWind(null); return { chip, rain:+k.toFixed(2), bf:ws.bf, windK:+ws.windK.toFixed(2) }; });
    r.wx = wx; if (!/60/.test(wx.chip) || !/km\/h/.test(wx.chip) || wx.rain < 0.99 || wx.bf !== 7) errs.push('gió/mưa không như đặt: ' + JSON.stringify(wx));
    // âm thanh: đã bật sau thao tác bấm nút, có tín hiệu ra ở master (đo RMS qua AnalyserNode), bấm còi không lỗi
    if (!vp.mobile) await page.keyboard.press('KeyH');
    const snd = await page.evaluate(async () => { const A = window.__nt.audio; if (!A.ctx) return { on:false };
      const an = A.ctx.createAnalyser(); A.master.connect(an); await new Promise(r => setTimeout(r, 800)); const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d);
      let s = 0; for (const v of d) s += v * v; return { on:A.on, state:A.ctx.state, rms:+Math.sqrt(s / d.length).toFixed(4) }; });
    r.sound = snd;
    const ok = !r.err && errs.length === 0 && r.scrollW <= vp.w && snd.on && snd.rms > 0.001;
    if (!ok) fail++;
    console.log((ok ? 'OK  ' : 'FAIL') + ' ' + vp.name + ' build ' + (Date.now() - t0) + 'ms', JSON.stringify(r), 'player:', pl, errs.length ? '\n  errors: ' + errs.join(' | ') : '');
    await ctx.close(); }
  await browser.close(); process.exit(fail ? 1 : 0);
})();
