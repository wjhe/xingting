import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const events=JSON.parse(await readFile('docs/stargarden/事件台账.json','utf8'));
await mkdir('screenshots/stargarden',{recursive:true});
const endings=['star','sage','knight','artist','dancer','scholar','explorer','healer','host','gardener','home'];
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await page.addInitScript(() => localStorage.setItem('stargarden_intro_v1', 'seen'));
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400&&r.url().includes('/assets/'))errors.push(`${r.status()} ${r.url()}`);});
const loadedImages=()=>page.waitForFunction(()=>Array.from(document.querySelectorAll('#modal-root img')).every(i=>i.complete&&i.naturalWidth>0));
try{
  await page.goto('http://localhost:5174/',{waitUntil:'networkidle'});
  for(const event of events){
    await page.evaluate(event=>{
      const app=window.__stargarden;const s=app.game.state;
      s.month=event.dueMonth??(event.minAge-10)*12;s.ended=false;s.ending=null;s.gold=5000;
      s.outfit=event.conditions.outfit??'garden';s.pendingEvent=event.id;app.navigate('schedule');
    },event);
    await page.locator('[data-action="event"]').first().click();await loadedImages();
    assert.equal(await page.locator('[data-action="choose"]').count(),event.choices.length,event.id);
    assert.ok((await page.locator('.event-copy').innerText()).includes(event.title),event.id);
    await page.locator('.sheet-header [data-action="close"]').click();
  }
  for(const region of ['forest','ruins','mountain']){
    await page.evaluate(region=>{
      const app=window.__stargarden,g=app.game;Object.assign(g.state,{month:72,ended:false,ending:null,pendingEvent:null,gold:5000});
      Object.keys(g.state.stats).forEach(k=>g.state.stats[k]=500);
      [region,'home','home'].forEach((id,i)=>g.setPlan(i,id));app.navigate('schedule');
    },region);
    await page.locator('[data-action="advance"]').click();await page.locator('[data-action="skip-results"]').click();await page.locator('[data-action="battle"]').first().click();
    await loadedImages();await page.locator('[data-action="skip-battle"]').click();
    const expected={forest:'微光森林',ruins:'古塔遗迹',mountain:'星落山脉'}[region];
    assert.equal(await page.locator('.battle-region').innerText(),expected);
    await page.screenshot({path:`screenshots/stargarden/30-battle-${region}.png`,animations:'disabled'});
    await page.locator('.sheet-header [data-action="close"]').click();
  }
  await page.evaluate(()=>{const app=window.__stargarden;Object.assign(app.game.state,{month:96,ended:true,ending:'home',pendingEvent:null,outfit:'garden'});app.navigate('home');});
  for(const ending of endings){
    await page.evaluate(id=>window.__stargarden.game.state.ending=id,ending);
    await page.locator('[data-action="ending"]').click();await loadedImages();
    assert.ok((await page.locator('.ending-art').getAttribute('src')).endsWith(`ending-${ending}.webp`));
    await page.locator('.sheet-header [data-action="close"]').click();
  }
  assert.deepEqual(errors,[]);
  console.log(`Content smoke passed: ${events.length} illustrated events, 3 region battles, ${endings.length} ending illustrations.`);
}finally{await browser.close();}
