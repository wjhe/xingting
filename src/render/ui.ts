import Phaser from 'phaser';
import type { Platform } from '../platform/types';
import { audio, type Sfx } from './audio';
import { SLICE, TEX } from './ink';
import { settings } from './settings';
import { COLORS, DESIGN_W, FONT, FONT_FAMILY, TEXT_COLORS } from './theme';
import { wrapCJK } from './wrap';

export interface Layout {
  /** 设计坐标 → 物理像素的缩放倍数 */
  zoom: number;
  /** 设计坐标下的屏幕宽高 */
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
}

export function getLayout(scene: Phaser.Scene): Layout {
  return scene.registry.get('layout') as Layout;
}

export function getPlatform(scene: Phaser.Scene): Platform {
  return scene.registry.get('platform') as Platform;
}

/** 主相机按设计坐标缩放，场景内所有坐标都用 750 宽的设计坐标 */
export function setupCamera(scene: Phaser.Scene): Layout {
  const layout = getLayout(scene);
  scene.cameras.main.setOrigin(0, 0).setZoom(layout.zoom).setBackgroundColor(COLORS.bg);
  return layout;
}

/** 宣纸底纹铺满全屏；mountains 为真时在顶部叠一层远山 */
export function addBackdrop(scene: Phaser.Scene, opts: { mountains?: boolean; mountainY?: number } = {}): void {
  const { height } = getLayout(scene);
  scene.add.tileSprite(0, 0, DESIGN_W, height, TEX.paper).setOrigin(0, 0).setTint(COLORS.fiber).setAlpha(0.9);
  if (opts.mountains) {
    scene.add.image(0, opts.mountainY ?? 0, TEX.mountains).setOrigin(0, 0).setTint(COLORS.mountain).setAlpha(0.85);
  }
}

/** 从 y 往下铺一段宣纸底纹（盖在纯色遮罩上） */
export function addBackdropPaper(scene: Phaser.Scene, y: number): void {
  const { height } = getLayout(scene);
  scene.add.tileSprite(0, y, DESIGN_W, height - y, TEX.paper).setOrigin(0, 0).setTint(COLORS.fiber).setAlpha(0.9);
}

/** 毛笔横线，用作分隔装饰 */
export function addBrushLine(scene: Phaser.Scene, x: number, y: number, width: number, alpha = 0.5) {
  return scene.add.image(x, y, TEX.brush).setOrigin(0, 0.5).setDisplaySize(width, 14).setTint(COLORS.btnBorder).setAlpha(alpha);
}

export interface TextOpts {
  size?: number;
  color?: string;
  /** 换行宽度（设计坐标），不传则不换行 */
  wrap?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  lineSpacing?: number;
  /** 字号缩放倍数，默认取设置里的字号 */
  scale?: number;
}

export function makeText(scene: Phaser.Scene, x: number, y: number, text: string, opts: TextOpts = {}) {
  const { zoom } = getLayout(scene);
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT_FAMILY,
    fontSize: `${Math.round((opts.size ?? FONT.body) * (opts.scale ?? settings.fontScale))}px`,
    fontStyle: opts.bold ? 'bold' : 'normal',
    color: opts.color ?? TEXT_COLORS.normal,
    align: opts.align ?? 'left',
    // 文字纹理按物理像素渲染，避免高分屏发虚
    resolution: Math.ceil(zoom * 2) / 2,
    lineSpacing: opts.lineSpacing ?? 8,
  };
  if (opts.wrap) {
    const width = opts.wrap;
    style.wordWrap = {
      width,
      callback: (str: string, obj: Phaser.GameObjects.Text) =>
        wrapCJK(str, (s) => obj.context.measureText(s).width, width),
    };
  }
  return scene.add.text(x, y, text, style);
}

export interface ButtonOpts {
  primary?: boolean;
  size?: number;
  /** 点击音效，默认 click；传 null 不响 */
  sound?: Sfx | null;
  /** 界面图标的纹理 key（有素材时显示）；layout 决定图标在文字左边还是上面 */
  icon?: string;
  iconLayout?: 'left' | 'top';
  /** 扁平样式：不画底色和边框，只有图标和文字（用于底部导航） */
  plain?: boolean;
}

/** 毛笔描边框（AI 生成，九宫格拉伸） */
const FRAME_KEY = 'ui_frame_brush';
const FRAME_SLICE = 22;

/**
 * 圆角按钮。点击判定在抬起时进行，且手指移动不超过阈值，避免滑动日志时误触。
 */
export class Button {
  readonly label: Phaser.GameObjects.Text;
  readonly zone: Phaser.GameObjects.Zone;
  /** 有毛笔框时的底色：框内一块纯色方块 */
  private fill: Phaser.GameObjects.Image;
  /** 没有毛笔框（或 flat 样式）时的圆角底 */
  private round: Phaser.GameObjects.NineSlice;
  /** 没有毛笔框时的双线边框 */
  private edge: Phaser.GameObjects.NineSlice | null = null;
  private frame: Phaser.GameObjects.NineSlice | null = null;
  private icon: Phaser.GameObjects.Image | null = null;
  private enabled = true;
  private visible = true;
  private baseSize: number;
  /** 文字可用宽度 */
  private textW: number;

  constructor(
    scene: Phaser.Scene,
    private x: number,
    private y: number,
    private w: number,
    private h: number,
    text: string,
    onClick: () => void,
    private opts: ButtonOpts = {},
  ) {
    // 底色和边框都用图片：和文字、立绘同一条渲染管线，能合批（Graphics 会打断合批）
    this.fill = scene.add.image(x + 6, y + 6, TEX.white).setOrigin(0, 0).setDisplaySize(w - 12, h - 12);
    this.round = scene.add
      .nineslice(x, y, TEX.btn, undefined, w, h, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
      .setOrigin(0, 0);
    // 按钮尺寸固定，字号放大有上限，避免文字溢出
    const scale = Math.min(settings.fontScale, 1.1);
    this.baseSize = Math.round((opts.size ?? FONT.button) * scale);
    this.label = makeText(scene, x + w / 2, y + h / 2, text, { size: opts.size ?? FONT.button, align: 'center', scale }).setOrigin(0.5);
    this.textW = w - 32;
    if (!opts.plain && scene.textures.exists(FRAME_KEY)) {
      // 按两倍尺寸拉伸再缩小一半，笔触粗细减半、质感保留
      this.frame = scene.add
        .nineslice(x, y, FRAME_KEY, undefined, w * 2, h * 2, FRAME_SLICE, FRAME_SLICE, FRAME_SLICE, FRAME_SLICE)
        .setOrigin(0, 0)
        .setScale(0.5);
    }
    if (opts.icon && scene.textures.exists(opts.icon)) {
      if (opts.iconLayout === 'top') {
        const size = Math.min(h * 0.46, 44);
        this.icon = scene.add.image(x + w / 2, y + 8 + size / 2, opts.icon).setDisplaySize(size, size);
        this.label.setY(y + h - 8).setOrigin(0.5, 1);
      } else {
        const size = Math.min(h * 0.55, 52);
        this.icon = scene.add.image(x + 16 + size / 2, y + h / 2, opts.icon).setDisplaySize(size, size);
        this.label.setX(x + 16 + size + (w - 16 - size) / 2 - 4);
        this.textW = w - 16 - size - 24;
      }
    }
    this.fit();
    this.zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    this.draw(false);

    const { zoom } = getLayout(scene);
    this.zone.on('pointerdown', () => this.enabled && this.draw(true));
    this.zone.on('pointerout', () => this.draw(false));
    this.zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.draw(false);
      const moved = Math.hypot(p.upX - p.downX, p.upY - p.downY);
      if (this.enabled && moved < 24 * zoom) {
        const snd = this.opts.sound === undefined ? 'click' : this.opts.sound;
        if (snd) audio.sfx(snd);
        onClick();
      }
    });
  }

  /** 按钮区域（设计坐标），用于新手引导高亮 */
  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  setText(text: string): this {
    this.label.setText(text);
    this.fit();
    return this;
  }

  /** 弹跳一下（如物品飞入行囊时） */
  /** 各对象的原始缩放；连续 pulse 时总是从这里起跳，不会越叠越大 */
  private baseScale = new Map<Phaser.GameObjects.Components.Transform, { x: number; y: number }>();

  pulse(): void {
    const tweens = this.label.scene.tweens;
    for (const o of [this.label, this.icon]) {
      if (!o) continue;
      let base = this.baseScale.get(o);
      if (!base) this.baseScale.set(o, (base = { x: o.scaleX, y: o.scaleY }));
      tweens.killTweensOf(o);
      o.setScale(base.x, base.y);
      tweens.add({ targets: o, scaleX: base.x * 1.3, scaleY: base.y * 1.3, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  get center() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  setPrimary(primary: boolean): this {
    this.opts.primary = primary;
    this.draw(false);
    return this;
  }

  /** 只调图标的透明度（如导航页签上锁时变暗） */
  setIconAlpha(alpha: number): this {
    this.icon?.setAlpha(alpha);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.label.setColor(enabled ? TEXT_COLORS.normal : TEXT_COLORS.dim);
    this.draw(false);
    return this;
  }

  setVisible(visible: boolean): this {
    if (visible === this.visible) return this;
    this.visible = visible;
    if (!visible) {
      this.fill.setVisible(false);
      this.round.setVisible(false);
      this.edge?.setVisible(false);
    } else {
      this.draw(false);
    }
    this.frame?.setVisible(visible);
    this.icon?.setVisible(visible);
    this.label.setVisible(visible);
    this.zone.setVisible(visible);
    if (visible) this.zone.setInteractive();
    else this.zone.disableInteractive();
    return this;
  }

  destroy(): void {
    this.fill.destroy();
    this.round.destroy();
    this.edge?.destroy();
    this.frame?.destroy();
    this.icon?.destroy();
    this.label.destroy();
    this.zone.destroy();
  }

  /**
   * 让文字放进按钮：先单行缩小（最多到 85%），放不下就换成两行，仍放不下再继续缩小。
   */
  private fit(): void {
    const t = this.label;
    const maxW = this.textW;
    const lines = (n: number) => wrapCJK(t.text, (s) => t.context.measureText(s).width, maxW).length <= n;
    const setSize = (px: number) => t.setFontSize(px);
    // 常见情况：没被缩放、没换行、本来就放得下，直接返回，不再重绘文字
    const untouched = t.style.fontSize === `${this.baseSize}px` && !t.style.wordWrapCallback && !t.text.includes('\n');
    if (untouched && t.width <= maxW) return;
    // 先取消换行，按单行测量
    if (t.style.wordWrapCallback) t.setWordWrapCallback(null as never);
    let size = this.baseSize;
    setSize(size);
    if (t.width <= maxW) return;
    const min1 = Math.round(this.baseSize * 0.85);
    while (size > min1 && t.width > maxW) setSize(--size);
    if (t.width <= maxW) return;
    // 换两行：按钮高度允许时才换
    const twoLines = this.h >= 64;
    size = this.baseSize;
    setSize(size);
    // 末尾有括号提示（如"（灵石不足）"）时，提示单独放第二行，不在中间断开
    const cut = t.text.lastIndexOf('（');
    if (twoLines && cut > 0 && !t.text.includes('\n')) {
      t.setText(`${t.text.slice(0, cut)}\n${t.text.slice(cut)}`);
      const fits = () => t.width <= maxW && t.height <= this.h - 14;
      while (size > 18 && !fits()) setSize(--size);
      if (fits()) return;
      t.setText(t.text.replace('\n', ''));
      size = this.baseSize;
      setSize(size);
    }
    t.setWordWrapCallback((str: string) => wrapCJK(str, (s) => t.context.measureText(s).width, maxW));
    while (size > 16 && (!lines(twoLines ? 2 : 1) || t.height > this.h - 14)) setSize(--size);
  }

  private draw(pressed: boolean): void {
    const fill = this.opts.primary ? COLORS.btnPrimary : COLORS.btn;
    const a = this.enabled ? 1 : 0.35;
    this.icon?.setTint(this.enabled ? (this.opts.primary ? COLORS.seal : COLORS.ink2) : COLORS.btnBorder).setAlpha(a);
    if (this.opts.plain) {
      // 只给一个很淡的按下反馈
      this.fill.setVisible(false);
      this.edge?.setVisible(false);
      this.round.setVisible(pressed);
      if (pressed) this.round.setTint(COLORS.btn).setAlpha(0.6);
      return;
    }
    if (this.frame) {
      // 毛笔框：底色略内缩，框线压在上面
      this.round.setVisible(false);
      this.edge?.setVisible(false);
      this.fill.setVisible(true).setTint(fill).setAlpha(this.enabled ? (pressed ? 0.6 : 0.92) : 0.4);
      this.frame.setTint(COLORS.btnBorder).setAlpha(this.enabled ? (pressed ? 0.6 : 0.95) : 0.3);
      return;
    }
    this.fill.setVisible(false);
    this.round.setVisible(true).setTint(fill).setAlpha(this.enabled ? (pressed ? 0.6 : 0.92) : 0.4);
    if (!this.edge) {
      this.edge = this.label.scene.add
        .nineslice(this.x, this.y, TEX.btnEdge, undefined, this.w, this.h, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
        .setOrigin(0, 0);
      this.edge.setDepth(this.round.depth);
    }
    this.edge.setVisible(true).setTint(COLORS.btnBorder).setAlpha(this.enabled ? 0.85 : 0.25);
  }
}

interface Destroyable {
  destroy(): void;
}

/**
 * 可拖动滚动的区域。内容放在世界坐标 originX 处（远离主界面），由单独的相机显示并裁剪。
 * 内容坐标：x 从 originX 开始，宽 750；y 从 0 开始。
 */
export class ScrollView {
  readonly cam: Phaser.Cameras.Scene2D.Camera;
  contentHeight = 0;
  private items: Destroyable[] = [];
  private top = 0;
  private height = 0;
  private dragging = false;

  constructor(
    private scene: Phaser.Scene,
    readonly originX: number,
    top: number,
    height: number,
  ) {
    const { zoom } = getLayout(scene);
    this.cam = scene.cameras.add(0, 0, 1, 1).setOrigin(0, 0).setZoom(zoom).setScroll(originX, 0);
    this.setViewport(top, height);

    const inside = (p: Phaser.Input.Pointer) => this.cam.visible && p.y / zoom >= this.top && p.y / zoom <= this.top + this.height;
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.dragging = inside(p)));
    scene.input.on('pointerup', () => (this.dragging = false));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && this.dragging) this.scrollBy((p.prevPosition.y - p.y) / zoom);
    });
    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (inside(p)) this.scrollBy(dy * 0.6);
    });
  }

  setViewport(top: number, height: number): void {
    const { zoom, width } = getLayout(this.scene);
    this.top = top;
    this.height = height;
    this.cam.setViewport(0, Math.round(top * zoom), Math.round(width * zoom), Math.round(height * zoom));
    this.scrollBy(0);
  }

  add<T extends Destroyable>(obj: T): T {
    this.items.push(obj);
    return obj;
  }

  clear(): void {
    for (const it of this.items) it.destroy();
    this.items = [];
    this.contentHeight = 0;
  }

  setVisible(visible: boolean): void {
    this.cam.setVisible(visible);
  }

  /** 让内容里 [y0, y1] 这一段完整出现在可视区域内（只在需要时滚动） */
  reveal(y0: number, y1: number): void {
    const view = this.height;
    if (y1 - this.cam.scrollY > view) this.cam.scrollY = y1 - view + 12;
    if (y0 < this.cam.scrollY) this.cam.scrollY = Math.max(0, y0 - 12);
    this.scrollBy(0);
  }

  scrollBy(dy: number): void {
    const max = Math.max(0, this.contentHeight + 24 - this.height);
    this.cam.scrollY = Phaser.Math.Clamp(this.cam.scrollY + dy, 0, max);
  }

  /** 滚动到内容的某个 y 位置（会被限制在可滚动范围内） */
  scrollTo(y: number): void {
    this.cam.scrollY = y;
    this.scrollBy(0);
  }

  scrollToTop(): void {
    this.cam.scrollY = 0;
  }

  scrollToBottom(): void {
    this.cam.scrollY = Infinity;
    this.scrollBy(0);
  }
}
