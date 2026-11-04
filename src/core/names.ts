import type { Rng } from './rng';
import type { Gender } from './types';

const SURNAMES = '林叶秦苏顾沈陆萧韩方白楚云柳江宁温谢陈李王张'.split('');
const MALE = '逸 风 尘 远 寒 玄 衡 渊 澜 羽 霄 舟 恒 墨 青 岳 川 辰'.split(' ');
const FEMALE = '若 雪 婉 清 灵 月 瑶 霜 烟 素 音 晚 漪 宁 岚 汐 芷 鸢'.split(' ');

export function randomName(rng: Rng, gender: Gender): string {
  const pool = gender === 'male' ? MALE : FEMALE;
  const pick = <T>(arr: T[]) => arr[rng.int(0, arr.length - 1)];
  const given = rng.chance(0.6) ? pick(pool) + pick(pool) : pick(pool);
  return pick(SURNAMES) + given;
}
