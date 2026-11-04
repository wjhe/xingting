// 背景音乐走查：首次点击后自动开始；各场景切换到对应曲目；无缝循环；短乐句压低背景音乐；关闭后静音。
// 用法：先 npm run dev -- --port 5174，再 node scripts/stargarden-music-smoke.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

// 按普通浏览器的自动播放规则测试（无头模式默认更宽松，会掩盖问题），并用触摸点击：触摸的 pointerdown 不算用户允许播放
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// 模拟旧版本存下的“音乐关”（旧版合成旋律默认关闭）：正式音乐应照常播放
await page.addInitScript(() => { localStorage.setItem('stargarden_intro_v1', 'seen'); if (!sessionStorage.getItem('seeded')) { localStorage.setItem('stargarden_music_v1', '{"enabled":false,"volume":0.5}'); sessionStorage.setItem('seeded', '1'); } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.url().includes('/audio/music/') && r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const audible = async () => { await page.waitForTimeout(1500); return page.evaluate(() => window.__stargarden.music.audible); };
const playing = () => page.evaluate(() => [...window.__stargarden.music.voices].some(v => !v.el.paused && v.el.currentTime > .2));
try {
  await page.goto(process.argv[2] ?? 'http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.__stargarden.game.state.month = 3; window.__stargarden.navigate('home'); }); // 春季
  await page.touchscreen.tap(200, 300);
  assert.deepEqual(await audible(), ['bgm_home']);
  assert.ok(await playing(), '背景音乐在播放');
  await page.locator('#nav [data-page="town"]').click();
  assert.deepEqual(await audible(), ['bgm_town']);
  await page.locator('#nav [data-page="home"]').click();
  await page.locator('.hero-actions [data-action="talk"]').click();
  assert.deepEqual(await audible(), ['bgm_night']);
  await page.locator('.sheet-header [data-action="close"]').click();
  assert.deepEqual(await audible(), ['bgm_home']);
  // 冬季换冬日版，最后一年换成长曲
  await page.evaluate(() => { window.__stargarden.game.state.month = 0; window.__stargarden.navigate('home'); });
  assert.deepEqual(await audible(), ['bgm_home_winter']);
  await page.evaluate(() => { window.__stargarden.game.state.month = 90; window.__stargarden.navigate('home'); });
  assert.deepEqual(await audible(), ['bgm_growing']);
  // 无缝循环：结尾前 2.5 秒从头淡入下一遍
  await page.evaluate(() => { const v = [...window.__stargarden.music.voices][0]; v.el.currentTime = v.el.duration - 3.5; });
  await page.waitForTimeout(2200);
  const overlap = await page.evaluate(() => [...window.__stargarden.music.voices].map(v => v.el.currentTime));
  assert.ok(overlap.length === 2 && overlap.some(t => t < 2), `循环交叠：${overlap}`);
  // 短乐句压低背景音乐，结束后恢复
  await page.evaluate(() => window.__stargarden.music.jingle('jingle_victory'));
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => window.__stargarden.music.duck.gain.value) < .5);
  await page.waitForTimeout(4500);
  assert.ok(await page.evaluate(() => window.__stargarden.music.duck.gain.value) > .9);
  // 设置里关闭音乐
  await page.locator('.unified-header [data-action="settings"]').click();
  await page.locator('#modal-root [data-action="music"]').click();
  assert.deepEqual(await audible(), []);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('stargarden_music_v1'))).enabled, false);
  assert.deepEqual(errors, []);
  console.log('Music passed: real autoplay policy + touch tap, old off-pref ignored, starts on first tap, page/talk/season/final-year tracks, seamless loop, jingle ducking, toggle off persists.');
} finally { await browser.close(); }
