import { describe, expect, it } from 'vitest';
import { botStep } from '../src/core/bot';
import { runBattle, type Fighter } from '../src/core/combat';
import { Game, type Content } from '../src/core/game';
import { consumeOffer, currentOffer, drawTalents, emptyMeta, rerollOffer, settleLife, unlockTalent } from '../src/core/meta';
import { Rng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save';
import type { EventDef, ItemDef } from '../src/core/types';
import { CONTENT } from '../src/data';

const item = (id: string, extra: Partial<ItemDef> = {}): ItemDef => ({ id, name: id, desc: '', price: 100, type: 'material', ...extra });

const BASE: Content = {
  events: [],
  items: [
    item('zhuji_dan', { type: 'pill' }),
    item('herb', { price: 20 }),
    item('pill_cult', { type: 'pill', use: [{ type: 'cultivation', value: 50 }] }),
    item('pill_heal', { type: 'pill', use: [{ type: 'hp', value: 100 }] }),
    item('pill_break', { type: 'pill', use: [{ type: 'break_bonus', value: 0.2 }] }),
    item('book', { type: 'book', technique: 'tech', realm_min: 'lianqi' }),
    item('sword', { type: 'weapon', stats: { atk: 10 } }),
    item('sword2', { type: 'weapon', stats: { atk: 20 } }),
    item('fire', { type: 'talisman', talisman: { kind: 'damage', value: 99999 } }),
    item('escape', { type: 'talisman', talisman: { kind: 'escape', value: 1 } }),
    item('ward', { type: 'talisman', talisman: { kind: 'ward', value: 99 } }),
    item('pojing', { type: 'pill', use: [{ type: 'unstuck' }] }),
    item('huaying_dan', { type: 'treasure' }),
    item('jiedan_lingguo', { type: 'treasure' }),
    item('gem', { type: 'treasure', price: 99999 }),
  ],
  techniques: [{ id: 'tech', name: '测试功', desc: '', multiplier: 2, spell: { name: '测试术', cost: 10, power: 2 } }],
  enemies: [
    { id: 'weak', name: '弱敌', verb: '扑来', hp: 1, atk: 1, def: 0, spd: 1, fixed: true },
    { id: 'strong', name: '强敌', verb: '扑来', hp: 99999, atk: 9999, def: 999, spd: 99, fixed: true },
    { id: 'killer', name: '杀手', verb: '扑来', hp: 99999, atk: 9999, def: 999, spd: 99, killChance: 1, fixed: true },
  ],
  shop: [{ item: 'herb', chance: 1, count: [5, 5] }],
  talents: [
    { id: 'rich', name: '富', desc: '', cost: 0, start: [{ type: 'stone', value: 100 }] },
    { id: 'fast', name: '快', desc: '', cost: 10, mods: { gain: 2, lifespan: 10, breakBonus: 0.1 } },
    { id: 'tian', name: '天', desc: '', cost: 50, mods: { rootSet: 'tian' } },
    { id: 'memory', name: '宿慧', desc: '', cost: 0, mods: { inheritTechnique: true } },
  ],
  endings: [{ id: 'ending_ascend', name: '飞升', text: '' }, { id: 'ending_b', name: 'B', text: '' }],
};

function makeGame(events: EventDef[] = [], seed = 42): Game {
  return Game.newGame({ name: '测试', gender: 'male', seed }, { ...BASE, events });
}

function lianqiTop(g: Game) {
  Object.assign(g.state.character, { realm: 'lianqi', stage: 8, cultivation: 900 });
}

describe('修炼与境界', () => {
  it('凡人修为圆满后自动引气入体', () => {
    const g = makeGame();
    g.state.character.root = 'si'; // ×1.0，每月 5 修为
    g.closedDoor(6);
    expect(g.state.character.realm).toBe('lianqi');
    expect(g.state.character.stage).toBe(0);
  });

  it('小层修满就封顶，不自动晋升；亲手冲关才晋升，修为归零', () => {
    const g = makeGame();
    Object.assign(g.state.character, { realm: 'lianqi', stage: 0, cultivation: 0, root: 'si' });
    g.closedDoor(35); // 350 修为，一层只要 100
    expect(g.char.stage).toBe(0);
    expect(g.char.cultivation).toBe(100);
    expect(g.canAdvanceStage).toBe(true);
    // 炼气卡住的概率不高，多冲几次总能上去
    for (let k = 0; k < 20 && g.char.stage === 0; k++) g.breakthrough();
    expect(g.char.stage).toBe(1);
    expect(g.char.cultivation).toBe(0);
    const sig = g.drainSignals().filter((x) => x.type === 'stage');
    expect(sig.length).toBeGreaterThan(0);
  });

  it('大境界瓶颈处修为封顶，需要主动突破', () => {
    const g = makeGame();
    Object.assign(g.state.character, { realm: 'lianqi', stage: 8, cultivation: 0, root: 'si' });
    g.closedDoor(120);
    expect(g.state.character.realm).toBe('lianqi');
    expect(g.state.character.cultivation).toBe(900);
    expect(g.canBreakthrough).toBe(true);
  });

  it('没有筑基丹不能突破，也不消耗时间', () => {
    const g = makeGame();
    lianqiTop(g);
    const age = g.state.character.ageMonths;
    g.breakthrough();
    expect(g.state.character.realm).toBe('lianqi');
    expect(g.state.character.ageMonths).toBe(age);
  });

  it('突破会消耗筑基丹，成功则进入筑基，失败则损失修为和寿元', () => {
    let successes = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = makeGame([], seed);
      lianqiTop(g);
      g.state.inventory.zhuji_dan = 1;
      g.breakthrough();
      expect(g.state.inventory.zhuji_dan).toBeUndefined();
      if (g.state.character.realm === 'zhuji') {
        successes++;
        expect(g.lifespanYears).toBe(220);
        expect(g.state.character.hp).toBe(g.combatStats.maxHp);
      } else {
        expect(g.state.character.cultivation).toBe(630);
        expect(g.state.character.lifespanPenalty).toBeGreaterThanOrEqual(3);
      }
    }
    // 成功率在 41%～55% 之间（基础 40% + 属性加成）
    expect(successes).toBeGreaterThan(65);
    expect(successes).toBeLessThan(130);
  });

  it('寿元耗尽即坐化，之后不能再行动', () => {
    const g = makeGame();
    g.state.character.ageMonths = 79 * 12 + 11;
    g.closedDoor(1);
    expect(g.state.dead).toBe(true);
    const age = g.state.character.ageMonths;
    g.closedDoor(12);
    expect(g.state.character.ageMonths).toBe(age);
  });

  it('渡劫圆满飞升：没有抉择事件时直接进入默认结局', () => {
    const g = makeGame();
    Object.assign(g.state.character, { realm: 'dujie', stage: 3, cultivation: 1e12 });
    g.state.inventory.ward = 1; // 减伤 99%，必定撑过天劫
    g.breakthrough();
    expect(g.state.dead).toBe(true);
    expect(g.state.ending).toBe('ending_ascend');
  });

  it('飞升后触发结局抉择，选项可以要求跨世标记', () => {
    const choice: EventDef = {
      id: 'ending_choice', title: '', text: '',
      options: [
        { text: 'a', effects: [{ type: 'ending', id: 'ending_ascend' }] },
        { text: 'b', requires: { meta_flags: ['truth'], hint: '不知真相' }, effects: [{ type: 'ending', id: 'ending_b' }] },
      ],
    };
    const g = makeGame([choice]);
    Object.assign(g.state.character, { realm: 'dujie', stage: 3, cultivation: 1e12 });
    g.state.inventory.ward = 1; // 减伤 99%，必定撑过天劫
    g.breakthrough();
    expect(g.state.dead).toBe(false);
    expect(g.pendingEvent?.id).toBe('ending_choice');
    expect(g.optionBlocked(choice.options[1])).toBe('不知真相');
    g.state.metaFlags.truth = true;
    g.choose(1);
    expect(g.state.ending).toBe('ending_b');
    expect(g.state.dead).toBe(true);
  });
});

describe('战斗', () => {
  const fightEvent = (enemy: string): EventDef => ({
    id: 'f', title: '', region: ['qingshi_village'], text: '',
    options: [
      { text: '打', battle: { enemy, win: { effects: [{ type: 'stone', value: 7 }] }, lose: { effects: [{ type: 'lifespan', value: -1 }] } } },
      { text: '走' },
    ],
  });
  const fighter = (o: Partial<Fighter>): Fighter => ({ name: 'x', verb: '打', hp: 100, maxHp: 100, mp: 0, atk: 10, def: 0, spd: 10, crit: 0, ...o });

  it('速度快的先手，打倒对手即结束', () => {
    const fast = fighter({ name: '快', spd: 20, atk: 1000 });
    const slow = fighter({ name: '慢', spd: 5, atk: 1000 });
    const steps: string[] = [];
    const r = runBattle(fast, slow, Rng.fromSeed(1), () => {}, (st) => steps.push(st.by));
    expect(r).toBe('win');
    expect(steps).toEqual(['p']);
    expect(slow.hp).toBe(0);
  });

  it('有灵力时优先施展法术，灵力不够就普通攻击', () => {
    const p = fighter({ mp: 15, atk: 10, spell: { name: '术', cost: 10, power: 3 } });
    const e = fighter({ hp: 1e6, maxHp: 1e6, atk: 0 });
    const spells: (string | undefined)[] = [];
    runBattle(p, e, Rng.fromSeed(2), () => {}, (st) => st.by === 'p' && spells.push(st.spell));
    expect(spells[0]).toBe('术');
    expect(spells[1]).toBeUndefined();
    expect(p.mp).toBe(5);
  });

  it('打不完的战斗按平局收场', () => {
    const r = runBattle(fighter({ atk: 1, hp: 1e6, maxHp: 1e6 }), fighter({ atk: 1, hp: 1e6, maxHp: 1e6 }), Rng.fromSeed(3), () => {});
    expect(r).toBe('draw');
  });

  it('胜利发放奖励；战败重伤逃脱并执行战败结果', () => {
    const win = makeGame([fightEvent('weak')]);
    win.explore();
    win.choose(0);
    expect(win.char.stones).toBe(57);
    const lose = makeGame([fightEvent('strong')]);
    lose.explore();
    lose.choose(0);
    expect(lose.char.hp).toBe(1);
    expect(lose.char.lifespanPenalty).toBe(1);
    expect(lose.state.dead).toBe(false);
  });

  it('强敌有击杀概率', () => {
    const g = makeGame([fightEvent('killer')]);
    g.explore();
    g.choose(0);
    expect(g.state.dead).toBe(true);
    expect(g.state.log.some((l) => l.text.includes('陨落于杀手之手'))).toBe(true);
  });

  it('伤害符开战即祭出，遁地符在战败时保命', () => {
    const g = makeGame([fightEvent('strong')]);
    g.state.inventory.fire = 1;
    g.explore();
    g.choose(0);
    expect(g.state.inventory.fire).toBeUndefined();
    const sig = g.drainSignals().find((x) => x.type === 'battle');
    expect(sig?.type === 'battle' && sig.replay.opening[0]?.kind).toBe('damage');

    const k = makeGame([fightEvent('killer')]);
    k.state.inventory.escape = 1;
    k.explore();
    k.choose(0);
    expect(k.state.dead).toBe(false);
    expect(k.state.inventory.escape).toBeUndefined();
    expect(k.char.lifespanPenalty).toBe(0); // 遁走不执行战败结果
  });

  it('战斗回放记录每次出手，供界面逐回合演出', () => {
    const g = makeGame([fightEvent('weak')]);
    g.explore();
    g.choose(0);
    const sig = g.drainSignals().find((x) => x.type === 'battle');
    expect(sig?.type).toBe('battle');
    if (sig?.type !== 'battle') return;
    expect(sig.replay.steps.length).toBeGreaterThan(0);
    expect(sig.replay.result).toBe('win');
    expect(sig.replay.steps[sig.replay.steps.length - 1].eHp).toBe(0);
  });
});

describe('突破三道关', () => {
  const heart = (id: string): EventDef => ({
    id, title: '心魔', text: '',
    options: [
      { text: '心境', check: { attr: 'xinjing', dc: 10 }, success: { effects: [{ type: 'realm_up' }] }, fail: { effects: [{ type: 'qi_deviation' }] } },
    ],
  });
  const jindanTop = (g: Game) => Object.assign(g.state.character, { realm: 'jindan', stage: 3, cultivation: 1e9 });

  it('缺材料不能突破，也不消耗时间', () => {
    const g = makeGame([heart('xinmo_yuanying')]);
    jindanTop(g);
    const age = g.char.ageMonths;
    expect(g.missingBreakItems).toEqual(['huaying_dan']);
    g.breakthrough();
    expect(g.char.realm).toBe('jindan');
    expect(g.char.ageMonths).toBe(age);
  });

  it('撑过天劫后进入心魔关；心魔检定成功即踏入元婴', () => {
    const g = makeGame([heart('xinmo_yuanying')]);
    jindanTop(g);
    g.state.inventory.huaying_dan = 1;
    g.state.inventory.ward = 1; // 减伤 99%，必定撑过天劫
    g.char.attrs.xinjing = 100;
    g.breakthrough();
    expect(g.state.inventory.huaying_dan).toBeUndefined();
    expect(g.state.breaking).toBe('yuanying');
    expect(g.pendingEvent?.id).toBe('xinmo_yuanying');
    const sig = g.drainSignals().find((x) => x.type === 'battle');
    expect(sig && sig.type === 'battle' && sig.replay.tribulation && sig.replay.result).toBe('win');
    g.choose(0);
    expect(g.char.realm).toBe('yuanying');
    expect(g.state.breaking).toBeNull();
  });

  it('心魔失败走火入魔：跌落一个小境界、折寿，材料已耗', () => {
    const g = makeGame([heart('xinmo_yuanying')]);
    jindanTop(g);
    g.state.inventory.huaying_dan = 1;
    g.state.inventory.ward = 1; // 减伤 99%，必定撑过天劫
    g.char.attrs.xinjing = -100;
    g.breakthrough();
    g.choose(0);
    expect(g.char.realm).toBe('jindan');
    expect(g.char.stage).toBe(2);
    expect(g.char.lifespanPenalty).toBeGreaterThanOrEqual(40);
    expect(g.state.inventory.huaying_dan).toBeUndefined();
    expect(g.state.breaking).toBeNull();
  });

  it('撑不过天劫：重伤或殒命，不会进入心魔关', () => {
    let failed = 0;
    let killed = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const g = makeGame([heart('xinmo_yuanying')], seed);
      jindanTop(g);
      g.state.inventory.huaying_dan = 1;
      g.char.attrs.gengu = 0; // 气血薄，天劫凶险
      g.char.breakBonus = 2; // 冲关必过，只看天劫
      g.breakthrough();
      const trib = g.drainSignals().find((x) => x.type === 'battle' && x.replay.tribulation);
      if (trib?.type === 'battle' && trib.replay.result === 'lose') {
        failed++;
        expect(g.state.breaking ?? null).toBeNull();
        expect(g.char.realm).toBe('jindan');
        if (g.state.dead) killed++;
      }
    }
    expect(failed).toBeGreaterThan(5);
    // 被劈倒后有 35% 当场殒命
    expect(killed).toBeGreaterThan(0);
    expect(killed).toBeLessThan(failed);
  });

  it('避雷符、护具让天劫预估成功率上升', () => {
    const g = makeGame([heart('xinmo_yuanying')]);
    jindanTop(g);
    g.char.hp = g.combatStats.maxHp;
    const bare = g.breakPreview.tribulation!.survive;
    g.state.inventory.ward = 1;
    expect(g.breakPreview.tribulation!.survive).toBeGreaterThanOrEqual(bare);
    expect(g.breakPreview.tribulation!.survive).toBeGreaterThan(0.9);
  });

  it('破障丹降低心魔检定难度，突破后清零', () => {
    const g = makeGame([heart('xinmo_jindan')]);
    Object.assign(g.state.character, { realm: 'zhuji', stage: 3, cultivation: 1e9 });
    g.char.attrs.xinjing = 5;
    g.state.inventory.jiedan_lingguo = 1;
    const before = g.breakPreview.heart!;
    g.char.breakBonus = 0.3;
    expect(g.breakPreview.heart!).toBeCloseTo(Math.min(1, before + 0.3));
    g.breakthrough();
    g.choose(0);
    expect(g.char.breakBonus).toBe(0);
  });
});

describe('小境界瓶颈', () => {
  it('冲击小境界可能撞上瓶颈；卡住后修为封顶', () => {
    let stuckOnce = false;
    let upOnce = false;
    for (let seed = 1; seed <= 40; seed++) {
      const g = makeGame([], seed);
      Object.assign(g.state.character, { realm: 'zhuji', stage: 0, cultivation: 0, root: 'si' });
      g.closedDoor(120);
      g.breakthrough();
      if (g.stuck) {
        stuckOnce = true;
        expect(g.char.stage).toBe(0);
        expect(g.char.cultivation).toBe(g.stageReq);
        g.closedDoor(120);
        expect(g.char.cultivation).toBe(g.stageReq);
      } else {
        upOnce = true;
        expect(g.char.stage).toBe(1);
      }
    }
    expect(stuckOnce).toBe(true);
    expect(upOnce).toBe(true);
  });

  it('有瓶颈丹的境界，"后期 → 圆满"必卡', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = makeGame([], seed);
      Object.assign(g.state.character, { realm: 'zhuji', stage: 2, cultivation: 1e9 });
      expect(g.nextStageMustStick).toBe(true);
      g.breakthrough();
      expect(g.stuck).toBe(true);
    }
  });

  it('瓶颈概率随境界递增', () => {
    const order = ['zhuji', 'jindan', 'yuanying', 'huashen', 'dujie'] as const;
    const odds = order.map((r) => {
      let stuck = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const g = makeGame([], seed);
        Object.assign(g.state.character, { realm: r, stage: 0, cultivation: 1e12 });
        g.breakthrough();
        if (g.stuck) stuck++;
      }
      return stuck;
    });
    for (let i = 1; i < odds.length; i++) expect(odds[i]).toBeGreaterThan(odds[i - 1]);
  });

  it('事件、丹药给的修为按当前这一层折算，单次最多半层；同一种丹越吃越没用', () => {
    const g = makeGame();
    Object.assign(g.state.character, { realm: 'lianqi', stage: 8, cultivation: 0 });
    g.state.inventory.pill_cult = 3;
    g.useItem('pill_cult'); // 50 / 炼气初层 100 = 半层，炼气九层每层 900 → 450
    expect(g.char.cultivation).toBe(450);
    g.useItem('pill_cult'); // 丹毒，减半
    expect(g.char.cultivation).toBe(450 + 225);
  });

  it('卡住时闭关只增加冲关把握；冲击瓶颈成功后进入下一小境界', () => {
    const g = makeGame();
    Object.assign(g.state.character, { realm: 'zhuji', stage: 0, cultivation: 5000, stuck: true, stuckTries: 0 });
    const r0 = g.bottleneckRate;
    g.closedDoor(12);
    expect(g.char.cultivation).toBe(5000);
    expect(g.bottleneckRate).toBeGreaterThan(r0);
    g.char.stuckTries = 10; // 成功率 95%
    for (let k = 0; k < 10 && g.stuck; k++) g.breakthrough();
    expect(g.stuck).toBe(false);
    expect(g.char.stage).toBe(1);
  });

  it('破境丹直接打破瓶颈；没卡住时不会被浪费', () => {
    const g = makeGame();
    Object.assign(g.state.character, { realm: 'zhuji', stage: 0, cultivation: 0 });
    g.state.inventory.pojing = 1;
    g.useItem('pojing');
    expect(g.state.inventory.pojing).toBe(1);
    Object.assign(g.state.character, { cultivation: 5000, stuck: true });
    g.useItem('pojing');
    expect(g.state.inventory.pojing).toBeUndefined();
    expect(g.char.stage).toBe(1);
  });
});

describe('物品与坊市', () => {
  it('天材地宝不能出售', () => {
    const g = makeGame();
    g.state.region = 'qingyun_market';
    g.state.inventory.gem = 1;
    expect(g.canSell('gem')).toBe(false);
    g.sell('gem');
    expect(g.state.inventory.gem).toBe(1);
  });

  it('服用丹药生效并消耗', () => {
    const g = makeGame();
    g.state.inventory.pill_cult = 2;
    const before = g.char.cultivation;
    g.useItem('pill_cult');
    expect(g.state.inventory.pill_cult).toBe(1);
    expect(g.char.cultivation).toBeGreaterThan(before);
  });

  it('破障丹加成在下次突破后清零', () => {
    const g = makeGame();
    lianqiTop(g);
    const base = g.breakthroughRate;
    g.state.inventory.pill_break = 1;
    g.useItem('pill_break');
    expect(g.breakthroughRate).toBeCloseTo(base + 0.2);
    g.state.inventory.zhuji_dan = 1;
    g.breakthrough();
    expect(g.char.breakBonus).toBe(0);
  });

  it('参悟功法需要境界，改修后修炼速度变化', () => {
    const g = makeGame();
    g.state.inventory.book = 1;
    g.useItem('book');
    expect(g.char.technique).toBeNull(); // 凡人用不了
    g.char.realm = 'lianqi';
    const before = g.gainPerMonth;
    g.useItem('book');
    expect(g.char.technique).toBe('tech');
    expect(g.gainPerMonth).toBeCloseTo(before * 2);
    expect(g.state.inventory.book).toBeUndefined();
  });

  it('装备提升属性，换装时旧装备回到行囊', () => {
    const g = makeGame();
    const atk = g.combatStats.atk;
    g.state.inventory.sword = 1;
    g.state.inventory.sword2 = 1;
    g.equip('sword');
    expect(g.combatStats.atk).toBe(atk + 10);
    g.equip('sword2');
    expect(g.combatStats.atk).toBe(atk + 20);
    expect(g.state.inventory.sword).toBe(1);
    expect(g.state.inventory.sword2).toBeUndefined();
  });

  it('只能在坊市买卖，卖出整组得半价', () => {
    const g = makeGame();
    g.char.stones = 1000;
    g.buy('herb');
    expect(g.state.inventory.herb).toBeUndefined();
    g.state.region = 'qingyun_market';
    g.buy('herb');
    g.buy('herb');
    expect(g.state.inventory.herb).toBe(2);
    expect(g.state.shop.stock.herb).toBe(3);
    expect(g.char.stones).toBe(960);
    g.sell('herb');
    expect(g.state.inventory.herb).toBeUndefined();
    expect(g.char.stones).toBe(980);
  });

  it('跨年时坊市货架刷新', () => {
    const g = makeGame();
    g.state.region = 'qingyun_market';
    g.char.stones = 1000;
    for (let i = 0; i < 5; i++) g.buy('herb');
    expect(g.state.shop.stock.herb).toBe(0);
    g.closedDoor(12);
    expect(g.state.shop.stock.herb).toBe(5);
  });
});

describe('天赋与轮回', () => {
  const newWith = (talents: string[], extra = {}) =>
    Game.newGame({ name: '甲', gender: 'male', seed: 5, talents, ...extra }, BASE);

  it('开局效果和持续加成生效', () => {
    const plain = newWith([]);
    const g = newWith(['rich', 'fast', 'tian']);
    expect(g.char.stones).toBe(plain.char.stones + 100);
    expect(g.char.root).toBe('tian');
    expect(g.lifespanYears).toBe(plain.lifespanYears + 10);
    expect(g.gainPerMonth).toBeCloseTo(5 * 2 * 2);
  });

  it('宿慧：开局获得上一世功法的典籍', () => {
    const g = newWith(['memory'], { lastTechnique: 'tech' });
    expect(g.state.inventory.book).toBe(1);
  });

  it('跨世标记带入新的一世，并可作为事件条件', () => {
    const ev: EventDef = { id: 'x', title: 'X', region: ['qingshi_village'], conditions: { meta_flags: ['k'] }, text: '', options: [{ text: 'ok' }] };
    const g1 = Game.newGame({ name: '甲', gender: 'male', seed: 1 }, { ...BASE, events: [ev] });
    g1.explore();
    expect(g1.pendingEvent).toBeNull();
    const g2 = Game.newGame({ name: '甲', gender: 'male', seed: 1, metaFlags: { k: true } }, { ...BASE, events: [ev] });
    g2.explore();
    expect(g2.pendingEvent?.id).toBe('x');
  });

  it('结算：按境界、新图鉴、新结局给轮回点，并写入轮回存档', () => {
    const meta = emptyMeta();
    const g = makeGame();
    Object.assign(g.state.character, { realm: 'zhuji', stage: 2, technique: 'tech' });
    g.state.seenEvents.push('a', 'b');
    g.state.metaFlags.k = true;
    g.state.ending = 'ending_b';
    const s = settleLife(meta, g);
    // 筑基 30 + 小层 2×2 + 首次突破到筑基 20 + 新图鉴 2×2 + 新结局 50
    expect(s.total).toBe(30 + 4 + 20 + 4 + 50);
    expect(meta.points).toBe(s.total);
    expect(meta.codex).toEqual(['a', 'b']);
    expect(meta.endings).toEqual(['ending_b']);
    expect(meta.flags.k).toBe(true);
    expect(meta.lastTechnique).toBe('tech');
    // 再结算一次同样的内容，图鉴和结局不再重复给分
    expect(settleLife(meta, g).total).toBe(30 + 4 + 10);
  });

  it('解锁天赋扣轮回点，未解锁的不会出现在开局选项里', () => {
    const meta = emptyMeta();
    const fast = BASE.talents[1];
    const offered = () => drawTalents(meta, BASE, Rng.fromSeed(1), 10).map((t) => t.id);
    expect(offered()).not.toContain('fast');
    expect(unlockTalent(meta, fast)).toBe(false);
    meta.points = 15;
    expect(unlockTalent(meta, fast)).toBe(true);
    expect(meta.points).toBe(5);
    expect(offered()).toContain('fast');
  });
});

describe('审查修复回归', () => {
  it('瓶颈处多余的修为会提示散失，日志不虚报', () => {
    const g = makeGame();
    lianqiTop(g);
    g.state.inventory.pill_cult = 1;
    g.useItem('pill_cult');
    expect(g.char.cultivation).toBe(900);
    expect(g.state.log.some((l) => l.text.includes('50 点无处容纳'))).toBe(true);
  });

  it('修为扣减按实际值记日志', () => {
    const g = makeGame([{ id: 'x', title: '', region: ['qingshi_village'], text: '', options: [{ text: 'a', effects: [{ type: 'cultivation', value: -50 }] }] }]);
    g.char.cultivation = 10;
    g.explore();
    g.choose(0);
    expect(g.state.log.some((l) => l.text === '修为 -10')).toBe(true);
  });

  it('失去没有的物品不记日志', () => {
    const g = makeGame([{ id: 'x', title: '', region: ['qingshi_village'], text: '', options: [{ text: 'a', effects: [{ type: 'item', id: 'herb', count: -3 }] }] }]);
    g.explore();
    g.choose(0);
    expect(g.state.log.some((l) => l.text.includes('失去'))).toBe(false);
  });

  it('开局天赋候选固定，只有消耗次数才能换一批', () => {
    const meta = emptyMeta();
    const first = currentOffer(meta, CONTENT, Rng.fromSeed(1)).map((t) => t.id);
    // 换个随机种子再取（相当于刷新页面），候选不变
    expect(currentOffer(meta, CONTENT, Rng.fromSeed(99)).map((t) => t.id)).toEqual(first);
    expect(rerollOffer(meta, CONTENT, Rng.fromSeed(2))).toBe(true);
    expect(rerollOffer(meta, CONTENT, Rng.fromSeed(3))).toBe(false);
    consumeOffer(meta);
    expect(meta.offer).toBeNull();
    expect(meta.rerolls).toBe(1);
  });
});

describe('离线收益与演出信号', () => {
  const MIN = 60_000;
  it('离线 5 分钟以上积累储备，上限 8 小时；闭关时消耗储备，修为加成五成', () => {
    const g = makeGame();
    Object.assign(g.char, { realm: 'lianqi', root: 'si' });
    g.syncClock(1_000_000);
    expect(g.syncClock(1_000_000 + 3 * MIN)).toBe(0); // 3 分钟不算
    expect(g.syncClock(1_000_000 + 3 * MIN + 90 * MIN)).toBeCloseTo(90);
    g.syncClock(1_000_000 + 100 * 60 * MIN);
    expect(g.offlineReserve).toBe(480);
    g.closedDoor(6); // 每月 10，6 个月 60，加成五成 90
    expect(g.state.log.some((l) => l.text === '修为 +90')).toBe(true);
    expect(g.offlineReserve).toBe(420);
  });

  it('储备不足 60 分钟时按比例加成', () => {
    const g = makeGame();
    Object.assign(g.char, { realm: 'lianqi', root: 'si' });
    g.state.offline!.reserve = 30;
    g.closedDoor(6);
    expect(g.state.log.some((l) => l.text === '修为 +75')).toBe(true); // 储备半额，加成 25%
    expect(g.offlineReserve).toBe(0);
  });

  it('突破失败折寿致死时，死因写明反噬', () => {
    const g = makeGame();
    lianqiTop(g);
    g.state.inventory.zhuji_dan = 1;
    g.char.attrs.wuxing = -100; // 必定失败
    g.char.ageMonths = 119 * 12;
    g.breakthrough();
    expect(g.state.dead).toBe(true);
    expect(g.state.log.some((l) => l.text.startsWith('灵力反噬，寿元尽折'))).toBe(true);
  });

  it('操作产生演出信号，取走后清空', () => {
    const g = makeGame();
    g.char.root = 'si';
    g.closedDoor(12); // 引气入体
    expect(g.drainSignals()).toEqual([
      { type: 'door', months: 12, gain: 60, ageFrom: 16, ageTo: 17, bottleneck: false },
      { type: 'realm', id: 'lianqi', label: '炼气' },
    ]);
    expect(g.drainSignals()).toEqual([]);
    g.travel('luoxia_mountain');
    expect(g.drainSignals()[0]).toMatchObject({ type: 'travel', region: '落霞山' });
  });

  it('旧存档没有离线字段也能读取', () => {
    const g = makeGame();
    delete g.state.offline;
    const g2 = new Game(g.state, BASE);
    expect(g2.offlineReserve).toBe(0);
  });
});

describe('存档', () => {
  it('存档读档后随机序列可以接着走', () => {
    const a = Game.newGame({ name: '甲', gender: 'female', seed: 7 }, CONTENT);
    const b = new Game(deserialize(serialize(a.state))!, CONTENT);
    const ra = Rng.fromSeed(3);
    const rb = Rng.fromSeed(3);
    for (let i = 0; i < 50; i++) {
      botStep(a, ra);
      botStep(b, rb);
    }
    expect(b.state).toEqual(a.state);
  });

  it('损坏或版本不符的存档返回 null', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 2 }))).toBeNull();
    expect(deserialize(null)).toBeNull();
  });
});

describe('自动游玩', () => {
  it('用正式内容玩完 30 世，不报错、不卡死', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = Game.newGame({ name: '甲', gender: 'male', seed }, CONTENT);
      const rng = Rng.fromSeed(seed);
      let steps = 0;
      while (!g.state.dead && steps < 20000) {
        botStep(g, rng);
        steps++;
      }
      expect(g.state.dead).toBe(true);
    }
  });
});

describe('丹房炼丹', () => {
  const ALCH: Content = {
    ...BASE,
    items: [
      ...BASE.items,
      item('cao', { type: 'herb', price: 10 }),
      item('fang_hard', { type: 'recipe', recipe: 'hard', price: 100 }),
    ],
    recipes: [
      { id: 'easy', product: 'pill_heal', ingredients: { cao: 2 }, months: 2, level: 1, risk: 0, yield: [2, 3], basic: true },
      { id: 'hard', product: 'pill_cult', ingredients: { cao: 1 }, months: 1, level: 1, risk: 0, yield: [1, 1] },
      { id: 'master', product: 'pill_cult', ingredients: { cao: 1 }, months: 1, level: 9, risk: 0, yield: [1, 1], basic: true },
    ],
  };
  const make = (seed = 7) => {
    const g = Game.newGame({ name: '测试', gender: 'male', seed }, ALCH);
    Object.assign(g.state.character, { realm: 'lianqi' });
    return g;
  };

  it('开局只会基础丹方，研读丹方后才会新的', () => {
    const g = make();
    expect(g.knownRecipes.map((r) => r.id)).toEqual(['easy', 'master']);
    g.state.inventory.fang_hard = 1;
    g.useItem('fang_hard');
    expect(g.knowsRecipe('hard')).toBe(true);
    expect(g.state.inventory.fang_hard).toBeUndefined();
    // 已经会了再研读，不消耗
    g.state.inventory.fang_hard = 1;
    g.useItem('fang_hard');
    expect(g.state.inventory.fang_hard).toBe(1);
  });

  it('开炉消耗药材和时间，成丹或炸炉都长丹道经验', () => {
    const g = make();
    g.state.inventory.cao = 2;
    const age = g.state.character.ageMonths;
    g.brew('easy');
    expect(g.state.inventory.cao).toBeUndefined();
    expect(g.state.character.ageMonths).toBe(age + 2);
    expect(g.danExp).toBeGreaterThan(0);
    const s = g.drainSignals().find((x) => x.type === 'alchemy');
    expect(s).toBeDefined();
    if (s?.type === 'alchemy') expect(g.state.inventory.pill_heal ?? 0).toBe(s.count);
  });

  it('药材不够、品级不够都开不了炉', () => {
    const g = make();
    g.state.inventory.cao = 1;
    g.brew('easy');
    expect(g.state.inventory.cao).toBe(1);
    g.brew('master');
    expect(g.state.inventory.cao).toBe(1);
    expect(g.recipeView(g.knownRecipes.find((r) => r.id === 'master')!).levelOk).toBe(false);
  });

  it('成丹率随神识和品级上升，并有上下限', () => {
    const g = make();
    const r = g.knownRecipes[0];
    g.state.character.attrs.shenshi = 1;
    const low = g.alchemyRate(r);
    g.state.character.attrs.shenshi = 15;
    const high = g.alchemyRate(r);
    expect(high).toBeGreaterThan(low);
    g.state.character.danExp = 999;
    expect(g.danLevel).toBe(9);
    expect(g.alchemyRate(r)).toBeLessThanOrEqual(0.95);
    g.state.character.attrs.shenshi = 0;
    g.state.character.danExp = 0;
    expect(g.alchemyRate({ ...r, risk: 2 })).toBeGreaterThanOrEqual(0.05);
  });

  it('炼许多炉后，产出数量在配方范围内，且有成有败', () => {
    const g = make(3);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < 40; i++) {
      g.state.inventory.cao = 2;
      g.state.character.hp = 9999;
      g.brew('easy');
      for (const s of g.drainSignals()) {
        if (s.type !== 'alchemy') continue;
        if (s.count === 0) fail++;
        else {
          ok++;
          expect([2, 3]).toContain(s.count);
        }
      }
      if (g.state.dead) break;
    }
    expect(ok).toBeGreaterThan(0);
    expect(fail).toBeGreaterThan(0);
  });

  it('旧存档没有丹房字段也能读', () => {
    const g = make();
    delete g.state.recipes;
    delete g.state.character.danExp;
    const g2 = new Game(deserialize(serialize(g.state))!, ALCH);
    expect(g2.danLevel).toBe(1);
    expect(g2.knownRecipes.length).toBe(2);
  });
});

describe('突破线索', () => {
  const intro: EventDef = { id: 'market_danwang_intro', title: '丹王', text: '', options: [{ text: '收下' }] };

  it('踏入新境界时日志给出引子', () => {
    const g = makeGame();
    Object.assign(g.state.character, { realm: 'zhuji', stage: 3 });
    g.state.flags = {};
    (g as unknown as { advanceRealm(): void }).advanceRealm();
    expect(g.state.character.realm).toBe('jindan');
    expect(g.state.log.some((e) => e.text.includes('丹王'))).toBe(true);
  });

  it('没听过丹王的话，不知道化婴丹的原料出处；听过之后知道，且转世后也记得', () => {
    const g = Game.newGame({ name: '测试', gender: 'male', seed: 1 }, { ...BASE, events: [intro] });
    Object.assign(g.state.character, { realm: 'jindan' });
    expect(g.breakGuide?.known).toBe(false);
    (g as unknown as { trigger(e: EventDef): void }).trigger(intro);
    expect(g.breakGuide?.known).toBe(true);
    expect(g.breakGuide?.parts.map((p) => p.where)).toEqual(['云梦泽', '云梦泽', '云梦泽']);
    // 下一世带着跨世标记开局
    const g2 = Game.newGame({ name: '测试', gender: 'male', seed: 2, metaFlags: g.state.metaFlags }, BASE);
    Object.assign(g2.state.character, { realm: 'jindan' });
    expect(g2.breakGuide?.known).toBe(true);
  });

  it('缺突破物品时，日志说明去哪找', () => {
    const g = makeGame();
    lianqiTop(g);
    g.breakthrough();
    expect(g.state.log.some((e) => e.kind === 'system' && e.text.includes('青云坊市'))).toBe(true);
  });
});

describe('物品用不了时事先说明', () => {
  it('境界不够、已在修习、丹方已会、未卡瓶颈都给出原因；能用时为 null', () => {
    const g = makeGame();
    expect(g.useBlock('book')?.label).toBe('炼气可用');
    Object.assign(g.state.character, { realm: 'lianqi' });
    expect(g.useBlock('book')).toBeNull();
    g.state.inventory.book = 1;
    g.useItem('book');
    expect(g.useBlock('book')?.label).toBe('已在修习');
    expect(g.useBlock('pojing')?.label).toBe('瓶颈时用');
    g.state.character.stuck = true;
    expect(g.useBlock('pojing')).toBeNull();
    expect(g.useBlock('pill_cult')).toBeNull();
    expect(g.useBlock('herb')).toBeNull();
  });
});

describe('事件去重', () => {
  it('最近遇过的事件权重大降，连续历练很少遇到同一个', () => {
    const mk = (id: string): EventDef => ({ id, title: id, region: ['qingshi_village'], weight: 10, text: '', options: [{ text: '好' }] });
    const g = makeGame('abcdefghij'.split('').map(mk), 5);
    g.state.character.hp = 99999;
    let same = 0;
    let last = '';
    for (let i = 0; i < 200 && !g.state.dead; i++) {
      g.state.character.ageMonths = 16 * 12;
      g.explore();
      const id = g.pendingEvent?.id ?? '';
      if (id === last) same++;
      last = id;
      if (g.pendingEvent) g.choose(0);
    }
    // 十选一均匀抽时约十分之一（20 次）连续重复；去重后应远低于此
    expect(same).toBeLessThan(6);
    expect(g.state.recentEvents!.length).toBeLessThanOrEqual(8);
  });
});

describe('可重复事件的属性', () => {
  it('同一个可重复事件，属性每世只加一次；一次性事件不受影响', () => {
    const rep: EventDef = { id: 'rep', title: 'r', region: ['qingshi_village'], text: '', options: [{ text: '悟', effects: [{ type: 'attr', key: 'wuxing', value: 1 }, { type: 'cultivation', value: 5 }] }] };
    const g = makeGame([rep]);
    const w0 = g.state.character.attrs.wuxing;
    for (let i = 0; i < 3; i++) {
      (g as unknown as { trigger(e: EventDef): void }).trigger(rep);
      g.choose(0);
    }
    expect(g.state.character.attrs.wuxing).toBe(w0 + 1);
    expect(g.state.log.some((e) => e.text.includes('没有再长进'))).toBe(true);
  });
});

describe('瓶颈丹与冲关准备', () => {
  const C: Content = {
    ...BASE,
    items: [
      ...BASE.items,
      item('pojing_dan', { type: 'pill' }),
      item('jiangchen_dan', { type: 'pill' }),
      item('huzhen_qi', { type: 'talisman', breakWard: true }),
    ],
  };
  const heart: EventDef = {
    id: 'xinmo_jindan', title: '心魔', text: '',
    options: [{ text: '过', effects: [{ type: 'realm_up' }] }],
  };
  const disturb: EventDef = {
    id: 'break_disturb_test', title: '外扰', text: '',
    options: [{ text: '应对', effects: [{ type: 'break_bonus', value: 0.5 }] }],
  };
  const make = (events: EventDef[] = [heart], seed = 3) => Game.newGame({ name: '测试', gender: 'male', seed }, { ...C, events });
  const zhujiTop = (g: Game) => {
    Object.assign(g.state.character, { realm: 'zhuji', stage: 3, cultivation: 1e9 });
    g.state.character.hp = g.combatStats.maxHp;
    g.state.inventory.jiedan_lingguo = 1;
  };

  it('没有瓶颈丹时冲瓶颈成功率很低，有了大增，冲关时自动服用', () => {
    const g = make();
    Object.assign(g.state.character, { realm: 'zhuji', stage: 1, stuck: true, stuckTries: 0 });
    g.state.character.attrs.wuxing = 5;
    const low = g.bottleneckRate;
    expect(low).toBeLessThan(0.2);
    g.state.inventory.pojing_dan = 1;
    expect(g.bottleneckRate).toBeGreaterThan(low + 0.5);
    g.breakthrough();
    expect(g.state.inventory.pojing_dan).toBeUndefined();
  });

  it('苦参能慢慢抬高成功率，但不服丹有上限', () => {
    const g = make();
    Object.assign(g.state.character, { realm: 'zhuji', stage: 1, stuck: true, stuckTries: 999 });
    expect(g.bottleneckRate).toBeLessThanOrEqual(0.5);
  });

  it('辅助丹药提高冲关成功率；气血不足会拉低', () => {
    const g = make();
    zhujiTop(g);
    const base = g.coreRate;
    g.state.inventory.jiangchen_dan = 1;
    const withAid = g.coreRate;
    expect(withAid).toBeCloseTo(base + 0.25, 5);
    g.state.character.hp = 1;
    expect(g.coreRate).toBeLessThan(withAid);
    expect(g.breakPreview.core?.aid.have).toBe(true);
  });

  it('冲关成功后进入心魔关；失败则走火入魔、材料已耗尽', () => {
    let ok = 0;
    let fail = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = make([heart], seed);
      zhujiTop(g);
      g.state.inventory.huzhen_qi = 1; // 挡掉外扰，只看冲关本身
      g.breakthrough();
      expect(g.state.inventory.jiedan_lingguo).toBeUndefined();
      if (g.pendingEvent?.id === 'xinmo_jindan') {
        ok++;
        expect(g.state.breakStage).toBe('heart');
        g.choose(0);
        expect(g.char.realm).toBe('jindan');
      } else {
        fail++;
        expect(g.state.breaking).toBeFalsy();
        expect(g.char.stage).toBe(2);
      }
    }
    expect(ok).toBeGreaterThan(0);
    expect(fail).toBeGreaterThan(0);
  });

  it('外扰事件处理完后接着冲关，结果计入成功率；护阵旗能挡掉外扰', () => {
    let disturbed = 0;
    let warded = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = make([heart, disturb], seed);
      zhujiTop(g);
      g.breakthrough();
      if (g.pendingEvent?.id === 'break_disturb_test') {
        disturbed++;
        expect(g.state.breakStage).toBe('disturb');
        g.choose(0);
        // 冲关已经结算：要么进了心魔关，要么走火入魔
        const after = g.pendingEvent?.id as string | undefined;
        expect(after === 'xinmo_jindan' || !g.state.breaking).toBe(true);
      }
      const g2 = make([heart, disturb], seed);
      zhujiTop(g2);
      g2.state.inventory.huzhen_qi = 1;
      g2.breakthrough();
      expect(g2.pendingEvent?.id).not.toBe('break_disturb_test');
      if (!g2.state.inventory.huzhen_qi) warded++;
    }
    expect(disturbed).toBeGreaterThan(0);
    expect(warded).toBeGreaterThan(0);
  });
});

describe('战斗：敌人随境界成长、装备有优势、伤势', () => {
  const fightEvent = (enemy: string): EventDef => ({
    id: 'f', title: '', region: ['qingshi_village'], text: '',
    options: [{ text: '打', battle: { enemy } }, { text: '走' }],
  });
  const C: Content = {
    ...BASE,
    items: [...BASE.items, item('good_sword', { type: 'weapon', realm_min: 'zhuji', stats: { atk: 21 } }), item('good_armor', { type: 'armor', realm_min: 'zhuji', stats: { hp: 130, def: 10 } })],
    enemies: [...BASE.enemies, { id: 'grunt', name: '喽啰', verb: '扑来', hp: 800, atk: 70, def: 25, spd: 20, realm: 'zhuji', tier: 'normal' },
      { id: 'chief', name: '头目', verb: '扑来', hp: 800, atk: 70, def: 25, spd: 20, realm: 'zhuji', tier: 'boss', traits: ['enrage', 'drain'] }],
  };
  const make = () => Game.newGame({ name: '测试', gender: 'male', seed: 1 }, C);
  const setup = (g: Game, stage: number, gear: boolean) => {
    Object.assign(g.state.character, { realm: 'zhuji', stage, attrs: { gengu: 6, wuxing: 6, shenshi: 6, jiyuan: 6, xinjing: 6 } });
    g.state.character.equip = gear ? { weapon: 'good_sword', armor: 'good_armor' } : { weapon: null, armor: null };
    g.state.character.hp = g.combatStats.maxHp;
  };

  it('敌人跟着小层成长：同样装备下，初期和圆满的胜算差不多', () => {
    const g = make();
    setup(g, 0, true);
    const early = g.battleChance('grunt');
    setup(g, 3, true);
    const late = g.battleChance('grunt');
    expect(Math.abs(early - late)).toBeLessThan(0.3);
  });

  it('穿上本境界的装备明显更容易赢；首领比普通敌人难', () => {
    const g = make();
    setup(g, 1, false);
    const naked = g.battleChance('grunt');
    setup(g, 1, true);
    const geared = g.battleChance('grunt');
    expect(geared).toBeGreaterThan(naked + 0.2);
    expect(g.battleChance('chief')).toBeLessThan(geared);
  });

  it('境界比敌人高时，敌人封顶，基本能碾压', () => {
    const g = make();
    Object.assign(g.state.character, { realm: 'jindan', stage: 0 });
    g.state.character.hp = g.combatStats.maxHp;
    expect(g.battleChance('grunt')).toBeGreaterThan(0.9);
  });

  it('战败留下伤势，气血上限降低；随时间痊愈，闭关好得更快', () => {
    const g = makeGame([fightEvent('strong')]);
    const max0 = g.combatStats.maxHp;
    g.explore();
    g.choose(0);
    expect(g.injury).toBeGreaterThan(0);
    expect(g.combatStats.maxHp).toBeLessThan(max0);
    const inj = g.injury;
    g.closedDoor(6);
    expect(g.injury).toBeLessThan(inj);
  });

  it('伤害符按敌人最大气血的比例生效', () => {
    const g = makeGame([fightEvent('strong')]);
    g.state.inventory.fire = 1; // 99999%
    g.explore();
    g.choose(0);
    expect(g.state.log.some((l) => l.text.includes('你祭出【fire】'))).toBe(true);
  });
});

describe('事件面前做准备', () => {
  it('有待抉择的事件时能服药、换装备，但不能出售', () => {
    const ev: EventDef = { id: 'e', title: 'e', region: ['qingshi_village'], text: '', options: [{ text: '好' }] };
    const g = makeGame([ev]);
    g.explore();
    expect(g.pendingEvent?.id).toBe('e');
    g.state.inventory.pill_heal = 1;
    g.state.inventory.sword = 1;
    g.char.hp = 1;
    g.useItem('pill_heal');
    expect(g.char.hp).toBeGreaterThan(1);
    g.equip('sword');
    expect(g.char.equip.weapon).toBe('sword');
    g.state.region = 'qingyun_market';
    g.state.inventory.herb = 2;
    g.sell('herb');
    expect(g.state.inventory.herb).toBe(2);
  });
});
