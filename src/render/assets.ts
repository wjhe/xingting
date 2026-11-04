import type Phaser from 'phaser';
import manifest from '../data/assets.json';
import items from '../data/items.json';

/**
 * 外部素材（AI 生成后经 scripts/assets.py 处理）。清单里有的才加载，没有的用程序画的替代。
 */
const images = manifest.images as Record<string, string>;
const audio = manifest.audio as Record<string, string>;
/** 共用图标的物品（如各种丹方都用同一张卷轴） */
const ICON_ALIAS: Record<string, string> = Object.fromEntries(
  (items as { id: string; icon?: string }[]).filter((i) => i.icon).map((i) => [i.id, i.icon!]),
);

/** 启动时加载图片（进游戏前必须就绪） */
export function preloadImages(scene: Phaser.Scene): void {
  for (const [key, path] of Object.entries(images)) scene.load.image(key, path);
  // 单个素材加载失败不影响游戏，按"没有这个素材"处理
  scene.load.on('loaderror', (file: Phaser.Loader.File) => console.warn(`素材加载失败：${file.key}`));
}

/** 加载页自己要用的图（主视觉、书法标题），在其余素材之前单独载入 */
export function bootPack(): { type: 'image'; key: string; url: string }[] {
  return [ASSET_KEYS.boot, ASSET_KEYS.title].filter((k) => k in images).map((key) => ({ type: 'image', key, url: images[key] }));
}

/** 进游戏后在后台加载音频（体积大，不阻塞启动），全部加载完回调 */
export function loadAudioInBackground(scene: Phaser.Scene, done: () => void): void {
  const entries = Object.entries(audio);
  if (!entries.length) return;
  // 音效小，先加载；背景音乐排在后面
  entries.sort(([a], [b]) => Number(a.startsWith('bgm_')) - Number(b.startsWith('bgm_')));
  for (const [key, path] of entries) scene.load.audio(key, path);
  scene.load.once('complete', done);
  scene.load.start();
}

export function hasImage(scene: Phaser.Scene, key: string): boolean {
  return key in images && scene.textures.exists(key);
}

export const ASSET_KEYS = {
  region: (id: string) => `region_${id}`,
  icon: (id: string) => `icon_${ICON_ALIAS[id] ?? id}`,
  ending: (id: string) => id,
  /** 事件插图（日志横幅） */
  art: (id: string) => `art_${id}`,
  realm: (id: string) => `realm_${id}`,
  portrait: (gender: string) => `portrait_${gender}`,
  enemy: (id: string) => `enemy_${id}`,
  title: 'title',
  cover: 'cover',
  boot: 'boot',
  death: 'death',
  rebirth: 'rebirth',
};
