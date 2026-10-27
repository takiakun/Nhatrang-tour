// Build: ghép src/ thành 1 file HTML duy nhất.
//   dist/index.html     – trang đầy đủ (mở trực tiếp bằng trình duyệt hoặc deploy)
//   dist/artifact.html  – bản không có <html>/<head>/<body>, dùng để đăng lại làm Claude artifact
// Dùng: node build.js            (build 1 lần)
//       node build.js --watch    (tự build lại khi sửa file trong src/)
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'src'), DIST = path.join(__dirname, 'dist');
// Thứ tự quan trọng: các file chia chung một scope (bọc trong 1 IIFE).
const ORDER = ['geo.js', 'models.js', 'scene.js', 'crowd-sheet.js', 'crowd.js', 'character.js', 'player.js', 'audio.js', 'ui.js'];
function build(){
  const tpl = fs.readFileSync(path.join(SRC, 'page.html'), 'utf8');
  const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
  const js = ORDER.map(f => '/* ---- ' + f + ' ---- */\n' + fs.readFileSync(path.join(SRC, 'js', f), 'utf8')).join('\n');
  const body = tpl.replace('/*@STYLES@*/', () => css).replace('<!--@SCRIPTS@-->', () => "<script>\n(function(){\n'use strict';\n" + js + "\n})();\n</script>\n");
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'artifact.html'), body);
  fs.writeFileSync(path.join(DIST, 'index.html'), '<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + body + '</body>\n</html>\n');
  console.log('[build] dist/index.html, dist/artifact.html  (' + (Buffer.byteLength(body) / 1024).toFixed(0) + ' KB)  ' + new Date().toLocaleTimeString());
}
build();
if (process.argv.includes('--watch')){ let t = null; fs.watch(SRC, { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => { try { build(); } catch (e){ console.error(e.message); } }, 150); }); console.log('[build] đang theo dõi src/ …'); }
