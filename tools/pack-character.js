// Đóng gói nhân vật Kenney Mini Characters (CC0, có xương + hoạt ảnh) thành src/js/character.js:
//   - chỉ giữ các hoạt ảnh cần dùng, bỏ phần còn lại để file nhỏ
//   - nhúng texture bảng màu vào GLB (bufferView) để GLTFLoader.parse() đọc thẳng từ base64, không cần file ngoài
// Dùng: node tools/pack-character.js            (đọc assets/models/char/*.glb theo LIST)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'assets/models/char');
// id -> [file, các hoạt ảnh giữ lại]. Đám đông không dùng file này: tools/render-crowd.js vẽ sẵn thành tấm sprite.
const LIST = { player:['character-male-a', ['idle', 'walk', 'sprint', 'jump', 'fall', 'drive', 'sit']] };

function pack(file, KEEP){
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), J = JSON.parse(b.toString('utf8', 20, 20 + jl)), bin = b.subarray(28 + jl);
  J.animations = (J.animations || []).filter(a => KEEP.includes(a.name));
  // bỏ thuộc tính không dùng (tangent, uv thứ hai) cho nhẹ
  J.meshes.forEach(m => m.primitives.forEach(p => { delete p.attributes.TANGENT; delete p.attributes.TEXCOORD_1; }));
  (J.materials || []).forEach(m => { const t = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture; if (t) delete t.extensions; });
  if (J.extensionsUsed) J.extensionsUsed = J.extensionsUsed.filter(e => e !== 'KHR_texture_transform'); if (J.extensionsUsed && !J.extensionsUsed.length) delete J.extensionsUsed;
  // gom accessor đang dùng: mesh, skin, hoạt ảnh còn giữ
  const used = new Set(), add = i => { if (i != null) used.add(i); };
  J.meshes.forEach(m => m.primitives.forEach(p => { Object.values(p.attributes).forEach(add); add(p.indices); (p.targets || []).forEach(t => Object.values(t).forEach(add)); }));
  (J.skins || []).forEach(s => add(s.inverseBindMatrices));
  J.animations.forEach(a => a.samplers.forEach(s => { add(s.input); add(s.output); }));
  const chunks = [], views = [], accMap = new Map(), accs = []; let off = 0;
  function push(buf){ const pad = (4 - (off % 4)) % 4; if (pad){ chunks.push(Buffer.alloc(pad)); off += pad; } chunks.push(buf); const v = { buffer:0, byteOffset:off, byteLength:buf.length }; off += buf.length; views.push(v); return views.length - 1; }
  [...used].sort((a, c) => a - c).forEach(i => { const a = J.accessors[i], v = J.bufferViews[a.bufferView];
    const start = (v.byteOffset || 0) + (a.byteOffset || 0), sizes = { 5120:1, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4 }, comp = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 }[a.type];
    const elem = sizes[a.componentType] * comp, stride = v.byteStride || elem, out = Buffer.alloc(a.count * elem);
    for (let k = 0; k < a.count; k++) bin.copy(out, k * elem, start + k * stride, start + k * stride + elem);
    const na = Object.assign({}, a, { bufferView:push(out), byteOffset:0 }); if (v.target) views[na.bufferView].target = v.target;
    accMap.set(i, accs.length); accs.push(na); });
  const remap = i => accMap.get(i);
  J.meshes.forEach(m => m.primitives.forEach(p => { for (const k in p.attributes) p.attributes[k] = remap(p.attributes[k]); if (p.indices != null) p.indices = remap(p.indices); }));
  (J.skins || []).forEach(s => { if (s.inverseBindMatrices != null) s.inverseBindMatrices = remap(s.inverseBindMatrices); });
  J.animations.forEach(a => a.samplers.forEach(s => { s.input = remap(s.input); s.output = remap(s.output); }));
  J.accessors = accs;
  // ảnh: nhúng vào bufferView
  (J.images || []).forEach(im => { if (im.uri){ const png = fs.readFileSync(path.join(path.dirname(file), im.uri)); im.bufferView = push(png); im.mimeType = 'image/png'; delete im.uri; }
    else if (im.bufferView != null) throw new Error('ảnh đã nhúng sẵn: chưa hỗ trợ'); });
  J.bufferViews = views; const B = Buffer.concat(chunks); J.buffers = [{ byteLength:B.length }];
  let js = Buffer.from(JSON.stringify(J)); const jp = (4 - js.length % 4) % 4; js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
  const bp = (4 - B.length % 4) % 4, B2 = Buffer.concat([B, Buffer.alloc(bp)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + B2.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4E4F534A, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(B2.length, 0); c2.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([head, c1, js, c2, B2]);
}

const out = {}; for (const [id, [f, keep]] of Object.entries(LIST)){ const g = pack(path.join(DIR, f + '.glb'), keep); out[id] = g.toString('base64'); console.log('[char] ' + id + ': ' + (g.length / 1024).toFixed(0) + ' KB'); }
fs.writeFileSync(path.join(ROOT, 'src/js/character.js'), '/* Tự sinh bởi tools/pack-character.js, đừng sửa tay. Nhân vật: Kenney Mini Characters (CC0, www.kenney.nl). */\n' +
  'var CHAR_GLB = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n  "') + ';\n');
