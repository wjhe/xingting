import type { RealmId, SpiritRootId } from './types';

export interface TribulationDef {
  name: string;
  /** 雷劫道数 */
  bolts: number;
  /** 第一道雷的基础威力，之后每道 +12% */
  power: number;
  /** 被劈倒后当场殒命的概率 */
  killChance: number;
}

/** 告诉玩家突破物品从哪来 */
export interface BreakGuide {
  /** 踏入本境界时日志里的一句引子 */
  lead: string;
  /** 听过这个事件后才知道出处；为空表示一开始就知道 */
  intro?: string;
  /** 突破物品的原料与出处 */
  parts?: { id: string; where: string }[];
  /** 知道出处后：怎么得到突破物品 */
  how: string;
  /** 还不知道出处时的提示 */
  unknown?: string;
}

export interface RealmDef {
  id: RealmId;
  name: string;
  stageNames: string[];
  /** 寿元上限（年） */
  lifespan: number;
  /** 每月基础修为 */
  baseGain: number;
  /** 第 stage 层（从 0 开始）所需修为 */
  stageReq: (stage: number) => number;
  /**
   * 突破到下一个大境界的掷骰成功率。1 表示修为圆满自动突破；
   * 有心魔关的境界不掷骰，此值为 0。
   */
  breakRate: number;
  /** 突破需要消耗的物品（全部都要有） */
  breakItems?: string[];
  /** 突破物品的线索 */
  breakGuide?: BreakGuide;
  /** 突破时的天劫 */
  tribulation?: TribulationDef;
  /** 突破时的心魔事件 id */
  heartDemon?: string;
  /** 冲击下一个小境界时卡住的概率（有瓶颈丹的境界，"后期 → 圆满"必卡） */
  bottleneck: number;
  /** 冲击小境界瓶颈时服用的丹药：没有它几乎冲不过去 */
  bottleneckPill?: string;
  /**
   * 大境界冲关（闭关凝丹、碎丹成婴……）：基础成功率与辅助丹药。成功后才进入天劫、心魔。
   * 没有此项的境界（炼气、渡劫）跳过这一步
   */
  core?: { name: string; base: number; aid: string };
  /** 战斗基础值，再乘以小层系数 */
  hp: number;
  atk: number;
  mp: number;
  /** 闭关时长选项（月），境界越高闭关越久 */
  doorOptions: number[];
  /** 一次历练耗时范围（月） */
  exploreMonths: [number, number];
  /** 突破失败、走火入魔损失的寿元范围（年） */
  breakPenalty: [number, number];
}

const MID_STAGES = ['初期', '中期', '后期', '圆满'];

export const REALMS: RealmDef[] = [
  {
    id: 'fanren', name: '凡人', stageNames: [''], lifespan: 80, baseGain: 5,
    stageReq: () => 30, breakRate: 1, bottleneck: 0,
    hp: 40, atk: 6, mp: 0, doorOptions: [1, 6, 12], exploreMonths: [1, 3], breakPenalty: [0, 0],
  },
  {
    id: 'lianqi', name: '炼气',
    breakGuide: {
      lead: '炼气九层圆满后可冲击筑基，需服【筑基丹】：青云坊市偶有上架，得了筑基丹方也能在丹房自己炼。',
      how: '青云坊市偶有上架；或研读《筑基丹方》，在丹房以青灵草、赤血藤炼制',
    },
    stageNames: ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层'],
    lifespan: 120, baseGain: 10,
    stageReq: (s) => 100 * (s + 1), breakRate: 0.4, breakItems: ['zhuji_dan'], bottleneck: 0.15,
    hp: 100, atk: 15, mp: 30, doorOptions: [6, 12, 36], exploreMonths: [4, 8], breakPenalty: [3, 10],
  },
  {
    id: 'zhuji', name: '筑基',
    breakGuide: {
      lead: '结丹需服【结丹灵果】：青云坊市偶有上架，黑风谷深处也有灵果树。',
      how: '青云坊市偶有上架；黑风谷的灵果树也结此果',
    }, stageNames: MID_STAGES, lifespan: 220, baseGain: 60,
    stageReq: (s) => 5000 * (1 + s * 0.5), breakRate: 0, breakItems: ['jiedan_lingguo'],
    heartDemon: 'xinmo_jindan', bottleneck: 0.35, bottleneckPill: 'pojing_dan',
    core: { name: '凝结金丹', base: 0.4, aid: 'jiangchen_dan' },
    hp: 400, atk: 60, mp: 120, doorOptions: [12, 60, 120], exploreMonths: [12, 30], breakPenalty: [10, 40],
  },
  {
    id: 'jindan', name: '金丹',
    breakGuide: {
      lead: '碎丹成婴需【化婴丹】。听说青云坊市百草堂住着一位丹王，或许知道炼法。',
      intro: 'market_danwang_intro',
      parts: [{ id: 'jiao_nilin', where: '云梦泽' }, { id: 'lian_xin', where: '云梦泽' }, { id: 'roc_jingpo', where: '云梦泽' }],
      how: '三样集齐后，到青云坊市请丹王开炉',
      unknown: '炼法未知。青云坊市的丹王或许知道。',
    }, stageNames: MID_STAGES, lifespan: 500, baseGain: 400,
    stageReq: (s) => 80000 * (1 + s * 0.5), breakRate: 0, breakItems: ['huaying_dan'],
    tribulation: { name: '六重雷劫', bolts: 6, power: 420, killChance: 0.35 },
    heartDemon: 'xinmo_yuanying', bottleneck: 0.45, bottleneckPill: 'ningjin_dan',
    core: { name: '碎丹成婴', base: 0.35, aid: 'yanghun_dan' },
    hp: 1500, atk: 220, mp: 450, doorOptions: [60, 120, 240], exploreMonths: [12, 36], breakPenalty: [40, 120],
  },
  {
    id: 'yuanying', name: '元婴',
    breakGuide: {
      lead: '元婴化神需【化神丹】。传闻北冥海深处有座蓬莱丹宫，能炼此丹。',
      intro: 'beiming_xiandao_intro',
      parts: [{ id: 'kun_feather', where: '北冥海' }, { id: 'xuanbing', where: '北冥海' }, { id: 'haiyan_pearl', where: '北冥海' }],
      how: '三样集齐后，到北冥海的蓬莱丹宫请看炉童子开炉',
      unknown: '炼法未知。去北冥海寻那座蓬莱丹宫打听。',
    }, stageNames: MID_STAGES, lifespan: 1000, baseGain: 2500,
    stageReq: (s) => 1_000_000 * (1 + s * 0.5), breakRate: 0, breakItems: ['huashen_dan'],
    tribulation: { name: '九重雷劫', bolts: 9, power: 900, killChance: 0.45 },
    heartDemon: 'xinmo_huashen', bottleneck: 0.55, bottleneckPill: 'lianying_dan',
    core: { name: '元婴化神', base: 0.3, aid: 'jiuqu_lingshen' },
    hp: 5000, atk: 800, mp: 1500, doorOptions: [60, 120, 240], exploreMonths: [24, 60], breakPenalty: [60, 150],
  },
  {
    id: 'huashen', name: '化神',
    breakGuide: {
      lead: '化神问心需【渡厄金莲】。昆仑墟的仙阙废墟里，或许留有培育之法。',
      intro: 'kunlun_xianque_intro',
      parts: [{ id: 'busi_seed', where: '昆仑墟' }, { id: 'kunlun_jade', where: '昆仑墟' }, { id: 'tianlei_stone', where: '昆仑墟' }],
      how: '三样集齐后，到昆仑墟的仙阙旧址培育',
      unknown: '培育之法未知。去昆仑墟的仙阙废墟找找。',
    }, stageNames: MID_STAGES, lifespan: 2000, baseGain: 10_000,
    stageReq: (s) => 8_500_000 * (1 + s * 0.5), breakRate: 0, breakItems: ['due_lotus'],
    heartDemon: 'xinmo_dujie', bottleneck: 0.65, bottleneckPill: 'heshen_dan',
    core: { name: '炼神合道', base: 0.3, aid: 'xuantian_guo' },
    hp: 15000, atk: 2500, mp: 4000, doorOptions: [120, 240, 600], exploreMonths: [36, 96], breakPenalty: [100, 300],
  },
  {
    id: 'dujie', name: '渡劫',
    breakGuide: {
      lead: '渡过九九天劫便可飞升。劫前把气血养满，备好避雷符，再炼几枚清心丹压住心魔。',
      how: '无需材料。气血养满、备好避雷符和清心丹即可渡劫',
    }, stageNames: MID_STAGES, lifespan: 3000, baseGain: 40_000,
    stageReq: (s) => 50_000_000 * (1 + s * 0.5), breakRate: 0,
    tribulation: { name: '九九天劫', bolts: 12, power: 5750, killChance: 0.5 },
    heartDemon: 'xinmo_feisheng', bottleneck: 0.75, bottleneckPill: 'huanxu_dan',
    hp: 45000, atk: 7000, mp: 10000, doorOptions: [120, 360, 600], exploreMonths: [36, 120], breakPenalty: [150, 400],
  },
];

/** 最高境界：在它圆满后突破即飞升 */
export const FINAL_REALM: RealmId = 'dujie';

export function realmIndex(id: RealmId): number {
  return REALMS.findIndex((r) => r.id === id);
}

export function getRealm(id: RealmId): RealmDef {
  return REALMS[realmIndex(id)];
}

export interface SpiritRootDef {
  id: SpiritRootId;
  name: string;
  chance: number;
  multiplier: number;
}

export const SPIRIT_ROOTS: SpiritRootDef[] = [
  { id: 'tian', name: '天灵根', chance: 0.03, multiplier: 2.0 },
  { id: 'shuang', name: '双灵根', chance: 0.12, multiplier: 1.5 },
  { id: 'san', name: '三灵根', chance: 0.35, multiplier: 1.2 },
  { id: 'si', name: '四灵根', chance: 0.35, multiplier: 1.0 },
  { id: 'wei', name: '伪灵根', chance: 0.15, multiplier: 0.7 },
];

export function getRoot(id: SpiritRootId): SpiritRootDef {
  return SPIRIT_ROOTS.find((r) => r.id === id)!;
}
