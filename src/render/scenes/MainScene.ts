import Phaser from 'phaser';
import { durationLabel, fmtNum, monthsLabel, type Game, type Signal } from '../../core/game';
import { getRealm, realmIndex } from '../../core/realms';
import { getRegion, REGIONS } from '../../core/regions';
import type { LogEntry, LogKind } from '../../core/types';
import { CONTENT } from '../../data';
import type { AdSlot } from '../../core/ads';
import { adButton, watchRewarded } from '../ads';
import { ASSET_KEYS, hasImage } from '../assets';
import { audio, bgmForRegion } from '../audio';
import { BattleView } from '../battle';
import { StageView } from '../stage';
import { RealmView } from '../realm';
import { flash, Overlay, shakeAll } from '../fx';
import { Guide } from '../guide';
import { pillTex, SLICE, TEX } from '../ink';
import { endLife, loadMeta, saveGame } from '../session';
import { saveSettings, settings, type Settings } from '../settings';
import { COLORS, DESIGN_W, FONT, TEXT_COLORS } from '../theme';
import { addBackdrop, addBrushLine, Button, getPlatform, makeText, ScrollView, setupCamera, type Layout } from '../ui';
import { logoutTapTap, tapTapLoggedIn } from './GateScene';
import { buildBag, buildChar, buildDan, buildShop, type TabActions, type TabUi } from './tabs';

const PAD = 30;
const STATUS_H = 186;
const NAV_H = 110;
const PANEL_PAD = 22;
const BTN_H = 96;
/** 离线回来新增的灵气储备至少这么多（分钟），才提示可以看视频翻倍 */
const OFFLINE_OFFER_MIN = 10;
const CHOICE_H = 88;
const GAP = 16;
/** 状态栏头像直径 */
const AVATAR = 112;
/** 状态栏右列小图标尺寸 */
const STAT_ICON = 36;
/** 可以冲击大境界时修为条的金色、气血条的颜色 */
const GOLD_BAR = 0xc9a85c;
const HP_COLOR = 0x8f3a2a;
/** 状态栏是固定排版，字号不随设置放大，避免两列文字撞在一起 */
const STATUS_SCALE = 1;
/** 正常行动区：两行按钮 */
const ACTION_PANEL_H = PANEL_PAD * 2 + BTN_H * 2 + GAP;
/** "逐行"模式：新日志逐条淡入的间隔与上限（毫秒） */
const REVEAL_STEP = 70;
const REVEAL_MAX = 1400;
/** "逐字"模式：每 30 毫秒显示的字数（战报更快） */
const TYPE_TICK_MS = 30;
const TYPE_CHARS = 2;
const TYPE_CHARS_BATTLE = 5;

export type Tab = 'home' | 'dan' | 'bag' | 'shop' | 'char';
const TABS: { key: Tab; label: string; originX: number; icon: string }[] = [
  { key: 'home', label: '洞府', originX: 10000, icon: 'ui_nav_home' },
  { key: 'dan', label: '丹房', originX: 50000, icon: 'ui_nav_dan' },
  { key: 'bag', label: '行囊', originX: 20000, icon: 'ui_nav_bag' },
  { key: 'shop', label: '坊市', originX: 30000, icon: 'ui_nav_shop' },
  { key: 'char', label: '角色', originX: 40000, icon: 'ui_nav_char' },
];
/** 行动按钮的图标 */
const ACTION_ICONS: Record<string, string> = {
  door0: 'ui_act_door', door1: 'ui_act_door', door2: 'ui_act_door',
  explore: 'ui_act_explore', travel: 'ui_act_travel', break: 'ui_act_break',
};

/** 日志样式。颜色随主题变化，所以每次现取 */
function logStyle(kind: LogKind): { color: string; size: number; gap: number } {
  const T = TEXT_COLORS;
  const styles: Record<LogKind, { color: string; size: number; gap: number }> = {
    time: { color: T.time, size: FONT.small, gap: 30 },
    title: { color: T.title, size: FONT.title, gap: 14 },
    art: { color: T.dim, size: FONT.small, gap: 14 },
    text: { color: T.normal, size: FONT.body, gap: 10 },
    battle: { color: T.battle, size: 27, gap: 6 },
    good: { color: T.good, size: FONT.body, gap: 6 },
    bad: { color: T.bad, size: FONT.body, gap: 6 },
    system: { color: T.dim, size: FONT.small, gap: 8 },
    whisper: { color: T.whisper, size: FONT.body, gap: 24 },
  };
  return styles[kind];
}

interface Snapshot {
  stones: number;
  hp: number;
  life: number;
  inv: Record<string, number>;
}

interface ListOption {
  label: string;
  fn: () => void;
  enabled?: boolean;
  primary?: boolean;
  /** 警示色（如修为不足的去处） */
  warn?: boolean;
  /** 文字颜色（如按成功率上色的事件选项） */
  color?: string;
}

interface Typing {
  obj: Phaser.GameObjects.Text;
  full: string;
  shown: number;
  step: number;
}

export class MainScene extends Phaser.Scene {
  private sim!: Game;
  private layout!: Layout;
  private tab: Tab = 'home';

  private statusName!: Phaser.GameObjects.Text;
  private statusStones!: Phaser.GameObjects.Text;
  private statusAge!: Phaser.GameObjects.Text;
  private statusHp!: Phaser.GameObjects.Text;
  private statusCult!: Phaser.GameObjects.Text;
  private statusGain!: Phaser.GameObjects.Text;
  private barFill!: Phaser.GameObjects.NineSlice;
  private barHalo!: Phaser.GameObjects.Image;
  private barShine!: Phaser.GameObjects.Image;
  private hpFill!: Phaser.GameObjects.NineSlice;
  private iconStones: Phaser.GameObjects.Image | null = null;
  private iconHp: Phaser.GameObjects.Image | null = null;
  private iconGain: Phaser.GameObjects.Image | null = null;
  /** 行动区（或事件选项区）顶边，获得物品的飞行动画从它上方出发 */
  private panelTop = 0;

  private views!: Record<Tab, ScrollView>;
  private logY = 0;
  private lastEntry: LogEntry | null = null;
  private typing: Typing[] = [];

  private panelBg!: Phaser.GameObjects.Image;
  private panelLine!: Phaser.GameObjects.Image;
  private actionBtns: Record<string, Button> = {};
  private listBtns: Button[] = [];
  private navBtns: Partial<Record<Tab, Button>> = {};
  /** 行动区当前显示的菜单（如选择目的地），为空时显示常规行动 */
  private menu: ListOption[] | null = null;
  /** 刚回到游戏时新增的灵气储备（分钟），可看视频翻倍；收下或翻倍后清零 */
  private offlineOffer = 0;
  /** 行动区正被看视频的提议（逆天改命、灵气翻倍）占用 */
  private offerShown = false;
  private restartArmed = false;
  /** 本世已结算，防止连点重复结算 */
  private settled = false;

  /** 日志区背后的区域插图（有素材时） */
  private regionArt!: Phaser.GameObjects.Image;
  private regionArtId = '';
  private regionFade!: Phaser.GameObjects.Image;
  private overlay!: Overlay;
  private guide!: Guide;
  private visitedBag = false;
  /** 最近在闭关或炼丹（背景音乐用洞府曲） */
  private calm = false;
  /** 行囊、坊市的分类和出售数量选择 */
  private tabUi: TabUi = { bagCat: 'all', shopCat: 'all', selling: null };

  constructor() {
    super('Main');
  }

  init(data: { game: Game; tab?: Tab }): void {
    this.sim = data.game;
    this.tab = data.tab ?? 'home';
    this.logY = 0;
    this.lastEntry = null;
    this.typing = [];
    this.actionBtns = {};
    this.listBtns = [];
    this.navBtns = {};
    this.menu = null;
    this.offlineOffer = 0;
    this.restartArmed = false;
    this.settled = false;
    this.visitedBag = false;
    // 换主题、字号会重建场景，修为条的动画状态要跟着清掉，否则新建的条不会再闪
    this.barShown = -1;
    this.barTarget = -1;
    this.barKey = '';
    this.barTween = null;
    this.barGlow = null;
  }

  create(): void {
    this.layout = setupCamera(this);
    const { width: W, height: H, safeTop, safeBottom } = this.layout;
    const statusBottom = safeTop + STATUS_H;
    const navTop = H - safeBottom - NAV_H;
    addBackdrop(this);
    // 区域插图铺在日志区顶部，下沿渐隐到底色
    this.regionArt = this.add.image(0, statusBottom, TEX.white).setOrigin(0, 0).setVisible(false);
    this.regionFade = this.add
      .image(0, statusBottom + 200, TEX.fade)
      .setOrigin(0, 0)
      .setDisplaySize(W, 230)
      .setTint(COLORS.bg);

    // 状态栏
    const top = safeTop;
    this.add.image(0, 0, TEX.white).setOrigin(0, 0).setDisplaySize(W, statusBottom).setTint(COLORS.panel).setAlpha(0.96);
    if (hasImage(this, 'ui_header_mist')) {
      // 状态栏底部一抹远山
      // 夜间主题下远山要淡，否则浅色远山压在深色底上，状态栏的字会看不清
      this.add.image(0, statusBottom, 'ui_header_mist').setOrigin(0, 1).setDisplaySize(W, W / 3).setTint(COLORS.artTint).setAlpha(settings.theme === 'night' ? 0.12 : 0.55);
    }
    addBrushLine(this, 0, statusBottom, W, 0.6);
    // 有立绘时左侧放圆形头像，文字右移
    const portrait = ASSET_KEYS.portrait(this.sim.char.gender);
    let tx = PAD;
    if (hasImage(this, portrait)) {
      this.add.image(PAD, top + 14, portrait).setOrigin(0, 0).setDisplaySize(AVATAR, AVATAR).setTint(COLORS.artTint);
      this.add
        .image(PAD + AVATAR / 2, top + 14 + AVATAR / 2, TEX.ring)
        .setDisplaySize(AVATAR + 2, AVATAR + 2)
        .setTint(COLORS.btnBorder)
        .setAlpha(0.9);
      tx = PAD + AVATAR + 18;
    }
    this.statusName = makeText(this, tx, top + 16, '', { size: FONT.title, color: TEXT_COLORS.gold, bold: true, scale: STATUS_SCALE });
    this.statusStones = makeText(this, W - PAD, top + 14, '', { size: FONT.small, color: TEXT_COLORS.gold, scale: STATUS_SCALE }).setOrigin(1, 0);
    this.statusAge = makeText(this, tx, top + 68, '', { size: FONT.small, color: TEXT_COLORS.dim, scale: STATUS_SCALE });
    this.statusHp = makeText(this, W - PAD, top + 56, '', { size: FONT.small, color: TEXT_COLORS.dim, scale: STATUS_SCALE }).setOrigin(1, 0);
    this.statusCult = makeText(this, tx, top + 106, '', { size: FONT.small, color: TEXT_COLORS.dim, scale: STATUS_SCALE });
    this.statusGain = makeText(this, W - PAD, top + 106, '', { size: FONT.small, color: TEXT_COLORS.dim, scale: STATUS_SCALE }).setOrigin(1, 0);
    // 修为条：底槽和填充都是圆角图片，横向拉伸时圆头不变形
    const barW = W - PAD * 2;
    const barY = top + 150;
    const pill14 = pillTex(this, 14);
    // 修为满、可以冲关时的提示：条后一团金光呼吸，条上一道高光来回扫
    this.barHalo = this.add.image(PAD + barW / 2, barY + 7, TEX.spark).setDisplaySize(barW + 80, 56).setTint(GOLD_BAR).setVisible(false);
    this.add.nineslice(PAD, barY, pill14, undefined, barW, 14, 7, 7, 0, 0).setOrigin(0, 0).setTint(COLORS.barBg);
    this.barFill = this.add.nineslice(PAD, barY, pill14, undefined, 14, 14, 7, 7, 0, 0).setOrigin(0, 0).setTint(COLORS.bar);
    this.barShine = this.add.image(PAD, barY + 7, TEX.spark).setDisplaySize(110, 24).setTint(0xffffff).setVisible(false);
    // 右列三项用小图标代替文字标签；气血下方一条细血条
    const statIcon = (key: string, color: string) =>
      hasImage(this, key) ? this.add.image(0, 0, key).setDisplaySize(STAT_ICON, STAT_ICON).setOrigin(1, 0.5).setTint(parseInt(color.slice(1), 16)) : null;
    this.iconStones = statIcon('ui_stat_stone', TEXT_COLORS.gold);
    this.iconHp = statIcon('ui_stat_hp', TEXT_COLORS.bad);
    this.iconGain = statIcon('ui_stat_gain', TEXT_COLORS.dim);
    const hpW = 190;
    const hpx = W - PAD - hpW;
    const hpy = top + 95;
    const pill5 = pillTex(this, 5);
    this.add.nineslice(hpx, hpy, pill5, undefined, hpW, 5, 2.5, 2.5, 0, 0).setOrigin(0, 0).setTint(COLORS.barBg);
    this.hpFill = this.add.nineslice(hpx, hpy, pill5, undefined, 5, 5, 2.5, 2.5, 0, 0).setOrigin(0, 0).setTint(HP_COLOR);

    // 各页的滚动区域
    this.views = {} as Record<Tab, ScrollView>;
    for (const t of TABS) this.views[t.key] = new ScrollView(this, t.originX, statusBottom, navTop - statusBottom);

    // 行动区背景（高度随内容变化）
    this.panelBg = this.add.image(0, 0, TEX.white).setOrigin(0, 0).setVisible(false);
    this.panelLine = this.add.image(0, 0, TEX.white).setOrigin(0, 0).setVisible(false);
    this.buildActionButtons(navTop - ACTION_PANEL_H + PANEL_PAD);

    // 底部导航
    this.add.image(0, navTop, TEX.white).setOrigin(0, 0).setDisplaySize(W, NAV_H + safeBottom).setTint(COLORS.panel).setAlpha(0.96);
    addBrushLine(this, 0, navTop, W, 0.6);
    const tabW = (W - PAD * 2 - GAP * (TABS.length - 1)) / TABS.length;
    TABS.forEach((t, i) => {
      this.navBtns[t.key] = new Button(this, PAD + i * (tabW + GAP), navTop + 8, tabW, NAV_H - 16, t.label, () => this.switchTab(t.key), {
        size: FONT.small,
        plain: true,
        sound: 'tab',
        icon: t.icon,
        iconLayout: 'top',
      });
    });

    // 覆盖层必须最后创建，才能盖在滚动区域之上
    this.overlay = new Overlay(this);
    const platform = getPlatform(this);
    this.guide = new Guide(this, this.overlay, platform, loadMeta(platform).lives === 0);

    this.setupLogInput();
    this.setupTyping();
    this.setupClock();
    this.sim.drainSignals(); // 开局时产生的信号（如"早慧"引气入体）不演出
    this.switchTab(this.tab);
  }

  // ---------- 导航 ----------

  /** 有待抉择的事件（含冲关途中）时，丹房、坊市暂不开放 */
  private tabLocked(tab: Tab): boolean {
    return !!this.sim.pendingEvent && (tab === 'dan' || tab === 'shop');
  }

  /** 底部导航：暂不开放的页签变暗（点了会弹提示） */
  private refreshNav(): void {
    for (const t of TABS) {
      const btn = this.navBtns[t.key];
      if (!btn) continue;
      const locked = this.tabLocked(t.key);
      btn.label.setAlpha(locked ? 0.4 : 1);
      btn.setIconAlpha(locked ? 0.35 : 1);
    }
  }

  private switchTab(tab: Tab): void {
    if (this.tabLocked(tab)) {
      this.overlay.toast({ text: '眼下正有要事，先做出抉择', color: TEXT_COLORS.bad }, this.layout.safeTop + STATUS_H);
      return;
    }
    this.tab = tab;
    this.restartArmed = false;
    this.tabUi.selling = null;
    if (tab === 'bag') this.visitedBag = true;
    for (const t of TABS) {
      this.views[t.key].setVisible(t.key === tab);
      if (t.key === tab) this.views[t.key].cam.resetFX();
      this.navBtns[t.key]!.setPrimary(t.key === tab).label.setColor(t.key === tab ? TEXT_COLORS.title : TEXT_COLORS.dim);
    }
    this.refresh();
    if (tab !== 'home') this.views[tab].scrollToTop();
  }

  private get tabActions(): TabActions {
    return {
      act: (fn) => this.act(fn),
      refresh: () => this.refresh(),
      ui: this.tabUi,
      restart: () => this.restart(),
      restartArmed: this.restartArmed,
      setSetting: (patch) => this.applySetting(patch),
      adButton: (slot, what) => adButton(this, slot, what),
      watchAd: (slot, apply) => this.watchAd(slot, apply),
      logoutTapTap: tapTapLoggedIn() ? () => logoutTapTap(this.game) : undefined,
    };
  }

  private applySetting(patch: Partial<Settings>): void {
    saveSettings(getPlatform(this), patch);
    if ('music' in patch) audio.refreshBgm();
    // 字号、主题会影响所有已创建的对象，直接重建场景
    this.scene.restart({ game: this.sim, tab: this.tab });
  }

  // ---------- 行动 ----------

  private buildActionButtons(y0: number): void {
    const cols = 3;
    const w = (DESIGN_W - PAD * 2 - GAP * (cols - 1)) / cols;
    const add = (key: string, row: number, col: number, fn: () => void, primary = false) => {
      const x = PAD + col * (w + GAP);
      const y = y0 + row * (BTN_H + GAP);
      this.actionBtns[key] = new Button(this, x, y, w, BTN_H, '', fn, { primary, icon: ACTION_ICONS[key], size: 26 });
    };
    [0, 1, 2].forEach((i) => add(`door${i}`, 0, i, () => this.act(() => this.sim.closedDoor(this.sim.doorOptions[i]))));
    // 最常用的外出历练居中，左右手都顺手；突破放最左，免得赶路时误触；前往在右
    add('break', 1, 0, () => this.act(() => this.sim.breakthrough()));
    add('explore', 1, 1, () => this.act(() => this.sim.explore()), true);
    add('travel', 1, 2, () => this.openTravelMenu());
  }

  private openTravelMenu(): void {
    const here = this.sim.state.region;
    const ri = realmIndex(this.sim.char.realm);
    this.menu = [
      ...REGIONS.filter((r) => r.id !== here).map((r) => {
        const under = !!r.minRealm && ri < realmIndex(r.minRealm);
        return {
          label: under ? `${r.name}（${r.hint} · 修为尚浅）` : `${r.name}（${r.hint}）`,
          warn: under,
          fn: () => (under ? this.confirmTravel(r.id, r.name, r.hint) : this.act(() => this.sim.travel(r.id))),
        };
      }),
      { label: '返回', fn: () => this.closeMenu() },
    ];
    this.refresh();
  }

  /** 修为不足时二次确认：不拦着，但要说清楚 */
  private confirmTravel(id: string, name: string, hint: string): void {
    this.menu = [
      { label: `${name}凶险，宜${hint}后再来`, fn: () => {}, enabled: false },
      { label: '仍要前往', fn: () => this.act(() => this.sim.travel(id)), warn: true },
      { label: '再想想', fn: () => this.openTravelMenu() },
    ];
    this.refresh();
  }

  /**
   * 安卓返回键：先关菜单，再回到洞府页。返回 false 表示已经无处可退（由调用方决定是否退出）
   */
  handleBack(): boolean {
    if (this.overlay.busy) return true;
    if (this.menu) {
      this.closeMenu();
      return true;
    }
    if (this.tab !== 'home') {
      this.switchTab('home');
      return true;
    }
    return false;
  }

  /** 在状态栏下方弹一条提示（供平台层使用，如"再按一次退出"） */
  hint(text: string): void {
    this.overlay.toast({ text, color: TEXT_COLORS.dim }, this.layout.safeTop + STATUS_H);
  }

  private closeMenu(): void {
    this.menu = null;
    this.refresh();
  }

  private act(fn: () => void): void {
    this.menu = null;
    this.restartArmed = false;
    const logLen = this.sim.state.log.length;
    const before = this.snapshot();
    fn();
    const after = this.snapshot();
    const added = this.sim.state.log.slice(logLen);
    this.playLogSounds(added);
    this.sim.touchClock(Date.now());
    saveGame(getPlatform(this), this.sim);
    // 灵石增加时，状态栏先停在旧数值，等灵石飞到再滚动
    if (after.stones > before.stones) {
      this.stopStoneRoll();
      this.stonesShown = before.stones;
      this.stonesFrozenAt = Date.now();
      // 粒子迟迟没到（比如排在转场后面）也不能一直显示旧数
      this.time.delayedCall(1550, () => this.refreshStatus());
    }
    this.refresh();
    const signals = this.sim.drainSignals();
    for (const s of signals) this.playSignal(s);
    const door = signals.some((s) => s.type === 'door');
    // 闭关、炼丹时听洞府曲；出门历练或赶路就回到区域的曲子
    if (door || signals.some((s) => s.type === 'alchemy')) this.calm = true;
    else if (this.sim.pendingEvent || signals.some((s) => s.type === 'travel' || s.type === 'battle')) this.calm = false;
    this.refreshRegion();
    // 排在转场后面播放，免得被盖住
    this.overlay.custom((done) => {
      this.playGains(before, after, added, door);
      done();
    });
    // 闭关的修为已经在转场里演示过，不再重复提示
    this.showToasts(added, door);
    // 不在洞府页时看不到日志：失败和说明类的提示也用浮动提示弹出来
    if (this.tab !== 'home') {
      const top = this.layout.safeTop + STATUS_H;
      // 已由上面按格式弹过的（物品得失、短句）不再重复
      const already = (x: LogEntry) => /^(获得|失去)【/.test(x.text) || (x.kind === 'bad' && x.text.length <= 16 && !x.text.startsWith('你'));
      for (const e of added.filter((x) => (x.kind === 'bad' || x.kind === 'system') && !already(x)).slice(0, 2)) {
        this.overlay.toast({ text: e.text, color: e.kind === 'bad' ? TEXT_COLORS.bad : TEXT_COLORS.dim }, top);
      }
    }
  }

  // ---------- 获得反馈 ----------

  private stonesShown: number | null = null;
  /** 冻结旧数值的时刻；超过 1.5 秒还没等到粒子到达就直接显示真值，避免长时间不一致 */
  private stonesFrozenAt = 0;
  private stonesTween: Phaser.Tweens.Tween | null = null;
  private stonesTweenTo = 0;

  private stopStoneRoll(): void {
    this.stonesTween?.stop();
    this.stonesTween = null;
  }

  private snapshot(): Snapshot {
    const c = this.sim.char;
    return { stones: c.stones, hp: c.hp, life: this.sim.lifespanYears, inv: { ...this.sim.state.inventory } };
  }

  private playGains(before: Snapshot, after: Snapshot, added: LogEntry[], door: boolean): void {
    const { height: H } = this.layout;
    // 从日志最新一行附近（行动区上方）飞出，不挡新事件的标题和插图
    const from = { x: DESIGN_W / 2, y: this.panelTop ? this.panelTop - 90 : H * 0.6 };
    const dStones = after.stones - before.stones;
    if (dStones > 0) {
      const b = this.statusStones.getBounds();
      const n = Math.min(14, 3 + Math.round(Math.log10(dStones) * 3));
      this.flyParticles(n, from, { x: b.centerX, y: b.centerY }, 'stone', () => this.rollStones(before.stones, after.stones));
    } else if (dStones < 0) {
      this.pulseText(this.statusStones, TEXT_COLORS.bad, true);
    }
    // 新得到的物品：图标飞进行囊
    const got = Object.keys(after.inv).filter((id) => after.inv[id] > (before.inv[id] ?? 0)).slice(0, 4);
    const bag = this.navBtns.bag!;
    got.forEach((id, i) => this.time.delayedCall(i * 180, () => this.flyItem(id, from, bag.center, () => bag.pulse())));
    // 修为（闭关的已在转场里演示）
    if (!door && added.some((e) => e.kind === 'good' && e.text.startsWith('修为 +'))) {
      const { safeTop } = this.layout;
      const x = PAD + (DESIGN_W - PAD * 2) * this.barShown;
      this.flyParticles(6, from, { x, y: safeTop + 157 }, 'qi', () => this.glowBar());
    }
    const maxHp = this.sim.combatStats.maxHp;
    if (!door && Math.min(after.hp, maxHp) !== Math.min(before.hp, maxHp)) {
      this.pulseText(this.statusHp, after.hp > before.hp ? TEXT_COLORS.good : TEXT_COLORS.bad, after.hp < before.hp);
    }
    if (after.life !== before.life) {
      this.pulseText(this.statusAge, after.life > before.life ? TEXT_COLORS.good : TEXT_COLORS.bad, after.life < before.life);
    }
  }

  /** 一群粒子：先从起点炸开，再依次飞向目标；最后一个到达时回调 */
  private flyParticles(n: number, from: { x: number; y: number }, to: { x: number; y: number }, kind: 'stone' | 'qi', arrive: () => void): void {
    const ox = this.overlay.ox;
    // 灵石飞的是状态栏那枚灵石图标（没有素材时退回菱形），颜色也跟着状态栏走
    const stoneKey = hasImage(this, 'ui_stat_stone') ? 'ui_stat_stone' : TEX.diamond;
    const stoneColor = parseInt(TEXT_COLORS.gold.slice(1), 16);
    for (let i = 0; i < n; i++) {
      const stone = kind === 'stone';
      const g = this.add.image(0, 0, stone ? stoneKey : TEX.spark).setDepth(970).setTint(stone ? stoneColor : COLORS.bar);
      if (stone) g.setDisplaySize(44, 44);
      const base = stone ? g.scaleX : 0.4;
      g.setPosition(ox + from.x, from.y).setScale(base * 0.3).setAngle(stone ? Math.random() * 20 - 10 : Math.random() * 40 - 20);
      const a = Math.random() * Math.PI * 2;
      const r = 50 + Math.random() * 90;
      this.tweens.chain({
        targets: g,
        tweens: [
          { x: ox + from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r, scale: base, duration: 260, ease: 'Cubic.easeOut' },
          { x: ox + to.x, y: to.y, scale: base * 0.5, duration: 480, delay: i * 45, ease: 'Cubic.easeIn' },
        ],
        onComplete: () => {
          g.destroy();
          if (i === n - 1) arrive();
        },
      });
    }
  }

  private flyItem(id: string, from: { x: number; y: number }, to: { x: number; y: number }, arrive: () => void): void {
    const ox = this.overlay.ox;
    const key = ASSET_KEYS.icon(id);
    const obj = hasImage(this, key)
      ? this.add.image(ox + from.x, from.y, key).setDisplaySize(96, 96).setTint(COLORS.artTint)
      : makeText(this, ox + from.x, from.y, this.sim.itemName(id).slice(0, 1), { size: 48, color: TEXT_COLORS.gold, bold: true }).setOrigin(0.5);
    obj.setDepth(970).setAlpha(0);
    const s0 = obj.scaleX;
    obj.setScale(s0 * 0.4);
    this.tweens.chain({
      targets: obj,
      tweens: [
        { alpha: 1, scaleX: s0 * 1.15, scaleY: s0 * 1.15, y: from.y - 40, duration: 260, ease: 'Back.easeOut' },
        { scaleX: s0, scaleY: s0, duration: 200 },
        { x: ox + to.x, y: to.y, scaleX: s0 * 0.35, scaleY: s0 * 0.35, alpha: 0.6, duration: 520, ease: 'Cubic.easeIn' },
      ],
      onComplete: () => {
        obj.destroy();
        audio.sfx('item');
        arrive();
      },
    });
  }

  /** 灵石数字滚动，到账时一跳 */
  private rollStones(from: number, to: number): void {
    audio.sfx('coin');
    this.stopStoneRoll();
    // 冻结已经超时、真值已经显示出来了，就不再倒回去滚一遍
    if (this.stonesShown === null || this.sim.char.stones !== to) {
      this.stonesShown = null;
      this.setStonesText(this.sim.char.stones);
      this.pulseText(this.statusStones, TEXT_COLORS.good, false);
      return;
    }
    this.stonesTweenTo = to;
    this.stonesTween = this.tweens.addCounter({
      from, to, duration: 520, ease: 'Cubic.easeOut',
      onUpdate: (tw) => this.setStonesText(Math.round(tw.getValue() ?? to)),
      onComplete: () => {
        this.stonesTween = null;
        this.stonesShown = null;
        this.setStonesText(this.sim.char.stones);
      },
    });
    this.pulseText(this.statusStones, TEXT_COLORS.good, false);
  }

  /** 状态栏文字放大一跳并变色；减少时再抖两下 */
  private pulseText(t: Phaser.GameObjects.Text, color: string, shake: boolean): void {
    // 连续触发时以第一次记下的颜色和位置为准，免得颜色卡住、位置越抖越偏
    const orig = (t.getData('pulseColor') as string | undefined) ?? (t.style.color as string);
    const x0 = (t.getData('pulseX') as number | undefined) ?? t.x;
    t.setData({ pulseColor: orig, pulseX: x0 });
    this.tweens.killTweensOf(t);
    t.setScale(1).setX(x0).setColor(color);
    this.tweens.add({ targets: t, scale: 1.22, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    if (shake) this.tweens.add({ targets: t, x: x0 + 6, duration: 45, yoyo: true, repeat: 2 });
    (t.getData('pulseTimer') as Phaser.Time.TimerEvent | undefined)?.remove();
    t.setData('pulseTimer', this.time.delayedCall(700, () => {
      t.setColor(orig);
      t.setData({ pulseColor: undefined, pulseX: undefined, pulseTimer: undefined });
      // 气血栏的颜色随血量变化，恢复后按当前状态再刷一次
      if (t === this.statusHp) this.refreshStatus();
    }));
  }

  private glowBar(): void {
    const { width: W, safeTop } = this.layout;
    const pill = pillTex(this, 26);
    const g = this.add
      .nineslice(PAD - 6, safeTop + 144, pill, undefined, W - PAD * 2 + 12, 26, 13, 13, 0, 0)
      .setOrigin(0, 0)
      .setTint(COLORS.bar)
      .setAlpha(0.45)
      .setDepth(5);
    this.tweens.add({ targets: g, alpha: 0, duration: 600, onComplete: () => g.destroy() });
  }

  /** 激励视频选项：看完才执行 apply（走 act，会存档、播演出） */
  private adOption(slot: AdSlot, what: string, apply: () => void): ListOption {
    const b = adButton(this, slot, what);
    return { label: b.label, fn: () => this.watchAd(slot, apply), enabled: b.enabled };
  }

  private watchAd(slot: AdSlot, apply: () => void): void {
    void watchRewarded(this, slot, (t) => this.hint(t)).then((ok) => {
      if (!this.scene.isActive()) return;
      if (ok) this.act(apply);
      else this.refresh();
    });
  }

  private restart(): void {
    if (!this.restartArmed) {
      this.restartArmed = true;
      return this.refresh();
    }
    this.rebirth();
  }

  private rebirth(): void {
    if (this.settled) return;
    this.settled = true;
    const settlement = endLife(getPlatform(this), this.sim);
    this.scene.start('Rebirth', { settlement });
  }

  // ---------- 演出 ----------

  /** 根据新增日志补充音效（获得物品、买卖） */
  private playLogSounds(entries: LogEntry[]): void {
    if (entries.some((e) => e.text.startsWith('你花费') || e.text.startsWith('你卖出'))) audio.sfx('coin');
    else if (entries.some((e) => e.kind === 'good' && e.text.startsWith('获得'))) audio.sfx('item');
  }

  /** 新增日志里的数值变化，变成状态栏下方的浮动提示 */
  private showToasts(entries: LogEntry[], skipCultivation: boolean): void {
    const top = this.layout.safeTop + STATUS_H;
    const T = TEXT_COLORS;
    const iconOf = (name: string) => {
      const it = CONTENT.items.find((i) => i.name === name);
      return it ? ASSET_KEYS.icon(it.id) : undefined;
    };
    let shown = 0;
    for (const e of entries) {
      if (shown >= 3) break;
      const t = e.text;
      let m: RegExpExecArray | null;
      if ((m = /^途中顺手采得【(.+?)】×(\d+)$/.exec(t))) {
        this.overlay.toast({ text: `${m[1]} +${m[2]}`, color: T.gold, icon: iconOf(m[1]) }, top);
      } else if ((m = /^(获得|失去)【(.+?)】×(\d+)$/.exec(t))) {
        this.overlay.toast({ text: `${m[2]} ${m[1] === '获得' ? '+' : '-'}${m[3]}`, color: m[1] === '获得' ? T.gold : T.bad, icon: iconOf(m[2]) }, top);
      } else if ((m = /^你花费 (\d+) 灵石，购得【(.+?)】/.exec(t))) {
        this.overlay.toast({ text: `${m[2]} +1`, color: T.gold, icon: iconOf(m[2]) }, top);
        this.overlay.toast({ text: `灵石 -${m[1]}`, color: T.bad }, top);
        shown++;
      } else if ((m = /^你卖出【.+?】×\d+，得灵石 (\d+)/.exec(t))) {
        this.overlay.toast({ text: `灵石 +${m[1]}`, color: T.gold }, top);
      } else if ((m = /^修为精进，晋升(.+)！$/.exec(t))) {
        this.overlay.toast({ text: `晋升 ${m[1]}`, color: T.title }, top);
        flash(this.cameras.main, COLORS.bar, 200);
      } else if ((e.kind === 'good' || e.kind === 'bad') && t.length <= 16 && !t.startsWith('你')) {
        if (skipCultivation && t.startsWith('修为 +')) continue;
        this.overlay.toast({ text: t, color: e.kind === 'good' ? (t.startsWith('灵石') ? T.gold : T.good) : T.bad }, top);
      } else continue;
      shown++;
    }
  }

  private playSignal(s: Signal): void {
    const red = 0xa8322a;
    switch (s.type) {
      case 'door':
        this.overlay.show({
          title: `闭关${monthsLabel(s.months)}`,
          subtitle: s.gain === 0
            ? `${s.ageFrom} 岁 → ${s.ageTo} 岁 · 苦参瓶颈，冲关把握 ${Math.round(this.sim.bottleneckRate * 100)}%`
            : s.bottleneck ? `${s.ageFrom} 岁 → ${s.ageTo} 岁 · 修为已至瓶颈` : `${s.ageFrom} 岁 → ${s.ageTo} 岁`,
          tint: COLORS.ink,
          blotAlpha: 0.3,
          titleColor: TEXT_COLORS.title,
          image: ASSET_KEYS.art('meditation_cave'),
          counter: s.gain > 0 ? { label: '修为', to: s.gain } : undefined,
          quick: true,
          hold: 700,
        });
        break;
      case 'realm':
        // 突破大境界：有演出时播完整的破境演出（飞升另有结局演出）
        if (settings.battleAnim && s.id !== 'ascend') {
          const lifespan = this.sim.lifespanYears;
          this.overlay.custom((done) => new RealmView(this, this.overlay.ox, s, lifespan, s.label === '炼气', done).play());
          break;
        }
        audio.sfx('breakthrough');
        this.overlay.show(
          s.id === 'ascend'
            ? { title: '白日飞升', subtitle: '劫云散尽，仙门洞开', tint: COLORS.bar, blotAlpha: 0.55, image: ASSET_KEYS.realm('ascend'), hold: 2200 }
            : s.label === '炼气'
              ? { title: '引气入体', subtitle: '一缕灵气自丹田升起，仙路始于足下', tint: COLORS.bar, blotAlpha: 0.4, image: ASSET_KEYS.realm(s.id), hold: 1500 }
              : { title: `踏入${s.label}`, subtitle: `寿元上限 ${this.sim.lifespanYears} 年`, tint: COLORS.bar, blotAlpha: 0.45, image: ASSET_KEYS.realm(s.id), hold: 1500 },
        );
        break;
      case 'stage': {
        const quick = this.sim.char.realm === 'lianqi';
        if (settings.battleAnim) {
          this.overlay.custom((done) => new StageView(this, this.overlay.ox, s, quick, done).play());
        } else {
          audio.sfx(s.ok ? 'breakthrough' : 'fail');
          if (!s.ok) shakeAll(this, 300, 0.01);
          this.overlay.stamp(s.ok ? '升' : '阻', this.layout.safeTop + STATUS_H + 260);
        }
        break;
      }
      case 'breakCore':
        audio.sfx('breakthrough');
        this.overlay.show({
          title: `${s.name}功成`, subtitle: `${s.next}将至`, tint: COLORS.bar, blotAlpha: 0.4, hold: 1100, quick: true,
          image: ASSET_KEYS.art('meditation_cave'),
        });
        break;
      case 'breakFail':
        audio.sfx('fail');
        shakeAll(this, 380, 0.012);
        this.overlay.show({
          title: this.sim.char.realm === 'lianqi' ? '冲击失败' : '走火入魔',
          subtitle: this.sim.char.realm === 'lianqi' ? '灵力反噬，修为与寿元皆有折损' : `境界跌落至${this.sim.realmLabel}，寿元折损`,
          tint: red, blotAlpha: 0.45, titleColor: TEXT_COLORS.bad, hold: 900,
        });
        break;
      case 'death':
        audio.sfx('death');
        audio.playBgm('fate');
        this.overlay.show({
          title: s.message.startsWith('寿元耗尽') ? '寿终坐化' : '身死道消',
          subtitle: s.message,
          tint: COLORS.ink,
          blotAlpha: 0.85,
          titleColor: TEXT_COLORS.bad,
          hold: 2000,
          image: ASSET_KEYS.death,
        });
        break;
      case 'revive':
        audio.sfx('breakthrough');
        audio.playBgm(bgmForRegion(this.sim.state.region));
        this.overlay.show({
          title: '残魂不灭', subtitle: `修为折损一半，寿元 -${s.years} 年，经脉重伤`, tint: COLORS.bar, blotAlpha: 0.5, hold: 1400,
        });
        break;
      case 'ending':
        audio.playBgm('fate');
        this.overlay.show({
          title: s.name, subtitle: '—— 结局 ——', tint: COLORS.bar, blotAlpha: 0.5, hold: 2400, image: ASSET_KEYS.ending(s.id),
        });
        break;
      case 'travel': {
        audio.sfx('travel');
        const image = ASSET_KEYS.region(s.id);
        const art = hasImage(this, image);
        this.overlay.show({
          title: s.region, subtitle: s.desc, tint: COLORS.ink, blotAlpha: 0.35, titleColor: TEXT_COLORS.normal,
          hold: art ? 1300 : 600, image,
        });
        break;
      }
      case 'alchemy':
        audio.sfx(s.count ? 'win' : 'fail');
        if (!s.count) shakeAll(this, 300, 0.01);
        this.overlay.show({
          title: s.count ? (s.fine ? '上品丹成' : '丹成') : '炸炉',
          subtitle: s.count ? `${s.name} ×${s.count} · 耗时${monthsLabel(s.months)}` : `一炉${s.name}的药材化作焦灰`,
          tint: s.count ? COLORS.bar : 0xa8322a,
          blotAlpha: 0.35,
          titleColor: s.count ? TEXT_COLORS.title : TEXT_COLORS.bad,
          image: ASSET_KEYS.art('alchemy_room'),
          quick: true,
          hold: 900,
        });
        break;
      case 'battle':
        if (settings.battleAnim) {
          const r = s.replay;
          const portrait = ASSET_KEYS.portrait(this.sim.char.gender);
          this.overlay.custom((done) => new BattleView(this, this.overlay.ox, r, portrait, done).play());
        } else {
          const cy = this.layout.safeTop + STATUS_H + 260;
          if (s.replay.result === 'lose') {
            audio.sfx('hit');
            shakeAll(this, 320, 0.01);
            this.overlay.stamp('败', cy);
          } else if (s.replay.result === 'win') {
            audio.sfx('win');
            flash(this.views.home.cam, COLORS.bar, 260);
            this.overlay.stamp('胜', cy);
          }
        }
        break;
    }
  }

  // ---------- 刷新 ----------

  private refresh(): void {
    this.refreshStatus();
    this.refreshNav();
    this.refreshRegion();
    if (this.tab === 'home') {
      this.refreshPanel();
      this.syncLog();
    } else {
      this.hidePanel();
      const view = this.views[this.tab];
      const scroll = view.cam.scrollY;
      view.clear();
      const build = { dan: buildDan, bag: buildBag, shop: buildShop, char: buildChar }[this.tab];
      build(this, view, this.sim, this.tabActions);
      view.cam.scrollY = scroll;
      view.scrollBy(0);
      // 刚展开的面板（如出售数量）不能落在屏幕外
      if (this.tabUi.reveal) {
        view.reveal(...this.tabUi.reveal);
        this.tabUi.reveal = null;
      }
    }
    this.updateGuide();
  }

  /** 区域插图与背景音乐 */
  private refreshRegion(): void {
    const region = this.sim.state.region;
    // 渡劫、过心魔关时换成天劫曲；闭关、炼丹、待在丹房时换成洞府曲。
    // 何时真正切换由 audio 决定（日常曲目不会频繁换）
    const s = this.sim.state;
    const calm = this.calm || this.tab === 'dan';
    audio.playBgm(s.dead ? 'fate' : s.breaking ? 'tribulation' : calm ? 'cave' : bgmForRegion(region));
    if (region !== this.regionArtId) {
      this.regionArtId = region;
      const key = ASSET_KEYS.region(region);
      if (hasImage(this, key)) this.regionArt.setTexture(key).setDisplaySize(DESIGN_W, (DESIGN_W * 9) / 16).setTint(COLORS.artTint);
      else this.regionArt.setTexture('__WHITE');
    }
    const shown = this.tab === 'home' && this.regionArt.texture.key !== '__WHITE';
    this.regionArt.setVisible(shown).setAlpha(0.28);
    this.regionFade.setVisible(shown);
  }

  private updateGuide(): void {
    const sim = this.sim;
    const targets: Record<string, { x: number; y: number; w: number; h: number } | undefined> = {};
    for (const [k, b] of Object.entries(this.actionBtns)) targets[k] = b.rect;
    for (const [k, b] of Object.entries(this.navBtns)) targets[`tab:${k}`] = b?.rect;
    this.guide.update(
      {
        game: sim,
        tab: this.tab,
        // 行动区被选项列表（事件、菜单、看视频的提议）占用时，引导不指向被盖住的按钮
        actionsShown: !sim.state.dead && !sim.pendingEvent && !this.menu && !this.offerShown,
        visitedBag: this.visitedBag,
        panelTop: this.layout.height - this.layout.safeBottom - NAV_H - ACTION_PANEL_H,
      },
      targets,
    );
  }

  private refreshStatus(): void {
    const sim = this.sim;
    const c = sim.char;
    const s = sim.combatStats;

    this.statusName.setText(`${c.name}  ${sim.realmLabel}`);
    if (this.stonesShown !== null && Date.now() - this.stonesFrozenAt > 1500) this.stonesShown = null;
    // 滚动途中灵石又变了（比如紧接着买了东西），旧的滚动作废
    if (this.stonesTween && this.stonesTweenTo !== c.stones) {
      this.stopStoneRoll();
      this.stonesShown = null;
    }
    if (!this.stonesTween) this.setStonesText(this.stonesShown ?? c.stones);
    const region = getRegion(sim.state.region).name;
    // 死后寿元可能被折损到低于年龄，只显示享年
    this.statusAge.setText(sim.state.dead ? `享年 ${sim.ageYears} 岁 · ${region}` : `${sim.ageYears} / ${sim.lifespanYears} 岁 · ${region}`);
    const hp = Math.min(c.hp, s.maxHp);
    const low = hp < s.maxHp * 0.4;
    // 有伤势时在气血后标一个"伤"字
    const hurt = sim.injury > 0 ? ' 伤' : '';
    this.statusHp.setText(`${this.iconHp ? '' : '气血 '}${fmtNum(hp)} / ${fmtNum(s.maxHp)}${hurt}`).setColor(low || hurt ? TEXT_COLORS.bad : TEXT_COLORS.dim);
    this.drawHpBar(hp / Math.max(1, s.maxHp), low);
    const req = sim.stageReq;
    let cult = `修为 ${fmtNum(Math.floor(c.cultivation))} / ${fmtNum(req)}`;
    if (sim.stuck) cult = `卡在瓶颈 · 冲关 ${Math.round(sim.bottleneckRate * 100)}%`;
    else if (sim.canAdvanceStage) cult = `修为已满，可冲击${sim.nextStageLabel.split('·')[1]}`;
    else if (sim.canBreakthrough) cult = c.realm === 'dujie' ? '修为圆满，可渡劫飞升' : '修为圆满，可冲击大境界';
    this.statusCult.setText(cult).setColor(sim.stuck ? TEXT_COLORS.bad : TEXT_COLORS.dim);
    const reserve = sim.offlineReserve;
    this.statusGain
      .setText(reserve >= 1 ? `${fmtNum(sim.gainPerMonth)}/月 · 灵气储备 ${durationLabel(reserve)}` : `${this.iconGain ? '' : '修炼 '}${fmtNum(sim.gainPerMonth)} / 月`)
      .setColor(reserve >= 1 ? TEXT_COLORS.gold : TEXT_COLORS.dim);
    this.placeStatIcons();
    this.animateBar(Math.min(1, c.cultivation / req), `${c.realm}:${c.stage}`);
  }

  private barShown = -1;
  private barKey = '';
  private barTween: Phaser.Tweens.Tween | null = null;

  /** 修为条平滑增长；跨层时先涨满再从零开始 */
  private barTarget = -1;

  /**
   * 修为条平滑变化。升层、跨境界时修为归零（冲关演出已经庆祝过），进度条也先归零再涨。
   * 目标没变时不重启动画，免得来回闪
   */
  private animateBar(ratio: number, key: string): void {
    const first = this.barShown < 0;
    const levelUp = !first && key !== this.barKey;
    this.barKey = key;
    if (!levelUp && !first && Math.abs(ratio - this.barTarget) < 1e-6) {
      if (!this.barTween?.isPlaying()) this.drawBar(this.barShown);
      return;
    }
    this.barTarget = ratio;
    this.barTween?.stop();
    if (first) {
      this.barShown = ratio;
      return this.drawBar(ratio);
    }
    if (levelUp) this.barShown = 0;
    const from = this.barShown;
    this.barTween = this.tweens.addCounter({
      from, to: ratio, duration: 600, ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        this.barShown = tw.getValue() ?? ratio;
        this.drawBar(this.barShown);
      },
    });
  }

  private drawBar(ratio: number): void {
    const { width: W } = this.layout;
    // 卡瓶颈时修为条发暗。可以冲关时条保持原色满格（换浅色或闪烁会被看成"空条"），
    // 另加金光和扫过的高光提醒去点突破
    const sim = this.sim;
    this.barFill.setTint(sim.stuck ? COLORS.btnBorder : COLORS.bar).setSize(Math.max(14, (W - PAD * 2) * ratio), 14);
    this.setBarReady((sim.canBreakthrough || sim.canAdvanceStage) && ratio >= 1);
  }

  private barGlow: Phaser.Tweens.Tween[] | null = null;

  private setBarReady(on: boolean): void {
    if (on === !!this.barGlow) return;
    if (!on) {
      for (const t of this.barGlow!) t.stop();
      this.barGlow = null;
      this.barHalo.setVisible(false);
      this.barShine.setVisible(false);
      return;
    }
    const barW = this.layout.width - PAD * 2;
    this.barHalo.setVisible(true).setAlpha(0.12);
    this.barShine.setVisible(true).setAlpha(0).setX(PAD);
    const sweep = { duration: 1400, repeat: -1, repeatDelay: 900 };
    this.barGlow = [
      this.tweens.add({ targets: this.barHalo, alpha: 0.4, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
      this.tweens.add({ targets: this.barShine, x: PAD + barW, ease: 'Sine.easeInOut', ...sweep }),
      this.tweens.add({ targets: this.barShine, alpha: 0.75, ease: 'Sine.easeInOut', yoyo: true, ...sweep, duration: 700, repeatDelay: 900 }),
    ];
  }

  /** 气血数字下方的细血条 */
  private drawHpBar(ratio: number, low: boolean): void {
    const w = 190;
    this.hpFill
      .setTint(low ? COLORS.seal : HP_COLOR)
      .setSize(Math.max(5, w * Math.max(0, Math.min(1, ratio))), 5);
  }

  /** 有图标时只显示数字 */
  private setStonesText(n: number): void {
    this.statusStones.setText(`${this.iconStones ? '' : '灵石 '}${n}`);
    this.placeStatIcons();
  }

  /** 小图标贴在右对齐数字的左侧 */
  private placeStatIcons(): void {
    for (const [icon, text] of [[this.iconStones, this.statusStones], [this.iconHp, this.statusHp], [this.iconGain, this.statusGain]] as const) {
      if (icon) icon.setPosition(text.x - text.displayWidth - 8, text.y + text.displayHeight / 2);
    }
  }

  private breakGlow: Phaser.GameObjects.NineSlice | null = null;
  private breakGlowTween: Phaser.Tweens.Tween | null = null;

  /** 在按钮外圈画一道闪烁的金光；传 null 关掉 */
  private setBreakGlow(btn: Button | null): void {
    if (!btn) {
      this.breakGlowTween?.stop();
      this.breakGlowTween = null;
      this.breakGlow?.setVisible(false);
      return;
    }
    const r = btn.rect;
    if (!this.breakGlow) {
      this.breakGlow = this.add
        .nineslice(r.x - 5, r.y - 5, TEX.btnEdge, undefined, r.w + 10, r.h + 10, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
        .setOrigin(0, 0)
        .setDepth(5)
        .setTint(GOLD_BAR);
    }
    this.breakGlow.setVisible(true);
    if (!this.breakGlowTween) {
      this.breakGlow.setAlpha(1);
      this.breakGlowTween = this.tweens.add({ targets: this.breakGlow, alpha: 0.2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  private hidePanel(): void {
    this.panelBg.setVisible(false);
    this.panelLine.setVisible(false);
    this.setBreakGlow(null);
    for (const b of Object.values(this.actionBtns)) b.setVisible(false);
    for (const b of this.listBtns) b.destroy();
    this.listBtns = [];
  }

  /** 根据状态决定行动区显示什么：常规行动 / 菜单 / 事件选项 / 转世 */
  private refreshPanel(): void {
    const sim = this.sim;
    let list: ListOption[] | null = null;
    this.offerShown = false;
    if (sim.state.dead) {
      // 激励视频的挽回选项排在前面，不看广告的"转世重修"始终保留
      list = [];
      if (sim.canRevive) list.push(this.adOption('revive', `残魂不灭（折寿 ${sim.reviveYears} 年，本世仅一次）`, () => sim.revive()));
      list.push({ label: '转世重修', fn: () => this.rebirth(), primary: true });
    } else if (!sim.pendingEvent && !this.menu && sim.canUndoBreak && adButton(this, 'undo_break', '').enabled) {
      list = [
        this.adOption('undo_break', '逆天改命：找回境界与修为', () => sim.undoBreak()),
        { label: '认了，继续修行', fn: () => this.act(() => sim.dismissSetback()) },
      ];
      this.offerShown = true;
    } else if (!sim.pendingEvent && !this.menu && this.offlineOffer >= 1 && sim.idle && adButton(this, 'offline_double', '').enabled) {
      const offer = this.offlineOffer;
      list = [
        this.adOption('offline_double', `灵气储备翻倍（+${durationLabel(offer)}）`, () => {
          this.offlineOffer = 0;
          sim.addOfflineReserve(offer);
        }),
        { label: '收下', fn: () => ((this.offlineOffer = 0), this.refresh()) },
      ];
      this.offerShown = true;
    } else if (sim.pendingEvent) {
      list = sim.pendingEvent.options.map((opt, i) => {
        const blocked = sim.optionBlocked(opt);
        const chance = sim.checkChance(opt);
        let label = opt.text;
        // 选项本身带括号（如"（30 灵石）"）时合并成一个括号
        const add = (s: string) => (label = label.endsWith('）') ? `${label.slice(0, -1)} · ${s}）` : `${label}（${s}）`);
        // 战斗选项：显示敌人档次和胜算（按当前装备、气血、符箓预估）
        const win = !blocked && opt.battle ? sim.battleChance(opt.battle.enemy) : null;
        const tier = opt.battle ? sim.enemyTier(opt.battle.enemy) : '';
        if (blocked) add(shortBlock(blocked, opt.text));
        else if (win !== null) add(`${tier ? `${tier} · ` : ''}胜算约 ${Math.round(win * 100)}%`);
        else if (chance !== null) add(`约 ${Math.round(chance * 100)}%`);
        // 成功率上色：稳妥绿、凶险红
        const p = win ?? chance;
        const color = blocked || p === null ? undefined : p >= 0.8 ? TEXT_COLORS.good : p < 0.4 ? TEXT_COLORS.bad : undefined;
        return { label, fn: () => this.act(() => sim.choose(i)), enabled: !blocked, color };
      });
    } else if (this.menu) {
      list = this.menu;
    }

    for (const b of this.listBtns) b.destroy();
    this.listBtns = [];
    const showActions = !list;
    for (const b of Object.values(this.actionBtns)) b.setVisible(showActions);
    if (!showActions) this.setBreakGlow(null);

    const { height: H, safeBottom } = this.layout;
    const navTop = H - safeBottom - NAV_H;
    const panelH = list ? PANEL_PAD * 2 + list.length * CHOICE_H + (list.length - 1) * GAP : ACTION_PANEL_H;
    const panelTop = navTop - panelH;
    this.panelTop = panelTop;
    this.panelBg.setVisible(true).setPosition(0, panelTop).setDisplaySize(DESIGN_W, panelH).setTint(COLORS.panel).setAlpha(0.96);
    this.panelLine.setVisible(true).setPosition(0, panelTop).setDisplaySize(DESIGN_W, 2).setTint(COLORS.line).setAlpha(1);
    const statusBottom = this.layout.safeTop + STATUS_H;
    this.views.home.setViewport(statusBottom, panelTop - statusBottom);

    if (list) {
      list.forEach((o, i) => {
        const y = panelTop + PANEL_PAD + i * (CHOICE_H + GAP);
        const b = new Button(this, PAD, y, DESIGN_W - PAD * 2, CHOICE_H, o.label, o.fn, { primary: o.primary });
        this.listBtns.push(b.setEnabled(o.enabled ?? true));
        if (o.warn) b.label.setColor(TEXT_COLORS.bad);
        else if (o.color) b.label.setColor(o.color);
      });
      return;
    }

    sim.doorOptions.forEach((m, i) => this.actionBtns[`door${i}`].setText(`闭关${monthsLabel(m)}`));
    this.actionBtns.explore.setText('外出历练');
    this.actionBtns.travel.setText('前往…');
    const breakBtn = this.actionBtns.break;
    const verb = sim.char.realm === 'dujie' ? '飞升' : getRealm(sim.char.realm).tribulation ? '渡劫' : '突破';
    const realm = getRealm(sim.char.realm);
    if (sim.stuck) breakBtn.setText(`破瓶颈 ${Math.round(sim.bottleneckRate * 100)}%`).setEnabled(true);
    else if (sim.canAdvanceStage) breakBtn.setText(`冲击${realm.stageNames[sim.char.stage + 1]}`).setEnabled(true);
    else if (!sim.canBreakthrough) breakBtn.setText('修为未满').setEnabled(false);
    else if (sim.missingBreakItem) breakBtn.setText(`缺${sim.itemName(sim.missingBreakItem).replace(/[《》]/g, '')}`).setEnabled(true);
    else breakBtn.setText(`${verb} ${Math.round(sim.breakthroughRate * 100)}%`).setEnabled(true);
    // 能冲关、能突破（材料齐了）、或带着瓶颈丹卡在瓶颈时，按钮外圈闪光，指引去点
    const ready = sim.canAdvanceStage || (sim.canBreakthrough && !sim.missingBreakItem) || (sim.stuck && sim.hasBottleneckPill);
    this.setBreakGlow(ready ? breakBtn : null);
  }

  // ---------- 离线收益 ----------

  private setupClock(): void {
    const platform = getPlatform(this);
    const gained = this.sim.syncClock(Date.now());
    if (gained >= 1) saveGame(platform, this.sim);
    if (gained >= OFFLINE_OFFER_MIN) this.offlineOffer = gained;
    const onHidden = () => {
      this.sim.touchClock(Date.now());
      saveGame(platform, this.sim);
    };
    const onVisible = () => {
      const got = this.sim.syncClock(Date.now());
      if (got >= 1) {
        if (got >= OFFLINE_OFFER_MIN) this.offlineOffer = got;
        saveGame(platform, this.sim);
        this.refresh();
      }
    };
    this.game.events.on('hidden', onHidden);
    this.game.events.on('visible', onVisible);
    this.events.once('shutdown', () => {
      this.game.events.off('hidden', onHidden);
      this.game.events.off('visible', onVisible);
    });
  }

  // ---------- 日志 ----------

  private syncLog(): void {
    const log = this.sim.state.log;
    const view = this.views.home;
    let start = 0;
    if (this.lastEntry) {
      const idx = log.lastIndexOf(this.lastEntry);
      if (idx === -1) {
        view.clear();
        this.typing = [];
        this.logY = 0;
      } else {
        start = idx + 1;
      }
    }
    // 首次进入时直接显示，之后新增的条目按设置的方式出现
    const animate = this.lastEntry !== null;
    for (let i = start; i < log.length; i++) this.appendLog(log[i], animate ? i - start : -1);
    this.lastEntry = log[log.length - 1] ?? null;
    view.contentHeight = this.logY;
    view.scrollToBottom();
  }

  /** order：本批新增中的序号，-1 表示不做动画 */
  private appendLog(e: LogEntry, order: number): void {
    const view = this.views.home;
    const s = logStyle(e.kind);
    const y = this.logY + s.gap;
    const x0 = view.originX;
    if (e.kind === 'art') return this.appendArt(e.text, y, order);
    // 开着战斗演出时，逐招战报已经在动画里看过了，日志只留开场符箓
    if (e.kind === 'battle' && settings.battleAnim && !/^你(祭出|拍出)/.test(e.text)) return;
    if (e.kind === 'title' && hasImage(this, 'ui_cloud_ornament')) return this.appendTitle(e.text, y, order);
    // 时间戳和短的低语居中，长段落（如结局）左对齐更易读
    const centered = e.kind === 'time' || (e.kind === 'whisper' && e.text.length <= 24);
    const t = centered
      ? makeText(this, x0 + DESIGN_W / 2, y, e.text, { size: s.size, color: s.color, wrap: DESIGN_W - PAD * 2, align: 'center' }).setOrigin(0.5, 0)
      : makeText(this, x0 + PAD, y, e.text, { size: s.size, color: s.color, wrap: DESIGN_W - PAD * 2 });
    view.add(t);
    // 先按全文排版占好位置，再决定怎么出现
    this.logY = y + t.height;
    if (order < 0 || settings.textSpeed === 'instant') return;
    if (settings.textSpeed === 'char') {
      t.setText('');
      this.typing.push({ obj: t, full: e.text, shown: 0, step: e.kind === 'battle' ? TYPE_CHARS_BATTLE : TYPE_CHARS });
    } else {
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 220, delay: Math.min(order * REVEAL_STEP, REVEAL_MAX) });
    }
  }

  /** 事件标题：居中压在祥云题牌上 */
  private appendTitle(text: string, y: number, order: number): void {
    const view = this.views.home;
    const cx = view.originX + DESIGN_W / 2;
    const label = makeText(this, cx, 0, text.replace(/[【】]/g, ''), { size: FONT.title, color: TEXT_COLORS.title, bold: true }).setOrigin(0.5);
    const plateW = Math.min(DESIGN_W - PAD * 2, label.width + 200);
    const plateH = (plateW * 133) / 600;
    const plate = view.add(this.add.image(cx, y + plateH / 2, 'ui_cloud_ornament').setDisplaySize(plateW, plateH).setTint(COLORS.btnBorder));
    view.add(label.setY(y + plateH / 2));
    this.logY = y + plateH;
    if (order >= 0 && settings.textSpeed !== 'instant') {
      for (const o of [plate, label]) o.setAlpha(0);
      this.tweens.add({ targets: [plate, label], alpha: 1, duration: 400, delay: Math.min(order * REVEAL_STEP, REVEAL_MAX) });
    }
  }

  /** 事件插图：带边框的横幅，没有素材时跳过 */
  private appendArt(id: string, y: number, order: number): void {
    const key = ASSET_KEYS.art(id);
    if (!hasImage(this, key)) return;
    const view = this.views.home;
    const x = view.originX + PAD;
    const w = DESIGN_W - PAD * 2;
    const h = Math.round((w * 450) / 1035);
    const img = view.add(this.add.image(x, y, key).setOrigin(0, 0).setDisplaySize(w, h).setTint(COLORS.artTint));
    const frame = view.add(
      this.add
        .nineslice(x - 6, y - 6, TEX.frame, undefined, w + 12, h + 12, SLICE.frame, SLICE.frame, SLICE.frame, SLICE.frame)
        .setOrigin(0, 0)
        .setTint(COLORS.btnBorder),
    );
    this.logY = y + h + 6;
    if (order >= 0 && settings.textSpeed !== 'instant') {
      img.setAlpha(0);
      frame.setAlpha(0);
      this.tweens.add({ targets: [img, frame], alpha: 1, duration: 500, delay: Math.min(order * REVEAL_STEP, REVEAL_MAX) });
    }
  }

  /** 逐字显示：按队列一条一条打出来 */
  private setupTyping(): void {
    this.time.addEvent({
      delay: TYPE_TICK_MS,
      loop: true,
      callback: () => {
        const cur = this.typing[0];
        if (!cur) return;
        if (!cur.obj.active) return void this.typing.shift();
        cur.shown = Math.min(cur.full.length, cur.shown + cur.step);
        cur.obj.setText(cur.full.slice(0, cur.shown));
        if (cur.shown >= cur.full.length) this.typing.shift();
      },
    });
  }

  /** 点一下日志区：跳过逐字显示 */
  private setupLogInput(): void {
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.tab !== 'home' || !this.typing.length) return;
      const { zoom } = this.layout;
      if (Math.hypot(p.upX - p.downX, p.upY - p.downY) > 24 * zoom) return;
      const y = p.y / zoom;
      const view = this.views.home;
      const top = view.cam.y / zoom;
      if (y < top || y > top + view.cam.height / zoom) return;
      for (const t of this.typing) if (t.obj.active) t.obj.setText(t.full);
      this.typing = [];
    });
  }
}

/** 条件不满足的提示尽量短：选项文字里已经写明的材料就不再重复 */
function shortBlock(reason: string, optText: string): string {
  if (/^需 \d+ 灵石$/.test(reason)) return '灵石不足';
  const m = /^需【(.+?)】/.exec(reason);
  if (m) return optText.includes(m[1].replace(/[《》]/g, '')) ? '缺材料' : `缺${m[1]}`;
  return reason;
}
