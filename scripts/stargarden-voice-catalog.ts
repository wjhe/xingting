import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVITIES, ENDINGS, EVENTS } from '../src/raising/content';

type Stage = 'child' | 'teen' | 'grown';
type VoiceLine = {
  id: string;
  text: string;
  group: string;
  role: 'story' | 'dialogue' | 'choice' | 'result' | 'ending';
  emotion: string;
  ages: Stage[];
  parent?: '爸爸' | '妈妈';
  priority: number;
};

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'art-src/stargarden/audio/voice-catalog-v1');
const lines: VoiceLine[] = [];

function stageForAge(age: number): Stage {
  return age >= 16 ? 'grown' : age >= 14 ? 'teen' : 'child';
}

function stagesFromAge(minAge = 10): Stage[] {
  const result: Stage[] = [];
  if (minAge <= 13) result.push('child');
  if (minAge <= 15) result.push('teen');
  if (minAge <= 17) result.push('grown');
  return result;
}

function add(entry: VoiceLine): void {
  if (!entry.text.trim()) throw new Error(`Empty voice line: ${entry.id}`);
  if (lines.some(line => line.id === entry.id)) throw new Error(`Duplicate voice line: ${entry.id}`);
  lines.push(entry);
}

for (const event of EVENTS) {
  const ages = event.kind === 'main'
    ? [stageForAge(10 + Math.floor(((event.dueMonth ?? 1) - 1) / 12))]
    : stagesFromAge(event.minAge ?? 10);
  const basePriority = event.kind === 'main' ? 10 : event.kind === 'side' ? 20 : 30;
  add({
    id: `event.${event.id}.text`,
    text: event.text,
    group: `event:${event.id}`,
    role: 'story',
    emotion: event.kind === 'daily' ? '温和、自然、像在回忆生活小事' : '带入情节，清楚而自然',
    ages,
    priority: basePriority,
  });
  event.choices.forEach((choice, index) => {
    add({
      id: `event.${event.id}.choice.${index}`,
      text: choice.label,
      group: `event:${event.id}`,
      role: 'choice',
      emotion: '清楚、平静地读出养育者可以选择的行动',
      ages,
      priority: basePriority + 1,
    });
    add({
      id: `event.${event.id}.outcome.${index}`,
      text: choice.outcome.text,
      group: `event:${event.id}`,
      role: 'result',
      emotion: '温柔、有生活感，像故事刚刚发生后的回应',
      ages,
      priority: basePriority + 2,
    });
  });
}

const storyCallbacks: Record<string, [string, string, string]> = {
  main_0_1: ['home_key', '她把你交给她的备用钥匙放在桌边，终于敢把明天也想得远一点。', '那枚亲手刻过的钥匙牌就放在手账旁，星星形状的刻痕还很新。'],
  main_1_0: ['first_exhibition', '她还记得第一年展台前停下脚步的邻居，原来普通生活也值得被认真讲述。', '她想起自己最后决定搬出桌子的那个午后，这次也想亲手写下一个开始。'],
  main_2_0: ['own_voice', '她说去年忘词时看见了你点头，知道自己可以慢一点再继续。', '她想起第一位观众问过的问题，原来被认真倾听的感觉并不只来自奖状。'],
  main_3_1: ['rain_failure', '你们已经一起难过过一次，她这回终于不再假装什么都没发生。', '抢救回来的那页草稿还压在书下，提醒她有些东西没有被雨带走。'],
  main_4_0: ['rest_permission', '她在计划里特意留出了不用证明自己的休息日。', '那次一起修书架的经历，让她把大目标拆成了一件件做得到的小事。'],
  main_4_1: ['own_plan', '她还记得你认真听完计划的样子，明白这次也应该给你同样的尊重。', '她翻出你们写下的试行约定，第一次主动提出一起检查哪里需要调整。'],
  main_5_0: ['honest_boundary', '她把你们约定过的“提前说清楚”写在了准备清单的第一行。', '她想起自己兑现承诺时的忙乱，希望新来的孩子能少走一点弯路。'],
  main_6_0: ['community_key', '那把展览室钥匙已经被她交接妥当，她学会了带着责任去向往远方。', '从一起制定开放规则开始，她就知道每一个新地方都需要认真准备。'],
  main_7_0: ['distance_choice', '她在手账末页写着：勇气不由离家的距离决定。', '留下与远行的两张草稿还夹在书里，每种生活的代价都曾被她认真想过。'],
};
for (const [eventId, [, warm, independent]] of Object.entries(storyCallbacks)) {
  const event = EVENTS.find(item => item.id === eventId)!;
  const ages = [stageForAge(10 + Math.floor(((event.dueMonth ?? 1) - 1) / 12))];
  for (const [variant, text] of [['warm', warm], ['independent', independent]] as const) {
    add({
      id: `event.${eventId}.callback.${variant}`,
      text,
      group: `event:${eventId}`,
      role: 'story',
      emotion: '温柔地补充一段与过往选择有关的回忆',
      ages,
      priority: 14,
    });
  }
}

for (const [id, name] of Object.entries({ mira: '米拉', rowan: '罗恩', nora: '诺拉', fern: '菲恩' })) {
  add({
    id: `side.relationship.${id}`,
    text: `${name}已经习惯把重要的想法先讲给她听，见到她时，神情也比初识那年自在许多。`,
    group: 'side-relationship',
    role: 'story',
    emotion: '自然、熟稔，表现朋友关系已经变得亲近',
    ages: ['child', 'teen', 'grown'],
    priority: 24,
  });
}
const memories = ['第一页的生活展台', '那张被雨淋湿又修补过的纸', '她亲手签下的第一个月计划'];
for (let mask = 1; mask < 8; mask++) {
  const selected = memories.filter((_, index) => mask & (1 << index));
  add({
    id: `event.main_7_2.memory.${mask}`,
    text: `翻过${selected.join('、')}，她轻轻说：“这些，我都记得。”`,
    group: 'event:main_7_2',
    role: 'dialogue',
    emotion: '温柔、怀念，像在回望整段成长',
    ages: ['grown'],
    priority: 16,
  });
}

const openingSource = readFileSync(resolve(root, 'src/raising/opening.ts'), 'utf8');
const beatsPart = openingSource.slice(openingSource.indexOf('const BEATS'));
const beatChunks = beatsPart.split(/\{\s*art\s*:/).slice(1);
beatChunks.forEach((chunk, beatIndex) => {
  const pattern = /\b([ng])\('([^']+)'/g;
  let match: RegExpExecArray | null;
  let lineIndex = 0;
  while ((match = pattern.exec(chunk)) !== null) {
    const id = `opening.${beatIndex}.${lineIndex}`;
    const addOpening = (text: string, parent?: '爸爸' | '妈妈', suffix = '') => add({
      id: id + suffix,
      text,
      group: 'opening',
      role: match![1] === 'g' ? 'dialogue' : 'story',
      emotion: match![1] === 'g' ? '年幼、自然，符合开场当下的情绪' : '轻柔、有电影感的旁白',
      ages: ['child'],
      parent,
      priority: 0,
    });
    if (match[2].includes('{parent}')) {
      addOpening(match[2].replace(/\{parent\}/g, '爸爸'), '爸爸', '.dad');
      addOpening(match[2].replace(/\{parent\}/g, '妈妈'), '妈妈', '.mom');
    } else {
      addOpening(match[2]);
    }
    lineIndex++;
  }
});

for (const ending of ENDINGS) {
  add({
    id: `ending.${ending.id}`,
    text: ending.text,
    group: 'ending',
    role: 'ending',
    emotion: '18岁，成熟自然，温柔而有希望',
    ages: ['grown'],
    priority: 5,
  });
}

const talkMatch = /const lines = \[(.+?)\];/s.exec(readFileSync(resolve(root, 'src/raising/game.ts'), 'utf8'));
if (!talkMatch) throw new Error('Could not locate talk voice lines');
const talkLines = [...talkMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
talkLines.forEach((text, index) => add({
  id: `talk.${index}`,
  text,
  group: 'talk',
  role: 'dialogue',
  emotion: '亲密、自然，像和养育者说悄悄话',
  ages: ['child', 'teen', 'grown'],
  priority: 40,
}));

add({
  id: 'gift.girl',
  text: '是我最喜欢的蜂蜜饼干！谢谢你。',
  group: 'gift',
  role: 'dialogue',
  emotion: '开心而亲近，不夸张',
  ages: ['child', 'teen', 'grown'],
  priority: 42,
});
add({
  id: 'birthday.girl',
  text: '明年也要一起过生日。',
  group: 'birthday',
  role: 'dialogue',
  emotion: '温暖、开心，带着一点期待',
  ages: ['child', 'teen', 'grown'],
  priority: 35,
});

for (const [id, text] of [
  ['festival.win', '她在收获祭的展示赛中获得优胜！笑着向你挥手的那一刻，整个秋天都亮了。'],
  ['festival.loss', '你们一起参加了收获祭，吃了热乎乎的南瓜派，还收到了纪念礼物。'],
] as const) {
  add({
    id,
    text,
    group: 'festival',
    role: 'story',
    emotion: id.endsWith('win') ? '开心、明亮而克制' : '温暖、平和',
    ages: ['child', 'teen', 'grown'],
    priority: 38,
  });
}

ACTIVITIES.forEach(activity => add({
  id: `activity.${activity.id}`,
  text: activity.description,
  group: 'activity',
  role: 'result',
  emotion: '轻快、清楚，适合日程结算',
  ages: stagesFromAge(activity.age ?? 10),
  priority: 45,
}));

add({
  id: 'ledger.monthly',
  text: '家庭补贴八十金币，日常生活费四十金币。',
  group: 'ledger',
  role: 'result',
  emotion: '简洁、温和地念出月度账本',
  ages: ['child', 'teen', 'grown'],
  priority: 55,
});
add({
  id: 'result.tired',
  text: '有些疲惫，基础能力收获减半。',
  group: 'result',
  role: 'result',
  emotion: '温和提醒，不责怪，也不夸张',
  ages: ['child', 'teen', 'grown'],
  priority: 46,
});

const encounters = [
  '林间灰狼',
  '山野大野猪',
  '古塔石像',
  '空心盔甲守卫',
  '山巅风灵',
  '雪羽山鸟',
];
for (const enemy of encounters) {
  add({
    id: `battle.${enemy}.win`,
    text: `遇到了${enemy}，她勇敢地赢下交锋！采集收益与额外奖励已收入行囊。`,
    group: 'battle',
    role: 'result',
    emotion: '有精神但不过度激烈，像冒险结束后的讲述',
    ages: ['child', 'teen', 'grown'],
    priority: 44,
  });
  add({
    id: `battle.${enemy}.retreat`,
    text: `遇到了${enemy}，她选择安全撤退。带回了沿途采集的小物，也积累了经验。`,
    group: 'battle',
    role: 'result',
    emotion: '平稳、安慰，承认撤退也是成长',
    ages: ['child', 'teen', 'grown'],
    priority: 44,
  });
}

lines.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'lines.json'), JSON.stringify({
  version: 1,
  text: '全部正式剧情与游戏演出文本',
  parentVariants: '角色选择为爸爸或妈妈时播放对应录音',
  count: lines.length,
  ageSemitones: { child: 1, teen: 0, grown: -1 },
  lines,
}, null, 2), 'utf8');

const groups: Record<string, number> = {};
for (const line of lines) {
  const group = line.group.split(':')[0];
  groups[group] = (groups[group] ?? 0) + 1;
}
console.log(JSON.stringify({
  count: lines.length,
  groups,
  output: resolve(out, 'lines.json'),
}, null, 2));
