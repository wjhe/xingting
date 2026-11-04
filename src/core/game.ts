import { runBattle, type BattleResult, type BattleStep, type Fighter } from './combat';
import { getRealm, getRoot, realmIndex, REALMS, SPIRIT_ROOTS, type RealmDef } from './realms';
import { getRegion } from './regions';
import { Rng } from './rng';
import {
  ATTR_NAMES,
  type Effect,
  type EnemyDef,
  type EventDef,
  type EventOption,
  type DeathCause,
  type Setback,
  type GameState,
  type Gender,
  type ItemDef,
  type LogKind,
  type RecipeDef,
  type RealmId,
  type Outcome,
  type EndingDef,
  type ShopEntry,
  type SpiritRootId,
  type TalentDef,
  type TechniqueDef,
} from './types';

export const SAVE_VERSION = 3;
const LOG_LIMIT = 300;
const START_AGE_YEARS = 16;
const SEASONS = ['春', '夏', '秋', '冬'];
/** 每过一个月恢复的气血比例 */
const HP_REGEN_PER_MONTH = 0.25;

/** 轮回主线第一条线索：死亡时的低语，随世数变化 */
const DEATH_WHISPERS = [
  '意识消散之际，你恍惚听见一声叹息：「又失败了么……」',
  '黑暗中，那个声音再次响起：「还差一点……再来。」',
  '「去吧，再试一次。」那声音越发清晰，竟有几分像你自己。',
];
/** 离线至少这么久才积累灵气储备（分钟） */
const OFFLINE_MIN_MINUTES = 5;
/** 灵气储备上限（分钟） */
export const OFFLINE_CAP_MINUTES = 480;
/** 每次闭关消耗的储备（分钟），足额时修为翻倍 */
const OFFLINE_PER_DOOR = 60;

/** 达到最高境界时触发的结局抉择事件 */
const ENDING_EVENT = 'ending_choice';
const DEFAULT_ENDING = 'ending_ascend';
/**
 * 冲击小境界瓶颈：不服瓶颈丹时成功率很低，靠苦参和失败慢慢上涨（有上限）；服了对应的瓶颈丹大增
 */
const STUCK_BASE = 0.08;
const STUCK_PER_TRY = 0.02;
const STUCK_CAP = 0.3;
const BOTTLENECK_PILL_BONUS = 0.6;
/** 没有瓶颈丹的境界（炼气）卡住时：基础成功率与每次失败的增量，不反噬 */
const STUCK_NOPILL_BASE = 0.4;
const STUCK_NOPILL_PER_TRY = 0.15;
/** 事件、丹药给的修为：按"所属境界初层所需"折成比例，再乘以当前这一层所需；单次最多半层 */
const CULT_FRACTION_CAP = 0.5;
/** 低境界的事件、丹药到了高境界，每高一个大境界效果再乘以这个系数 */
const CULT_OLD_REALM_FACTOR = 0.2;
/** 离线灵气储备：每次闭关额外加成的比例（足额时） */
const OFFLINE_BONUS = 0.5;
/** 冲一次瓶颈耗去的时间，按本境界寿元上限的比例 */
const STUCK_TIME_RATIO = 0.01;
/** 不服瓶颈丹硬冲失败：灵力反噬，折寿（按寿元上限的比例）并损伤气血（百分比） */
const STUCK_BACKLASH_RATIO = 0.01;
const STUCK_BACKLASH_HP = 0.3;
/** 大境界冲关：辅助丹药加成；气血不足九成时的减成 */
const CORE_AID_BONUS = 0.25;
const CORE_LOW_HP_PENALTY = 0.15;
/** 冲关时遭遇外扰（仇家、心魔幻象、灵脉暴走……）的概率，护阵旗可挡 */
const DISTURB_CHANCE = 0.5;
const DISTURB_PREFIX = 'break_disturb_';
/** 属性上限：事件和天赋加的属性都不会超过它 */
export const ATTR_CAP = 20;
/** 丹药、天赋对心魔检定的难度减免上限 */
const HEART_BONUS_CAP = 3;
/** 丹师品级所需的丹道经验，下标 0 为一品 */
export const DAN_LEVELS = [0, 3, 10, 25, 55, 110, 200, 340, 520];
const DAN_LEVEL_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
/**
 * 敌人强度：以"同一小层、属性 6、穿着本境界最好装备的修士"为标准，乘以档次系数和敌人自身的特点。
 * 系数按胜率校准（穿本境界装备）：普通约八成，精英约五成，首领约三成（精英、首领另有特性和暴击加成，系数反而低）。
 * 玩家装备好、属性高的优势会保留下来；玩家境界更高时，敌人封顶在它所属境界的圆满
 */
export const TIER_MULT: Record<'normal' | 'elite' | 'boss', { hp: number; atk: number; def: number; spd: number }> = {
  normal: { hp: 1.03, atk: 1.03, def: 1.03, spd: 0 },
  elite: { hp: 0.9, atk: 0.9, def: 0.9, spd: 3 },
  boss: { hp: 0.9, atk: 0.9, def: 0.9, spd: 6 },
};
const TIER_KILL: Record<'normal' | 'elite' | 'boss', number> = { normal: 0, elite: 0.1, boss: 0.25 };
/** 伤势：战败加重、险胜轻伤；每过一个月自愈，闭关时好得更快 */
const INJURY_LOSE = 0.3;
const INJURY_NARROW = 0.1;
const INJURY_CAP = 0.6;
/** 残魂不灭：折寿为本境界寿元上限的 5%，至少 5 年 */
const REVIVE_LIFESPAN_RATIO = 0.05;
const REVIVE_MIN_YEARS = 5;
const INJURY_HEAL_PER_MONTH = 0.02;
const INJURY_DOOR_BONUS_PER_MONTH = 0.03;
/** 开战前预估胜算时模拟的场数 */
const BATTLE_PREVIEW_RUNS = 80;
/**
 * 普通事件检定的统一难度偏移（硬核档）。心魔关、冲关外扰不加：它们的难度单独调过
 */
export const CHECK_DC_SHIFT = { value: 3 };
/** 记住最近几次历练抽到的事件：刚遇过的权重 ×0.1，越早遇过的恢复得越多 */
const RECENT_SIZE = 8;
/** 历练途中顺手采到灵草的概率 */
const HERB_CHANCE = 0.35;
/** 灵根从差到好 */
const ROOT_ORDER: SpiritRootId[] = ['wei', 'si', 'san', 'shuang', 'tian'];

export interface Content {
  events: EventDef[];
  items: ItemDef[];
  techniques: TechniqueDef[];
  enemies: EnemyDef[];
  shop: ShopEntry[];
  talents: TalentDef[];
  endings: EndingDef[];
  /** 丹房配方；旧测试数据可以不提供 */
  recipes?: RecipeDef[];
}

export interface NewGameOptions {
  name: string;
  gender: Gender;
  seed: number;
  /** 第几世，默认 1 */
  life?: number;
  /** 选中的天赋 */
  talents?: string[];
  /** 从轮回存档带入的跨世标记 */
  metaFlags?: Record<string, boolean>;
  /** 上一世的主修功法，供"宿慧"天赋使用 */
  lastTechnique?: string | null;
}

/** 本次操作中发生的值得演出的事，由界面取走后播放 */
export type Signal =
  /** 闭关：bottleneck 为真表示修为已到瓶颈、多余的散失了 */
  | { type: 'door'; months: number; gain: number; ageFrom: number; ageTo: number; bottleneck: boolean }
  /** 踏入新境界；ascend 为飞升 */
  | { type: 'realm'; id: RealmId | 'ascend'; label: string }
  | { type: 'breakFail' }
  /**
   * 冲击小境界：ok 为晋升成功，否则撞上瓶颈。bottleneck 表示这是在冲已有的瓶颈；
   * reach 为灵气冲到关口的比例（失败时小于 1），pill 表示服了瓶颈丹
   */
  | { type: 'stage'; from: string; to: string; ok: boolean; bottleneck: boolean; reach: number; pill: boolean }
  /** 大境界冲关（凝丹、成婴……）成功，接下来是天劫或心魔 */
  | { type: 'breakCore'; name: string; next: string }
  | { type: 'death'; message: string }
  /** 看完视频挽回：revive 残魂不灭，undo 逆天改命 */
  | { type: 'revive'; years: number }
  | { type: 'ending'; id: string; name: string }
  | { type: 'travel'; id: string; region: string; desc: string }
  /** 开炉炼丹：count 为 0 表示炸炉 */
  | { type: 'alchemy'; product: string; name: string; months: number; count: number; fine: boolean }
  | { type: 'battle'; replay: BattleReplay };

/** 一场战斗的完整记录，界面据此做逐回合动画 */
export interface BattleReplay {
  enemyId: string;
  enemyName: string;
  pName: string;
  /** 双方普通攻击的描述 */
  pVerb: string;
  eVerb: string;
  pMaxHp: number;
  pHp0: number;
  pMaxMp: number;
  eMaxHp: number;
  eHp0: number;
  /** 开战时祭出的符箓 */
  opening: { kind: 'damage' | 'guard'; name: string; value: number }[];
  steps: BattleStep[];
  result: BattleResult;
  /** 战败后的去向：遁走（符箓名）、被击杀、重伤逃脱 */
  aftermath?: { kind: 'escape'; talisman: string } | { kind: 'killed' } | { kind: 'fled' };
  /** 天劫：只有天雷出手，eHp 表示剩余雷劫道数 */
  tribulation?: boolean;
}

/** 丹房里一张配方的现状，供界面展示 */
export interface RecipeView {
  recipe: RecipeDef;
  product: ItemDef;
  ingredients: { id: string; name: string; need: number; have: number }[];
  /** 所需品级是否达到 */
  levelOk: boolean;
  /** 药材是否齐全 */
  ready: boolean;
  rate: number;
}

/** 突破前的预估，供界面展示 */
export interface BreakPreview {
  /** 突破目标：下一个境界名，或"飞升" */
  target: string;
  /** 所需材料及是否已有 */
  items: { id: string; name: string; have: boolean }[];
  /** 天劫：名称、道数、预估撑过的概率 */
  tribulation: { name: string; bolts: number; survive: number } | null;
  /** 心魔关：最好的那个选项的预估成功率 */
  heart: number | null;
  /** 冲关这一步：基础成功率加各项准备 */
  core: {
    name: string;
    rate: number;
    aid: { name: string; have: boolean; bonus: number };
    ward: boolean;
    lowHp: boolean;
    disturb: number;
  } | null;
  /** 总体预估成功率 */
  rate: number;
  /** 突破物品的线索 */
  guide: BreakGuideView | null;
}

/** 突破物品的线索：知道出处后列出原料和去处 */
export interface BreakGuideView {
  known: boolean;
  parts: { name: string; where: string; have: boolean }[];
  how: string;
  unknown: string;
}

export interface TalentMods {
  gain: number;
  breakBonus: number;
  lifespan: number;
}

export interface CombatStats {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
}

export function createState(opts: NewGameOptions): GameState {
  const rng = Rng.fromSeed(opts.seed);
  const root = rng.pickWeighted(SPIRIT_ROOTS, (r) => r.chance)!;
  const attrs = {
    gengu: rng.int(1, 10),
    wuxing: rng.int(1, 10),
    shenshi: rng.int(1, 10),
    jiyuan: rng.int(1, 10),
    xinjing: rng.int(1, 10),
  };
  return {
    version: SAVE_VERSION,
    rngState: rng.state,
    life: opts.life ?? 1,
    character: {
      name: opts.name,
      gender: opts.gender,
      root: root.id,
      attrs,
      realm: 'fanren',
      stage: 0,
      cultivation: 0,
      ageMonths: START_AGE_YEARS * 12,
      lifespanPenalty: 0,
      stones: 50,
      hp: 0,
      technique: null,
      breakBonus: 0,
      talents: opts.talents ?? [],
      equip: { weapon: null, armor: null },
    },
    inventory: {},
    flags: {},
    metaFlags: { ...opts.metaFlags },
    seenEvents: [],
    pendingEventId: null,
    region: 'qingshi_village',
    shop: { year: -1, stock: {} },
    log: [],
    dead: false,
    ending: null,
  };
}

/**
 * 游戏逻辑的唯一入口。UI 只调用这里的方法，然后根据 state 和 log 重新渲染。
 * 不依赖任何引擎或平台 API。
 */
export class Game {
  private rng: Rng;
  private events = new Map<string, EventDef>();
  private items = new Map<string, ItemDef>();
  private techniques = new Map<string, TechniqueDef>();
  private enemies = new Map<string, EnemyDef>();
  private talents = new Map<string, TalentDef>();
  private endings = new Map<string, EndingDef>();
  private recipes = new Map<string, RecipeDef>();
  /** 敌人相对同境界其他敌人的特点（血厚、攻高、身法快……） */
  private enemyProfile = new Map<string, { hp: number; atk: number; def: number; spd: number }>();
  /** 正在结算的事件或丹药：它给的修为按所属境界折算 */
  private cultSource: { realm: RealmId; pill?: string } | null = null;
  /** 正在结算的可重复事件；它给的属性每世只生效一次 */
  private attrSource: string | null = null;
  private signals: Signal[] = [];

  constructor(public state: GameState, private content: Content) {
    this.rng = new Rng(state.rngState);
    state.offline ??= { lastSeen: 0, reserve: 0 };
    for (const e of content.events) this.events.set(e.id, e);
    for (const it of content.items) this.items.set(it.id, it);
    for (const t of content.techniques) this.techniques.set(t.id, t);
    for (const en of content.enemies) this.enemies.set(en.id, en);
    for (const t of content.talents) this.talents.set(t.id, t);
    for (const e of content.endings) this.endings.set(e.id, e);
    for (const r of content.recipes ?? []) this.recipes.set(r.id, r);
    this.buildEnemyProfiles();
  }

  /** 按同境界敌人的中位数，算出每个敌人的特点系数（0.9～1.1，只是一点个性，强弱主要看档次） */
  private buildEnemyProfiles(): void {
    const byRealm = new Map<string, EnemyDef[]>();
    for (const e of this.content.enemies) {
      const k = e.realm ?? 'lianqi';
      byRealm.set(k, [...(byRealm.get(k) ?? []), e]);
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] || 1;
    for (const list of byRealm.values()) {
      const m = { hp: median(list.map((e) => e.hp)), atk: median(list.map((e) => e.atk)), def: median(list.map((e) => e.def)), spd: median(list.map((e) => e.spd)) };
      const clamp = (x: number) => Math.max(0.9, Math.min(1.1, x));
      for (const e of list) this.enemyProfile.set(e.id, { hp: clamp(e.hp / m.hp), atk: clamp(e.atk / m.atk), def: clamp(e.def / m.def), spd: clamp(e.spd / m.spd) });
    }
  }

  static newGame(opts: NewGameOptions, content: Content): Game {
    const game = new Game(createState(opts), content);
    const c = game.state.character;
    const talents = c.talents.map((id) => game.talents.get(id)).filter((t): t is TalentDef => !!t);
    for (const t of talents) {
      if (t.mods?.rootSet) c.root = t.mods.rootSet;
      if (t.mods?.rootUp) c.root = ROOT_ORDER[Math.min(ROOT_ORDER.length - 1, ROOT_ORDER.indexOf(c.root) + 1)];
    }
    game.restockShop();
    const pronoun = c.gender === 'male' ? '少年' : '少女';
    game.stamp();
    if (game.state.life > 1) game.log('whisper', `—— 第 ${game.state.life} 世 ——`);
    game.log('text', `${c.name}，${pronoun}，年方十六，生于${getRegion(game.state.region).name}。`);
    game.log('text', `仙缘测试之日，测灵石泛起微光——你身负【${getRoot(c.root).name}】。`);
    if (talents.length) {
      game.log('system', `天赋：${talents.map((t) => `【${t.name}】`).join('')}`);
      for (const t of talents) for (const eff of t.start ?? []) game.applyEffect(eff);
      const book = opts.lastTechnique ? content.items.find((it) => it.technique === opts.lastTechnique) : undefined;
      if (book && talents.some((t) => t.mods?.inheritTechnique)) {
        game.log('text', '你自幼常做一个梦，梦中有人一字一句地念诵功法。醒来后，你把它默写了下来。');
        game.addItem(book.id, 1);
      }
    }
    c.hp = game.combatStats.maxHp;
    game.log('system', '可以开始闭关，尝试引气入体。');
    game.sync();
    return game;
  }

  /** 取走本次操作产生的演出信号 */
  drainSignals(): Signal[] {
    const out = this.signals;
    this.signals = [];
    return out;
  }

  /**
   * 对时：根据离线时长积累灵气储备，并记下当前时刻。
   * 时间由调用方传入，逻辑层不直接读系统时钟。返回本次新增的储备（分钟）。
   */
  syncClock(now: number): number {
    const o = this.state.offline!;
    let gained = 0;
    const minutes = o.lastSeen > 0 ? (now - o.lastSeen) / 60000 : 0;
    if (minutes >= OFFLINE_MIN_MINUTES && !this.state.dead) {
      const before = o.reserve;
      o.reserve = Math.min(OFFLINE_CAP_MINUTES, o.reserve + minutes);
      gained = o.reserve - before;
      if (gained >= 1) {
        this.log('system', `你离开了 ${durationLabel(minutes)}，洞府中积聚了灵气（储备 ${durationLabel(o.reserve)}）。接下来闭关，修为多得五成。`);
      }
    }
    o.lastSeen = now;
    return gained;
  }

  /** 记下当前在线时刻，不积累储备（每次操作时调用，避免把发呆的时间当成离线） */
  touchClock(now: number): void {
    this.state.offline!.lastSeen = now;
  }

  /** 灵气储备（分钟） */
  get offlineReserve(): number {
    return this.state.offline?.reserve ?? 0;
  }

  // ---------- 激励视频的奖励（见 docs/广告变现方案.md）----------
  // 这里只管"看完之后发生什么"，播不播得出广告、次数够不够由界面层判断。

  /** 战死或渡劫被劈死、本世还没用过、而且折寿后还剩至少一年阳寿 */
  get canRevive(): boolean {
    const s = this.state;
    if (!s.dead || s.ending || s.revived) return false;
    if (s.deathCause !== 'battle' && s.deathCause !== 'tribulation') return false;
    return this.lifespanYears - this.reviveYears > this.ageYears;
  }

  /** 残魂不灭要折的寿元：本境界寿元上限的 5%，至少 5 年 */
  get reviveYears(): number {
    return Math.max(REVIVE_MIN_YEARS, Math.round(getRealm(this.char.realm).lifespan * REVIVE_LIFESPAN_RATIO));
  }

  /** 残魂不灭：保住性命，按重伤处理（修为减半、折寿、经脉重伤） */
  revive(): void {
    if (!this.canRevive) return;
    const s = this.state;
    const c = this.char;
    const years = this.reviveYears;
    s.dead = false;
    s.deathCause = null;
    s.revived = true;
    c.cultivation = Math.floor(c.cultivation / 2);
    c.lifespanPenalty += years;
    c.injury = INJURY_CAP;
    c.hp = Math.max(1, Math.round(this.combatStats.maxHp * 0.2));
    this.log('good', `一缕残魂死死守住灵台，你从鬼门关前爬了回来。`);
    this.log('bad', `修为折损一半，寿元 -${years} 年，经脉重伤。（本世仅此一次）`);
    this.signals.push({ type: 'revive', years });
    this.sync();
  }

  /** 突破失败、还活着、还没再做别的事 */
  get canUndoBreak(): boolean {
    const b = this.state.setback;
    return b?.kind === 'break' && b.at === this.char.ageMonths && !this.state.dead;
  }

  /**
   * 逆天改命：找回这次突破失败损失的境界和修为。
   * 折掉的寿元不退：寿元是游戏的核心张力，不能用广告换（全退的话，模拟里渡劫到达率会翻倍）
   */
  undoBreak(): void {
    if (!this.canUndoBreak) return;
    const b = this.state.setback as Extract<Setback, { kind: 'break' }>;
    const c = this.char;
    c.stage = b.stage;
    c.cultivation = b.cultivation;
    this.state.setback = null;
    this.log('good', `逆天改命！散去的灵力重新归入经脉，境界与修为失而复得。折去的寿元，却是回不来了。`);
    this.sync();
  }

  /** 刚炸炉、还没再做别的事 */
  get canSaveHerbs(): boolean {
    const b = this.state.setback;
    return b?.kind === 'brew' && b.at === this.char.ageMonths && !this.state.dead;
  }

  /** 保住这一炉药材：烧掉的药材原样找回 */
  saveHerbs(): void {
    if (!this.canSaveHerbs) return;
    const b = this.state.setback as Extract<Setback, { kind: 'brew' }>;
    for (const [id, n] of Object.entries(b.herbs)) this.addItem(id, n, true);
    this.state.setback = null;
    this.log('good', `你从炉灰里抢出了药材，${Object.entries(b.herbs).map(([id, n]) => `【${this.itemName(id)}】×${n}`).join('、')}失而复得。`);
    this.sync();
  }

  /** 不挽回，接着修行 */
  dismissSetback(): void {
    this.state.setback = null;
  }

  /** 在坊市、今年还没用视频刷新过 */
  get canAdRefreshShop(): boolean {
    return this.atMarket && this.idle && this.state.adShopYear !== this.ageYears;
  }

  /** 立即刷新今年的货架 */
  adRefreshShop(): void {
    if (!this.canAdRefreshShop) return;
    this.restockShop();
    this.state.adShopYear = this.ageYears;
    this.log('system', '掌柜从后堂又搬出一批新货，货架焕然一新。');
    this.sync();
  }

  /** 灵气储备翻倍：再加一份同样多的储备，上限是平时的两倍 */
  addOfflineReserve(minutes: number): number {
    const o = this.state.offline!;
    const before = o.reserve;
    o.reserve = Math.min(OFFLINE_CAP_MINUTES * 2, o.reserve + minutes);
    const added = o.reserve - before;
    if (added >= 1) this.log('good', `洞府灵气翻涌，储备增加 ${durationLabel(added)}（共 ${durationLabel(o.reserve)}）。`);
    return added;
  }

  /** 突破失败、扣罚之前调用：记下当前状态，看完视频可以找回 */
  private markBreakSetback(): void {
    const c = this.char;
    this.state.setback = { kind: 'break', at: c.ageMonths, stage: c.stage, cultivation: c.cultivation };
  }

  // ---------- 派生数值 ----------

  get char() {
    return this.state.character;
  }

  /** 没有待选事件且还活着，可以进行行动 */
  get idle(): boolean {
    return !this.state.dead && !this.state.pendingEventId;
  }

  /** 能不能服药、换装备：平时可以，面对待抉择的事件时也可以（先做准备再选） */
  get canPrepare(): boolean {
    return !this.state.dead;
  }

  get pendingEvent(): EventDef | null {
    return this.state.pendingEventId ? this.events.get(this.state.pendingEventId) ?? null : null;
  }

  get ageYears(): number {
    return Math.floor(this.char.ageMonths / 12);
  }

  get lifespanYears(): number {
    return getRealm(this.char.realm).lifespan + this.talentMods.lifespan - this.char.lifespanPenalty;
  }

  /** 本世天赋的持续加成汇总 */
  get talentMods(): TalentMods {
    const m: TalentMods = { gain: 1, breakBonus: 0, lifespan: 0 };
    for (const id of this.char.talents) {
      const mods = this.talents.get(id)?.mods;
      if (!mods) continue;
      m.gain *= mods.gain ?? 1;
      m.breakBonus += mods.breakBonus ?? 0;
      m.lifespan += mods.lifespan ?? 0;
    }
    return m;
  }

  getTalent(id: string): TalentDef | undefined {
    return this.talents.get(id);
  }

  getEnding(id: string): EndingDef | undefined {
    return this.endings.get(id);
  }

  get realmLabel(): string {
    const realm = getRealm(this.char.realm);
    const stage = realm.stageNames[this.char.stage];
    return stage ? `${realm.name}·${stage}` : realm.name;
  }

  get stageReq(): number {
    return getRealm(this.char.realm).stageReq(this.char.stage);
  }

  get technique(): TechniqueDef | null {
    return this.char.technique ? this.techniques.get(this.char.technique) ?? null : null;
  }

  get gainPerMonth(): number {
    const mult = getRoot(this.char.root).multiplier * (this.technique?.multiplier ?? 1) * this.talentMods.gain;
    return Math.round(getRealm(this.char.realm).baseGain * mult * 10) / 10;
  }

  get doorOptions(): number[] {
    return getRealm(this.char.realm).doorOptions;
  }

  get combatStats(): CombatStats {
    const c = this.char;
    const realm = getRealm(c.realm);
    const stageMult = 1 + c.stage * 0.12;
    const gengu = Math.max(0, c.attrs.gengu);
    const eq = { atk: 0, def: 0, hp: 0 };
    for (const id of [c.equip.weapon, c.equip.armor]) {
      const st = id ? this.items.get(id)?.stats : undefined;
      eq.atk += st?.atk ?? 0;
      eq.def += st?.def ?? 0;
      eq.hp += st?.hp ?? 0;
    }
    const injury = Math.max(0, Math.min(INJURY_CAP, c.injury ?? 0));
    return {
      maxHp: Math.round((Math.round(realm.hp * stageMult * (1 + gengu * 0.05)) + eq.hp) * (1 - injury)),
      maxMp: Math.round(realm.mp * stageMult),
      atk: Math.round(realm.atk * stageMult) + eq.atk,
      def: Math.round(realm.atk * stageMult * 0.4 * (1 + gengu * 0.03)) + eq.def,
      spd: 10 + Math.max(0, c.attrs.shenshi) + realmIndex(c.realm) * 5,
      crit: 0.05 + Math.max(0, c.attrs.jiyuan) * 0.01,
    };
  }

  /** 卡在小境界瓶颈 */
  get stuck(): boolean {
    return !!this.char.stuck;
  }

  /** 本境界的瓶颈丹 id（不管有没有） */
  get bottleneckPill(): string | null {
    return getRealm(this.char.realm).bottleneckPill ?? null;
  }

  /** 行囊里有没有本境界的瓶颈丹 */
  get hasBottleneckPill(): boolean {
    const id = this.bottleneckPill;
    return !!id && !!this.state.inventory[id];
  }

  /** 冲击当前小境界瓶颈的成功率：有瓶颈丹时会自动服用 */
  get bottleneckRate(): number {
    const tries = this.char.stuckTries ?? 0;
    if (!this.bottleneckPill) return Math.min(0.95, STUCK_NOPILL_BASE + Math.max(0, this.char.attrs.wuxing) * 0.01 + tries * STUCK_NOPILL_PER_TRY);
    const raw = Math.min(STUCK_CAP, STUCK_BASE + Math.max(0, this.char.attrs.wuxing) * 0.01 + tries * STUCK_PER_TRY);
    return Math.min(0.95, raw + (this.hasBottleneckPill ? BOTTLENECK_PILL_BONUS : 0));
  }

  /** 大境界冲关的成功率（不含天劫、心魔） */
  get coreRate(): number {
    const core = getRealm(this.char.realm).core;
    if (!core) return 1;
    const c = this.char;
    const aid = this.state.inventory[core.aid] ? CORE_AID_BONUS : 0;
    const lowHp = c.hp < this.combatStats.maxHp * 0.9 ? CORE_LOW_HP_PENALTY : 0;
    const attrs = (Math.max(0, c.attrs.wuxing) + Math.max(0, c.attrs.xinjing)) * 0.01;
    const rate = core.base + aid + attrs + c.breakBonus + this.talentMods.breakBonus - lowHp;
    return Math.max(0.05, Math.min(0.95, rate));
  }

  /** 这一层修为已满、还不是最后一层：可以冲击下一个小境界 */
  get canAdvanceStage(): boolean {
    const c = this.char;
    const realm = getRealm(c.realm);
    return realm.breakRate < 1 && !c.stuck && !this.state.breaking && c.stage < realm.stageNames.length - 1 && c.cultivation >= this.stageReq;
  }

  /** 下一个小境界的名字（如"炼气·三层"） */
  get nextStageLabel(): string {
    const realm = getRealm(this.char.realm);
    return `${realm.name}·${realm.stageNames[Math.min(this.char.stage + 1, realm.stageNames.length - 1)]}`;
  }

  /** 冲击下一个小境界会不会必然卡住（"后期 → 圆满"） */
  get nextStageMustStick(): boolean {
    const realm = getRealm(this.char.realm);
    return !!realm.bottleneckPill && this.char.stage === realm.stageNames.length - 2;
  }

  /** 已到当前大境界最后一层且修为已满，可以尝试突破（渡劫圆满时为飞升） */
  get canBreakthrough(): boolean {
    const c = this.char;
    const realm = getRealm(c.realm);
    return (
      realm.breakRate < 1 &&
      !c.stuck &&
      !this.state.breaking &&
      c.stage === realm.stageNames.length - 1 &&
      c.cultivation >= this.stageReq
    );
  }

  /** 突破所需但还没有的物品 */
  get missingBreakItems(): string[] {
    return (getRealm(this.char.realm).breakItems ?? []).filter((id) => !this.state.inventory[id]);
  }

  /** 第一个缺少的突破物品，不需要或都已拥有时为 null */
  get missingBreakItem(): string | null {
    return this.missingBreakItems[0] ?? null;
  }

  /** 心魔检定的难度减免：破障丹和天赋的突破加成每 10% 降 1 */
  get heartDcBonus(): number {
    return Math.min(HEART_BONUS_CAP, Math.round((this.char.breakBonus + this.talentMods.breakBonus) * 10));
  }

  /**
   * 突破成功率。炼气为掷骰；有心魔关的境界为预估值（天劫撑过的概率 × 心魔最佳选项的成功率）。
   */
  get breakthroughRate(): number {
    const realm = getRealm(this.char.realm);
    if (!realm.heartDemon) {
      const { wuxing, xinjing } = this.char.attrs;
      const bonus = this.char.breakBonus + this.talentMods.breakBonus;
      return Math.min(0.95, realm.breakRate + wuxing * 0.01 + xinjing * 0.005 + bonus);
    }
    return this.breakPreview.rate;
  }

  get breakPreview(): BreakPreview {
    const realm = getRealm(this.char.realm);
    const next = REALMS[realmIndex(this.char.realm) + 1];
    const items = (realm.breakItems ?? []).map((id) => ({ id, name: this.itemName(id), have: !!this.state.inventory[id] }));
    const trib = realm.tribulation
      ? { name: realm.tribulation.name, bolts: realm.tribulation.bolts, survive: this.tribulationSurvival(realm) }
      : null;
    let heart: number | null = null;
    const ev = realm.heartDemon ? this.events.get(realm.heartDemon) : undefined;
    if (ev) {
      const chances = ev.options
        .filter((o) => o.check && !this.optionBlocked(o))
        .map((o) => this.checkChanceWith(o, this.heartDcBonus) ?? 0);
      heart = chances.length ? Math.max(...chances) : 0;
    }
    const core = realm.core
      ? {
        name: realm.core.name,
        rate: this.coreRate,
        aid: { name: this.itemName(realm.core.aid), have: !!this.state.inventory[realm.core.aid], bonus: CORE_AID_BONUS },
        ward: !!this.findWard(),
        lowHp: this.char.hp < this.combatStats.maxHp * 0.9,
        disturb: DISTURB_CHANCE,
      }
      : null;
    let rate: number;
    if (realm.heartDemon) rate = (core?.rate ?? 1) * (trib?.survive ?? 1) * (heart ?? 1);
    else {
      const { wuxing, xinjing } = this.char.attrs;
      const bonus = this.char.breakBonus + this.talentMods.breakBonus;
      rate = Math.min(0.95, realm.breakRate + wuxing * 0.01 + xinjing * 0.005 + bonus);
    }
    return { target: next ? next.name : '飞升', items, tribulation: trib, heart, core, rate, guide: this.breakGuide };
  }

  /** 本境界突破物品的线索。听过引路事件（本世或前世）后才知道出处 */
  get breakGuide(): BreakGuideView | null {
    const g = getRealm(this.char.realm).breakGuide;
    if (!g) return null;
    const known = !g.intro || this.state.seenEvents.includes(g.intro) || !!this.state.metaFlags[guideFlag(g.intro)];
    return {
      known,
      parts: (g.parts ?? []).map((p) => ({ name: this.itemName(p.id), where: p.where, have: !!this.state.inventory[p.id] })),
      how: g.how,
      unknown: g.unknown ?? '',
    };
  }

  get atMarket(): boolean {
    return !!getRegion(this.state.region).market;
  }

  item(id: string): ItemDef | undefined {
    return this.items.get(id);
  }

  itemName(id: string): string {
    return this.items.get(id)?.name ?? id;
  }

  getTechnique(id: string): TechniqueDef | undefined {
    return this.techniques.get(id);
  }

  /** 天材地宝不能出售 */
  canSell(id: string): boolean {
    const it = this.items.get(id);
    return !!it && it.type !== 'treasure';
  }

  sellPrice(id: string): number {
    if (!this.canSell(id)) return 0;
    return Math.floor((this.items.get(id)?.price ?? 0) / 2);
  }

  canEquip(id: string): boolean {
    const t = this.items.get(id)?.type;
    return t === 'weapon' || t === 'armor';
  }

  /**
   * 物品眼下为什么用不了：label 用于按钮（如"筑基可参悟"），reason 是完整说明。
   * 能用（或根本不是可用物品）时返回 null。
   */
  useBlock(id: string): { label: string; reason: string } | null {
    const it = this.items.get(id);
    if (!it) return null;
    const equip = this.canEquip(id);
    if (!equip && !this.canUseItem(id)) return null;
    const verb = equip ? (it.type === 'weapon' ? '祭炼' : '穿戴') : it.technique ? '参悟' : it.recipe ? '研读' : '服用';
    if (it.realm_min && realmIndex(this.char.realm) < realmIndex(it.realm_min)) {
      const realm = getRealm(it.realm_min).name;
      return { label: `${realm}可用`, reason: `需${realm}期方可${verb}` };
    }
    if (it.technique && this.char.technique === it.technique) return { label: '已在修习', reason: `你正在修习此功法` };
    if (it.recipe && this.knowsRecipe(it.recipe)) return { label: '已掌握', reason: '丹方已经记熟，留着无用，可到坊市卖掉' };
    if (it.use?.some((e) => e.type === 'unstuck') && !this.char.stuck) return { label: '瓶颈时用', reason: '卡在小境界瓶颈时服用' };
    return null;
  }

  canUseItem(id: string): boolean {
    const it = this.items.get(id);
    return !!it && (!!it.use || !!it.technique || !!it.recipe);
  }

  // ---------- 丹房 ----------

  get danExp(): number {
    return this.char.danExp ?? 0;
  }

  /** 丹师品级，1～9 */
  get danLevel(): number {
    return DAN_LEVELS.filter((x) => this.danExp >= x).length;
  }

  get danLabel(): string {
    return `${DAN_LEVEL_NAMES[this.danLevel - 1]}品丹师`;
  }

  /** 升到下一品还差的经验；九品时为 null */
  get danNext(): number | null {
    const next = DAN_LEVELS[this.danLevel];
    return next === undefined ? null : next - this.danExp;
  }

  /** 已掌握的配方：开局即会的加上研读过的，按品级排序 */
  get knownRecipes(): RecipeDef[] {
    const learned = new Set(this.state.recipes ?? []);
    return [...this.recipes.values()].filter((r) => r.basic || learned.has(r.id)).sort((a, b) => a.level - b.level);
  }

  knowsRecipe(id: string): boolean {
    return !!this.recipes.get(id)?.basic || (this.state.recipes ?? []).includes(id);
  }

  /** 成丹率：神识与丹师品级越高越稳，配方越难越容易炸炉 */
  alchemyRate(r: RecipeDef): number {
    const rate = 0.55 + 0.03 * (this.char.attrs.shenshi - 5) + 0.06 * (this.danLevel - r.level) - r.risk;
    return Math.max(0.05, Math.min(0.95, rate));
  }

  /** 成丹时出上品（多出丹）的概率 */
  private alchemyFineRate(r: RecipeDef): number {
    return Math.max(0, Math.min(0.6, 0.1 + 0.02 * this.char.attrs.shenshi + 0.05 * (this.danLevel - r.level)));
  }

  recipeView(r: RecipeDef): RecipeView {
    const ingredients = Object.entries(r.ingredients).map(([id, need]) => ({ id, name: this.itemName(id), need, have: this.state.inventory[id] ?? 0 }));
    const levelOk = this.danLevel >= r.level;
    return {
      recipe: r,
      product: this.items.get(r.product)!,
      ingredients,
      levelOk,
      ready: levelOk && ingredients.every((i) => i.have >= i.need),
      rate: this.alchemyRate(r),
    };
  }

  /** 检定成功概率，用于在选项上提示玩家。正在过心魔关时享受难度减免 */
  checkChance(opt: EventOption): number | null {
    return this.checkChanceWith(opt, this.checkDcBonus);
  }

  /** 检定的难度减免：冲关途中用丹药和天赋的减免，平时则是硬核档的统一加难（负数） */
  private get checkDcBonus(): number {
    return this.state.breaking ? this.heartDcBonus : -CHECK_DC_SHIFT.value;
  }

  private checkChanceWith(opt: EventOption, dcBonus: number): number | null {
    if (!opt.check) return null;
    const need = opt.check.dc - dcBonus - this.char.attrs[opt.check.attr];
    return Math.max(0, Math.min(1, (11 - need) / 10));
  }

  /** 选项不满足条件时返回原因，满足时返回 null */
  optionBlocked(opt: EventOption): string | null {
    const r = opt.requires;
    if (!r) return null;
    if (r.stones && this.char.stones < r.stones) return `需 ${r.stones} 灵石`;
    for (const [id, n] of Object.entries(r.items ?? {})) {
      if ((this.state.inventory[id] ?? 0) < n) return `需【${this.itemName(id)}】${n > 1 ? `×${n}` : ''}`;
    }
    const flagsOk = (r.flags ?? []).every((f) => this.state.flags[f]);
    const metaOk = (r.meta_flags ?? []).every((f) => this.state.metaFlags[f]);
    if (!flagsOk || !metaOk) return r.hint ?? '条件不足';
    return null;
  }

  // ---------- 玩家行动 ----------

  closedDoor(months: number): void {
    if (!this.idle) return;
    if (this.char.stuck) return this.ponderBottleneck(months);
    let gain = Math.round(months * this.gainPerMonth);
    this.stamp();
    this.log('text', `你闭关静修${monthsLabel(months)}。`);
    const o = this.state.offline!;
    if (o.reserve > 0) {
      const used = Math.min(o.reserve, OFFLINE_PER_DOOR);
      const bonus = Math.round((gain * OFFLINE_BONUS * used) / OFFLINE_PER_DOOR);
      o.reserve -= used;
      if (bonus > 0) {
        this.log('system', `洞府中积聚的灵气汇入经脉（储备剩余 ${durationLabel(o.reserve)}）。`);
        gain += bonus;
      }
    }
    // 先发闭关信号，突破信号（若有）排在后面播放
    const door = { type: 'door' as const, months, gain, ageFrom: this.ageYears, ageTo: Math.floor((this.char.ageMonths + months) / 12), bottleneck: false };
    this.signals.push(door);
    this.addCultivation(gain);
    door.bottleneck = this.canBreakthrough || this.canAdvanceStage;
    // 闭关静养，伤好得更快
    if (this.char.injury) this.char.injury = Math.max(0, this.char.injury - INJURY_DOOR_BONUS_PER_MONTH * months);
    this.passTime(months);
    this.sync();
  }

  explore(): void {
    if (!this.idle) return;
    const [min, max] = getRealm(this.char.realm).exploreMonths;
    this.passTime(this.rng.int(min, max));
    if (this.state.dead) return this.sync();
    this.stamp();
    this.gatherHerb();
    // 最近刚遇过的事件不容易再遇到，减轻重复感
    const recent = (this.state.recentEvents ??= []);
    const decay = (id: string) => {
      const i = recent.lastIndexOf(id);
      return i < 0 ? 1 : 0.1 + (0.9 * (recent.length - 1 - i)) / RECENT_SIZE;
    };
    const ev = this.rng.pickWeighted(this.eventPool(), (e) => (e.weight ?? 1) * decay(e.id));
    if (ev) {
      recent.push(ev.id);
      if (recent.length > RECENT_SIZE) recent.shift();
    }
    if (ev) this.trigger(ev);
    else this.log('text', `你在${getRegion(this.state.region).name}四处游历，一路平静，无事发生。`);
    this.sync();
  }

  travel(regionId: string): void {
    if (!this.idle || regionId === this.state.region) return;
    this.state.region = regionId;
    this.passTime(1);
    if (this.state.dead) return this.sync();
    const region = getRegion(regionId);
    this.stamp();
    this.log('text', `你动身前往${region.name}。${region.desc}`);
    this.signals.push({ type: 'travel', id: region.id, region: region.name, desc: region.desc });
    this.sync();
  }

  choose(index: number): void {
    const ev = this.pendingEvent;
    const opt = ev?.options[index];
    if (!ev || !opt || this.state.dead || this.optionBlocked(opt)) return;
    this.state.pendingEventId = null;
    this.log('system', `▸ ${opt.text}`);

    let outcome: Outcome = opt;
    if (opt.check) {
      const attr = this.char.attrs[opt.check.attr];
      const roll = this.rng.int(1, 10);
      const bonus = this.checkDcBonus;
      const ok = roll + attr + bonus >= opt.check.dc;
      // 只把心魔关的减免写出来；平时的统一加难算进难度里，不单独显示
      const extra = bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : '';
      this.log('system', `（${ATTR_NAMES[opt.check.attr]}检定 ${roll}+${attr}${extra}，${ok ? '成功' : '失败'}）`);
      outcome = (ok ? opt.success : opt.fail) ?? {};
    } else if (opt.battle) {
      if (opt.result) this.log('text', opt.result);
      outcome = this.fight(opt.battle);
    }
    this.attrSource = ev.once ? null : ev.id;
    this.cultSource = { realm: ev.conditions?.realm_min ?? 'lianqi' };
    this.applyOutcome(outcome);
    this.cultSource = null;
    this.attrSource = null;
    // 冲关途中的外扰处理完了，接着冲关
    if (this.state.breaking && this.state.breakStage === 'disturb' && !this.state.pendingEventId && !this.state.dead) this.coreStage();
    this.sync();
  }

  /**
   * 突破。卡在小境界瓶颈时为冲击瓶颈；修为圆满时冲击大境界：
   * 炼气掷骰；其余依次过三道关：材料 → 天劫（若有）→ 心魔（触发事件，由选项决定成败）。
   */
  breakthrough(): void {
    if (!this.idle) return;
    if (this.char.stuck) return this.breakBottleneck();
    if (this.canAdvanceStage) return this.advanceStage();
    if (!this.canBreakthrough) return;
    const realm = getRealm(this.char.realm);
    const next = REALMS[realmIndex(this.char.realm) + 1];
    const target = next ? next.name : '飞升';
    const missing = this.missingBreakItems;
    if (missing.length) {
      this.log('bad', `${next ? `突破${target}` : target}需要${missing.map((id) => `【${this.itemName(id)}】`).join('')}，你还没有。`);
      const g = this.breakGuide;
      if (g) {
        const parts = g.parts.length ? `${g.parts.map((p) => `${p.have ? '✓' : '✗'}${p.name}（${p.where}）`).join('、')}。` : '';
        this.log('system', g.known ? `${parts}${g.how}。` : g.unknown);
      }
      return this.sync();
    }
    for (const id of realm.breakItems ?? []) this.addItem(id, -1, true);

    if (!realm.heartDemon) return this.diceBreakthrough(realm, target);

    this.state.breaking = next ? next.id : 'ascend';
    this.state.breakStage = null;
    this.stamp();
    if (realm.breakItems?.length) {
      this.log('text', `你服下${realm.breakItems.map((id) => `【${this.itemName(id)}】`).join('')}，闭关冲击${target}。`);
    }
    if (!realm.core) {
      this.passTime(1);
      if (!this.state.dead) this.afterCore();
      return this.sync();
    }
    // 闭关途中可能遭遇外扰；布下护阵旗可挡
    if (this.rng.chance(DISTURB_CHANCE)) {
      const ward = this.findWard();
      const pool = this.content.events.filter((e) => e.id.startsWith(DISTURB_PREFIX) && this.meetsConditions(e));
      if (ward) {
        this.addItem(ward.id, -1, true);
        this.log('good', `洞府外的【${ward.name}】嗡然一震，替你挡下了一场打扰。`);
      } else if (pool.length) {
        this.state.breakStage = 'disturb';
        this.trigger(this.rng.pickWeighted(pool, (e) => e.weight ?? 1)!);
        return this.sync();
      }
    }
    this.coreStage();
    this.sync();
  }

  /** 冲关第一步：闭关凝丹、碎丹成婴……按准备情况掷成败 */
  private coreStage(): void {
    const realm = getRealm(this.char.realm);
    const core = realm.core!;
    const rate = this.coreRate;
    if (this.state.inventory[core.aid]) {
      this.addItem(core.aid, -1, true);
      this.log('text', `你服下【${this.itemName(core.aid)}】，药力化开，护住周身经脉。`);
    }
    this.state.breakStage = null;
    this.passTime(realm.doorOptions[0]);
    if (this.state.dead) return;
    this.log('system', `（${core.name}，成功率 ${Math.round(rate * 100)}%）`);
    if (!this.rng.chance(rate)) {
      this.log('bad', `${core.name}到了最后关头，灵力骤然溃散！`);
      return this.qiDeviation();
    }
    const nextStep = realm.tribulation ? realm.tribulation.name : '心魔关';
    this.log('good', `${core.name}功成！可这只是第一步，${nextStep}已在前头等着。`);
    this.signals.push({ type: 'breakCore', name: core.name, next: nextStep });
    this.afterCore();
  }

  /** 冲关之后：天劫，再心魔关 */
  private afterCore(): void {
    const realm = getRealm(this.char.realm);
    const target = this.state.breaking!;
    if (realm.tribulation && !this.endureTribulation(realm)) {
      this.state.breaking = null;
      this.state.breakStage = null;
      return;
    }
    const ev = realm.heartDemon ? this.events.get(realm.heartDemon) : undefined;
    if (!ev) {
      // 没有心魔事件（测试或内容缺失）时直接算通过
      this.completeBreakthrough(target);
      return;
    }
    this.state.breakStage = 'heart';
    this.trigger(ev);
  }

  /** 行囊里的护阵旗 */
  private findWard(): ItemDef | undefined {
    return Object.keys(this.state.inventory).map((id) => this.items.get(id)).find((it) => it?.breakWard);
  }

  /** 炼气突破筑基：掷骰决定成败 */
  private diceBreakthrough(realm: RealmDef, target: string): void {
    const rate = this.breakthroughRate;
    this.char.breakBonus = 0;
    this.passTime(1);
    if (this.state.dead) return this.sync();
    this.stamp();
    if (this.rng.chance(rate)) {
      this.advanceRealm();
    } else {
      this.markBreakSetback();
      const lostCult = Math.floor(this.char.cultivation * 0.3);
      const lostYears = this.rng.int(...realm.breakPenalty);
      this.char.cultivation -= lostCult;
      this.char.lifespanPenalty += lostYears;
      this.log('bad', `冲击${target}失败！灵力反噬，修为 -${lostCult}，寿元 -${lostYears} 年。`);
      this.signals.push({ type: 'breakFail' });
      this.checkLifespan('backlash');
    }
    this.sync();
  }

  /** 天劫：一道道天雷劈下，只能硬扛。撑过返回 true；被劈倒则殒命或重伤，返回 false */
  private endureTribulation(realm: RealmDef): boolean {
    const t = realm.tribulation!;
    const s = this.combatStats;
    let hp = Math.min(this.char.hp, s.maxHp);
    let def = s.def;
    let ward = 0;
    const replay: BattleReplay = {
      enemyId: 'tribulation', enemyName: t.name, pName: this.char.name, pVerb: '', eVerb: '天雷劈落',
      pMaxHp: s.maxHp, pHp0: hp, pMaxMp: 0, eMaxHp: t.bolts, eHp0: t.bolts,
      opening: [], steps: [], result: 'draw', tribulation: true,
    };
    this.log('title', `【${t.name}】`);
    this.log('art', 'tribulation');
    this.log('text', '劫云压顶，方圆百里一片死寂。第一道天雷，已在云中翻滚。');
    this.useTalisman('guard', (v, name) => {
      def += v;
      replay.opening.push({ kind: 'guard', name, value: v });
      this.log('battle', `你拍出【${name}】，周身泛起一层金光，防御 +${v}。`);
    });
    const wardItem = this.findTalisman('ward');
    if (wardItem) {
      this.addItem(wardItem.id, -1, true);
      ward = wardItem.talisman!.value / 100;
      replay.opening.push({ kind: 'guard', name: wardItem.name, value: wardItem.talisman!.value });
      this.log('battle', `你祭起【${wardItem.name}】，雷光落下时被卸去了 ${wardItem.talisman!.value}%。`);
    }
    let survived = true;
    for (let i = 0; i < t.bolts; i++) {
      const dmg = boltDamage(t, i, def, ward, 0.7 + this.rng.next() * 0.6);
      hp = Math.max(0, hp - dmg);
      replay.steps.push({ by: 'e', dmg, crit: i === t.bolts - 1, pHp: hp, eHp: t.bolts - i - 1, pMp: 0 });
      this.log('battle', `第 ${i + 1} 道天雷劈落，你损失 ${dmg} 点气血。`);
      if (hp <= 0) {
        survived = false;
        break;
      }
    }
    replay.result = survived ? 'win' : 'lose';
    this.signals.push({ type: 'battle', replay });
    if (survived) {
      this.char.hp = hp;
      this.log('good', `${t.bolts} 道天雷尽数落下，你浑身焦黑，却还站着！（气血 ${hp}/${s.maxHp}）`);
      return true;
    }
    this.char.hp = 1;
    this.char.breakBonus = 0;
    if (this.rng.chance(t.killChance)) {
      replay.aftermath = { kind: 'killed' };
      this.die(`${this.char.name}没能撑过${t.name}，于 ${this.ageYears} 岁形神俱灭，止步${this.realmLabel}。`, 'tribulation');
      return false;
    }
    replay.aftermath = { kind: 'fled' };
    this.markBreakSetback();
    const lostCult = Math.floor(this.char.cultivation * 0.5);
    const lostYears = this.rng.int(...realm.breakPenalty);
    this.char.cultivation -= lostCult;
    this.char.lifespanPenalty += lostYears;
    this.log('bad', `天雷将你劈落尘埃。你拼着最后一口气护住了元神，修为 -${lostCult}，寿元 -${lostYears} 年。`);
    this.checkLifespan('backlash');
    return false;
  }

  /** 天劫预估撑过的概率（固定种子模拟，界面上数值稳定） */
  private tribulationSurvival(realm: RealmDef): number {
    const t = realm.tribulation;
    if (!t) return 1;
    const s = this.combatStats;
    const hp0 = Math.min(this.char.hp, s.maxHp);
    const def = s.def + (this.findTalisman('guard')?.talisman?.value ?? 0);
    const ward = (this.findTalisman('ward')?.talisman?.value ?? 0) / 100;
    const rng = Rng.fromSeed(12345);
    const N = 200;
    let ok = 0;
    for (let k = 0; k < N; k++) {
      let hp = hp0;
      for (let i = 0; i < t.bolts && hp > 0; i++) hp -= boltDamage(t, i, def, ward, 0.7 + rng.next() * 0.6);
      if (hp > 0) ok++;
    }
    return ok / N;
  }

  /** 心魔关通过：踏入新境界或飞升 */
  private completeBreakthrough(target: RealmId | 'ascend'): void {
    this.state.breaking = null;
    this.state.breakStage = null;
    this.char.breakBonus = 0;
    if (target === 'ascend') this.ascend();
    else this.advanceRealm();
  }

  /** 心魔关失败：走火入魔，跌落一个小境界 */
  private qiDeviation(): void {
    const realm = getRealm(this.char.realm);
    this.state.breaking = null;
    this.state.breakStage = null;
    this.char.breakBonus = 0;
    this.markBreakSetback();
    const c = this.char;
    c.stage = Math.max(0, c.stage - 1);
    c.cultivation = Math.floor(this.stageReq * 0.5);
    const lostYears = this.rng.int(...realm.breakPenalty);
    c.lifespanPenalty += lostYears;
    c.hp = 1;
    this.log('bad', `走火入魔！你经脉逆行，境界跌落至${this.realmLabel}，寿元 -${lostYears} 年。`);
    this.signals.push({ type: 'breakFail' });
    this.checkLifespan('backlash');
  }

  /** 冲击下一个小境界：顺利则晋升，否则撞上瓶颈 */
  private advanceStage(): void {
    const c = this.char;
    const realm = getRealm(c.realm);
    const from = this.realmLabel;
    const to = this.nextStageLabel;
    const chance = this.nextStageMustStick ? 1 : realm.bottleneck;
    this.passTime(1);
    if (this.state.dead) return this.sync();
    this.stamp();
    this.log('text', `你凝神运转周天，冲击${to}……`);
    if (this.rng.chance(chance)) {
      c.stuck = true;
      c.stuckTries = 0;
      // 冲到关口前多远被弹回：只是演出用
      const reach = 0.55 + this.rng.next() * 0.4;
      this.log('bad', `灵力冲到关口前，被一层无形的壁障弹了回来——你卡在了${from}的瓶颈上。`);
      const pill = realm.bottleneckPill ? `【${this.itemName(realm.bottleneckPill)}】` : null;
      this.log('system', pill
        ? `点"破瓶颈"冲关。服${pill}把握大增（冲关时自动服用）；硬冲失败会反噬折寿。闭关苦参、机缘顿悟也有帮助。`
        : '点"破瓶颈"冲关，多冲几次总能摸到门道；闭关苦参也能增加把握。');
      this.signals.push({ type: 'stage', from, to, ok: false, bottleneck: false, reach, pill: false });
    } else {
      this.stageUp();
      this.signals.push({ type: 'stage', from, to, ok: true, bottleneck: false, reach: 1, pill: false });
    }
    this.sync();
  }

  /** 晋升一个小境界：修为归零，丹毒清空 */
  private stageUp(): void {
    const c = this.char;
    c.stage++;
    c.cultivation = 0;
    this.state.pillUses = {};
    this.log('good', `修为精进，晋升${this.realmLabel}！`);
  }

  /** 冲击小境界瓶颈 */
  private breakBottleneck(): void {
    const realm = getRealm(this.char.realm);
    // 冲关耗时约为本境界寿元上限的 1%，一年以上取整到年
    let months = Math.max(6, Math.round(realm.lifespan * 12 * STUCK_TIME_RATIO));
    if (months >= 12) months = Math.round(months / 12) * 12;
    const rate = this.bottleneckRate;
    const pill = this.hasBottleneckPill ? this.bottleneckPill! : null;
    if (pill) this.addItem(pill, -1, true);
    this.passTime(months);
    if (this.state.dead) return this.sync();
    this.stamp();
    this.log('text', `你${pill ? `服下【${this.itemName(pill)}】，` : ''}闭关${monthsLabel(months)}，全力冲击${this.realmLabel}的瓶颈……`);
    const from = this.realmLabel;
    const to = this.nextStageLabel;
    if (this.rng.chance(rate)) {
      this.unstick();
      this.signals.push({ type: 'stage', from, to, ok: true, bottleneck: true, reach: 1, pill: !!pill });
    } else {
      this.signals.push({ type: 'stage', from, to, ok: false, bottleneck: true, reach: 0.7 + this.rng.next() * 0.28, pill: !!pill });
      this.char.stuckTries = (this.char.stuckTries ?? 0) + 1;
      if (!pill && this.bottleneckPill) {
        // 不服丹硬冲，失败会反噬（没有瓶颈丹的境界不罚）
        const lost = Math.max(1, Math.round(realm.lifespan * STUCK_BACKLASH_RATIO));
        this.char.lifespanPenalty += lost;
        this.char.hp = Math.max(1, this.char.hp - Math.round(this.combatStats.maxHp * STUCK_BACKLASH_HP));
        this.log('bad', `没有丹药护持，强冲之下灵力反噬，经脉受创，寿元 -${lost} 年。`);
      }
      this.log('bad', `瓶颈纹丝不动。不过你隐约摸到了一丝门道。（下次成功率 ${Math.round(this.bottleneckRate * 100)}%）`);
      const id = this.bottleneckPill;
      if (id && !this.hasBottleneckPill) this.log('system', `没有【${this.itemName(id)}】，瓶颈很难冲开。坊市偶尔有卖，也可以在丹房自己炼。`);
    }
    this.checkLifespan('backlash');
    this.sync();
  }

  /** 卡瓶颈时闭关：修为不涨，但能参悟瓶颈，提高冲关成功率 */
  private ponderBottleneck(months: number): void {
    this.stamp();
    this.log('text', `你闭关静修${monthsLabel(months)}，修为却卡在瓶颈前寸步难进。`);
    const gainTries = Math.max(1, Math.round(months / Math.max(1, getRealm(this.char.realm).doorOptions[0])));
    this.char.stuckTries = (this.char.stuckTries ?? 0) + gainTries;
    this.log('system', `苦参良久，你对这道瓶颈看得更清楚了。（冲击瓶颈成功率 ${Math.round(this.bottleneckRate * 100)}%）`);
    this.signals.push({ type: 'door', months, gain: 0, ageFrom: this.ageYears, ageTo: Math.floor((this.char.ageMonths + months) / 12), bottleneck: true });
    this.passTime(months);
    this.sync();
  }

  /** 打破瓶颈：进入下一个小境界 */
  private unstick(): void {
    const c = this.char;
    c.stuck = false;
    c.stuckTries = 0;
    this.log('good', '瓶颈豁然贯通！');
    this.stageUp();
  }

  /** 开炉炼丹：消耗药材和时间，成丹或炸炉都长丹道经验 */
  brew(recipeId: string): void {
    const r = this.recipes.get(recipeId);
    if (!this.idle || !r || !this.knowsRecipe(r.id)) return;
    const view = this.recipeView(r);
    if (!view.ready) return;
    const name = view.product.name;
    for (const i of view.ingredients) this.addItem(i.id, -i.need, true);
    const herbs = Object.fromEntries(view.ingredients.map((i) => [i.id, i.need]));
    this.stamp();
    this.log('text', `你在丹房开炉，炼制【${name}】。药材入炉，文火慢煨${monthsLabel(r.months)}。`);
    const rate = view.rate;
    const ok = this.rng.chance(rate);
    const levelBefore = this.danLevel;
    let count = 0;
    let fine = false;
    if (ok) {
      fine = this.rng.chance(this.alchemyFineRate(r));
      count = fine ? r.yield[1] : r.yield[0];
      this.char.danExp = this.danExp + 2 ** (r.level - 1);
      this.log('good', fine ? `丹成之时异香满室，竟是上品！得【${name}】×${count}` : `开炉，丹成。得【${name}】×${count}`);
      this.addItem(r.product, count, true);
    } else {
      this.char.danExp = this.danExp + Math.ceil(2 ** (r.level - 1) / 2);
      this.char.hp = Math.max(1, this.char.hp - Math.round(this.combatStats.maxHp * 0.15));
      this.log('bad', '火候失控，丹炉轰然炸开，一炉药材化作焦灰。你被炉火燎伤，所幸摸到了几分门道。');
    }
    if (this.danLevel > levelBefore) this.log('good', `丹道精进，你已是【${this.danLabel}】。`);
    this.signals.push({ type: 'alchemy', product: r.product, name, months: r.months, count, fine });
    this.passTime(r.months);
    if (!ok && !this.state.dead) this.state.setback = { kind: 'brew', at: this.char.ageMonths, herbs };
    this.sync();
  }

  useItem(id: string): void {
    const it = this.items.get(id);
    if (!this.canPrepare || !it || !this.state.inventory[id] || !this.canUseItem(id)) return;
    if (it.realm_min && realmIndex(this.char.realm) < realmIndex(it.realm_min)) {
      this.log('bad', `你修为尚浅，还用不了【${it.name}】。`);
      return this.sync();
    }
    if (it.recipe) {
      if (this.knowsRecipe(it.recipe)) {
        this.log('system', `${it.name}上的炼法你早已烂熟于心。`);
        return this.sync();
      }
      this.addItem(id, -1, true);
      (this.state.recipes ??= []).push(it.recipe);
      this.log('good', `你研读${it.name}，记下了炼法。今后可在丹房炼制【${this.itemName(this.recipes.get(it.recipe)?.product ?? '')}】。`);
      return this.sync();
    }
    if (it.technique) {
      const t = this.techniques.get(it.technique);
      if (!t) return;
      if (this.char.technique === t.id) {
        this.log('system', `你早已修习《${t.name}》。`);
        return this.sync();
      }
      this.addItem(id, -1, true);
      this.char.technique = t.id;
      this.log('good', `你参悟【${it.name}】，改修《${t.name}》。修炼速度变为 ${this.gainPerMonth} / 月。`);
    } else {
      if (it.use?.some((e) => e.type === 'unstuck') && !this.char.stuck) {
        this.log('system', `你眼下并未遇到瓶颈，【${it.name}】还是留着吧。`);
        return this.sync();
      }
      this.addItem(id, -1, true);
      this.log('text', `你服下【${it.name}】。`);
      this.cultSource = { realm: it.realm_min ?? 'lianqi', pill: it.id };
      for (const eff of it.use ?? []) this.applyEffect(eff);
      this.cultSource = null;
    }
    this.sync();
  }

  /** 穿戴装备，原有的同类装备放回行囊 */
  equip(id: string): void {
    const it = this.items.get(id);
    if (!this.canPrepare || !it || !this.state.inventory[id] || !this.canEquip(id)) return;
    if (it.realm_min && realmIndex(this.char.realm) < realmIndex(it.realm_min)) {
      this.log('bad', `你修为尚浅，驾驭不了【${it.name}】。`);
      return this.sync();
    }
    const slot = it.type as 'weapon' | 'armor';
    const prev = this.char.equip[slot];
    this.addItem(id, -1, true);
    if (prev) this.addItem(prev, 1, true);
    this.char.equip[slot] = id;
    this.log('text', `你${slot === 'weapon' ? '祭炼' : '穿上'}了【${it.name}】。`);
    this.char.hp = Math.min(this.char.hp, this.combatStats.maxHp);
    this.sync();
  }

  buy(id: string): void {
    const it = this.items.get(id);
    const stock = this.state.shop.stock;
    if (!this.idle || !this.atMarket || !it || !stock[id] || this.char.stones < it.price) return;
    stock[id]--;
    this.char.stones -= it.price;
    this.addItem(id, 1, true);
    this.log('text', `你花费 ${it.price} 灵石，购得【${it.name}】。`);
    this.sync();
  }

  /** 卖出若干件，不指定数量时整组卖出 */
  sell(id: string, n?: number): void {
    const have = this.state.inventory[id];
    if (!this.idle || !this.atMarket || !have || !this.canSell(id)) return;
    const count = Math.max(1, Math.min(have, Math.floor(n ?? have)));
    const price = this.sellPrice(id) * count;
    this.addItem(id, -count, true);
    this.char.stones += price;
    this.log('text', `你卖出【${this.itemName(id)}】×${count}，得灵石 ${price}。`);
    this.sync();
  }

  // ---------- 内部 ----------

  /** 历练途中顺手采药 */
  private gatherHerb(): void {
    const herbs = getRegion(this.state.region).herbs;
    if (!herbs?.length || !this.rng.chance(HERB_CHANCE)) return;
    const [id] = this.rng.pickWeighted(herbs, (h) => h[1])!;
    if (!this.items.has(id)) return;
    const n = this.rng.chance(0.25 + this.char.attrs.jiyuan * 0.02) ? 2 : 1;
    this.log('good', `途中顺手采得【${this.itemName(id)}】×${n}`);
    this.addItem(id, n, true);
  }

  private eventPool(): EventDef[] {
    const { region, seenEvents } = this.state;
    return this.content.events.filter(
      (e) =>
        e.region?.includes(region) &&
        !(e.once && seenEvents.includes(e.id)) &&
        this.meetsConditions(e),
    );
  }

  private meetsConditions(e: EventDef): boolean {
    const c = e.conditions;
    if (!c) return true;
    const ri = realmIndex(this.char.realm);
    if (c.realm_min && ri < realmIndex(c.realm_min)) return false;
    if (c.realm_max && ri > realmIndex(c.realm_max)) return false;
    if (c.life_min && this.state.life < c.life_min) return false;
    if (c.flags?.some((f) => !this.state.flags[f])) return false;
    if (c.not_flags?.some((f) => this.state.flags[f])) return false;
    if (c.meta_flags?.some((f) => !this.state.metaFlags[f])) return false;
    if (c.not_meta_flags?.some((f) => this.state.metaFlags[f])) return false;
    if (c.has_items?.some((id) => !this.state.inventory[id])) return false;
    if (c.stuck !== undefined && c.stuck !== !!this.char.stuck) return false;
    return true;
  }

  private trigger(ev: EventDef): void {
    if (!this.state.seenEvents.includes(ev.id)) this.state.seenEvents.push(ev.id);
    // 听过突破物品的线索，转世后也记得
    if (REALMS.some((r) => r.breakGuide?.intro === ev.id)) this.state.metaFlags[guideFlag(ev.id)] = true;
    this.log('title', `【${ev.title}】`);
    if (ev.art) this.log('art', ev.art);
    this.log('text', ev.text);
    if (ev.options.length) this.state.pendingEventId = ev.id;
  }

  private fight(battle: NonNullable<EventOption['battle']>): Outcome {
    const enemy = this.enemies.get(battle.enemy);
    if (!enemy) return {};
    const s = this.combatStats;
    const me = this.playerFighter();
    const foe = this.enemyFighter(enemy);
    const replay: BattleReplay = {
      enemyId: enemy.id, enemyName: enemy.name, pName: this.char.name, pVerb: me.verb, eVerb: enemy.verb,
      pMaxHp: s.maxHp, pHp0: me.hp, pMaxMp: s.maxMp, eMaxHp: foe.maxHp, eHp0: foe.hp,
      opening: [], steps: [], result: 'draw',
    };
    // 符箓按比例生效：伤害符打掉敌人最大气血的若干成，护身符提高若干成防御
    this.useTalisman('damage', (v, name) => {
      const dmg = Math.max(1, Math.round((foe.maxHp * v) / 100));
      foe.hp = Math.max(1, foe.hp - dmg);
      replay.opening.push({ kind: 'damage', name, value: dmg });
      this.log('battle', `你祭出【${name}】，${enemy.name}损失 ${dmg} 点气血。`);
    });
    this.useTalisman('guard', (v, name) => {
      const add = Math.max(1, Math.round((me.def * v) / 100));
      me.def += add;
      replay.opening.push({ kind: 'guard', name, value: add });
      this.log('battle', `你拍出【${name}】，周身泛起一层金光，防御 +${add}。`);
    });
    replay.eHp0 = foe.hp;
    const result = runBattle(me, foe, this.rng, (t) => this.log('battle', t), (step) => replay.steps.push(step));
    replay.result = result;
    this.char.hp = Math.max(1, me.hp);
    this.signals.push({ type: 'battle', replay });

    if (result === 'lose') {
      const escape = this.findTalisman('escape');
      if (escape) {
        replay.aftermath = { kind: 'escape', talisman: escape.name };
        this.addItem(escape.id, -1, true);
        this.char.hp = Math.max(this.char.hp, 1);
        this.log('text', `眼看不敌，你捏碎【${escape.name}】，化作一道黄光遁走。`);
        return {};
      }
    }

    if (result === 'win') {
      this.log('good', `你击败了${enemy.name}！（气血 ${this.char.hp}/${s.maxHp}）`);
      // 险胜（剩不到两成五）也会受些内伤
      if (this.char.hp < s.maxHp * 0.25) this.addInjury(INJURY_NARROW, '这一战赢得惨烈，你受了些内伤。');
      return battle.win ?? {};
    }
    if (result === 'draw') {
      this.log('text', `久战不下，双方各自退去。（气血 ${this.char.hp}/${s.maxHp}）`);
      return {};
    }
    this.char.hp = 1;
    if (this.rng.chance(enemy.killChance ?? TIER_KILL[enemy.tier ?? 'normal'])) {
      replay.aftermath = { kind: 'killed' };
      this.die(`${this.char.name}陨落于${enemy.name}之手，享年 ${this.ageYears} 岁，止步${this.realmLabel}。`, 'battle');
      return {};
    }
    replay.aftermath = { kind: 'fled' };
    this.log('bad', `你不敌${enemy.name}，身受重伤，拼死逃脱。`);
    this.addInjury(INJURY_LOSE, '伤及经脉，气血上限暂时降低，闭关静养好得更快。');
    return battle.lose ?? {};
  }

  /** 玩家的出战状态 */
  private playerFighter(): Fighter {
    const s = this.combatStats;
    return {
      name: '你', verb: '挥掌击出', hp: Math.min(this.char.hp, s.maxHp), maxHp: s.maxHp,
      mp: s.maxMp, atk: s.atk, def: s.def, spd: s.spd, crit: s.crit, spell: this.technique?.spell,
    };
  }

  /** 按玩家当前的小层算出敌人的实际强度 */
  private enemyFighter(enemy: EnemyDef): Fighter {
    if (enemy.fixed) {
      return { name: enemy.name, verb: enemy.verb, hp: enemy.hp, maxHp: enemy.hp, mp: 0, atk: enemy.atk, def: enemy.def, spd: enemy.spd, crit: 0.05, traits: enemy.traits };
    }
    const realm: RealmId = enemy.realm ?? 'lianqi';
    const pr = realmIndex(this.char.realm);
    const er = realmIndex(realm);
    const last = getRealm(realm).stageNames.length - 1;
    const stage = pr === er ? this.char.stage : pr > er ? last : 0;
    const ref = this.referenceStats(realm, stage);
    const t = TIER_MULT[enemy.tier ?? 'normal'];
    const p = this.enemyProfile.get(enemy.id) ?? { hp: 1, atk: 1, def: 1, spd: 1 };
    const hp = Math.round(ref.maxHp * t.hp * p.hp);
    return {
      name: enemy.name, verb: enemy.verb, hp, maxHp: hp, mp: 0,
      atk: Math.round(ref.atk * t.atk * p.atk), def: Math.round(ref.def * t.def * p.def),
      spd: Math.round((ref.spd + t.spd) * (0.85 + 0.15 * p.spd)), crit: enemy.tier === 'boss' ? 0.1 : 0.05,
      traits: enemy.traits,
    };
  }

  /** 标准修士：某境界某小层、属性 6、穿着本境界最好的兵器和护具 */
  private referenceStats(realmId: RealmId, stage: number): CombatStats {
    const realm = getRealm(realmId);
    const stageMult = 1 + stage * 0.12;
    const gear = (slot: 'weapon' | 'armor') => {
      const list = this.content.items.filter((i) => i.type === slot && i.realm_min === realmId);
      return list.reduce<ItemDef | undefined>((best, i) => ((i.stats?.atk ?? 0) + (i.stats?.def ?? 0) * 3 > (best?.stats?.atk ?? 0) + (best?.stats?.def ?? 0) * 3 ? i : best), undefined)?.stats;
    };
    const w = gear('weapon');
    const a = gear('armor');
    return {
      maxHp: Math.round(realm.hp * stageMult * 1.3) + (a?.hp ?? 0),
      maxMp: Math.round(realm.mp * stageMult),
      atk: Math.round(realm.atk * stageMult) + (w?.atk ?? 0),
      def: Math.round(realm.atk * stageMult * 0.4 * 1.18) + (a?.def ?? 0),
      spd: 16 + realmIndex(realmId) * 5,
      crit: 0.11,
    };
  }

  /** 开战前的胜算预估（固定种子模拟，界面上数值稳定）。会算上身上的符箓，但不消耗 */
  battleChance(enemyId: string): number {
    const enemy = this.enemies.get(enemyId);
    if (!enemy) return 0;
    const dmgT = this.findTalisman('damage')?.talisman?.value ?? 0;
    const guardT = this.findTalisman('guard')?.talisman?.value ?? 0;
    const rng = Rng.fromSeed(4242);
    let win = 0;
    for (let k = 0; k < BATTLE_PREVIEW_RUNS; k++) {
      const me = this.playerFighter();
      const foe = this.enemyFighter(enemy);
      if (dmgT) foe.hp = Math.max(1, foe.hp - Math.round((foe.maxHp * dmgT) / 100));
      if (guardT) me.def += Math.round((me.def * guardT) / 100);
      if (runBattle(me, foe, rng, () => {}) === 'win') win++;
    }
    return win / BATTLE_PREVIEW_RUNS;
  }

  /** 加重伤势（气血上限按比例降低） */
  private addInjury(amount: number, text: string): void {
    const c = this.char;
    c.injury = Math.min(INJURY_CAP, (c.injury ?? 0) + amount);
    c.hp = Math.min(c.hp, this.combatStats.maxHp);
    this.log('bad', `${text}（伤势 ${Math.round(c.injury * 100)}%）`);
  }

  /** 敌人档次的名称（普通敌人为空） */
  enemyTier(enemyId: string): string {
    const t = this.enemies.get(enemyId)?.tier;
    return t === 'elite' ? '精英' : t === 'boss' ? '首领' : '';
  }

  /** 当前伤势（0～0.6） */
  get injury(): number {
    return this.char.injury ?? 0;
  }

  private findTalisman(kind: 'damage' | 'guard' | 'escape' | 'ward'): ItemDef | undefined {
    return Object.keys(this.state.inventory)
      .map((id) => this.items.get(id))
      .filter((it): it is ItemDef => it?.talisman?.kind === kind)
      .sort((a, b) => b.talisman!.value - a.talisman!.value)[0];
  }

  /** 战斗开始时祭出最强的一张同类符箓 */
  private useTalisman(kind: 'damage' | 'guard', apply: (value: number, name: string) => void): void {
    const it = this.findTalisman(kind);
    if (!it) return;
    this.addItem(it.id, -1, true);
    apply(it.talisman!.value, it.name);
  }

  private applyOutcome(outcome: Outcome): void {
    if (outcome.result) this.log('text', outcome.result);
    for (const eff of outcome.effects ?? []) this.applyEffect(eff);
    if (this.state.dead) return;
    if (outcome.next) {
      const next = this.events.get(outcome.next);
      if (next) this.trigger(next);
    }
  }

  private applyEffect(eff: Effect): void {
    switch (eff.type) {
      case 'cultivation':
        this.addCultivation(this.scaleCultivation(eff.value));
        break;
      case 'lifespan':
        this.char.lifespanPenalty -= eff.value;
        this.log(eff.value >= 0 ? 'good' : 'bad', `寿元 ${signed(eff.value)} 年`);
        this.checkLifespan('injury');
        break;
      case 'attr': {
        // 可重复的事件，属性只在本世第一次生效，免得反复刷属性
        const src = this.attrSource;
        if (src && eff.value > 0) {
          const done = (this.state.attrEvents ??= []);
          if (done.includes(src)) {
            this.log('system', `同样的事再经历一回，${ATTR_NAMES[eff.key]}没有再长进。`);
            break;
          }
          done.push(src);
        }
        const before = this.char.attrs[eff.key];
        const after = eff.value > 0 ? Math.max(before, Math.min(ATTR_CAP, before + eff.value)) : before + eff.value;
        this.char.attrs[eff.key] = after;
        if (after !== before) this.log(after > before ? 'good' : 'bad', `${ATTR_NAMES[eff.key]} ${signed(after - before)}`);
        else if (eff.value > 0) this.log('system', `${ATTR_NAMES[eff.key]}已至上限 ${ATTR_CAP}`);
        break;
      }
      case 'item':
        this.addItem(eff.id, eff.count);
        break;
      case 'stone': {
        const before = this.char.stones;
        this.char.stones = Math.max(0, before + eff.value);
        const delta = this.char.stones - before;
        if (delta) this.log(delta > 0 ? 'good' : 'bad', `灵石 ${signed(delta)}`);
        break;
      }
      case 'flag':
        this.state.flags[eff.key] = eff.value ?? true;
        break;
      case 'hp': {
        const max = this.combatStats.maxHp;
        const before = this.char.hp;
        this.char.hp = Math.max(1, Math.min(max, before + Math.round((max * eff.value) / 100)));
        const delta = this.char.hp - before;
        if (delta) this.log(delta > 0 ? 'good' : 'bad', `气血 ${signed(delta)}`);
        break;
      }
      case 'break_bonus':
        this.char.breakBonus += eff.value;
        this.log(eff.value >= 0 ? 'good' : 'bad', `下次突破成功率 ${eff.value >= 0 ? '+' : ''}${Math.round(eff.value * 100)}%`);
        break;
      case 'meta_flag':
        this.state.metaFlags[eff.key] = true;
        break;
      case 'ending':
        this.finish(eff.id);
        break;
      case 'realm_up':
        if (this.state.breaking) this.completeBreakthrough(this.state.breaking);
        break;
      case 'qi_deviation':
        if (this.state.breaking) this.qiDeviation();
        break;
      case 'unstuck':
        if (this.char.stuck) this.unstick();
        break;
    }
  }

  private addItem(id: string, count: number, silent = false): void {
    const inv = this.state.inventory;
    const before = inv[id] ?? 0;
    inv[id] = Math.max(0, before + count);
    const delta = inv[id] - before;
    if (inv[id] === 0) delete inv[id];
    // 按实际变化记日志（没有的东西不会被"失去"）
    if (!silent && delta) {
      this.log(delta > 0 ? 'good' : 'bad', `${delta > 0 ? '获得' : '失去'}【${this.itemName(id)}】×${Math.abs(delta)}`);
    }
  }

  private addCultivation(amount: number): void {
    const c = this.char;
    const before = c.cultivation;
    c.cultivation = Math.max(0, c.cultivation + amount);
    if (amount > 0) this.log('good', `修为 +${fmtNum(amount)}`);
    else if (before > c.cultivation) this.log('bad', `修为 -${fmtNum(before - c.cultivation)}`);
    const realm = getRealm(c.realm);
    if (c.cultivation < this.stageReq) return;
    // 每一层修为满了就封顶，要亲手冲关才能晋升；多出来的散失
    const wasted = c.cultivation - this.stageReq;
    c.cultivation = this.stageReq;
    // 凡人引气入体无需冲关，修为圆满即自动突破
    if (realm.breakRate >= 1) return this.advanceRealm();
    if (wasted > 0 && amount > 0) {
      const what = c.stuck ? '修为卡在瓶颈前' : '这一层修为已满';
      this.log('system', `${what}，其中 ${fmtNum(wasted)} 点无处容纳，散于天地。`);
    }
  }

  /**
   * 事件、丹药给的修为按比例折算：先折成"所属境界初层所需"的几成（最多半层），
   * 再乘以当前这一层所需；境界比它高时打折；同一种丹药在一层内越吃越没用
   */
  private scaleCultivation(value: number): number {
    const src = this.cultSource;
    if (!src || value <= 0) return value;
    const base = getRealm(src.realm).stageReq(0);
    let frac = Math.min(CULT_FRACTION_CAP, value / base);
    const gap = realmIndex(this.char.realm) - realmIndex(src.realm);
    if (gap > 0) frac *= CULT_OLD_REALM_FACTOR ** gap;
    if (src.pill) {
      const uses = (this.state.pillUses ??= {});
      const n = uses[src.pill] ?? 0;
      if (n > 0) this.log('system', `丹毒渐积，药力只剩${n === 1 ? '一半' : `${Math.round(100 * 0.5 ** n)}%`}。`);
      frac *= 0.5 ** n;
      uses[src.pill] = n + 1;
    }
    return Math.max(1, Math.round(frac * this.stageReq));
  }

  private advanceRealm(): void {
    const next = REALMS[realmIndex(this.char.realm) + 1];
    this.char.realm = next.id;
    this.char.stage = 0;
    this.char.cultivation = 0;
    this.state.pillUses = {};
    this.char.hp = this.combatStats.maxHp;
    if (next.id === 'lianqi') {
      this.log('good', '一缕灵气自丹田升起，你成功引气入体，踏入炼气一层！');
    } else {
      this.log('good', `${REALM_UP_TEXT[next.id] ?? '突破成功！'}你踏入${this.realmLabel}，寿元上限提升至 ${this.lifespanYears} 年。`);
    }
    if (next.breakGuide) this.log('system', next.breakGuide.lead);
    this.signals.push({ type: 'realm', id: next.id, label: next.name });
  }

  /** 渡劫圆满，飞升：进入结局抉择 */
  private ascend(): void {
    this.log('good', `劫云散尽，仙光垂落。${this.char.name}于 ${this.ageYears} 岁，白日飞升！`);
    this.signals.push({ type: 'realm', id: 'ascend', label: '飞升' });
    const ev = this.events.get(ENDING_EVENT);
    if (ev) this.trigger(ev);
    else this.finish(DEFAULT_ENDING);
  }

  private passTime(months: number): void {
    const yearBefore = this.ageYears;
    this.char.ageMonths += months;
    if (this.char.injury) {
      this.char.injury = Math.max(0, this.char.injury - INJURY_HEAL_PER_MONTH * months);
      if (!this.char.injury) this.log('good', '伤势已经痊愈。');
    }
    const max = this.combatStats.maxHp;
    this.char.hp = Math.min(max, this.char.hp + Math.ceil(max * HP_REGEN_PER_MONTH * months));
    if (this.ageYears !== yearBefore) this.restockShop();
    this.checkLifespan();
  }

  private restockShop(): void {
    const stock: Record<string, number> = {};
    for (const entry of this.content.shop) {
      if (this.rng.chance(entry.chance)) stock[entry.item] = this.rng.int(entry.count[0], entry.count[1]);
    }
    this.state.shop = { year: this.ageYears, stock };
  }

  private checkLifespan(cause: 'age' | 'backlash' | 'injury' = 'age'): void {
    if (this.state.dead || this.ageYears < this.lifespanYears) return;
    const who = `${this.char.name}于 ${this.ageYears} 岁`;
    const where = `止步${this.realmLabel}`;
    const messages: Record<typeof cause, string> = {
      age: `寿元耗尽。${who}坐化，${where}。`,
      backlash: `灵力反噬，寿元尽折。${who}陨落，${where}。`,
      injury: `伤势沉重，寿元尽折。${who}陨落，${where}。`,
    };
    this.die(messages[cause], cause);
  }

  /** 达成结局，圆满结束这一世 */
  private finish(endingId: string): void {
    const ending = this.endings.get(endingId);
    this.state.dead = true;
    this.state.pendingEventId = null;
    this.state.ending = endingId;
    this.signals.push({ type: 'ending', id: endingId, name: ending?.name ?? endingId });
    this.log('title', `【结局 · ${ending?.name ?? endingId}】`);
    if (ending) this.log('whisper', ending.text);
  }

  private die(message: string, cause: DeathCause): void {
    this.state.dead = true;
    this.state.deathCause = cause;
    this.state.pendingEventId = null;
    this.state.breaking = null;
    this.state.breakStage = null;
    this.log('bad', message);
    this.signals.push({ type: 'death', message });
    this.log('whisper', DEATH_WHISPERS[Math.min(this.state.life, DEATH_WHISPERS.length) - 1]);
  }

  private stamp(): void {
    const season = SEASONS[Math.floor((this.char.ageMonths % 12) / 3)];
    this.log('time', `—— ${this.ageYears}岁 · ${season} ——`);
  }

  private log(kind: LogKind, text: string): void {
    this.state.log.push({ kind, text });
    if (this.state.log.length > LOG_LIMIT) this.state.log.splice(0, this.state.log.length - LOG_LIMIT);
  }

  /** 把随机数状态写回 state，保证存档后可以接着走 */
  private sync(): void {
    this.state.rngState = this.rng.state;
  }
}

export function monthsLabel(months: number): string {
  if (months === 6) return '半年';
  if (months % 12 === 0) return `${CN_NUM[months / 12] ?? months / 12}年`;
  return `${CN_NUM[months] ?? months}个月`;
}

const CN_NUM: Record<number, string> = { 1: '一', 2: '两', 3: '三', 4: '四', 5: '五', 10: '十', 20: '二十', 30: '三十', 50: '五十' };

/** 分钟数转为"X 小时 Y 分"之类的说法 */
export function durationLabel(minutes: number): string {
  const m = Math.floor(minutes);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} 小时 ${m % 60} 分` : `${h} 小时`;
}

/** 踏入各境界时的一句描述 */
/** 听过某条突破线索的跨世标记 */
function guideFlag(introEvent: string): string {
  return `guide_${introEvent}`;
}

const REALM_UP_TEXT: Partial<Record<RealmId, string>> = {
  zhuji: '丹田灵液凝为道基，',
  jindan: '道基化液，凝成一颗浑圆金丹！',
  yuanying: '金丹碎，元婴成！',
  huashen: '元婴化神，神游太虚！',
  dujie: '问心关破，天地为之一静。',
};

/** 第 i 道天雷对防御 def、减伤 ward 的伤害，jitter 为 0.7～1.3 的随机系数 */
function boltDamage(t: NonNullable<RealmDef['tribulation']>, i: number, def: number, ward: number, jitter: number): number {
  return Math.max(1, Math.round(t.power * (1 + 0.12 * i) * jitter * (1 - ward) - def * 0.5));
}

/** 大数字按万、亿缩写：123456 → 12.3万 */
export function fmtNum(n: number): string {
  const a = Math.abs(n);
  const trim = (x: number) => (x >= 100 ? Math.round(x).toString() : x.toFixed(x >= 10 ? 1 : 2).replace(/\.?0+$/, ''));
  if (a >= 1e8) return `${n < 0 ? '-' : ''}${trim(a / 1e8)}亿`;
  if (a >= 1e5) return `${n < 0 ? '-' : ''}${trim(a / 1e4)}万`;
  return `${Math.round(n)}`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
