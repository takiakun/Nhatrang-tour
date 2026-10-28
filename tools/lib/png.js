// Đọc PNG tối giản, không cần thư viện ngoài (dùng chung cho các công cụ trong tools/)
const zlib = require('zlib');
// 8 bit/kênh; RGB, RGBA, bảng màu, xám. Trả về { w, h, data: RGBA }
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

module.exports = { readPNG };
