// Giữ lệnh cũ `node build.js [--watch]`: nay chỉ gọi Vite (xem vite.config.js). Bản đầy đủ: npm run build, bản test: npm run build:test.
const { spawnSync } = require('child_process');
const r = spawnSync('npx', ['vite', 'build', ...(process.argv.includes('--watch') ? ['--watch'] : [])], { stdio:'inherit', shell:process.platform === 'win32' });
process.exit(r.status === null ? 1 : r.status);
