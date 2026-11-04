import Phaser from 'phaser';
import type { Signal } from '../core/game';
import { ASSET_KEYS, hasImage } from './assets';
import { audio } from './audio';
import { shakeAll } from './fx';
import { TEX } from './ink';
import { settings } from './settings';
import { COLORS, DESIGN_W, TEXT_COLORS } from './theme';
import { getLayout, makeText } from './ui';

type RealmSignal = Extract<Signal, { type: 'realm' }>;
type Obj = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.Depth;

const GOLD = 0xd9b45a;
const DEPTH = 1100;

/**
 * 突破大境界的演出：四方灵气汇聚 → 破境（闪光、冲击波、光芒）→ 境界插图与标题显化。
 * 点击：汇聚中跳到破境，显化后关闭。
 */
export class RealmView {
  private objs: Obj[] = [];
  /** 汇聚阶段的灵气粒子，跳过时直接清掉 */
  private motes: Obj[] = [];
  private burstTimer: Phaser.Time.TimerEvent | null = null;
  private bursted = false;
  private finished = false;
  private closed = false;
  private shade!: Obj;
  private cx = 0;
  private cy = 0;

  constructor(
    private scene: Phaser.Scene,
    private ox: number,
    private s: RealmSignal,
    /** 寿元上限（显示在副标题） */
    private lifespan: number,
    /** 引气入体这种起步境界用短版 */
    private quick: boolean,
    private done: () => void,
  ) {}

  play(): void {
    const sc = this.scene;
    const { height: H } = getLayout(sc);
    const W = DESIGN_W;
    this.cx = this.ox + W / 2;
    this.cy = H * 0.4;
    const night = settings.theme === 'night';

    this.add(sc.add.image(this.ox, 0, TEX.white).setOrigin(0, 0).setDisplaySize(W, H).setTint(COLORS.bg));
    this.add(sc.add.tileSprite(this.ox, 0, W, H, TEX.paper).setOrigin(0, 0).setTint(COLORS.fiber).setAlpha(0.8));
    // 天地变色：汇聚时整屏压暗，破境时一下亮开
    this.shade = this.add(sc.add.image(this.ox, 0, TEX.white).setOrigin(0, 0).setDisplaySize(W, H).setTint(night ? 0x000000 : COLORS.ink).setAlpha(0));
    sc.tweens.add({ targets: this.shade, alpha: night ? 0.6 : 0.72, duration: this.quick ? 400 : 700, ease: 'Quad.easeOut' });
    const zone = this.add(sc.add.zone(this.ox, 0, W, H).setOrigin(0, 0).setInteractive());
    zone.on('pointerup', () => (this.finished ? this.close() : this.skip()));

    // 汇聚：灵气从四方涌向丹田，中心的光越聚越亮
    const gather = this.quick ? 800 : 1500;
    const core = this.add(sc.add.image(this.cx, this.cy, TEX.spark).setDisplaySize(70, 70).setTint(GOLD).setAlpha(0.3));
    this.motes.push(core);
    sc.tweens.add({ targets: core, scale: core.scale * 5, alpha: 1, duration: gather, ease: 'Quad.easeIn' });
    // 灵气是一道道拖着尾巴的笔触，头朝丹田飞去
    const n = this.quick ? 26 : 44;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 420 + Math.random() * 320;
      const len = 60 + Math.random() * 90;
      const m = this.add(
        sc.add
          .image(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, TEX.brush)
          .setOrigin(0, 0.5)
          .setDisplaySize(len, 6 + Math.random() * 8)
          .setAngle((a * 180) / Math.PI)
          .setTint(GOLD)
          .setAlpha(0),
      );
      this.motes.push(m);
      const delay = Math.random() * gather * 0.65;
      sc.tweens.add({ targets: m, alpha: 0.95, duration: 160, delay });
      sc.tweens.add({ targets: m, x: this.cx, y: this.cy, scaleX: m.scaleX * 0.2, duration: gather - delay, delay, ease: 'Cubic.easeIn' });
    }
    if (!this.quick) shakeAll(sc, gather, 0.002);
    audio.sfx('travel');
    for (const o of this.objs) o.setDepth(DEPTH);
    this.burstTimer = sc.time.delayedCall(gather, () => this.burst());
  }

  /** 破境：闪光、冲击波、四射的光芒，随后显化境界 */
  private burst(): void {
    if (this.bursted) return;
    this.bursted = true;
    const sc = this.scene;
    const { height: H } = getLayout(sc);
    const W = DESIGN_W;
    const { cx, cy } = this;
    for (const m of this.motes) m.destroy();
    this.motes = [];
    audio.sfx('breakthrough');
    shakeAll(sc, 420, this.quick ? 0.008 : 0.014);

    sc.tweens.killTweensOf(this.shade);
    sc.tweens.add({ targets: this.shade, alpha: 0, duration: 600, ease: 'Quad.easeOut' });
    // 白光一闪（夜间收着点，不晃眼）
    const night = settings.theme === 'night';
    const flash = this.add(sc.add.image(this.ox, 0, TEX.white).setOrigin(0, 0).setDisplaySize(W, H).setTint(night ? GOLD : 0xfffaf0).setAlpha(0).setDepth(DEPTH + 5));
    sc.tweens.chain({ targets: flash, tweens: [{ alpha: night ? 0.6 : 1, duration: 60 }, { alpha: 0, duration: 650, ease: 'Quad.easeOut' }] });

    // 冲击波：三道金环先后扩散
    for (let i = 0; i < 3; i++) {
      const ring = this.add(sc.add.image(cx, cy, TEX.ring).setDisplaySize(120, 120).setTint(i ? GOLD : COLORS.seal).setAlpha(1).setDepth(DEPTH + 2));
      sc.tweens.add({ targets: ring, scale: ring.scale * (6 + i * 2.5), alpha: 0, duration: 900 + i * 250, delay: 80 + i * 140, ease: 'Cubic.easeOut' });
    }
    // 光芒：一圈笔触从中心射出
    const rays = this.quick ? 10 : 16;
    for (let i = 0; i < rays; i++) {
      const ray = this.add(
        sc.add.image(cx, cy, TEX.brush).setOrigin(0, 0.5).setDisplaySize(10, 22 + Math.random() * 18).setTint(GOLD).setAlpha(0.9).setDepth(DEPTH + 1),
      );
      ray.setAngle((360 / rays) * i + Math.random() * 12);
      const len = 480 + Math.random() * 380;
      sc.tweens.chain({ targets: ray, tweens: [{ displayWidth: len, duration: 380, ease: 'Cubic.easeOut' }, { alpha: 0, duration: 600 + Math.random() * 300 }] });
    }
    // 火星四溅
    for (let i = 0; i < (this.quick ? 18 : 32); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 200 + Math.random() * 420;
      const size = 10 + Math.random() * 18;
      const p = this.add(sc.add.image(cx, cy, TEX.spark).setDisplaySize(size, size).setTint(GOLD).setAlpha(1).setDepth(DEPTH + 2));
      sc.tweens.add({ targets: p, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, alpha: 0, duration: 700 + Math.random() * 600, ease: 'Cubic.easeOut' });
    }
    this.reveal();
  }

  /** 显化：境界插图、标题、朱印、寿元 */
  private reveal(): void {
    const sc = this.scene;
    const { height: H } = getLayout(sc);
    const { cx, cy } = this;
    // 插图背后一团金光
    const halo = this.add(sc.add.image(cx, cy, TEX.spark).setDisplaySize(1000, 800).setTint(GOLD).setAlpha(0).setDepth(DEPTH));
    sc.tweens.add({ targets: halo, alpha: 0.5, duration: 600 });
    sc.tweens.add({ targets: halo, alpha: 0.3, duration: 1800, delay: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const key = ASSET_KEYS.realm(this.s.id);
    if (hasImage(sc, key)) {
      const art = this.add(sc.add.image(cx, cy, key).setTint(COLORS.artTint).setAlpha(0).setDepth(DEPTH + 1));
      const fit = Math.min(690 / art.width, 460 / art.height);
      art.setScale(fit * 1.12);
      sc.tweens.add({ targets: art, alpha: 1, scale: fit, duration: 900, delay: 120, ease: 'Cubic.easeOut' });
    }

    const title = this.quick ? '引气入体' : `踏入${this.s.label}`;
    const ty = cy + 290;
    const t = this.add(makeText(sc, cx, ty, title, { size: 76, color: TEXT_COLORS.title, bold: true, scale: 1 }).setOrigin(0.5).setAlpha(0).setScale(1.8));
    t.setDepth(DEPTH + 3);
    sc.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 420, delay: 260, ease: 'Back.easeOut' });

    // 朱印：境界名的头一个字，标题落定后盖下
    const S = 64;
    const sx = cx + t.width / 2 + S / 2 + 14;
    const seal = this.add(sc.add.image(sx, ty + 6, TEX.white).setDisplaySize(S, S).setTint(COLORS.seal).setDepth(DEPTH + 3));
    const sealText = this.add(makeText(sc, sx, ty + 6, this.s.label.charAt(0), { size: 42, color: '#fff8ee', bold: true, scale: 1 }).setOrigin(0.5).setDepth(DEPTH + 4));
    for (const o of [seal, sealText]) {
      const s0 = o.scale;
      o.setAngle(-8).setAlpha(0).setScale(s0 * 2.2);
      sc.tweens.add({ targets: o, alpha: 0.95, scale: s0, duration: 240, delay: 760, ease: 'Back.easeIn' });
    }
    sc.time.delayedCall(1000, () => shakeAll(sc, 120, 0.004));

    const subText = this.quick ? '一缕灵气自丹田升起，仙路始于足下' : `寿元上限 ${this.lifespan} 年`;
    const sub = this.add(makeText(sc, cx, ty + 70, subText, { size: 30, color: TEXT_COLORS.normal, scale: 1 }).setOrigin(0.5, 0).setAlpha(0).setDepth(DEPTH + 3));
    sc.tweens.add({ targets: sub, alpha: 1, duration: 400, delay: 700 });
    const hint = this.add(makeText(sc, cx, Math.min(H - 70, ty + 150), '点击继续', { size: 24, color: TEXT_COLORS.dim, scale: 1 }).setOrigin(0.5).setAlpha(0).setDepth(DEPTH + 3));
    sc.tweens.add({ targets: hint, alpha: 1, duration: 400, delay: 1200 });

    // 余韵：几点灵光缓缓上升
    for (let i = 0; i < 10; i++) {
      const size = 8 + Math.random() * 14;
      const m = this.add(
        sc.add.image(cx + (Math.random() - 0.5) * 600, cy + 200 + Math.random() * 300, TEX.spark).setDisplaySize(size, size).setTint(GOLD).setAlpha(0).setDepth(DEPTH + 2),
      );
      const dur = 2200 + Math.random() * 1600;
      sc.tweens.add({ targets: m, y: m.y - 380, duration: dur, delay: 400 + Math.random() * 1200, repeat: -1 });
      sc.tweens.add({ targets: m, alpha: 0.8, duration: dur / 2, delay: 400 + Math.random() * 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    sc.time.delayedCall(400, () => (this.finished = true));
    sc.time.delayedCall(this.quick ? 2400 : 3200, () => this.close());
  }

  private skip(): void {
    this.burstTimer?.remove();
    this.scene.tweens.killTweensOf(this.motes);
    this.burst();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    const sc = this.scene;
    sc.tweens.killTweensOf(this.objs);
    sc.tweens.add({
      targets: this.objs, alpha: 0, duration: 300,
      onComplete: () => {
        for (const o of this.objs) o.destroy();
        this.done();
      },
    });
  }

  private add<T extends Obj>(o: T): T {
    this.objs.push(o);
    return o;
  }
}
