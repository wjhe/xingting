import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENDINGS, EVENTS } from '../src/raising/content';

type Stage = 'child' | 'teen' | 'grown';
type DialogueLine = {
  id: string;
  text: string;
  group: string;
  role: 'daughter' | 'ending' | 'talk' | 'gift' | 'birthday';
  emotion: string;
  ages: Stage[];
  parent?: '爸爸' | '妈妈';
  priority: number;
};

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'art-src/stargarden/audio/voice-dialogue-v1');
const lines: DialogueLine[] = [];

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
function add(line: DialogueLine): void {
  if (!line.text.trim()) throw new Error('Empty dialogue: ' + line.id);
  if (lines.some(item => item.id === line.id)) throw new Error('Duplicate dialogue: ' + line.id);
  lines.push(line);
}
function agesForEvent(id: string): Stage[] {
  const event = EVENTS.find(item => item.id === id);
  if (!event) throw new Error('Unknown event: ' + id);
  if (event.kind === 'main') {
    return [stageForAge(10 + Math.floor(((event.dueMonth ?? 1) - 1) / 12))];
  }
  return stagesFromAge(event.minAge ?? 10);
}

// Only direct speech by the daughter. Quoted labels, diary entries, notes and
// other characters are deliberately excluded from this voice catalog.
const eventDialogue: Record<string, Record<string, string[]>> = {
  main_0_0: { text: ['如果我弄丢了，还能回来吗？'] },
  main_0_1: { text: ['没有很厉害的愿望，也可以写吗？'] },
  main_0_2: { text: ['我的东西，好像不值得别人看。'], outcome1: ['我想先讲给一个人听。'] },
  main_1_1: { text: ['以前说喜欢，现在又不喜欢了，是不是很没用？'] },
  main_1_2: { text: ['这次，我想自己讲。'] },
  main_2_0: { text: ['我是不是学得太慢了？'] },
  main_2_2: { text: ['能帮我戴上吗？'] },
  main_3_0: { text: ['没关系。'], outcome0: ['我很难过。'] },
  main_3_2: { text: ['这次，我想讲失败以后发生的事。'] },
  main_4_0: { text: ['我知道你是为我好，但这一次，可以先听我说完吗？'] },
  main_4_2: { text: ['今年可以写我的名字吗？'] },
  main_5_0: { text: ['他们不听我的话怎么办？'] },
  main_6_0: { text: ['如果我想去的地方，这上面没有呢？'] },
  main_6_1: { text: ['留下会不会显得不够勇敢？'] },
  main_7_0: { text: ['那时候的字，怎么这么小？'] },
  main_7_1: { text: ['不管最后做得怎样，你会来吗？'] },
  kitten: { text: ['我们可以帮帮它吗？'] },
  book: { text: ['原来，天上的星星也有名字。'] },
  sword: { outcome0: ['我也想保护重要的人。'] },
  painting: { outcome0: ['其实画得还不够好……'] },
  dream: { text: ['长大以后，我一定要成为很厉害的人吗？'], outcome0: ['那我也希望你一直快乐。'] },
  flowers: { outcome1: ['明年这里会是一座小花园。'] },
  exam: { text: ['我明明很努力了，为什么还是做不好？'] },
  friendship: { outcome1: ['我们聊聊吧。'] },
  independent: { text: ['这次的晚餐，我来请。'] },
  letter: {
    text: ['如果以后离家很远，你会想我吗？'],
    outcome1: ['第一封，就从出发那天开始写。'],
  },
  portrait: { text: ['原来，真的长大了好多。'] },
};

for (const [eventId, fields] of Object.entries(eventDialogue)) {
  const ages = agesForEvent(eventId);
  for (const [field, texts] of Object.entries(fields)) {
    texts.forEach((text, index) => add({
      id: `dialogue.${eventId}.${field}.${index}`,
      text,
      group: `event:${eventId}`,
      role: 'daughter',
      emotion: '自然入戏，像一个正在成长的孩子直接说话，不朗读叙述',
      ages,
      priority: 10,
    }));
  }
}
add({
  id: 'dialogue.main_7_2.memory',
  text: '这些，我都记得。',
  group: 'event:main_7_2',
  role: 'daughter',
  emotion: '温柔、怀念，像在回望整段成长',
  ages: ['grown'],
  priority: 12,
});

const openingSource = readFileSync(resolve(root, 'src/raising/opening.ts'), 'utf8');
const beatsPart = openingSource.slice(openingSource.indexOf('const BEATS'));
const beatChunks = beatsPart.split(/\{\s*art\s*:/).slice(1);
beatChunks.forEach((chunk, beatIndex) => {
  const pattern = /\b([ng])\('([^']+)'(?:,\s*'[^']+')?\)|\{\s*kind:\s*'parent'\s*\}/g;
  let match: RegExpExecArray | null;
  let lineIndex = 0;
  while ((match = pattern.exec(chunk)) !== null) {
    if (!match[1]) {
      lineIndex++;
      continue;
    }
    if (match[1] === 'g') {
      const baseId = `opening.${beatIndex}.${lineIndex}`;
      if (match[2].includes('{parent}')) {
        add({ id: baseId + '.dad', text: match[2].replace(/\{parent\}/g, '爸爸'), group: 'opening',
          role: 'daughter', emotion: '年幼、自然，刚确认家人称呼', ages: ['child'], parent: '爸爸', priority: 0 });
        add({ id: baseId + '.mom', text: match[2].replace(/\{parent\}/g, '妈妈'), group: 'opening',
          role: 'daughter', emotion: '年幼、自然，刚确认家人称呼', ages: ['child'], parent: '妈妈', priority: 0 });
      } else {
        add({ id: baseId, text: match[2], group: 'opening', role: 'daughter',
          emotion: '年幼、自然，符合开场当下的情绪', ages: ['child'], priority: 0 });
      }
    }
    lineIndex++;
  }
});

const talkMatch = /const lines = \[(.+?)\];/s.exec(readFileSync(resolve(root, 'src/raising/game.ts'), 'utf8'));
if (!talkMatch) throw new Error('Could not locate talk dialogue');
const talkLines = [...talkMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
talkLines.forEach((text, index) => add({
  id: `talk.${index}`,
  text,
  group: 'talk',
  role: 'talk',
  emotion: '亲密、自然，像和养育者说悄悄话',
  ages: ['child', 'teen', 'grown'],
  priority: 20,
}));

add({
  id: 'gift.girl',
  text: '是我最喜欢的蜂蜜饼干！谢谢你。',
  group: 'gift',
  role: 'gift',
  emotion: '开心而亲近，不夸张',
  ages: ['child', 'teen', 'grown'],
  priority: 22,
});
add({
  id: 'birthday.girl',
  text: '明年也要一起过生日。',
  group: 'birthday',
  role: 'birthday',
  emotion: '温暖、开心，带着一点期待',
  ages: ['child', 'teen', 'grown'],
  priority: 22,
});

for (const ending of ENDINGS) {
  if (!['knight', 'gardener'].includes(ending.id)) continue;
  const open = String.fromCharCode(8220);
  const close = String.fromCharCode(8221);
  const pattern = new RegExp(open + '([^' + close + ']+)' + close, 'g');
  for (const match of ending.text.matchAll(pattern)) add({
    id: `ending.${ending.id}.${lines.filter(line => line.group === `ending:${ending.id}`).length}`,
    text: match[1],
    group: `ending:${ending.id}`,
    role: 'ending',
    emotion: '成年后自然、成熟、温柔',
    ages: ['grown'],
    priority: 5,
  });
}

lines.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'lines.json'), JSON.stringify({
  version: 1,
  scope: '只有女儿直接说出的台词；旁白、选项、活动说明和其他角色不配音',
  parentVariants: '开场爸爸和妈妈台词分别保存，按玩家称呼选择播放',
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
  ageClips: lines.reduce((sum, line) => sum + line.ages.length, 0),
  groups,
  output: resolve(out, 'lines.json'),
}, null, 2));
