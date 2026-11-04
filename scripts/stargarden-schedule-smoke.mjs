import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await page.addInitScript(() => localStorage.setItem('stargarden_intro_v1', 'seen'));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url()); });
const tap = action => page.locator(`[data-action="${action}"]`).first().click();
const step = () => page.locator('.schedule-replay').getAttribute('data-step');
const snapshot = () => page.evaluate(() => JSON.stringify(window.__stargarden.game.state));
async function prepare(month = 0) {
  await page.evaluate(month => {
    const app = window.__stargarden;
    Object.assign(app.game.state, { month, pendingEvent: null, ended: false, ending: null, gold: 5000 });
    ['farm', 'literature', 'home'].forEach((id, i) => app.game.setPlan(i, id));
    app.navigate('schedule');
  }, month);
  await tap('advance');
}
try {
  await mkdir('screenshots/stargarden', { recursive: true });
  await page.goto(process.argv[2] ?? 'http://localhost:5174/', { waitUntil: 'networkidle' });
  await prepare();
  const settled = await snapshot();
  assert.equal(await step(), '0');
  assert.equal(await page.locator('.result-list').count(), 0);
  await page.waitForFunction(() => document.querySelector('.schedule-replay')?.dataset.phase === 'complete');
  await page.waitForTimeout(550);
  assert.ok((await page.locator('.replay-rewards').innerText()).includes('金币'));
  await page.screenshot({ path: 'screenshots/stargarden/40-schedule-first.png' });
  await page.waitForFunction(() => document.querySelector('.schedule-replay')?.dataset.step === '1');
  assert.equal(await page.locator('.replay-caption h3').innerText(), '文学课');
  await tap('result-speed');
  assert.equal(await page.locator('[data-action="result-speed"]').innerText(), '2× 速度');
  await tap('result-speed');
  assert.equal(await page.locator('[data-action="result-speed"]').innerText(), '4× 速度');
  await page.locator('.result-list').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.result-row').count(), 4);
  assert.equal(await snapshot(), settled, 'Animation must never modify settled game state');
  await tap('after-results');
  await prepare(8);
  const festivalState = await snapshot();
  assert.equal(await page.locator('.replay-track>span').count(), 5);
  await tap('skip-results');
  assert.equal(await page.locator('.result-row').count(), 5);
  await page.waitForTimeout(1600);
  assert.equal(await snapshot(), festivalState);
  assert.equal(await page.locator('.schedule-replay').count(), 0, 'Skip must cancel playback');
  await tap('close');
  await prepare(11);
  assert.equal(await page.locator('.replay-track>span').count(), 5, 'Birthday is a separate step');
  await tap('close');
  await page.waitForTimeout(1600);
  assert.equal(await page.getByRole('dialog').count(), 0, 'Close must cancel playback');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 740 });
    await prepare();
    await tap('result-next');
    assert.equal(await page.locator('.schedule-replay').getAttribute('data-phase'), 'complete');
    await tap('result-next');
    assert.equal(await step(), '1');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.replay-scene img')).every(i => i.complete && i.naturalWidth > 0));
    assert.equal(await page.evaluate(() => document.querySelector('.sheet').scrollWidth > document.querySelector('.sheet').clientWidth), false);
    await page.screenshot({ path: `screenshots/stargarden/41-schedule-${width}.png` });
    await tap('close');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare();
  assert.equal(await page.locator('.replay-background').evaluate(el => getComputedStyle(el).animationName), 'none');
  await tap('skip-results');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // 探索遇到交锋时，演出里直接播放战斗，而不是只在总结页回顾。
  await tap('close');
  await page.evaluate(() => { const a = window.__stargarden; Object.assign(a.game.state, { pendingEvent: null, ended: false, plan: ['forest', 'forest', 'forest'] }); a.game.state.stats.combat = 80; a.navigate('schedule'); });
  const goldBefore = await page.evaluate(() => window.__stargarden.game.state.gold);
  await tap('advance');
  await page.locator('.replay-battle[data-fighting="true"]').waitFor();
  await page.waitForFunction(() => parseFloat(document.querySelector('.rb-enemy')?.style.width || '100') < 100);
  await page.locator('[data-action="result-next"]').click();
  assert.equal(await page.locator('.replay-battle').getAttribute('data-fighting'), 'false');
  assert.match(await page.locator('.rb-verdict').innerText(), /交锋胜利|平安撤退/);
  await page.screenshot({ path: 'screenshots/stargarden/43-schedule-battle.png' });
  await tap('skip-results');
  assert.ok(await page.locator('[data-action="battle"]').count() >= 1);
  assert.ok(await page.evaluate(g => window.__stargarden.game.state.gold !== g, goldBefore));
  // 跨过 14 岁的那次结算：离开结算后先播“时光流逝”过场，再接着显示事件或回到庭院
  await tap('close');
  await page.evaluate(() => { const a = window.__stargarden; Object.assign(a.game.state, { month: 47, pendingEvent: null, ended: false, plan: ['home', 'home', 'home'] }); a.navigate('schedule'); });
  await tap('advance'); await tap('skip-results'); await tap('after-results');
  await page.locator('.timelapse').waitFor();
  assert.match(await page.locator('.tl-text').innerText(), /14 岁/);
  await page.waitForTimeout(700); await page.locator('.timelapse').click();
  await page.waitForFunction(() => !document.querySelector('.timelapse'));
  assert.equal(await page.evaluate(() => window.__stargarden.game.age), 14);
  assert.deepEqual(errors, []);
  console.log('Schedule replay passed: automatic sequence, rewards, speed, skip, close, no duplicate settlement, festival, birthday, three mobile widths, reduced motion, live battle in replay, age-stage timelapse.');
} finally { await browser.close(); }
