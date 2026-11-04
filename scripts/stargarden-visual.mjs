import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await page.addInitScript(() => localStorage.setItem('stargarden_intro_v1', 'seen'));
await mkdir('screenshots/stargarden',{recursive:true});
try {
  await page.goto('http://localhost:5174/',{waitUntil:'networkidle'});
  await page.locator('#portrait-stage canvas').waitFor();
  await page.screenshot({path:'screenshots/stargarden/20-classic-home.png',animations:'disabled'});
  await page.locator('[data-action="shop"]').first().click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.clothing-shop-row img')).every(i=>i.complete&&i.naturalWidth));
  await page.screenshot({path:'screenshots/stargarden/21-clothing-shop.png',animations:'disabled'});
  for(const [age,outfit] of [[10,'summer'],[14,'winter'],[17,'festival']]){
    await page.evaluate(({age,outfit})=>{const app=window.__stargarden;app.game.state.month=(age-10)*12;app.game.state.outfit=outfit;app.navigate('wardrobe');},{age,outfit});
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.wardrobe-layers img')).every(i=>i.complete&&i.naturalWidth));
    await page.screenshot({path:`screenshots/stargarden/22-outfit-${age}-${outfit}.png`,animations:'disabled'});
  }
  await page.evaluate(()=>{const app=window.__stargarden;app.game.state.month=1;app.game.state.outfit='garden';app.game.state.pendingEvent='main_0_0';app.navigate('home');});
  await page.locator('[data-action="event"]').click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.story-art img')).every(i=>i.complete&&i.naturalWidth));
  await page.screenshot({path:'screenshots/stargarden/23-main-story.png',animations:'disabled'});
  console.log('Visual samples saved.');
} finally {await browser.close();}
