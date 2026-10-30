// Nạp geo.js (ES module) KHÔNG kèm dữ liệu sinh ra (terrain-data.js, osm-data.js): geo.js tự dùng địa hình, bờ, đường ước lượng.
// Dùng cho các tool tạo ra chính những file dữ liệu đó (fetch-terrain, fetch-osm), để kết quả không phụ thuộc vào bản dữ liệu cũ.
// Cần Node ≥ 22.12 (require() nạp được ES module).
const fs = require('fs'), path = require('path'), os = require('os');
const SRC = path.join(__dirname, '../../src/js'), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-nodata-'));
fs.writeFileSync(path.join(TMP, 'package.json'), '{ "type": "module" }');
fs.writeFileSync(path.join(TMP, 'terrain-data.js'), 'export var TERRAIN_DATA;\n');
fs.writeFileSync(path.join(TMP, 'osm-data.js'), 'export var OSM_DATA;\n');
fs.copyFileSync(path.join(SRC, 'geo.js'), path.join(TMP, 'geo.js'));
module.exports = require(path.join(TMP, 'geo.js'));
process.on('exit', () => fs.rmSync(TMP, { recursive:true, force:true }));
