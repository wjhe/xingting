import { Game } from '../core/game';
import { consumeOffer, emptyMeta, META_VERSION, settleLife, type MetaState, type Settlement } from '../core/meta';
import { deserialize, serialize } from '../core/save';
import type { Gender } from '../core/types';
import { CONTENT } from '../data';
import type { Platform } from '../platform/types';

const SAVE_KEY = 'wdcs_save_v1';
/** 轮回存档：跨世保存，不随转世清空 */
const META_KEY = 'wdcs_meta_v1';

export function loadGame(platform: Platform): Game | null {
  const state = deserialize(platform.storage.get(SAVE_KEY));
  return state ? new Game(state, CONTENT) : null;
}

export function saveGame(platform: Platform, game: Game): void {
  platform.storage.set(SAVE_KEY, serialize(game.state));
}

export function loadMeta(platform: Platform): MetaState {
  try {
    const m = JSON.parse(platform.storage.get(META_KEY) ?? '') as Partial<MetaState>;
    // 旧版只记录了 lives，缺的字段用默认值补上
    if (typeof m?.lives === 'number') return { ...emptyMeta(), ...m, version: META_VERSION };
  } catch {
    // 没有或损坏时从头开始
  }
  return emptyMeta();
}

export function saveMeta(platform: Platform, meta: MetaState): void {
  platform.storage.set(META_KEY, JSON.stringify(meta));
}

/** 结束当前这一世（无论是否已死）：结算轮回点、写入轮回存档、清除本世存档 */
export function endLife(platform: Platform, game: Game): Settlement {
  const meta = loadMeta(platform);
  const settlement = settleLife(meta, game);
  saveMeta(platform, meta);
  platform.storage.remove(SAVE_KEY);
  return settlement;
}

export function newGame(platform: Platform, name: string, gender: Gender, talents: string[]): Game {
  const meta = loadMeta(platform);
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  consumeOffer(meta);
  saveMeta(platform, meta);
  return Game.newGame(
    { name, gender, seed, life: meta.lives + 1, talents, metaFlags: meta.flags, lastTechnique: meta.lastTechnique },
    CONTENT,
  );
}
