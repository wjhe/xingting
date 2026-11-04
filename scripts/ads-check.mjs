// 广告位走查：在浏览器里把每个激励视频广告位和插屏都走一遍（模拟广告），核对奖励和次数。
// 用法：先 npm run dev，再 node scripts/ads-check.mjs；截图在 screenshots/_ads/
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = 'screenshots/_ads';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const texts = () => page.evaluate(() => window.__test.texts());
const idle = async () => { for (let i = 0; i < 100 && (await page.evaluate(() => window.__test.busy())); i++) await wait(100); };
async function tap(label, prefix = true) {
  await idle();
  const p = await page.evaluate(([l, pr]) => window.__test.locate(l, pr), [label, prefix]);
  if (!p) throw new Error(`找不到：${label}\n${(await texts()).join(' | ')}`);
  await page.mouse.click(p.x, p.y);
  await wait(250);
}
const sim = (code) => page.evaluate(`(() => { const g = window.__test.sim(); const m = window.__test.game.scene.getScene('Main'); ${code}; m.refresh(); })()`);
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) process.exitCode = 1; };

await page.goto('http://localhost:5173/');
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('wdcs_settings_v1', JSON.stringify({ textSpeed: 'instant' })); });
await page.reload();
await page.waitForFunction(() => window.__test?.game.scene.isActive('Create'));
await wait(400);
const labels = await page.evaluate(() => window.__test.game.scene.getScene('Create').offer.map((t) => `${t.name} · ${t.desc}`));
for (const l of labels.slice(0, 3)) await tap(l, false);
await tap('踏入仙途');
await page.waitForFunction(() => window.__test.game.scene.isActive('Main'));
await wait(2500);

// 1. 突破失败 → 逆天改命（先中途关闭，再看完）
let failed = false;
for (let i = 0; i < 15 && !failed; i++) {
  await sim(`Object.assign(g.char, { realm: 'lianqi', stage: 8, stuck: false, cultivation: 900 }); g.state.inventory.zhuji_dan = 1; g.char.hp = g.combatStats.maxHp`);
  await tap('突破');
  await wait(600);
  await idle();
  failed = await page.evaluate(() => window.__test.sim().canUndoBreak);
  if (!failed) await sim(`Object.assign(g.char, { realm: 'lianqi' })`);
}
check(failed, '突破失败后可以逆天改命');
await shot('01_undo_offer');
const lost = await page.evaluate(() => ({ c: window.__test.sim().char.cultivation, p: window.__test.sim().char.lifespanPenalty }));
await tap('▶ 看视频 · 逆天改命');
await wait(500);
await shot('02_fake_ad');
await page.click('text=关闭（放弃奖励）');
await wait(300);
await shot('03_closed_hint');
check((await page.evaluate(() => window.__test.sim().canUndoBreak)), '中途关闭：不发奖励，还能再看');
await tap('▶ 看视频 · 逆天改命');
await wait(2600);
await idle();
const after = await page.evaluate(() => ({ c: window.__test.sim().char.cultivation, p: window.__test.sim().char.lifespanPenalty }));
check(after.c === 900 && after.p === lost.p && lost.c < 900, `看完：修为 ${lost.c} → ${after.c}，寿元折损仍为 ${after.p} 年（不退）`);
await shot('04_undo_done');

// 2. 战死 → 残魂不灭
await sim(`Object.assign(g.char, { realm: 'zhuji', stage: 1, cultivation: 100 }); g.die('测试：陨落于妖兽之手。', 'battle')`);
await wait(2600);
await idle();
await shot('05_death_panel');
const t = (await texts()).join('|');
check(t.includes('残魂不灭') && t.includes('转世重修'), '死后：残魂不灭和转世重修都在');
await tap('▶ 看视频 · 残魂不灭');
await wait(2600);
await shot('06_revive_anim');
await idle();
check(!(await page.evaluate(() => window.__test.sim().state.dead)), '残魂不灭后复活');
await shot('07_revived');
await sim(`g.die('测试：再次陨落。', 'battle')`);
await wait(2600);
await idle();
check(!(await texts()).join('|').includes('残魂不灭'), '本世用过一次，不再出现');

// 3. 转世结算 → 轮回点 ×1.5
await tap('转世重修');
await page.waitForFunction(() => window.__test.game.scene.isActive('Rebirth'));
await wait(600);
await shot('08_rebirth_offer');
const pts0 = await page.evaluate(() => JSON.parse(localStorage.getItem('wdcs_meta_v1')).points);
await tap('▶ 看视频 · 轮回点');
await wait(2700);
const pts1 = await page.evaluate(() => JSON.parse(localStorage.getItem('wdcs_meta_v1')).points);
check(pts1 > pts0, `轮回点 ${pts0} → ${pts1}`);
await shot('09_rebirth_boosted');

// 4. 开局：免费换一批用完后，看视频再换
await tap('开始第');
await page.waitForFunction(() => window.__test.game.scene.isActive('Create'));
await wait(500);
await tap('换一批');
await wait(300);
await shot('10_create_reroll_ad');
check((await texts()).includes('▶ 看视频换一批'), '免费次数用完后出现看视频换一批');
await tap('▶ 看视频换一批');
await wait(2600);
check((await texts()).some((s) => s.startsWith('换一批（0')), '看完后又换了一批，本世不再提供');

// 5. 坊市刷新、暂无广告
const labels2 = await page.evaluate(() => window.__test.game.scene.getScene('Create').offer.map((t) => `${t.name} · ${t.desc}`));
for (const l of labels2.slice(0, 3)) await tap(l, false);
await tap('踏入仙途');
await page.waitForFunction(() => window.__test.game.scene.isActive('Main'));
await wait(2500);
await sim(`g.state.region = 'qingyun_market'`);
await tap('坊市');
await wait(400);
await shot('11_shop_refresh');
check((await texts()).some((s) => s.includes('刷新货架')), '坊市有刷新货架按钮');

// 5b. 丹房：炸炉 → 保住药材（聚气丹成丹率不足五成，循环几次必然炸炉）
await tap('丹房');
const brewTillFail = async () => {
  for (let i = 0; i < 15; i++) {
    await sim(`g.state.pendingEventId = null; g.char.hp = g.combatStats.maxHp; g.state.inventory.herb_qingling = 60; g.state.inventory.herb_chixue = 60; g.brew('juqi'); g.drainSignals()`);
    await wait(200);
    if (await page.evaluate(() => window.__test.sim().canSaveHerbs)) return true;
  }
  return false;
};
check(await brewTillFail(), '炸炉后进入可以保住药材的状态');
await tap('丹房');
await wait(300);
await shot('12a_herbs_offer');
const hText = (await texts()).join('|');
check(hText.includes('方才炸了炉') && hText.includes('保住这一炉药材'), '丹房出现保住药材按钮');
const inv0 = await page.evaluate(() => { const s = window.__test.sim().state.inventory; return [s.herb_qingling, s.herb_chixue]; });
await tap('▶ 看视频 · 保住这一炉药材');
await wait(2600);
await idle();
const inv1 = await page.evaluate(() => { const s = window.__test.sim().state.inventory; return [s.herb_qingling, s.herb_chixue]; });
check(inv0[0] < 60 && inv1[0] === 60 && inv1[1] === 60, `药材原样找回：青灵草 ${inv0[0]} → ${inv1[0]}，赤血藤 ${inv0[1]} → ${inv1[1]}`);
check(!(await page.evaluate(() => window.__test.sim().canSaveHerbs)), '保住之后不能重复再领');
await shot('13a_herbs_saved');

// 再炸一次，然后做别的耗时动作 → 按钮作废（这是设计上刻意的）
check(await brewTillFail(), '再次炸炉');
await tap('洞府');
await tap('闭关半年');
await wait(700);
await idle();
await tap('丹房');
await wait(300);
await shot('14a_herbs_expired');
check(!(await texts()).join('|').includes('保住这一炉药材'), '做了别的耗时动作后按钮消失，药材作废');

// 5c. 离线回来 → 灵气储备翻倍
await sim(`g.state.pendingEventId = null; g.state.offline.reserve = 0; g.state.offline.lastSeen = Date.now() - 90 * 60000`);
await page.evaluate(() => window.__test.game.events.emit('visible'));
await wait(800);
await idle();
// 行动区只在洞府页
await tap('洞府');
await wait(300);
await shot('15a_offline_offer');
check((await texts()).join('|').includes('灵气储备翻倍'), '离线回来出现灵气翻倍选项');
const r0 = await page.evaluate(() => window.__test.sim().offlineReserve);
await tap('▶ 看视频 · 灵气储备翻倍');
await wait(2600);
await idle();
const r1 = await page.evaluate(() => window.__test.sim().offlineReserve);
check(r0 >= 10 && r1 === r0 * 2, `灵气储备 ${r0} 分钟 → ${r1} 分钟（翻倍）`);
await shot('16a_offline_doubled');

await page.evaluate(() => localStorage.setItem('wdcs_fake_ads', 'nofill'));
await tap('洞府');
await sim(`g.die('测试：陨落。', 'battle')`);
await wait(2600);
await idle();
await shot('12_nofill');
check((await texts()).some((s) => s.includes('暂无可用视频')), '没有广告时显示暂无可用视频');
await page.evaluate(() => localStorage.removeItem('wdcs_fake_ads'));

// 6. 插屏：已过新手期、第 2 世以后，离开轮回殿时出现
await page.evaluate(() => {
  const m = JSON.parse(localStorage.getItem('wdcs_meta_v1'));
  m.lives = 3; m.ads.firstSeen = Date.now() - 3600_000; m.ads.used = {}; m.ads.interstitials = 0; m.ads.lastInterstitial = 0;
  localStorage.setItem('wdcs_meta_v1', JSON.stringify(m));
});
await tap('转世重修');
await page.waitForFunction(() => window.__test.game.scene.isActive('Rebirth'));
await wait(500);
await tap('开始第');
await wait(600);
await shot('13_interstitial');
check(await page.evaluate(() => document.body.innerText.includes('模拟插屏广告')), '离开轮回殿时出现插屏');
await page.waitForFunction(() => window.__test.game.scene.isActive('Create'), null, { timeout: 8000 });
check(true, '插屏结束后进入开局');

console.log(errors.length ? `页面错误：${errors.join('\n')}` : '无页面错误');
await browser.close();
