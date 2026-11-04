import type { Game } from './game';
import type { Effect, EventOption, Outcome } from './types';
import { getRealm, realmIndex } from './realms';
import type { Rng } from './rng';

export type BotAction = 'choose' | 'door' | 'explore' | 'travel' | 'break' | 'use' | 'buy' | 'sell' | 'brew' | 'none';

const MARKET = 'qingyun_market';
const HOME_BY_REALM = ['qingshi_village', 'luoxia_mountain', 'heifeng_valley', 'yunmeng_marsh', 'beiming_sea', 'kunlun_ruins', 'kunlun_ruins'];

/** 需要炼制的突破丹：材料齐了要去哪里炼 */
export const CRAFTS: Record<string, { region: string; ingredients: string[] }> = {
  huaying_dan: { region: 'qingyun_market', ingredients: ['jiao_nilin', 'lian_xin', 'roc_jingpo'] },
  huashen_dan: { region: 'beiming_sea', ingredients: ['kun_feather', 'xuanbing', 'haiyan_pearl'] },
  due_lotus: { region: 'kunlun_ruins', ingredients: ['busi_seed', 'kunlun_jade', 'tianlei_stone'] },
};

/**
 * 自动策略，用于数值模拟和冒烟测试。每次调用只做一个动作，返回动作类型。
 * smart = false：随手乱选事件选项的玩家；smart = true：会动脑的玩家（挑最划算的选项、
 * 打不过就不打、带伤先养、冲关前养满血）。难度按 smart 玩家校准。
 */
export function botStep(g: Game, rng: Rng, smart = false): BotAction {
  const s = g.state;
  const c = g.char;
  if (s.dead) return 'none';

  const ev = g.pendingEvent;
  if (ev) {
    // 攒钱买突破物品时，不选会花掉这笔钱的选项（普通玩家也会这样精打细算）
    const need = g.missingBreakItem;
    // 只对能在坊市买到的突破物品攒钱；天材地宝要靠材料炼，不受此限
    const reserve = need && g.item(need)?.type !== 'treasure' ? g.item(need)?.price ?? 0 : 0;
    const affordable = (i: number) => !reserve || c.stones - (ev.options[i].requires?.stones ?? 0) >= reserve || !ev.options[i].requires?.stones;
    let choices = ev.options.map((_, i) => i).filter((i) => !g.optionBlocked(ev.options[i]));
    if (choices.some(affordable)) choices = choices.filter(affordable);
    // 心魔关和炼丹这种要紧事，普通玩家也会挑最有把握的
    if (s.breaking) {
      const best = choices.reduce((a, b) => ((g.checkChance(ev.options[b]) ?? 0) > (g.checkChance(ev.options[a]) ?? 0) ? b : a));
      g.choose(best);
      return 'choose';
    }
    const craft = choices.find((i) => Object.keys(ev.options[i].requires?.items ?? {}).some((id) => g.item(id)?.type === 'treasure'));
    if (craft === undefined && smart) {
      const best = choices.reduce((a, b) => (optionValue(g, ev.options[b]) > optionValue(g, ev.options[a]) ? b : a));
      g.choose(best);
      return 'choose';
    }
    g.choose(craft ?? choices[rng.int(0, choices.length - 1)]);
    return 'choose';
  }

  // 会动脑的玩家：伤势重或气血低就先闭关养着，不带伤出门
  if (smart && !g.canAdvanceStage && (g.injury >= 0.25 || c.hp < g.combatStats.maxHp * 0.6)) {
    g.closedDoor(g.doorOptions[0]);
    return 'door';
  }

  const { maxHp } = g.combatStats;
  const realmI = realmIndex(c.realm);

  // 能用的丹药、更好的功法和装备直接用掉
  for (const id of Object.keys(s.inventory)) {
    const it = g.item(id);
    if (!it || (it.realm_min && realmIndex(it.realm_min) > realmI)) continue;
    if (g.canEquip(id) && gearScore(g, id) > gearScore(g, c.equip[it.type as 'weapon' | 'armor'])) {
      g.equip(id);
      return 'use';
    }
    if (!g.canUseItem(id)) continue;
    if (it.recipe) {
      if (!g.knowsRecipe(it.recipe)) return use(g, id);
      continue;
    }
    if (it.technique) {
      const better = (g.getTechnique(it.technique)?.multiplier ?? 0) > (g.technique?.multiplier ?? 1);
      if (better) return use(g, id);
      continue;
    }
    const kinds = new Set(it.use?.map((e) => e.type));
    if (kinds.has('hp') && c.hp < maxHp * 0.5) return use(g, id);
    if (kinds.has('cultivation') && !g.canBreakthrough) return use(g, id);
    if (kinds.has('lifespan')) return use(g, id);
    if (kinds.has('break_bonus') && g.canBreakthrough && !g.missingBreakItem && c.breakBonus === 0) return use(g, id);
  }

  if (g.atMarket) {
    // 卖材料
    const material = Object.keys(s.inventory).find((id) => g.item(id)?.type === 'material');
    if (material) {
      g.sell(material);
      return 'sell';
    }
    // 买东西：突破物品 > 冲关准备（瓶颈丹、辅助丹、护阵旗及其丹方）> 炼丹缺的药材 > 更好的功法 > 更好的装备 > 遁地符 > 回春丹
    const wish = [
      g.missingBreakItem,
      ...prepWishes(g),
      ...missingHerbs(g),
      betterBookInShop(g),
      ...betterGearInShop(g),
      s.inventory.escape_talisman ? null : 'escape_talisman',
      'huichun_dan',
    ].filter(Boolean) as string[];
    // 渡天劫前备一张避雷符
    if (getRealm(c.realm).tribulation && !Object.keys(s.inventory).some((id) => g.item(id)?.talisman?.kind === 'ward')) wish.unshift('bilei_fu');
    // 还没有突破物品时，给它留足灵石
    const breakItem = getRealm(c.realm).breakItems?.[0];
    const reserve = breakItem && !s.inventory[breakItem] ? breakReserve(g) : 0;
    for (const id of wish) {
      const price = g.item(id)?.price ?? Infinity;
      const budget = id === breakItem ? c.stones : c.stones - reserve;
      if (s.shop.stock[id] && budget >= price && (id !== 'huichun_dan' || c.stones > 200)) {
        if (id === 'huichun_dan' && (s.inventory[id] ?? 0) >= 2) continue;
        g.buy(id);
        return 'buy';
      }
    }
  }

  // 去哪里：平时待在适合境界的区域，有钱或有货要卖时去坊市；突破丹材料齐了就去炼
  let home = HOME_BY_REALM[realmI];
  const need = g.missingBreakItem;
  const craft = need ? CRAFTS[need] : undefined;
  if (craft && craft.ingredients.every((id) => s.inventory[id])) home = craft.region;
  const sellable = Object.keys(s.inventory).some((id) => g.item(id)?.type === 'material');
  let target = home;
  if (g.atMarket) {
    if (rng.chance(0.3) || home === MARKET) target = MARKET;
  } else if (
    (need && c.stones >= (g.item(need)?.price ?? Infinity)) ||
    // 卡在瓶颈、买得起瓶颈丹，就去坊市碰运气
    (g.stuck && !g.hasBottleneckPill && c.stones >= (g.item(g.bottleneckPill ?? '')?.price ?? Infinity)) ||
    // 买冲关准备也要先给突破物品留足钱，否则会在坊市和野外之间空跑
    prepWishes(g).some((id) => c.stones - breakReserve(g) >= (g.item(id)?.price ?? Infinity) && rng.chance(0.3)) ||
    (sellable && rng.chance(0.15)) ||
    (c.stones >= 300 && rng.chance(0.1))
  ) {
    target = MARKET;
  }
  if (s.region !== target) {
    g.travel(target);
    return 'travel';
  }

  if (c.hp < maxHp * 0.4) {
    g.closedDoor(g.doorOptions[0]);
    return 'door';
  }
  const brew = pickBrew(g, rng);
  if (brew) {
    g.brew(brew);
    return 'brew';
  }
  // 这一层修满了就去冲下一层
  if (g.canAdvanceStage) {
    g.breakthrough();
    return 'break';
  }
  const lifeLeft = 1 - g.ageYears / g.lifespanYears;
  // 卡瓶颈：有瓶颈丹就冲；没有时多出去找药材、攒钱，偶尔苦参或硬冲；寿元不多了就硬冲
  if (g.stuck) {
    if (g.hasBottleneckPill || lifeLeft < 0.2) {
      g.breakthrough();
      return 'break';
    }
    const r = rng.next();
    if (r < 0.5) {
      g.explore();
      return 'explore';
    }
    if (r < 0.75) g.closedDoor(g.doorOptions[0]);
    else g.breakthrough();
    return g.stuck ? 'door' : 'break';
  }
  const realm = getRealm(c.realm);
  // 冲关前先把气血养满
  if (g.canBreakthrough && !need && (realm.tribulation || realm.core) && c.hp < maxHp * 0.95) {
    g.closedDoor(g.doorOptions[0]);
    return 'door';
  }
  if (g.canBreakthrough) {
    // 普通玩家会先备好辅助丹再冲；寿元不多了就不等了
    const aidReady = !realm.core || !!s.inventory[realm.core.aid];
    // 会动脑的玩家：天劫预估太低就先去备避雷符、换护具，寿元还够就不急着冲
    const tribReady = !smart || !realm.tribulation || (g.breakPreview.tribulation?.survive ?? 1) >= 0.6 || lifeLeft < 0.3;
    if (!need && !tribReady && !g.atMarket && c.stones >= (g.item('bilei_fu')?.price ?? Infinity) && !hasWard(g)) {
      g.travel(MARKET);
      return 'travel';
    }
    if (!need && tribReady && (aidReady || lifeLeft < 0.35)) {
      g.breakthrough();
      return 'break';
    }
    g.explore();
    return 'explore';
  }
  if (rng.chance(0.55)) {
    const opts = g.doorOptions;
    g.closedDoor(opts[opts.length - 1]);
    return 'door';
  }
  g.explore();
  return 'explore';
}

/** 丹房：突破丹优先，其次瓶颈和心魔用的丹，再其次把成丹率不错的炉都开了 */
function pickBrew(g: Game, rng: Rng): string | null {
  const ready = g.knownRecipes.map((r) => g.recipeView(r)).filter((v) => v.ready);
  if (!ready.length) return null;
  const want = (product: string) => ready.find((v) => v.recipe.product === product);
  const need = g.missingBreakItem;
  const realm = getRealm(g.char.realm);
  const inv = g.state.inventory;
  const pill = g.bottleneckPill;
  const aid = realm.core?.aid;
  const first =
    (need && want(need)) ||
    (pill && !inv[pill] && want(pill)) ||
    (aid && !inv[aid] && g.char.stage === realm.stageNames.length - 1 && want(aid)) ||
    (realm.heartDemon && want('qingxin_dan'));
  if (first) return first.recipe.id;
  const ok = ready.filter((v) => v.rate >= 0.4);
  return ok.length && rng.chance(0.5) ? ok[rng.int(0, ok.length - 1)].recipe.id : null;
}

/** 还没有突破物品、且它能在坊市买到时，要给它留的灵石 */
function breakReserve(g: Game): number {
  // 卡在瓶颈时先顾眼前：买瓶颈丹不用给突破物品留钱
  if (g.stuck) return 0;
  const id = getRealm(g.char.realm).breakItems?.[0];
  const it = id && !g.state.inventory[id] ? g.item(id) : undefined;
  return it && it.type !== 'treasure' ? it.price : 0;
}

/** 冲关准备：瓶颈丹常备一枚；临近大境界时备辅助丹和护阵旗；对应的丹方也想要 */
function prepWishes(g: Game): string[] {
  const realm = getRealm(g.char.realm);
  const inv = g.state.inventory;
  const out: string[] = [];
  const pill = g.bottleneckPill;
  if (pill && !inv[pill]) out.push(pill);
  const nearTop = g.char.stage >= realm.stageNames.length - 2;
  if (realm.core && nearTop) {
    if (!inv[realm.core.aid]) out.push(realm.core.aid);
    if (!inv.huzhen_qi) out.push('huzhen_qi');
  }
  for (const product of [pill, realm.core?.aid]) {
    const book = product ? recipeBookFor(g, product) : null;
    if (book) out.push(book);
  }
  return out;
}

/** 还没学会的、能炼出某丹药的丹方物品 id */
function recipeBookFor(g: Game, product: string): string | null {
  const id = `danfang_${Object.entries(RECIPE_OF).find(([, p]) => p === product)?.[0] ?? ''}`;
  const it = g.item(id);
  return it?.recipe && !g.knowsRecipe(it.recipe) ? id : null;
}

/** 丹方 id → 产出（与 recipes.json 一致；只列冲关相关的） */
const RECIPE_OF: Record<string, string> = {
  pojing: 'pojing_dan', ningjin: 'ningjin_dan', lianying: 'lianying_dan', heshen: 'heshen_dan', huanxu: 'huanxu_dan',
  jiangchen: 'jiangchen_dan', yanghun: 'yanghun_dan', jiuqu: 'jiuqu_lingshen', xuantian: 'xuantian_guo',
};

/** 会炼当前缺的突破丹、瓶颈丹、辅助丹时，补齐药材 */
function missingHerbs(g: Game): string[] {
  const realm = getRealm(g.char.realm);
  const inv = g.state.inventory;
  const products = [g.missingBreakItem, g.bottleneckPill && !inv[g.bottleneckPill] ? g.bottleneckPill : null, realm.core && !inv[realm.core.aid] ? realm.core.aid : null];
  const out: string[] = [];
  for (const p of products) {
    const r = p ? g.knownRecipes.find((x) => x.product === p) : undefined;
    if (r) for (const [id, n] of Object.entries(r.ingredients)) if ((inv[id] ?? 0) < n) out.push(id);
  }
  return out;
}

/** 估一个选项值不值得选：成功率 × 收益 + 失败率 × 损失 */
function optionValue(g: Game, opt: EventOption): number {
  if (opt.battle) {
    const p = g.battleChance(opt.battle.enemy);
    // 战败还会受伤、可能被杀
    return p * outcomeValue(g, opt.battle.win) + (1 - p) * (outcomeValue(g, opt.battle.lose) - 6);
  }
  if (opt.check) {
    const p = g.checkChance(opt) ?? 0;
    return p * outcomeValue(g, opt.success) + (1 - p) * outcomeValue(g, opt.fail);
  }
  return outcomeValue(g, opt);
}

function outcomeValue(g: Game, o: Outcome | undefined): number {
  // 突破物品、它的原料价值极高；炼出突破物品时扣掉的原料不算损失
  const need = g.missingBreakItem;
  const parts = need ? CRAFTS[need]?.ingredients ?? [] : [];
  const makesNeed = !!need && (o?.effects ?? []).some((e) => e.type === 'item' && e.id === need && e.count > 0);
  let v = 0;
  for (const e of (o?.effects ?? []) as Effect[]) {
    switch (e.type) {
      case 'cultivation': v += e.value > 0 ? 3 : -3; break;
      case 'stone': v += e.value > 0 ? 2 : -1.5; break;
      case 'item':
        if (e.id === need) v += e.count > 0 ? 50 : -50;
        else if (parts.includes(e.id)) v += e.count > 0 ? 15 : makesNeed ? 0 : -15;
        else v += e.count > 0 ? 2.5 : -1;
        break;
      case 'attr': v += e.value > 0 ? 4 : -4; break;
      case 'lifespan': v += e.value > 0 ? 3 : -2 - Math.min(6, -e.value / 5); break;
      case 'hp': v += e.value > 0 ? 0.5 : -1; break;
      case 'break_bonus': v += e.value > 0 ? 3 : -3; break;
      case 'flag': case 'meta_flag': v += 0.5; break;
      default: break;
    }
  }
  return v + (o?.next ? 1 : 0);
}

function hasWard(g: Game): boolean {
  return Object.keys(g.state.inventory).some((id) => g.item(id)?.talisman?.kind === 'ward');
}

function use(g: Game, id: string): BotAction {
  g.useItem(id);
  return 'use';
}

function gearScore(g: Game, id: string | null): number {
  const st = id ? g.item(id)?.stats : undefined;
  return (st?.atk ?? 0) * 3 + (st?.def ?? 0) * 3 + (st?.hp ?? 0) * 0.5;
}

function betterGearInShop(g: Game): string[] {
  const ri = realmIndex(g.char.realm);
  return Object.keys(g.state.shop.stock).filter((id) => {
    const it = g.item(id);
    if (!it || !g.canEquip(id) || (it.realm_min && realmIndex(it.realm_min) > ri)) return false;
    // 装备不超过全部身家的一半
    if (it.price * 2 > g.char.stones) return false;
    return gearScore(g, id) > gearScore(g, g.char.equip[it.type as 'weapon' | 'armor']);
  });
}

function betterBookInShop(g: Game): string | null {
  const current = g.technique?.multiplier ?? 1;
  for (const id of Object.keys(g.state.shop.stock)) {
    const t = g.item(id)?.technique;
    if (t && (g.getTechnique(t)?.multiplier ?? 0) > current) return id;
  }
  return null;
}
