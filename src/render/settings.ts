import type { Platform } from '../platform/types';
import { applyTheme, type ThemeName } from './theme';

const KEY = 'wdcs_settings_v1';

export type TextSpeed = 'char' | 'line' | 'instant';

export interface Settings {
  /** 字号倍数 */
  fontScale: number;
  /** 文字出现方式：逐字 / 逐行淡入 / 立即 */
  textSpeed: TextSpeed;
  theme: ThemeName;
  music: boolean;
  sfx: boolean;
  /** 战斗演出（逐回合动画） */
  battleAnim: boolean;
  /** 个性化广告（TapADN 合规要求提供关闭入口）。旧设置没有此字段 */
  personalAds: boolean;
}

export const FONT_SCALES: { label: string; value: number }[] = [
  { label: '标准', value: 1 },
  { label: '大', value: 1.15 },
  { label: '特大', value: 1.3 },
];

export const TEXT_SPEEDS: { label: string; value: TextSpeed }[] = [
  { label: '逐字', value: 'char' },
  { label: '逐行', value: 'line' },
  { label: '立即', value: 'instant' },
];

export const THEMES: { label: string; value: ThemeName }[] = [
  { label: '昼', value: 'day' },
  { label: '夜', value: 'night' },
];

export const ON_OFF: { label: string; value: boolean }[] = [
  { label: '开', value: true },
  { label: '关', value: false },
];

// 默认昼间主题：插图都是宣纸底，昼间配色和插图融为一体
const DEFAULTS: Settings = { fontScale: 1, textSpeed: 'line', theme: 'day', music: true, sfx: true, battleAnim: true, personalAds: true };

/** 当前生效的设置（全局单例，启动时读取） */
export const settings: Settings = { ...DEFAULTS };

export function loadSettings(platform: Platform): Settings {
  try {
    Object.assign(settings, DEFAULTS, JSON.parse(platform.storage.get(KEY) ?? '{}'));
  } catch {
    Object.assign(settings, DEFAULTS);
  }
  applyTheme(settings.theme);
  return settings;
}

export function saveSettings(platform: Platform, patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  applyTheme(settings.theme);
  platform.storage.set(KEY, JSON.stringify(settings));
}
