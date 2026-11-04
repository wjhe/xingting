import type { AdLedger } from './ads';
import type { Content, Game } from './game';
import { realmIndex } from './realms';
import type { Rng } from './rng';
import type { TalentDef } from './types';

export const META_VERSION = 1;
/** 开局可选的天赋数和最多可选数 */
export const TALENT_OFFER = 5;
export const TALENT_PICK = 3;
/** 每世免费换一批天赋的次数；用完后可以看激励视频再换一次 */
export const FREE_REROLLS = 1;

/** 跨世保存的数据，不随转世清空 */
export interface MetaState {
  version: number;
  /** 已经历的世数 */
  lives: number;
  /** 未花掉的轮回点 */
  points: number;
  /** 已解锁的付费天赋（cost 为 0 的天赋始终可用） */
  unlocked: string[];
  /** 图鉴：所有世里触发过的事件 */
  codex: string[];
  /** 达成过的结局 */
  endings: string[];
  /** 跨世剧情标记 */
  flags: Record<string, boolean>;
  /** 上一世的主修功法 */
  lastTechnique: string | null;
  /** 历代最高境界（境界序号） */
  bestRealm: number;
  /** 下一世开局的天赋候选。抽出后就固定下来，刷新页面或进出轮回殿都不会变 */
  offer: string[] | null;
  /** 下一世剩余的换一批次数 */
  rerolls: number;
  /** 下一世已经看视频多换过一批（每世一次）。旧存档没有此字段 */
  adReroll?: boolean;
  /** 广告次数账本。旧存档没有此字段 */
  ads?: AdLedger;
}

export function emptyMeta(): MetaState {
  return {
    version: META_VERSION, lives: 0, points: 0, unlocked: [], codex: [], endings: [], flags: {},
    lastTechnique: null, bestRealm: 0, offer: null, rerolls: FREE_REROLLS,
  };
}

export interface Settlement {
  /** [说明, 点数] */
  lines: [string, number][];
  total: number;
  newEvents: number;
  newEnding: boolean;
}

/** 境界轮回点：越往后越多 */
const REALM_POINTS = [0, 10, 30, 70, 120, 200, 320];

/**
 * 结算一世：计算轮回点，并把图鉴、结局、跨世标记写入 meta（会修改 meta）。
 */
export function settleLife(meta: MetaState, game: Game): Settlement {
  const s = game.state;
  const c = s.character;
  const ri = realmIndex(c.realm);
  const lines: [string, number][] = [];

  const stageBonus = ri >= 1 ? c.stage * ri : 0;
  lines.push([`修至${game.realmLabel}`, REALM_POINTS[ri] + stageBonus]);
  if (ri > meta.bestRealm) lines.push(['突破历代最高境界', 10 * (ri - meta.bestRealm)]);

  const newEvents = s.seenEvents.filter((id) => !meta.codex.includes(id));
  if (newEvents.length) lines.push([`新收录奇遇 ${newEvents.length} 个`, newEvents.length * 2]);

  const newEnding = !!s.ending && !meta.endings.includes(s.ending);
  if (s.ending) lines.push([newEnding ? '达成新结局' : '再次达成结局', newEnding ? 50 : 10]);

  const total = lines.reduce((sum, [, n]) => sum + n, 0);
  meta.lives = Math.max(meta.lives, s.life);
  meta.points += total;
  meta.codex.push(...newEvents);
  if (newEnding) meta.endings.push(s.ending!);
  Object.assign(meta.flags, s.metaFlags);
  meta.lastTechnique = c.technique;
  meta.bestRealm = Math.max(meta.bestRealm, ri);
  return { lines: lines.filter(([, n]) => n > 0), total, newEvents: newEvents.length, newEnding };
}

export function isTalentAvailable(meta: MetaState, t: TalentDef): boolean {
  return t.cost === 0 || meta.unlocked.includes(t.id);
}

/** 花轮回点解锁天赋，成功返回 true */
export function unlockTalent(meta: MetaState, t: TalentDef): boolean {
  if (isTalentAvailable(meta, t) || meta.points < t.cost) return false;
  meta.points -= t.cost;
  meta.unlocked.push(t.id);
  return true;
}

/** 取下一世的天赋候选：已经抽过就沿用，否则新抽一批并记入 meta */
export function currentOffer(meta: MetaState, content: Content, rng: Rng): TalentDef[] {
  if (!meta.offer) meta.offer = drawTalents(meta, content, rng).map((t) => t.id);
  return meta.offer.map((id) => content.talents.find((t) => t.id === id)).filter((t): t is TalentDef => !!t);
}

/** 消耗一次换一批的机会，没有次数时返回 false */
export function rerollOffer(meta: MetaState, content: Content, rng: Rng): boolean {
  if (meta.rerolls <= 0) return false;
  meta.rerolls--;
  meta.offer = drawTalents(meta, content, rng).map((t) => t.id);
  return true;
}

/** 开始新的一世后清空候选，下一世重新抽 */
export function consumeOffer(meta: MetaState): void {
  meta.offer = null;
  meta.rerolls = FREE_REROLLS;
  meta.adReroll = false;
}

/** 看完视频：多给一次换一批的机会（每世一次） */
export function grantAdReroll(meta: MetaState): boolean {
  if (meta.adReroll) return false;
  meta.adReroll = true;
  meta.rerolls++;
  return true;
}

/** 从可用天赋中随机抽取若干个供开局选择，花轮回点解锁的天赋出现概率更高 */
export function drawTalents(meta: MetaState, content: Content, rng: Rng, n = TALENT_OFFER): TalentDef[] {
  const pool = content.talents.filter((t) => isTalentAvailable(meta, t));
  const out: TalentDef[] = [];
  while (out.length < n && pool.length) {
    const pick = rng.pickWeighted(pool, (t) => (t.cost > 0 ? 3 : 1))!;
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}
