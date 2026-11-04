import { RaisingGame, createState } from '../src/raising/game';
import { ACTIVITIES, ENDINGS, EVENTS } from '../src/raising/content';
import { Rng } from '../src/core/rng';
import { STAT_KEYS, type Stats } from '../src/raising/types';

const count = Math.min(10000, Math.max(1, Number(process.argv[2]) || 300));
const totals: Record<string, number> = {};
let totalGold = 0; let stressed = 0;
for (let i = 1; i <= count; i++) {
  const game = new RaisingGame(createState('艾莉', '家长', i)); const rng = new Rng(i + 1000);
  const goal = ENDINGS[(i - 1) % ENDINGS.length]!;
  while (!game.state.ended) {
    const event = EVENTS.find(e => e.id === game.state.pendingEvent);
    if (event) {
      const choices = event.choices.map((c, index) => ({ index, score: STAT_KEYS.reduce((sum, k) => sum + (c.outcome.gains?.[k] ?? 0) * ((goal.requires[k] ?? 0) > game.state.stats[k] ? 1 : -.2), 0), affordable: (c.outcome.gold ?? 0) + game.state.gold >= 0 }));
      game.choose(choices.filter(c => c.affordable).sort((a, b) => b.score - a.score)[0]!.index);
    }
    game.talk();
    let budget = game.state.gold;
    let stress = game.state.stress;
    const predicted: Stats = { ...game.state.stats };
    for (let slot = 0; slot < 3; slot++) {
      const complete = STAT_KEYS.every(k => predicted[k] >= (goal.requires[k] ?? 0));
      const category = complete || stress >= 60 ? 'rest' : budget < 100 ? 'work' : null;
      const pool = ACTIVITIES.filter(a => game.available(a) && (!category || a.category !== 'rest') && (!category || a.category === category) && budget + a.gold >= 0);
      const scored = pool.map(a => ({ a, score: complete ? a.id === 'free' ? 100 : 0 : STAT_KEYS.reduce((sum, k) => sum + Math.min(a.gains[k] ?? 0, Math.max(0, (goal.requires[k] ?? 0) - predicted[k])) / Math.max(80, goal.requires[k] ?? 0), 0) + (category === 'work' ? a.gold * .00025 : 0) + (category === 'rest' ? -a.stress * .002 : 0) + rng.next() * .003 }));
      const chosen = scored.sort((a, b) => b.score - a.score)[0]?.a ?? ACTIVITIES.find(a => a.id === 'free')!;
      game.setPlan(slot, chosen.id); budget += chosen.gold; stress = Math.max(0, Math.min(100, stress + chosen.stress));
      for (const k of STAT_KEYS) predicted[k] += chosen.gains[k] ?? 0;
    }
    game.advance(); if (game.state.stress >= 75) stressed++;
  }
  totals[game.state.ending!] = (totals[game.state.ending!] ?? 0) + 1; totalGold += game.state.gold;
}
console.log(`完成 ${count} 位玩家 × 96 个月；平均期末金币 ${Math.round(totalGold/count)} G；高压力月份占比 ${(stressed / (count*96) * 100).toFixed(1)}%。`);
console.table(ENDINGS.map(e => ({ 结局: e.title, 人数: totals[e.id] ?? 0, 比例: `${((totals[e.id] ?? 0)/count*100).toFixed(1)}%` })));
