import type { AdProvider, AdResult } from './types';

/** 模拟激励视频的时长：倒数完就算看完 */
const REWARDED_MS = 2000;
/** 模拟插屏多久后可以关闭、多久后自动关闭 */
const INTERSTITIAL_CLOSABLE_MS = 1000;
const INTERSTITIAL_AUTO_CLOSE_MS = 3000;
/** 开发测试用：localStorage 里把它设为 nofill，模拟"暂无可用广告" */
const NOFILL_KEY = 'wdcs_fake_ads';

/**
 * 网页版（开发测试）用的假广告：盖一层 DOM，倒数结束算看完，中途点关闭算没看完。
 * 接入真正的广告 SDK 之前，安卓 APK 也用这个（同一个 WebView）。
 */
export const fakeAds: AdProvider = {
  rewardedReady: () => !noFill(),
  showRewarded(slot) {
    if (noFill()) return Promise.resolve('unavailable');
    return new Promise<AdResult>((resolve) => {
      const { root, body, close } = sheet('模拟激励视频', `广告位：${slot}`);
      const count = line(body, '');
      const started = Date.now();
      const timer = setInterval(tick, 100);
      tick();
      function tick() {
        const left = Math.ceil((REWARDED_MS - (Date.now() - started)) / 1000);
        if (left > 0) return void (count.textContent = `${left} 秒后可获得奖励`);
        finish('rewarded');
      }
      function finish(r: AdResult) {
        clearInterval(timer);
        root.remove();
        resolve(r);
      }
      close.textContent = '关闭（放弃奖励）';
      close.onclick = () => finish('closed');
    });
  },
  showInterstitial() {
    if (noFill()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const { root, body, close } = sheet('模拟插屏广告', '正式版这里是一条插屏广告');
      line(body, '');
      close.style.visibility = 'hidden';
      const finish = () => {
        clearTimeout(auto);
        root.remove();
        resolve();
      };
      setTimeout(() => (close.style.visibility = 'visible'), INTERSTITIAL_CLOSABLE_MS);
      const auto = setTimeout(finish, INTERSTITIAL_AUTO_CLOSE_MS);
      close.textContent = '关闭';
      close.onclick = finish;
    });
  },
};

function noFill(): boolean {
  try {
    return localStorage.getItem(NOFILL_KEY) === 'nofill';
  } catch {
    return false;
  }
}

/** 全屏遮罩 + 居中卡片；遮罩挡住下面的游戏，不让点击漏过去 */
function sheet(title: string, sub: string) {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(10,10,14,.88);display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
  const card = document.createElement('div');
  card.style.cssText =
    'width:min(80vw,360px);padding:28px 22px;border-radius:12px;background:#22232c;color:#e6e1d3;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.5);';
  const body = document.createElement('div');
  line(body, title).style.cssText = 'font-size:20px;font-weight:bold;margin-bottom:8px;';
  line(body, sub).style.cssText = 'font-size:13px;color:#8a8577;margin-bottom:18px;';
  const close = document.createElement('button');
  close.style.cssText =
    'margin-top:20px;padding:8px 18px;border:1px solid #8a7a50;border-radius:6px;background:transparent;color:#c9a85c;font-size:14px;';
  card.append(body, close);
  root.append(card);
  // 阻止事件冒泡到游戏画布
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) root.addEventListener(ev, (e) => e.stopPropagation());
  document.body.append(root);
  return { root, body, close };
}

function line(parent: HTMLElement, text: string): HTMLDivElement {
  const d = document.createElement('div');
  d.textContent = text;
  d.style.fontSize = '16px';
  parent.append(d);
  return d;
}
