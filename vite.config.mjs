// Vite: đóng gói trang (điểm vào index.html → src/main.js → các ES module trong src/js/).
// Chế độ `test`: không đóng gói three, dùng window.THREE do test chèn vào (tests/stub-three.js): logic chạy thật, hình 3D no-op.
//   npm run build        -> dist/            (GitHub Pages)
//   npm run build:test   -> dist-test/       (cho tests/*.js)
//   npm run build:single -> dist-single/     (một file HTML duy nhất, mở thẳng từ ổ đĩa)
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

// Chế độ test: src/js/three.js được thay bằng window.THREE.
function testThree(mode){
  const file = path.resolve('src/js/three.js');
  return { name: 'test-three', enforce: 'pre', load(id){ if (mode === 'test' && path.resolve(id) === file) return 'export const THREE = window.THREE;\n'; } };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [testThree(mode), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'test' ? 'dist-test' : (mode === 'single' ? 'dist-single' : 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 8000,
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { port: 8080, host: true },
  preview: { port: 8080, host: true },
}));
