// 实机录屏：按片段录制，每片单独 screenrecord，录完拉回 screenshots/_video/
// 用法：node scripts/_record.mjs <片段名> [片段名...]
import { spawn, execFileSync } from 'node:child_process';
import { connect, locate, tap, texts, PROJECT } from './rec-drive.mjs';

const ADB = 'D:/unity/6000.0.23f1/Editor/Data/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb';
const OUT = 'screenshots/_video';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd) => execFileSync(ADB, ['shell', cmd], { stdio: 'ignore' });

/** 所有可见文字及其 CSS 坐标，按 y 排序 */
const items = (page) =>
  page.evaluate((src) => {
    const project = eval(src);
    const g = window.__game;
    const out = [];
    const walk = (list) => {
      for (const o of list) {
        if (o.list) { walk(o.list); continue; }
        if (o.type !== 'Text' || typeof o.text !== 'string' || !o.text.trim() || o.visible === false) continue;
        const p = project(o);
        if (!p) continue;
        out.push({ text: o.text, cx: p.cx, cy: p.cy });
      }
    };
    for (const s of g.scene.getScenes(true)) walk(s.children.list);
    return out.sort((a, b) => a.cy - b.cy);
  }, PROJECT);

async function clickAt(page, cx, cy, wait = 400) {
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(wait);
}

/** 竖向拖动滚动（ScrollView 认 pointermove 的位移） */
async function swipe(page, from = 0.55, to = 0.25, ms = 700) {
  const r = await page.evaluate(() => {
    const b = window.__game.canvas.getBoundingClientRect();
    return { x: b.left + b.width / 2, top: b.top, h: b.height };
  });
  const y1 = r.top + r.h * from;
  const y2 = r.top + r.h * to;
  await page.mouse.move(r.x, y1);
  await page.mouse.down();
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(r.x, y1 + ((y2 - y1) * i) / steps);
    await page.waitForTimeout(ms / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
}

async function shot(name) {
  execFileSync('bash', ['-c', `"${ADB}" exec-out screencap -p > "${OUT}/_check_${name}.png"`], { stdio: 'ignore' });
}

/** 录一段：先起 screenrecord，执行 fn，等它到时限，再拉回本地 */
async function clip(page, name, seconds, fn) {
  const rec = spawn(ADB, ['shell', `screenrecord --bit-rate 12000000 --time-limit ${seconds} /sdcard/${name}.mp4`]);
  const done = new Promise((r) => rec.on('exit', r));
  await sleep(1200);
  await fn();
  await done;
  execFileSync(ADB, ['pull', `/sdcard/${name}.mp4`, `${OUT}/${name}.mp4`], { stdio: 'ignore' });
  sh(`rm -f /sdcard/${name}.mp4`);
  console.log(`✓ ${name}.mp4`);
}

const which = process.argv.slice(2);
const { page } = await connect();

for (const name of which) {
  if (name === '01_open') {
    await clip(page, name, 12, async () => {
      await sleep(800);
      await tap(page, '随机', 1400);
      // 天赋是 5 行固定布局：取"天赋（选 3 个）"下方的前 3 行
      const all = await items(page);
      const head = all.find((t) => t.text.includes('天赋（选 3 个）'));
      const rows = [];
      for (const t of all) {
        if (t.cy <= head.cy + 10) continue;
        if (t.text.includes('踏入仙途') || t.text === '改名' || t.text === '随机') continue;
        if (rows.some((r) => Math.abs(r.cy - t.cy) < 20)) continue;
        rows.push(t);
      }
      for (const r of rows.slice(0, 3)) await clickAt(page, r.cx, r.cy, 700);
      await sleep(600);
      await tap(page, '踏入仙途', 3000);
      await sleep(2500);
    });
    await shot('01_end');
  }

  if (name === '02_cultivate') {
    await clip(page, name, 16, async () => {
      await sleep(800);
      await tap(page, '闭关半年', 3200);
      await sleep(1200);
      await tap(page, '闭关一年', 3500);
      await sleep(5000);
    });
    await shot('02_end');
  }

  if (name === '03_event') {
    await clip(page, name, 12, async () => {
      await sleep(3500);
      await tap(page, '静心感悟', 2600);
      await sleep(4500);
    });
    await shot('03_end');
  }

  if (name === '04_alchemy') {
    const pills = () =>
      page.evaluate(() => window.__game.scene.getScene('Main').sim.state.inventory.juqi_dan ?? 0);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.evaluate(() => {
        const m = window.__game.scene.getScene('Main');
        const inv = m.sim.state.inventory;
        for (const k of ['herb_qingling', 'herb_chixue', 'herb_ninglu']) inv[k] = 20;
        m.refresh();
      });
      await tap(page, '洞府', 900);
      const before = await pills();
      await clip(page, name, 16, async () => {
        await sleep(600);
        await tap(page, '丹房', 2600);
        await sleep(1400);
        const all = await items(page);
        const btn = all.filter((t) => t.text === '开炉').pop();
        await clickAt(page, btn.cx, btn.cy, 2400);
        await shot('04_dan');
        await sleep(3200);
      });
      if ((await pills()) > before) break;
      console.log(`炸炉，重录第 ${attempt + 1} 次`);
    }
    await shot('04_end');
  }

  if (name === '05_market') {
    // 让货架看起来买得起
    await page.evaluate(() => {
      const m = window.__game.scene.getScene('Main');
      m.sim.char.stones = 1200;
      m.refresh();
    });
    await tap(page, '洞府', 900);
    await clip(page, name, 14, async () => {
      await sleep(700);
      await tap(page, '坊市', 2000);
      await sleep(2200);
      const all = await items(page);
      const buy = all.filter((t) => t.text === '购买');
      const target = buy[1] ?? buy[0];
      await clickAt(page, target.cx, target.cy, 1200);
      await shot('05_buy');
      await sleep(5400);
    });
    await shot('05_end');
  }

  if (name === '06_panel') {
    await tap(page, '洞府', 900);
    await clip(page, name, 14, async () => {
      await sleep(700);
      await tap(page, '角色', 2600);
      await swipe(page, 0.55, 0.2);
      await sleep(1800);
      await swipe(page, 0.55, 0.28);
      await sleep(2600);
    });
    await shot('06_end');
  }

  if (name === '07_rebirth') {
    await tap(page, '洞府', 900);
    await clip(page, name, 20, async () => {
      await sleep(700);
      await tap(page, '角色', 2200);
      for (let i = 0; i < 3; i++) await swipe(page, 0.6, 0.2);
      await sleep(1500);
      await tap(page, '重开一世', 2000);
      await tap(page, '再点一次', 2800);
      await sleep(2500);
      await shot('07_mid');
      await sleep(6500);
    });
    await shot('07_end');
  }

  if (name === '08_battle') {
    // 把战斗事件摆出来（随机历练不一定碰到）；重启场景让它整页重排，否则会残留上一个事件的插图
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.evaluate(() => {
        const m = window.__game.scene.getScene('Main');
        m.sim.char.hp = m.sim.combatStats.maxHp;
        m.sim.state.log = m.sim.state.log.slice(-2);
        m.sim.state.pendingEventId = 'village_boar';
        m.scene.restart({ game: m.sim, tab: 'home' });
      });
      await sleep(2500);
      const before = await page.evaluate(() => window.__game.scene.getScene('Main').sim.state.inventory.boar_meat ?? 0);
      await clip(page, name, 18, async () => {
        await sleep(2000);
        await shot('08_a');
        await tap(page, '抄起扁担上前', 1200);
        await shot('08_b');
        await sleep(2200);
        await shot('08_c');
        await sleep(6500);
      });
      await shot('08_end');
      const after = await page.evaluate(() => window.__game.scene.getScene('Main').sim.state.inventory.boar_meat ?? 0);
      if (after > before) break;
      console.log(`第 ${attempt} 次没打赢，重录`);
    }
  }
}

process.exit(0);
