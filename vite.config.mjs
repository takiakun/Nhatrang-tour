// Vite: đóng gói trang. Hiện các file trong src/js/ vẫn dùng chung một phạm vi (IIFE) như trước; plugin `legacy` nối chúng
// theo ORDER thành một module ảo và cấp biến THREE (three r186 + OrbitControls + GLTFLoader) cho phạm vi đó.
// Chế độ `test`: không đóng gói three, dùng window.THREE do test chèn vào (tests/stub-three.js): logic chạy thật, hình 3D no-op.
//   npm run build        -> dist/            (GitHub Pages)
//   npm run build:test   -> dist-test/       (cho tests/*.js)
//   npm run build:single -> dist-single/     (một file HTML duy nhất, mở thẳng từ ổ đĩa)
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

const ORDER = ['terrain-data.js', 'osm-data.js', 'geo.js', 'models.js', 'scene.js', 'crowd-sheet.js', 'crowd.js', 'character.js', 'player.js', 'audio.js', 'weather.js', 'post.js', 'ui.js'];

function legacy(mode){
  const id = 'virtual:legacy', rid = '\0' + id;
  return {
    name: 'legacy-concat',
    resolveId(s){ if (s === id) return rid; },
    load(i){
      if (i !== rid) return;
      const js = ORDER.map(f => { const p = path.resolve('src/js', f); this.addWatchFile(p); return '/* ---- ' + f + ' ---- */\n' + fs.readFileSync(p, 'utf8'); }).join('\n');
      const head = mode === 'test'
        ? 'const THREE = window.THREE;\n'
        : "import * as T from 'three';\nimport { OrbitControls } from 'three/addons/controls/OrbitControls.js';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nconst THREE = Object.assign({}, T, { OrbitControls, GLTFLoader });\n";
      return head + "(function(){\n'use strict';\n" + js + '\n})();\n';
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [legacy(mode), ...(mode === 'single' ? [viteSingleFile()] : [])],
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
