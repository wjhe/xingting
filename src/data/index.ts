import type { Content } from '../core/game';
import type { EndingDef, EnemyDef, EventDef, ItemDef, RecipeDef, ShopEntry, TalentDef, TechniqueDef } from '../core/types';
import endings from './endings.json';
import enemies from './enemies.json';
import base from './events/base.json';
import main from './events/main.json';
import market from './events/market_m2.json';
import mountain from './events/mountain_m2.json';
import valley from './events/valley_m2.json';
import village from './events/village_m2.json';
import m3High from './events/m3_high.json';
import p1Core from './events/p1_core.json';
import m5Beiming from './events/m5_beiming.json';
import m5Kunlun from './events/m5_kunlun.json';
import p2Alchemy from './events/p2_alchemy.json';
import e2Luoxia from './events/e2_luoxia.json';
import e2Town from './events/e2_town.json';
import e2Lives from './events/e2_lives.json';
import e2Heifeng from './events/e2_heifeng.json';
import e2Yunmeng from './events/e2_yunmeng.json';
import p3Break from './events/p3_break.json';
import p3Recipes from './events/p3_recipes.json';
import m4MarshEdge from './events/m4_marsh_edge.json';
import m3Low from './events/m3_low.json';
import m3Mid from './events/m3_mid.json';
import m4People from './events/m4_people.json';
import m4Realm from './events/m4_realm.json';
import yunmeng from './events/yunmeng.json';
import items from './items.json';
import recipes from './recipes.json';
import shop from './shop.json';
import talents from './talents.json';
import techniques from './techniques.json';

/** 新增事件文件后在这里登记 */
const EVENT_FILES = [base, village, mountain, market, valley, yunmeng, main, m3Low, m3Mid, m3High, m4Realm, m4People, m4MarshEdge, p1Core, m5Beiming, m5Kunlun, p2Alchemy, e2Luoxia, e2Town, e2Lives, e2Heifeng, e2Yunmeng, p3Break, p3Recipes];

export const CONTENT: Content = {
  events: EVENT_FILES.flat() as EventDef[],
  items: items as ItemDef[],
  techniques: techniques as TechniqueDef[],
  enemies: enemies as EnemyDef[],
  shop: shop as ShopEntry[],
  talents: talents as TalentDef[],
  endings: endings as EndingDef[],
  recipes: recipes as unknown as RecipeDef[],
};
