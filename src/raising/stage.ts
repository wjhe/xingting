import Phaser from 'phaser';
import { bodyAsset, growthRatio, outfitAsset, HOME_ROOM_ART, NEW_OUTFITS } from './art';

/** 18 岁时人物占舞台高度的比例（更小的年龄按身高表缩放）、脚底所在高度，以及房间图中地毯中心（人物站位）的纵向位置。 */
const FIGURE_HEIGHT = .88;
const FEET_LINE = .93;
const ROOM_FLOOR_ANCHOR = .86;

// 场景只负责画像和光尘，成长规则与存档都留在纯逻辑层。
class GardenScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Image;
  private body?: Phaser.GameObjects.Image;
  private clothing?: Phaser.GameObjects.Image;
  private floorShadow?: Phaser.GameObjects.Image;
  private roomVeil?: Phaser.GameObjects.Image;
  /** 0–1 往返的镜头平移量；背景移动幅度大于人物，形成纵深 */
  private drift = { value: .5 };
  constructor(private age: number, private outfit: string) {
    super('Garden');
  }
  preload(): void {
    // 首屏只下载当前立绘，其他年龄和衣装在切换时由新场景按需加载。
    this.load.image('room', HOME_ROOM_ART);
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
    // 脚下的柔和投影：径向渐变，中间深、边缘渐淡，避免硬边椭圆。
    const shade = document.createElement('canvas'); shade.width = 256; shade.height = 64;
    const shadeContext = shade.getContext('2d')!;
    const glow = shadeContext.createRadialGradient(128, 32, 0, 128, 32, 128);
    glow.addColorStop(0, 'rgba(62,44,28,.78)'); glow.addColorStop(.3, 'rgba(62,44,28,.5)'); glow.addColorStop(.65, 'rgba(62,44,28,.16)'); glow.addColorStop(1, 'rgba(70,52,34,0)');
    shadeContext.setTransform(1, 0, 0, .25, 0, 24); shadeContext.fillStyle = glow; shadeContext.fillRect(0, -96, 256, 256);
    this.textures.addCanvas('floor-shadow', shade);
    this.floorShadow = this.add.image(0, 0, 'floor-shadow').setOrigin(.5);
    if (this.textures.exists('body')) this.body = this.add.image(0, 0, 'body').setOrigin(0.5, 0);
    if (this.textures.exists('outfit')) this.clothing = this.add.image(0, 0, 'outfit').setOrigin(0.5, 0);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.startCamera();
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
  private startCamera(): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const camera = this.cameras.main;
    camera.setZoom(1.07);
    this.tweens.add({ targets: camera, zoom: 1, duration: 1400, ease: 'Sine.easeOut', onComplete: () => {
      this.tweens.add({ targets: camera, zoom: 1.05, duration: 8000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    } });
    this.drift.value = 0;
    this.tweens.add({ targets: this.drift, value: 1, duration: 13000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, onUpdate: () => this.applyDrift() });
  }
  private applyDrift(): void {
    const { width } = this.scale;
    const offset = this.drift.value - .5;
    this.background?.setX(width / 2 + offset * width * .045);
    for (const layer of [this.body, this.clothing]) layer?.setX(width * .5 + offset * width * .008);
    this.floorShadow?.setX(width * .5 + offset * width * .008);
  }
  private layout(): void {
    const { width, height } = this.scale;
    // 竖构图房间铺满舞台并以地板为准贴底；人物与房间一起“推近”，不再在上方留出空墙。
    if (this.background) {
      // 多留 6% 画面余量，镜头平移时不露边。
      const scale = Math.max(width / this.background.width, height / this.background.height) * 1.06;
      this.background.setOrigin(.5, ROOM_FLOOR_ANCHOR).setPosition(width / 2, height * FEET_LINE).setScale(scale);
      // 舞台比图片更高时（极少数宽屏），以覆盖为先，避免露底。
      if (this.background.y + this.background.displayHeight * (1 - ROOM_FLOOR_ANCHOR) < height) this.background.setOrigin(.5, 1).setPosition(width / 2, height);
    }
    this.roomVeil?.setDisplaySize(width, height);
    if (this.body) {
      const scale = height * FIGURE_HEIGHT * growthRatio(this.age) / this.body.height;
      const floor = height * FEET_LINE;
      const feetInSource = (this.age >= 16 || NEW_OUTFITS.includes(this.outfit) ? 1316 : this.age >= 14 ? 1331 : 1332) / 1350;
      const top = floor - this.body.height * scale * feetInSource;
      for (const layer of [this.body, this.clothing]) layer?.setPosition(width * .5, top).setScale(scale);
      // 阴影宽度随身高变化，长大后影子也跟着变大。
      const figure = this.body.height * scale;
      this.floorShadow?.setPosition(width * .5, floor - figure * .006).setDisplaySize(figure * .5, figure * .085);
    }
    this.applyDrift();
  }
}

export function createStage(parent: HTMLElement, age: number, outfit: string) {
  const scene = new GardenScene(age, outfit);
  const width = parent.clientWidth * Math.min(window.devicePixelRatio || 1, 2);
  const height = parent.clientHeight * Math.min(window.devicePixelRatio || 1, 2);
  const game = new Phaser.Game({ type: Phaser.AUTO, parent, width, height, transparent: false, backgroundColor: '#e7e6d5', banner: false,
    scene, fps: { target: 30, limit: 30 }, audio: { noAudio: true }, input: { mouse: false, touch: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true } });
  return { destroy: () => game.destroy(true) };
}
