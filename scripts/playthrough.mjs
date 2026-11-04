// 不作弊的完整试玩：像普通玩家一样决策，所有操作都通过点击界面完成，直到这一世结束。
// 每一步都核对界面显示与游戏状态是否一致。
// 用法：先 npm run dev，再 node scripts/playthrough.mjs [随机种子]，截图输出到 screenshots/playthrough/
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';

const seed = Number(process.argv[2] ?? 1);
const OUT = 'screenshots/playthrough';
const MAX_ACTIONS = 1500;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));

// 简单的可复现随机数，只用于做选择
let r = seed * 2654435761 >>> 0;
const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);

const wait = (ms) => page.waitForTimeout(ms);
let shots = 0;
const shot = (name) => page.screenshot({ path: `${OUT}/${String(++shots).padStart(3, '0')}-${name}.png` });

/** 等全屏转场播完（最多 5 秒） */
async function idle() {
  for (let i = 0; i < 400 && (await page.evaluate(() => window.__test.busy())); i++) await page.waitForTimeout(100);
}

/** 等启动加载完、进入某个界面（开局或主界面） */
async function ready() {
  for (let i = 0; i < 150; i++) {
    const ok = await page.evaluate(() => !!window.__test && ['Create', 'Main'].some((k) => window.__test.game.scene.isActive(k)));
    if (ok) return page.waitForTimeout(300);
    await page.waitForTimeout(100);
  }
  throw new Error('启动超时');
}

/** 选项按钮会把结尾的括号和成功率合并（如"（30 灵石 · 约 80%）"），按去掉结尾括号后的前缀找 */
const optPrefix = (t) => t.replace(/）$/, '');

// 突破失败后行动区会先问要不要看视频"逆天改命"，像不看广告的玩家一样选"认了"
const DECLINE_AD = ['认了，继续修行', '收下'];
async function declineAds() {
  for (const label of DECLINE_AD) {
    const pos = await page.evaluate((l) => window.__test.locate(l), label);
    if (pos) {
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(200);
    }
  }
}

async function tap(label, prefix = false, near) {
  await idle();
  if (!DECLINE_AD.includes(label)) await declineAds();
  const find = () => page.evaluate(([l, p, n]) => window.__test.locate(l, p, n), [label, prefix, near]);
  let pos = await find();
  // 列表里的行可能在屏幕外：像玩家一样往上拖动列表，最多拖 10 次
  for (let i = 0; !pos && near && i < 10; i++) {
    await page.mouse.move(195, 600);
    await page.mouse.down();
    await page.mouse.move(195, 300, { steps: 6 });
    await page.mouse.up();
    await wait(80);
    pos = await find();
  }
  if (!pos) await page.screenshot({ path: `${OUT}/failure.png` });
  if (!pos) console.log('诊断', await page.evaluate(() => { const m = window.__test.game.scene.getScene('Main'); return { menu: !!m.menu, busy: window.__test.busy(), pending: !!window.__test.sim().pendingEvent, guide: m.guide.active }; }));
  if (!pos) throw new Error(`找不到按钮：${label}${near ? `（${near} 那一行）` : ''}\n可见文字：${(await page.evaluate(() => window.__test.texts())).join(' | ')}`);
  await page.mouse.click(pos.x, pos.y);
  await wait(60);
}

/** 读取决策需要的状态（只读，不修改） */
const state = () => page.evaluate(() => {
  const g = window.__test.sim();
  const main = window.__test.game.scene.getScene('Main');
  const ev = g.pendingEvent;
  const inv = g.state.inventory;
  const item = (id) => g.item(id);
  // 与 src/core/game.ts 的 fmtNum 一致
  const fmt = (n) => {
    const trim = (x) => (x >= 100 ? Math.round(x).toString() : x.toFixed(x >= 10 ? 1 : 2).replace(/\.?0+$/, ''));
    if (n >= 1e8) return `${trim(n / 1e8)}亿`;
    if (n >= 1e5) return `${trim(n / 1e4)}万`;
    return `${Math.round(n)}`;
  };
  return {
    dead: g.state.dead,
    ending: g.state.ending,
    realm: g.char.realm,
    realmLabel: g.realmLabel,
    age: g.ageYears,
    lifespan: g.lifespanYears,
    stones: g.char.stones,
    hp: g.char.hp,
    maxHp: g.combatStats.maxHp,
    region: g.state.region,
    atMarket: g.atMarket,
    canBreak: g.canBreakthrough,
    canAdvance: g.canAdvanceStage,
    stuck: g.stuck,
    trib: !!(g.breakPreview.tribulation),
    held: Object.keys(g.state.inventory),
    missing: g.missingBreakItem,
    missingName: g.missingBreakItem ? item(g.missingBreakItem).name : null,
    missingPrice: g.missingBreakItem ? item(g.missingBreakItem).price : 0,
    stock: g.state.shop.stock,
    doors: g.doorOptions,
    techMult: g.technique?.multiplier ?? 1,
    inv: Object.keys(inv).map((id) => ({
      id, n: inv[id], name: item(id).name, type: item(id).type,
      use: (item(id).use ?? []).map((e) => e.type),
      techMult: item(id).technique ? g.getTechnique(item(id).technique).multiplier : 0,
      realmOk: !item(id).realm_min || ['fanren', 'lianqi', 'zhuji', 'jindan', 'yuanying', 'huashen', 'dujie'].indexOf(item(id).realm_min) <= ['fanren', 'lianqi', 'zhuji', 'jindan', 'yuanying', 'huashen', 'dujie'].indexOf(g.char.realm),
    })),
    options: ev ? ev.options.map((o) => ({ text: o.text, blocked: !!g.optionBlocked(o), chance: g.checkChance(o) })) : null,
    // 界面上显示的状态栏
    // 有小图标时状态栏只显示数字，没有素材时带文字标签；比较时去掉标签
    ui: { stones: main.statusStones.text.replace('灵石 ', ''), name: main.statusName.text, hp: main.statusHp.text.replace('气血 ', '').replace(' 伤', ''), age: main.statusAge.text },
    expectUi: {
      stones: `${g.char.stones}`,
      name: `${g.char.name}  ${g.realmLabel}`,
      hp: `${fmt(Math.min(g.char.hp, g.combatStats.maxHp))} / ${fmt(g.combatStats.maxHp)}`,
    },
  };
});

const HOME = { fanren: '青石村', lianqi: '落霞山', zhuji: '黑风谷', jindan: '云梦泽', yuanying: '北冥海', huashen: '昆仑墟', dujie: '昆仑墟' };
const REGION_NAME = { qingshi_village: '青石村', luoxia_mountain: '落霞山', qingyun_market: '青云坊市', heifeng_valley: '黑风谷', yunmeng_marsh: '云梦泽', beiming_sea: '北冥海', kunlun_ruins: '昆仑墟' };
/** 突破丹材料齐了要去哪里炼 */
const CRAFT = { huaying_dan: ['青云坊市', ['jiao_nilin', 'lian_xin', 'roc_jingpo']], huashen_dan: ['北冥海', ['kun_feather', 'xuanbing', 'haiyan_pearl']], due_lotus: ['昆仑墟', ['busi_seed', 'kunlun_jade', 'tianlei_stone']] };

async function travel(name) {
  await tap('前往…');
  await tap(name, true);
}

/** 去行囊做一件事再回洞府 */
async function inBag(fn) {
  await tap('行囊');
  await fn();
  await tap('洞府');
}

// ---------- 开局 ----------
await page.goto('http://localhost:5173/');
await ready();
await page.evaluate(() => localStorage.clear());
await page.reload();
await ready();

const labels = await page.evaluate(() => window.__test.game.scene.getScene('Create').offer.map((t) => `${t.name} · ${t.desc}`));
for (const l of labels.slice(0, 3)) await tap(l);
await shot('create');
await tap('踏入仙途');
await wait(300);

const counts = {};
const count = (k) => (counts[k] = (counts[k] ?? 0) + 1);
let mismatches = 0;
let lastRealm = '';
let s;

for (let step = 0; step < MAX_ACTIONS; step++) {
  s = await state();
  // 界面与状态一致性；灵石到账有不超过 1.5 秒的滚动演出，不一致时等一等再判
  if (Object.keys(s.expectUi).some((k) => s.ui[k] !== s.expectUi[k])) {
    await wait(1700);
    s = await state();
  }
  for (const k of Object.keys(s.expectUi)) {
    if (s.ui[k] !== s.expectUi[k]) {
      mismatches++;
      console.log(`第 ${step} 步界面不一致：${k} 显示「${s.ui[k]}」，应为「${s.expectUi[k]}」`, await page.evaluate(() => { const m = window.__test.game.scene.getScene('Main'); return { shown: m.stonesShown, tween: !!m.stonesTween, to: m.stonesTweenTo, frozenAgo: Date.now() - m.stonesFrozenAt, busy: window.__test.busy() }; }));
    }
  }
  if (s.realmLabel.split('·')[0] !== lastRealm) {
    lastRealm = s.realmLabel.split('·')[0];
    console.log(`第 ${step} 步：${s.age} 岁 进入${lastRealm}`);
    await shot(`realm-${lastRealm}`);
  }
  if (s.dead) break;

  if (s.options) {
    const ok = s.options.filter((o) => !o.blocked);
    // 偏好成功率高的检定；其余随机
    const pick = rand() < 0.5 ? ok.reduce((a, b) => ((b.chance ?? 0.6) > (a.chance ?? 0.6) ? b : a)) : ok[Math.floor(rand() * ok.length)];
    await tap(optPrefix(pick.text), true);
    count('事件选择');
    if (counts['事件选择'] % 40 === 1) await shot(`event-${step}`);
    continue;
  }

  // 用掉更好的功法典籍和增益丹药
  const book = s.inv.find((i) => i.techMult > s.techMult && i.realmOk);
  if (book) { await inBag(() => tap('参悟', false, book.name)); count('参悟'); continue; }
  const pill = s.inv.find((i) => i.realmOk && (i.use.includes('cultivation') && !s.canBreak || i.use.includes('lifespan') || (i.use.includes('hp') && s.hp < s.maxHp * 0.5)));
  if (pill) { await inBag(() => tap('服用', false, pill.name)); count('服药'); continue; }

  if (s.atMarket) {
    const mat = s.inv.find((i) => i.type === 'material');
    if (mat) {
      await inBag(async () => {
        await tap('出售', true, mat.name);
        // 多件时先出数量面板，默认全部，再确认
        if (await page.evaluate(() => !!window.__test.locate('卖出', true))) await tap('卖出', true);
      });
      count('出售');
      continue;
    }
    if (s.missing && s.stock[s.missing] && s.stones >= s.missingPrice) {
      await tap('坊市');
      await shot(`shop-buy-${s.missingName}`);
      await tap('购买', false, s.missingName);
      await tap('洞府');
      count('购买突破物品');
      continue;
    }
  }

  let home = HOME[s.realm];
  const craft = s.missing && CRAFT[s.missing];
  if (craft && craft[1].every((id) => s.held.includes(id))) home = craft[0];
  const wantMarket = (s.missing && s.stones >= s.missingPrice) || (s.inv.some((i) => i.type === 'material') && rand() < 0.1);
  const target = s.atMarket ? (rand() < 0.3 || home === '青云坊市' ? '青云坊市' : home) : wantMarket ? '青云坊市' : home;
  if (REGION_NAME[s.region] !== target) { await travel(target); count('赶路'); continue; }

  if (s.hp < s.maxHp * 0.4) { await tap('闭关', true); count('闭关'); continue; }
  if (s.stuck) { await tap('破瓶颈', true); count('破瓶颈'); continue; }
  // 小层修满：亲手冲关（会播放冲关演出）
  if (s.canAdvance) { await tap('冲击', true); count('冲小层'); continue; }
  // 渡天劫前先把气血养满
  if (s.canBreak && !s.missing && s.trib && s.hp < s.maxHp * 0.95) { await tap('闭关', true); count('闭关'); continue; }
  if (s.canBreak && !s.missing) {
    const verb = s.realm === 'dujie' ? '飞升' : s.trib ? '渡劫' : '突破';
    await tap(verb, true);
    count('突破');
    continue;
  }
  if (!s.canBreak && rand() < 0.5) {
    const longest = await page.evaluate(() => { const g = window.__test.sim(); return g.doorOptions[g.doorOptions.length - 1]; });
    const label = await page.evaluate((m) => '闭关' + ({ 1: '一个月', 6: '半年', 12: '一年', 36: '三年', 60: '五年', 120: '十年', 240: '二十年', 360: '三十年', 600: '五十年' }[m]), longest);
    await tap(label);
    count('闭关');
    continue;
  }
  await tap('外出历练');
  count('历练');
}

await wait(1600);
await shot('end');
console.log(`\n结束：${s.realmLabel}，${s.age}/${s.lifespan} 岁，${s.dead ? (s.ending ? `结局 ${s.ending}` : '身死') : '未结束（达到步数上限）'}`);
console.log('操作统计：', JSON.stringify(counts));
console.log(`界面与状态不一致：${mismatches} 次`);

if (s.dead) {
  await tap('转世重修');
  await wait(500);
  await shot('rebirth');
  const lines = await page.evaluate(() => window.__test.texts().filter((t) => t.startsWith('+') || t.startsWith('共')));
  console.log('结算：', lines.join(' '));
}
await browser.close();
console.log(errors.length ? `页面错误：\n${errors.join('\n')}` : '无页面错误');
