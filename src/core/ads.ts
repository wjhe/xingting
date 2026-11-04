/**
 * 广告位与次数限制（见 docs/广告变现方案.md）。
 * 记录存在轮回存档里，按自然日清零。时间由调用方传入，这里不读系统时钟。
 */

export type AdSlot = 'revive' | 'undo_break' | 'rebirth_points' | 'talent_reroll' | 'save_herbs' | 'shop_refresh' | 'offline_double';

/**
 * 每个激励视频广告位每天最多看几次。
 * 残魂不灭、多换一批天赋只按"每世一次"限制（由游戏状态判断），这里不再设日上限
 */
export const AD_DAILY: Record<AdSlot, number> = {
  revive: Infinity,
  undo_break: 5,
  rebirth_points: 3,
  talent_reroll: Infinity,
  save_herbs: 5,
  shop_refresh: 5,
  offline_double: 2,
};

/** 转世结算看视频，本世轮回点 ×1.5 */
export const REBIRTH_POINTS_BONUS = 0.5;

/** 插屏：两次之间至少隔多久、每天最多几次；当天看过激励视频的，间隔翻倍、次数减半 */
const INTERSTITIAL_GAP_MS = 3 * 60_000;
const INTERSTITIAL_DAILY = 5;
/** 新玩家头 30 分钟一律不出插屏 */
const INTERSTITIAL_GRACE_MS = 30 * 60_000;

export interface AdLedger {
  /** 计数所属的自然日（本地时间 YYYY-MM-DD），换日清零 */
  day: string;
  /** 今天各激励视频广告位已看完的次数 */
  used: Partial<Record<AdSlot, number>>;
  /** 今天插屏的次数和上次展示的时刻 */
  interstitials: number;
  lastInterstitial: number;
  /** 第一次打开游戏的时刻 */
  firstSeen: number;
}

export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 取出今天的账本：没有就新建，跨日就清零（firstSeen 保留） */
export function ledger(holder: { ads?: AdLedger }, now: number): AdLedger {
  const today = dayKey(now);
  const old = holder.ads;
  if (!old) holder.ads = { day: today, used: {}, interstitials: 0, lastInterstitial: 0, firstSeen: now };
  else if (old.day !== today) holder.ads = { ...old, day: today, used: {}, interstitials: 0 };
  return holder.ads!;
}

/** 今天还能看几次（Infinity 表示不限） */
export function adsLeft(holder: { ads?: AdLedger }, slot: AdSlot, now: number): number {
  return Math.max(0, AD_DAILY[slot] - (ledger(holder, now).used[slot] ?? 0));
}

/** 看完一次激励视频后记账 */
export function recordAd(holder: { ads?: AdLedger }, slot: AdSlot, now: number): void {
  const l = ledger(holder, now);
  l.used[slot] = (l.used[slot] ?? 0) + 1;
}

/**
 * 转世结算页要不要放插屏。lives 为已经结束的世数：第一世结束时不出。
 */
export function interstitialDue(holder: { ads?: AdLedger }, lives: number, now: number): boolean {
  if (lives < 2) return false;
  const l = ledger(holder, now);
  if (now - l.firstSeen < INTERSTITIAL_GRACE_MS) return false;
  const watched = Object.values(l.used).some((n) => (n ?? 0) > 0);
  const gap = watched ? INTERSTITIAL_GAP_MS * 2 : INTERSTITIAL_GAP_MS;
  const cap = watched ? Math.floor(INTERSTITIAL_DAILY / 2) : INTERSTITIAL_DAILY;
  return l.interstitials < cap && now - l.lastInterstitial >= gap;
}

export function recordInterstitial(holder: { ads?: AdLedger }, now: number): void {
  const l = ledger(holder, now);
  l.interstitials++;
  l.lastInterstitial = now;
}
