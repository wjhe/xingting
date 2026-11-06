import Phaser from 'phaser';
import { bodyAsset, growthRatio, outfitAsset, roomArt, roomTint, NEW_OUTFITS } from './art';

/** 18 岁时人物占舞台高度的比例（更小的年龄按身高表缩放）、脚底所在高度，以及房间图中地毯中心（人物站位）的纵向位置。 */
const FIGURE_HEIGHT = .94;
const FEET_LINE = .955;
const ROOM_FLOOR_ANCHOR = .86;
/**
 * 18 岁时人物身高与房间图显示高度之比。按手机竖屏 390×377 舞台“房间刚好盖满宽度”标定，让人物尽量大（2026-11-06 由 .535 调大）。
 * 人物和房间按同一比例缩放，窗口再宽，家具与人物的大小关系也不变。
 */
const FIGURE_TO_ROOM = .62;
/** 窗口很宽、房间盖不满左右时，最多再放大 12% 去覆盖（常见电脑窗口刚好盖满）（比例略有变化）；超过则两侧露出与墙同色的底 */
const MAX_COVER_STRETCH = 1.12;

// 场景只负责画像和光尘，成长规则与存档都留在纯逻辑层。
class GardenScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Image;
  private body?: Phaser.GameObjects.Image;
  private clothing?: Phaser.GameObjects.Image;
  private floorShadow?: Phaser.GameObjects.Image;
  private roomVeil?: Phaser.GameObjects.Image;
  /** 0–1 往返的镜头平移量；背景移动幅度大于人物，形成纵深 */
  private drift = { value: .5 };
  /** 背景左右平移的最大幅度（像素），由房间超出舞台的余量决定 */
  private driftAmp = 0;
  /** 人物满 18 岁时的显示高度（像素），由房间缩放决定 */
  private figureFull = 0;
  /** 房间盖不满左右时，在两侧边缘画一道渐变，把房间边缘柔和地过渡到墙色底 */
  private edgeFade?: Phaser.GameObjects.Graphics;
  constructor(private age: number, private outfit: string, private night = false) {
    super('Garden');
  }
  preload(): void {
    // 画布先透明，素材载入、布局完成后在 create 里淡入，避免先闪一下底色
    this.game.canvas.style.opacity = '0';
    // 首屏只下载当前立绘，其他年龄和衣装在切换时由新场景按需加载。
    this.load.image('room', roomArt(this.night));
    this.load.image('body', bodyAsset(this.age, this.outfit));
    this.load.image('outfit', outfitAsset(this.age, this.outfit));
  }
  create(): void {
    this.cameras.main.setBackgroundColor('#dfcfb4');
    if (this.textures.exists('room')) this.background = this.add.image(0, 0, 'room').setOrigin(0.5);
    // 房间上沿的过渡在人物后面绘制，不能让 CSS 蒙层冲淡头发和脸部。
    const veil = document.createElement('canvas'); veil.width = 2; veil.height = 256;
    const veilContext = veil.getContext('2d')!;
    const fade = veilContext.createLinearGradient(0, 0, 0, 256);
    fade.addColorStop(0, '#faf5e5'); fade.addColorStop(.06, '#faf5e5cc'); fade.addColorStop(.16, '#faf5e500');
    veilContext.fillStyle = fade; veilContext.fillRect(0, 0, 2, 256);
    this.textures.addCanvas('room-veil', veil);
    this.roomVeil = this.add.image(0, 0, 'room-veil').setOrigin(0);
    this.edgeFade = this.add.graphics();
    // 脚下的柔和投影：径向渐变，中间深、边缘渐淡，避免硬边椭圆。
    const shade = document.createElement('canvas'); shade.width = 256; shade.height = 64;
    const shadeContext = shade.getContext('2d')!;
    const glow = shadeContext.createRadialGradient(128, 32, 0, 128, 32, 128);
    glow.addColorStop(0, 'rgba(62,44,28,.3)'); glow.addColorStop(.3, 'rgba(62,44,28,.18)'); glow.addColorStop(.65, 'rgba(62,44,28,.06)'); glow.addColorStop(1, 'rgba(70,52,34,0)');
    shadeContext.setTransform(1, 0, 0, .25, 0, 24); shadeContext.fillStyle = glow; shadeContext.fillRect(0, -96, 256, 256);
    this.textures.addCanvas('floor-shadow', shade);
    this.floorShadow = this.add.image(0, 0, 'floor-shadow').setOrigin(.5);
    if (this.textures.exists('body')) this.body = this.add.image(0, 0, 'body').setOrigin(0.5, 0);
    if (this.textures.exists('outfit')) this.clothing = this.add.image(0, 0, 'outfit').setOrigin(0.5, 0);
    // 秋天的金色光、夜晚的灯光下，给立绘加一层很轻的暖色，避免像贴上去的
    for (const layer of [this.body, this.clothing]) layer?.setTint(roomTint(this.night));
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.startCamera();
    const view = this.game.canvas; view.style.transition = 'opacity .35s ease'; requestAnimationFrame(() => { view.style.opacity = '1'; });
    const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 12;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(6, 6, 3, 0, Math.PI * 2); ctx.fill();
    this.textures.addCanvas('light-dust', canvas);
    for (let i = 0; i < 4; i++) {
      const mote = this.add.image(i * 170 + 70, i * 113 + 120, 'light-dust').setAlpha(0.35).setScale(0.5 + (i % 3) * 0.15);
      this.tweens.add({ targets: mote, x: '+=45', y: '-=100', alpha: 0, duration: 8000 + i * 1400, delay: i * 900, repeat: -1 });
    }
  }
  /** 庭院镜头：进场轻推，之后缓慢呼吸式推拉，背景与人物有轻微视差。 */
  /**
   * 庭院镜头：从“居中、原大小”开始，用正弦缓慢平移与推拉，不做进场推镜，避免回到房间时画面跳一下。
   * 平移约 26 秒一个来回，推拉约 16 秒一个来回。
   */
  private cameraStart = -1;
  private startCamera(): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.cameraStart = this.time.now;
  }
  update(time: number): void {
    if (this.cameraStart < 0) return;
    const t = (time - this.cameraStart) / 1000;
    this.drift.value = .5 + .5 * Math.sin(t * Math.PI * 2 / 26);
    this.cameras.main.setZoom(1 + .025 * (1 - Math.cos(t * Math.PI * 2 / 16)));
    this.applyDrift();
  }
  private applyDrift(): void {
    const { width } = this.scale;
    const offset = this.drift.value - .5;
    this.background?.setX(width / 2 + offset * 2 * this.driftAmp);
    for (const layer of [this.body, this.clothing]) layer?.setX(width * .5 + offset * width * .008);
    this.floorShadow?.setX(width * .5 + offset * width * .008);
  }
  private layout(): void {
    const { width, height } = this.scale;
    // 竖构图房间铺满舞台并以地板为准贴底；人物与房间一起“推近”，不再在上方留出空墙。
    if (this.background) {
      const bw = this.background.width, bh = this.background.height;
      // 先按“18 岁的她刚好占舞台 88% 高”且保持人物与房间比例，算出房间应有的缩放
      const fit = height * FIGURE_HEIGHT / (FIGURE_TO_ROOM * bh);
      // 房间要盖满舞台；宽窗口下为了盖满最多多放大 8%，再宽就保持比例、两侧露出墙色底
      const cover = Math.max(width / bw, height / bh);
      const scale = Math.max(fit, Math.min(cover, fit * MAX_COVER_STRETCH));
      this.figureFull = Math.min(bh * scale * FIGURE_TO_ROOM, height * FIGURE_HEIGHT);
      // 镜头平移幅度：不超过房间左右多出来的部分，最多为舞台宽度的 2.25%
      this.driftAmp = Math.max(0, Math.min(width * .0225, (bw * scale - width) / 2 - 1));
      this.background.setOrigin(.5, ROOM_FLOOR_ANCHOR).setPosition(width / 2, height * FEET_LINE).setScale(scale);
      const gap = (width - bw * scale) / 2;
      this.edgeFade?.clear();
      if (gap > 0 && this.edgeFade) {
        const wall = 0xe9e0cc, band = gap + Math.min(48, width * .08);
        this.edgeFade.fillStyle(wall, 1).fillRect(0, 0, gap, height).fillRect(width - gap, 0, gap, height);
        this.edgeFade.fillGradientStyle(wall, wall, wall, wall, 1, 0, 1, 0).fillRect(gap - 1, 0, band - gap + 1, height);
        this.edgeFade.fillGradientStyle(wall, wall, wall, wall, 0, 1, 0, 1).fillRect(width - band, 0, band - gap + 1, height);
      }
      // 舞台比图片更高时（极少数宽屏），以覆盖为先，避免露底。
      if (this.background.y + this.background.displayHeight * (1 - ROOM_FLOOR_ANCHOR) < height) this.background.setOrigin(.5, 1).setPosition(width / 2, height);
    }
    this.roomVeil?.setDisplaySize(width, height);
    if (this.body) {
      const scale = (this.figureFull || height * FIGURE_HEIGHT) * growthRatio(this.age) / this.body.height;
      const floor = height * FEET_LINE;
      const feetInSource = (this.age >= 16 || NEW_OUTFITS.includes(this.outfit) ? 1316 : this.age >= 14 ? 1331 : 1332) / 1350;
      const top = floor - this.body.height * scale * feetInSource;
      for (const layer of [this.body, this.clothing]) layer?.setPosition(width * .5, top).setScale(scale);
      // 阴影宽度随身高变化，长大后影子也跟着变大。
      const figure = this.body.height * scale;
      this.floorShadow?.setPosition(width * .5, floor - figure * .006).setDisplaySize(figure * .42, figure * .065);
    }
    this.applyDrift();
  }
}

export function createStage(parent: HTMLElement, age: number, outfit: string, night = false) {
  const scene = new GardenScene(age, outfit, night);
  const width = parent.clientWidth * Math.min(window.devicePixelRatio || 1, 2);
  const height = parent.clientHeight * Math.min(window.devicePixelRatio || 1, 2);
  const game = new Phaser.Game({ type: Phaser.AUTO, parent, width, height, transparent: false, backgroundColor: '#e9e0cc', banner: false,
    scene, fps: { target: 30, limit: 30 }, audio: { noAudio: true }, input: { mouse: false, touch: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true } });
  return { destroy: () => game.destroy(true) };
}
