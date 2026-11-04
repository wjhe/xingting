import type Phaser from 'phaser';
import type { AdSlot } from '../../core/ads';
import { realAdsActive, setPersonalizedAds } from '../../platform/appAds';
import type { AdButton } from '../ads';
import { fmtNum, type Game } from '../../core/game';
import { getRealm, getRoot } from '../../core/realms';
import { getRegion } from '../../core/regions';
import { ATTR_DESCS, ATTR_NAMES, type AttrKey, type ItemType } from '../../core/types';
import { ATTR_CAP } from '../../core/game';
import { FONT_SCALES, ON_OFF, settings, TEXT_SPEEDS, THEMES, type Settings } from '../settings';
import { COLORS, DESIGN_W, FONT, TEXT_COLORS } from '../theme';
import { ASSET_KEYS, hasImage } from '../assets';
import { pillTex, TEX } from '../ink';
import { Button, makeText, type ScrollView } from '../ui';

const PAD = 30;
const BTN_W = 170;
const BTN_H = 80;
const MARKET_ID = 'qingyun_market';

/** 列表页可以触发的操作，由 MainScene 提供（执行、存档、刷新） */
export interface TabActions {
  act(fn: () => void): void;
  /** 只重画当前页（切换分类、调数量这类不改游戏状态的操作） */
  refresh(): void;
  restart(): void;
  restartArmed: boolean;
  setSetting(patch: Partial<Settings>): void;
  ui: TabUi;
  /** 激励视频按钮的文案和是否可用 */
  adButton(slot: AdSlot, what: string): AdButton;
  /** 播放激励视频，看完才执行 apply（会存档、刷新） */
  watchAd(slot: AdSlot, apply: () => void): void;
  /** 用 TapTap 登录时才有：退出登录，回到登录页 */
  logoutTapTap?: () => void;
}

/** 列表页自己的界面状态，不进存档 */
export interface TabUi {
  bagCat: CatKey;
  shopCat: CatKey;
  /** 正在选择出售数量的物品 */
  selling: { id: string; n: number } | null;
  /** 重画后要滚动到可见的内容区间（如刚展开的出售面板） */
  reveal?: [number, number] | null;
}

export type CatKey = 'all' | 'pill' | 'mat' | 'gear' | 'talisman' | 'book';
/** 行囊、坊市顶部的分类页签 */
const CATS: { key: CatKey; label: string; types: ItemType[] | null }[] = [
  { key: 'all', label: '全部', types: null },
  { key: 'pill', label: '丹药', types: ['pill'] },
  { key: 'mat', label: '材料', types: ['herb', 'material', 'treasure'] },
  { key: 'gear', label: '兵甲', types: ['weapon', 'armor'] },
  { key: 'talisman', label: '符箓', types: ['talisman'] },
  { key: 'book', label: '典籍', types: ['book', 'recipe'] },
];

function inCat(cat: CatKey, type: ItemType): boolean {
  const types = CATS.find((c) => c.key === cat)!.types;
  return !types || types.includes(type);
}

/** 一排分类页签；没有东西的分类置灰 */
function catTabs(w: Writer, current: CatKey, types: ItemType[], pick: (k: CatKey) => void): void {
  const gap = 10;
  const bw = (DESIGN_W - PAD * 2 - gap * (CATS.length - 1)) / CATS.length;
  CATS.forEach((c, i) => {
    const on = c.key === current;
    const any = c.key === 'all' || types.some((t) => inCat(c.key, t));
    w.button(PAD + i * (bw + gap), w.y, bw, c.label, () => !on && pick(c.key), any || on, on);
  });
  w.y += BTN_H + 16;
}

/** 在滚动区域内排版的小工具：维护当前 y，所有对象自动登记到 view 以便清理 */
class Writer {
  y = 24;
  constructor(
    readonly scene: Phaser.Scene,
    readonly view: ScrollView,
  ) {}

  get x0(): number {
    return this.view.originX;
  }

  text(text: string, opts: Parameters<typeof makeText>[4] = {}, x = PAD): Phaser.GameObjects.Text {
    return this.view.add(makeText(this.scene, this.x0 + x, this.y, text, opts));
  }

  /** 写一行并下移 */
  line(text: string, opts: Parameters<typeof makeText>[4] = {}, gap = 10): void {
    const t = this.text(text, { wrap: DESIGN_W - PAD * 2, ...opts });
    this.y += t.height + gap;
  }

  /** 左标签、右数值 */
  pair(label: string, value: string, color: string = TEXT_COLORS.normal): void {
    // 左列标签宽度固定，不随字号放大
    this.text(label, { size: FONT.small, color: TEXT_COLORS.dim, scale: 1 });
    const t = this.text(value, { color, wrap: DESIGN_W - PAD - 200 }, 180);
    this.y += Math.max(t.height, 34) + 12;
  }

  section(title: string): void {
    this.y += 16;
    this.text(title, { size: FONT.small, color: TEXT_COLORS.title });
    this.y += 40;
    this.divider();
  }

  divider(): void {
    this.view.add(
      this.scene.add.image(this.x0 + PAD, this.y, TEX.white).setOrigin(0, 0).setDisplaySize(DESIGN_W - PAD * 2, 2).setTint(COLORS.line),
    );
    this.y += 14;
  }

  button(x: number, y: number, w: number, label: string, fn: () => void, enabled = true, primary = false): Button {
    const b = this.view.add(new Button(this.scene, this.x0 + x, y, w, BTN_H, label, fn, { size: FONT.small, primary }));
    return b.setEnabled(enabled);
  }

  finish(): void {
    this.view.contentHeight = this.y;
    this.view.scrollBy(0);
  }
}

const ICON = 72;
/** 没有图标素材时，用墨圈加一个类型字代替 */
const TYPE_GLYPH: Record<ItemType, string> = { pill: '丹', book: '书', weapon: '剑', armor: '甲', talisman: '符', material: '材', treasure: '宝', herb: '草', recipe: '方' };

function itemIcon(w: Writer, id: string, type: ItemType, y: number): void {
  const x = w.x0 + PAD;
  const key = ASSET_KEYS.icon(id);
  if (hasImage(w.scene, key)) {
    w.view.add(w.scene.add.image(x, y, key).setOrigin(0, 0).setDisplaySize(ICON, ICON).setTint(COLORS.artTint));
    return;
  }
  w.view.add(w.scene.add.image(x, y, TEX.circle).setOrigin(0, 0).setDisplaySize(ICON, ICON).setTint(COLORS.btn));
  w.view.add(w.scene.add.image(x, y, TEX.ring).setOrigin(0, 0).setDisplaySize(ICON, ICON).setTint(COLORS.btnBorder).setAlpha(0.8));
  w.view.add(makeText(w.scene, x + ICON / 2, y + ICON / 2, TYPE_GLYPH[type], { size: 30, color: TEXT_COLORS.gold, scale: 1 }).setOrigin(0.5));
}

/**
 * 一行物品：左侧图标，中间名称和说明，右侧最多两个按钮。
 */
function itemRow(
  w: Writer,
  title: string,
  desc: string,
  buttons: { label: string; fn: () => void; enabled: boolean }[],
  icon?: { id: string; type: ItemType },
  /** 画在本行下方、分隔线之前的内容（如出售数量） */
  extra?: () => void,
  /** 红字提示（如"需筑基期方可参悟"） */
  warn?: string,
): void {
  const top = w.y;
  const indent = icon ? ICON + 16 : 0;
  const textW = DESIGN_W - PAD * 3 - BTN_W - indent;
  if (icon) itemIcon(w, icon.id, icon.type, top);
  const t1 = w.text(title, { color: TEXT_COLORS.gold, wrap: textW }, PAD + indent);
  w.y += t1.height + 6;
  const t2 = w.text(desc, { size: FONT.small, color: TEXT_COLORS.dim, wrap: textW }, PAD + indent);
  let textBottom = w.y + t2.height;
  if (warn) {
    w.y = textBottom + 4;
    const t3 = w.text(warn, { size: FONT.small, color: TEXT_COLORS.bad, wrap: textW }, PAD + indent);
    textBottom = w.y + t3.height;
  }
  let by = top;
  for (const b of buttons) {
    w.button(DESIGN_W - PAD - BTN_W, by, BTN_W, b.label, b.fn, b.enabled);
    by += BTN_H + 12;
  }
  w.y = Math.max(textBottom, by - 12, icon ? top + ICON : 0) + 18;
  extra?.();
  w.divider();
}

/** 选择出售数量：减、数量、加、一半、全部，下面一行确认 */
function sellPanel(w: Writer, g: Game, a: TabActions, id: string, have: number): void {
  const sel = a.ui.selling!;
  const set = (n: number) => {
    sel.n = Math.max(1, Math.min(have, n));
    a.refresh();
  };
  const y = w.y;
  w.button(PAD, y, 100, '－1', () => set(sel.n - 1), sel.n > 1);
  w.text(`${sel.n} 件`, { color: TEXT_COLORS.gold, align: 'center' }, PAD + 185).setOrigin(0.5, 0).setY(y + 22);
  w.button(PAD + 270, y, 100, '＋1', () => set(sel.n + 1), sel.n < have);
  w.button(PAD + 380, y, 150, '一半', () => set(Math.ceil(have / 2)), have > 1);
  w.button(PAD + 540, y, 150, '全卖', () => set(have), sel.n < have);
  w.y = y + BTN_H + 12;
  const n = sel.n;
  w.button(PAD, w.y, DESIGN_W - PAD * 2, `卖出 ${n} 件，得 ${fmtNum(g.sellPrice(id) * n)} 灵石`, () => {
    a.ui.selling = null;
    a.act(() => g.sell(id, n));
  }, g.idle, true);
  w.y += BTN_H + 18;
  a.ui.reveal = [y - 120, w.y];
}

const TYPE_ORDER: ItemType[] = ['treasure', 'pill', 'recipe', 'book', 'weapon', 'armor', 'talisman', 'herb', 'material'];
const TYPE_NAMES: Record<ItemType, string> = {
  treasure: '天材地宝（突破所需，不可出售）',
  pill: '丹药', book: '典籍', weapon: '兵器', armor: '护具', talisman: '符箓（随身携带，战斗时自动使用）', material: '材料',
  herb: '灵草（丹房炼丹所用）', recipe: '丹方（研读后可在丹房炼制）',
};

export function buildBag(scene: Phaser.Scene, view: ScrollView, g: Game, a: TabActions): void {
  const w = new Writer(scene, view);
  w.text('行囊', { size: FONT.title, color: TEXT_COLORS.title, bold: true });
  // 有待抉择的事件时：可以服药、换装备做准备，但不能出售
  if (g.pendingEvent) w.text('正在抉择中，可服药、换装备做准备', { size: FONT.small, color: TEXT_COLORS.gold, align: 'right' }, DESIGN_W - PAD).setOrigin(1, 0);
  else if (g.atMarket) w.text('身处坊市，可出售物品', { size: FONT.small, color: TEXT_COLORS.dim, align: 'right' }, DESIGN_W - PAD).setOrigin(1, 0);
  w.y += 60;

  const ids = Object.keys(g.state.inventory).filter((id) => g.item(id));
  const cat = a.ui.bagCat;
  catTabs(w, cat, ids.map((id) => g.item(id)!.type), (k) => {
    a.ui.bagCat = k;
    a.ui.selling = null;
    a.refresh();
  });
  if (a.ui.selling && (!g.atMarket || !g.state.inventory[a.ui.selling.id])) a.ui.selling = null;

  const { weapon, armor } = g.char.equip;
  if ((weapon || armor) && (cat === 'all' || cat === 'gear')) {
    w.section('已装备');
    for (const id of [weapon, armor]) {
      if (id) itemRow(w, g.item(id)!.name, g.item(id)!.desc, [], { id, type: g.item(id)!.type });
    }
  }

  if (!ids.length) {
    w.line('行囊里空空如也。', { color: TEXT_COLORS.dim });
    return w.finish();
  }
  if (!ids.some((id) => inCat(cat, g.item(id)!.type))) {
    w.line('这一类里还没有东西。', { color: TEXT_COLORS.dim });
    return w.finish();
  }

  for (const type of TYPE_ORDER.filter((t) => inCat(cat, t))) {
    const group = ids.filter((id) => g.item(id)!.type === type);
    if (!group.length) continue;
    w.section(TYPE_NAMES[type]);
    for (const id of group) {
      const it = g.item(id)!;
      const n = g.state.inventory[id];
      const buttons = [];
      // 用不了的事先说明原因，不让玩家点了没反应
      const block = g.useBlock(id);
      if (g.canUseItem(id)) {
        buttons.push(block
          ? { label: block.label, fn: () => {}, enabled: false }
          : { label: it.technique ? '参悟' : it.recipe ? '研读' : '服用', fn: () => a.act(() => g.useItem(id)), enabled: g.canPrepare });
      }
      if (g.canEquip(id)) {
        buttons.push(block
          ? { label: block.label, fn: () => {}, enabled: false }
          : { label: '装备', fn: () => a.act(() => g.equip(id)), enabled: g.canPrepare });
      }
      const selling = a.ui.selling?.id === id;
      if (g.atMarket && g.idle && g.canSell(id)) {
        // 只有一件直接卖；多件先选数量
        const fn = n === 1
          ? () => a.act(() => g.sell(id, 1))
          : () => {
            a.ui.selling = selling ? null : { id, n };
            a.refresh();
          };
        buttons.push({ label: selling ? '收起' : n === 1 ? `出售 ${fmtNum(g.sellPrice(id))}` : '出售…', fn, enabled: g.idle });
      }
      itemRow(w, `${it.name} ×${n}`, `${it.desc}${g.atMarket && g.canSell(id) ? `（每件售 ${fmtNum(g.sellPrice(id))}）` : ''}`, buttons, { id, type: it.type },
        selling ? () => sellPanel(w, g, a, id, n) : undefined, block?.reason);
    }
  }
  w.finish();
}

export function buildDan(scene: Phaser.Scene, view: ScrollView, g: Game, a: TabActions): void {
  const w = new Writer(scene, view);
  w.text('丹房', { size: FONT.title, color: TEXT_COLORS.title, bold: true });
  const next = g.danNext;
  w.text(next === null ? g.danLabel : `${g.danLabel} · 再炼 ${next} 点升品`, { size: FONT.small, color: TEXT_COLORS.gold, align: 'right' }, DESIGN_W - PAD).setOrigin(1, 0);
  w.y += 60;
  const art = ASSET_KEYS.art('alchemy_room');
  if (hasImage(scene, art)) {
    const h = Math.round((DESIGN_W - PAD * 2) * 0.4);
    view.add(scene.add.image(w.x0 + PAD, w.y, art).setOrigin(0, 0).setDisplaySize(DESIGN_W - PAD * 2, h).setTint(COLORS.artTint));
    w.y += h + 16;
  }
  w.line('开炉要耗去些时日，药材一次投尽。神识越高、丹师品级越高，越不容易炸炉，也越容易炼出多枚的上品。', { size: FONT.small, color: TEXT_COLORS.dim });
  w.line('灵草在历练途中顺手可采，坊市也有售；丹方可在坊市购得，或于奇遇中得到。', { size: FONT.small, color: TEXT_COLORS.dim });
  // 刚炸炉：可以看视频保住药材（再做别的事就作废）
  if (g.canSaveHerbs) {
    w.y += 10;
    w.line('方才炸了炉，一炉药材化作焦灰。', { color: TEXT_COLORS.bad });
    const b = a.adButton('save_herbs', '保住这一炉药材');
    w.button(PAD, w.y, DESIGN_W - PAD * 2, b.label, () => a.watchAd('save_herbs', () => g.saveHerbs()), b.enabled, true);
    w.y += BTN_H + 10;
  }

  w.section('已掌握的丹方');
  for (const r of g.knownRecipes) {
    const v = g.recipeView(r);
    const mats = v.ingredients.map((i) => `${i.have >= i.need ? '✓' : '✗'} ${i.name}×${i.need}（有 ${i.have}）`).join('　');
    const head = `${v.product.name}${v.levelOk ? `  成丹约 ${pct(v.rate)}` : ''}`;
    const desc = `${mats}\n耗时${monthsLabelShort(r.months)} · 成丹 ${r.yield[0]}～${r.yield[1]} 枚${v.levelOk ? '' : ` · 需${'一二三四五六七八九'[r.level - 1]}品丹师`}`;
    const label = !v.levelOk ? '品级不足' : v.ready ? '开炉' : '药材不足';
    itemRow(w, head, desc, [{ label, fn: () => a.act(() => g.brew(r.id)), enabled: g.idle && v.ready }], { id: r.product, type: 'pill' });
  }
  w.finish();
}

function monthsLabelShort(m: number): string {
  return m % 12 === 0 ? ` ${m / 12} 年` : ` ${m} 个月`;
}

export function buildShop(scene: Phaser.Scene, view: ScrollView, g: Game, a: TabActions): void {
  const w = new Writer(scene, view);
  w.text('坊市', { size: FONT.title, color: TEXT_COLORS.title, bold: true });
  w.y += 60;

  if (!g.atMarket) {
    const market = getRegion(MARKET_ID);
    w.line(`坊市设在${market.name}。${market.desc}`, { color: TEXT_COLORS.dim });
    w.y += 20;
    w.button(PAD, w.y, DESIGN_W - PAD * 2, `前往${market.name}（一个月）`, () => a.act(() => g.travel(MARKET_ID)), g.idle, true);
    w.y += BTN_H;
    return w.finish();
  }

  w.line('本年货架，每年刷新一次。出售物品请到行囊。', { size: FONT.small, color: TEXT_COLORS.dim });
  w.y += 6;
  // 看视频立即换一批货（每个游戏年一次）
  if (g.canAdRefreshShop) {
    const b = a.adButton('shop_refresh', '立即刷新货架（每年一次）');
    w.button(PAD, w.y, DESIGN_W - PAD * 2, b.label, () => a.watchAd('shop_refresh', () => g.adRefreshShop()), b.enabled);
    w.y += BTN_H + 10;
  }
  const all = Object.entries(g.state.shop.stock)
    .filter(([id, n]) => n > 0 && g.item(id))
    .sort((x, y) => g.item(x[0])!.price - g.item(y[0])!.price);
  const cat = a.ui.shopCat;
  catTabs(w, cat, all.map(([id]) => g.item(id)!.type), (k) => {
    a.ui.shopCat = k;
    a.refresh();
  });
  w.divider();
  const stock = all.filter(([id]) => inCat(cat, g.item(id)!.type));
  if (!all.length) {
    w.line('货架已经空了，明年再来吧。', { color: TEXT_COLORS.dim });
    return w.finish();
  }
  if (!stock.length) {
    w.line('今年这一类没有货。', { color: TEXT_COLORS.dim });
    return w.finish();
  }
  for (const [id, n] of stock) {
    const it = g.item(id)!;
    const affordable = g.char.stones >= it.price;
    itemRow(w, `${it.name}  ${fmtNum(it.price)} 灵石`, `${it.desc}（余 ${n} 件）`, [
      { label: affordable ? '购买' : '灵石不足', fn: () => a.act(() => g.buy(id)), enabled: g.idle && affordable },
    ], { id, type: it.type });
  }
  w.finish();
}

export function buildChar(scene: Phaser.Scene, view: ScrollView, g: Game, a: TabActions): void {
  const w = new Writer(scene, view);
  const c = g.char;
  const portrait = ASSET_KEYS.portrait(c.gender);
  if (hasImage(scene, portrait)) {
    // 立绘居左，名字和世数在右
    const P = 180;
    view.add(scene.add.image(w.x0 + PAD, w.y, portrait).setOrigin(0, 0).setDisplaySize(P, P).setTint(COLORS.artTint));
    view.add(
      scene.add.image(w.x0 + PAD + P / 2, w.y + P / 2, TEX.ring).setDisplaySize(P + 3, P + 3).setTint(COLORS.btnBorder).setAlpha(0.9),
    );
    w.text(c.name, { size: 44, color: TEXT_COLORS.title, bold: true }, PAD + P + 30).setY(w.y + 40);
    w.text(`${c.gender === 'male' ? '男' : '女'} · 第 ${g.state.life} 世 · ${g.realmLabel}`, { size: FONT.small, color: TEXT_COLORS.dim }, PAD + P + 30)
      .setY(w.y + 110);
    w.y += P + 20;
  } else {
    w.text(c.name, { size: 40, color: TEXT_COLORS.title, bold: true });
    w.text(`${c.gender === 'male' ? '男' : '女'} · 第 ${g.state.life} 世`, { size: FONT.small, color: TEXT_COLORS.dim }, DESIGN_W - PAD)
      .setOrigin(1, 0);
    w.y += 70;
  }

  // 设置在页面最底下，顶部放个入口，点了直接滚过去
  let settingsY = 0;
  const gearY = 24;
  view.add(new Button(scene, w.x0 + DESIGN_W - PAD - 150, gearY, 150, 64, '设置', () => view.scrollTo(settingsY - 20), {
    size: FONT.small, icon: hasImage(scene, 'ui_gear') ? 'ui_gear' : undefined,
  }));

  w.section('修行');
  const root = getRoot(c.root);
  const tech = g.technique;
  w.pair('境界', g.realmLabel, TEXT_COLORS.gold);
  w.pair('寿元', `${g.ageYears} / ${g.lifespanYears} 岁`);
  w.pair('灵根', `${root.name}（修炼 ×${root.multiplier}）`);
  w.pair('主修功法', tech ? `《${tech.name}》（修炼 ×${tech.multiplier}）` : '无（可在坊市购买或奇遇获得）');
  w.pair('修炼速度', `${fmtNum(g.gainPerMonth)} / 月`);
  const realm = getRealm(c.realm);
  if (g.stuck) {
    w.pair('瓶颈', `卡在${g.realmLabel}，冲击成功率 ${pct(g.bottleneckRate)}`, TEXT_COLORS.bad);
  }
  const pillId = g.bottleneckPill;
  if (pillId) {
    // 小境界瓶颈要靠对应的丹药冲开
    const have = g.hasBottleneckPill;
    w.pair('瓶颈丹', `${have ? '✓' : '✗'} ${g.itemName(pillId)}${have ? `（${g.state.inventory[pillId]} 枚，冲瓶颈时自动服用）` : '（没有它，瓶颈很难冲开；坊市或丹房可得）'}`, have ? TEXT_COLORS.good : TEXT_COLORS.dim);
  }
  if (realm.breakRate < 1) {
    // 突破：目标、材料、天劫、心魔
    const pv = g.breakPreview;
    w.section(pv.target === '飞升' ? '飞升' : `突破${pv.target}`);
    if (pv.items.length) {
      w.pair('材料', pv.items.map((it) => `${it.have ? '✓' : '✗'} ${it.name}`).join('　'), pv.items.every((it) => it.have) ? TEXT_COLORS.good : TEXT_COLORS.bad);
    }
    const gd = pv.guide;
    if (gd && pv.items.some((it) => !it.have)) {
      if (gd.parts.length && gd.known) {
        w.pair('原料', gd.parts.map((p) => `${p.have ? '✓' : '✗'} ${p.name} · ${p.where}`).join('\n'), gd.parts.every((p) => p.have) ? TEXT_COLORS.good : TEXT_COLORS.normal);
      }
      w.pair('线索', gd.known ? gd.how : gd.unknown, TEXT_COLORS.dim);
    } else if (gd && !pv.items.length) {
      w.pair('线索', gd.how, TEXT_COLORS.dim);
    }
    if (pv.core) {
      const c = pv.core;
      const lines = [
        `${c.aid.have ? '✓' : '✗'} ${c.aid.name}（+${Math.round(c.aid.bonus * 100)}%）`,
        `${c.ward ? '✓' : '✗'} 护阵旗（挡下闭关时的外扰，否则约 ${Math.round(c.disturb * 100)}% 会遇到）`,
      ];
      if (c.lowHp) lines.push('✗ 气血不足九成（成功率降低）');
      w.pair(c.name, `成功率 ${pct(c.rate)}\n${lines.join('\n')}`, c.rate >= 0.6 ? TEXT_COLORS.good : TEXT_COLORS.bad);
      w.line('悟性、心境越高越稳；破障丹也能加成。准备不足就冲，失败会走火入魔、材料尽毁。', { size: FONT.small, color: TEXT_COLORS.dim });
    }
    if (pv.tribulation) {
      const t = pv.tribulation;
      const tone = t.survive >= 0.8 ? '稳妥' : t.survive >= 0.4 ? '凶险' : '九死一生';
      w.pair('天劫', `${t.name}（${t.bolts} 道）· ${tone}，预估撑过 ${pct(t.survive)}`, t.survive >= 0.8 ? TEXT_COLORS.good : TEXT_COLORS.bad);
      w.line('天雷只能硬扛：气血要满，护具、根骨、金刚符、避雷符都能帮你多撑几道。', { size: FONT.small, color: TEXT_COLORS.dim });
    }
    if (pv.heart !== null) {
      const bonus = g.heartDcBonus ? `（丹药与天赋降低难度 ${g.heartDcBonus}）` : '';
      w.pair('心魔', `最佳选项成功率 ${pct(pv.heart)}${bonus}`);
    }
    const bonus = !realm.heartDemon && c.breakBonus ? `（含丹药 +${Math.round(c.breakBonus * 100)}%）` : '';
    w.pair(realm.heartDemon ? '总体预估' : '突破成功率', `${pct(pv.rate)}${bonus}`, TEXT_COLORS.gold);
  }

  const talents = c.talents.map((id) => g.getTalent(id)).filter((t) => !!t);
  if (talents.length) {
    w.section('天赋');
    for (const t of talents) w.pair(t!.name, t!.desc);
  }

  w.section('根骨属性');
  for (const k of Object.keys(ATTR_NAMES) as AttrKey[]) {
    w.text(ATTR_NAMES[k], { size: FONT.small, color: TEXT_COLORS.dim, scale: 1 });
    w.text(String(c.attrs[k]), {}, 180);
    // 短条：上限 20，一眼看出强项弱项
    const bx = w.x0 + 240;
    const by = w.y + 14;
    const bw = 150;
    const ratio = Math.max(0, Math.min(1, c.attrs[k] / ATTR_CAP));
    const pill10 = pillTex(scene, 10);
    view.add(scene.add.nineslice(bx, by, pill10, undefined, bw, 10, 5, 5, 0, 0).setOrigin(0, 0).setTint(COLORS.barBg));
    view.add(scene.add.nineslice(bx, by, pill10, undefined, Math.max(10, bw * ratio), 10, 5, 5, 0, 0).setOrigin(0, 0).setTint(ratio >= 0.75 ? COLORS.bar : COLORS.btnBorder));
    w.text(`影响${ATTR_DESCS[k]}`, { size: FONT.small, color: TEXT_COLORS.dim }, 410);
    w.y += 46;
  }

  w.section('斗法');
  const s = g.combatStats;
  w.pair('气血', `${Math.min(c.hp, s.maxHp)} / ${s.maxHp}`);
  if (g.injury > 0) w.pair('伤势', `${Math.round(g.injury * 100)}%：气血上限降低，随时间痊愈，闭关静养好得更快`, TEXT_COLORS.bad);
  w.pair('灵力', `${s.maxMp}`);
  w.pair('攻击 / 防御', `${s.atk} / ${s.def}`);
  w.pair('兵器 / 护具', [c.equip.weapon, c.equip.armor].map((id) => (id ? g.itemName(id) : '无')).join(' / '));
  w.pair('速度 / 暴击', `${s.spd} / ${Math.round(s.crit * 100)}%`);
  w.pair('法术', tech?.spell ? `【${tech.spell.name}】耗灵力 ${tech.spell.cost}，威力 ×${tech.spell.power}` : '无');

  settingsY = w.y;
  w.section('设置');
  const row = <T,>(label: string, opts: { label: string; value: T }[], current: T, apply: (v: T) => void) => {
    w.text(label, { size: FONT.small, color: TEXT_COLORS.dim, scale: 1 });
    const bw = 150;
    opts.forEach((o, i) => {
      const on = o.value === current;
      w.button(180 + i * (bw + 12), w.y - 18, bw, on ? `● ${o.label}` : o.label, () => !on && apply(o.value), true, on);
    });
    w.y += BTN_H + 6;
  };
  row('字号', FONT_SCALES, settings.fontScale, (v) => a.setSetting({ fontScale: v }));
  row('文字出现', TEXT_SPEEDS, settings.textSpeed, (v) => a.setSetting({ textSpeed: v }));
  row('主题', THEMES, settings.theme, (v) => a.setSetting({ theme: v }));
  row('音乐', ON_OFF, settings.music, (v) => a.setSetting({ music: v }));
  row('音效', ON_OFF, settings.sfx, (v) => a.setSetting({ sfx: v }));
  row('演出', ON_OFF, settings.battleAnim, (v) => a.setSetting({ battleAnim: v }));
  if (realAdsActive()) {
    row('个性化广告', ON_OFF, settings.personalAds, (v) => {
      setPersonalizedAds(v);
      a.setSetting({ personalAds: v });
    });
    w.line('关闭后广告数量不变，只是内容与你的相关度会降低。', { size: FONT.small, color: TEXT_COLORS.dim });
  }

  w.y += 30;
  w.button(PAD, w.y, DESIGN_W - PAD * 2, a.restartArmed ? '再点一次，确认放弃这一世' : '重开一世', () => a.restart(), true);
  w.y += BTN_H;
  if (a.logoutTapTap) {
    w.y += 16;
    w.button(PAD, w.y, DESIGN_W - PAD * 2, '退出 TapTap 登录', a.logoutTapTap, true);
    w.y += BTN_H;
  }
  w.finish();
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
