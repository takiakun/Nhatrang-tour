// Chụp ảnh trang thật (Chromium + WebGL qua SwiftShader) ở các cảnh cố định, để so trước/sau khi đổi đồ hoạ, nâng three, làm biển.
// Dùng:  node tools/shot.js <thư mục ra> [--prefix tên] [--views a,b,c] [--size 1100x720] [--mobile] [--dist dist]
//                         [--legacy-three <thư mục three r147>]  [--wind 20 --wdir 45]
// Trang được phục vụ từ thư mục --dist (mặc định dist/) qua http://local/, mọi mạng khác bị chặn (thời tiết thật không tải được, trời quang).
// --legacy-three: bản cũ nạp three r147 từ jsDelivr; trỏ vào thư mục có three.min.js, OrbitControls.js, GLTFLoader.js để trả thay mạng.
// Cần Playwright (cloud: NODE_PATH=/opt/node-tools/node_modules). Viewport ≥ 1100×720 mới bật hậu kỳ (dưới đó là LITE).
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.', PREFIX = arg('prefix', 'shot'), MOBILE = !!arg('mobile', false);
const [W, H] = String(arg('size', MOBILE ? '430x932' : '1100x720')).split('x').map(Number), DIST = path.resolve(arg('dist', 'dist')), LEGACY = arg('legacy-three', null);
// Mỗi cảnh: ll = [vĩ độ, kinh độ] hoặc lm = id địa danh; r = khoảng cách, phi = góc nghiêng (0 = nhìn thẳng xuống), th = hướng; tod: 0 ngày, 1 hoàng hôn, 2 đêm; wx: real|sun|rain
const VIEWS = {
  overview:  { home:true, tod:0, wx:'sun' },
  center:    { ll:[12.2475, 109.1915], r:45, phi:0.9, th:0.5, tod:0, wx:'sun' },
  beach:     { ll:[12.2330, 109.1990], r:40, phi:1.0, th:1.4, tod:0, wx:'sun' },
  bridge:    { lm:'xom-bong', r:18, phi:1.0, th:2.4, tod:0, wx:'sun' },
  round:     { ll:[12.24489, 109.19209], r:14, phi:0.9, th:0.6, tod:0, wx:'sun' },
  honchong:  { lm:'hon-chong', r:25, phi:1.05, th:1.3, tod:0, wx:'sun' },
  sea:       { ll:[12.2250, 109.2150], r:14, phi:1.2, th:1.6, tod:0, wx:'sun' },
  seawide:   { ll:[12.2200, 109.2300], r:120, phi:1.0, th:1.2, tod:0, wx:'sun' },
  rain:      { ll:[12.2475, 109.1915], r:40, phi:0.95, th:0.5, tod:0, wx:'rain' },
  dusk:      { ll:[12.2330, 109.1990], r:40, phi:1.0, th:1.4, tod:1, wx:'sun' },
  night:     { ll:[12.2475, 109.1915], r:60, phi:0.9, th:0.5, tod:2, wx:'sun' },
  nightwide: { home:true, tod:2, wx:'sun' },
};
const MOBILE_SET = ['overview', 'round', 'bridge', 'night'], DESK_SET = Object.keys(VIEWS);
const want = (arg('views', null) || (MOBILE ? MOBILE_SET : DESK_SET).join(',')).split(',');
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml' };

(async () => {
  fs.mkdirSync(OUT, { recursive:true });
  const browser = await chromium.launch({ args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport:{ width:W, height:H }, isMobile:MOBILE, hasTouch:MOBILE }), page = await ctx.newPage();
  if (MOBILE) await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }));   // như iPhone mạnh: dựng bản đầy đủ
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)); });
  await page.route('**/*', r => { const u = r.request().url();
    if (LEGACY){ const m = u.match(/three@0\.147\.0\/(.*)$/); if (m) return r.fulfill({ contentType:'application/javascript', body:fs.readFileSync(path.join(LEGACY, path.basename(m[1]))) }); }
    if (u.startsWith('http://local/')){ let p = decodeURIComponent(u.slice('http://local/'.length).split('?')[0].split('#')[0]) || 'index.html'; const f = path.join(DIST, p);
      if (f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); }
    return r.abort(); });
  const q = []; if (arg('wind', null)) q.push('wind=' + arg('wind')); if (arg('wdir', null)) q.push('wdir=' + arg('wdir'));
  await page.goto('http://local/index.html' + (q.length ? '?' + q.join('&') : ''));
  await page.waitForFunction(() => window.__nt || !document.getElementById('err').hidden, null, { timeout:300000 });
  if (await page.evaluate(() => !window.__nt)) throw new Error('Trang báo lỗi: ' + await page.evaluate(() => document.getElementById('err').textContent));
  await page.waitForTimeout(2500);
  // chờ n khung hình thật (mỗi khung trong SwiftShader mất vài giây) để bóng, nội suy, sương mù ổn định
  const frames = async n => { const f0 = await page.evaluate(() => __nt.frames()); await page.waitForFunction(([f0, n]) => __nt.frames() >= f0 + n, [f0, n], { timeout:300000, polling:200 }); };
  await page.evaluate(() => { __nt.controls.autoRotate = false; });
  for (const name of want){ const v = VIEWS[name]; if (!v){ console.log('bỏ qua cảnh lạ: ' + name); continue; }
    await page.evaluate(([v]) => { __nt.setTod(v.tod); __nt.setWx(v.wx); if (v.home) return __nt.home();
      const p = v.lm ? __nt.lmp[v.lm] : [(v.ll[1] - 109.240) * 2176, -(v.ll[0] - 12.226) * 2212];
      __nt.jump(new (__nt.THREE || window.THREE).Vector3(p[0], Math.max(__nt.G.hAt(p[0], p[1]), 0), p[1]), v.r, v.phi, v.th); }, [v]);
    await frames(v.wx === 'rain' ? 4 : 3);
    const file = path.join(OUT, PREFIX + '-' + name + '.png'); await page.screenshot({ path:file, timeout:300000 }); console.log('đã chụp ' + file); }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
