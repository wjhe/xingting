import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const page = await browser.newPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
await page.addInitScript(() => localStorage.setItem('stargarden_intro_v1', 'seen'));
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto('http://localhost:5174/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.home-rail').count(),0);
  assert.equal(await page.locator('.hero-actions button').count(),2);
  assert.equal(await page.locator('#nav [data-page="schedule"]').count(),0);
  for (let i=0;i<3;i++) {
    await page.locator(`.home-plan-slots [data-slot="${i}"]`).click();
    await page.locator('[data-action="category"][data-category="rest"]').click();
    await page.locator('[data-action="select-activity"][data-id="home"]').click();
    assert.equal(await page.locator('.home-layout').count(),1);
  }
  assert.equal(await page.locator('.plan-cta').getAttribute('data-action'),'advance');
  const before=await page.evaluate(()=>window.__stargarden.game.state.month);
  await page.locator('.plan-cta').click();
  await page.locator('.schedule-replay').waitFor();
  assert.equal(await page.evaluate(()=>window.__stargarden.game.state.month),before+1);
  await page.locator('[data-action="skip-results"]').click();
  await page.locator('.sheet-header [data-action="close"]').click();
  assert.equal(await page.locator('.plan-cta').getAttribute('data-action'),'event');
  await page.locator('.plan-cta').click();
  await page.locator('[data-action="choose"]').first().click();
  await page.locator('.sheet-header [data-action="close"]').click();
  for (const [width,height] of [[320,740],[375,812],[390,844],[430,932]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>window.__stargarden.navigate('home'));
    await page.locator('#portrait-stage canvas').waitFor();
    const boxes=await page.evaluate(()=>{
      const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,right:r.right,top:r.top,bottom:r.bottom};};
      return {shell:rect('.game-shell'),console:rect('.home-console'),hero:rect('.home-hero'),viewport:rect('#main'),nav:rect('#nav'),actions:rect('.hero-actions'),hits:[...document.querySelectorAll('.hero-actions button, .plan-cta, .home-plan-slots button')].map(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),main:document.querySelector('#main').clientWidth,scroll:document.querySelector('#main').scrollWidth};
    });
    assert.ok(boxes.console.x>=boxes.shell.x && boxes.console.right<=boxes.shell.right,`console @${width}`);
    assert.ok(boxes.actions.bottom<=boxes.hero.bottom,`interaction buttons inside scene @${width}`);
    assert.ok(boxes.hits.every(Boolean),`home buttons clickable @${width}`);
    assert.ok(boxes.hero.bottom-boxes.hero.top>=220,`scene keeps room for her @${width}`);
    assert.ok(boxes.viewport.bottom<=boxes.console.top+2,`console below scene viewport @${width}`);
    assert.ok(boxes.console.bottom<=boxes.nav.top,`home confirmation visible above navigation @${width}`);
    assert.equal(boxes.scroll,boxes.main,`horizontal overflow @${width}`);
    await page.screenshot({path:`screenshots/stargarden/60-home-layout-${width}.png`});
    await page.evaluate(()=>window.__stargarden.navigate('schedule'));
    await page.locator('#page-actions [data-action="continue-plan"]').click();
    await page.locator('.sheet-header [data-action="close"]').click();
    await page.locator('[data-action="recommend"]').click();
    const confirm=page.locator('#page-actions [data-action="advance"]');
    await page.waitForFunction(()=>{
      const toast=document.querySelector('#toast'),button=document.querySelector('#page-actions [data-action="advance"]');
      return !toast.classList.contains('visible')||toast.getBoundingClientRect().bottom<=button.getBoundingClientRect().top;
    });
    for(const bottom of [false,true]) {
      await page.evaluate(bottom=>{const m=document.querySelector('#main');m.scrollTop=bottom?m.scrollHeight:0;},bottom);
      const visible=await confirm.evaluate(el=>{
        const r=el.getBoundingClientRect(),nav=document.querySelector('#nav').getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return r.top>=0&&r.bottom<=nav.top&&el.contains(hit);
      });
      assert.ok(visible,`schedule confirmation visible and clickable @${width}, bottom=${bottom}`);
    }
    await page.evaluate(()=>document.querySelector('#main').scrollTop=0);
    await page.screenshot({path:`screenshots/stargarden/62-schedule-confirm-${width}.png`});
    await confirm.click();
    await page.locator('.schedule-replay').waitFor();
    await page.locator('.sheet-header [data-action="close"]').click();
    await page.evaluate(()=>{const a=window.__stargarden;Object.assign(a.game.state,{pendingEvent:null,plan:[null,null,null]});a.navigate('home');});
  }
  assert.deepEqual(errors,[]);
  console.log('Home layout passed: inline plans, start month, story, talk/gift by her feet, fixed home and schedule confirmation, click at either scroll position, four mobile sizes.');
} finally { await browser.close(); }
