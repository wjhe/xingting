import { appAds } from './appAds';
import type { Platform } from './types';

/** 浏览器和 Capacitor（Android WebView）共用 */
export const webPlatform: Platform = {
  name: 'web',
  storage: {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
    remove: (k) => localStorage.removeItem(k),
  },
  screen() {
    // 桌面浏览器上模拟手机竖屏比例
    let width = window.innerWidth;
    const height = window.innerHeight;
    if (width / height > 9 / 16) width = Math.round((height * 9) / 16);
    return { width, height, dpr: Math.min(window.devicePixelRatio || 1, 3) };
  },
  safeInsets() {
    return { top: 0, bottom: 0 };
  },
  async promptText(title, initial) {
    return window.prompt(title, initial);
  },
  // 网页版放模拟广告；安卓 APK 配置了 TapADN 后放真广告（见 appAds.ts）
  ads: appAds,
};
