// Bắt lỗi chú thích // cuối dòng nuốt mất mã phía sau (đã gặp ba lần: `// ... var b = ...; addEventListener(...)`, `// ... ; }`).
// Quét các file src/js/*.js viết tay (bỏ file sinh ra): trong phần sau `//` (ngoài chuỗi, không phải URL) không được còn dấu hiệu của mã: `; var`, `; if (`, `; document.`, `; ST.`, `; tên(`, hoặc kết thúc bằng `; }`.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '../src/js'), SKIP = new Set(['models.js', 'osm-data.js', 'terrain-data.js', 'crowd-sheet.js', 'character.js']);
const CODE = /;\s*(var\s|let\s|const\s|if\s*\(|for\s*\(|return\b|document\.|window\.|ST\.|[A-Za-z_$][\w$.]*\s*\()|;\s*\}+\s*;?\s*$|\)\s*\{\s*$/;
function commentStart(line){ let q = null; for (let i = 0; i < line.length - 1; i++){ const c = line[i];
  if (q){ if (c === '\\'){ i++; continue; } if (c === q) q = null; continue; }
  if (c === "'" || c === '"' || c === '`'){ q = c; continue; }
  if (c === '/' && line[i + 1] === '/' && line[i - 1] !== ':') return i; }
  return -1; }
let bad = 0, n = 0;
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.js') && !SKIP.has(f))){
  fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').forEach((line, i) => { n++;
    const k = commentStart(line); if (k < 0 || !line.slice(0, k).trim()) return;   // không có chú thích cuối dòng (chú thích đứng riêng một dòng thì an toàn)
    const rest = line.slice(k + 2); if (CODE.test(rest)){ bad++; console.log('✗ ' + f + ':' + (i + 1) + ' chú thích cuối dòng có vẻ nuốt mã: ' + rest.trim().slice(0, 90)); } }); }
if (bad){ console.log('[comment] ' + bad + ' dòng nghi ngờ'); process.exit(1); }
console.log('✓ Chú thích cuối dòng không nuốt mã (' + n + ' dòng)');
