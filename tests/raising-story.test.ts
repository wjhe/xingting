import { describe, expect, it } from 'vitest';
import { ACTIVITIES, EVENTS, OUTFITS } from '../src/raising/content';
import { createState, deserialize, RaisingGame } from '../src/raising/game';
import { eligible, MAIN_EVENTS, SIDE_EVENTS, storyText } from '../src/raising/story';

describe('成长主线、条件事件与新衣装', () => {
  it('80 个事件编号唯一，每个事件都有无需付费的出口', () => {
    expect(EVENTS).toHaveLength(80);
    expect(new Set(EVENTS.map(e=>e.id)).size).toBe(80);
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      expect(e.choices.some(c=>(c.outcome.gold??0)>=0)).toBe(true);
      for(const id of Object.keys(e.conditions?.activities??{})) expect(ACTIVITIES.some(a=>a.id===id)).toBe(true);
      for(const flag of e.conditions?.flags??[]) if(flag.startsWith('event:')) expect(EVENTS.some(p=>`event:${p.id}`===flag)).toBe(true);
    }
  });
  it('不同培养路线都能在成年前完成 24 个主线节点', () => {
    for(const route of [['farm','home','home'],['literature','farm','home'],['forest','farm','home']]) {
      const g=new RaisingGame(createState('艾莉','家长',100));
      for(let month=0;month<96;month++) {
        if(g.state.pendingEvent)g.choose(0);
        route.forEach((id,i)=>expect(g.setPlan(i,id)).toBe(true));g.advance();
      }
      expect(MAIN_EVENTS.every(e=>g.state.flags.includes(`event:${e.id}`))).toBe(true);
      expect(g.state.ended).toBe(true);
    }
  });
  it('主线在到期月份优先出现，不重复，也不阻断日程恢复', () => {
    const g=new RaisingGame(createState());
    ['farm','home','home'].forEach((id,i)=>g.setPlan(i,id));g.advance();
    expect(g.state.pendingEvent).toBe('main_0_0');
    g.choose(0);expect(eligible(MAIN_EVENTS[0]!,g.state)).toBe(false);
    expect(g.setPlan(0,'home')).toBe(true);
  });
  it('人物支线需要前序经历和课程次数，每一节点都可达', () => {
    for(const event of SIDE_EVENTS) {
      const state=createState();state.month=((event.minAge??10)-10)*12;
      state.activityCounts={...event.conditions?.activities};
      expect(eligible(event,state)).toBe(!event.conditions?.flags?.length);
      state.flags=[...(event.conditions?.flags??[])];
      expect(eligible(event,state)).toBe(true);
      state.flags.push(`event:${event.id}`);expect(eligible(event,state)).toBe(false);
    }
  });
  it('服装事件同时检查季节与穿着，压力事件只在高压时出现', () => {
    const state=createState();const summer=EVENTS.find(e=>e.id==='daily_summer_hat')!;
    state.month=4;state.outfit='summer';expect(eligible(summer,state)).toBe(true);
    state.month=0;expect(eligible(summer,state)).toBe(false);
    state.month=4;state.outfit='garden';expect(eligible(summer,state)).toBe(false);
    const tired=EVENTS.find(e=>e.id==='daily_tired_cup')!;
    expect(eligible(tired,state)).toBe(false);state.stress=80;expect(eligible(tired,state)).toBe(true);
  });
  it('购买与穿着分开，重复购买不扣款，成长后继续拥有适配款', () => {
    const g=new RaisingGame(createState());g.buyOutfit('summer');
    expect(g.state.outfit).toBe('garden');expect(g.state.gold).toBe(380);
    g.buyOutfit('summer');expect(g.state.gold).toBe(380);g.wear('summer');
    expect(g.state.outfit).toBe('summer');expect(g.state.gold).toBe(380);
    g.state.month=72;g.wear('summer');expect(g.state.gold).toBe(380);
    const before=JSON.stringify(g.state);expect(()=>g.buyOutfit('missing')).toThrow();expect(JSON.stringify(g.state)).toBe(before);
    g.state.gold=0;expect(()=>g.buyOutfit('festival')).toThrow();expect(g.state.inventory).not.toContain('outfit:festival');
    expect(OUTFITS.filter(o=>['summer','winter','festival'].includes(o.id))).toHaveLength(3);
  });
  it('旧存档安全迁移，坏的活动计数不导入，旧周目不强塞早年主线', () => {
    const old:Record<string,unknown>={...createState(),month:60};delete old.activityCounts;delete old.storyStartMonth;
    const migrated=deserialize(JSON.stringify(old))!;expect(migrated.activityCounts).toEqual({});expect(migrated.storyStartMonth).toBe(60);
    expect(eligible(MAIN_EVENTS[0]!,migrated)).toBe(false);
    expect(deserialize(JSON.stringify({...migrated,activityCounts:{farm:-1}}))).toBeNull();
    expect(deserialize(JSON.stringify({...migrated,activityCounts:[]}))).toBeNull();
    expect(deserialize(JSON.stringify({...migrated,storyStartMonth:61}))).toBeNull();
  });
  it('后期剧情记住早期选择，名字替换不会遗漏', () => {
    const state=createState('小星');state.flags=['first_exhibition:warm','repaired_page:warm'];
    const text=storyText(MAIN_EVENTS[MAIN_EVENTS.length-1]!,state);
    expect(text).toContain('小星');expect(text).toContain('生活展台');expect(text).toContain('修补过');
  });
  it('人物选择积累不同羁绊，存档保留关系并拒绝非法关系值', () => {
    const a=new RaisingGame(createState()),b=new RaisingGame(createState());
    a.state.pendingEvent=b.state.pendingEvent='side_mira_0';a.choose(0);b.choose(1);
    expect(a.state.relations.mira).toBe(12);expect(b.state.relations.mira).toBe(8);
    expect(deserialize(JSON.stringify(a.state))!.relations.mira).toBe(12);
    expect(deserialize(JSON.stringify({...a.state,relations:{mira:101}}))).toBeNull();
    expect(deserialize(JSON.stringify({...a.state,relations:{unknown:20}}))).toBeNull();
    const old={...a.state} as Partial<typeof a.state>;delete old.relations;
    expect(deserialize(JSON.stringify(old))!.relations).toEqual({});
  });
});
