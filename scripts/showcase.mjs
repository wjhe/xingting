// 展示截图：自动走一遍关键画面并截图，用来检查美术与界面表现。
// 用法：先 npm run dev，再 node scripts/showcase.mjs，截图输出到 screenshots/showcase/
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = 'screenshots/showcase';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));

const wait = (ms) => page.waitForTimeout(ms);
let n = 0;
const shot = (name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` });
const busy = () => page.evaluate(() => window.__test.busy());
async function idle() {
  for (let i = 0; i < 400 && (await busy()); i++) await wait(100);
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

async function tap(label, prefix = false) {
  await idle();
  const p = await page.evaluate(([l, x]) => window.__test.locate(l, x), [label, prefix]);
  if (!p) throw new Error(`找不到：${label}`);
  await page.mouse.click(p.x, p.y);
  await wait(150);
}
const cheat = (src) => page.evaluate((s) => new Function('g', s)(window.__test.sim()), src);
const sim = (expr) => page.evaluate((e) => new Function('g', `return ${e}`)(window.__test.sim()), expr);

/** 反复历练，直到遇到带插图的事件（可指定要战斗事件）；返回事件 id */
async function exploreUntilArt(wantBattle = false) {
  for (let i = 0; i < 40; i++) {
    await tap('外出历练');
    await wait(300);
    const ev = await sim('g.pendingEvent && { id: g.pendingEvent.id, art: g.pendingEvent.art, battle: g.pendingEvent.options.some((o) => o.battle) }');
    if (ev && ev.art && (!wantBattle || ev.battle)) return ev.id;
    if (ev) {
      const opt = await sim('g.pendingEvent.options.find((o) => !g.optionBlocked(o)).text');
      await tap(opt, true);
    }
  }
  return null;
}

await page.goto('http://localhost:5173/');
await ready();
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('wdcs_settings_v1', JSON.stringify({ textSpeed: 'line' }));
});
await page.reload();
await ready();

await shot('开局主视觉');

const talents = await page.evaluate(() => window.__test.game.scene.getScene('Create').offer.map((t) => `${t.name} · ${t.desc}`));
for (const t of talents.slice(0, 3)) await tap(t);
await tap('踏入仙途');
await wait(600);
await shot('主界面-头像与区域图');

await tap('闭关一年');
await wait(1300);
await shot('转场-引气入体');
await idle();

// 去落霞山，找一个有插图的事件
await tap('前往…');
await tap('落霞山', true);
await wait(900);
await shot('转场-赶路');
await idle();
const ev = await exploreUntilArt();
await wait(1500);
await shot(`事件插图-${ev}`);
const opt = await sim('g.pendingEvent.options.find((o) => !g.optionBlocked(o)).text');
await tap(opt, true);
await wait(1800);

// 战斗事件
await cheat('g.char.stage = 6; g.char.hp = g.combatStats.maxHp;');
const bev = await exploreUntilArt(true);
await wait(1500);
await shot(`战斗事件-${bev}`);
const bopt = await sim('g.pendingEvent.options.find((o) => o.battle).text');
await tap(bopt, true);
await wait(2500);
await shot('战报');

// 角色页立绘
await tap('角色');
await wait(400);
await shot('角色页');
await tap('行囊');
await wait(400);
await shot('行囊');
await tap('洞府');

// 筑基突破转场
await cheat("Object.assign(g.char, { stage: 8, cultivation: 900 }); g.state.inventory.zhuji_dan = 1; g.char.breakBonus = 1;");
await tap('角色');
await tap('洞府');
await tap('突破', true);
await wait(1400);
await shot('转场-筑基');
await idle();

// 死亡转场与轮回殿
await cheat('g.char.ageMonths = g.lifespanYears * 12 - 1;');
await tap('角色');
await tap('洞府');
await tap('闭关', true);
await wait(1400);
await shot('转场-死亡');
await idle();
await tap('转世重修');
await wait(800);
await shot('轮回殿');

// 昼间主题
await page.evaluate(() => localStorage.setItem('wdcs_settings_v1', JSON.stringify({ theme: 'day', textSpeed: 'instant' })));
await page.reload();
await ready();

await shot('昼-开局');
const t2 = await page.evaluate(() => window.__test.game.scene.getScene('Create').offer.map((t) => `${t.name} · ${t.desc}`));
for (const t of t2.slice(0, 3)) await tap(t);
await tap('踏入仙途');
await wait(600);
await tap('前往…');
await tap('落霞山', true);
await idle();
await exploreUntilArt();
await wait(800);
await shot('昼-事件');

await browser.close();
console.log(`截图 ${n} 张 → ${OUT}`);
console.log(errors.length ? `页面错误：\n${errors.join('\n')}` : '无页面错误');
