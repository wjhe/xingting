// 门口走查：用模拟的 TapTap（localStorage wdcs_fake_tap）把隐私政策、登录、实名认证、防沉迷踢出都走一遍。
// 用法：先 npm run dev，再 node scripts/gate-check.mjs；截图在 screenshots/_gate/
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = 'screenshots/_gate';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) process.exitCode = 1; };

async function open(fakeCode, { consent = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5173/');
  await page.evaluate(([code, c]) => {
    localStorage.clear();
    localStorage.setItem('wdcs_fake_tap', String(code));
    if (c) localStorage.setItem('wdcs_legal_consent', c);
  }, [fakeCode, consent]);
  await page.reload();
  await page.waitForFunction(() => window.__test && ['Gate', 'Create', 'Main'].some((k) => window.__test.game.scene.isActive(k)));
  await page.waitForTimeout(800);
  return page;
}
const texts = (page) => page.evaluate(() => window.__test.texts());
async function tap(page, label) {
  const p = await page.evaluate((l) => window.__test.locate(l, true), label);
  if (!p) throw new Error(`找不到：${label}\n${(await texts(page)).join(' | ')}`);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
}
const active = (page, k) => page.evaluate((k) => window.__test.game.scene.isActive(k), k);
const version = await (async () => {
  const p = await open(500);
  const v = await p.evaluate(() => import('/src/data/legal.ts').then((m) => m.LEGAL_VERSION));
  await p.close();
  return v;
})();

// 1. 首次：隐私政策 → 看协议 → 同意 → 登录 → 实名通过 → 开局
{
  const page = await open(500);
  await page.screenshot({ path: `${OUT}/01_consent.png` });
  check((await texts(page)).includes('同意并进入'), '首次打开先看到隐私政策同意页');
  await tap(page, '《隐私政策》');
  await page.screenshot({ path: `${OUT}/02_privacy.png` });
  // 正文很长，大部分在屏幕外：直接查场景里的文字对象
  const allText = await page.evaluate(() => window.__test.game.scene.getScene('Gate').children.list.map((o) => o.text ?? '').join('\n'));
  check(allText.includes('TapSDK') && allText.includes('TapADN'), '隐私政策全文列出 TapSDK 和 TapADN');
  await tap(page, '返回');
  await tap(page, '不同意');
  await page.screenshot({ path: `${OUT}/03_declined.png` });
  check((await texts(page)).includes('退出游戏'), '不同意：说明原因，可退出');
  await tap(page, '再看看');
  await tap(page, '同意并进入');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/04_login.png` });
  check((await texts(page)).includes('TapTap 登录'), '同意后显示 TapTap 登录');
  await tap(page, 'TapTap 登录');
  await page.waitForFunction(() => window.__test.game.scene.isActive('Create'), null, { timeout: 8000 });
  check(true, '登录并通过实名认证后进入开局');

  // 2. 游戏中途：防沉迷时长用尽，被送回门口
  const labels = await page.evaluate(() => window.__test.game.scene.getScene('Create').offer.map((t) => `${t.name} · ${t.desc}`));
  for (const l of labels.slice(0, 3)) await tap(page, l);
  await tap(page, '踏入仙途');
  await page.waitForFunction(() => window.__test.game.scene.isActive('Main'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__fakeCompliance(1050));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/05_kicked.png` });
  check((await active(page, 'Gate')) && !(await active(page, 'Main')), '时长用尽：停掉游戏，回到门口');
  check((await texts(page)).some((t) => t.includes('时长已用完')), '提示时长已用完');
  check(await page.evaluate(() => !!localStorage.getItem('wdcs_save_v1')), '被踢出前已存档');
  await page.close();
}

// 3. 未成年人不在可玩时段：拦在门口
{
  const page = await open(1030, { consent: version });
  await tap(page, 'TapTap 登录');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/06_period.png` });
  check((await texts(page)).some((t) => t.includes('20:00 至 21:00')), '不在可玩时段：说明规定，不能进入');
  check(!(await active(page, 'Create')) && !(await active(page, 'Main')), '没有进入游戏');
  await page.close();
}

// 4. 已登录玩家从设置里退出 TapTap 登录
{
  const page = await open(500, { consent: version });
  await tap(page, 'TapTap 登录');
  await page.waitForFunction(() => window.__test.game.scene.isActive('Create'), null, { timeout: 8000 });
  const labels = await page.evaluate(() => window.__test.game.scene.getScene('Create').offer.map((t) => `${t.name} · ${t.desc}`));
  for (const l of labels.slice(0, 3)) await tap(page, l);
  await tap(page, '踏入仙途');
  await page.waitForFunction(() => window.__test.game.scene.isActive('Main'));
  await page.waitForTimeout(1500);
  await tap(page, '角色');
  // 设置在页面最下面，点顶部的"设置"入口滚过去
  await tap(page, '设置');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/07_settings.png` });
  await tap(page, '退出 TapTap 登录');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/08_logged_out.png` });
  check((await active(page, 'Gate')) && (await texts(page)).includes('TapTap 登录'), '退出登录后回到登录页');
  // 退出时 SDK 还会回调 1000：不能再踢一次，更不能被残留的认证流程送回游戏
  await page.waitForTimeout(3000);
  const t = await texts(page);
  const inGame = await page.evaluate(() => ['Main', 'Create', 'Rebirth'].some((k) => window.__test.game.scene.isActive(k)));
  check(!inGame && t.includes('TapTap 登录'), '退出 3 秒后仍停在登录页，没有自动回到游戏');
  check(t.includes('已退出 TapTap 登录。'), '提示"已退出 TapTap 登录"，而不是"登录已失效"');
  // 重新登录能正常进入
  await tap(page, 'TapTap 登录');
  await page.waitForFunction(() => window.__test.game.scene.isActive('Main'), null, { timeout: 8000 });
  check(true, '重新登录后回到游戏');
  await page.close();
}

// 5. 网页版（没有 TapTap）：直接进游戏
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5173/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__test?.game.scene.isActive('Create'), null, { timeout: 40000 });
  check(true, '网页版不出现门口，直接开局');
  await page.close();
}

console.log(errors.length ? `页面错误：\n${errors.join('\n')}` : '无页面错误');
await browser.close();
