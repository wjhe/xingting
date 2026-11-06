export const STAT_KEYS = ['stamina', 'intellect', 'charm', 'grace', 'combat', 'kindness'] as const;
export type Stat = typeof STAT_KEYS[number];
export type Stats = Record<Stat, number>;
export type Category = 'learn' | 'work' | 'rest' | 'adventure';
export interface Activity {
  id: string; name: string; category: Category; icon: string; description: string;
  gold: number; stress: number; gains: Partial<Stats>; unlock?: { stat: Stat; value: number }; age?: number;
}
export interface Outcome { text: string; gains?: Partial<Stats>; gold?: number; stress?: number; bond?: number; flag?: string; relation?: { id: string; value: number } }
export interface EventConditions {
  months?: number[]; minStats?: Partial<Stats>; minStress?: number; maxStress?: number; minBond?: number;
  activities?: Record<string, number>; flags?: string[]; notFlags?: string[]; outfit?: string;
}
export interface StoryEvent {
  id: string; title: string; text: string; icon: string; minAge?: number; maxAge?: number;
  kind?: 'main' | 'side' | 'daily'; dueMonth?: number; priority?: number; art?: string; conditions?: EventConditions;
  choices: { label: string; outcome: Outcome }[];
}
export interface DiaryEntry { month: number; title: string; text: string; kind: 'month' | 'story' | 'birthday' | 'festival' | 'gift' }
export interface BattleStep { actor: 'daughter' | 'enemy'; damage: number; playerHp: number; enemyHp: number }
export interface BattleReplay { enemy: string; enemyIcon: string; region?: string; /** 对手立绘（production-v1 下的文件名） */ enemyArt?: string; playerMaxHp: number; enemyMaxHp: number; steps: BattleStep[]; victory: boolean; reward: number }
export interface MonthResult { title: string; text: string; icon: string; gains: Partial<Stats>; gold: number; stress: number; battle?: BattleReplay; /** 这次交锋已用广告重来过 */ retried?: boolean }
export interface Ending { id: string; title: string; subtitle: string; icon: string; text: string; requires: Partial<Stats>; bond?: number; priority: number }
export interface GameState {
  version: 1; name: string; parent: string; month: number; gold: number; stats: Stats; stress: number; bond: number;
  rngState: number; plan: [string | null, string | null, string | null]; diary: DiaryEntry[]; inventory: string[];
  flags: string[]; talked: number; gifted: number; outfit: string; pendingEvent: string | null; ended: boolean; ending: string | null;
  activityCounts: Record<string, number>; storyStartMonth: number; relations: Record<string, number>;
  /** 金币广告累计已发放额；回溯保留，不能随每日账本清零。 */
  adGoldEarned?: number;
  /** 成年后只确认一个已达成结局；旧已结束存档视为已经确认。 */
  endingConfirmed?: boolean;
  /** 激励视频的本局记录（见 ads.ts）；旧存档没有此字段 */
  ads?: AdState;
  /** 广告试穿：到 until 月（不含）自动换回 restore */
  tryOn?: { outfit: string; restore: string; until: number };
}
/** month：下面 used 所属的游戏月；used：该月已用掉的“每月一次”广告位；run：本周目已用掉的“每周目一次”广告位 */
export interface AdState { month: number; used: string[]; run: string[] }
/** 跨周目、按自然日清零的广告账本（存在 MetaState 里） */
export interface AdLedger { day: string; used: Record<string, number>; interstitials: number; lastInterstitial: number; firstSeen: number }
export interface MetaState { version: 1; endings: string[]; runs: number; ads?: AdLedger }
