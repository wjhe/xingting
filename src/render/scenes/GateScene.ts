import Phaser from 'phaser';
import { AGREEMENT_TEXT, LEGAL_SUMMARY, LEGAL_VERSION, PRIVACY_TEXT } from '../../data/legal';
import { initAppAds } from '../../platform/appAds';
import { COMPLIANCE, getTapTap, isNativeApp, type TapTapBridge } from '../../platform/taptap';
import { ASSET_KEYS, hasImage } from '../assets';
import { TEX } from '../ink';
import { loadGame } from '../session';
import { settings } from '../settings';
import { COLORS, DESIGN_W, FONT, TEXT_COLORS } from '../theme';
import { addBackdrop, addBrushLine, Button, getPlatform, makeText, ScrollView, setupCamera } from '../ui';

const PAD = 50;
/** 玩家同意过的协议版本 */
const CONSENT_KEY = 'wdcs_legal_consent';
/** 进入游戏后的场景，被防沉迷踢出时要停掉 */
const GAME_SCENES = ['Main', 'Create', 'Rebirth'];

type Destroyable = { destroy(): void };

/** 合规回调码对应的提示 */
const BLOCK_TEXT: Record<number, string> = {
  [COMPLIANCE.PERIOD_RESTRICT]: '根据国家防沉迷规定，未成年人仅可在周五、周六、周日和法定节假日的 20:00 至 21:00 进行游戏。\n\n当前不在可玩时段，请合理安排时间。',
  [COMPLIANCE.DURATION_LIMIT]: '你今日的游戏时长已用完。\n\n根据国家防沉迷规定，未成年人每日游戏时间受到限制，请明天再来。',
  [COMPLIANCE.AGE_LIMIT]: '很抱歉，你的年龄不满足本游戏的适龄要求，无法进入游戏。',
  [COMPLIANCE.NETWORK_ERROR]: '无法连接实名认证服务，请检查网络后重试。',
  [COMPLIANCE.REAL_NAME_STOP]: '根据国家规定，需要完成实名认证才能进入游戏。',
};

/** 本次运行中登录的 TapTap 账号（设置页的"退出 TapTap 登录"用） */
let session: { tap: TapTapBridge } | null = null;
let listening = false;
/** 正在等待一次合规认证的结果 */
let waiting: ((code: number) => void) | null = null;
/** 玩家主动退出登录的过程中：SDK 会顺带回调 1000，不要再把玩家踢一次 */
let loggingOut = false;

export function tapTapLoggedIn(): boolean {
  return !!session;
}

/** 退出 TapTap 登录：等 SDK 清掉账号后，存档并回到登录页（不自动登录） */
export function logoutTapTap(game: Phaser.Game): void {
  const s = session;
  if (!s || loggingOut) return;
  session = null;
  loggingOut = true;
  void s.tap
    .logout()
    .catch(() => undefined)
    .then(() => kick(game, '已退出 TapTap 登录。', true))
    .finally(() => (loggingOut = false));
}

function inGame(game: Phaser.Game): boolean {
  return GAME_SCENES.some((k) => game.scene.isActive(k));
}

/** 停掉游戏场景（先触发存档），回到门口。forceLogin：不用本地缓存的账号自动登录 */
function kick(game: Phaser.Game, message?: string, forceLogin = false): void {
  game.events.emit('hidden');
  for (const k of GAME_SCENES) if (game.scene.isActive(k)) game.scene.stop(k);
  if (game.scene.isActive('Gate')) game.scene.stop('Gate');
  game.scene.start('Gate', { message, forceLogin });
}

/**
 * 进游戏前的门口（只在安卓原生壳里出现）：隐私政策同意 → TapTap 登录 → 实名认证与防沉迷。
 * 网页、微信直接放行。游戏中途收到防沉迷限制（如时长用尽）也会被送回这里。
 */
export class GateScene extends Phaser.Scene {
  private ui: Destroyable[] = [];
  private reader!: ScrollView;
  private message = '';
  private tap: TapTapBridge | null = null;
  /** 刚主动退出登录：本地即使还留着账号也不自动登录，必须重新点"TapTap 登录" */
  private forceLogin = false;
  /**
   * 第几次启动本场景。场景重启后，上一次还没走完的异步流程（初始化、认证）一律作废，
   * 否则它可能在登录页已经显示出来之后，把玩家送进游戏。
   */
  private gen = 0;

  constructor() {
    super('Gate');
  }

  init(data: { message?: string; forceLogin?: boolean }): void {
    this.gen++;
    this.message = data?.message ?? '';
    this.forceLogin = !!data?.forceLogin;
    this.ui = [];
  }

  create(): void {
    void this.run();
  }

  /** 这次流程是否已经被更新的一次启动取代 */
  private stale(gen: number): boolean {
    return gen !== this.gen;
  }

  private async run(): Promise<void> {
    const gen = this.gen;
    const native = await isNativeApp();
    if (this.stale(gen)) return;
    if (!native) return this.enter();
    this.drawFrame();
    if (this.storage.get(CONSENT_KEY) !== LEGAL_VERSION) return this.showConsent();
    await this.connect();
  }

  private get storage() {
    return getPlatform(this).storage;
  }

  /** 已同意协议：初始化 TapSDK、登录、开始实名认证 */
  private async connect(): Promise<void> {
    const gen = this.gen;
    // 广告 SDK 同样要在同意之后才初始化；不等它，后台慢慢来
    void initAppAds(settings.personalAds);
    const tap = await getTapTap();
    if (this.stale(gen)) return;
    this.tap = tap;
    // 没有配置 TapTap（如测试包）：只要求同意隐私政策
    if (!tap) return this.enter();
    this.listen(tap);
    this.showStatus('正在连接 TapTap……');
    try {
      await tap.init();
    } catch (e) {
      if (this.stale(gen)) return;
      const code = errCode(e);
      // 1001：包名或签名与开发者中心登记的不一致，重试无用，只能改配置后重新打开游戏
      return this.showError(
        code === '1001'
          ? 'TapTap 应用配置有误，暂时无法登录（1001）。\n请稍后再试，或联系我们。'
          : `TapTap 初始化失败（${code}），请检查网络后重试。`,
      );
    }
    if (this.stale(gen)) return;
    // 刚主动退出登录：不用本地账号自动登录，等玩家自己点登录
    const account = this.forceLogin ? null : await tap.currentAccount();
    if (this.stale(gen)) return;
    if (account) return this.verify(account.openId);
    this.showLogin();
  }

  private async login(): Promise<void> {
    const gen = this.gen;
    const tap = this.tap!;
    this.showStatus('正在登录……');
    let openId: string;
    try {
      openId = (await tap.login()).openId;
    } catch (e) {
      if (this.stale(gen)) return;
      // 玩家取消不算错误，回到登录按钮即可
      this.message = errCode(e) === 'cancel' ? '' : '登录失败，请重试。';
      return this.showLogin();
    }
    if (this.stale(gen)) return;
    this.forceLogin = false;
    await this.verify(openId);
  }

  /** 实名认证与防沉迷：只有回调 500 才能进入游戏 */
  private async verify(openId: string): Promise<void> {
    const gen = this.gen;
    const tap = this.tap!;
    this.showStatus('正在进行实名认证……');
    let mine: ((code: number) => void) | null = null;
    const code = await new Promise<number>((resolve) => {
      waiting = mine = resolve;
      void tap.startCompliance(openId).catch(() => resolve(COMPLIANCE.NETWORK_ERROR));
    });
    // 只清自己挂上的等待：门口重启后新的认证可能已经挂了新的
    if (waiting === mine) waiting = null;
    // 认证期间门口被重启过（例如又收到退出回调）：这个结果作废，不能拿它进游戏
    if (this.stale(gen)) return;
    if (code === COMPLIANCE.OK) {
      session = { tap };
      return this.enter();
    }
    if (code === COMPLIANCE.EXITED || code === COMPLIANCE.SWITCH_ACCOUNT) {
      await tap.logout();
      if (this.stale(gen)) return;
      this.message = '';
      return this.showLogin();
    }
    const retry = code === COMPLIANCE.NETWORK_ERROR || code === COMPLIANCE.REAL_NAME_STOP;
    this.showBlocked(BLOCK_TEXT[code] ?? `暂时无法进入游戏（${code}）。`, retry ? () => this.verify(openId) : null);
  }

  /**
   * 合规回调只注册一次：认证中交给 verify，游戏进行中收到限制就把玩家送回门口。
   * 不在游戏里（已经在门口）时收到的非 500 回调忽略，免得把正在显示的登录页又重启一遍。
   */
  private listen(tap: TapTapBridge): void {
    if (listening) return;
    listening = true;
    const game = this.game;
    tap.onCompliance((code) => {
      if (waiting) {
        const w = waiting;
        waiting = null;
        return w(code);
      }
      if (code === COMPLIANCE.OK || loggingOut || !inGame(game)) return;
      session = null;
      kick(game, BLOCK_TEXT[code] ?? (code === COMPLIANCE.SWITCH_ACCOUNT ? '' : '登录已失效，请重新登录。'));
    });
  }

  private enter(): void {
    const game = loadGame(getPlatform(this));
    if (game) this.scene.launch('Main', { game });
    else this.scene.launch('Create');
    this.scene.stop();
  }

  // ---------- 界面 ----------

  private drawFrame(): void {
    const { height: H, safeTop } = setupCamera(this);
    addBackdrop(this, { mountains: true, mountainY: H - 420 });
    const cx = DESIGN_W / 2;
    const y = safeTop + Math.max(150, H * 0.14);
    if (hasImage(this, ASSET_KEYS.title)) {
      const t = this.add.image(cx, y, ASSET_KEYS.title).setTint(parseInt(TEXT_COLORS.title.slice(1), 16));
      t.setScale(Math.min(460 / t.width, 140 / t.height));
    } else {
      makeText(this, cx, y, '问道长生', { size: 64, color: TEXT_COLORS.title, bold: true, scale: 1 }).setOrigin(0.5);
    }
    addBrushLine(this, PAD, y + 110, DESIGN_W - PAD * 2, 0.4);
    this.reader = new ScrollView(this, 10000, 0, 1);
    this.reader.setVisible(false);
  }

  private clear(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.reader?.setVisible(false);
  }

  private get top(): number {
    const { height: H, safeTop } = getLayoutOf(this);
    return safeTop + Math.max(150, H * 0.14) + 150;
  }

  private text(y: number, s: string, opts: Parameters<typeof makeText>[4] = {}): Phaser.GameObjects.Text {
    const t = makeText(this, DESIGN_W / 2, y, s, { wrap: DESIGN_W - PAD * 2, align: 'center', ...opts }).setOrigin(0.5, 0);
    this.ui.push(t);
    return t;
  }

  private button(y: number, label: string, fn: () => void, primary = false, x = PAD, w = DESIGN_W - PAD * 2, h = 96): Button {
    const b = new Button(this, x, y, w, h, label, fn, { primary, size: primary ? 32 : FONT.body });
    this.ui.push(b);
    return b;
  }

  /** 底部按钮区的起点 */
  private get bottom(): number {
    const { height: H, safeBottom } = getLayoutOf(this);
    return H - safeBottom - 60;
  }

  private showConsent(): void {
    this.clear();
    let y = this.top;
    this.text(y, '用户协议与隐私政策', { size: FONT.title, color: TEXT_COLORS.title, bold: true });
    y += 80;
    const body = this.text(y, LEGAL_SUMMARY, { color: TEXT_COLORS.normal, align: 'left' });
    y += body.height + 30;
    const half = (DESIGN_W - PAD * 2 - 20) / 2;
    this.button(y, '《用户协议》', () => this.showReader('用户协议', AGREEMENT_TEXT), false, PAD, half, 80);
    this.button(y, '《隐私政策》', () => this.showReader('隐私政策', PRIVACY_TEXT), false, PAD + half + 20, half, 80);
    this.button(this.bottom - 216, '同意并进入', () => {
      this.storage.set(CONSENT_KEY, LEGAL_VERSION);
      void this.connect();
    }, true);
    this.button(this.bottom - 100, '不同意', () => this.showDeclined());
  }

  private showDeclined(): void {
    this.clear();
    this.text(this.top, '需要同意《用户协议》和《隐私政策》后才能进入游戏。\n\n我们只会按政策说明使用你的信息，你也可以随时撤回同意。', { color: TEXT_COLORS.normal });
    this.button(this.bottom - 216, '再看看', () => this.showConsent(), true);
    this.button(this.bottom - 100, '退出游戏', () => void exitApp());
  }

  private showReader(title: string, body: string): void {
    this.clear();
    const { safeTop } = getLayoutOf(this);
    const v = this.reader;
    const footer = this.bottom - 100;
    v.setViewport(safeTop + 20, footer - safeTop - 40);
    v.clear();
    v.add(makeText(this, v.originX + DESIGN_W / 2, 10, title, { size: FONT.title, color: TEXT_COLORS.title, bold: true }).setOrigin(0.5, 0));
    // 按段落拆成多个文字对象：整篇放进一个对象，纹理会超出部分手机 GPU 的尺寸上限而显示空白
    let y = 80;
    for (const para of body.split(/\n\s*\n/)) {
      const t = v.add(makeText(this, v.originX + PAD, y, para, { size: FONT.small, color: TEXT_COLORS.normal, wrap: DESIGN_W - PAD * 2, lineSpacing: 10 }));
      y += t.height + 24;
    }
    v.contentHeight = y + 20;
    v.scrollToTop();
    v.setVisible(true);
    // 正文盖在标题区上，先用底色挡住背后的标题
    const shade = this.add.image(0, 0, TEX.white).setOrigin(0, 0).setDisplaySize(DESIGN_W, footer - 10).setTint(COLORS.bg).setAlpha(0.97);
    this.ui.push(shade);
    this.button(footer, '返回', () => this.showConsent(), true);
  }

  private showStatus(s: string): void {
    this.clear();
    this.text(this.top + 60, s, { color: TEXT_COLORS.dim });
  }

  private showLogin(): void {
    this.clear();
    let y = this.top;
    if (this.message) {
      const m = this.text(y, this.message, { color: TEXT_COLORS.bad });
      y += m.height + 30;
    }
    this.text(y, '请使用 TapTap 账号登录。\n根据国家规定，登录后需完成实名认证。', { color: TEXT_COLORS.dim, size: FONT.small });
    this.button(this.bottom - 100, 'TapTap 登录', () => void this.login(), true);
  }

  private showBlocked(s: string, retry: (() => void) | null): void {
    this.clear();
    this.text(this.top, s, { color: TEXT_COLORS.normal });
    if (retry) this.button(this.bottom - 216, '重试', () => void retry(), true);
    this.button(this.bottom - 100, '切换账号', () => {
      const gen = this.gen;
      void this.tap!.logout().then(() => {
        if (this.stale(gen)) return;
        this.message = '';
        this.forceLogin = true;
        this.showLogin();
      });
    });
  }

  private showError(s: string): void {
    this.clear();
    this.text(this.top, s, { color: TEXT_COLORS.bad });
    this.button(this.bottom - 100, '重试', () => void this.connect(), true);
  }
}

function getLayoutOf(scene: Phaser.Scene) {
  return scene.registry.get('layout') as { height: number; safeTop: number; safeBottom: number };
}

function errCode(e: unknown): string {
  return (e as { code?: string })?.code ?? String((e as Error)?.message ?? e);
}

async function exitApp(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');
    await App.exitApp();
  } catch {
    // 网页里没法退出，停在这里即可
  }
}
