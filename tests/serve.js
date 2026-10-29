// Phục vụ thư mục build cho Playwright qua http://local/ (không mở cổng). Bản test (dist-test/) không đóng gói three:
// `stubInit` chèn tests/stub-three.js làm window.THREE trước khi trang chạy (logic thật chạy, hình 3D no-op).
const fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml' };
exports.DIST_TEST = path.join(__dirname, '../dist-test');
exports.mount = async function(page, dir, opts){
  opts = opts || {};
  if (opts.stub) await page.addInitScript(fs.readFileSync(path.join(__dirname, 'stub-three.js'), 'utf8'));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.startsWith('http://local/')){ const p = decodeURIComponent(u.slice('http://local/'.length).split('?')[0].split('#')[0]) || 'index.html', f = path.join(dir, p);
      if (f.startsWith(dir) && fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ contentType:MIME[path.extname(f)] || 'application/octet-stream', body:fs.readFileSync(f) }); }
    return r.abort(); });
};
