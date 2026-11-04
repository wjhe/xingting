export type Gender = 'male' | 'female';

/** 五项基础属性，键名与事件配置中的 attr 字段一致 */
export type AttrKey = 'gengu' | 'wuxing' | 'shenshi' | 'jiyuan' | 'xinjing';
export type Attributes = Record<AttrKey, number>;

export const ATTR_NAMES: Record<AttrKey, string> = {
  gengu: '根骨',
  wuxing: '悟性',
  shenshi: '神识',
  jiyuan: '机缘',
  xinjing: '心境',
};

export const ATTR_DESCS: Record<AttrKey, string> = {
  gengu: '气血、防御',
  wuxing: '突破成功率',
  shenshi: '出手速度、识破陷阱',
  jiyuan: '暴击率',
  xinjing: '突破成功率',
};

export type RealmId = 'fanren' | 'lianqi' | 'zhuji' | 'jindan' | 'yuanying' | 'huashen' | 'dujie';

export type SpiritRootId = 'tian' | 'shuang' | 'san' | 'si' | 'wei';

export interface Character {
  name: string;
  gender: Gender;
  root: SpiritRootId;
  attrs: Attributes;
  realm: RealmId;
  /** 当前大境界内的小层，从 0 开始 */
  stage: number;
  /** 当前小层已积累的修为 */
  cultivation: number;
  /** 年龄，单位：月 */
  ageMonths: number;
  /** 突破失败等造成的寿元损失，单位：年 */
  lifespanPenalty: number;
  stones: number;
  /** 当前气血，跨战斗保留，随时间恢复 */
  hp: number;
  /** 主修功法 id */
  technique: string | null;
  /** 下次突破的额外成功率（来自丹药），0.1 = 10% */
  breakBonus: number;
  /** 本世天赋 id */
  talents: string[];
  equip: { weapon: string | null; armor: string | null };
  /** 卡在小境界瓶颈。旧存档没有此字段 */
  stuck?: boolean;
  /** 冲击当前瓶颈的累计尝试次数（越多越容易成） */
  stuckTries?: number;
  /** 伤势：气血上限降低的比例（0～0.6），随时间慢慢痊愈，闭关好得更快。旧存档没有此字段 */
  injury?: number;
  /** 丹道经验，决定丹师品级。旧存档没有此字段 */
  danExp?: number;
}

export interface ShopState {
  /** 货架刷新时的年龄（岁），每年刷新一次 */
  year: number;
  stock: Record<string, number>;
}

export interface GameState {
  version: number;
  rngState: number;
  /** 第几世 */
  life: number;
  character: Character;
  inventory: Record<string, number>;
  /** 本世剧情标记 */
  flags: Record<string, boolean>;
  /** 跨世剧情标记：开局时从轮回存档带入，本世新增的在结算时写回 */
  metaFlags: Record<string, boolean>;
  /** 本世触发过的所有事件（用于 once 判断和图鉴） */
  seenEvents: string[];
  /** 等待玩家做选择的事件 */
  pendingEventId: string | null;
  region: string;
  shop: ShopState;
  log: LogEntry[];
  dead: boolean;
  /** 达成的结局 id，正常死亡为 null */
  ending: string | null;
  /** 本小境界内各种修为丹药已服用的次数（丹毒：越吃越没用），晋升后清零。旧存档没有此字段 */
  pillUses?: Record<string, number>;
  /** 本世已经从中得过属性的可重复事件。同一件事再做，属性不再增长。旧存档没有此字段 */
  attrEvents?: string[];
  /** 最近历练抽到的事件（新的在后），用于降低重复。旧存档没有此字段 */
  recentEvents?: string[];
  /** 已掌握的丹方 id。旧存档没有此字段 */
  recipes?: string[];
  /** 正在冲击大境界的目标，ascend 表示飞升。冲关途中（外扰事件、心魔关）不为空 */
  breaking?: RealmId | 'ascend' | null;
  /** 冲关进行到哪一步：disturb 等外扰事件的结果，heart 等心魔关的结果。旧存档没有此字段（视为 heart） */
  breakStage?: 'disturb' | 'heart' | null;
  /** 离线收益：上次在线的时间戳（毫秒）和积累的灵气储备（分钟）。旧存档没有此字段 */
  offline?: { lastSeen: number; reserve: number };
  /** 刚发生、看完激励视频可以挽回的挫折。时间一流逝就作废。旧存档没有此字段 */
  setback?: Setback | null;
  /** 死因，决定能否"残魂不灭"。旧存档没有此字段 */
  deathCause?: DeathCause | null;
  /** 本世已用过"残魂不灭"。旧存档没有此字段 */
  revived?: boolean;
  /** 上次看视频刷新坊市时的年龄（每个游戏年一次）。旧存档没有此字段 */
  adShopYear?: number;
}

export type DeathCause = 'age' | 'backlash' | 'injury' | 'battle' | 'tribulation';

/**
 * 可挽回的挫折。at 为发生时的年龄（月），之后再有时间流逝就作废。
 * break：突破失败前的境界和修为；brew：炸炉烧掉的药材
 */
export type Setback =
  | { kind: 'break'; at: number; stage: number; cultivation: number }
  | { kind: 'brew'; at: number; herbs: Record<string, number> };

/** art：事件插图，text 为插图 id（界面没有该素材时不显示） */
export type LogKind = 'time' | 'title' | 'art' | 'text' | 'battle' | 'good' | 'bad' | 'system' | 'whisper';

export interface LogEntry {
  kind: LogKind;
  text: string;
}

// ---------- 配置 ----------

export type Effect =
  | { type: 'cultivation'; value: number }
  | { type: 'lifespan'; value: number }
  | { type: 'attr'; key: AttrKey; value: number }
  | { type: 'item'; id: string; count: number }
  | { type: 'stone'; value: number }
  | { type: 'flag'; key: string; value?: boolean }
  /** 按气血上限的百分比增减，-30 表示损失 30% */
  | { type: 'hp'; value: number }
  /** 下次突破成功率加成，0.1 = 10% */
  | { type: 'break_bonus'; value: number }
  /** 跨世标记，轮回后仍然保留 */
  | { type: 'meta_flag'; key: string }
  /** 达成结局，本世圆满结束 */
  | { type: 'ending'; id: string }
  /** 心魔关通过：完成大境界突破（只在心魔事件里使用） */
  | { type: 'realm_up' }
  /** 心魔关失败：走火入魔 */
  | { type: 'qi_deviation' }
  /** 打破小境界瓶颈 */
  | { type: 'unstuck' };

export interface Outcome {
  effects?: Effect[];
  result?: string;
  /** 后续事件 id，会立刻接着触发 */
  next?: string | null;
}

export interface EventOption extends Outcome {
  text: string;
  /** 不满足时选项置灰 */
  requires?: {
    stones?: number;
    items?: Record<string, number>;
    flags?: string[];
    meta_flags?: string[];
    /** flags / meta_flags 不满足时显示的提示 */
    hint?: string;
  };
  /** 属性检定：d10 + 属性 >= dc 即成功 */
  check?: { attr: AttrKey; dc: number };
  success?: Outcome;
  fail?: Outcome;
  /** 自动战斗。选项自身的 result 作为开战前的描述 */
  battle?: { enemy: string; win?: Outcome; lose?: Outcome };
}

export interface EventConditions {
  realm_min?: RealmId;
  realm_max?: RealmId;
  /** 第几世起才会出现 */
  life_min?: number;
  flags?: string[];
  not_flags?: string[];
  meta_flags?: string[];
  not_meta_flags?: string[];
  /** 行囊里同时拥有这些物品时才出现（如炼丹事件要求材料齐全） */
  has_items?: string[];
  /** 卡在小境界瓶颈时才出现（顿悟类事件） */
  stuck?: boolean;
}

export interface EventDef {
  id: string;
  title: string;
  /** 为空表示不进入随机池，只能被 next 串联触发 */
  region?: string[];
  weight?: number;
  once?: boolean;
  conditions?: EventConditions;
  /** 事件插图 id，见 art-src/prompts.json 的 vignettes */
  art?: string;
  text: string;
  options: EventOption[];
}

/** treasure：突破用的天材地宝，不能出售；herb：炼丹用的灵草；recipe：丹方，研读后可在丹房炼制 */
export type ItemType = 'pill' | 'book' | 'weapon' | 'armor' | 'talisman' | 'material' | 'treasure' | 'herb' | 'recipe';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  type: ItemType;
  /** 服用效果 */
  use?: Effect[];
  /** 功法典籍：参悟后改修此功法 */
  technique?: string;
  /** 丹方：研读后掌握的配方 id，见 recipes.json */
  recipe?: string;
  /** 共用其它物品的图标（如各种丹方都用卷轴图） */
  icon?: string;
  realm_min?: RealmId;
  /** 装备属性 */
  stats?: { atk?: number; def?: number; hp?: number };
  /** 符箓：战斗开始时自动祭出（damage/guard），或战败时自动遁走（escape） */
  /** ward：渡天劫时自动使用，天雷伤害降低 value%（百分数） */
  talisman?: { kind: 'damage' | 'guard' | 'escape' | 'ward'; value: number };
  /** 护阵旗：冲关时自动布下，挡掉一次外扰 */
  breakWard?: boolean;
}

export interface SpellDef {
  name: string;
  /** 灵力消耗 */
  cost: number;
  /** 伤害倍率 */
  power: number;
}

export interface TechniqueDef {
  id: string;
  name: string;
  desc: string;
  /** 修炼速度倍率 */
  multiplier: number;
  spell?: SpellDef;
}

export interface EnemyDef {
  id: string;
  name: string;
  /** 战报里的攻击描述，如"猛扑而来" */
  verb: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  /** 战败时被击杀的概率；不填时按档次（精英 10%、首领 25%） */
  killChance?: number;
  /** 所属境界：强度随玩家在这个境界里的小层成长，玩家境界更高时封顶 */
  realm?: RealmId;
  /** 档次：普通、精英、首领 */
  tier?: 'normal' | 'elite' | 'boss';
  /** 特性：first 先手，drain 吸血，pierce 破防，enrage 残血狂暴，evasive 灵动（难命中） */
  traits?: EnemyTrait[];
  /** 直接用上面写死的数值，不随玩家成长（测试或特殊剧情用） */
  fixed?: boolean;
}

export type EnemyTrait = 'first' | 'drain' | 'pierce' | 'enrage' | 'evasive';

export interface TalentDef {
  id: string;
  name: string;
  desc: string;
  /** 在轮回殿解锁所需轮回点，0 表示初始可用 */
  cost: number;
  /** 开局一次性效果 */
  start?: Effect[];
  /** 持续加成 */
  mods?: {
    /** 修炼速度倍率 */
    gain?: number;
    /** 突破成功率加成 */
    breakBonus?: number;
    /** 寿元上限加成（年） */
    lifespan?: number;
    /** 灵根提升一档 */
    rootUp?: boolean;
    /** 灵根直接设为指定值 */
    rootSet?: SpiritRootId;
    /** 开局获得上一世主修功法的典籍 */
    inheritTechnique?: boolean;
  };
}

export interface EndingDef {
  id: string;
  name: string;
  text: string;
}

/** 丹房配方 */
export interface RecipeDef {
  id: string;
  /** 产出的丹药 id */
  product: string;
  /** 每炉所需药材 */
  ingredients: Record<string, number>;
  /** 每炉耗时（月） */
  months: number;
  /** 所需丹师品级（1～9） */
  level: number;
  /** 炸炉风险，从基础成丹率里扣除，0～0.4 */
  risk: number;
  /** 成丹枚数：[寻常, 上品] */
  yield: [number, number];
  /** 开局即会，不需要丹方 */
  basic?: boolean;
}

export interface ShopEntry {
  item: string;
  /** 每年上架的概率 */
  chance: number;
  count: [number, number];
}
