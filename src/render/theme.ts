export const DESIGN_W = 750;

export type ThemeName = 'night' | 'day';

/**
 * 颜色在切换主题时原地替换（Object.assign），各处引用同一个对象即可拿到新值。
 * 切换后需要重启场景让已创建的对象重新着色。
 */
export const COLORS = {
  bg: 0,
  panel: 0,
  line: 0,
  btn: 0,
  btnPrimary: 0,
  btnBorder: 0,
  barBg: 0,
  bar: 0,
  /** 水墨装饰（山峦、墨晕、笔触）的颜色 */
  ink: 0,
  /** 宣纸纹理的纤维颜色 */
  fiber: 0,
  /** 远山颜色：夜间要比底色亮才看得见 */
  mountain: 0,
  /** 插图着色：插图都是宣纸底，夜间压暗，免得像在黑底上贴了亮色照片 */
  artTint: 0,
  /** 朱砂印章 */
  seal: 0,
  /** 图标墨色（夜间用金色） */
  ink2: 0,
};

export const TEXT_COLORS = {
  normal: '',
  dim: '',
  gold: '',
  title: '',
  good: '',
  bad: '',
  time: '',
  whisper: '',
  battle: '',
};

const PALETTES: Record<ThemeName, { colors: typeof COLORS; text: typeof TEXT_COLORS }> = {
  // 夜：墨色底，金色点缀
  night: {
    colors: {
      bg: 0x14161f, panel: 0x1b1d29, line: 0x3a3a48, btn: 0x252838, btnPrimary: 0x4a3f24, btnBorder: 0x8a7a50,
      barBg: 0x2a2e40, bar: 0xc9a85c, ink: 0x000000, fiber: 0x2a2d3a, mountain: 0x46506e, artTint: 0xa8a294, seal: 0xb8432c, ink2: 0xe0cc94,
    },
    text: {
      normal: '#e6e1d3', dim: '#8a8577', gold: '#e8d8a0', title: '#f0c674', good: '#8fd18f', bad: '#e07a6a',
      time: '#6c7a89', whisper: '#b9a6d9', battle: '#c8c2b2',
    },
  },
  // 昼：宣纸底，墨色文字，朱砂点缀
  day: {
    colors: {
      bg: 0xf1e8d4, panel: 0xe7dbc0, line: 0xc4b291, btn: 0xebe0c8, btnPrimary: 0xd9b98a, btnBorder: 0x8a6d3b,
      barBg: 0xd8c9a8, bar: 0xa8452c, ink: 0x2b241c, fiber: 0xd6c7a6, mountain: 0x5a5040, artTint: 0xffffff, seal: 0xb03a24, ink2: 0x2b241c,
    },
    text: {
      normal: '#2b2620', dim: '#7a6f5e', gold: '#8a4f17', title: '#9b3a1e', good: '#2f6e35', bad: '#a8322a',
      time: '#8a8070', whisper: '#5e4685', battle: '#4a4238',
    },
  },
};

export function applyTheme(name: ThemeName): void {
  Object.assign(COLORS, PALETTES[name].colors);
  Object.assign(TEXT_COLORS, PALETTES[name].text);
}

applyTheme('day');

export const FONT_FAMILY = '"PingFang SC","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",sans-serif';

/** 字号（设计坐标，750 宽），实际渲染时乘以设置里的字号倍数 */
export const FONT = {
  small: 26,
  body: 30,
  button: 30,
  title: 34,
  logo: 72,
};
