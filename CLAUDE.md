# Nha Trang 3D — hướng dẫn cho Claude Code

Bản đồ 3D phong cách hoạt hình của vịnh Nha Trang, chạy trên web. Toàn bộ thế giới được **sinh bằng code** (không có file mô hình, ảnh hay dữ liệu ngoài): địa hình, nhà, cây, người, xe, thuyền đều tạo lúc tải trang (~1–2 s).

## Lệnh

- `node build.js`: ghép `src/` thành `dist/index.html` (trang đầy đủ) và `dist/artifact.html` (bản để đăng làm Claude artifact).
- `node build.js --watch`: tự build lại khi sửa file.
- `npm run serve`: phục vụ `dist/` ở http://localhost:8080. Cũng có thể mở thẳng `dist/index.html`.
- `npm test`: build rồi chạy `tests/smoke.js`. Cần `npm i` trước để có Playwright, và `npx playwright install chromium` nếu máy chưa có Chromium.

Luôn chạy `npm test` sau khi sửa. Smoke test thay three.js bằng `tests/stub-three.js`: logic chạy thật, còn hình 3D và shader **không** được kiểm tra. Muốn xem hình thì mở trang thật trong trình duyệt.

## Ràng buộc quan trọng

- **Các file trong `src/js/` KHÔNG phải module.** Build nối chúng theo thứ tự `geo → scene → crowd → player → ui` vào **một IIFE chung** (`'use strict'`). Chúng dùng chung biến toàn cục của IIFE, và `scene.js` có `return` ở cấp cao nhất để dừng khi thiếu WebGL. Không tách thành `<script>` riêng; nếu chuyển sang ES modules thì phải refactor có chủ đích.
- **three.js r147 bản UMD** từ jsDelivr (`build/three.min.js` + `examples/js/controls/OrbitControls.js`). Thư mục `examples/js` đã bị xoá từ r160, nên muốn nâng cấp three thì phải chuyển sang ES modules / import map.
- Nếu tiếp tục đăng làm **Claude artifact**: script chỉ được tải từ cdnjs, jsDelivr, unpkg; không fetch dữ liệu ngoài; mọi asset phải nhúng (data URI) hoặc sinh bằng code. Khi deploy riêng (Vercel, GitHub Pages…) thì không còn giới hạn này.
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
| `src/js/scene.js` | Renderer, ánh sáng, helper vật liệu và instancing, các hàm dựng địa danh (Tháp Bà, Chợ Đầm, Long Sơn, Nhà thờ Núi, Trầm Hương…), địa hình kèm vá mặt đất độ nét cao (`DU`/`DP`, `updateDetail`), shader nước, viền bàn, cầu tự động, thành phố, cây, thuyền, làng bè, giao thông, tàu hỏa, đèn đường, mây, chim, hệ thời gian trong ngày `TOD`/`applyTod`. |
| `src/js/crowd.js` | Đám đông sprite 8 hướng. `drawPerson()` vẽ người từ một mô hình que 3D chiếu lên canvas; `buildSpriteSheet()` tạo sheet 12 hàng × (8 hướng × 4 khung); `genCrowd()` đặt người; `buildCrowd()` dùng `InstancedBufferGeometry` + `ShaderMaterial`. Billboard, chọn hướng và chuyển động đều tính trên GPU (đi qua lại trên đoạn thẳng `aA→aB`). |
| `src/js/player.js` | Nhân vật chính (texture atlas `atlasCanvas()` + các khối), xe máy `buildBike()`, va chạm (spatial hash của OBB nhà + mặt cầu `DECK` + cầu tàu `JETTIES`), `groundAt()`, vật lý đi bộ, chạy, nhảy, bơi, lái xe (`updatePlayer`), camera bám theo (`followCamera`), dịch chuyển (`teleportTo`). |
| `src/js/ui.js` | OrbitControls (chế độ bản đồ: kéo để pan; chế độ lái: kéo để xoay), zoom về phía con trỏ, bóng đổ bám theo camera (`updateShadow`), nhãn chống chồng lấn, HUD (thước tỷ lệ, toạ độ), thẻ địa danh, chế độ lái (`enterPlay`/`exitPlay`, phím, joystick), vòng lặp `frame()`, trình tự dựng `build()`. |

## Quy ước và mẹo

- Ngẫu nhiên **có định trước** (`mulberry32`, `ih`, `hash`) để thế giới lần nào cũng giống nhau. Đừng dùng `Math.random()` cho nội dung thế giới.
- Thêm địa danh: thêm vào `LM_DEF` (geo.js), viết hàm `buildXxx()` và gọi `place()` trong `buildLandmarks()`, khai `KEEP` (chừa chỗ, không xây nhà) trong khối IIFE `LMP` ở scene.js, thêm khối va chạm trong `buildCollision()` và `TOPKEY` (ui.js) nếu cần neo nhãn trên đỉnh mô hình.
- Thêm khu phố: thêm vào `DIST` (polygon lat/lon, góc lưới `ang`, bước phố `su`/`sv`, `style` là `city`, `suburb`, `village` hoặc `resort`). Đường phố và nhà tự khớp với nhau vì cùng dùng một lưới.
- Shader được vá qua `onBeforeCompile` theo tên chunk của r147: `begin_vertex`, `color_fragment`, `normal_fragment_begin`, `map_fragment`, `fog_vertex`. Nâng cấp three có thể làm vỡ chỗ này.
- Hiệu năng: `LITE` (màn hình nhỏ hoặc ≤ 2 nhân CPU) giảm lưới địa hình, texture, mật độ nhà, cây, người, xe. Shadow map chỉ vẽ lại khi camera đổi vùng, hoặc mỗi 3 khung khi nhìn gần.
- Debug: `window.__nt` chứa grid, danh sách nhà và cây, người chơi `PL`, `enterPlay`, `toggleMount`…

## Hạn chế đã biết

- Địa lý dựng theo toạ độ ước lượng, không phải dữ liệu đo đạc (chưa dùng OpenStreetMap hay DEM thật).
- Nhân vật dựng bằng khối, không có xương (skinning). Hoạt ảnh là xoay tay chân cứng.
- Người đi bộ và xe không né nhân vật, cũng không né nhau.
- Hình 3D chưa được kiểm tra tự động; chỉ có smoke test logic.
