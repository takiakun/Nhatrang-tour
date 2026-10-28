// Tải dữ liệu thật cho địa hình và mặt đất, rút gọn rồi nhúng vào src/js/terrain-data.js:
//   - Copernicus DEM GLO-30 (độ cao mặt đất 30 m, © DLR/Airbus, cấp phép tự do qua Copernicus): lưới 100 m
//   - Độ sâu biển: AWS Terrain Tiles (Terrarium; vùng biển lấy từ ETOPO1/GEBCO), lưới 100 m
//   - ESA WorldCover 2021 v200 (lớp phủ mặt đất 10 m, CC BY 4.0): lưới 50 m, nén RLE
// File gốc tải về .cache/ (bỏ qua khi commit). Cần curl và gói geotiff (npm i).
// Dùng: node tools/fetch-terrain.js [--preview]   (--preview ghi thêm .cache/terrain-preview.png để so với đường bờ ước lượng)
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib'), { execFileSync } = require('child_process');
const { readPNG } = require('./lib/png');
const ROOT = path.join(__dirname, '..'), CACHE = path.join(ROOT, '.cache');
// lấy hằng số và hàm toạ độ từ geo.js (JS thuần) để không phải chép lại
const G = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/js/geo.js'), 'utf8') + '\nthis.out = { P, toLL, H, BX0, BX1, BZ0, BZ1, coastX, ISLANDS, inPoly };', G);
const { toLL, BX0, BX1, BZ0, BZ1 } = G.out;
const DEM_STEP = 2, LC_STEP = 1;   // đơn vị bản đồ (1 = 50 m)

function get(url, file){ const f = path.join(CACHE, file); if (!fs.existsSync(f)){ fs.mkdirSync(CACHE, { recursive:true }); console.log('tải ' + url);
  execFileSync('curl', ['-sSfL', '--retry', '3', '-o', f + '.part', url], { stdio:'inherit' }); fs.renameSync(f + '.part', f); } return f; }

async function readTif(file){ const { fromArrayBuffer } = await import('geotiff'); const b = fs.readFileSync(file), t = await fromArrayBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), im = await t.getImage();
  const [ox, oy] = im.getOrigin(), [rx, ry] = im.getResolution(); return { im, ox, oy, rx, ry, W:im.getWidth(), Hh:im.getHeight() }; }
// đọc một khung chữ nhật (theo lat/lon) của ảnh GeoTIFF
async function window(T, lat0, lat1, lon0, lon1){ const x0 = Math.max(0, Math.floor((lon0 - T.ox) / T.rx) - 2), x1 = Math.min(T.W, Math.ceil((lon1 - T.ox) / T.rx) + 2);
  const y0 = Math.max(0, Math.floor((lat1 - T.oy) / T.ry) - 2), y1 = Math.min(T.Hh, Math.ceil((lat0 - T.oy) / T.ry) + 2);
  const r = await T.im.readRasters({ window:[x0, y0, x1, y1], interleave:true }); return { data:r, x0, y0, w:x1 - x0, h:y1 - y0, T }; }
function sampleBil(Wn, lat, lon){ const T = Wn.T, fx = (lon - T.ox) / T.rx - Wn.x0 - 0.5, fy = (lat - T.oy) / T.ry - Wn.y0 - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const at = (a, b) => Wn.data[Math.min(Wn.h - 1, Math.max(0, b)) * Wn.w + Math.min(Wn.w - 1, Math.max(0, a))];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v; }

// Terrarium: độ cao = R*256 + G + B/256 − 32768 (m)
function tileXY(lat, lon, z){ const n = 2 ** z, x = (lon + 180) / 360 * n, la = lat * Math.PI / 180, y = (1 - Math.asinh(Math.tan(la)) / Math.PI) / 2 * n; return [x, y]; }
function terrarium(z, lat0, lat1, lon0, lon1){ const [ax, ay] = tileXY(lat1, lon0, z), [bx, by] = tileXY(lat0, lon1, z), tiles = {};
  for (let tx = Math.floor(ax); tx <= Math.floor(bx); tx++) for (let ty = Math.floor(ay); ty <= Math.floor(by); ty++)
    tiles[tx + '/' + ty] = readPNG(fs.readFileSync(get('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + z + '/' + tx + '/' + ty + '.png', 'terrarium-' + z + '-' + tx + '-' + ty + '.png')));
  return function(lat, lon){ const [x, y] = tileXY(lat, lon, z), tx = Math.floor(x), ty = Math.floor(y), t = tiles[tx + '/' + ty]; if (!t) return 0;
    const px = Math.min(255, Math.floor((x - tx) * 256)), py = Math.min(255, Math.floor((y - ty) * 256)), q = (py * 256 + px) * 4; return t.data[q] * 256 + t.data[q + 1] + t.data[q + 2] / 256 - 32768; }; }

function b64(T, a){ return Buffer.from(new T(a).buffer).toString('base64'); }
function rle(arr){ const out = []; for (let i = 0; i < arr.length;){ let j = i; while (j < arr.length && arr[j] === arr[i] && j - i < 255) j++; out.push(j - i, arr[i]); i = j; } return Uint8Array.from(out); }

(async () => {
  const [latN] = toLL(0, BZ0), [latS] = toLL(0, BZ1), lonW = toLL(BX0, 0)[1], lonE = toLL(BX1, 0)[1], pad = 0.01;
  console.log('vùng: ' + latS.toFixed(3) + '–' + latN.toFixed(3) + '°B, ' + lonW.toFixed(3) + '–' + lonE.toFixed(3) + '°Đ');
  const dem = await readTif(get('https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N12_00_E109_00_DEM/Copernicus_DSM_COG_10_N12_00_E109_00_DEM.tif', 'copdem-N12E109.tif'));
  const demW = await window(dem, latS - pad, latN + pad, lonW - pad, lonE + pad), bathy = terrarium(12, latS - pad, latN + pad, lonW - pad, lonE + pad);
  // lưới độ cao: mặt đất từ Copernicus, biển (Copernicus ≈ 0) từ Terrarium; đơn vị dm, Int16
  const DX = Math.round((BX1 - BX0) / DEM_STEP) + 1, DZ = Math.round((BZ1 - BZ0) / DEM_STEP) + 1, elev = new Int16Array(DX * DZ); let land = 0;
  for (let j = 0; j < DZ; j++) for (let i = 0; i < DX; i++){ const [lat, lon] = toLL(BX0 + i * DEM_STEP, BZ0 + j * DEM_STEP); let e = sampleBil(demW, lat, lon);
    if (!(e > 0.5)){ const b = bathy(lat, lon); e = b < 0 ? b : 0; } else land++;
    elev[j * DX + i] = Math.max(-32000, Math.min(32000, Math.round(e * 10))); }
  console.log('độ cao: lưới ' + DX + '×' + DZ + ', đất liền ' + (100 * land / (DX * DZ)).toFixed(0) + '%, cao nhất ' + (Math.max(...elev) / 10).toFixed(0) + ' m, sâu nhất ' + (Math.min(...elev) / 10).toFixed(0) + ' m');
  // lớp phủ: mỗi ô 50 m lấy loại xuất hiện nhiều nhất trong 5×5 điểm ảnh 10 m
  const wc = await readTif(get('https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N12E108_Map.tif', 'worldcover-N12E108.tif'));
  const wcW = await window(wc, latS - pad, latN + pad, lonW - pad, lonE + pad);
  const CLS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100], LX = Math.round((BX1 - BX0) / LC_STEP) + 1, LZ = Math.round((BZ1 - BZ0) / LC_STEP) + 1, lc = new Uint8Array(LX * LZ), cnt = new Array(256);
  for (let j = 0; j < LZ; j++) for (let i = 0; i < LX; i++){ const [lat, lon] = toLL(BX0 + i * LC_STEP, BZ0 + j * LC_STEP); cnt.fill(0); let best = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++){ const px = Math.floor((lon - wc.ox) / wc.rx) - wcW.x0 + a, py = Math.floor((lat - wc.oy) / wc.ry) - wcW.y0 + b;
      if (px < 0 || py < 0 || px >= wcW.w || py >= wcW.h) continue; const v = wcW.data[py * wcW.w + px]; cnt[v]++; if (cnt[v] > cnt[best]) best = v; }
    lc[j * LX + i] = Math.max(0, CLS.indexOf(best)); }
  const lcR = rle(lc);
  const out = '/* Tự sinh bởi tools/fetch-terrain.js, đừng sửa tay.\n' +
    '   Độ cao: Copernicus DEM GLO-30 (© DLR e.V. 2010-2014 và © Airbus Defence and Space GmbH 2014-2018, cấp phép bởi ESA/Copernicus); độ sâu biển: AWS Terrain Tiles (ETOPO1/GEBCO).\n' +
    '   Lớp phủ: ESA WorldCover 10 m 2021 v200 (© ESA WorldCover project / Contains modified Copernicus Sentinel data (2021), CC BY 4.0). */\n' +
    'var TERRAIN_DATA = { step:' + DEM_STEP + ', nx:' + DX + ', nz:' + DZ + ', elev:"' + b64(Int16Array, elev) + '",\n' +
    '  lcStep:' + LC_STEP + ', lcx:' + LX + ', lcz:' + LZ + ', lcClasses:' + JSON.stringify(CLS) + ', lc:"' + Buffer.from(lcR).toString('base64') + '" };\n';
  fs.writeFileSync(path.join(ROOT, 'src/js/terrain-data.js'), out);
  console.log('[terrain] ' + (out.length / 1024).toFixed(0) + ' KB -> src/js/terrain-data.js (lớp phủ RLE ' + (lcR.length / 1024).toFixed(0) + ' KB)');

  if (process.argv.includes('--preview')){ // ảnh so sánh: xám = độ cao thật, xanh = biển thật, đỏ = đường bờ ước lượng hiện tại (H = 0)
    const W = DX, Hh = DZ, px = Buffer.alloc(W * Hh * 3), { H } = G.out;
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++){ const e = elev[j * W + i] / 10, q = (j * W + i) * 3, x = BX0 + i * DEM_STEP, z = BZ0 + j * DEM_STEP, est = H(x, z) > 0;
      let r, g, b; if (e > 0){ const k = Math.min(1, e / 600); r = g = b = 90 + k * 165; } else { const k = Math.min(1, -e / 40); r = 40; g = 120 - k * 60; b = 200 - k * 80; }
      const eN = H(x + DEM_STEP, z) > 0, eS = H(x, z + DEM_STEP) > 0; if (est !== eN || est !== eS){ r = 255; g = 40; b = 40; }
      px[q] = r; px[q + 1] = g; px[q + 2] = b; }
    const raw = Buffer.alloc((W * 3 + 1) * Hh); for (let j = 0; j < Hh; j++){ raw[j * (W * 3 + 1)] = 0; px.copy(raw, j * (W * 3 + 1) + 1, j * W * 3, (j + 1) * W * 3); }
    const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) >>> 0 : 0); return Buffer.concat([len, td, crc]); };
    const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(Hh, 4); ih[8] = 8; ih[9] = 2;
    fs.writeFileSync(path.join(CACHE, 'terrain-preview.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    console.log('ảnh so sánh: .cache/terrain-preview.png'); }
})().catch(e => { console.error(e); process.exit(1); });
