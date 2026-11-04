import type Phaser from 'phaser';
import { adsLeft, interstitialDue, recordAd, recordInterstitial, type AdSlot } from '../core/ads';
import { audio } from './audio';
import { loadMeta, saveMeta } from './session';
import { FONT, TEXT_COLORS } from './theme';
import { getPlatform, makeText } from './ui';

/** 同一时间只放一条广告，防止连点 */
let playing = false;

/** 广告按钮的样子：文案带上剩余次数；次数用完或暂无广告时置灰 */
export interface AdButton {
  label: string;
  enabled: boolean;
}

/**
 * 激励视频按钮。what 写清楚看完得到什么，例如"残魂不灭（本世仅一次）"。
 * 有日上限的广告位在后面标出今天还剩几次。
 */
export function adButton(scene: Phaser.Scene, slot: AdSlot, what: string): AdButton {
  const platform = getPlatform(scene);
  const left = adsLeft(loadMeta(platform), slot, Date.now());
  if (left <= 0) return { label: `${what} · 今日次数已用完`, enabled: false };
  if (!platform.ads.rewardedReady(slot)) return { label: `${what} · 暂无可用视频`, enabled: false };
  const tail = Number.isFinite(left) ? ` · 今日剩 ${left} 次` : '';
  return { label: `▶ 看视频 · ${what}${tail}`, enabled: true };
}

/**
 * 播放一条激励视频。完整看完返回 true 并记账，奖励由调用方发放；
 * 中途关闭或没有广告返回 false，并通过 notify 告诉玩家原因。
 */
export async function watchRewarded(scene: Phaser.Scene, slot: AdSlot, notify: (text: string) => void): Promise<boolean> {
  if (playing) return false;
  const platform = getPlatform(scene);
  if (adsLeft(loadMeta(platform), slot, Date.now()) <= 0) {
    notify('今日次数已用完，明天再来');
    return false;
  }
  playing = true;
  audio.pauseAll();
  try {
    const result = await platform.ads.showRewarded(slot);
    if (result === 'rewarded') {
      // 重新读一遍再写：播放期间轮回存档可能被别处改过
      const meta = loadMeta(platform);
      recordAd(meta, slot, Date.now());
      saveMeta(platform, meta);
      return true;
    }
    notify(result === 'closed' ? '视频未看完，未获得奖励' : '暂无可用视频，请稍后再试');
    return false;
  } finally {
    audio.resumeAll();
    playing = false;
  }
}

/**
 * 转世结算页离开时调用：按规则（第一世不出、新玩家头半小时不出、间隔和日上限）决定是否放一条插屏。
 * 放不出来也照常继续。
 */
export async function maybeInterstitial(scene: Phaser.Scene): Promise<void> {
  if (playing) return;
  const platform = getPlatform(scene);
  const meta = loadMeta(platform);
  const now = Date.now();
  if (!interstitialDue(meta, meta.lives, now)) return saveMeta(platform, meta);
  recordInterstitial(meta, now);
  saveMeta(platform, meta);
  playing = true;
  audio.pauseAll();
  try {
    await platform.ads.showInterstitial();
  } finally {
    audio.resumeAll();
    playing = false;
  }
}

/** 打开游戏时记下首次游玩时间（插屏的新手保护期从这时算起） */
export function touchAdLedger(scene: Phaser.Scene): void {
  const platform = getPlatform(scene);
  const meta = loadMeta(platform);
  adsLeft(meta, 'revive', Date.now());
  saveMeta(platform, meta);
}

/** 没有浮动提示条的场景（开局、轮回殿）用：在指定位置浮出一行字，片刻后淡出 */
export function floatHint(scene: Phaser.Scene, x: number, y: number, text: string): void {
  const t = makeText(scene, x, y, text, { size: FONT.small, color: TEXT_COLORS.bad, bold: true }).setOrigin(0.5).setDepth(50);
  scene.tweens.add({ targets: t, y: y - 30, alpha: 0, delay: 1400, duration: 500, onComplete: () => t.destroy() });
}
