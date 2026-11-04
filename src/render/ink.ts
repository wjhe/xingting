import Phaser from 'phaser';
import { Rng } from '../core/rng';

/**
 * 程序化生成的水墨纹理，启动时画一次。都画成白色（带透明度），使用时用 setTint 按主题着色。
 * 不依赖任何图片文件，包体零增加，微信小游戏里同样可用（只用到 Canvas 2D 基础绘图）。
 */
export const TEX = {
  paper: 'ink_paper',
  brush: 'ink_brush',
  blot: 'ink_blot',
  mountains: 'ink_mountains',
  /** Phaser 自带的 1×1 白图：染什么色就是什么色的实心块，代替 fillRect */
  white: '__WHITE',
  /** 圆角方块（白）：按钮底色，用九宫格拉伸 */
  btn: 'ink_btn',
  /** 圆角双线描边：按钮没有毛笔框时的边框 */
  btnEdge: 'ink_btn_edge',
  /** 圆角单线描边：印章内框、吐司边框 */
  edge: 'ink_edge',
  /** 方角双线框：日志插图的外框 */
  frame: 'ink_frame_double',
  /** 圆环：头像、立绘的圈 */
  ring: 'ink_ring',
  /** 实心圆：图标底 */
  circle: 'ink_circle',
  /** 由上到下的透明渐变：区域插图下沿渐隐用 */
  fade: 'ink_fade',
  /** 菱形：灵石粒子 */
  diamond: 'ink_diamond',
  /** 光点：灵气粒子 */
  spark: 'ink_spark',
} as const;

/** 九宫格边距 */
export const SLICE = { btn: 12, frame: 12 } as const;

export function generateInkTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.paper)) return;
  const rng = Rng.fromSeed(20261026);
  paper(scene, rng);
  brush(scene, rng);
  blot(scene, rng);
  mountains(scene, rng);
  uiTextures(scene);
}

/** 圆角矩形路径（不用 ctx.roundRect，老 WebView 不一定有） */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/**
 * 界面用的通用纹理。全部画成白色，使用时 setTint 按主题着色；
 * 用图片代替 Graphics 画，渲染时能和其它图片合批，手机上快得多。
 */
function uiTextures(scene: Phaser.Scene): void {
  const S = 64;
  {
    const { tex, ctx } = canvas(scene, TEX.btn, S, S);
    ctx.fillStyle = '#fff';
    roundRect(ctx, 0, 0, S, S, 10);
    ctx.fill();
    tex.refresh();
  }
  {
    // 外粗内细，跟原来 Graphics 画的双线一致
    const { tex, ctx } = canvas(scene, TEX.btnEdge, S, S);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, S - 2, S - 2, 9);
    ctx.stroke();
    ctx.lineWidth = 1;
    roundRect(ctx, 4.5, 4.5, S - 9, S - 9, 6);
    ctx.stroke();
    tex.refresh();
  }
  {
    const { tex, ctx } = canvas(scene, TEX.edge, S, S);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, S - 2, S - 2, 9);
    ctx.stroke();
    tex.refresh();
  }
  {
    const S2 = 96;
    const { tex, ctx } = canvas(scene, TEX.frame, S2, S2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S2 - 2, S2 - 2);
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, S2 - 12, S2 - 12);
    tex.refresh();
  }
  {
    const R = 128;
    const { tex, ctx } = canvas(scene, TEX.ring, R, R);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(R / 2, R / 2, R / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    tex.refresh();
  }
  {
    const R = 128;
    const { tex, ctx } = canvas(scene, TEX.circle, R, R);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(R / 2, R / 2, R / 2, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
  }
  {
    const { tex, ctx } = canvas(scene, TEX.fade, 8, 128);
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 128);
    tex.refresh();
    // 2 的幂尺寸默认按重复采样，拉伸后上沿会混进底部的不透明色，现出一条细线
    tex.setWrap(Phaser.Textures.WrapMode.CLAMP_TO_EDGE, Phaser.Textures.WrapMode.CLAMP_TO_EDGE);
  }
  {
    const { tex, ctx } = canvas(scene, TEX.diamond, 32, 32);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(16, 1);
    ctx.lineTo(31, 16);
    ctx.lineTo(16, 31);
    ctx.lineTo(1, 16);
    ctx.closePath();
    ctx.fill();
    tex.refresh();
  }
  {
    const R = 64;
    const { tex, ctx } = canvas(scene, TEX.spark, R, R);
    const grad = ctx.createRadialGradient(R / 2, R / 2, 0, R / 2, R / 2, R / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, R, R);
    tex.refresh();
  }
}

/** 圆头条形纹理（按高度缓存），用九宫格横向拉伸，两端的圆头不变形 */
export function pillTex(scene: Phaser.Scene, h: number): string {
  const key = `ink_pill_${Math.round(h)}`;
  if (scene.textures.exists(key)) return key;
  const W = 64;
  const { tex, ctx } = canvas(scene, key, W, Math.round(h));
  ctx.fillStyle = '#fff';
  roundRect(ctx, 0, 0, W, h, h / 2);
  ctx.fill();
  tex.refresh();
  return key;
}

/** 竖着的圆头条形（按宽度缓存）：灵气柱这类纵向生长的条 */
export function vpillTex(scene: Phaser.Scene, w: number): string {
  const key = `ink_vpill_${Math.round(w)}`;
  if (scene.textures.exists(key)) return key;
  const H = 64;
  const { tex, ctx } = canvas(scene, key, Math.round(w), H);
  ctx.fillStyle = '#fff';
  roundRect(ctx, 0, 0, w, H, w / 2);
  ctx.fill();
  tex.refresh();
  return key;
}

/** 圆头条形的单线描边（按高度缓存），用于吐司的边框 */
export function pillEdgeTex(scene: Phaser.Scene, h: number): string {
  const key = `ink_pill_edge_${Math.round(h)}`;
  if (scene.textures.exists(key)) return key;
  const W = 64;
  const { tex, ctx } = canvas(scene, key, W, Math.round(h));
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, W - 2, h - 2, (h - 2) / 2);
  ctx.stroke();
  tex.refresh();
  return key;
}

function canvas(scene: Phaser.Scene, key: string, w: number, h: number) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  return { tex, ctx: tex.context };
}

/** 宣纸：细碎纤维和斑点，可平铺 */
function paper(scene: Phaser.Scene, rng: Rng) {
  const S = 256;
  const { tex, ctx } = canvas(scene, TEX.paper, S, S);
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    const len = 4 + rng.next() * 18;
    const a = rng.next() * Math.PI;
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + rng.next() * 0.35})`;
    ctx.lineWidth = 0.5 + rng.next() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + rng.next() * 4, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
    // 越过边界的部分在对侧再画一次，保证平铺无缝
    if (x + len > S || y + len > S) {
      ctx.beginPath();
      ctx.moveTo(x - S, y - S);
      ctx.lineTo(x - S + Math.cos(a) * len, y - S + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rng.next() * 0.4})`;
    ctx.fillRect(rng.next() * S, rng.next() * S, 1, 1);
  }
  tex.refresh();
}

/** 毛笔横笔：两头尖、中间粗，边缘有飞白 */
function brush(scene: Phaser.Scene, rng: Rng) {
  const W = 512;
  const H = 28;
  const { tex, ctx } = canvas(scene, TEX.brush, W, H);
  const mid = H / 2;
  for (let x = 0; x < W; x++) {
    const t = x / W;
    // 起笔重、收笔轻
    const thick = Math.sin(Math.PI * Math.pow(t, 0.8)) * (H * 0.42) * (1 - t * 0.35);
    for (let k = 0; k < 6; k++) {
      const y = mid + (rng.next() - 0.5) * thick * 2;
      // 飞白：随机留空
      if (rng.next() < 0.12 + t * 0.25) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rng.next() * 0.5})`;
      ctx.fillRect(x, y, 1.2, 1.5 + rng.next() * 2);
    }
  }
  tex.refresh();
}

/** 墨晕：不规则边缘的圆形，中心浓、边缘淡 */
function blot(scene: Phaser.Scene, rng: Rng) {
  const S = 512;
  const { tex, ctx } = canvas(scene, TEX.blot, S, S);
  const c = S / 2;
  const n = 64;
  const radii = Array.from({ length: n }, () => 0.82 + rng.next() * 0.18);
  // 平滑一下半径，避免锯齿
  const smooth = radii.map((_, i) => (radii[(i + n - 1) % n] + radii[i] * 2 + radii[(i + 1) % n]) / 4);
  for (let layer = 0; layer < 8; layer++) {
    const scale = 1 - layer * 0.1;
    ctx.fillStyle = `rgba(255,255,255,${0.08 + layer * 0.06})`;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = smooth[i % n] * c * 0.95 * scale;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.fill();
  }
  tex.refresh();
}

/** 远山：三层山脊，越远越淡，山脚有雾 */
function mountains(scene: Phaser.Scene, rng: Rng) {
  const W = 750;
  const H = 360;
  const { tex, ctx } = canvas(scene, TEX.mountains, W, H);
  const layers = [
    { base: 0.35, amp: 0.25, alpha: 0.18 },
    { base: 0.5, amp: 0.22, alpha: 0.3 },
    { base: 0.68, amp: 0.18, alpha: 0.5 },
  ];
  for (const L of layers) {
    // 一维噪声：几个随机控制点之间余弦插值，再叠加细碎起伏
    const pts = Array.from({ length: 7 }, () => rng.next());
    const ridge = (x: number) => {
      const f = (x / W) * (pts.length - 1);
      const i = Math.floor(f);
      const t = (1 - Math.cos((f - i) * Math.PI)) / 2;
      const v = pts[i] * (1 - t) + pts[Math.min(i + 1, pts.length - 1)] * t;
      return v + Math.sin(x * 0.05 + L.base * 10) * 0.03 + (rng.next() - 0.5) * 0.01;
    };
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `rgba(255,255,255,${L.alpha})`);
    grad.addColorStop(0.75, `rgba(255,255,255,${L.alpha * 0.6})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 3) ctx.lineTo(x, H * (L.base + (0.5 - ridge(x)) * L.amp * 2) - H * 0.15);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
  tex.refresh();
}
