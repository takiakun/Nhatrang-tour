// Vẽ sẵn tấm sprite đám đông từ nhân vật Kenney Mini Characters (CC0): mỗi nhân vật 8 hướng × 4 khung đi bộ,
// ô 40×60 px giống crowd.js (SPR). Kết quả nhúng vào src/js/crowd-sheet.js dạng PNG base64, để lúc chạy không phải
// nạp mô hình có xương cho hàng nghìn người.
// Dùng: npm i && (Playwright có sẵn hoặc npx playwright install chromium); node tools/render-crowd.js
// three r186 lấy từ node_modules/three (bản ES module, nạp qua import map), không cần mạng.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'assets/models/char'), TH = path.join(ROOT, 'node_modules/three');
// Thứ tự = thứ tự hàng trong tấm sprite (crowd.js tham chiếu theo chỉ số trong KENNEY_ROWS)
const ROWS = ['character-female-b', 'character-female-c', 'character-female-e', 'character-female-f', 'character-female-d', 'character-male-b', 'character-male-f'];
const CW = 40, CH = 60, SS = 3;   // ô sprite và hệ số siêu lấy mẫu (vẽ to rồi thu nhỏ cho mịn)
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await b.newContext()).newPage(); page.on('pageerror', e => console.error('ERR', e.message)); page.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.startsWith('http://local/char/')) return r.fulfill({ body: fs.readFileSync(path.join(DIR, decodeURIComponent(u.slice(18)))) });
    if (u.startsWith('http://local/three/')) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(TH, decodeURIComponent(u.slice(19)))) });
    if (u === 'http://local/') return r.fulfill({ contentType: 'text/html', body: '<html><body><script type="importmap">{"imports":{"three":"http://local/three/build/three.module.js","three/addons/":"http://local/three/examples/jsm/"}}</script><script type="module">import * as T from "three"; import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"; window.THREE = Object.assign({}, T, { GLTFLoader }); window.__ready = true;</script></body></html>' });
    return r.continue(); });
  await page.goto('http://local/'); await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  const png = await page.evaluate(async ({ ROWS, CW, CH, SS }) => {
    const W = CW * SS, H = CH * SS, R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    R.setSize(W, H); R.outputColorSpace = THREE.SRGBColorSpace; R.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, Math.PI * 1.0)); const sun = new THREE.DirectionalLight(0xffffff, Math.PI * 0.9); sun.position.set(2, 4, 5); scene.add(sun);
    // camera ngang, hơi chúc xuống như góc nhìn trong trò chơi; chiều cao nhân vật ≈ 52 px, chân cách đáy 3 px
    const cam = new THREE.OrthographicCamera(-CW / 2, CW / 2, CH, 0, -100, 100); cam.position.set(0, 0, 10); cam.rotation.x = -0.12;
    const sheet = document.createElement('canvas'); sheet.width = CW * 32; sheet.height = CH * ROWS.length; const sx = sheet.getContext('2d');
    const loader = new THREE.GLTFLoader();
    for (let r = 0; r < ROWS.length; r++){
      const gl = await new Promise((ok, no) => loader.load('http://local/char/' + ROWS[r] + '.glb', ok, undefined, no));
      const m = gl.scene, bb = new THREE.Box3().setFromObject(m), k = 52 / (bb.max.y - bb.min.y); m.scale.setScalar(k); m.position.y = 3 - bb.min.y * k; scene.add(m);
      const mixer = new THREE.AnimationMixer(m), clip = gl.animations.find(a => a.name === 'walk'), act = mixer.clipAction(clip); act.play();
      for (let d = 0; d < 8; d++) for (let f = 0; f < 4; f++){
        m.rotation.y = d * Math.PI / 4; mixer.setTime(f / 4 * clip.duration); R.render(scene, cam);
        sx.drawImage(R.domElement, 0, 0, W, H, (d * 4 + f) * CW, r * CH, CW, CH); }
      scene.remove(m); }
    return sheet.toDataURL('image/webp', 0.9);   // WebP có kênh alpha: nhỏ hơn PNG nhiều lần; Safari ≥ 14 đọc được
  }, { ROWS, CW, CH, SS });
  await b.close();
  const out = '/* Tự sinh bởi tools/render-crowd.js, đừng sửa tay. Nhân vật: Kenney Mini Characters (CC0, www.kenney.nl). */\n' +
    'var KENNEY_ROWS = ' + JSON.stringify(ROWS.map(n => n.replace('character-', ''))) + ';\nvar CROWD_SHEET = \'' + png + '\';\n';
  fs.writeFileSync(path.join(ROOT, 'src/js/crowd-sheet.js'), out); fs.writeFileSync(path.join(ROOT, 'assets/crowd-sheet.webp'), Buffer.from(png.split(',')[1], 'base64'));
  console.log('[crowd] ' + ROWS.length + ' hàng, ' + (out.length / 1024).toFixed(0) + ' KB -> src/js/crowd-sheet.js (bản xem: assets/crowd-sheet.webp)');
})();
