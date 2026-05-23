#!/usr/bin/env node
/**
 * 开发模式启动脚本
 * 同时启动 Vite dev server 和 Electron
 */
const { spawn } = require('child_process');
const path = require('path');
const waitOn = require('wait-on');

const ROOT = path.resolve(__dirname, '..');
const RENDERER_DIR = path.join(ROOT, 'src/renderer');

// 1. 启动 Vite dev server
console.log('[dev] Starting Vite dev server...');
const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
  cwd: RENDERER_DIR,
  stdio: 'inherit',
  shell: true,
});

// 2. 等待 Vite 就绪后启动 Electron
waitOn({ resources: ['http-get://127.0.0.1:5173'], timeout: 60000 })
  .then(() => {
    console.log('[dev] Vite ready, starting Electron...');
    const electron = spawn('npx', ['electron', path.join(ROOT, 'dist/main/index.js'), '--dev'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'development' },
    });

    electron.on('close', (code) => {
      console.log(`[dev] Electron exited with code ${code}`);
      vite.kill();
      process.exit(code || 0);
    });
  })
  .catch((err) => {
    console.error('[dev] Failed to wait for Vite:', err);
    vite.kill();
    process.exit(1);
  });

process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});
