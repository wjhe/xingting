import Phaser from 'phaser';
import type { Platform } from '../platform/types';
import { CreateScene } from './scenes/CreateScene';
import { GateScene } from './scenes/GateScene';
import { MainScene } from './scenes/MainScene';
import { RebirthScene } from './scenes/RebirthScene';
import { ASSET_KEYS, bootPack, hasImage, loadAudioInBackground, preloadImages } from './assets';
import { touchAdLedger } from './ads';
import { audio } from './audio';
import { generateInkTextures, TEX } from './ink';
import { loadSettings, settings } from './settings';
import { COLORS, DESIGN_W, FONT_FAMILY, TEXT_COLORS } from './theme';
import type { Layout } from './ui';

/** 加载页至少停留这么久，桌面端素材来得太快，否则标题一闪而过 */
const MIN_BOOT_MS = 900;
/** 加载中的文案，隔一会儿换一句，像在研墨铺纸 */
const BOOT_HINTS = ['研墨铺纸……', '铺开长卷……', '笔走龙蛇……', '静待墨干……'];
const HINT_MS = 1900;

/**
 * 首个场景：显示加载进度，图片就绪后读档进入主界面或开局。
 * 本场景之后不关闭（用 launch 而不是 start），继续在后台加载音频。
 */
class BootScene extends Phaser.Scene {
  private all: Phaser.GameObjects.GameObject[] = [];
  private barFill!: Phaser.GameObjects.Image;
  private barLine!: Phaser.GameObjects.Image;
  private barHead!: Phaser.GameObjects.Image;
  private hintText!: Phaser.GameObjects.Text;
  private barX = 0;
  private barW = 0;
  /** 进度条显示值，朝 target 追赶，避免一格一格地跳 */
  private shown = 0;
  private target = 0;
  private hintIndex = 0;
  private hintMs = 0;
  private startedAt = 0;
  private finishing = false;
  private done = false;
  private ready = false;
  private onReady: (() => void) | null = null;

  constructor() {
    // 加载页自己的主视觉和书法标题先单独载入，preload 里搭界面时就能用
    super({ key: 'Boot', pack: { files: bootPack() } as Phaser.Types.Scenes.SettingsConfig['pack'] });
  }

  preload(): void {
    const platform = this.registry.get('platform');
    loadSettings(platform);
    // 界面的程序化纹理（按钮、条形、纸纹等）先备好，加载页本身也要用
    generateInkTextures(this);
    const layout = this.registry.get('layout') as Layout;
    this.cameras.main.setOrigin(0, 0).setZoom(layout.zoom).setBackgroundColor(COLORS.bg);
    const W = DESIGN_W;
    const H = layout.height;
    const cx = W / 2;
    const night = settings.theme === 'night';
    const font = { fontFamily: FONT_FAMILY, resolution: Math.ceil(layout.zoom * 2) / 2 };
    const text = (x: number, y: number, s: string, size: number, color: string, bold = false) =>
      this.add.text(x, y, s, { ...font, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' }).setOrigin(0.5);
    this.startedAt = performance.now();
    const objs: Phaser.GameObjects.GameObject[] = [];
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => (objs.push(o), o);

    // 底：宣纸
    keep(this.add.image(0, 0, TEX.white).setOrigin(0, 0).setDisplaySize(W, H).setTint(COLORS.bg));
    keep(this.add.tileSprite(0, 0, W, H, TEX.paper).setOrigin(0, 0).setTint(COLORS.fiber).setAlpha(0.45));

    // 主视觉铺满全屏，慢慢推远；没有素材时用程序画的远山
    if (hasImage(this, ASSET_KEYS.boot)) {
      const art = keep(this.add.image(cx, H / 2, ASSET_KEYS.boot).setTint(COLORS.artTint).setAlpha(0));
      const fit = Math.max(W / art.width, H / art.height);
      art.setScale(fit * 1.08);
      this.tweens.add({ targets: art, alpha: night ? 0.5 : 1, duration: 900, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: art, scale: fit, duration: 9000, ease: 'Sine.easeOut' });
    } else {
      const mtn = keep(this.add.image(0, H - 320, TEX.mountains).setOrigin(0, 0).setDisplaySize(W, 320).setTint(COLORS.mountain).setAlpha(0));
      this.tweens.add({ targets: mtn, alpha: 0.42, duration: 1100, delay: 260 });
    }
    // 两缕薄雾横向飘过，让画面有点活气
    for (const [y, from, to, delay] of [[H * 0.5, -260, W + 260, 0], [H * 0.66, W + 300, -300, 1800]]) {
      const mist = keep(this.add.image(from, y, TEX.blot).setDisplaySize(760, 220).setTint(COLORS.bg).setAlpha(0));
      this.tweens.add({ targets: mist, alpha: night ? 0.35 : 0.55, duration: 2400, delay, yoyo: true, hold: 5200, repeat: -1, repeatDelay: 400 });
      this.tweens.add({ targets: mist, x: to, duration: 10000, delay, repeat: -1 });
    }
    // 下方淡入纸色，进度条压在上面才看得清
    const fadeH = Math.min(560, H * 0.38);
    keep(this.add.image(0, H - fadeH, TEX.fade).setOrigin(0, 0).setDisplaySize(W, fadeH).setTint(COLORS.bg));

    // 标题：书法从左往右写出来，写完盖一方朱印
    // 标题和副题放在画面上方的留白里，压在山顶之上
    const titleY = layout.safeTop + Math.max(150, H * 0.12);
    if (hasImage(this, ASSET_KEYS.title)) {
      const title = keep(this.add.image(cx, titleY, ASSET_KEYS.title).setTint(parseInt(TEXT_COLORS.title.slice(1), 16)));
      title.setScale(Math.min(560 / title.width, 170 / title.height));
      const write = { t: 0 };
      title.setCrop(0, 0, 0, title.height);
      this.tweens.add({
        targets: write,
        t: 1,
        duration: 1100,
        delay: 300,
        ease: 'Sine.easeInOut',
        onUpdate: () => title.setCrop(0, 0, title.width * write.t, title.height),
      });
      const sealX = cx + title.displayWidth / 2 + 12;
      const seal = keep(this.add.image(sealX, titleY + title.displayHeight * 0.42, TEX.white).setDisplaySize(46, 46).setTint(COLORS.seal));
      const sealText = keep(text(sealX, seal.y, '道', 30, '#f4ecd8', true));
      for (const o of [seal, sealText]) {
        o.setAngle(-6).setAlpha(0);
        const s = o.scale;
        o.setScale(s * 1.7);
        this.tweens.add({ targets: o, alpha: 0.92, scale: s, duration: 240, delay: 1450, ease: 'Back.easeOut' });
      }
    } else {
      const title = keep(text(cx, titleY + 12, '问道长生', 76, TEXT_COLORS.title, true).setAlpha(0));
      this.tweens.add({ targets: title, alpha: 1, y: titleY, duration: 520, ease: 'Quad.easeOut' });
    }
    const sub = keep(text(cx, titleY + 104, '寿元有限，仙路漫漫', 26, TEXT_COLORS.dim).setAlpha(0));
    this.tweens.add({ targets: sub, alpha: 1, duration: 600, delay: 1200 });

    // 进度：一条细墨线，上面叠一道飞白笔触，笔头是一点朱砂
    this.barW = Math.min(360, W - 160);
    this.barX = cx - this.barW / 2;
    const barY = H - layout.safeBottom - Math.max(150, H * 0.11);
    const track = keep(this.add.image(this.barX, barY, TEX.white).setOrigin(0, 0.5).setDisplaySize(this.barW, 2).setTint(COLORS.line).setAlpha(0));
    this.barLine = keep(this.add.image(this.barX, barY, TEX.white).setOrigin(0, 0.5).setDisplaySize(4, 3).setTint(COLORS.ink2).setAlpha(0.7));
    this.barFill = keep(this.add.image(this.barX, barY, TEX.brush).setOrigin(0, 0.5).setDisplaySize(4, 22).setTint(COLORS.ink2).setAlpha(0.9));
    this.barHead = keep(this.add.image(this.barX, barY, TEX.spark).setDisplaySize(42, 42).setTint(COLORS.bar).setAlpha(0.5));
    this.hintText = keep(text(cx, barY + 46, BOOT_HINTS[0], 24, TEXT_COLORS.dim).setAlpha(0));
    this.tweens.add({ targets: track, alpha: 0.32, duration: 500, delay: 400 });
    this.tweens.add({ targets: this.hintText, alpha: 1, duration: 500, delay: 600 });
    this.all = objs;

    // 按文件数算的进度是一批一批跳的，用正在下载的文件字节数补平
    this.load.on('progress', () => this.refreshTarget());
    this.load.on('fileprogress', () => this.refreshTarget());
    this.load.once('complete', () => this.finish());
    // 场景的 update() 要等 create() 之后才会被调用，加载中靠这个事件逐帧推进
    this.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
    preloadImages(this);
  }

  private tick(_time: number, delta: number): void {
    if (this.done) return;
    // 追赶式进度：素材瞬间加载完时笔迹也是划过去的，不会直接闪到终点
    this.shown += (this.target - this.shown) * Math.min(1, delta / 120);
    if (this.target - this.shown < 0.002) this.shown = this.target;
    const w = Math.max(3, this.barW * this.shown);
    this.barLine.setDisplaySize(w, 3);
    this.barFill.setDisplaySize(w, 22);
    this.barHead.setX(this.barX + w);
    if (this.finishing) return;
    this.hintMs += delta;
    if (this.hintMs > HINT_MS) {
      this.hintMs = 0;
      this.nextHint();
    }
  }

  create(): void {
    audio.init(this.game);
    generateInkTextures(this);
    // 记下首次游玩时间：插屏广告对新玩家有半小时保护期
    touchAdLedger(this);
    loadAudioInBackground(this, () => audio.refreshBgm());
    // 收笔动画放完再进游戏，别让加载页硬切走
    // 先过门口（安卓：隐私政策、TapTap 登录与防沉迷；网页、微信直接放行），再进主界面或开局
    this.onReady = () => this.scene.launch('Gate');
    if (this.ready) this.onReady();
  }

  /** 已完成的文件 + 正在下载的文件的字节占比，算出一个连续的进度 */
  private refreshTarget(): void {
    // create() 之后台还会继续加载音频，别让它把已经收笔的进度条打回零
    if (this.finishing) return;
    const total = this.load.totalToLoad || 1;
    let partial = 0;
    for (const f of this.load.inflight) partial += f.percentComplete || 0;
    this.target = Math.min(1, (this.load.totalComplete + partial) / total);
  }

  /** 换一句文案：淡出、换字、淡入 */
  private nextHint(): void {
    const t = this.hintText;
    this.tweens.add({
      targets: t,
      alpha: 0,
      duration: 170,
      yoyo: true,
      onYoyo: () => {
        this.hintIndex = (this.hintIndex + 1) % BOOT_HINTS.length;
        t.setText(BOOT_HINTS[this.hintIndex]);
      },
    });
  }

  private finish(): void {
    if (this.finishing) return;
    this.finishing = true;
    this.target = 1;
    // 加载太快时等一下，让入场动画走完
    const wait = Math.max(0, MIN_BOOT_MS - (performance.now() - this.startedAt));
    this.time.delayedCall(wait, () => {
      this.hintText.setText('墨已入纸');
      this.hintText.setColor(TEXT_COLORS.gold);
      // 笔头亮一下，墨迹淡出，然后进场
      this.tweens.add({ targets: this.barHead, scaleX: this.barHead.scaleX * 2.4, scaleY: this.barHead.scaleY * 2.4, alpha: 0, duration: 420 });
      this.tweens.add({
        targets: this.all,
        alpha: 0,
        duration: 320,
        delay: 170,
        onComplete: () => {
          this.done = true;
          this.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
          for (const o of this.all) o.destroy();
          this.all = [];
          this.ready = true;
          this.onReady?.();
        },
      });
    });
  }
}

export interface StartOptions {
  platform: Platform;
  /** 网页：挂载的 DOM 容器 id */
  parent?: string;
  /** 微信：主画布 */
  canvas?: HTMLCanvasElement;
}

export function startGame({ platform, parent, canvas }: StartOptions): Phaser.Game {
  const screen = platform.screen();
  const insets = platform.safeInsets();
  // 画布按物理像素创建，保证文字清晰；场景内统一用 750 宽的设计坐标
  const pw = Math.round(screen.width * screen.dpr);
  const ph = Math.round(screen.height * screen.dpr);
  const zoom = pw / DESIGN_W;
  const cssToDesign = DESIGN_W / screen.width;
  const layout: Layout = {
    zoom,
    width: DESIGN_W,
    height: ph / zoom,
    safeTop: Math.ceil(insets.top * cssToDesign),
    safeBottom: Math.ceil(insets.bottom * cssToDesign),
  };

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    width: pw,
    height: ph,
    backgroundColor: COLORS.bg,
    parent,
    canvas,
    customEnvironment: platform.name === 'wechat',
    banner: false,
    // 文字游戏不需要 60 帧，限到 30 帧省电、手机不发烫（动画都按时间算，速度不受影响）
    fps: { target: 30, limit: 30 },
    scale: canvas
      ? { mode: Phaser.Scale.NONE }
      : { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // 微信端暂不接音频，也没有鼠标。不能传 undefined，Phaser 会当成已配置
    ...(canvas ? { audio: { noAudio: true }, input: { mouse: false } } : {}),
    scene: [BootScene, GateScene, CreateScene, MainScene, RebirthScene],
    callbacks: {
      preBoot: (g) => {
        g.registry.set('platform', platform);
        g.registry.set('layout', layout);
      },
    },
  });
  return game;
}
