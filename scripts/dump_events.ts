// 把事件导出成便于审稿的文本：每个选项的检定、战斗、实际效果一目了然。
// 用法：npx tsx scripts/dump_events.ts [事件文件名关键字] > 输出.txt
import { writeFileSync } from 'node:fs';
import { CONTENT } from '../src/data';
import type { Effect, EventDef, Outcome } from '../src/core/types';

const filter = process.argv[2];
const out = process.argv[3];

const eff = (e: Effect): string => {
  switch (e.type) {
    case 'item': return `物${e.id}${e.count > 0 ? '+' : ''}${e.count}`;
    case 'attr': return `${e.key}${e.value >= 0 ? '+' : ''}${e.value}`;
    case 'flag': return `旗:${e.key}`;
    case 'meta_flag': return `跨世:${e.key}`;
    case 'ending': return `结局:${e.id}`;
    case 'realm_up': case 'qi_deviation': case 'unstuck': return e.type;
    default: return `${e.type}${e.value >= 0 ? '+' : ''}${e.value}`;
  }
};
const outcome = (o: Outcome | undefined) =>
  !o ? '∅' : `「${o.result ?? ''}」[${(o.effects ?? []).map(eff).join(' ')}]${o.next ? ' → ' + o.next : ''}`;

const lines: string[] = [];
const events: EventDef[] = filter ? CONTENT.events.filter((e) => e.id.includes(filter) || JSON.stringify(e).includes(`"${filter}`)) : CONTENT.events;
for (const e of events) {
  const cond = e.conditions ? JSON.stringify(e.conditions).replace(/"/g, '') : '';
  lines.push(`\n■ ${e.id}【${e.title}】${e.region?.join(',') ?? '(串联)'} 权重${e.weight ?? 1}${e.once ? ' 一次' : ''} ${cond} 图:${e.art ?? '无'}`);
  lines.push(`  ${e.text}`);
  for (const o of e.options) {
    const req = o.requires ? ` 需${JSON.stringify(o.requires).replace(/"/g, '')}` : '';
    if (o.check) lines.push(`  ▸ ${o.text}${req}【${o.check.attr}≥${o.check.dc}】\n      成 ${outcome(o.success)}\n      败 ${outcome(o.fail)}`);
    else if (o.battle) lines.push(`  ▸ ${o.text}${req}【战 ${o.battle.enemy}】${o.result ? `前「${o.result}」` : ''}\n      胜 ${outcome(o.battle.win)}\n      负 ${outcome(o.battle.lose)}`);
    else lines.push(`  ▸ ${o.text}${req} ${outcome(o)}`);
  }
}
const text = lines.join('\n') + '\n';
if (out) writeFileSync(out, text, 'utf-8');
else process.stdout.write(text);
