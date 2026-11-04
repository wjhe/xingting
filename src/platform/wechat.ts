import type { Platform } from './types';

/** 微信小游戏 API 的最小类型声明，只列出用到的部分 */
declare const wx: {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: string): void;
  removeStorageSync(key: string): void;
  getWindowInfo(): {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    safeArea?: { top: number; bottom: number };
  };
  getMenuButtonBoundingClientRect(): { top: number; bottom: number };
  showKeyboard(opts: { defaultValue: string; maxLength: number; confirmType: string; multiple?: boolean }): void;
  hideKeyboard(opts?: object): void;
  onKeyboardConfirm(cb: (res: { value: string }) => void): void;
  offKeyboardConfirm(cb?: (res: { value: string }) => void): void;
  onKeyboardComplete(cb: (res: { value: string }) => void): void;
  offKeyboardComplete(cb?: (res: { value: string }) => void): void;
};

export const wechatPlatform: Platform = {
  name: 'wechat',
  storage: {
    get(k) {
      const v = wx.getStorageSync(k);
      return typeof v === 'string' && v !== '' ? v : null;
    },
    set: (k, v) => wx.setStorageSync(k, v),
    remove: (k) => wx.removeStorageSync(k),
  },
  screen() {
    const info = wx.getWindowInfo();
    return { width: info.windowWidth, height: info.windowHeight, dpr: Math.min(info.pixelRatio, 3) };
  },
  safeInsets() {
    const info = wx.getWindowInfo();
    // 右上角胶囊按钮下方才是可用区域
    const menu = wx.getMenuButtonBoundingClientRect();
    const top = Math.max(info.safeArea?.top ?? 0, menu.bottom + 6);
    const bottom = info.safeArea ? info.windowHeight - info.safeArea.bottom : 0;
    return { top, bottom };
  },
  promptText(_title, initial) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value: string | null) => {
        if (done) return;
        done = true;
        wx.offKeyboardConfirm(onConfirm);
        wx.offKeyboardComplete(onComplete);
        wx.hideKeyboard();
        resolve(value);
      };
      const onConfirm = (res: { value: string }) => finish(res.value);
      // 没点确认直接收起键盘，也采用已输入的内容
      const onComplete = (res: { value: string }) => finish(res.value);
      wx.onKeyboardConfirm(onConfirm);
      wx.onKeyboardComplete(onComplete);
      wx.showKeyboard({ defaultValue: initial, maxLength: 8, confirmType: 'done', multiple: false });
    });
  },
  // TODO(M4)：开通流量主、建好广告位后接 wx.createRewardedVideoAd / wx.createInterstitialAd。
  // 在那之前按"暂无可用视频"处理，按钮置灰，不影响游戏流程。
  ads: {
    rewardedReady: () => false,
    showRewarded: async () => 'unavailable',
    showInterstitial: async () => {},
  },
};
