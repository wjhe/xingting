import { SAVE_VERSION } from './game';
import type { GameState } from './types';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** 解析失败或版本不符时返回 null，由调用方决定是否开新档 */
export function deserialize(raw: string | null | undefined): GameState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as GameState;
    if (data?.version !== SAVE_VERSION || !data.character) return null;
    return data;
  } catch {
    return null;
  }
}
