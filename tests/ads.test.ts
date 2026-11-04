import { describe, expect, it } from 'vitest';
import { adsLeft, dayKey, interstitialDue, recordAd, recordInterstitial, type AdLedger } from '../src/core/ads';
import { Game, type Content } from '../src/core/game';
import { consumeOffer, emptyMeta, grantAdReroll, rerollOffer } from '../src/core/meta';
import { Rng } from '../src/core/rng';
import type { EventDef, ItemDef } from '../src/core/types';
import { CONTENT } from '../src/data';

const item = (id: string, extra: Partial<ItemDef> = {}): ItemDef => ({ id, name: id, desc: '', price: 100, type: 'material', ...extra });
const fight = (enemy: string): EventDef => ({
  id: 'f', title: '', region: ['qingshi_village'], text: '', options: [{ text: '打', battle: { enemy } }, { text: '走' }],
});
const C: Content = {
  events: [fight('killer')],
  items: [item('zhuji_dan', { type: 'pill' }), item('cao', { type: 'herb', price: 10 }), item('herb', { price: 20 })],
  techniques: [],
  enemies: [{ id: 'killer', name: '杀手', verb: '扑来', hp: 99999, atk: 9999, def: 999, spd: 99, killChance: 1, fixed: true }],
  shop: [{ item: 'herb', chance: 0.5, count: [1, 9] }],
  talents: [],
  endings: [],
  recipes: [{ id: 'risky', product: 'zhuji_dan', ingredients: { cao: 3 }, months: 2, level: 1, risk: 0.9, yield: [1, 1], basic: true }],
};
const make = (seed = 42) => Game.newGame({ name: '测试', gender: 'male', seed }, C);

/** 2026-10-28 中午（本地时间），避开跨日边界 */
const NOON = new Date(2026, 9, 28, 12).getTime();
const MIN = 60_000;

describe('广告次数', () => {
  it('按日上限计数，跨自然日清零', () => {
    const h: { ads?: AdLedger } = {};
    expect(adsLeft(h, 'offline_double', NOON)).toBe(2);
    recordAd(h, 'offline_double', NOON);
    recordAd(h, 'offline_double', NOON + MIN);
    expect(adsLeft(h, 'offline_double', NOON + 2 * MIN)).toBe(0);
    // 别的广告位不受影响
    expect(adsLeft(h, 'undo_break', NOON)).toBe(5);
    // 第二天清零
    expect(adsLeft(h, 'offline_double', NOON + 24 * 60 * MIN)).toBe(2);
    expect(dayKey(NOON)).toBe('2026-10-28');
  });

  it('残魂不灭、多换一批天赋不设日上限（按每世一次限制）', () => {
    const h: { ads?: AdLedger } = {};
    for (let i = 0; i < 20; i++) recordAd(h, 'revive', NOON);
    expect(adsLeft(h, 'revive', NOON)).toBe(Infinity);
  });

  it('插屏：第一世不出，新玩家半小时内不出，之后按间隔和日上限', () => {
    const h: { ads?: AdLedger } = {};
    const t0 = NOON - 6 * 60 * MIN;
    adsLeft(h, 'revive', t0); // 首次打开
    expect(interstitialDue(h, 1, NOON)).toBe(false);
    expect(interstitialDue(h, 2, t0 + 10 * MIN)).toBe(false);
    expect(interstitialDue(h, 2, NOON)).toBe(true);
    recordInterstitial(h, NOON);
    expect(interstitialDue(h, 3, NOON + 2 * MIN)).toBe(false);
    expect(interstitialDue(h, 3, NOON + 3 * MIN)).toBe(true);
    for (let i = 1; i < 5; i++) recordInterstitial(h, NOON + i * 10 * MIN);
    expect(interstitialDue(h, 9, NOON + 120 * MIN)).toBe(false);
  });

  it('当天看过激励视频的，插屏间隔翻倍、次数减半', () => {
    const h: { ads?: AdLedger } = {};
    adsLeft(h, 'revive', NOON - 6 * 60 * MIN);
    recordAd(h, 'undo_break', NOON);
    recordInterstitial(h, NOON);
    expect(interstitialDue(h, 3, NOON + 4 * MIN)).toBe(false);
    expect(interstitialDue(h, 3, NOON + 6 * MIN)).toBe(true);
    recordInterstitial(h, NOON + 6 * MIN);
    expect(interstitialDue(h, 3, NOON + 60 * MIN)).toBe(false);
  });
});

describe('激励视频的奖励', () => {
  it('残魂不灭：战死后保住性命，修为减半、折寿、重伤，本世仅一次', () => {
    const g = make();
    Object.assign(g.char, { realm: 'lianqi', stage: 3, cultivation: 300 });
    g.explore();
    g.choose(0);
    expect(g.state.dead).toBe(true);
    expect(g.canRevive).toBe(true);
    const years = g.reviveYears;
    const lifespan = g.lifespanYears;
    g.revive();
    expect(g.state.dead).toBe(false);
    expect(g.char.cultivation).toBe(150);
    expect(g.lifespanYears).toBe(lifespan - years);
    expect(g.char.injury).toBeGreaterThan(0);
    expect(g.drainSignals().some((s) => s.type === 'revive')).toBe(true);
    // 再死一次就不能再救
    g.explore();
    g.choose(0);
    expect(g.state.dead).toBe(true);
    expect(g.canRevive).toBe(false);
  });

  it('寿终坐化不能残魂不灭；阳寿不够折的也不行', () => {
    const g = make();
    g.state.character.ageMonths = 79 * 12 + 11;
    g.closedDoor(1);
    expect(g.state.dead).toBe(true);
    expect(g.canRevive).toBe(false);

    const old = make();
    old.state.character.ageMonths = (old.lifespanYears - 2) * 12;
    old.explore();
    old.choose(0);
    expect(old.state.dead).toBe(true);
    expect(old.canRevive).toBe(false);
  });

  it('逆天改命：找回突破失败损失的修为，寿元不退；再做别的事就作废', () => {
    let tested = 0;
    for (let seed = 1; seed <= 60 && tested < 5; seed++) {
      const g = make(seed);
      Object.assign(g.char, { realm: 'lianqi', stage: 8, cultivation: 900 });
      g.state.inventory.zhuji_dan = 1;
      g.breakthrough();
      if (g.char.realm === 'zhuji' || g.state.dead) continue;
      tested++;
      expect(g.char.cultivation).toBeLessThan(900);
      expect(g.canUndoBreak).toBe(true);
      const penalty = g.char.lifespanPenalty;
      expect(penalty).toBeGreaterThan(0);
      g.undoBreak();
      expect(g.char.cultivation).toBe(900);
      expect(g.char.lifespanPenalty).toBe(penalty);
      expect(g.canUndoBreak).toBe(false);
      // 筑基丹不退：找回的是损失，不是重来一次
      expect(g.state.inventory.zhuji_dan).toBeUndefined();
    }
    expect(tested).toBe(5);

    for (let seed = 1; seed <= 60; seed++) {
      const g = make(seed);
      Object.assign(g.char, { realm: 'lianqi', stage: 8, cultivation: 900 });
      g.state.inventory.zhuji_dan = 1;
      g.breakthrough();
      if (g.char.realm === 'zhuji' || g.state.dead) continue;
      g.closedDoor(1);
      expect(g.canUndoBreak).toBe(false);
      return;
    }
  });

  it('因突破反噬折寿而死，逆天改命救不回（寿元不退），也不能残魂不灭', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = make(seed);
      Object.assign(g.char, { realm: 'lianqi', stage: 8, cultivation: 900 });
      // 只剩不到一年阳寿：失败折寿必死
      g.state.character.ageMonths = g.lifespanYears * 12 - 3;
      g.state.inventory.zhuji_dan = 1;
      g.breakthrough();
      if (!g.state.dead) continue;
      expect(g.state.deathCause).toBe('backlash');
      expect(g.canRevive).toBe(false);
      expect(g.canUndoBreak).toBe(false);
      return;
    }
    throw new Error('没有遇到突破反噬致死的种子');
  });

  it('保住药材：炸炉后找回药材，时间流逝后作废', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const g = make(seed);
      Object.assign(g.char, { realm: 'lianqi' });
      g.state.inventory.cao = 3;
      g.brew('risky');
      if (!g.canSaveHerbs) continue;
      g.saveHerbs();
      expect(g.state.inventory.cao).toBe(3);
      expect(g.canSaveHerbs).toBe(false);
      return;
    }
    throw new Error('没有遇到炸炉的种子');
  });

  it('刷新坊市：每个游戏年一次', () => {
    const g = make();
    g.travel('qingyun_market');
    expect(g.canAdRefreshShop).toBe(true);
    g.adRefreshShop();
    expect(g.canAdRefreshShop).toBe(false);
    g.closedDoor(12);
    expect(g.canAdRefreshShop).toBe(true);
  });

  it('灵气储备翻倍：最多到平时上限的两倍', () => {
    const g = make();
    const now = Date.now();
    g.touchClock(now);
    const got = g.syncClock(now + 120 * MIN);
    expect(got).toBeCloseTo(120, 0);
    expect(g.addOfflineReserve(got)).toBeCloseTo(120, 0);
    expect(g.offlineReserve).toBeCloseTo(240, 0);
    g.addOfflineReserve(10_000);
    expect(g.offlineReserve).toBe(960);
  });

  it('多换一批天赋：每世一次，开始新的一世后恢复', () => {
    const meta = emptyMeta();
    const rng = Rng.fromSeed(1);
    expect(rerollOffer(meta, CONTENT, rng)).toBe(true);
    expect(rerollOffer(meta, CONTENT, rng)).toBe(false);
    expect(grantAdReroll(meta)).toBe(true);
    expect(rerollOffer(meta, CONTENT, rng)).toBe(true);
    expect(grantAdReroll(meta)).toBe(false);
    consumeOffer(meta);
    expect(grantAdReroll(meta)).toBe(true);
  });

  it('旧存档没有新字段也能正常判断', () => {
    const g = make();
    delete g.state.setback;
    delete g.state.revived;
    delete g.state.deathCause;
    delete g.state.adShopYear;
    expect(g.canRevive).toBe(false);
    expect(g.canUndoBreak).toBe(false);
    expect(g.canSaveHerbs).toBe(false);
  });
});
