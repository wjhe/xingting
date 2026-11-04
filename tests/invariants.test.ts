import { describe, expect, it } from 'vitest';
import { botStep } from '../src/core/bot';
import { CHECK_DC_SHIFT, Game } from '../src/core/game';
import { emptyMeta, settleLife } from '../src/core/meta';
import { getRealm, REALMS, realmIndex } from '../src/core/realms';
import { REGIONS } from '../src/core/regions';
import { Rng } from '../src/core/rng';
import { CONTENT } from '../src/data';

/**
 * 随机操作 + 状态不变式检查：每一步之后，游戏状态都必须合法。
 * 随机策略会故意做"不合理"的操作（缺钱时买东西、有事件时闭关、死后继续行动等）。
 */
function randomStep(g: Game, rng: Rng): string {
  const inv = Object.keys(g.state.inventory);
  const anyItem = () => inv[rng.int(0, Math.max(0, inv.length - 1))] ?? 'juqi_dan';
  const ev = g.pendingEvent;
  const r = rng.int(0, 11);
  switch (r) {
    case 0: g.closedDoor(g.doorOptions[rng.int(0, 2)]); return 'door';
    case 1: g.explore(); return 'explore';
    case 2: g.travel(REGIONS[rng.int(0, REGIONS.length - 1)].id); return 'travel';
    case 3: g.breakthrough(); return 'break';
    case 4: g.useItem(anyItem()); return 'use';
    case 5: g.equip(anyItem()); return 'equip';
    case 6: g.buy(Object.keys(g.state.shop.stock)[0] ?? 'x'); return 'buy';
    case 7: g.sell(anyItem()); return 'sell';
    default:
      // 事件选项（包括被条件挡住的）
      g.choose(rng.int(0, ev ? ev.options.length : 3));
      return 'choose';
  }
}

function checkInvariants(g: Game, prevAge: number, where: string) {
  const s = g.state;
  const c = s.character;
  const ctx = `${where}（${g.realmLabel}，${g.ageYears} 岁）`;
  expect(c.stones, `${ctx} 灵石为负`).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(c.stones), ctx).toBe(true);
  expect(c.hp, `${ctx} 气血 < 1`).toBeGreaterThanOrEqual(1);
  expect(c.hp, `${ctx} 气血超上限`).toBeLessThanOrEqual(g.combatStats.maxHp);
  expect(c.cultivation, `${ctx} 修为为负`).toBeGreaterThanOrEqual(0);
  expect(c.cultivation, `${ctx} 修为超过本层上限`).toBeLessThanOrEqual(g.stageReq);
  expect(c.stage, ctx).toBeGreaterThanOrEqual(0);
  expect(c.stage, ctx).toBeLessThan(getRealm(c.realm).stageNames.length);
  expect(c.ageMonths, `${ctx} 时间倒流`).toBeGreaterThanOrEqual(prevAge);
  for (const [id, n] of Object.entries(s.inventory)) {
    expect(n, `${ctx} 物品 ${id} 数量`).toBeGreaterThan(0);
    expect(Number.isInteger(n), ctx).toBe(true);
  }
  for (const n of Object.values(s.shop.stock)) expect(n, `${ctx} 货架数量`).toBeGreaterThanOrEqual(0);
  for (const slot of ['weapon', 'armor'] as const) {
    const id = c.equip[slot];
    if (id) expect(CONTENT.items.find((i) => i.id === id)?.type, `${ctx} 装备槽 ${slot}`).toBe(slot);
  }
  if (s.pendingEventId) {
    expect(s.dead, `${ctx} 死后还有待选事件`).toBe(false);
    expect(g.pendingEvent, `${ctx} 待选事件不存在`).not.toBeNull();
  }
  if (!s.dead) expect(g.ageYears, `${ctx} 寿元已尽却没死`).toBeLessThan(g.lifespanYears);
  if (s.ending) {
    expect(s.dead, ctx).toBe(true);
    expect(c.realm, `${ctx} 未到元婴就达成结局`).toBe(REALMS[REALMS.length - 1].id);
  }
  // 检定日志和结果一致
  const last = s.log[s.log.length - 1];
  const m = /（(.+)检定 (\d+)\+(-?\d+)，(成功|失败)）/.exec(last?.text ?? '');
  if (m) expect(m[4] === '成功', `${ctx} 检定日志`).toBe(true);
}

describe('状态不变式（随机操作）', () => {
  it('300 世随机 + 自动操作，每一步状态都合法', () => {
    let steps = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rng = Rng.fromSeed(seed * 31);
      const meta = emptyMeta();
      const g = Game.newGame(
        { name: '测', gender: 'female', seed, talents: CONTENT.talents.slice(seed % 17, (seed % 17) + 3).map((t) => t.id) },
        CONTENT,
      );
      for (let i = 0; i < 3000 && !g.state.dead; i++) {
        const prev = g.char.ageMonths;
        const a = rng.chance(0.5) ? randomStep(g, rng) : botStep(g, rng);
        checkInvariants(g, prev, `seed ${seed} 第 ${i} 步 ${a}`);
        steps++;
      }
      // 结算不应报错，点数非负
      expect(settleLife(meta, g).total).toBeGreaterThanOrEqual(0);
    }
    expect(steps).toBeGreaterThan(10000);
  }, 120_000);

  it('检定概率提示与实际成功率一致', () => {
    const opts = CONTENT.events.flatMap((e) => e.options.filter((o) => o.check));
    const g = Game.newGame({ name: '测', gender: 'male', seed: 1 }, CONTENT);
    for (const opt of opts.slice(0, 10)) {
      const shown = g.checkChance(opt)!;
      const attr = g.char.attrs[opt.check!.attr];
      let ok = 0;
      // 平时检定统一加难 CHECK_DC_SHIFT
      for (let roll = 1; roll <= 10; roll++) if (roll + attr - CHECK_DC_SHIFT.value >= opt.check!.dc) ok++;
      expect(shown, opt.text).toBeCloseTo(ok / 10);
    }
  });

  it('突破成功率与实际一致（统计）', () => {
    let success = 0;
    const N = 4000;
    let rate = 0;
    for (let seed = 1; seed <= N; seed++) {
      const g = Game.newGame({ name: '测', gender: 'male', seed }, CONTENT);
      Object.assign(g.char, { realm: 'lianqi', stage: 8, cultivation: 900, attrs: { gengu: 5, wuxing: 5, shenshi: 5, jiyuan: 5, xinjing: 5 } });
      g.state.inventory.zhuji_dan = 1;
      rate = g.breakthroughRate;
      g.breakthrough();
      if (realmIndex(g.char.realm) === 2) success++;
    }
    expect(success / N).toBeGreaterThan(rate - 0.03);
    expect(success / N).toBeLessThan(rate + 0.03);
  });
});
