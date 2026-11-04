import type { Rng } from '../core/rng';
import type { BattleReplay, Stats } from './types';

/** 每个区域两种对手，交锋时随机遇到其中一种 */
const ENCOUNTERS = {
  forest: [
    { name: '林间灰狼', hp: 48, attack: 9, icon: 'tree', reward: 25, art: 'enemy-wolf' },
    { name: '山野大野猪', hp: 56, attack: 8, icon: 'tree', reward: 28, art: 'enemy-forest-2' },
  ],
  ruins: [
    { name: '古塔石像', hp: 95, attack: 16, icon: 'castle', reward: 50, art: 'enemy-stone' },
    { name: '空心盔甲守卫', hp: 88, attack: 17, icon: 'castle', reward: 52, art: 'enemy-ruins-2' },
  ],
  mountain: [
    { name: '山巅风灵', hp: 170, attack: 24, icon: 'mountain', reward: 90, art: 'enemy-spirit' },
    { name: '雪羽山鸟', hp: 160, attack: 26, icon: 'mountain', reward: 92, art: 'enemy-mountain-2' },
  ],
};
/** 一次结算交锋，界面仅重播结果；跳过演出不会影响奖励。 */
export function resolveAdventure(stats: Stats, region: string, rng: Rng): BattleReplay {
  const pool = ENCOUNTERS[region as keyof typeof ENCOUNTERS] ?? ENCOUNTERS.forest;
  const enemy = pool[rng.int(0, pool.length - 1)]!;
  const playerMaxHp = 60 + Math.floor(stats.stamina * .22);
  const attack = 7 + Math.floor(stats.combat * .1 + stats.intellect * .025);
  const defense = Math.floor(stats.grace * .012);
  const replay: BattleReplay = { enemy: enemy.name, enemyIcon: enemy.icon, enemyArt: enemy.art, region, playerMaxHp, enemyMaxHp: enemy.hp, steps: [], victory: false, reward: 0 };
  let playerHp = playerMaxHp; let enemyHp = enemy.hp;
  for (let turn = 0; turn < 12 && playerHp > 0 && enemyHp > 0; turn++) {
    const hit = Math.min(enemyHp, Math.max(1, attack + rng.int(-2, 3)));
    enemyHp -= hit; replay.steps.push({ actor: 'daughter', damage: hit, playerHp, enemyHp });
    if (enemyHp <= 0) break;
    const retaliation = Math.min(playerHp, Math.max(2, enemy.attack + rng.int(-2, 2) - defense));
    playerHp -= retaliation; replay.steps.push({ actor: 'enemy', damage: retaliation, playerHp, enemyHp });
  }
  replay.victory = enemyHp === 0;
  replay.reward = replay.victory ? enemy.reward : 0;
  return replay;
}
