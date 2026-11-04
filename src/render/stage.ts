import Phaser from 'phaser';
import type { Signal } from '../core/game';
import { audio } from './audio';
import { flash, shakeAll } from './fx';
import { TEX, vpillTex } from './ink';
import { COLORS, DESIGN_W, TEXT_COLORS } from './theme';
import { getLayout, makeText } from './ui';

type StageSignal = Extract<Signal, { type: 'stage' }>;
type Obj = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;

/** 灵气柱的宽度、关口之上冲出去的余量（成功时冲过关口） */
const COLUMN_W = 54;
const OVERSHOOT = 0.14;
const GOLD = 0xd9b45a;

/**
 * 冲击小境界的演出：一道灵气自下而上涌向关口。
 * 冲过关口为晋升；在关口前被弹回为撞上瓶颈。点击：播放中跳到结果，结果时关闭。
 */
export class StageView {
  private objs: Obj[] = [];
  private finished = false;
  private closed = false;
  private fill!: Phaser.GameObjects.NineSlice;
  private headGlow!: Phaser.GameObjects.Image;
  private headCore!: Phaser.GameObjects.Image;
  private level = 0;
  private rise: Phaser.Tweens.Tween | null = null;
  private top = 0;
  private bottom = 0;

  constructor(
    private scene: Phaser.Scene,
    private ox: number,
    private s: StageSignal,
    /** 炼气这类小层多的境界用短版 */
    private quick: boolean,
    private done: () => void,
  ) {}

  play(): void {
    const sc = this.scene;
    const { height: H } = getLayout(sc);
    const W = DESIGN_W;
    const cx = this.ox + W / 2;
    this.top = H * 0.26;
    this.bottom = H * 0.66;
    const color = this.s.pill ? GOLD : COLORS.bar;

    this.add(sc.add.image(this.ox, 0, TEX.white).setOrigin(0, 0).setDisplaySize(W, H).setTint(COLORS.bg));
    this.add(sc.add.tileSprite(this.ox, 0, W, H, TEX.paper).setOrigin(0, 0).setTint(COLORS.fiber).setAlpha(0.8));
    this.add(sc.add.image(this.ox, H - 380, TEX.mountains).setOrigin(0, 0).setDisplaySize(W, 380).setTint(COLORS.mountain).setAlpha(0.3));

    // 标题：冲击什么
    const title = this.s.bottleneck ? `冲击瓶颈 · ${this.s.to}` : `冲击 ${this.s.to}`;
    this.add(makeText(sc, cx, H * 0.12, title, { size: 40, color: TEXT_COLORS.title, bold: true, scale: 1 }).setOrigin(0.5));
    if (this.s.pill) this.add(makeText(sc, cx, H * 0.12 + 56, '丹药护持', { size: 26, color: TEXT_COLORS.gold, scale: 1 }).setOrigin(0.5));

    // 灵气柱的槽、刻度、关口
    const colH = this.bottom - this.top;
    this.add(
      sc.add
        .nineslice(cx - COLUMN_W / 2, this.top, vpillTex(sc, COLUMN_W), undefined, COLUMN_W, colH, 0, 0, COLUMN_W / 2, COLUMN_W / 2)
        .setOrigin(0, 0)
        .setTint(COLORS.barBg),
    );
    for (let i = 1; i < 6; i++) {
      const y = this.bottom - (colH * i) / 6;
      this.add(sc.add.image(cx - COLUMN_W / 2 - 14, y, TEX.white).setOrigin(0, 0.5).setDisplaySize(12, 2).setTint(COLORS.line).setAlpha(0.8));
    }
    // 关口：一道横着的墨痕，冲瓶颈时更粗
    const gateH = this.s.bottleneck ? 26 : 16;
    this.add(sc.add.image(cx, this.top, TEX.brush).setDisplaySize(240, gateH).setTint(COLORS.ink).setAlpha(0.7));
    this.add(makeText(sc, cx + 140, this.top, '关', { size: 30, color: TEXT_COLORS.title, bold: true, scale: 1 }).setOrigin(0, 0.5));
    this.add(makeText(sc, cx, this.bottom + 22, this.s.from, { size: 26, color: TEXT_COLORS.dim, scale: 1 }).setOrigin(0.5, 0));

    const FW = COLUMN_W - 12;
    this.fill = this.add(
      sc.add
        .nineslice(cx - FW / 2, this.bottom, vpillTex(sc, FW), undefined, FW, FW, 0, 0, FW / 2, FW / 2)
        .setOrigin(0, 1)
        .setTint(COLORS.bar)
        .setAlpha(0.9),
    );
    this.headGlow = this.add(sc.add.image(cx, this.bottom, TEX.spark).setDisplaySize(COLUMN_W * 1.8, COLUMN_W * 1.8).setTint(COLORS.bar).setAlpha(0.35));
    this.headCore = this.add(sc.add.image(cx, this.bottom, TEX.spark).setDisplaySize(COLUMN_W * 0.6, COLUMN_W * 0.6).setTint(0xffffff).setAlpha(0.5));
    const zone = this.add(sc.add.zone(this.ox, 0, W, H).setOrigin(0, 0).setInteractive());
    zone.on('pointerup', () => (this.finished ? this.close() : this.skip()));
    for (const o of this.objs) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(1100);
    this.fill.setDepth(1101);
    this.headGlow.setDepth(1102);
    this.headCore.setDepth(1102);

    // 灵气越涌越快；途中轻微震动
    const target = this.s.ok ? 1 + OVERSHOOT : this.s.reach;
    const ms = this.quick ? 750 : 1700;
    if (!this.quick) shakeAll(sc, ms, 0.0025);
    audio.sfx('travel');
    this.rise = sc.tweens.addCounter({
      from: 0, to: target, duration: ms, ease: 'Cubic.easeIn',
      onUpdate: (tw) => this.draw(tw.getValue() ?? target, color),
      onComplete: () => this.finish(),
    });
  }

  private draw(level: number, color: number): void {
    this.level = level;
    const { top, bottom } = this;
    const cx = this.ox + DESIGN_W / 2;
    const y = Math.min(bottom, bottom - (bottom - top) * level);
    // 柱身：从底部长上来，顶端的圆头始终跟着灵气头
    this.fill.setTint(color).setSize(COLUMN_W - 12, Math.max(12, bottom - y)).setY(bottom);
    // 灵气的头：一团光
    this.headGlow.setPosition(cx, y).setTint(color);
    this.headCore.setPosition(cx, y);
  }

  private skip(): void {
    this.rise?.stop();
    this.draw(this.s.ok ? 1 + OVERSHOOT : this.s.reach, this.s.pill ? GOLD : COLORS.bar);
    this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const sc = this.scene;
    const { height: H } = getLayout(sc);
    const cx = this.ox + DESIGN_W / 2;
    const color = this.s.pill ? GOLD : COLORS.bar;
    let word: string;
    let sub: string;
    let wordColor: string;
    if (this.s.ok) {
      audio.sfx('breakthrough');
      flash(sc.cameras.main, color, 260);
      word = this.s.bottleneck ? '瓶颈贯通' : '晋升';
      sub = this.s.to;
      wordColor = TEXT_COLORS.title;
    } else {
      // 被壁障弹回：灵气退下去一截
      audio.sfx('fail');
      shakeAll(sc, 320, 0.01);
      sc.tweens.addCounter({ from: this.level, to: this.level * 0.55, duration: 380, ease: 'Quad.easeOut', onUpdate: (tw) => this.draw(tw.getValue() ?? 0, color) });
      word = '瓶颈';
      sub = this.s.bottleneck ? '壁障纹丝不动' : `卡在 ${this.s.from}`;
      wordColor = TEXT_COLORS.bad;
    }
    // 结果写在灵气柱下方，不压住柱子
    const y0 = this.bottom + 110;
    const w = this.add(makeText(sc, cx, y0, word, { size: 72, color: wordColor, bold: true, scale: 1 }).setOrigin(0.5).setAlpha(0).setScale(1.6));
    const t = this.add(makeText(sc, cx, y0 + 66, sub, { size: 30, color: TEXT_COLORS.normal, scale: 1 }).setOrigin(0.5).setAlpha(0));
    const hint = this.add(makeText(sc, cx, Math.min(H - 60, y0 + 130), '点击继续', { size: 24, color: TEXT_COLORS.dim, scale: 1 }).setOrigin(0.5).setAlpha(0));
    for (const o of [w, t, hint]) o.setDepth(1102);
    sc.tweens.add({ targets: w, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    sc.tweens.add({ targets: [t, hint], alpha: 1, duration: 300, delay: 200 });
    sc.time.delayedCall(this.quick ? 900 : 1600, () => this.close());
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    const sc = this.scene;
    sc.tweens.add({
      targets: this.objs, alpha: 0, duration: 220,
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
