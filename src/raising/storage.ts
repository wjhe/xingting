import { createState, deserialize } from './game';
import { ENDINGS } from './content';
import type { GameState, MetaState } from './types';

export const SAVE_KEY = 'stargarden_save_v1';
export const META_KEY = 'stargarden_meta_v1';
export function loadState(): { state: GameState; corrupted: boolean } {
  try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return { state: createState(), corrupted: false }; const state = deserialize(raw); return { state: state ?? createState(), corrupted: !state }; }
  catch { return { state: createState(), corrupted: true }; }
}
export function loadMeta(): MetaState {
  try { const v = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as MetaState | null;
    if (v?.version === 1 && Array.isArray(v.endings) && v.endings.every(id => ENDINGS.some(e => e.id === id)) && Number.isInteger(v.runs) && v.runs >= 0) return v;
  } catch { /* 损坏的收藏不影响本局继续。 */ }
  return { version: 1, endings: [], runs: 0 };
}
export function saveState(state: GameState): boolean { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; } }
export function saveMeta(meta: MetaState): boolean { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); return true; } catch { return false; } }
