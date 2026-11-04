// 冒烟测试：用本机 Edge 打开游戏，模拟手机屏幕点击并截图。
// 用法：先 npm run dev，再 node scripts/smoke.mjs [url]，截图输出到 screenshots/
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const VIEW = { width: 390, height: 844 };

rmSync('screenshots', { recursive: true, force: true });
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));

let shotNo = 0;
const shot = (name) => page.screenshot({ path: `screenshots/${String(++shotNo).padStart(2, '0')}-${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

/** 按按钮文字点击；prefix 为真时按开头匹配 */
/** 等全屏转场播完（最多 5 秒） */
async function idle() {
  for (let i = 0; i < 400 && (await page.evaluate(() => window.__test.busy())); i++) await page.waitForTimeout(100);
}

/** 等启动加载完、进入某个界面（开局或主界面） */
async function ready() {
  for (let i = 0; i < 150; i++) {
    const ok = await page.evaluate(() => !!window.__test && ['Create', 'Main'].some((k) => window.__test.game.scene.isActive(k)));
    if (ok) return page.waitForTimeout(300);
    await page.waitForTimeout(100);
  }
  throw new Error('启动超时');
}

/** 选项按钮会把结尾的括号和成功率合并（如"（30 灵石 · 约 80%）"），按去掉结尾括号后的前缀找 */
const optPrefix = (t) => t.replace(/）$/, '');

// 突破失败后行动区会先问要不要看视频"逆天改命"，像不看广告的玩家一样选"认了"
const DECLINE_AD = ['认了，继续修行', '收下'];
async function declineAds() {
  for (const label of DECLINE_AD) {
    const pos = await page.evaluate((l) => window.__test.locate(l), label);
    if (pos) {
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(200);
    }
  }
}

async function tap(label, prefix = false, near) {
  await idle();
  if (!DECLINE_AD.includes(label)) await declineAds();
  const pos = await page.evaluate(([l, p, n]) => window.__test.locate(l, p, n), [label, prefix, near]);
  if (!pos) throw new Error(`找不到按钮：${label}${near ? `（${near} 那一行）` : ''}
可见文字：${(await page.evaluate(() => window.__test.texts())).join(' | ')}`);
  await page.mouse.click(pos.x, pos.y);
  await wait(200);
}

/** 直接修改游戏状态（只用于测试），然后切一次页让界面刷新 */
async function cheat(fn, arg) {
  await page.evaluate(([src, a]) => new Function('g', 'a', src)(window.__test.sim(), a), [fn, arg]);
}

const sim = (expr) => page.evaluate((e) => new Function('g', `return ${e}`)(window.__test.sim()), expr);

/** 开局界面：选前三个天赋 */
async function pickTalents() {
  const labels = await page.evaluate(() => window.__test.game.scene.getScene('Create').offer.map((t) => `${t.name} · ${t.desc}`));
  for (const l of labels.slice(0, 3)) await tap(l);
}

await page.goto(url);
await ready();
await page.evaluate(() => localStorage.clear());
await page.reload();
await ready();

await shot('create');
await pickTalents();
await shot('create-talents');

await tap('踏入仙途');
await wait(300);
await shot('main');

await tap('闭关一年');
await tap('闭关一年');
await wait(1500);
await shot('lianqi');
// 小层修满：亲手冲关，看演出（灵根差的开局两年攒不满，先补满）
await cheat(`g.char.cultivation = g.stageReq;`);
await tap('角色');
await tap('洞府');
await tap('冲击', true);
await page.waitForTimeout(500);
await shot('stage-rise');
await page.waitForTimeout(1200);
await shot('stage-result');
await wait(1500);
// 筑基的完整版演出（服了破境丹则灵气带金光）
// 上一步冲关有 15% 会卡瓶颈，要清掉，否则按钮是"破瓶颈"不是"冲击"
await cheat(`Object.assign(g.char, { realm: 'zhuji', stage: 0, stuck: false }); g.char.cultivation = g.stageReq;`);
await tap('角色');
await tap('洞府');
await tap('冲击', true);
await page.waitForTimeout(1300);
await shot('stage-zhuji-rise');
await page.waitForTimeout(1300);
await shot('stage-zhuji-result');
await wait(2500);
// 后期 → 圆满必卡：看撞上瓶颈的演出
await cheat(`Object.assign(g.char, { realm: 'zhuji', stage: 2, stuck: false }); g.char.cultivation = g.stageReq;`);
await tap('角色');
await tap('洞府');
await tap('冲击', true);
await page.waitForTimeout(2600);
await shot('stage-stuck');
await wait(2500);
await cheat(`Object.assign(g.char, { realm: 'lianqi', stage: 1, stuck: false, cultivation: 0 });`);

// 准备一些物品，检查行囊、坊市、角色页
await cheat(`g.char.stones = 3000; Object.assign(g.state.inventory, { juqi_dan: 2, huichun_dan: 1, herb_qingling: 5, scroll_broken: 1, zhuji_dan: 1, sword_qingfeng: 1, fire_talisman: 3, escape_talisman: 1 });`);
await tap('行囊');
await shot('bag');
await tap('服用');
await tap('装备');
await shot('bag-used');

await tap('洞府');
await tap('前往…');
await shot('travel-menu');
await tap('青云坊市', true);
await wait(800);
await tap('坊市');
await shot('shop');
await tap('购买');
await shot('shop-bought');
await tap('行囊');
await shot('bag-at-market');
await tap('材料');
await tap('出售', true, '青灵草');
await shot('bag-sell-panel');
await tap('－1');
await tap('卖出', true);
await shot('bag-sold');
await tap('丹药');
await shot('bag-cat-pill');
await cheat(`Object.assign(g.state.inventory, { book_xuanshui: 1, pojing_dan: 1, sword_chixia: 1 });`);
await tap('典籍');
await shot('bag-blocked-book');
await tap('全部');
await tap('坊市');
await tap('符箓');
await shot('shop-cat-talisman');
await tap('全部');
await tap('角色');
await shot('char');

// 丹房：研读丹方、开炉
await cheat(`Object.assign(g.state.inventory, { herb_qingling: 9, herb_chixue: 4, danfang_zhuji: 1 });`);
await tap('行囊');
await tap('典籍');
await tap('研读');
await shot('bag-recipe-read');
await tap('丹房');
await shot('dan');
await tap('开炉');
await wait(2600);
await shot('dan-brewed');
await tap('洞府');
await wait(400);
await shot('dan-log');

// 冲关准备：筑基圆满、有结丹灵果，看角色页的清单，再冲一次关（可能遇到外扰事件）
await cheat(`Object.assign(g.char, { realm: 'zhuji', stage: 3 }); g.char.cultivation = g.stageReq; g.char.hp = g.combatStats.maxHp; g.char.attrs.xinjing = 20; Object.assign(g.state.inventory, { jiedan_lingguo: 1, jiangchen_dan: 1, pojing_dan: 2 });`);
await tap('角色');
await shot('char-core');
await tap('洞府');
await tap('突破', true);
await wait(2500);
await shot('break-core');
// 外扰或心魔事件：选第一个能选的
for (let i = 0; i < 3 && (await sim('!!g.pendingEvent')); i++) {
  const first = await sim('g.pendingEvent.options.find((o) => !g.optionBlocked(o)).text');
  await tap(optPrefix(first), true);
  await wait(2500);
}
await shot('break-core-done');
await cheat(`g.state.breaking = null; g.state.breakStage = null; g.state.pendingEventId = null;`);

// 突破线索：金丹圆满、缺化婴丹，没听过丹王的话
await cheat(`Object.assign(g.char, { realm: 'jindan', stage: 3 }); g.char.cultivation = g.stageReq; g.char.hp = g.combatStats.maxHp;`);
await tap('角色');
await shot('char-guide-unknown');
await cheat(`g.state.seenEvents.push('market_danwang_intro'); g.state.inventory.lian_xin = 1;`);
await tap('洞府');
await tap('角色');
await shot('char-guide-known');
await tap('洞府');
await tap('缺', true);
await wait(400);
await shot('break-missing-log');
await cheat(`Object.assign(g.char, { realm: 'lianqi', stage: 1, cultivation: 0 }); delete g.state.inventory.lian_xin; g.char.hp = g.combatStats.maxHp;`);
await tap('角色');

// 设置：切到昼间主题、特大字号、逐字显示，看效果
const scrollChar = async () => {
  await wait(400);
  await page.evaluate(() => window.__test.game.scene.getScene('Main').views.char.scrollBy(99999));
  await wait(200);
};
await scrollChar();
await shot('settings');
for (const opt of ['特大', '夜', '逐字']) {
  await tap(opt);
  await scrollChar();
}
await shot('settings-day');
await tap('洞府');
await tap('外出历练');
await wait(250);
await shot('day-typing');
await wait(3000);
await shot('day-home');
// 有事件就先处理掉
const pending = await sim('g.pendingEvent?.options.find((o) => !g.optionBlocked(o))?.text ?? null');
if (pending) {
  // 事件面前：坊市上锁（弹提示），行囊可以服药做准备
  await tap('坊市');
  await page.waitForTimeout(300);
  await shot('locked-shop');
  await tap('行囊');
  await shot('bag-during-event');
  await tap('洞府');
  await tap(optPrefix(pending), true);
}
// 恢复默认设置
await page.evaluate(() => localStorage.removeItem('wdcs_settings_v1'));
await page.reload();
await ready();


// 去落霞山历练，有事件就选第一个可选项
await tap('洞府');
await tap('前往…');
await tap('落霞山', true);
let battles = 0;
for (let i = 0; i < 14; i++) {
  await tap('外出历练');
  await wait(400);
  const opt = await sim(`(() => { const e = g.pendingEvent; if (!e) return null; const o = e.options.find((o) => !g.optionBlocked(o)); return { text: o.text, battle: !!o.battle }; })()`);
  if (!opt) continue;
  await shot(`event-${i}`);
  await tap(optPrefix(opt.text), true);
  await wait(1500);
  if (opt.battle) {
    battles++;
    await shot(`battle-${i}`);
  }
}
await shot('after-explore');

// 刷新后读档
await page.reload();
await ready();

await shot('reload');

// 寿终与转世
await cheat(`g.char.ageMonths = g.lifespanYears * 12 - 1;`);
await tap('角色');
await tap('洞府');
await tap('闭关', true);
await wait(1500);
await shot('death');
await tap('转世重修');
await wait(500);
await shot('rebirth-hall');
await page.evaluate(() => {
  // 给足轮回点，验证解锁
  const m = JSON.parse(localStorage.getItem('wdcs_meta_v1'));
  m.points += 100;
  localStorage.setItem('wdcs_meta_v1', JSON.stringify(m));
});
await page.reload();
await ready();

await tap('轮回殿', true);
await tap('15 点解锁');
await shot('rebirth-unlocked');
await tap('开始第 2 世');
await wait(300);
await shot('create-life2');
await pickTalents();
await tap('踏入仙途');
await wait(300);

// 结局：修到渡劫圆满，带着"知晓真相"去飞升。九霄避雷符改成减伤 99%，必定撑过天劫；心境拉满，必过心魔
await cheat(`Object.assign(g.char, { realm: 'dujie', stage: 3, cultivation: 1e12 }); g.char.attrs.xinjing = 99; g.state.metaFlags.truth_known = true; g.state.inventory.jiuxiao_fu = 1; g.item('jiuxiao_fu').talisman.value = 99; g.char.hp = g.combatStats.maxHp;`);
await tap('角色');
await tap('洞府');
await tap('飞升', true);
await wait(1500);
await shot('tribulation');
const heartOpt = await sim('g.pendingEvent?.options[0]?.text ?? null');
if (heartOpt) await tap(optPrefix(heartOpt), true);
await wait(1500);
await shot('ending-choice');
await tap('循着声音，打破这轮回');
await wait(1500);
await shot('ending');
await tap('转世重修');
await wait(500);
await shot('rebirth-after-ending');

await browser.close();
console.log(`截图 ${shotNo} 张，战斗 ${battles} 场`);
console.log(errors.length ? `页面错误：\n${errors.join('\n')}` : '无页面错误');
