// Chuyển mô hình GLB (Kenney, CC0) thành dữ liệu gọn nhúng thẳng vào trang: src/js/models.js
//   - màu lấy từ texture bảng màu (colormap.png) và nướng vào từng đỉnh => không cần texture lúc chạy
//   - toạ độ lượng tử hoá Int16 theo bounding box, pháp tuyến Int8, màu Uint8, chỉ số Uint16, mã base64
// Dùng: node tools/convert-models.js            (đọc assets/models/*.glb theo danh sách LIST bên dưới)
//       node tools/convert-models.js <dir> <out> (chuyển MỌI .glb trong <dir>, dùng để xem thử)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');

// id dùng trong code  ->  file trong assets/models/ (sub/ = City Kit Suburban, com/ = City Kit Commercial; mỗi bộ có colormap riêng)
const LIST = {
  // Suburban: nhà vườn, biệt thự thấp tầng
  'house-a':'sub/building-type-a', 'house-c':'sub/building-type-c',
  'house-g':'sub/building-type-g', 'house-h':'sub/building-type-h',
  'house-i':'sub/building-type-i', 'house-j':'sub/building-type-j', 'house-k':'sub/building-type-k', 'house-l':'sub/building-type-l',
  'house-m':'sub/building-type-m', 'house-o':'sub/building-type-o', 'house-p':'sub/building-type-p',
  'house-q':'sub/building-type-q', 'house-r':'sub/building-type-r', 'house-s':'sub/building-type-s', 'house-u':'sub/building-type-u',
  // Commercial: chung cư, văn phòng thấp tầng; mái hiên, dù che
  'block-b':'com/building-b', 'block-c':'com/building-c', 'block-d':'com/building-d',
  'block-e':'com/building-e',
  'awning':'com/detail-awning', 'awning-wide':'com/detail-awning-wide', 'parasol-a':'com/detail-parasol-a', 'parasol-b':'com/detail-parasol-b'
};

/* ---------- PNG tối giản (8 bit; RGB, RGBA, bảng màu, xám) ---------- */
function readPNG(buf){
  let p = 8, w, h, bd, ct, plte = null, trns = null; const idat = [];
  while (p < buf.length){ const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR'){ w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('PNG interlace chưa hỗ trợ'); }
    else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len; }
  if (bd !== 8) throw new Error('PNG cần 8 bit/kênh');
  const ch = { 0:1, 2:3, 3:1, 4:2, 6:4 }[ct], raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = Buffer.alloc(w * h * ch), out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++){ const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++){ const a = x >= ch ? px[o + x - ch] : 0, b = y ? px[o - stride + x] : 0, c = (x >= ch && y) ? px[o - stride + x - ch] : 0; let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4){ const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      px[o + x] = v & 255; } }
  for (let i = 0; i < w * h; i++){ const q = i * 4;
    if (ct === 3){ const k = px[i]; out[q] = plte[k * 3]; out[q + 1] = plte[k * 3 + 1]; out[q + 2] = plte[k * 3 + 2]; out[q + 3] = trns && k < trns.length ? trns[k] : 255; }
    else if (ct === 0 || ct === 4){ out[q] = out[q + 1] = out[q + 2] = px[i * ch]; out[q + 3] = ct === 4 ? px[i * ch + 1] : 255; }
    else { out[q] = px[i * ch]; out[q + 1] = px[i * ch + 1]; out[q + 2] = px[i * ch + 2]; out[q + 3] = ct === 6 ? px[i * ch + 3] : 255; } }
  return { w, h, data:out };
}

/* ---------- GLB: 1 texture bảng màu, các mesh (có thể nhiều node) gộp làm một ---------- */
function readGLB(file, texDir){
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), J = JSON.parse(b.toString('utf8', 20, 20 + jl)), bin = b.subarray(28 + jl);
  const CT = { 5120:Int8Array, 5121:Uint8Array, 5122:Int16Array, 5123:Uint16Array, 5125:Uint32Array, 5126:Float32Array }, NC = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 };
  function acc(i){ const a = J.accessors[i], v = J.bufferViews[a.bufferView], T = CT[a.componentType], n = NC[a.type], st = v.byteStride ? v.byteStride / T.BYTES_PER_ELEMENT : n;
    const src = new T(bin.buffer, bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), (a.count - 1) * st + n), out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = src[k * st + c];
    return out; }
  let tex = null; if (J.images && J.images.length){ const im = J.images[0]; tex = readPNG(im.uri ? fs.readFileSync(path.join(texDir || path.dirname(file), im.uri)) : bin.subarray(J.bufferViews[im.bufferView].byteOffset, J.bufferViews[im.bufferView].byteOffset + J.bufferViews[im.bufferView].byteLength)); }
  const P = [], N = [], C = [], I = [];
  function mul(a, b){ const o = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++){ let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function local(n){ if (n.matrix) return n.matrix; const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1], [x, y, z, w] = q;
    return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
            2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; }
  function visit(ni, M){ const n = J.nodes[ni], W = mul(M, local(n));
    if (n.mesh != null) J.meshes[n.mesh].primitives.forEach(pr => {
      const pos = acc(pr.attributes.POSITION), nor = pr.attributes.NORMAL != null ? acc(pr.attributes.NORMAL) : null, uv = pr.attributes.TEXCOORD_0 != null ? acc(pr.attributes.TEXCOORD_0) : null;
      const m = J.materials && pr.material != null ? J.materials[pr.material] : null, bc = (m && m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) || [1, 1, 1, 1], base = P.length / 3, cnt = pos.length / 3;
      for (let k = 0; k < cnt; k++){ const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
        P.push(W[0] * x + W[4] * y + W[8] * z + W[12], W[1] * x + W[5] * y + W[9] * z + W[13], W[2] * x + W[6] * y + W[10] * z + W[14]);
        let nx = 0, ny = 1, nz = 0; if (nor){ const a = nor[k * 3], bb = nor[k * 3 + 1], c = nor[k * 3 + 2]; nx = W[0] * a + W[4] * bb + W[8] * c; ny = W[1] * a + W[5] * bb + W[9] * c; nz = W[2] * a + W[6] * bb + W[10] * c; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
        N.push(nx, ny, nz);
        let r = 255, g = 255, bl = 255; if (tex && uv){ const u = uv[k * 2] - Math.floor(uv[k * 2]), v = uv[k * 2 + 1] - Math.floor(uv[k * 2 + 1]), px = Math.min(tex.w - 1, Math.floor(u * tex.w)), py = Math.min(tex.h - 1, Math.floor(v * tex.h)), q = (py * tex.w + px) * 4; r = tex.data[q]; g = tex.data[q + 1]; bl = tex.data[q + 2]; }
        C.push(Math.round(r * bc[0]), Math.round(g * bc[1]), Math.round(bl * bc[2])); }
      if (pr.indices != null) acc(pr.indices).forEach(i => I.push(base + i)); else for (let k = 0; k < cnt; k++) I.push(base + k); });
    (n.children || []).forEach(c => visit(c, W)); }
  const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  (J.scenes[J.scene || 0].nodes).forEach(ni => visit(ni, ID));
  return { P, N, C, I };
}

/* ---------- gộp đỉnh trùng sau khi lượng tử hoá, rồi đóng gói ---------- */
function pack(m){
  const n = m.P.length / 3, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++){ mn[c] = Math.min(mn[c], m.P[k * 3 + c]); mx[c] = Math.max(mx[c], m.P[k * 3 + c]); }
  const sc = mx.map((v, c) => (v - mn[c]) / 65535 || 1), map = new Map(), P = [], N = [], C = [], I = [], M = [];
  // Mái: đỉnh màu xanh lá của bảng màu, nằm ở nửa trên mô hình => đổi thành xám (giữ độ sáng) và đánh dấu,
  // lúc chạy nhân với màu mái riêng của từng căn (aRoof). Bụi cây sát đất giữ nguyên màu.
  const hy = mn[1] + (mx[1] - mn[1]) * 0.3; let roofN = 0;
  const remap = new Int32Array(n);
  for (let k = 0; k < n; k++){
    const q = [0, 1, 2].map(c => Math.round((m.P[k * 3 + c] - mn[c]) / sc[c]) - 32768), nn = [0, 1, 2].map(c => Math.round(m.N[k * 3 + c] * 127));
    let cc = [m.C[k * 3], m.C[k * 3 + 1], m.C[k * 3 + 2]], roof = 0;
    if (cc[1] > cc[0] + 25 && cc[1] > cc[2] + 10 && m.P[k * 3 + 1] > hy){ const L = Math.min(255, Math.round((0.3 * cc[0] + 0.59 * cc[1] + 0.11 * cc[2]) / 175 * 255)); cc = [L, L, L]; roof = 255; roofN++; }
    const key = q.concat(nn, cc, roof).join(','); let id = map.get(key);
    if (id == null){ id = P.length / 3; map.set(key, id); P.push(...q); N.push(...nn); C.push(...cc); M.push(roof); }
    remap[k] = id; }
  for (let k = 0; k < m.I.length; k++) I.push(remap[m.I[k]]);
  if (P.length / 3 > 65535) throw new Error('quá nhiều đỉnh');
  const b64 = (T, a) => Buffer.from(new T(a).buffer).toString('base64');
  return { min:mn.map(v => +v.toFixed(5)), size:mx.map((v, c) => +(v - mn[c]).toFixed(5)), p:b64(Int16Array, P), n:b64(Int8Array, N), c:b64(Uint8Array, C), m:roofN ? b64(Uint8Array, M) : '', i:b64(Uint16Array, I), tris:I.length / 3 };
}

function run(entries, out){
  const res = {}; let tris = 0;
  for (const [id, file] of entries){ const g = readGLB(file);
    // Bộ Commercial có nhiều mảng tường xám đậm, lệch tông với phố nhà ống màu pastel => làm sáng các màu xám tối, ít bão hoà.
    if (/[\\/]com[\\/]/.test(file)) for (let k = 0; k < g.C.length; k += 3){ const c = g.C.slice(k, k + 3), mxc = Math.max(...c), mnc = Math.min(...c);
      if (mxc < 110 && mxc - mnc < 30) for (let j = 0; j < 3; j++) g.C[k + j] = Math.round(255 - (255 - c[j]) * 0.5); }
    const r = pack(g); tris += r.tris; delete r.tris; res[id] = r; }
  const js = '/* Tự sinh bởi tools/convert-models.js, đừng sửa tay. Mô hình: Kenney City Kit (CC0, www.kenney.nl). */\n' +
    'var MODEL_DATA = {\n' + Object.keys(res).map(k => '  ' + JSON.stringify(k) + ':' + JSON.stringify(res[k])).join(',\n') + '\n};\n';
  fs.writeFileSync(out, js);
  console.log('[models] ' + Object.keys(res).length + ' mô hình, ' + tris + ' tam giác, ' + (js.length / 1024).toFixed(0) + ' KB -> ' + path.relative(process.cwd(), out));
}

if (process.argv[2]){ const dir = process.argv[2]; run(fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort().map(f => [f.replace(/\.glb$/, ''), path.join(dir, f)]), process.argv[3]); }
else run(Object.entries(LIST).map(([id, f]) => [id, path.join(ROOT, 'assets/models', f + '.glb')]), path.join(ROOT, 'src/js/models.js'));
