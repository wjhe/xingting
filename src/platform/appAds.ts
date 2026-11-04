import { fakeAds } from './fakeAds';
import type { AdProvider, AdResult } from './types';

/**
 * 网页版和安卓 APK 共用的广告入口：
 * - 网页（开发测试）：模拟广告；
 * - 安卓：同意隐私政策后由门口调用 initAppAds，配置了 TapADN 就放真广告；
 *   没配置时调试包用模拟广告，正式包按"暂无可用视频"处理（不能把模拟广告带上线）。
 */

interface TapAdPlugin {
  status(): Promise<{ configured: boolean; initialized: boolean; debug: boolean }>;
  init(o: { personalized: boolean }): Promise<void>;
  setPersonalized(o: { enabled: boolean }): Promise<void>;
  showRewarded(o: { slot: string }): Promise<{ result: AdResult }>;
  showInterstitial(): Promise<void>;
  addListener(event: 'adShow', cb: () => void): Promise<unknown>;
}

type Mode = 'fake' | 'native' | 'none';

/** 在安卓壳里时 Capacitor 会注入全局对象，可以同步判断 */
function inNativeShell(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

// 安卓里在初始化完成前一律当作没有广告
let mode: Mode = inNativeShell() ? 'none' : 'fake';
let plugin: TapAdPlugin | null = null;
let initStarted = false;

/** 同意隐私政策之后调用（只生效一次） */
export async function initAppAds(personalized: boolean): Promise<void> {
  if (initStarted || !inNativeShell()) return;
  initStarted = true;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const p = registerPlugin<TapAdPlugin>('TapAd');
    const s = await p.status();
    if (!s.configured) {
      mode = s.debug ? 'fake' : 'none';
      return;
    }
    await p.init({ personalized });
    plugin = p;
    mode = 'native';
  } catch (e) {
    console.warn('广告初始化失败', e);
    mode = 'none';
  }
}

/** 是否在放真广告（设置里的"个性化广告"开关只在这时显示） */
export function realAdsActive(): boolean {
  return mode === 'native';
}

export function setPersonalizedAds(enabled: boolean): void {
  void plugin?.setPersonalized({ enabled });
}

export const appAds: AdProvider = {
  rewardedReady(slot) {
    if (mode === 'native') return true;
    return mode === 'fake' && fakeAds.rewardedReady(slot);
  },
  async showRewarded(slot) {
    if (mode === 'fake') return fakeAds.showRewarded(slot);
    if (mode !== 'native' || !plugin) return 'unavailable';
    const hide = loadingVeil();
    const sub = plugin.addListener('adShow', hide);
    try {
      return (await plugin.showRewarded({ slot })).result;
    } finally {
      hide();
      void sub.then((h) => (h as { remove?: () => void })?.remove?.());
    }
  },
  async showInterstitial() {
    if (mode === 'fake') return fakeAds.showInterstitial();
    if (mode !== 'native' || !plugin) return;
    await plugin.showInterstitial();
  },
};

/** 真广告加载期间盖一层半透明提示，挡住游戏的点击；广告出现或结束时收起 */
function loadingVeil(): () => void {
  if (typeof document === 'undefined') return () => {};
  const el = document.createElement('div');
  el.textContent = '视频加载中……';
  el.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(10,10,14,.55);color:#e6e1d3;display:flex;align-items:center;justify-content:center;font:16px sans-serif;';
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) el.addEventListener(ev, (e) => e.stopPropagation());
  document.body.append(el);
  return () => el.remove();
}
