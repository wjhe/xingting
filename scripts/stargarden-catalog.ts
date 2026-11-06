import { mkdir, writeFile } from 'node:fs/promises';
import { EVENTS, OUTFITS } from '../src/raising/content';
import { CHAPTERS } from '../src/raising/story';

await mkdir('docs/stargarden', { recursive:true });
const catalog=EVENTS.map(e=>({id:e.id,kind:e.kind??'daily',title:e.title,minAge:e.minAge??10,maxAge:e.maxAge??17,dueMonth:e.dueMonth??null,conditions:e.conditions??{},choices:e.choices}));
await writeFile('docs/stargarden/事件台账.json',JSON.stringify(catalog,null,2)+'\n','utf8');
const rows=EVENTS.map(e=>`| ${e.id} | ${e.kind==='main'?'主线':e.kind==='side'?'支线':'生活'} | ${e.title} | ${e.dueMonth!==undefined?`第 ${e.dueMonth} 月`:e.minAge?`${e.minAge} 岁起`:'条件/随机'} | ${JSON.stringify(e.conditions??{}).split('|').join('/')} |`);
await writeFile('docs/stargarden/剧情与事件目录.md',`# 剧情与事件目录\n\n由 \`npm run catalog:raising\` 从实际内容生成。当前共 ${EVENTS.length} 个独立事件，${EVENTS.reduce((n,e)=>n+e.choices.length,0)} 个选项。\n\n主线：${CHAPTERS.map((c,i)=>`${10+i} 岁「${c}」`).join('、')}。\n\n一次月结算最多触发一个事件。到期主线优先，未触发的普通条件事件继续留在候选池。月份限定的事件在之后适合的季节再次进入候选池；并非单周目保证看完全部内容。\n\n| 编号 | 类型 | 标题 | 时间 | 额外条件 |\n|---|---|---|---|---|\n${rows.join('\n')}\n`,'utf8');
await writeFile('docs/stargarden/服装目录.md',`# 服装目录\n\n新款按 10–13、14–15、16–18 岁提供独立立绘。购买一次款式，拥有各年龄适配款；年龄变化后自动换用相应立绘，购买本身不强制改变当前穿着。\n\n| 款式 | 价格 | 说明 |\n|---|---:|---|\n${OUTFITS.map(o=>`| ${o.name}（${o.id}） | ${o.price} G | ${o.description} |`).join('\n')}\n\n庭院来信是默认款；蔷薇午后、晴空序曲是保留的同款配色，不能计为新衣装版型。新款（夏装、冬装、礼服、春日花信、枫叶暖秋、雨后小径、星夜安睡）各自有不同的轮廓、袖型、裙摆与配饰。\n`,'utf8');
console.log(`Catalog: ${EVENTS.length} events, ${OUTFITS.length} wardrobe entries, ${CHAPTERS.length} chapters.`);
