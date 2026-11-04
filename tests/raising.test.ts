import { describe, expect, it } from 'vitest';
import { ACTIVITIES, ENDINGS, EVENTS } from '../src/raising/content';
import { createState, deserialize, RaisingGame, TOTAL_MONTHS } from '../src/raising/game';
import { Rng } from '../src/core/rng';
import { resolveAdventure } from '../src/raising/adventure';
import { STAT_KEYS } from '../src/raising/types';

function chooseFree(game: RaisingGame): void {
  const event = EVENTS.find(e => e.id === game.state.pendingEvent);
  if (event) game.choose(event.choices.findIndex(c => (c.outcome.gold ?? 0) >= 0));
}
function plan(game: RaisingGame, ids = ['farm', 'literature', 'home']): void { ids.forEach((id, i) => expect(game.setPlan(i, id)).toBe(true)); }

describe('星庭物语核心规则', () => {
  it('探索交锋可重现，生命不越界，胜利奖励只结算一次', () => {
    const stats = createState().stats;
    const a = resolveAdventure(stats, 'forest', new Rng(123));
    expect(a).toEqual(resolveAdventure(stats, 'forest', new Rng(123)));
    for (const step of a.steps) { expect(step.playerHp).toBeGreaterThanOrEqual(0); expect(step.enemyHp).toBeGreaterThanOrEqual(0); }
    const g = new RaisingGame(createState()); g.state.stats.combat = 500;
    plan(g, ['forest', 'home', 'home']); const results = g.advance();
    expect(results[0]!.battle!.victory).toBe(true);
    // 每个区域有两种对手，奖励按实际遇到的那一种结算，且只结算一次
    expect([25, 28]).toContain(results[0]!.battle!.reward);
    expect(g.state.gold).toBe(600 + 20 + results[0]!.battle!.reward + 40);
  });
  it('顺序支付学费，资金不足时整月操作不改变任何状态', () => {
    const game = new RaisingGame(createState()); game.state.gold = 0;
    plan(game, ['literature', 'farm', 'home']);
    const before = JSON.stringify(game.state);
    expect(() => game.advance()).toThrow('学费不足'); expect(JSON.stringify(game.state)).toBe(before);
    plan(game); game.advance(); expect(game.state.gold).toBe(80);
  });
  it('存读档保留随机序列，结算完全一致', () => {
    const a = new RaisingGame(createState('测试', '妈妈', 12345));
    plan(a); a.advance(); chooseFree(a); plan(a);
    const b = new RaisingGame(deserialize(JSON.stringify(a.state))!);
    expect(a.advance()).toEqual(b.advance()); expect(a.state).toEqual(b.state);
  });
  it('压力过高降低收益，休息可以恢复', () => {
    const fresh = new RaisingGame(createState()); const tired = new RaisingGame(createState());
    fresh.state.stress = 0; tired.state.stress = 100;
    plan(fresh, ['literature', 'home', 'home']); plan(tired, ['literature', 'home', 'home']);
    const normal = fresh.advance()[0]!; const low = tired.advance()[0]!;
    expect(low.gains.intellect).toBeLessThan(normal.gains.intellect!); expect(tired.state.stress).toBeLessThan(75);
  });
  it('谈心与送礼不能在同月重复刷数值，物品只购买一次', () => {
    const g = new RaisingGame(createState()); g.talk(); const bond = g.state.bond; g.talk(); expect(g.state.bond).toBe(bond);
    g.gift(); expect(() => g.gift()).toThrow('已经送过'); g.buy('boots'); expect(() => g.buy('boots')).toThrow('已经拥有');
  });
  it('锁定的课程不可安排，事件必须回应才能继续', () => {
    const g = new RaisingGame(createState()); expect(g.setPlan(0, 'magic')).toBe(false);
    plan(g); g.advance(); expect(g.state.pendingEvent).not.toBeNull(); expect(g.setPlan(0, 'home')).toBe(false);
    chooseFree(g); expect(g.setPlan(0, 'home')).toBe(true);
  });
  it('完成整整 96 个月，生日、收获祭与最终结局都能发生', () => {
    const g = new RaisingGame(createState()); let festivals = 0; let birthdays = 0;
    for (let i = 0; i < TOTAL_MONTHS; i++) {
      chooseFree(g); g.talk(); plan(g); const results = g.advance();
      festivals += results.filter(r => r.title.includes('收获祭')).length;
      birthdays += results.filter(r => r.title.includes('生日快乐')).length;
    }
    expect(g.age).toBe(18); expect(g.state.month).toBe(96); expect(g.state.ended).toBe(true);
    expect(ENDINGS.some(e => e.id === g.state.ending)).toBe(true); expect(festivals).toBe(8); expect(birthdays).toBe(8);
    expect(g.setPlan(0, 'home')).toBe(false); expect(() => g.advance()).toThrow();
    expect(deserialize(JSON.stringify(g.state))).toEqual(g.state);
  });
  it('内容 ID 唯一，每个事件都有不花钱的出口，每个结局条件可满足', () => {
    for (const list of [ACTIVITIES, EVENTS, ENDINGS]) expect(new Set(list.map(i => i.id)).size).toBe(list.length);
    for (const event of EVENTS) expect(event.choices.some(c => (c.outcome.gold ?? 0) >= 0)).toBe(true);
    for (const ending of ENDINGS) {
      const g = new RaisingGame(createState());
      for (const k of STAT_KEYS) g.state.stats[k] = ending.requires[k] ?? 0;
      g.state.bond = ending.bond ?? 0;
      expect(g.resolveEnding().id).toBe(ending.id);
    }
  });
  it('拒绝损坏、越界和错误版本的存档', () => {
    expect(deserialize('not json')).toBeNull();
    for (const patch of [{ version: 2 }, { month: -1 }, { gold: -1 }, { bond: 101 }, { stats: {} }, { plan: ['fake', null, null] }, { pendingEvent: 'fake' }, { inventory: {} }, { month: 96, ended: false }]) expect(deserialize(JSON.stringify({ ...createState(), ...patch }))).toBeNull();
  });
  it('100 个随机玩家都能完成八年，过程中状态与存档始终合法', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = new RaisingGame(createState('艾莉', '家长', seed)); const rng = new Rng(seed + 100);
      for (let month = 0; month < TOTAL_MONTHS; month++) {
        chooseFree(g); if (rng.chance(.8)) g.talk();
        let budget = g.state.gold;
        for (let slot = 0; slot < 3; slot++) {
          const pool = ACTIVITIES.filter(a => g.available(a) && budget + a.gold >= 0);
          const a = pool[rng.int(0, pool.length - 1)]!; budget += a.gold; g.setPlan(slot, a.id);
        }
        g.advance();
        expect(g.state.gold).toBeGreaterThanOrEqual(0); expect(g.state.stress).toBeGreaterThanOrEqual(0); expect(g.state.stress).toBeLessThanOrEqual(100);
        expect(deserialize(JSON.stringify(g.state))).not.toBeNull();
      }
      expect(g.state.ended).toBe(true);
    }
  });
});
