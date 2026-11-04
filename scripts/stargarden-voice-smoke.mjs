import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5181/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function instrument(page, clearStorage = false) {
  await page.addInitScript(clear => {
    if (clear) localStorage.clear();
    else localStorage.setItem('stargarden_intro_v1', 'seen');
    window.__voiceEvents = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src.includes('dialogue-daughter-v1')) {
        window.__voiceEvents.push({ src: this.src, volume: this.volume, ended: false, time: performance.now() });
        this.addEventListener('ended', () => {
          const item = window.__voiceEvents.find(entry => entry.src === this.src && !entry.ended);
          if (item) item.ended = true;
        }, { once: true });
      }
      return play.apply(this, args).catch(() => {});
    };
  }, clearStorage);
}

try {
  const openingPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await instrument(openingPage, true);
  await openingPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await openingPage.locator('.opening').waitFor();
  await openingPage.waitForTimeout(300);
  assert.equal(await openingPage.evaluate(() => window.__voiceEvents.length), 0, 'narration must not start voice');

  const girlLine = openingPage.locator('.op-box[data-who="girl"]');
  for (let i = 0; i < 80 && !await girlLine.isVisible(); i++) {
    const box = openingPage.locator('.op-box');
    if (await box.isVisible()) await box.click();
    await openingPage.waitForTimeout(60);
  }
  assert.equal(await girlLine.isVisible(), true, 'first girl dialogue should appear');
  await openingPage.waitForFunction(() => window.__voiceEvents.length > 0);
  await openingPage.waitForTimeout(500);
  const voiceVolume = await openingPage.evaluate(() => window.__voiceEvents[0].volume);
  assert.ok(voiceVolume >= .99, `voice should default to full channel volume, got ${voiceVolume}`);
  const duckDuring = await openingPage.evaluate(() => window.__stargarden.music.duck?.gain.value);
  assert.ok(duckDuring < .6, `music should duck during dialogue, got ${duckDuring}`);
  await openingPage.waitForFunction(() => window.__voiceEvents.some(item => item.ended), null, { timeout: 12000 });
  await openingPage.waitForTimeout(900);
  const duckAfter = await openingPage.evaluate(() => window.__stargarden.music.duck?.gain.value);
  assert.ok(duckAfter > .85, `music should restore after dialogue, got ${duckAfter}`);

  const momChoice = openingPage.locator('[data-op="parent"][data-value="妈妈"]');
  for (let i = 0; i < 220 && !await momChoice.isVisible(); i++) {
    const box = openingPage.locator('.op-box');
    if (await box.isVisible()) await box.click();
    await openingPage.waitForTimeout(45);
  }
  assert.equal(await momChoice.isVisible(), true, 'parent choice should appear');
  await momChoice.click();
  await openingPage.waitForTimeout(700);
  const parentResult = await openingPage.evaluate(async () => {
    const manifest = await (await fetch('/assets/stargarden/audio/dialogue-daughter-v1/manifest.json')).json();
    const mom = manifest.clips.find(clip => clip.id === 'opening.4.10.mom' && clip.age === 'child');
    const dad = manifest.clips.find(clip => clip.id === 'opening.4.10.dad' && clip.age === 'child');
    return {
      last: window.__voiceEvents.at(-1)?.src ?? '',
      mom: mom?.src ?? '',
      dad: dad?.src ?? '',
      text: document.querySelector('.op-text p')?.textContent ?? '',
    };
  });
  assert.match(parentResult.text, /^妈妈/);
  assert.notEqual(parentResult.mom, parentResult.dad, 'mom and dad must use separate files');
  assert.ok(parentResult.last.endsWith(parentResult.mom), 'mom choice should play the mom recording');

  const eventPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await instrument(eventPage, false);
  await eventPage.goto(`${baseUrl}?voice-event=1`, { waitUntil: 'networkidle' });
  await eventPage.evaluate(() => {
    window.__stargarden.game.state.pendingEvent = 'main_0_0';
    window.__stargarden.game.state.parent = '爸爸';
    window.__stargarden.render();
    window.__voiceEvents = [];
  });
  await eventPage.locator('[data-action="event"]').first().click();
  await eventPage.waitForFunction(() => window.__voiceEvents.length > 0);
  const eventResult = await eventPage.evaluate(async () => {
    const manifest = await (await fetch('/assets/stargarden/audio/dialogue-daughter-v1/manifest.json')).json();
    const clip = manifest.clips.find(item => item.id === 'dialogue.main_0_0.text.0' && item.age === 'child');
    return { last: window.__voiceEvents.at(-1)?.src ?? '', expected: clip?.src ?? '' };
  });
  assert.ok(eventResult.last.endsWith(eventResult.expected), 'event should play only the daughter dialogue clip');

  await eventPage.locator('[data-action="close"]').first().click();
  await eventPage.evaluate(() => {
    window.__stargarden.game.state.pendingEvent = 'side_mira_0';
    window.__stargarden.render();
    window.__voiceEvents = [];
  });
  await eventPage.locator('[data-action="event"]').first().click();
  await eventPage.waitForTimeout(700);
  assert.equal(await eventPage.evaluate(() => window.__voiceEvents.length), 0, 'narration-only event must stay silent');

  console.log('Voice smoke passed: narration silent, daughter speech plays, mom variant selected, music ducks and restores.');
} finally {
  await browser.close();
}
