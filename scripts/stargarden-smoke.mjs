import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.addInitScript(() => localStorage.setItem('stargarden_intro_v1', 'seen'));
await page.addInitScript(()=>{
  window.__soundStarts=0;
  const original=AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource=function(...args){
    const node=original.apply(this,args),start=node.start;
    node.start=function(...times){window.__soundStarts++;return start.apply(node,times);};
    return node;
  };
});
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text()); });
await mkdir('screenshots/stargarden', { recursive: true });
const shot = async name => {
  await page.locator('#toast.visible').waitFor({ state: 'hidden', timeout: 5000 });
  return page.screenshot({ path: `screenshots/stargarden/${name}.png`, animations: 'disabled' });
};
const tap = action => page.locator(`[data-action="${action}"]`).first().click();
await page.goto(process.argv[2] ?? 'http://localhost:5174/', { waitUntil: 'networkidle' });
await page.locator('#portrait-stage canvas').waitFor();
const initialState = await page.evaluate(() => JSON.parse(JSON.stringify(window.__stargarden.game.state)));
await shot('01-home');
assert.equal(await page.locator('.hero-profile h1').innerText(), '艾莉 10 岁');
await tap('talk'); await page.getByRole('dialog').waitFor(); await tap('close');
assert.match(await page.locator('.vitals').innerText(), /63/);
await tap('gift'); await tap('confirm-gift');
await page.waitForFunction(()=>window.__soundStarts>0);
assert.equal(await page.locator('.gold-pill b').innerText(), '560');
await page.locator('.plan-cta').click();
await tap('pick'); await tap('select-activity');
assert.match(await page.locator('.plan-slot').first().innerText(), /文学课/);
await tap('recommend'); await shot('02-schedule'); await tap('advance');
await page.getByRole('dialog').waitFor(); await tap('skip-results'); await shot('03-month-results'); await tap('after-results');
await shot('04-event'); await tap('choose'); await tap('close');
const firstMonth = await page.evaluate(() => JSON.parse(localStorage.getItem('stargarden_save_v1')));
assert.equal(firstMonth.month, 1); assert.equal(firstMonth.pendingEvent, null);
await page.reload({ waitUntil: 'networkidle' });
assert.equal(await page.evaluate(() => window.__stargarden.game.state.month), 1);
await page.locator('#nav [data-page="town"]').click(); await shot('05-town');
await tap('shop'); await tap('buy'); assert.match(await page.getByRole('dialog').innerText(), /已拥有/); await tap('close');
await page.locator('#nav [data-page="wardrobe"]').click();
await page.locator('[data-action="wear"][data-id="rose"]').click();
assert.match(await page.locator('.outfit-card.equipped').innerText(), /蔷薇午后/);
await shot('06-wardrobe');
await page.locator('#nav [data-page="diary"]').click(); await shot('07-diary');
await page.locator('[data-tab="endings"]').click(); assert.equal(await page.locator('.ending-card').count(), 11);
await page.locator('.ending-card').first().click(); await tap('close');
await tap('settings'); assert.equal(await page.locator('[data-action="rename"]').count(), 0, '女儿名字固定，不能改名');
const parentBefore = await page.evaluate(() => window.__stargarden.game.state.parent); await tap('toggle-parent'); const parentAfter = await page.evaluate(() => window.__stargarden.game.state.parent);
assert.ok(['爸爸', '妈妈'].includes(parentAfter) && parentAfter !== parentBefore); assert.equal(await page.locator('[data-switch="parent"] b').innerText(), parentAfter); await tap('close');
await tap('settings');
// 设置：音乐与音效分开调节；拨动滑杆和开关只改文字，不重建弹窗（不闪烁）。
assert.equal(await page.locator('[data-action="export"], [data-action="import"], #import-file').count(), 0);
await page.evaluate(() => { window.__sheetBefore = document.querySelector('#modal-root .sheet'); });
await page.locator('[data-volume="sound"]').fill('80');
await page.locator('[data-volume="music"]').fill('30');
await tap('sound-toggle'); await tap('sound-toggle');
await tap('music'); await tap('music');
assert.ok(await page.evaluate(() => document.querySelector('#modal-root .sheet') === window.__sheetBefore), 'settings sheet must not be rebuilt');
assert.equal(await page.locator('[data-volume-row="sound"] b').innerText(), '80%');
assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('stargarden_sound_v1'))).volume, .8);
assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('stargarden_music_v1'))).volume, .3);
await tap('close');
await page.reload({ waitUntil: 'networkidle' });
assert.equal(await page.evaluate(() => window.__stargarden.game.state.name), '艾莉'); assert.equal(await page.evaluate(() => window.__stargarden.game.state.parent), parentAfter);
await page.evaluate(() => window.__stargarden.navigate('schedule'));
await page.locator('[data-action="pick"][data-slot="0"]').click();
await page.locator('[data-action="category"][data-category="adventure"]').click(); await page.locator('[data-action="select-activity"][data-id="forest"]').click();
await page.locator('[data-action="pick"][data-slot="1"]').click();
await page.locator('[data-action="category"][data-category="rest"]').click(); await page.locator('[data-action="select-activity"][data-id="home"]').click();
await page.locator('[data-action="pick"][data-slot="2"]').click(); await page.locator('[data-action="select-activity"][data-id="home"]').click();
await tap('advance'); await tap('skip-results'); await tap('battle'); await tap('skip-battle'); await shot('10-battle');
assert.match(await page.locator('#battle-verdict').innerText(), /交锋胜利|及时撤退/);
await tap('back-results'); await tap('close');
// 通过公开逻辑入口结算余下月份，检查最终界面与收藏联动。
await page.evaluate(() => {
  const g = window.__stargarden.game;
  while (!g.state.ended) {
    if (g.state.pendingEvent) g.choose(1);
    g.talk(); ['farm', 'literature', 'home'].forEach((id, i) => g.setPlan(i, id)); g.advance();
  }
  localStorage.setItem('stargarden_save_v1', JSON.stringify(g.state));
});
await page.reload({ waitUntil: 'networkidle' });
await tap('ending'); await shot('08-ending');
assert.match(await page.getByRole('dialog').innerText(), /花开的那一天/);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('stargarden_meta_v1')).endings.length), 1);
await tap('close');
// Buy a real silhouette in the shop, then equip it without charging again.
await page.evaluate(()=>{const g=window.__stargarden.game;g.state.month=0;g.state.ended=false;g.state.ending=null;g.state.gold=1000;g.state.inventory=[];g.state.outfit='garden';window.__stargarden.navigate('town');});
const summerPrice=await page.evaluate(async()=>(await import('/src/raising/content.ts')).OUTFITS.find(o=>o.id==='summer').price);
await page.evaluate(()=>{window.__stargarden.game.state.gold=3000;});
await tap('shop');await page.locator('[data-action="buy-outfit"][data-id="summer"]').click();
assert.equal(await page.evaluate(()=>window.__stargarden.game.state.gold),3000-summerPrice);
assert.equal(await page.locator('[data-action="buy-outfit"][data-id="summer"]').isDisabled(),true);
await tap('close');await page.locator('#nav [data-page="wardrobe"]').click();
await page.locator('[data-action="wear"][data-id="summer"]').click();
assert.equal(await page.evaluate(()=>window.__stargarden.game.state.gold),3000-summerPrice);
await shot('13-new-summer-wardrobe');
// All three ages and six wardrobe entries must load aligned, nonempty transparent layers.
for (const age of [10, 14, 17]) {
  for (const outfit of ['garden', 'rose', 'sky', 'summer', 'winter', 'festival', 'spring', 'autumn', 'rain', 'sleep']) {
    await page.evaluate(({ age, outfit }) => {
      const g = window.__stargarden.game; g.state.month = (age - 10) * 12; g.state.ended = false; g.state.ending = null; g.state.outfit = outfit;
      window.__stargarden.navigate('wardrobe');
    }, { age, outfit });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.wardrobe-layers img')).every(img => img.complete && img.naturalWidth > 0));
    const layers = await page.evaluate(() => {
      const [body, outfit] = document.querySelectorAll('.wardrobe-character img');
      const canvas = document.createElement('canvas'); canvas.width = body.naturalWidth; canvas.height = body.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(body, 0, 0);
      const bodyCorner = ctx.getImageData(0, 0, 1, 1).data[3];
      const bodyCenter = ctx.getImageData(Math.floor(canvas.width*.5), Math.floor(canvas.height*.45),1,1).data[3];
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(outfit, 0, 0);
      const outfitCorner = ctx.getImageData(0, 0, 1, 1).data[3];
      const faceOpacity = ctx.getImageData(Math.floor(canvas.width * .5), Math.floor(canvas.height * .13), 1, 1).data[3];
      return { bodyCorner, outfitCorner, faceOpacity, bodyCenter, aligned: body.naturalWidth === outfit.naturalWidth && body.naturalHeight === outfit.naturalHeight };
    });
    assert.deepEqual(layers, { bodyCorner: 0, outfitCorner: 0, faceOpacity: 0, bodyCenter:255, aligned: true });
    if (outfit === 'rose') await shot(age === 10 ? '11-cel-child-wardrobe' : '12-cel-teen-wardrobe');
    if (outfit === 'festival') await shot(`14-festival-age-${age}`);
  }
}
// Decode the distributed CC0 samples in the actual target browser.
const audioReport=await page.evaluate(async()=>{
  const ctx=new AudioContext();const report=[];
  for(const id of ['click','page','place','back','buy','dress','event','hit','hurt','victory'])for(const format of ['ogg','wav']){
    const response=await fetch(`/assets/stargarden/audio/${id}.${format}`);
    if(!response.ok)throw new Error(`Audio missing: ${id}`);
    const buffer=await ctx.decodeAudioData(await response.arrayBuffer());
    let peak=0;for(let c=0;c<buffer.numberOfChannels;c++)for(const sample of buffer.getChannelData(c))peak=Math.max(peak,Math.abs(sample));
    report.push({id:`${id}.${format}`,duration:buffer.duration,peak});
  }await ctx.close();return report;
});
for(const sound of audioReport){assert.ok(sound.duration>.005&&sound.duration<5,`audio duration ${sound.id}`);assert.ok(sound.peak>0&&sound.peak<.85,`audio peak ${sound.id}`);}
const faces=await page.evaluate(async()=>{
  const report=[];
  for(const age of ['child','teen','grown'])for(const mood of ['calm','happy','shy','sad','angry','tired']){
    const response=await fetch(`/assets/stargarden/production-v1/face-${age}-${mood}.webp`);
    if(!response.ok)throw new Error(`Expression missing: ${age}/${mood}`);
    const bitmap=await createImageBitmap(await response.blob());
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
    report.push({age,mood,corner:ctx.getImageData(0,0,1,1).data[3],center:ctx.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[3]});bitmap.close();
  }return report;
});
assert.equal(faces.length,18);for(const face of faces){assert.equal(face.corner,0,`face background ${face.age}/${face.mood}`);assert.ok(face.center>240,`face center ${face.age}/${face.mood}`);}
await page.evaluate(initial => { Object.assign(window.__stargarden.game.state, initial); window.__stargarden.navigate('home'); }, initialState);
for (const width of [320, 375, 430]) {
  await page.setViewportSize({ width, height: 844 });
  for (const id of ['home', 'schedule', 'town', 'diary', 'wardrobe']) {
    if (id === 'schedule') await page.evaluate(() => window.__stargarden.navigate('schedule')); else await page.locator(`#nav [data-page="${id}"]`).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow: ${id} @${width}`);
  }
}
await page.setViewportSize({ width: 1440, height: 1000 }); await page.locator('#nav [data-page="home"]').click(); await shot('09-desktop');
assert.deepEqual(errors, []);
console.log('Stargarden smoke passed: gameplay, autosave, separate music/sound volume, ending, shop purchase/equip, 3 ages × 10 outfits, 18 expressions, 10 CC0 audio decodes, responsive 320/375/390/430/1440.');
await browser.close();
