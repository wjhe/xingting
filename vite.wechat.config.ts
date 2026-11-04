import { defineConfig } from 'vite';

/** 微信小游戏：打成单个 IIFE 文件，由 game.js require 加载 */
export default defineConfig({
  build: {
    outDir: 'dist-wechat',
    emptyOutDir: true,
    target: 'es2017',
    chunkSizeWarningLimit: 4000,
    lib: {
      entry: 'src/wechat/main.ts',
      formats: ['iife'],
      name: 'wdcs',
      fileName: () => 'main.js',
    },
  },
});
