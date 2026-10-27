# Nha Trang 3D

Bản đồ 3D phong cách hoạt hình của toàn vịnh Nha Trang, chạy trên trình duyệt. Có hàng chục nghìn ngôi nhà, xe chạy, tàu hỏa, thuyền, làng bè và hàng nghìn người đi dạo. Bạn có thể lái xe máy, đi bộ hoặc bơi quanh thành phố và ra các đảo, kèm âm thanh sóng biển, phố xá, còi xe, chim hót (nút **Âm thanh** để bật/tắt, phím **H** để bấm còi).

## Chạy thử

Không cần cài gì: mở thẳng `dist/index.html` bằng Chrome, Edge, Safari hoặc Firefox (cần internet để tải three.js từ CDN).

## Làm việc với mã nguồn

Cần [Node.js](https://nodejs.org) 18 trở lên.

```bash
node build.js            # ghép src/ thành dist/index.html
node build.js --watch    # tự build lại mỗi khi sửa file
npm run serve            # mở http://localhost:8080
```

Kiểm tra tự động (tuỳ chọn):

```bash
npm install
npx playwright install chromium
npm test
```

## Mở bằng Claude Code

```bash
cd nha-trang-3d
claude
```

Claude Code sẽ tự đọc `CLAUDE.md` để hiểu kiến trúc: hệ toạ độ, vai trò từng file, các ràng buộc của three.js r147. Bạn chỉ cần mô tả điều muốn làm, ví dụ "thêm cây cầu Trần Phú mới", "cho người đi bộ né nhân vật", "chuyển sang dữ liệu OpenStreetMap thật".

## Cấu trúc

```
src/page.html      khung trang (header, toolbar, HUD)
src/styles.css     giao diện
src/js/geo.js      địa lý, độ cao, sinh nhà và cây (JS thuần)
src/js/models.js   mô hình nhà Kenney đã chuyển sẵn (file sinh ra)
src/js/scene.js    dựng cảnh 3D, địa danh, nước, giao thông, thời gian trong ngày
src/js/crowd.js    đám đông sprite 8 hướng
src/js/player.js   nhân vật, xe máy, va chạm, bơi
src/js/audio.js    âm thanh tổng hợp bằng Web Audio
src/js/ui.js       điều khiển camera, nhãn, giao diện, vòng lặp chính
build.js           ghép thành 1 file HTML
assets/models/     GLB gốc của Kenney (CC0)
tools/             convert-models.js, pack-character.js, render-crowd.js: sinh dữ liệu mô hình nhúng
tests/             smoke test chạy trong Chromium
dist/              bản đã build sẵn
```

## Đăng lên GitHub Pages

Dự án có sẵn workflow `.github/workflows/pages.yml`: mỗi lần push lên nhánh `main`, GitHub sẽ tự build và đăng.

1. Tạo repo mới trên GitHub, ví dụ `nha-trang-3d`. Để **Public** nếu bạn dùng gói GitHub miễn phí.
2. Đẩy mã nguồn lên:
   ```bash
   cd nha-trang-3d
   git init
   git add .
   git commit -m "Nha Trang 3D"
   git branch -M main
   git remote add origin https://github.com/<tên-bạn>/nha-trang-3d.git
   git push -u origin main
   ```
3. Trên GitHub vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
4. Đợi khoảng 1 phút (xem tiến độ ở tab **Actions**). Trang sẽ có ở `https://<tên-bạn>.github.io/nha-trang-3d/`.

Từ đó, mỗi lần sửa code (hoặc nhờ Claude Code sửa) rồi `git push`, trang sẽ tự cập nhật.

Cách khác không cần Actions: build xong thì chép `dist/index.html` vào thư mục `docs/`, rồi chọn Source là **Deploy from a branch → main → /docs**.

`dist/index.html` cũng đưa lên Netlify hay Vercel được, kéo thả là xong.

## Ghi công

Mô hình của [Kenney](https://www.kenney.nl), giấy phép CC0: City Kit Suburban, City Kit Commercial (nhà, dù che), Car Kit (ô tô), Watercraft Kit (thuyền, tàu), Train Kit (tàu hỏa), Mini Characters (nhân vật chính, đám đông).
