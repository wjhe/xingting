import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // 照顾国产手机上较旧的 WebView
    target: 'es2017',
    chunkSizeWarningLimit: 2000,
  },
});
