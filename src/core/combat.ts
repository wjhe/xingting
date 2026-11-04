import type { Rng } from './rng';
import type { EnemyTrait, SpellDef } from './types';

export interface Fighter {
  name: string;
  /** 普通攻击的描述，如"挥掌击出" */
  verb: string;
  hp: number;
  maxHp: number;
  mp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
  spell?: SpellDef;
  traits?: EnemyTrait[];
}

export type BattleResult = 'win' | 'lose' | 'draw';

/** 一次出手的记录，供界面逐回合回放 */
export interface BattleStep {
  /** 出手方：p 玩家，e 敌人 */
  by: 'p' | 'e';
  dmg: number;
  crit: boolean;
  spell?: string;
  /** 被闪开了（伤害为 0） */
  dodge?: boolean;
  /** 出手后双方的气血、玩家灵力 */
  pHp: number;
  eHp: number;
  pMp: number;
}

const MAX_ROUNDS = 30;
/** 单次伤害倍率：一场仗五到八个来回，运气才有用武之地，不至于只看属性 */
const DAMAGE_MULT = 2.2;
/** 战报太长时只保留开头和结尾 */
const HEAD_LINES = 8;
const TAIL_LINES = 3;

/**
 * 自动回合制战斗。速度高者先手，有灵力时优先施展法术。
 * 会直接修改双方的 hp、mp。
 */
export function runBattle(
  p: Fighter,
  e: Fighter,
  rng: Rng,
  log: (text: string) => void,
  onStep?: (step: BattleStep) => void,
): BattleResult {
  // 速度快的先手；有"先手"特性的必定先出手
  const eFirst = e.traits?.includes('first') || e.spd > p.spd;
  const order = eFirst ? [e, p] : [p, e];
  const lines: string[] = [];
  let result: BattleResult = 'draw';

  outer: for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const attacker of order) {
      const defender = attacker === p ? e : p;
      const r = attack(attacker, defender, rng);
      lines.push(r.text);
      onStep?.({ by: attacker === p ? 'p' : 'e', dmg: r.dmg, crit: r.crit, spell: r.spell, dodge: r.dodge, pHp: p.hp, eHp: e.hp, pMp: p.mp });
      if (defender.hp <= 0) {
        result = attacker === p ? 'win' : 'lose';
        break outer;
      }
    }
  }

  if (lines.length > HEAD_LINES + TAIL_LINES + 1) {
    const skipped = lines.length - HEAD_LINES - TAIL_LINES;
    lines.splice(HEAD_LINES, skipped, `……双方又缠斗了 ${Math.ceil(skipped / 2)} 个回合……`);
  }
  for (const l of lines) log(l);
  return result;
}

/** 闪避率：比对方快越多越容易闪开；灵动的敌人更难命中 */
export function dodgeChance(a: Fighter, d: Fighter): number {
  const base = 0.05 + (d.spd - a.spd) * 0.01 + (d.traits?.includes('evasive') ? 0.15 : 0);
  return Math.max(0.02, Math.min(0.35, base));
}

function attack(a: Fighter, d: Fighter, rng: Rng): { text: string; dmg: number; crit: boolean; spell?: string; dodge?: boolean } {
  let power = 1;
  let action = a.verb;
  let spell: string | undefined;
  if (a.spell && a.mp >= a.spell.cost) {
    a.mp -= a.spell.cost;
    power = a.spell.power;
    spell = a.spell.name;
    action = `施展【${a.spell.name}】`;
  }
  if (rng.chance(dodgeChance(a, d))) {
    return { text: `${a.name}${action}，被${d.name}闪了开去。`, dmg: 0, crit: false, spell, dodge: true };
  }
  // 残血狂暴：气血不足三成时攻击 +50%
  if (a.traits?.includes('enrage') && a.hp < a.maxHp * 0.3) power *= 1.5;
  const crit = rng.chance(a.crit);
  const raw = a.atk * DAMAGE_MULT * power * (0.65 + rng.next() * 0.7) * (crit ? 1.7 : 1);
  // 破防：无视一半防御
  const def = a.traits?.includes('pierce') ? d.def * 0.5 : d.def;
  const dmg = Math.max(1, Math.round(raw - def * 0.5 * DAMAGE_MULT));
  d.hp = Math.max(0, d.hp - dmg);
  let tail = '';
  if (a.traits?.includes('drain')) {
    const heal = Math.round(dmg * 0.3);
    a.hp = Math.min(a.maxHp, a.hp + heal);
    tail = `，${a.name}吸回 ${heal} 点`;
  }
  return { text: `${a.name}${action}${crit ? '，正中要害' : ''}，${d.name}损失 ${dmg} 点气血${tail}。`, dmg, crit, spell };
}
