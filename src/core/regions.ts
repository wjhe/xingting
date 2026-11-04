import type { RealmId } from './types';

export interface RegionDef {
  id: string;
  name: string;
  desc: string;
  /** 推荐境界，仅用于提示 */
  hint: string;
  /** 是否有坊市 */
  market?: boolean;
  /** 推荐的最低境界：低于它仍可前往，但会提醒 */
  minRealm?: RealmId;
  /** 历练时可能顺手采到的灵草：[物品 id, 权重] */
  herbs?: [string, number][];
}

export const REGIONS: RegionDef[] = [
  { id: 'qingshi_village', name: '青石村', hint: '凡人', desc: '山脚下的小村落，民风淳朴。', herbs: [['herb_qingling', 1]] },
  { id: 'luoxia_mountain', name: '落霞山', hint: '炼气', desc: '云霞缭绕，灵草与妖兽并存。', herbs: [['herb_qingling', 3], ['herb_chixue', 2]] },
  { id: 'qingyun_market', name: '青云坊市', hint: '交易', desc: '散修云集之地，丹药、典籍应有尽有。', market: true },
  { id: 'heifeng_valley', name: '黑风谷', hint: '筑基', minRealm: 'zhuji', desc: '终年黑风呼啸，劫修与古修遗迹并存，九死一生。', herbs: [['herb_chixue', 2], ['herb_zhuguo', 3], ['miasma_herb', 1]] },
  { id: 'yunmeng_marsh', name: '云梦泽', hint: '金丹', minRealm: 'jindan', desc: '八百里水泽烟波浩渺，蛟龙潜渊，上古遗府沉于泽底。', herbs: [['herb_zhuguo', 2], ['herb_zizhi', 3]] },
  { id: 'beiming_sea', name: '北冥海', hint: '元婴', minRealm: 'yuanying', desc: '北冥有鱼，其名为鲲。万里沧溟之上，散落着上古仙岛。', herbs: [['herb_zizhi', 2], ['herb_haixin', 3]] },
  { id: 'kunlun_ruins', name: '昆仑墟', hint: '化神', minRealm: 'huashen', desc: '万山之祖，上古仙门的废墟。天柱折断处，雷云终年不散。', herbs: [['herb_haixin', 3], ['herb_wuse', 1]] },
];

export function getRegion(id: string): RegionDef {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}
