import { describe, expect, it } from 'vitest';
import { REALMS } from '../src/core/realms';
import { REGIONS } from '../src/core/regions';
import { ATTR_NAMES, type Effect, type EventDef, type Outcome } from '../src/core/types';
import { CONTENT } from '../src/data';
import prompts from '../art-src/prompts.json';

/** 内容校验：AI 批量生成的事件必须先过这一关 */
const { events, items, techniques, enemies, shop, talents, endings } = CONTENT;
const recipes = CONTENT.recipes ?? [];
const endingIds = new Set(endings.map((e) => e.id));
/** 由代码直接触发的事件 */
/** 由代码直接触发的事件：结局抉择、各境界的心魔关 */
const CODE_TRIGGERED = new Set([
  'ending_choice',
  ...REALMS.map((r) => r.heartDemon).filter((x): x is string => !!x),
  // 冲关时的外扰，由代码按前缀随机挑选
  ...events.filter((e) => e.id.startsWith('break_disturb_')).map((e) => e.id),
]);
const eventIds = new Set(events.map((e) => e.id));
const itemIds = new Set(items.map((i) => i.id));
const techIds = new Set(techniques.map((t) => t.id));
const enemyIds = new Set(enemies.map((e) => e.id));
const regionIds = new Set(REGIONS.map((r) => r.id));
const realmIds = new Set<string>(REALMS.map((r) => r.id));
const attrKeys = new Set(Object.keys(ATTR_NAMES));
const artIds = new Set(prompts.categories.vignettes.items.map((i) => i.id));

function outcomesOf(e: EventDef): Outcome[] {
  return e.options.flatMap((o) => {
    if (o.check) return [o.success ?? {}, o.fail ?? {}];
    if (o.battle) return [o.battle.win ?? {}, o.battle.lose ?? {}];
    return [o];
  });
}

function checkEffect(eff: Effect, where: string) {
  if (eff.type === 'item') expect(itemIds, `${where} 物品 ${eff.id}`).toContain(eff.id);
  if (eff.type === 'attr') expect(attrKeys, `${where} 属性 ${eff.key}`).toContain(eff.key);
  if (eff.type === 'hp') expect(Math.abs(eff.value), `${where} hp 是百分比`).toBeLessThanOrEqual(100);
  if (eff.type === 'ending') expect(endingIds, `${where} 结局 ${eff.id}`).toContain(eff.id);
}

/** 所有效果（事件结果、物品、天赋） */
function allEffects(): Effect[] {
  return [
    ...events.flatMap((e) => outcomesOf(e).flatMap((o) => o.effects ?? [])),
    ...items.flatMap((i) => i.use ?? []),
    ...talents.flatMap((t) => t.start ?? []),
  ];
}

describe('内容配置校验', () => {
  it('各类 id 不重复', () => {
    for (const list of [events, items, techniques, enemies, talents, endings]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
  });

  it.each(events.map((e) => [e.id, e] as const))('事件 %s 引用合法', (id, e) => {
    expect(e.options.length).toBeGreaterThan(0);
    for (const r of e.region ?? []) expect(regionIds, `区域 ${r}`).toContain(r);
    if (e.art) expect(artIds, `插图 ${e.art}`).toContain(e.art);
    const c = e.conditions;
    if (c?.realm_min) expect(realmIds).toContain(c.realm_min);
    if (c?.realm_max) expect(realmIds).toContain(c.realm_max);

    for (const o of e.options) {
      if (o.check) {
        expect(attrKeys, `检定属性 ${o.check.attr}`).toContain(o.check.attr);
        expect(o.success ?? o.fail, `${o.text} 有检定但没有结果`).toBeTruthy();
      }
      if (o.battle) expect(enemyIds, `敌人 ${o.battle.enemy}`).toContain(o.battle.enemy);
      expect(o.check && o.battle, `${o.text} 不能同时有检定和战斗`).toBeFalsy();
      for (const i of Object.keys(o.requires?.items ?? {})) expect(itemIds, `需求物品 ${i}`).toContain(i);
    }
    for (const out of outcomesOf(e)) {
      if (out.next) expect(eventIds, `后续事件 ${out.next}`).toContain(out.next);
      for (const eff of out.effects ?? []) checkEffect(eff, id);
    }
  });

  it('没有区域的事件必须能被其他事件串联到，否则永远不会触发', () => {
    const reachable = new Set(events.flatMap((e) => outcomesOf(e).map((o) => o.next).filter(Boolean)));
    for (const e of events.filter((e) => !e.region?.length && !CODE_TRIGGERED.has(e.id))) {
      expect(reachable, `孤立事件 ${e.id}`).toContain(e.id);
    }
  });

  it('每个事件至少有一个无条件的选项，否则条件都不满足时游戏会卡死', () => {
    for (const e of events) {
      expect(e.options.some((o) => !o.requires), `${e.id} 所有选项都有 requires`).toBe(true);
    }
  });

  it('可重复事件的物品奖励不能超出其最低境界的正常收益，防止刷钱', () => {
    // 各境界单次事件灵石收益的大致上限（见事件写作规范第三节），允许到 2 倍
    const CAP: Record<string, number> = { fanren: 40, lianqi: 150, zhuji: 1500, jindan: 8000, yuanying: 80000, huashen: 800000, dujie: 5000000 };
    const price = new Map(items.map((i) => [i.id, i]));
    for (const e of events.filter((x) => !x.once && x.region?.length)) {
      const realm = e.conditions?.realm_min ?? 'fanren';
      for (const o of e.options) {
        const cost = (o.requires?.stones ?? 0) + Object.entries(o.requires?.items ?? {}).reduce((n, [id, k]) => n + Math.floor((price.get(id)?.price ?? 0) / 2) * k, 0);
        const outs = o.check ? [o.success, o.fail] : o.battle ? [o.battle.win, o.battle.lose] : [o];
        for (const out of outs) {
          const value = (out?.effects ?? []).reduce((n, eff) => {
            if (eff.type !== 'item' || eff.count <= 0) return n;
            const it = price.get(eff.id);
            return it && it.type !== 'treasure' ? n + Math.floor(it.price / 2) * eff.count : n;
          }, 0);
          expect(value - cost, `${e.id}「${o.text}」可反复刷出价值 ${value} 的物品`).toBeLessThanOrEqual(CAP[realm] * 2);
        }
      }
    }
  });

  it('每个区域都有事件', () => {
    for (const r of regionIds) expect(events.some((e) => e.region?.includes(r)), r).toBe(true);
  });

  it('条件里用到的标记都有地方设置，否则事件永远不会出现', () => {
    const set = new Set(allEffects().flatMap((e) => (e.type === 'flag' || e.type === 'meta_flag' ? [e.key] : [])));
    for (const e of events) {
      const c = e.conditions;
      for (const f of [...(c?.flags ?? []), ...(c?.meta_flags ?? [])]) expect(set, `${e.id} 条件 ${f}`).toContain(f);
      for (const o of e.options) {
        for (const f of [...(o.requires?.flags ?? []), ...(o.requires?.meta_flags ?? [])]) expect(set, `${e.id} 选项条件 ${f}`).toContain(f);
      }
    }
  });

  it('每个结局都能达成', () => {
    const reached = new Set(allEffects().flatMap((e) => (e.type === 'ending' ? [e.id] : [])));
    for (const id of endingIds) expect(reached, id).toContain(id);
  });

  it('天赋引用合法', () => {
    for (const t of talents) {
      for (const eff of t.start ?? []) checkEffect(eff, t.id);
      expect(t.cost).toBeGreaterThanOrEqual(0);
    }
    expect(talents.filter((t) => t.cost === 0).length, '初始天赋至少要够抽 5 个').toBeGreaterThanOrEqual(5);
  });

  it('每件物品都有图标提示词', () => {
    const iconIds = new Set(prompts.categories.icons.items.map((i) => i.id));
    for (const it of items) expect(iconIds, `物品 ${it.id} 缺图标提示词`).toContain(it.icon ?? it.id);
  });

  it('物品引用合法', () => {
    for (const it of items) {
      if (it.technique) expect(techIds, `${it.id} 功法`).toContain(it.technique);
      if (it.realm_min) expect(realmIds).toContain(it.realm_min);
      for (const eff of it.use ?? []) checkEffect(eff, it.id);
    }
    for (const s of shop) expect(itemIds, `坊市 ${s.item}`).toContain(s.item);
    for (const r of REALMS) for (const id of r.breakItems ?? []) expect(itemIds, `突破物品 ${id}`).toContain(id);
  });

  it('丹方引用合法', () => {
    const recipeIds = new Set(recipes.map((r) => r.id));
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const r of recipes) {
      expect(byId.get(r.product)?.type, `${r.id} 产出 ${r.product} 应是丹药`).toBe('pill');
      for (const id of Object.keys(r.ingredients)) expect(itemIds, `${r.id} 药材 ${id}`).toContain(id);
      expect(r.level).toBeGreaterThanOrEqual(1);
      expect(r.level).toBeLessThanOrEqual(9);
      expect(r.yield[0]).toBeLessThanOrEqual(r.yield[1]);
    }
    for (const it of items) if (it.recipe) expect(recipeIds, `${it.id} 丹方`).toContain(it.recipe);
    for (const reg of REGIONS) for (const [id] of reg.herbs ?? []) expect(itemIds, `${reg.id} 灵草 ${id}`).toContain(id);
  });

  it('每张非基础丹方都能得到', () => {
    const fromShop = new Set(shop.map((s) => s.item));
    const fromEvents = new Set(allEffects().flatMap((e) => (e.type === 'item' ? [e.id] : [])));
    for (const r of recipes.filter((r) => !r.basic)) {
      const book = items.find((i) => i.recipe === r.id);
      expect(book, `${r.id} 缺丹方物品`).toBeDefined();
      expect(fromShop.has(book!.id) || fromEvents.has(book!.id), `${book!.id} 既不在坊市也不在事件奖励里`).toBe(true);
    }
  });

  it('炼丹不能变成稳赚的生意：买药材炼丹再卖，期望收益不超过成本的 1.6 倍', () => {
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const r of recipes) {
      const cost = Object.entries(r.ingredients).reduce((sum, [id, n]) => sum + byId.get(id)!.price * n, 0);
      // 按最理想的情况估：成丹率 95%，六成上品
      const yieldEv = 0.95 * (0.4 * r.yield[0] + 0.6 * r.yield[1]);
      const sell = (byId.get(r.product)!.price / 2) * yieldEv;
      expect(sell, `${r.id}：药材 ${cost}，期望卖出 ${Math.round(sell)}`).toBeLessThanOrEqual(cost * 1.6);
    }
  });
});
