import { fmtNum } from '../core/game';
import Phaser from 'phaser';
import { hasImage } from './assets';
import { pillEdgeTex, pillTex, SLICE, TEX } from './ink';
import { COLORS, DESIGN_W, TEXT_COLORS } from './theme';
import { getLayout, makeText } from './ui';

export interface InkShow {
  title: string;
  subtitle?: string;
  /** 墨晕颜色 */
  tint: number;
  /** 墨晕浓度 */
  blotAlpha?: number;
  titleColor?: string;
  /** 停留时长（毫秒） */
  hold?: number;
  /** 插图的纹理 key（有素材时才显示） */
  image?: string;
  /** 副标题下方的数字递增，如"修为 +0"→"修为 +720" */
  counter?: { label: string; to: number };
  /** 快速版：入场更快，用于闭关这类频繁操作 */
  quick?: boolean;
}

/** 浮动提示：图标（可选）+ 文字 */
export interface Toast {
  text: string;
  color: string;
  icon?: string;
}

/**
 * 覆盖层：用一台最后添加的相机渲染，保证盖在所有滚动区域之上。
 * 必须在场景的其它相机都创建之后再创建。
 */
export class Overlay {
  /** 覆盖层内容在世界坐标中的横向偏移（远离其它内容） */
  readonly ox = -20000;
  readonly cam: Phaser.Cameras.Scene2D.Camera;
  /** 排队播放的演出：墨晕转场，或自定义演出（如战斗回放，播完调用 done） */
  private queue: (InkShow | ((done: () => void) => void))[] = [];
  private playing = false;
  private toastQueue: Toast[] = [];
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  /** 正在显示的提示条数，用来往下错开 */
  private toastSlots = 0;

  constructor(private scene: Phaser.Scene) {
    const { zoom, height } = getLayout(scene);
    this.cam = scene.cameras
      .add(0, 0, Math.round(DESIGN_W * zoom), Math.round(height * zoom))
      .setOrigin(0, 0)
      .setZoom(zoom)
      .setScroll(this.ox, 0);
  }

  get busy(): boolean {
    return this.playing;
  }

  /** 播放墨晕转场，多个按顺序排队 */
  show(s: InkShow): void {
    this.queue.push(s);
    if (!this.playing) this.next();
  }

  /** 排入一段自定义演出 */
  custom(run: (done: () => void) => void): void {
    this.queue.push(run);
    if (!this.playing) this.next();
  }

  private next(): void {
    const s = this.queue.shift();
    if (!s) {
      this.playing = false;
      return;
    }
    this.playing = true;
    if (typeof s === 'function') return s(() => this.next());
    const scene = this.scene;
    const { height: H } = getLayout(scene);
    const W = DESIGN_W;
    const x0 = this.ox;

    const shade = scene.add.image(x0, 0, TEX.white).setOrigin(0, 0).setDisplaySize(W, H).setTint(COLORS.bg).setAlpha(0).setDepth(1000);
    const blot = scene.add.image(x0 + W / 2, H / 2, TEX.blot).setTint(s.tint).setAlpha(s.blotAlpha ?? 0.6).setScale(0.05).setDepth(1001);
    const q = s.quick ? 0.55 : 1;
    const title = makeText(scene, x0 + W / 2, H / 2 - 40, s.title, { size: 64, color: s.titleColor ?? TEXT_COLORS.title, bold: true, scale: 1 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(1002);
    const sub = s.subtitle
      ? makeText(scene, x0 + W / 2, H / 2 + 30, s.subtitle, { size: 28, color: TEXT_COLORS.normal, wrap: W - 140, align: 'center', scale: 1 })
          .setOrigin(0.5, 0)
          .setAlpha(0)
          .setDepth(1002)
      : null;
    // 盖住下面的按钮，点击可跳过
    const zone = scene.add.zone(x0, 0, W, H).setOrigin(0, 0).setInteractive().setDepth(1003);
    /** 渐显、渐隐的内容：标题、副标题、插图 */
    const texts: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = sub ? [title, sub] : [title];
    if (s.image && hasImage(scene, s.image)) {
      // 插图放在标题上方，等比缩放进 690×460 的框
      const img = scene.add.image(x0 + W / 2, H / 2 - 100, s.image).setOrigin(0.5, 1).setAlpha(0).setDepth(1002).setTint(COLORS.artTint);
      img.setScale(Math.min(690 / img.width, 460 / img.height));
      texts.push(img);
    }
    if (s.counter) {
      const { label, to } = s.counter;
      const y = sub ? H / 2 + 30 + sub.height + 16 : H / 2 + 40;
      const num = makeText(scene, x0 + W / 2, y, `${label} +0`, { size: 40, color: TEXT_COLORS.good, bold: true, scale: 1 })
        .setOrigin(0.5, 0)
        .setAlpha(0)
        .setDepth(1002);
      texts.push(num);
      scene.tweens.addCounter({
        from: 0, to, duration: 700 * q, delay: 450 * q, ease: 'Cubic.easeOut',
        onUpdate: (tw) => num.setText(`${label} +${fmtNum(tw.getValue() ?? 0)}`),
      });
    }
    const all = [shade, blot, ...texts, zone];

    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      scene.tweens.killTweensOf([shade, blot, ...texts]);
      scene.tweens.add({
        targets: [shade, blot, ...texts],
        alpha: 0,
        duration: 350,
        onComplete: () => {
          for (const o of all) o.destroy();
          this.next();
        },
      });
    };
    zone.on('pointerup', close);

    scene.tweens.add({ targets: shade, alpha: 0.88, duration: 300 * q });
    scene.tweens.add({ targets: blot, scale: 3.6, duration: 900 * q, ease: 'Cubic.easeOut' });
    scene.tweens.add({ targets: texts, alpha: 1, duration: 450 * q, delay: 350 * q });
    scene.time.delayedCall((350 + 450) * q + (s.hold ?? 1100), close);
  }

  /** 浮动提示：从状态栏下方依次弹出、上飘、淡出。多条排队错开出现 */
  toast(t: Toast, top: number): void {
    this.toastQueue.push(t);
    if (this.toastTimer) return;
    const pop = () => {
      // 全屏转场播放时先等着，免得提示被盖住
      if (this.playing) {
        this.toastTimer = this.scene.time.delayedCall(150, pop);
        return;
      }
      const next = this.toastQueue.shift();
      if (!next) {
        this.toastTimer = null;
        return;
      }
      this.popToast(next, top);
      this.toastTimer = this.scene.time.delayedCall(220, pop);
    };
    pop();
  }

  private popToast(t: Toast, top: number): void {
    const scene = this.scene;
    const iconSize = 44;
    const hasIcon = !!t.icon && hasImage(scene, t.icon);
    // 长句（如"修为尚浅"之类的说明）折行显示
    const maxText = DESIGN_W - 48 - 48 - (hasIcon ? iconSize + 10 : 0);
    const label = makeText(scene, 0, 0, t.text, { size: 26, color: t.color, bold: true, scale: 1, wrap: maxText });
    const h = Math.max(56, label.height + 22);
    const slots = Math.ceil(h / 64);
    const slot = this.toastSlots % 4;
    this.toastSlots += slots;
    const y = top + 18 + slot * 64;
    const w = label.width + 48 + (hasIcon ? iconSize + 10 : 0);
    const x = this.ox + DESIGN_W - 24 - w;
    const bg = scene.add
      .nineslice(x, y, pillTex(scene, h), undefined, w, h, h / 2, h / 2, 0, 0)
      .setOrigin(0, 0)
      .setTint(COLORS.panel)
      .setAlpha(0.94)
      .setDepth(950);
    const border = scene.add
      .nineslice(x, y, pillEdgeTex(scene, h), undefined, w, h, h / 2, h / 2, 0, 0)
      .setOrigin(0, 0)
      .setTint(COLORS.btnBorder)
      .setAlpha(0.8)
      .setDepth(950);
    const parts: (Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.NineSlice)[] = [bg, border, label];
    let tx = x + 24;
    if (hasIcon) {
      parts.push(scene.add.image(tx, y + 28, t.icon!).setOrigin(0, 0.5).setDisplaySize(iconSize, iconSize).setDepth(951));
      tx += iconSize + 10;
    }
    label.setPosition(tx, y + h / 2).setOrigin(0, 0.5).setDepth(951);
    for (const o of parts) o.setAlpha(0).x += 40;
    scene.tweens.add({ targets: parts, alpha: 1, x: '-=40', duration: 220, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: parts, alpha: 0, y: '-=24', duration: 400, delay: t.text.length > 12 ? 2600 : 1500,
      onComplete: () => {
        for (const o of parts) o.destroy();
        this.toastSlots = Math.max(0, this.toastSlots - slots);
      },
    });
  }

  /** 朱砂印章：从大到小"盖"下来，停留后淡出，不拦截点击 */
  stamp(char: string, cy: number): void {
    const scene = this.scene;
    const S = 150;
    const cx = this.ox + DESIGN_W - 40 - S / 2;
    const g = scene.add
      .nineslice(-S / 2, -S / 2, TEX.btn, undefined, S, S, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
      .setOrigin(0, 0)
      .setTint(COLORS.seal);
    const inner = scene.add
      .nineslice(-S / 2 + 10, -S / 2 + 10, TEX.edge, undefined, S - 20, S - 20, SLICE.btn, SLICE.btn, SLICE.btn, SLICE.btn)
      .setOrigin(0, 0)
      .setTint(0xffffff)
      .setAlpha(0.85);
    const t = makeText(scene, 0, 0, char, { size: 92, color: '#fff8ee', bold: true, scale: 1 }).setOrigin(0.5);
    const seal = scene.add.container(cx, cy, [g, inner, t]).setDepth(960).setScale(2.4).setAlpha(0).setAngle(-14);
    scene.tweens.add({ targets: seal, scale: 1, alpha: 1, angle: -8, duration: 260, ease: 'Back.easeIn' });
    scene.tweens.add({ targets: seal, alpha: 0, duration: 500, delay: 1500, onComplete: () => seal.destroy() });
  }
}

/** 所有相机一起震动（主界面有多台相机） */
export function shakeAll(scene: Phaser.Scene, duration = 260, intensity = 0.006): void {
  // 只震可见的相机：隐藏相机的特效不会更新，会一直挂着，等切到那个页签才补播
  for (const cam of scene.cameras.cameras) if (cam.visible) cam.shake(duration, intensity);
}

/** 用 0xRRGGBB 颜色闪一下 */
export function flash(cam: Phaser.Cameras.Scene2D.Camera, color: number, duration = 220): void {
  cam.flash(duration, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
}
