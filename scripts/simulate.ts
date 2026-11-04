// 批量模拟：N 个玩家各连续玩 K 世（带轮回点、天赋），统计每一世的境界分布和时长，用来调数值。
// 用法：npm run sim -- [玩家数] [世数] [smart] [ads]
//   smart：会动脑的模拟玩家（难度按它校准）；ads：每次都看激励视频的玩家（核对广告不会让难度崩掉）
import { AD_DAILY, REBIRTH_POINTS_BONUS, type AdSlot } from '../src/core/ads';
import { botStep, type BotAction } from '../src/core/bot';
import { Game } from '../src/core/game';
import { drawTalents, emptyMeta, settleLife, TALENT_PICK, unlockTalent, type MetaState } from '../src/core/meta';
import { REALMS, realmIndex } from '../src/core/realms';
import { Rng } from '../src/core/rng';
import { CONTENT } from '../src/data';

const PLAYERS = Number(process.argv[2] ?? 1000);
const LIVES = Number(process.argv[3] ?? 5);
const SMART = process.argv.includes('smart');
const ADS = process.argv.some((a) => a === 'ads' || a.startsWith('ads='));
/** 只开某些广告位（逗号分隔），用来分辨哪个广告位影响最大，例如 ads=undo_break,revive */
const ONLY = process.argv.find((a) => a.startsWith('ads='))?.slice(4).split(',') ?? null;
/** 看一条激励视频大约花多少秒 */
const AD_SECONDS = 30;
const MAX_STEPS = 20000;
/** 每类操作大约花玩家多少秒（含阅读） */
const SECONDS: Record<BotAction, number> = {
  choose: 10, explore: 8, door: 3, travel: 4, break: 6, use: 3, buy: 3, sell: 2, brew: 5, none: 0,
};

interface LifeResult {
  realm: number;
  killed: boolean;
  minutes: number;
  points: number;
  ending: string | null;
  talents: number;
}

/** 轮回殿策略：先解锁便宜的 */
function unlockAll(meta: MetaState) {
  const locked = CONTENT.talents.filter((t) => t.cost > 0 && !meta.unlocked.includes(t.id)).sort((a, b) => a.cost - b.cost);
  for (const t of locked) if (!unlockTalent(meta, t)) break;
}

/**
 * 每次都看广告的玩家：能挽回就挽回，返回花掉的秒数（没看返回 0）。
 * 日上限按"每世"近似：一世约半小时，现实中一天很难碰到上限，这样估算偏高、更保守
 */
function watchAds(g: Game, used: Partial<Record<AdSlot, number>>): number {
  const take = (slot: AdSlot, ok: boolean, apply: () => void) => {
    if (!ok || (ONLY && !ONLY.includes(slot)) || (used[slot] ?? 0) >= AD_DAILY[slot]) return false;
    used[slot] = (used[slot] ?? 0) + 1;
    apply();
    return true;
  };
  const need = g.missingBreakItem;
  const watched =
    take('revive', g.canRevive, () => g.revive()) ||
    take('undo_break', g.canUndoBreak, () => g.undoBreak()) ||
    take('save_herbs', g.canSaveHerbs, () => g.saveHerbs()) ||
    take('shop_refresh', g.canAdRefreshShop && !!need && !g.state.shop.stock[need], () => g.adRefreshShop());
  return watched ? AD_SECONDS : 0;
}

const byLife: LifeResult[][] = Array.from({ length: LIVES }, () => []);
let adsWatched = 0;
for (let p = 0; p < PLAYERS; p++) {
  const meta = emptyMeta();
  for (let life = 1; life <= LIVES; life++) {
    const seed = p * 1000 + life;
    const rng = Rng.fromSeed(seed * 7919);
    unlockAll(meta);
    // 开局选天赋：挑解锁花费最高的
    const offer = drawTalents(meta, CONTENT, rng).sort((a, b) => b.cost - a.cost).slice(0, TALENT_PICK);
    const g = Game.newGame(
      { name: '模拟', gender: 'male', seed, life, talents: offer.map((t) => t.id), metaFlags: meta.flags, lastTechnique: meta.lastTechnique },
      CONTENT,
    );
    let seconds = 0;
    const used: Partial<Record<AdSlot, number>> = {};
    for (let steps = 0; steps < MAX_STEPS; steps++) {
      const ad = ADS ? watchAds(g, used) : 0;
      if (ad) {
        seconds += ad;
        adsWatched++;
        continue;
      }
      if (g.state.dead) break;
      seconds += SECONDS[botStep(g, rng, SMART)];
    }
    const settle = settleLife(meta, g);
    // 结算时看视频，轮回点 ×1.5
    if (ADS && settle.total > 0 && (!ONLY || ONLY.includes('rebirth_points'))) {
      meta.points += Math.ceil(settle.total * REBIRTH_POINTS_BONUS);
      seconds += AD_SECONDS;
      adsWatched++;
    }
    byLife[life - 1].push({
      realm: realmIndex(g.char.realm),
      // 只算最终战死的（残魂不灭救回来的不算）
      killed: g.state.deathCause === 'battle',
      minutes: seconds / 60,
      points: settle.total,
      ending: g.state.ending,
      talents: offer.length,
    });
  }
}

const quantile = (arr: number[], q: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const pct = (n: number, total: number) => `${((n / total) * 100).toFixed(0)}%`.padStart(4);

const adNote = ADS ? `（每次都看广告，人均每世 ${(adsWatched / PLAYERS / LIVES).toFixed(1)} 条）` : '';
console.log(`\n模拟 ${PLAYERS} 个玩家 × ${LIVES} 世${adNote}\n`);
const head = ['世', ...REALMS.slice(1).map((r) => `达${r.name}`), '战死', '时长中位', '时长P90', '轮回点', '结局'];
console.log(head.join('\t'));
byLife.forEach((rs, i) => {
  const n = rs.length;
  const reach = REALMS.slice(1).map((_, r) => pct(rs.filter((x) => x.realm >= r + 1).length, n));
  const endings: Record<string, number> = {};
  for (const r of rs) if (r.ending) endings[r.ending] = (endings[r.ending] ?? 0) + 1;
  const endStr = Object.entries(endings).map(([k, v]) => `${k.replace('ending_', '')}:${v}`).join(' ') || '-';
  console.log([
    `第${i + 1}世`,
    ...reach,
    pct(rs.filter((x) => x.killed).length, n),
    `${quantile(rs.map((x) => x.minutes), 0.5).toFixed(0)}分`,
    `${quantile(rs.map((x) => x.minutes), 0.9).toFixed(0)}分`,
    (rs.reduce((s, x) => s + x.points, 0) / n).toFixed(0),
    endStr,
  ].join('\t'));
});
