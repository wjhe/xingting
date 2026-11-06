/** 以用户确认的 cel-v3 测试图为唯一画风基准，版本化路径同时避免旧图缓存。 */
export const ART_STYLE = 'cel-v3';
const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/stargarden/`;
export const TOWN_ART = `${ASSET_ROOT}town-${ART_STYLE}.webp`;
/** 竖构图房间：两侧家具框住画面，中间地毯留给人物站位。主界面、衣橱、事件与演出共用。旧横版 room-cel-v3 保留为素材记录。 */
export const HOME_ROOM_ART = `${ASSET_ROOT}production-v1/home-room.webp`;
export const ROOM_ART = HOME_ROOM_ART;
/** 四季与夜晚房间（同一构图，窗外、光线与少量小物不同）。春 2–4 月、夏 5–7 月、秋 8–10 月、冬 11–1 月 */
const SEASON_ROOM: Record<string, string> = { 春: 'spring', 夏: 'summer', 秋: 'autumn', 冬: 'winter' };
let roomSeason = '';
/** 由界面在每次渲染时告知当前季节；之后所有“房间”画面都用对应季节版本 */
export function setRoomSeason(season: string): void { roomSeason = season; }
export function roomArt(night = false): string {
  const season = SEASON_ROOM[roomSeason];
  // 夜晚优先用当季夜景（窗外有雪、红叶等），没有季节信息时退回通用夜晚
  const key = night ? (season ? `${season}-night` : 'night') : season;
  return key ? `${ASSET_ROOT}production-v1/home-room-${key}.webp` : HOME_ROOM_ART;
}
/** 立绘在不同光线下的轻微色调，让人物融进房间的光（Phaser tint，白色为不变） */
export function roomTint(night = false): number {
  if (night) return 0xffe2c4;
  return roomSeason === '秋' ? 0xfff0dc : roomSeason === '夏' ? 0xfffaf0 : 0xffffff;
}

export const PRODUCTION_ROOT = `${ASSET_ROOT}production-v1/`;
/** 有三个年龄段独立立绘的款式（购买后各年龄通用）；其余为庭院来信的配色款 */
export const NEW_OUTFITS = ['summer', 'winter', 'festival', 'spring', 'autumn', 'rain', 'sleep'];
export type Expression = 'calm' | 'happy' | 'shy' | 'sad' | 'angry' | 'tired';
export function faceAsset(age: number, expression: Expression = 'calm'): string {
  return `${PRODUCTION_ROOT}face-${age>=16?'grown':age>=14?'teen':'child'}-${expression}.webp`;
}
export function eventExpression(id: string): Expression {
  if(['main_3_0','main_3_1','main_3_2','exam','side_rowan_2'].includes(id))return 'sad';
  if(['friendship','main_4_1','side_mira_2'].includes(id))return 'angry';
  if(['main_0_0','stage','daily_dress_mirror','side_nora_1'].includes(id))return 'shy';
  if(id==='daily_tired_cup')return 'tired';
  if(['flowers','friend','main_0_2','main_7_2','daily_spring_shoot'].includes(id))return 'happy';
  return 'calm';
}
export function bodyAsset(age: number, outfit = 'garden'): string {
  if (age >= 16) return `${PRODUCTION_ROOT}grown-${['garden','rose','sky',...NEW_OUTFITS].includes(outfit)?outfit:'garden'}.webp`;
  if (NEW_OUTFITS.includes(outfit)) return `${PRODUCTION_ROOT}${age >= 14 ? 'teen' : 'child'}-${outfit}.webp`;
  return `${ASSET_ROOT}${age >= 14 ? 'teen' : 'home'}-${ART_STYLE}-body.webp`;
}

export function outfitAsset(age: number, outfit: string): string {
  if (age >= 16 || NEW_OUTFITS.includes(outfit)) return `${PRODUCTION_ROOT}empty.webp`;
  const stage = age >= 14 ? 'teen' : 'home';
  const color = ['garden', 'rose', 'sky'].includes(outfit) ? outfit : 'garden';
  return `${ASSET_ROOT}${stage}-${ART_STYLE}-outfit-${color}.webp`;
}

export function sceneAsset(id: string): string {
  if (id === 'room') return roomArt();
  if (id === 'town') return TOWN_ART;
  return `${PRODUCTION_ROOT}${id}.webp`;
}

const ACTIVITY_ART: Record<string, string> = {
  literature: 'activity-study', painting: 'activity-art', dance: 'activity-dance', sword: 'activity-sword', magic: 'activity-magic',
  etiquette: 'activity-etiquette', farm: 'activity-farm', cafe: 'activity-cafe', church: 'activity-church', library: 'activity-library',
  guard: 'activity-guard', home: 'room', free: 'activity-free', walk: 'activity-walk', vacation: 'activity-sea',
  forest: 'battle-forest', ruins: 'battle-ruins', mountain: 'battle-mountain',
};
/** 有 14–15 岁（-teen）与 16–18 岁（-grown）版本的活动插画 */
const AGED_ACTIVITY = new Set(['activity-study', 'activity-art', 'activity-dance', 'activity-sword', 'activity-magic', 'activity-farm', 'activity-cafe', 'activity-library']);
/** 活动插画；传入年龄时，常用活动按年龄段换成对应版本，画面里的她不会一直是小时候的样子 */
export function activityArt(id: string, age = 10): string {
  const base = ACTIVITY_ART[id] ?? 'room';
  if (AGED_ACTIVITY.has(base) && age >= 14) return sceneAsset(`${base}-${age >= 16 ? 'grown' : 'teen'}`);
  return sceneAsset(base);
}
/** 冒险装立绘按年龄段 */
export function heroArt(age: number): string { return sceneAsset(age >= 16 ? 'battle-hero-grown' : age >= 14 ? 'battle-hero-teen' : 'battle-hero'); }
/** 收获祭插画按年龄段 */
export function festivalArt(age: number): string { return sceneAsset(`festival-${age >= 16 ? 'grown' : age >= 14 ? 'teen' : 'child'}`); }
/** 生日插画按（新的）年龄段：只有艾莉与一只养育者的手 */
export function birthdayArt(age: number): string { return sceneAsset(`birthday-${age >= 16 ? 'grown' : age >= 14 ? 'teen' : 'child'}`); }
/** 探索胜利后的收获插画 */
export function lootArt(region = 'forest'): string { return sceneAsset(`explore-${['ruins', 'mountain'].includes(region) ? region : 'forest'}-loot`); }
/** 城里的朋友：米拉与菲恩是同龄人，14 岁起换成少年版本 */
export function npcAsset(id: string, age: number, kind: 'portrait' | 'avatar' = 'avatar'): string {
  const stage = ['mira', 'fern'].includes(id) ? (age >= 14 ? '-teen' : '-child') : '';
  return sceneAsset(`npc-${id}${stage}${kind === 'avatar' ? '-avatar' : ''}`);
}

/** 2026-11 新增插画：主线 9 张、人物支线相识与最后一幕各 1 张、日常 6 张（可复用） */
const NEW_EVENT_ART: Record<string, string> = {
  main_1_1: 'main-wish', main_2_0: 'main-certificate', main_2_1: 'main-two-answers', main_4_0: 'main-own-schedule', main_4_1: 'main-decision',
  main_4_2: 'main-two-signatures', main_5_0: 'main-exhibit-key', main_5_1: 'main-broken-promise', main_5_2: 'main-behind-stand',
  side_mira_0: 'side-mira-1', side_mira_4: 'side-mira-2', side_rowan_0: 'side-rowan-1', side_rowan_4: 'side-rowan-2',
  side_nora_0: 'side-nora-1', side_nora_4: 'side-nora-2', side_fern_0: 'side-fern-1', side_fern_4: 'side-fern-2',
  daily_tired_cup: 'daily-tea', daily_quiet_trust: 'daily-tea', daily_summer_hat: 'daily-wind-hat', daily_dress_mirror: 'daily-mirror',
  daily_dance_steps: 'daily-mirror', daily_church_seed: 'daily-sprout', daily_spring_shoot: 'daily-sprout', daily_guard_gate: 'daily-gate',
  daily_ruins_mark: 'daily-cliff', daily_mountain_cloud: 'daily-cliff',
};
export function eventArt(id: string, fallback = 'room'): string {
  const art:Record<string,string>={kitten:'event-kitten',book:'event-stars',friend:'event-friend',sword:'activity-sword',painting:'activity-art',market:'event-market',flowers:'event-flowers',music:'activity-dance',lost:'battle-forest',exam:'activity-study',friendship:'event-friend',sewing:'event-sewing',mentor:'activity-sword',stage:'activity-dance',independent:'activity-cafe',choice:'event-letter',letter:'event-letter',portrait:'room',promise:'event-farewell',main_0_0:'event-key',main_0_1:'event-stars',main_0_2:'event-exhibition',main_1_0:'event-letter',main_1_2:'event-exhibition',main_2_2:'event-exhibition',main_3_0:'event-rain',main_3_1:'event-rain',main_3_2:'event-rain',main_6_0:'event-letter',main_6_1:'event-letter',main_6_2:'event-letter',main_7_0:'event-farewell',main_7_1:'event-farewell',main_7_2:'event-farewell'};
  return NEW_EVENT_ART[id] ?? art[id] ?? fallback;
}

/** 立绘统一归一化为同一画面高度，显示时按年龄身高缩放：10 岁 132cm 到 18 岁 163cm，每年都明显长高一点（略作夸张，便于看出成长）。 */
const HEIGHT_BY_AGE: Record<number, number> = { 10: 132, 11: 137, 12: 142, 13: 147, 14: 151, 15: 155, 16: 158, 17: 161, 18: 163 };
export function growthRatio(age: number): number {
  return (HEIGHT_BY_AGE[Math.max(10, Math.min(18, Math.floor(age)))] ?? 163) / 163;
}

/** AI 视频：竖版 MP4 与同名封面（视频第一帧），见 docs/stargarden/AI视频需求与提示词.md */
export function videoAsset(id: string): { src: string; poster: string } {
  return { src: `${ASSET_ROOT}video/${id}.mp4`, poster: `${ASSET_ROOT}video/${id}.webp` };
}
