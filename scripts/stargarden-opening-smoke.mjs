// 开场剧情走查：名字固定为艾莉，玩家只选爸爸或妈妈；完整播放、跳过直达称呼选择、中途刷新不留存档、重看开场不改进度。
// 用法：先 npm run dev -- --port 5174，再 node scripts/stargarden-opening-smoke.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const URL = process.argv[2] ?? 'http://localhost:5174/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const fresh = async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  return { context, page };
};
/** 一直点对话框，遇到称呼选择就点对应按钮，直到演出结束。 */
async function playThrough(page, parent) {
  for (let i = 0; i < 60 && await page.locator('.opening').count(); i++) {
    const form = page.locator('.op-input:not([hidden])');
    if (await form.count()) {
      assert.equal(await form.locator('input').count(), 0, '不再出现输入框');
      await form.locator(`[data-op="parent"][data-value="${parent}"]`).click();
    } else if (await page.locator('.op-box:not([hidden])').count()) {
      await page.locator('.op-box').click();
    }
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(() => !document.querySelector('.opening'), null, { timeout: 10000 });
  // 新周目开场结束后会提供“启程礼金”（看视频领取）；不领，直接关掉
  if (await page.locator('.sheet [data-slot="new_run_bonus"]').count()) await page.locator('.sheet-header [data-action="close"]').click();
}

try {
  await mkdir('screenshots/stargarden', { recursive: true });

  // 1. 第一次打开：自动播放，选择称呼后进入庭院
  {
    const { context, page } = await fresh();
    await page.locator('.opening .op-box').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('stargarden_save_v1')), null, '开场完成前不写存档');
    // 开场视频：封面为视频第一帧，视频自动静音播放
    await page.waitForFunction(() => { const v = document.querySelector('.op-layer.shown video'); return v && v.currentTime > .3 && !v.paused; }, null, { timeout: 10000 });
    assert.match(await page.evaluate(() => document.querySelector('.op-layer.shown').style.backgroundImage), /video\/vid-op-starfall\.webp/);
    await page.screenshot({ path: 'screenshots/stargarden/70-opening-first.png' });
    await playThrough(page, '妈妈');
    const state = await page.evaluate(() => window.__stargarden.game.state);
    assert.equal(state.name, '艾莉'); assert.equal(state.parent, '妈妈');
    assert.equal(await page.evaluate(() => localStorage.getItem('stargarden_intro_v1')), 'seen');
    assert.match(await page.locator('.hero-profile h1').innerText(), /艾莉/);
    // 之后再打开不再播放
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.opening').count(), 0);
    await context.close();
  }

  // 2. 跳过：直接来到称呼选择，不能跳过选择
  {
    const { context, page } = await fresh();
    await page.locator('.opening .op-box').waitFor();
    await page.locator('[data-op="skip"]').click();
    await page.locator('.op-input[data-kind="parent"]:not([hidden])').waitFor();
    await page.screenshot({ path: 'screenshots/stargarden/71-opening-parent.png' });
    await page.locator('[data-op="skip"]').click();
    assert.equal(await page.locator('.op-input[data-kind="parent"]:not([hidden])').count(), 1, '再点跳过也不能跳过称呼选择');
    await playThrough(page, '爸爸');
    assert.equal(await page.evaluate(() => window.__stargarden.game.state.parent), '爸爸');
    await context.close();
  }

  // 3. 开场中途刷新：仍然没有存档，开场重新播放
  {
    const { context, page } = await fresh();
    await page.locator('.opening .op-box').waitFor();
    await page.locator('.op-box').click(); await page.locator('.op-box').click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.opening .op-box').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('stargarden_save_v1')), null);
    await context.close();
  }

  // 4. 设置里重看开场：不出现称呼选择，不改称呼和进度
  {
    const { context, page } = await fresh();
    await page.locator('[data-op="skip"]').click();
    await playThrough(page, '妈妈');
    const month = await page.evaluate(() => { const a = window.__stargarden; a.game.state.month = 5; return a.game.state.month; });
    await page.locator('.unified-header [data-action="settings"]').click();
    await page.locator('[data-action="replay-opening"]').click();
    await page.locator('.opening .op-box').waitFor();
    for (let i = 0; i < 60 && await page.locator('.opening').count(); i++) {
      assert.equal(await page.locator('.op-input:not([hidden])').count(), 0, '重看时不出现称呼选择');
      if (await page.locator('.op-box:not([hidden])').count()) await page.locator('.op-box').click();
      await page.waitForTimeout(100);
    }
    await page.waitForFunction(() => !document.querySelector('.opening'), null, { timeout: 10000 });
    const state = await page.evaluate(() => window.__stargarden.game.state);
    assert.equal(state.parent, '妈妈'); assert.equal(state.month, month);
    await context.close();
  }

  assert.deepEqual(errors, []);
  console.log('Opening passed: video plays with first-frame poster, fixed name, first launch plays and asks dad/mom, skip lands on the choice (cannot skip it), no save before choosing, reload replays, settings replay keeps progress.');
} finally { await browser.close(); }
