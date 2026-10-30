# Nha Trang 3D — hướng dẫn cho Claude Code

Bản đồ 3D phong cách hoạt hình của vịnh Nha Trang, chạy trên web. Gần như toàn bộ thế giới được **sinh bằng code**: địa hình, nhà ống, cây, người, xe, thuyền, âm thanh đều tạo lúc tải trang (~1–2 s). Địa hình, đảo và lớp phủ mặt đất lấy từ dữ liệu thật (`src/js/terrain-data.js`); thời tiết lấy trực tiếp từ Open-Meteo lúc chạy. Ngoại lệ khác là các mô hình Kenney (CC0): nhà, ô tô, thuyền, tàu hỏa (`src/js/models.js`), nhân vật chính có xương (`src/js/character.js`) và tấm sprite đám đông vẽ sẵn (`src/js/crowd-sheet.js`). Cả ba đều là file sinh ra, nhúng thẳng trong trang.

## Lệnh

- `npm i` một lần (vite, three r186; **không** có Playwright trong package.json, xem mục Cloud). `package-lock.json` được commit để CI dùng `npm ci`.
- `npm run dev`: máy chủ Vite có tải lại nóng ở http://localhost:8080. `npm run build`: đóng gói vào `dist/` (GitHub Pages; thư mục này không commit). `npm run serve`: xem bản đã build. `node build.js` vẫn chạy được (gọi `vite build`).
- `npm run build:test`: bản `dist-test/` không đóng gói three (test chèn three giả). `npm run build:single`: một file HTML duy nhất `dist-single/index.html`, mở thẳng từ ổ đĩa được.
- `node tools/shot.js <thư mục> [--views a,b] [--mobile] [--dist dist]`: chụp ảnh trang thật ở các cảnh cố định (`VIEWS` trong file: toàn cảnh, phố, cầu, bùng binh, biển, mưa, đêm…) để so trước/sau khi đổi đồ hoạ.
- `node tools/convert-models.js`: chuyển các GLB trong `assets/models/` (theo danh sách `LIST` trong file) thành `src/js/models.js`. Chạy lại khi thêm/bớt mô hình; `models.js` là file sinh ra, đừng sửa tay.
- `node tools/fetch-osm.js [--refresh]`: tải đường (kèm tên mọi đường), nhà, mặt nước (sông, hồ, ao, relation Sông Cái), đường sắt và bờ biển (`natural=coastline`) từ OpenStreetMap qua API `api/0.6/map` (chia ô, quá 50.000 điểm thì chia tiếp) vào `.cache/osm/`, rút gọn thành `src/js/osm-data.js` (~520 KB; mặt nước là mặt nạ 12,5 m nén RLE). Không dùng Overpass nữa (máy chủ công cộng hay 504). Tải đủ mất ~30 phút, đã có cache thì vài giây. Bản hiện tại chụp ngày 28/10/2026.
- `node tools/check-sizes.js`: mở trang thật (Chromium + SwiftShader), đo kích thước và hướng từng mô hình địa danh, so với chân đế OSM (`ITEMS` trong file). Phải in "Kích thước, hướng khớp OSM". Trên cloud: `NODE_PATH=/opt/node-tools/node_modules` (cần `npm run build` trước).
- `node tools/check-positions.js`: so toạ độ địa danh với đối tượng OSM đã ghi (`osm:'way/…'`), kiểm bờ biển đang dùng bờ OSM, địa danh trên đất không rơi xuống nước. Phải in "Tất cả vị trí khớp OSM" (xem checklist bên dưới).
- `node tools/fetch-terrain.js [--preview]`: tải Copernicus DEM GLO-30, AWS Terrain Tiles và ESA WorldCover vào `.cache/` (bỏ qua khi commit, cần `curl` và `npm i` để có `geotiff`), rút gọn thành `src/js/terrain-data.js` (độ cao 100 m, lớp phủ 50 m nén RLE). `--preview` ghi `.cache/terrain-preview.png` so độ cao thật với đường bờ ước lượng.
- `blender --background --factory-startup --python tools/blender/<tên>.py -- assets/models/blender/<tên>.glb`: dựng lại mô hình làm bằng Blender (`ponagar`, `chodam`, `cathedral`, `tramhuong`, `buddha`, `station`; hàm dùng chung trong `kit.py`), rồi chạy `node tools/convert-models.js`. Đã thử với Blender 4.2 LTS.
- `node tools/pack-character.js`: đóng gói nhân vật chính (GLB có xương, chỉ giữ vài hoạt ảnh, nhúng texture) thành `src/js/character.js`.
- `node tools/render-crowd.js`: vẽ 7 nhân vật Kenney thành tấm sprite đám đông (8 hướng × 4 khung, WebP) → `src/js/crowd-sheet.js`. Cần Playwright; three lấy từ node_modules, không cần mạng.
- `npm test`: `vite build` + `vite build --mode test`, chạy `tests/map-check.js` (so map với OSM bằng Node: đường không phải cầu nằm dưới nước, đầu cầu rơi xuống nước, nhà/ray dưới nước, mặt nước lệch OSM, vị trí địa danh và bờ biển; `--verbose` để xem hết lỗi), `tests/smoke.js`, rồi `tests/drive-check.js` (lái xe máy thật qua cầu Xóm Bóng, cầu Trần Phú, cả đường dẫn ~300 m hai đầu, hai chiều; vật lý chạy thật trên three giả; kiểm đường lớn OSM dựng liền, hở < 0,3%). `npm run check:map` chạy thêm `tools/check-sizes.js` (cần WebGL). Test cần Playwright + Chromium: trên cloud đã có sẵn (đặt `NODE_PATH=/opt/node-tools/node_modules`); máy khác thì `npm i --no-save playwright && npx playwright install chromium`.

Luôn chạy `npm test` sau khi sửa. Smoke test chạy 3 cấu hình (máy tính; điện thoại mạnh dựng bản đầy đủ; điện thoại `?q=lite`) trên bản `dist-test/` với `tests/stub-three.js` làm `window.THREE` (`tests/serve.js` phục vụ thư mục build): logic chạy thật, còn hình 3D và shader **không** được kiểm tra; GLTFLoader cũng bị thay nên nhân vật Kenney không được nạp trong test (trang tự dùng nhân vật khối dự phòng). Âm thanh thì có kiểm tra: test đo RMS ở nút master để chắc có tín hiệu. Muốn xem hình thì mở trang thật trong trình duyệt.

## Ràng buộc quan trọng

- **Các file trong `src/js/` (tạm thời) chưa phải module.** Plugin `legacy-concat` trong `vite.config.mjs` nối chúng theo thứ tự `terrain-data → osm-data → geo → models → scene → crowd-sheet → crowd → character → player → audio → weather → post → ui` thành module ảo `virtual:legacy` (`src/main.js` import nó), bọc trong **một IIFE chung** (`'use strict'`) và cấp biến `THREE` (three r186 + `OrbitControls` + `GLTFLoader`). Chúng dùng chung biến của IIFE, và `scene.js` có `return` ở cấp cao nhất để dừng khi thiếu WebGL. Kế hoạch tách ES modules: `/root/.claude/plans/` (PR 2).
- **three.js r186** từ npm, `WebGLRenderer` (không dùng WebGPURenderer vì các `onBeforeCompile` không chạy trên đó). Khác r147: màu dùng `colorSpace`/`outputColorSpace`; ánh sáng vật lý nên cường độ nhân `LIGHT_K = π` (scene.js) để giữ độ sáng cũ; `vColor` luôn là `vec4`; chunk `colorspace_fragment`, `vMapUv`; `PCFSoftShadowMap` và `THREE.Clock` đã bỏ.
- Mọi mô hình được nhúng base64 trong JS (`models.js` ~1,6 MB), trang ~3,7 MB (gzip ~1,4 MB, gồm three). Đích chính là GitHub Pages; bản Claude artifact (`dist/artifact.html`) đã bỏ, nếu cần thì dùng `npm run build:single` (không tải được thời tiết Open-Meteo khi bị chặn mạng, trang tự bỏ qua).
- **Bug của r147**: `InstancedMesh` cull theo bounding sphere của geometry gốc. Vì vậy `instChunks()` chia instance theo lưới 4×4 và gán `boundingSphere` thủ công cho từng chunk. Mesh động (xe, thuyền) đặt `frustumCulled = false`.

## Hệ toạ độ

- 1 đơn vị = **50 m** theo chiều ngang. `P(lat, lon)` → `[x, z]`; `toLL(x, z)` làm ngược lại. x hướng Đông, **z hướng Nam** (Bắc là −z). Gốc toạ độ ở 12.226°B, 109.240°Đ.
- Mặt nước ở y = 0. Độ cao địa hình phóng đại: `VE = 0.06` đơn vị/m. Nhà phóng đại ít hơn: `VB = 0.032`, `FLOOR` = chiều cao một tầng.
- Bàn bản đồ là hình chữ nhật bo góc `BX0..BX1 × BZ0..BZ1` (≈ 19,4 × 16,6 km), bo góc `BR`. Dùng `inBoard()` và `boardClamp()` để kiểm tra.

## Các file

| File | Nội dung |
|---|---|
| `index.html` (gốc) | Khung HTML (điểm vào của Vite): header, toolbar, thẻ thông tin, HUD lái xe, loader; nạp `src/styles.css` và `src/main.js`. |
| `src/styles.css` | Giao diện. Màu là token trên `:root`, có dark mode. |
| `src/js/geo.js` | **JS thuần, không dùng three.js.** Dữ liệu địa lý (`COAST`, `RIVERS`, `ISLANDS`, `RIDGES`/`HILLS`, `DIST` khu phố, `PONDS`, `ROADS`, `RAIL`, `LM_DEF` địa danh, `GEO_LABELS`, `ROAD_LABELS`), hàm độ cao `H(x, z)`, lưới `buildGrid()` (độ cao, nhiễu, vùng, độ dốc), tô màu mặt đất `paintGround()`, sinh nhà `genBuildings()`, sinh cây `genTrees()`. Chạy được trong Node để test. |
| `src/js/osm-data.js` | **File sinh ra** bởi `tools/fetch-osm.js`: đường OSM (polyline Int16 ×20, loại, số làn, tên, cờ cầu), chân đế nhà (số tầng nếu có), điểm bờ đất liền `coast` (mỗi 0,001° vĩ độ), mặt nạ mặt nước `water` (RLE), các chuỗi đường sắt `rails` (chuỗi đầu dài nhất cho tàu chạy). `geo.js` giải mã thành `OSM` (null nếu thiếu file, khi đó dùng lưới phố `DIST`, bờ, sông, ray ước lượng như cũ); mặt nước thành trường khoảng cách có dấu `osmWaterS()` thay `riverS`. |
| `src/js/post.js` | Hậu kỳ tự viết (không EffectComposer): render target có độ sâu + mờ 1/4 → viền nét theo độ sâu khi nhìn gần, tilt-shift khi nhìn toàn cảnh, bloom ban đêm; tự làm ACES + sRGB. Tắt khi `LITE`, không WebGL2 hoặc bộ điều tốc đã hạ cấp. `renderFrame()` thay `renderer.render`. |
| `src/js/terrain-data.js` | **File sinh ra** bởi `tools/fetch-terrain.js`: độ cao thật (Int16, dm), lớp phủ ESA WorldCover (RLE). `geo.js` giải mã thành `TR` (kèm trường khoảng cách tới đất). |
| `src/js/weather.js` | Nút thời tiết trong menu (`WX.mode`: thật / nắng / mưa, lưu `localStorage['nt-wx']`). Chế độ **Giờ thật** (vị trí mặt trời theo giờ Nha Trang: `sunPos`, `todFromSun`, hướng nắng `realSunDir`) và thời tiết Open-Meteo (`fetchWeather` mỗi 15 phút: mây, mưa, gió, nhiệt độ). `weatherLight()` chạy cuối `applyTod()`; mưa là lớp canvas 2D `#rain`. Không tải được thì trời quang, không lỗi. |
| `src/js/models.js` | **File sinh ra** bởi `tools/convert-models.js`. `MODEL_DATA[id]` = toạ độ Int16, pháp tuyến Int8, màu đỉnh Uint8 (đã nướng từ texture bảng màu), mặt nạ mái, chỉ số Uint16, tất cả base64. |
| `src/js/crowd-sheet.js`, `src/js/character.js` | **File sinh ra.** Tấm sprite đám đông Kenney (WebP base64, `KENNEY_ROWS`) và GLB nhân vật chính (`CHAR_GLB.player`). |
| `src/js/scene.js` | Renderer, ánh sáng, helper vật liệu và instancing, các hàm dựng địa danh (Tháp Bà, Chợ Đầm, Long Sơn, Nhà thờ Núi, Trầm Hương…), địa hình kèm vá mặt đất độ nét cao (`DU`/`DP`, `updateDetail`), shader nước, viền bàn, cầu tự động, thành phố, cây, thuyền, làng bè, giao thông, tàu hỏa, đèn đường, mây, chim, hệ thời gian trong ngày `TOD`/`applyTod`. |
| `src/js/crowd.js` | Đám đông sprite 8 hướng. `drawPerson()` vẽ người từ một mô hình que 3D chiếu lên canvas; `buildSpriteSheet()` tạo sheet 12 hàng × (8 hướng × 4 khung); `genCrowd()` đặt người; `buildCrowd()` dùng `InstancedBufferGeometry` + `ShaderMaterial`. Billboard, chọn hướng và chuyển động đều tính trên GPU (đi qua lại trên đoạn thẳng `aA→aB`). |
| `src/js/player.js` | Nhân vật chính (texture atlas `atlasCanvas()` + các khối), xe máy `buildBike()`, va chạm (spatial hash của OBB nhà + mặt cầu `DECK` + cầu tàu `JETTIES`), `groundAt()`, vật lý đi bộ, chạy, nhảy, bơi, lái xe (`updatePlayer`), camera bám theo (`followCamera`), dịch chuyển (`teleportTo`). |
| `src/js/audio.js` | Âm thanh Web Audio tổng hợp hoàn toàn bằng code: lớp nền (sóng, gió, phố, dế đêm) đổi âm lượng theo môi trường quanh người nghe (`envAt`), âm ngắn (còi xe `horn`, chim `chirp`, té nước, còi tàu, bước chân), tiếng máy xe theo tốc độ. `updateAudio()` gọi mỗi khung từ `frame()`. Chỉ bắt đầu sau thao tác đầu tiên của người dùng (`armAudio`); trạng thái bật/tắt lưu ở `localStorage`. |
| `src/js/ui.js` | OrbitControls (chế độ bản đồ: kéo để pan; chế độ lái: kéo để xoay), zoom về phía con trỏ, bóng đổ bám theo camera (`updateShadow`), nhãn chống chồng lấn (tên mọi đường OSM, xoay theo hướng đường, đường nhỏ chỉ hiện khi nhìn gần), menu thả xuống cho các nút ít dùng, định vị "tôi đang ở đâu" (Geolocation, cần HTTPS; tên đường gần nhất, địa danh gần nhất), HUD (thước tỷ lệ, toạ độ), thẻ địa danh, chế độ lái (`enterPlay`/`exitPlay`, phím, joystick), vòng lặp `frame()`, trình tự dựng `build()`. |

## Địa hình thật

- `H(x, z)` có hai nhánh. Có `TR` (dữ liệu thật) thì dùng `realH()`: **đất liền giữ đường bờ ước lượng `coastX`** (vì đường Trần Phú, bãi biển, khu phố, đám đông đều bám theo nó; khớp thực tế khá tốt), nền phố phẳng như cũ, còn đồi núi lấy độ cao Copernicus (bỏ phần dưới ~15 m vì đó là mô hình bề mặt có cả mái nhà, tán cây), các đồi nhỏ có địa danh trong `HILLS` giữ dáng ước lượng. Ngoài khơi (cách bờ ước lượng > 3 đơn vị) thì **đảo lấy hình dạng và độ cao thật**; `ISLANDS` chỉ còn dùng cho Hòn Đỏ (nhỏ hơn lưới 100 m) và khi bấm chọn đảo. Không có `TR` thì dùng địa hình ước lượng cũ (`mainlandH`, `RIDGES`, `ISLANDS`).
- Độ sâu biển vẫn ước lượng theo khoảng cách tới đất gần nhất (`TR.dist`): dữ liệu độ sâu công khai cho vịnh Nha Trang (Terrarium/ETOPO) gần như trống.
- Lớp phủ: ruộng (`zone 2`) và ao đầm (`zone 3`) theo ESA WorldCover; ngoài khu phố, màu đất (`LC_TINT`) và mật độ cây (`LC_TREES`) theo loại phủ.
- **Đảo theo OSM:** vòng `natural=coastline` khép kín thành mặt nạ `land` (`osmLandS()`), độ cao trong đảo vẫn theo DEM, nên đất lấn biển mới (khu Vinpearl) đúng. Sông: relation multipolygon tô vòng `outer` rồi khoét vòng `inner` (cù lao); đường tâm sông rộng theo thẻ `width` (mặc định 16 m). Bờ sông giữ là đất sát mép nước (đường ven sông, bờ đê).
- **Bờ đất liền theo OSM** (`COAST` lấy từ `OSM_DATA.coast` khi có, `COAST_REAL`): `coastX(z)` vẫn là một giá trị x cho mỗi z (lấy giao điểm xa nhất về phía đông), nên vịnh nhỏ sau mũi đất bị lấp. Đường, nhà: `genBuildingsOSM()` (chân đế OSM + nhà mặt tiền sinh dọc đường thật), `osmMajorRoads()` (đường lớn, chỉ bắc cầu ở `bridge=yes`; đoạn đường thường đi qua chỗ thấp sát nước như cù lao giữa cầu Xóm Bóng giữ thành đường đắp `cw` có mặt đường trong `DECK`), `OSM_MINOR` (đường nhỏ vẽ lên mặt đất). `sampleRoad()` lấy mẫu đều bước ≤ 0,5 vừa khít chiều dài (`R.step`), giữ đủ hai đầu; `roadPoint()` dùng `R.step`. Đường vẽ theo lớp cho mọi đường (vỉa hè → bó vỉa → lòng đường → vạch) rồi phủ đĩa nhựa đường ở giao lộ (điểm OSM chung của ≥ 2 đường) để vạch không cắt ngang. Bùng binh (`junction=roundabout`, cờ 4): `osmRoundabouts()` gom các cung, nội suy đường tròn (Kåsa), gộp cung rời cùng vòng, vẽ theo đúng hình OSM kèm đảo cỏ, cây cọ (`ROUNDS`, `roundD()`).
- Ghi nguồn bắt buộc (© OpenStreetMap contributors ODbL, Copernicus, ESA WorldCover CC BY 4.0, Open-Meteo CC BY 4.0) nằm trong `.attrib` dưới thước tỷ lệ. Đừng xoá.

## Checklist vị trí: tôn trọng bản đồ thật

Nguyên tắc: **vị trí lấy theo bản đồ bên ngoài (OpenStreetMap), không đoán, không dời dữ liệu thật cho vừa đồ hoạ**; nếu đồ hoạ vướng thì sửa đồ hoạ. Dữ liệu chỉ lấy tới năm 2026 trở về trước.

1. Thêm/sửa địa danh: tra OSM trước (Nominatim `nominatim.openstreetmap.org/search?format=json&q=…`, hoặc API `api/0.6/map?bbox=…`). Ghi `ll` theo tâm công trình trong OSM và `osm:'way/123'` (hoặc `node/…`, `relation/…`, `way/…#first|#last` cho đầu tuyến) vào `LM_DEF`; điểm phụ (ga cáp treo, chùa, tượng…) ghi vào `LM_EXTRA`. Không có trong OSM thì ghi `null` và nói rõ là ước lượng (kèm căn cứ: ảnh, độ cao DEM).
2. So **thứ tự tương đối** với địa danh lân cận (bắc → nam, gần → xa bờ), ví dụ Cầu Đá: Lầu Bảo Đại → Viện Hải dương học → Bến tàu Cầu Đá → ga cáp treo.
3. Đồi có địa danh (`HILLS`), đảo nhỏ vẽ tay (`ISLANDS` Hòn Đỏ), khối chừa chỗ `KEEP` và va chạm phải dời theo địa danh.
4. **Kích thước, hướng thật:** bề ngang mô hình theo chân đế OSM (hình chữ nhật bao nhỏ nhất), trục dài theo hướng OSM, mặt tiền theo `entrance=main` nếu có; chiều cao nhân `VB` như nhà phố (`realY()` trong scene.js). Không phóng to địa danh cho dễ nhìn.
5. `npm test` phải in "[map] Tất cả khớp". Chạy `node tools/check-positions.js` (tâm lệch ≤ 60 m, đảo/bãi biển/núi theo ngưỡng riêng, bờ biển lệch 0 m, địa danh trên đất không dưới nước) **và** `node tools/check-sizes.js` (kích thước ×0,6–1,7, lệch hướng < 20°). Mục nào ⚠/✗ phải sửa hoặc giải thích với chủ dự án. Đừng báo "đúng" khi mới so toạ độ tâm.
6. Chụp ảnh **nhìn thẳng từ trên xuống** khu vực vừa sửa và ghép cạnh ảnh tile OSM cùng khung (`tile.openstreetmap.org` truy cập được), so đường, sông, ray, bờ, địa danh trước khi báo xong.
7. Khi tải lại OSM (`fetch-osm.js --refresh`) ghi ngày chụp dữ liệu vào phần Lệnh, chạy lại bước 4.

## Mô hình Kenney

- Nguồn: Kenney City Kit Suburban, City Kit Commercial, Car Kit, Watercraft Kit, Train Kit, Mini Characters, giấy phép CC0 (`assets/models/LICENSE-kenney.txt`). GLB gốc trong `assets/models/{sub,com,car,boat,train,char}/`; mỗi bộ có `Textures/colormap.png` riêng (đừng trộn bộ vào chung thư mục). Mô hình tự dựng ở `assets/models/blender/`.
- `modelGeo(id)` (scene.js) giải mã thành geometry **chuẩn hoá**: chân đế x, z ∈ [−0.5, 0.5], y ∈ [0, 1]. Đặt bằng `scale(rộng, cao, sâu)` như khối hộp, nên va chạm OBB cũ vẫn khớp. `userData.size` giữ kích thước gốc để tính chiều cao tự nhiên.
- `kitMat()` nhân màu đỉnh với `instanceColor` (màu tường); đỉnh có mặt nạ mái (`aMask`) thì nhân với `aRoof` (màu mái từng căn, truyền qua `instChunks(..., { roof:fn })`).
- Biệt thự (`B.villas`) dùng Suburban, quay mặt tiền ra đường theo `fc`. Chung cư giữa khối phố (`B.mids`) dùng Commercial. Nhà ống (`B.tubes`) vẫn là khối hộp tự sinh, thêm bảng hiệu, mái bạt, tum, mái tôn, dù hàng rong.
- Ô tô (`B`→`buildTraffic`, 8 mẫu Car Kit), thuyền đánh cá neo (`anim.hullIM`), phà, ca nô, thuyền buồm, tàu khách, tàu hàng (Watercraft Kit), tàu hỏa (Train Kit) dùng `kitDyn()` (InstancedMesh động) hoặc `kitMesh()` (mesh đơn, màu mái nướng sẵn). `fitLen(id, len)` cho kích thước giữ đúng tỷ lệ gốc. Mũi thuyền Kenney hướng +z, code chuyển động cũ coi −z là mũi nên `kitMesh(..., flip)`.
- Xe máy vẫn tự dựng (Car Kit không có xe máy). Thuyền thúng, làng bè vẫn tự dựng.
- Nhân vật chính: `loadKenneyChar()` (player.js) nạp GLB bất đồng bộ, gắn vào `PL.ch.root` và ẩn nhân vật khối cũ; `animKenney()` chọn hoạt ảnh idle/walk/sprint/jump/fall/drive theo trạng thái. Không nạp được thì nhân vật khối cũ vẫn chạy.
- Đám đông: hàng 0, 2, 3, 5, 6, 8, 9 của tấm sprite được chép đè bằng nhân vật Kenney khi ảnh giải mã xong; áo dài, nón lá, gánh hàng, người bơi vẫn vẽ tay trong `drawPerson()`.
- Mô hình tự dựng bằng Blender: script trong `tools/blender/` (màu theo vật liệu, không texture; `convert-models.js` đổi `baseColorFactor` tuyến tính về sRGB). Dựng theo **đơn vị mô hình của hàm `buildXxx()` cũ** (Blender X đông, Y bắc, Z lên) rồi đặt bằng `kitNative(id)`, nên `place()` và tỷ lệ cũ giữ nguyên. Hiện dùng cho Tháp Bà Ponagar, Chợ Đầm, Nhà thờ Núi, tháp Trầm Hương (vật liệu phát sáng ban đêm `towerGlowVC`), tượng Phật Long Sơn, Ga Nha Trang (mỗi cái ~800–2.300 tam giác). Dựng theo ảnh chụp thật (hình dáng, màu); `convert-models.js` không áp mặt nạ mái cho thư mục `blender/`.
- Mỗi mô hình là một lần vẽ cho mỗi chunk của `instChunks`; muốn thêm nhiều mô hình thì để ý số draw call và số tam giác (nhà Suburban ~800–1.300 tam giác).

## Quy ước và mẹo

- Ngẫu nhiên **có định trước** (`mulberry32`, `ih`, `hash`) để thế giới lần nào cũng giống nhau. Đừng dùng `Math.random()` cho nội dung thế giới.
- Thêm địa danh: thêm vào `LM_DEF` (geo.js), viết hàm `buildXxx()` và gọi `place()` trong `buildLandmarks()`, khai `KEEP` (chừa chỗ, không xây nhà) trong khối IIFE `LMP` ở scene.js, thêm khối va chạm trong `buildCollision()` và `TOPKEY` (ui.js) nếu cần neo nhãn trên đỉnh mô hình.
- Thêm khu phố: thêm vào `DIST` (polygon lat/lon, góc lưới `ang`, bước phố `su`/`sv`, `style` là `city`, `suburb`, `village` hoặc `resort`). Đường phố và nhà tự khớp với nhau vì cùng dùng một lưới.
- Shader được vá qua `onBeforeCompile` theo tên chunk của r147: `begin_vertex`, `color_fragment`, `normal_fragment_begin`, `map_fragment`, `fog_vertex`. Nâng cấp three có thể làm vỡ chỗ này.
- Hiệu năng: `LITE` giảm lưới địa hình, texture, mật độ nhà, cây, người, xe lúc dựng; bật khi ≤ 2 nhân, hoặc màn hình nhỏ mà < 6 nhân (trừ iPhone dpr 3), hoặc lần trước bộ điều tốc đã phải hạ hết mức (`localStorage['nt-q']`). Ép bằng `?q=lite` / `?q=full`. `SMALL` (màn hình nhỏ) chỉ giảm độ phân giải và bóng. `governor()` (ui.js) đo FPS: dưới 38 thì hạ lần lượt độ phân giải → tắt bóng → bớt nửa đám đông. Shadow map chỉ vẽ lại khi camera đổi vùng, hoặc mỗi 3 khung khi nhìn gần.
- Debug: `window.__nt` chứa grid, danh sách nhà và cây, người chơi `PL`, `enterPlay`, `toggleMount`, `THREE`, và hook cho chụp ảnh/test: `jump(target, r, phi, th)` (đặt thẳng camera, huỷ chuyển cảnh), `home()`, `setTod(0|1|2)` (đặt ngay giờ), `setWx('real'|'sun'|'rain')` (đặt ngay thời tiết), `frames()` (đếm khung hình). Trong SwiftShader mỗi khung mất vài giây và `dt` bị chặn ở 0,05 nên mọi nội suy theo khung (giờ, mưa, bay camera) chậm: luôn dùng các hook này thay vì bấm nút rồi chờ.

## Hạn chế đã biết

- Địa hình, đảo, đường, nhà (một phần), bờ đất liền và địa danh đã theo dữ liệu thật; **ranh giới khu phố (`DIST`, quyết định kiểu nhà) và vị trí làng chài, lồng bè, cầu tàu cảng vẫn là ước lượng**; sông và đường sắt đã theo OSM. Nhà hát Đó (Vega City, `node/13629949097`) nằm đúng mép bắc bàn bản đồ (12,3006°B) nên chưa đặt được, muốn có phải mở rộng bàn về phía bắc (tải lại DEM). OSM ở Nha Trang có ít chân đế nhà (~3.900), phần lớn nhà vẫn sinh tự động dọc đường thật. Vài thứ đặt theo toạ độ ước lượng trên đảo (làng chài, lồng bè) có thể rơi xuống nước và bị bỏ qua.
- Đám đông là sprite 2D vẽ sẵn (không có xương); nhân vật chính có xương nhưng chưa có hoạt ảnh bơi riêng (dùng dáng chạy, xoay ngang).
- Người đi bộ và xe không né nhân vật, cũng không né nhau.
- Hình 3D chưa được kiểm tra tự động; chỉ có smoke test logic.
- Biệt thự dùng mô hình đầy đủ ở mọi khoảng cách (chưa có LOD). Trên máy yếu có thể cần LOD hoặc giảm số mẫu nhà.

## Quy trình làm việc với chủ dự án

- Chủ dự án nói tiếng Việt; trả lời và viết comment, commit body, PR bằng tiếng Việt. Thiết bị chính để xem: **iPhone 15 Pro Max** (Safari): kiểm tra giao diện ở bề ngang ~430 px, cảm ứng (giữ lâu không được bật menu chọn chữ), âm thanh cần chạm màn hình trước.
- **Không commit / push khi chưa được đồng ý.** Hook `stop-hook-git-check.sh` hay nhắc commit: chỉ báo lại là đang chờ, đừng tự làm. Khi được đồng ý ("merge luôn", "merged"…): mỗi đợt việc một nhánh mới từ `main` → commit → push → tạo PR → merge vào `main`.
- **Deploy:** push/merge vào `main` thì workflow `.github/workflows/pages.yml` build và đăng lên https://takiakun.github.io/Nhatrang-tour/ (~1 phút; kiểm tra bằng `curl` trang đó). Nhánh mặc định là `main`; môi trường `github-pages` đã cho phép `main`. Nhánh `master` cũ không dùng nữa.
- Mỗi đợt: `npm test` (3 cấu hình phải OK) + chụp ảnh trang thật (xem dưới) rồi gửi ảnh cho chủ dự án trước khi hỏi merge.

## Mẹo cho môi trường cloud (Claude Code trên web)

- **Chụp ảnh trang thật:** `NODE_PATH=/opt/node-tools/node_modules node tools/shot.js <thư mục ra>` (Chromium có sẵn, WebGL qua SwiftShader, trang phục vụ từ `dist/`, mạng khác bị chặn). Viewport ≥ 1100×720 mới bật hậu kỳ (nhỏ hơn là LITE). Một cảnh mất ~1–4 phút; chạy nền (`run_in_background`) rồi dùng Monitor. Vị trí địa danh ở `__nt.lmp[id]`, độ cao `__nt.G.hAt(x, z)`.
- **Đừng cài Playwright vào `node_modules`** (bản khác không tìm thấy Chromium có sẵn); nếu lỡ cài thì xoá `node_modules/playwright*`. `geotiff` (cho `tools/fetch-terrain.js`) đã nằm trong devDependencies.
- **Blender** không có sẵn: tải bản chính thức `blender-4.2.3-linux-x64.tar.xz` từ download.blender.org vào thư mục tạm (cần chủ dự án cho phép vì là chương trình tải từ ngoài), chạy `--background`.
- **Ảnh tham khảo khi dựng mô hình:** Wikimedia/Wikipedia hay trả 429 qua proxy; lấy ảnh từ trang du lịch (vietnamnomad.com, vinwonders.com, greensm.com, mia.vn…) bằng `curl -A "Mozilla/5.0"`, chỉ để xem, không đưa vào dự án. Overpass chính bị chặn, dùng `maps.mail.ru/osm/tools/overpass`; API OSM `api/0.6/map` và AWS (Copernicus, WorldCover, Terrarium) truy cập được.

## Việc đang chờ / ý tưởng đã bàn

- Cử chỉ hai ngón kiểu bản đồ điện thoại (vặn để xoay, vuốt dọc để nghiêng) đã thử nhưng gỡ ra: ngón thứ hai hay chạm trúng nhãn đè trên canvas, cần nghe sự kiện ở `window` và kiểm bằng `Input.dispatchTouchEvent` (CDP) trước khi bật. Hiện có nút ⟲ ⟳ 2D/3D dưới la bàn, phím Q/E/T.
- Bơi khi giữ "chạy" có tốc độ 2.8 > xe máy tăng ga 2.4 (đi bộ đã chỉnh: 0.5 / chạy 1.1 < xe 1.6 / 2.4). Chủ dự án chưa quyết.
- Chưa làm: xe máy kiểu Việt Nam bằng Blender, tượng Phật chi tiết hơn (mặt), thêm địa danh Blender (Viện Pasteur, Biệt điện Bảo Đại, ga cáp treo), hoạt ảnh bơi.
- Hướng lớn đã đề xuất (chờ chủ dự án chọn mục đích: du lịch / trò chơi / cá nhân): sông, đường sắt, khu phố theo OSM; Gaussian splatting (chỉ khi có video flycam giấy phép CC hoặc của chủ dự án, cần GPU); cẩm nang du lịch (lộ trình, quán ăn từ OSM, đa ngôn ngữ) hoặc trò chơi (nhiệm vụ xe ôm/giao hàng, lái thuyền, sưu tầm); nâng three.js lên bản mới + Vite (bỏ ràng buộc artifact). Không khuyên: Google Photorealistic 3D Tiles (chưa chắc có Nha Trang, tốn phí, lệch phong cách), đổi engine.
