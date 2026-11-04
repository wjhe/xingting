/**
 * 平台能力抽象。游戏代码只依赖这个接口，各平台各自实现。
 */
export interface Platform {
  name: 'web' | 'wechat';
  storage: {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
  };
  /** 屏幕尺寸，单位为 CSS 像素 */
  screen(): { width: number; height: number; dpr: number };
  /** 刘海、胶囊按钮、底部横条占用的高度，单位为 CSS 像素 */
  safeInsets(): { top: number; bottom: number };
  /** 弹出文字输入，取消时返回 null */
  promptText(title: string, initial: string): Promise<string | null>;
  ads: AdProvider;
}

/** rewarded：完整看完；closed：中途关闭；unavailable：加载失败或暂无广告 */
export type AdResult = 'rewarded' | 'closed' | 'unavailable';

/** 广告能力。各平台接自己的广告 SDK；游戏代码只通过这里播放广告 */
export interface AdProvider {
  /** 激励视频现在能不能放（没有广告时按钮置灰，显示"暂无可用视频"） */
  rewardedReady(slot: string): boolean;
  /** 播放激励视频，slot 为广告位编号 */
  showRewarded(slot: string): Promise<AdResult>;
  /** 展示插屏广告；没有广告或展示失败都直接结束 */
  showInterstitial(): Promise<void>;
}
