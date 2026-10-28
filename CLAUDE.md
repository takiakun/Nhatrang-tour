# Nha Trang 3D — hướng dẫn cho Claude Code

Bản đồ 3D phong cách hoạt hình của vịnh Nha Trang, chạy trên web. Gần như toàn bộ thế giới được **sinh bằng code**: địa hình, nhà ống, cây, người, xe, thuyền, âm thanh đều tạo lúc tải trang (~1–2 s). Địa hình, đảo và lớp phủ mặt đất lấy từ dữ liệu thật (`src/js/terrain-data.js`); thời tiết lấy trực tiếp từ Open-Meteo lúc chạy. Ngoại lệ khác là các mô hình Kenney (CC0): nhà, ô tô, thuyền, tàu hỏa (`src/js/models.js`), nhân vật chính có xương (`src/js/character.js`) và tấm sprite đám đông vẽ sẵn (`src/js/crowd-sheet.js`). Cả ba đều là file sinh ra, nhúng thẳng trong trang.

## Lệnh

- `node build.js`: ghép `src/` thành `dist/index.html` (trang đầy đủ) và `dist/artifact.html` (bản để đăng làm Claude artifact).
- `node build.js --watch`: tự build lại khi sửa file.
- `npm run serve`: phục vụ `dist/` ở http://localhost:8080. Cũng có thể mở thẳng `dist/index.html`.
- `node tools/convert-models.js`: chuyển các GLB trong `assets/models/` (theo danh sách `LIST` trong file) thành `src/js/models.js`. Chạy lại khi thêm/bớt mô hình; `models.js` là file sinh ra, đừng sửa tay.
- `node tools/fetch-terrain.js [--preview]`: tải Copernicus DEM GLO-30, AWS Terrain Tiles và ESA WorldCover vào `.cache/` (bỏ qua khi commit, cần `curl` và `npm i` để có `geotiff`), rút gọn thành `src/js/terrain-data.js` (độ cao 100 m, lớp phủ 50 m nén RLE). `--preview` ghi `.cache/terrain-preview.png` so độ cao thật với đường bờ ước lượng.
- `node tools/pack-character.js`: đóng gói nhân vật chính (GLB có xương, chỉ giữ vài hoạt ảnh, nhúng texture) thành `src/js/character.js`.
- `node tools/render-crowd.js`: vẽ 7 nhân vật Kenney thành tấm sprite đám đông (8 hướng × 4 khung, WebP) → `src/js/crowd-sheet.js`. Cần Playwright; không có mạng thì đặt `THREE_DIR` trỏ tới thư mục chứa `three.min.js` và `GLTFLoader.js` bản r147.
- `npm test`: build rồi chạy `tests/smoke.js`. Cần `npm i` trước để có Playwright, và `npx playwright install chromium` nếu máy chưa có Chromium.

Luôn chạy `npm test` sau khi sửa. Smoke test chạy 3 cấu hình (máy tính; điện thoại mạnh dựng bản đầy đủ; điện thoại `?q=lite`) và thay three.js bằng `tests/stub-three.js`: logic chạy thật, còn hình 3D và shader **không** được kiểm tra; GLTFLoader cũng bị thay nên nhân vật Kenney không được nạp trong test (trang tự dùng nhân vật khối dự phòng). Âm thanh thì có kiểm tra: test đo RMS ở nút master để chắc có tín hiệu. Muốn xem hình thì mở trang thật trong trình duyệt.

## Ràng buộc quan trọng

- **Các file trong `src/js/` KHÔNG phải module.** Build nối chúng theo thứ tự `terrain-data → geo → models → scene → crowd-sheet → crowd → character → player → audio → weather → ui` vào **một IIFE chung** (`'use strict'`). Chúng dùng chung biến toàn cục của IIFE, và `scene.js` có `return` ở cấp cao nhất để dừng khi thiếu WebGL. Không tách thành `<script>` riêng; nếu chuyển sang ES modules thì phải refactor có chủ đích.
- **three.js r147 bản UMD** từ jsDelivr (`build/three.min.js` + `examples/js/controls/OrbitControls.js` + `examples/js/loaders/GLTFLoader.js`, chỉ dùng cho nhân vật chính). Thư mục `examples/js` đã bị xoá từ r160, nên muốn nâng cấp three thì phải chuyển sang ES modules / import map.
- Nếu tiếp tục đăng làm **Claude artifact**: script chỉ được tải từ cdnjs, jsDelivr, unpkg; không fetch dữ liệu ngoài; mọi asset phải nhúng (data URI) hoặc sinh bằng code. Vì vậy mọi mô hình được nhúng base64 (trang ~1,9 MB, gzip ~0,75 MB). Khi deploy riêng (Vercel, GitHub Pages…) thì không còn giới hạn này.
- **Bug của r147**: `InstancedMesh` cull theo bounding sphere của geometry gốc. Vì vậy `instChunks()` chia instance theo lưới 4×4 và gán `boundingSphere` thủ công cho từng chunk. Mesh động (xe, thuyền) đặt `frustumCulled = false`.

## Hệ toạ độ

- 1 đơn vị = **50 m** theo chiều ngang. `P(lat, lon)` → `[x, z]`; `toLL(x, z)` làm ngược lại. x hướng Đông, **z hướng Nam** (Bắc là −z). Gốc toạ độ ở 12.226°B, 109.240°Đ.
- Mặt nước ở y = 0. Độ cao địa hình phóng đại: `VE = 0.06` đơn vị/m. Nhà phóng đại ít hơn: `VB = 0.032`, `FLOOR` = chiều cao một tầng.
- Bàn bản đồ là hình chữ nhật bo góc `BX0..BX1 × BZ0..BZ1` (≈ 19,4 × 16,6 km), bo góc `BR`. Dùng `inBoard()` và `boardClamp()` để kiểm tra.

## Các file

| File | Nội dung |
|---|---|
| `src/page.html` | Khung HTML: header, toolbar, thẻ thông tin, HUD lái xe, loader. Có placeholder cho CSS và JS. |
| `src/styles.css` | Giao diện. Màu là token trên `:root`, có dark mode. |
| `src/js/geo.js` | **JS thuần, không dùng three.js.** Dữ liệu địa lý (`COAST`, `RIVERS`, `ISLANDS`, `RIDGES`/`HILLS`, `DIST` khu phố, `PONDS`, `ROADS`, `RAIL`, `LM_DEF` địa danh, `GEO_LABELS`, `ROAD_LABELS`), hàm độ cao `H(x, z)`, lưới `buildGrid()` (độ cao, nhiễu, vùng, độ dốc), tô màu mặt đất `paintGround()`, sinh nhà `genBuildings()`, sinh cây `genTrees()`. Chạy được trong Node để test. |
| `src/js/terrain-data.js` | **File sinh ra** bởi `tools/fetch-terrain.js`: độ cao thật (Int16, dm), lớp phủ ESA WorldCover (RLE). `geo.js` giải mã thành `TR` (kèm trường khoảng cách tới đất). |
| `src/js/weather.js` | Chế độ **Giờ thật** (vị trí mặt trời theo giờ Nha Trang: `sunPos`, `todFromSun`, hướng nắng `realSunDir`) và thời tiết Open-Meteo (`fetchWeather` mỗi 15 phút: mây, mưa, gió, nhiệt độ). `weatherLight()` chạy cuối `applyTod()`; mưa là lớp canvas 2D `#rain`. Không tải được thì trời quang, không lỗi. |
| `src/js/models.js` | **File sinh ra** bởi `tools/convert-models.js`. `MODEL_DATA[id]` = toạ độ Int16, pháp tuyến Int8, màu đỉnh Uint8 (đã nướng từ texture bảng màu), mặt nạ mái, chỉ số Uint16, tất cả base64. |
| `src/js/crowd-sheet.js`, `src/js/character.js` | **File sinh ra.** Tấm sprite đám đông Kenney (WebP base64, `KENNEY_ROWS`) và GLB nhân vật chính (`CHAR_GLB.player`). |
| `src/js/scene.js` | Renderer, ánh sáng, helper vật liệu và instancing, các hàm dựng địa danh (Tháp Bà, Chợ Đầm, Long Sơn, Nhà thờ Núi, Trầm Hương…), địa hình kèm vá mặt đất độ nét cao (`DU`/`DP`, `updateDetail`), shader nước, viền bàn, cầu tự động, thành phố, cây, thuyền, làng bè, giao thông, tàu hỏa, đèn đường, mây, chim, hệ thời gian trong ngày `TOD`/`applyTod`. |
| `src/js/crowd.js` | Đám đông sprite 8 hướng. `drawPerson()` vẽ người từ một mô hình que 3D chiếu lên canvas; `buildSpriteSheet()` tạo sheet 12 hàng × (8 hướng × 4 khung); `genCrowd()` đặt người; `buildCrowd()` dùng `InstancedBufferGeometry` + `ShaderMaterial`. Billboard, chọn hướng và chuyển động đều tính trên GPU (đi qua lại trên đoạn thẳng `aA→aB`). |
| `src/js/player.js` | Nhân vật chính (texture atlas `atlasCanvas()` + các khối), xe máy `buildBike()`, va chạm (spatial hash của OBB nhà + mặt cầu `DECK` + cầu tàu `JETTIES`), `groundAt()`, vật lý đi bộ, chạy, nhảy, bơi, lái xe (`updatePlayer`), camera bám theo (`followCamera`), dịch chuyển (`teleportTo`). |
| `src/js/audio.js` | Âm thanh Web Audio tổng hợp hoàn toàn bằng code: lớp nền (sóng, gió, phố, dế đêm) đổi âm lượng theo môi trường quanh người nghe (`envAt`), âm ngắn (còi xe `horn`, chim `chirp`, té nước, còi tàu, bước chân), tiếng máy xe theo tốc độ. `updateAudio()` gọi mỗi khung từ `frame()`. Chỉ bắt đầu sau thao tác đầu tiên của người dùng (`armAudio`); trạng thái bật/tắt lưu ở `localStorage`. |
| `src/js/ui.js` | OrbitControls (chế độ bản đồ: kéo để pan; chế độ lái: kéo để xoay), zoom về phía con trỏ, bóng đổ bám theo camera (`updateShadow`), nhãn chống chồng lấn, HUD (thước tỷ lệ, toạ độ), thẻ địa danh, chế độ lái (`enterPlay`/`exitPlay`, phím, joystick), vòng lặp `frame()`, trình tự dựng `build()`. |

## Địa hình thật

- `H(x, z)` có hai nhánh. Có `TR` (dữ liệu thật) thì dùng `realH()`: **đất liền giữ đường bờ ước lượng `coastX`** (vì đường Trần Phú, bãi biển, khu phố, đám đông đều bám theo nó; khớp thực tế khá tốt), nền phố phẳng như cũ, còn đồi núi lấy độ cao Copernicus (bỏ phần dưới ~15 m vì đó là mô hình bề mặt có cả mái nhà, tán cây), các đồi nhỏ có địa danh trong `HILLS` giữ dáng ước lượng. Ngoài khơi (cách bờ ước lượng > 3 đơn vị) thì **đảo lấy hình dạng và độ cao thật**; `ISLANDS` chỉ còn dùng cho Hòn Đỏ (nhỏ hơn lưới 100 m) và khi bấm chọn đảo. Không có `TR` thì dùng địa hình ước lượng cũ (`mainlandH`, `RIDGES`, `ISLANDS`).
- Độ sâu biển vẫn ước lượng theo khoảng cách tới đất gần nhất (`TR.dist`): dữ liệu độ sâu công khai cho vịnh Nha Trang (Terrarium/ETOPO) gần như trống.
- Lớp phủ: ruộng (`zone 2`) và ao đầm (`zone 3`) theo ESA WorldCover; ngoài khu phố, màu đất (`LC_TINT`) và mật độ cây (`LC_TREES`) theo loại phủ.
- Ghi nguồn bắt buộc (Copernicus, ESA WorldCover CC BY 4.0, Open-Meteo CC BY 4.0) nằm trong `.attrib` dưới thước tỷ lệ. Đừng xoá.

## Mô hình Kenney

- Nguồn: Kenney City Kit Suburban 2.0 và City Kit Commercial 2.1, giấy phép CC0 (`assets/models/LICENSE-kenney.txt`). GLB gốc nằm ở `assets/models/sub/` và `assets/models/com/`; mỗi bộ có `Textures/colormap.png` riêng.
- `modelGeo(id)` (scene.js) giải mã thành geometry **chuẩn hoá**: chân đế x, z ∈ [−0.5, 0.5], y ∈ [0, 1]. Đặt bằng `scale(rộng, cao, sâu)` như khối hộp, nên va chạm OBB cũ vẫn khớp. `userData.size` giữ kích thước gốc để tính chiều cao tự nhiên.
- `kitMat()` nhân màu đỉnh với `instanceColor` (màu tường); đỉnh có mặt nạ mái (`aMask`) thì nhân với `aRoof` (màu mái từng căn, truyền qua `instChunks(..., { roof:fn })`).
- Biệt thự (`B.villas`) dùng Suburban, quay mặt tiền ra đường theo `fc`. Chung cư giữa khối phố (`B.mids`) dùng Commercial. Nhà ống (`B.tubes`) vẫn là khối hộp tự sinh, thêm bảng hiệu, mái bạt, tum, mái tôn, dù hàng rong.
- Ô tô (`B`→`buildTraffic`, 8 mẫu Car Kit), thuyền đánh cá neo (`anim.hullIM`), phà, ca nô, thuyền buồm, tàu khách, tàu hàng (Watercraft Kit), tàu hỏa (Train Kit) dùng `kitDyn()` (InstancedMesh động) hoặc `kitMesh()` (mesh đơn, màu mái nướng sẵn). `fitLen(id, len)` cho kích thước giữ đúng tỷ lệ gốc. Mũi thuyền Kenney hướng +z, code chuyển động cũ coi −z là mũi nên `kitMesh(..., flip)`.
- Xe máy vẫn tự dựng (Car Kit không có xe máy). Thuyền thúng, làng bè vẫn tự dựng.
- Nhân vật chính: `loadKenneyChar()` (player.js) nạp GLB bất đồng bộ, gắn vào `PL.ch.root` và ẩn nhân vật khối cũ; `animKenney()` chọn hoạt ảnh idle/walk/sprint/jump/fall/drive theo trạng thái. Không nạp được thì nhân vật khối cũ vẫn chạy.
- Đám đông: hàng 0, 2, 3, 5, 6, 8, 9 của tấm sprite được chép đè bằng nhân vật Kenney khi ảnh giải mã xong; áo dài, nón lá, gánh hàng, người bơi vẫn vẽ tay trong `drawPerson()`.
- Mỗi mô hình là một lần vẽ cho mỗi chunk của `instChunks`; muốn thêm nhiều mô hình thì để ý số draw call và số tam giác (nhà Suburban ~800–1.300 tam giác).

## Quy ước và mẹo

- Ngẫu nhiên **có định trước** (`mulberry32`, `ih`, `hash`) để thế giới lần nào cũng giống nhau. Đừng dùng `Math.random()` cho nội dung thế giới.
- Thêm địa danh: thêm vào `LM_DEF` (geo.js), viết hàm `buildXxx()` và gọi `place()` trong `buildLandmarks()`, khai `KEEP` (chừa chỗ, không xây nhà) trong khối IIFE `LMP` ở scene.js, thêm khối va chạm trong `buildCollision()` và `TOPKEY` (ui.js) nếu cần neo nhãn trên đỉnh mô hình.
- Thêm khu phố: thêm vào `DIST` (polygon lat/lon, góc lưới `ang`, bước phố `su`/`sv`, `style` là `city`, `suburb`, `village` hoặc `resort`). Đường phố và nhà tự khớp với nhau vì cùng dùng một lưới.
- Shader được vá qua `onBeforeCompile` theo tên chunk của r147: `begin_vertex`, `color_fragment`, `normal_fragment_begin`, `map_fragment`, `fog_vertex`. Nâng cấp three có thể làm vỡ chỗ này.
- Hiệu năng: `LITE` giảm lưới địa hình, texture, mật độ nhà, cây, người, xe lúc dựng; bật khi ≤ 2 nhân, hoặc màn hình nhỏ mà < 6 nhân (trừ iPhone dpr 3), hoặc lần trước bộ điều tốc đã phải hạ hết mức (`localStorage['nt-q']`). Ép bằng `?q=lite` / `?q=full`. `SMALL` (màn hình nhỏ) chỉ giảm độ phân giải và bóng. `governor()` (ui.js) đo FPS: dưới 38 thì hạ lần lượt độ phân giải → tắt bóng → bớt nửa đám đông. Shadow map chỉ vẽ lại khi camera đổi vùng, hoặc mỗi 3 khung khi nhìn gần.
- Debug: `window.__nt` chứa grid, danh sách nhà và cây, người chơi `PL`, `enterPlay`, `toggleMount`…

## Hạn chế đã biết

- Địa hình và đảo đã là dữ liệu thật, nhưng **đường bờ đất liền, sông, đường xá, khu phố vẫn là toạ độ ước lượng** (chưa dùng OpenStreetMap). Vài thứ đặt theo toạ độ ước lượng trên đảo (làng chài, lồng bè) có thể rơi xuống nước và bị bỏ qua.
- Đám đông là sprite 2D vẽ sẵn (không có xương); nhân vật chính có xương nhưng chưa có hoạt ảnh bơi riêng (dùng dáng chạy, xoay ngang).
- Người đi bộ và xe không né nhân vật, cũng không né nhau.
- Hình 3D chưa được kiểm tra tự động; chỉ có smoke test logic.
- Biệt thự dùng mô hình đầy đủ ở mọi khoảng cách (chưa có LOD). Trên máy yếu có thể cần LOD hoặc giảm số mẫu nhà.
