import { Rng } from '../core/rng';
import { resolveAdventure } from './adventure';
import { ACTIVITIES, ENDINGS, EVENTS, OUTFITS, SHOP, KEEPSAKES } from './content';
import { eligible } from './story';
import { GROWTH_RATE, scaleGrowth, festivalTarget } from './balance';
import { AD_RUN_GOLD_CAP, MONTH_BONUS_CAP, MONTH_BONUS_RATE, START_BONUS, remainingAdGold } from './ads';
import { STAT_KEYS, type Activity, type GameState, type MonthResult, type Stats, type Stat } from './types';

// 每局八年；所有时间使用游戏月份，避免现实时间影响存档重现。
export const TOTAL_MONTHS = 96;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const emptyStats = (): Stats => ({ stamina: 40, intellect: 30, charm: 35, grace: 25, combat: 15, kindness: 45 });
/** 女儿的名字固定；玩家只选择自己是爸爸还是妈妈。 */
export const DAUGHTER_NAME = '艾莉';
export function createState(name = DAUGHTER_NAME, parent = '爸爸', seed = 20261031): GameState {
  return { version: 1, name: name.trim().slice(0, 8) || DAUGHTER_NAME, parent: parent.trim().slice(0, 8) || '爸爸', month: 0, gold: 600,
    stats: emptyStats(), stress: 8, bond: 60, rngState: seed >>> 0, plan: [null, null, null], diary: [], inventory: [], flags: [], talked: -1, gifted: -1,
    outfit: 'garden', pendingEvent: null, ended: false, ending: null, endingConfirmed: false, adGoldEarned: 0, activityCounts: {}, storyStartMonth: 0, relations: {} };
}

export class RaisingGame {
  constructor(public state: GameState, private readonly growthRate = GROWTH_RATE) {}
  /** 无随机波动、无疲惫时的日程预览，包含物品固定加成。 */
  previewGains(a: Activity): Partial<Stats> {
    const gains = scaleGrowth(a.gains, this.growthRate);
    if (this.state.inventory.includes('notebook') && a.category === 'learn') gains.intellect = (gains.intellect ?? 0) + 1;
    if (this.state.inventory.includes('ribbon') && a.category === 'learn') gains.charm = (gains.charm ?? 0) + 1;
    return gains;
  }
  get age(): number { return 10 + Math.floor(this.state.month / 12); }
  get calendar(): { year: number; month: number } { return { year: 1001 + Math.floor(this.state.month / 12), month: this.state.month % 12 + 1 }; }
  get season(): string { return ['冬', '春', '春', '春', '夏', '夏', '夏', '秋', '秋', '秋', '冬', '冬'][this.calendar.month - 1]!; }
  get nextBirthday(): number { return 12 - this.state.month % 12; }
  get activityMap(): Map<string, Activity> { return new Map(ACTIVITIES.map(a => [a.id, a])); }
  available(a: Activity): boolean { return this.age >= (a.age ?? 10) && (!a.unlock || this.state.stats[a.unlock.stat] >= a.unlock.value); }
  setPlan(slot: number, id: string | null): boolean {
    if (this.state.ended || this.state.pendingEvent || !Number.isInteger(slot) || slot < 0 || slot > 2) return false;
    if (id && (!this.activityMap.has(id) || !this.available(this.activityMap.get(id)!))) return false;
    this.state.plan[slot] = id;
    return true;
  }
  planIssue(): string | null {
    if (this.state.ended) return '这段成长旅程已经结束。';
    if (this.state.pendingEvent) return '先回应她的小小心事吧。';
    let gold = this.state.gold;
    for (let i = 0; i < 3; i++) {
      const a = this.activityMap.get(this.state.plan[i] ?? '');
      if (!a) return '请先安排完整的三段日程。';
      if (!this.available(a)) return `${a.name}还没有解锁。`;
      if (gold + a.gold < 0) return `第${i + 1}段的学费不足，可以先安排打工。`;
      gold += a.gold;
    }
    return null;
  }
  advance(): MonthResult[] {
    const issue = this.planIssue();
    if (issue) throw new Error(issue);
    const s = this.state;
    const rng = new Rng(s.rngState);
    const results: MonthResult[] = [];
    for (const id of s.plan) {
      const a = this.activityMap.get(id!)!;
      s.activityCounts[a.id] = (s.activityCounts[a.id] ?? 0) + 1;
      const tired = s.stress >= 75 && a.category !== 'rest';
      const gains: Partial<Stats> = {};
      for (const key of STAT_KEYS) {
        const base = a.gains[key] ?? 0;
        if (base) gains[key] = Math.max(1, Math.round((base + rng.int(-1, 2)) * (tired ? 0.5 : 1)));
      }
      const scaledGains = scaleGrowth(gains, this.growthRate);
      if (s.inventory.includes('notebook') && a.category === 'learn') scaledGains.intellect = (scaledGains.intellect ?? 0) + 1;
      if (s.inventory.includes('ribbon') && a.category === 'learn') scaledGains.charm = (scaledGains.charm ?? 0) + 1;
      let stress = a.stress;
      if (s.inventory.includes('boots') && a.category === 'adventure') stress -= 5;
      if (s.inventory.includes('teaset') && a.category === 'rest') stress -= 5;
      if (a.id === 'vacation') s.bond = clamp(s.bond + 4, 0, 100);
      const battle = a.category === 'adventure' ? resolveAdventure(s.stats, a.id, rng) : undefined;
      const gold = a.gold + (battle?.reward ?? 0);
      if (battle && !battle.victory) stress += 6;
      s.gold += gold;
      this.applyStats(scaledGains);
      const stressBefore = s.stress;
      s.stress = clamp(s.stress + stress, 0, 100);
      const text = battle ? battle.victory ? `遇到了${battle.enemy}，她勇敢地赢下交锋！采集收益与额外奖励已收入行囊。` : `遇到了${battle.enemy}，她选择安全撤退。带回了沿途采集的小物，也积累了经验。` : a.description;
      results.push({ title: a.name, icon: a.icon, text: `${text}${tired ? ' 有些疲惫，基础能力收获减半。' : ''}`, gains: scaledGains, gold, stress: s.stress - stressBefore, ...(battle ? { battle } : {}) });
    }
    const completedMonth = s.month;
    const calMonth = this.calendar.month;
    s.gold += 40; // 每月家庭收入 80，固定生活费 40，合并记账以避免负余额。
    results.push({ title: '家庭账本', icon: 'coin', text: '家庭补贴 +80 G，日常生活费 −40 G。', gains: {}, gold: 40, stress: 0 });
    this.addDiary('month', '这个月的小小脚印', results.filter(r => r.title !== '家庭账本').map(r => r.title).join(' · '));
    if (calMonth === 9) {
      const best = STAT_KEYS.reduce((a, b) => s.stats[a] > s.stats[b] ? a : b);
      const score = s.stats[best];
      const won = score >= festivalTarget(Math.floor(s.month / 12));
      const prize = won ? 200 : 50;
      s.gold += prize;
      if (won) s.bond = clamp(s.bond + 5, 0, 100);
      const text = won ? '她在收获祭的展示赛中获得优胜！笑着向你挥手的那一刻，整个秋天都亮了。' : '你们一起参加了收获祭，吃了热乎乎的南瓜派，还收到了纪念礼物。';
      this.addDiary('festival', won ? '收获祭 · 闪光的奖章' : '收获祭 · 秋日来信', text);
      results.push({ title: '一年一度的收获祭', icon: 'trophy', text, gains: {}, gold: prize, stress: 0 });
    }
    s.month++;
    if (s.tryOn && s.month >= s.tryOn.until) { s.outfit = s.tryOn.restore; delete s.tryOn; }
    if (s.month % 12 === 0) {
      s.bond = clamp(s.bond + 5, 0, 100);
      const text = `蜡烛又多了一根。${s.name}许完愿，笑着说：“明年也要一起过生日。”`;
      this.addDiary('birthday', `${this.age}岁的生日`, text);
      results.push({ title: `${this.age}岁，生日快乐`, icon: 'gift', text, gains: {}, gold: 0, stress: 0 });
    }
    s.plan = [null, null, null];
    if (s.month >= TOTAL_MONTHS) {
      s.ended = true;
      s.ending = this.resolveEnding().id;
      s.endingConfirmed = this.eligibleEndings().length === 1;
    } else {
      const pool = EVENTS.filter(e => eligible(e, s));
      const main = pool.filter(e => e.kind === 'main').sort((a,b) => a.dueMonth! - b.dueMonth!)[0];
      const side = pool.filter(e => e.kind === 'side');
      // One event per month: due main chapters first, then a varied pool of unlocked side/daily events.
      if (main) s.pendingEvent = main.id;
      else if (pool.length && (completedMonth === 0 || rng.chance(.8))) {
        const candidates = side.length && rng.chance(.55) ? side : pool;
        s.pendingEvent = candidates[rng.int(0, candidates.length - 1)]!.id;
      }
    }
    s.rngState = rng.state;
    return results;
  }
  choose(index: number): string {
    const event = EVENTS.find(e => e.id === this.state.pendingEvent);
    const choice = event?.choices[index];
    if (!event || !choice || !Number.isInteger(index)) throw new Error('这个选项已不可用。');
    const o = choice.outcome;
    if ((o.gold ?? 0) + this.state.gold < 0) throw new Error('金币不足，试试另一个选择。');
    this.state.gold += o.gold ?? 0;
    this.applyStats(scaleGrowth(o.gains ?? {}, this.growthRate));
    this.state.stress = clamp(this.state.stress + (o.stress ?? 0), 0, 100);
    this.state.bond = clamp(this.state.bond + (o.bond ?? 0), 0, 100);
    if (o.relation) this.state.relations[o.relation.id] = clamp((this.state.relations[o.relation.id] ?? 0) + o.relation.value,0,100);
    this.state.flags.push(`event:${event.id}`);
    if (o.flag && !this.state.flags.includes(o.flag)) this.state.flags.push(o.flag);
    this.state.pendingEvent = null;
    this.addDiary('story', event.title, o.text);
    return o.text;
  }
  talk(): string {
    const s = this.state;
    if (s.ended) return '她已经长大，但你们的故事会一直继续。';
    if (s.talked === s.month) return '今天已经聊过心事啦。下个月再听听她的新故事吧。';
    s.talked = s.month; s.bond = clamp(s.bond + 3, 0, 100); s.stress = clamp(s.stress - 5, 0, 100);
    const lines = ['今天路过花店，我看到一朵和你笑起来很像的花。', '长大以后，我想住在能看到星星的地方……最好也有你。', '我有在认真努力哦！不过偶尔，也想和你一起发呆。', '如果愿望可以装进口袋，我想把每一天都带在身上。', '今天也辛苦啦。等我学会做点心，就做给你吃。'];
    const text = lines[s.month % lines.length]!;
    this.addDiary('story', '庭院悄悄话', text);
    return text;
  }
  /** free：看视频换来的免费礼物，不扣 40 G，效果相同 */
  gift(free = false): string {
    const s = this.state;
    if (s.ended) throw new Error('这段旅程已经圆满结束。');
    if (s.gifted === s.month) throw new Error('这个月已经送过礼物了，陪伴也很珍贵。');
    if (!free && s.gold < 40) throw new Error('需要 40 G 才能购买一份小礼物。');
    if (!free) s.gold -= 40;
    s.gifted = s.month; s.bond = clamp(s.bond + 7, 0, 100); s.stress = clamp(s.stress - 8, 0, 100);
    this.addDiary('gift', '装在纸袋里的心意', '一小盒蜂蜜饼干，换来一个紧紧的拥抱。');
    return '“是我最喜欢的蜂蜜饼干！谢谢你。” 亲密 +7，压力 −8。';
  }
  buy(id: string): string {
    if (this.state.ended) throw new Error('这段旅程已经圆满结束。');
    const item = SHOP.find(i => i.id === id);
    if (!item) throw new Error('商品不存在。');
    if (this.state.inventory.includes(id)) throw new Error('已经拥有这件物品了。');
    if (this.state.gold < item.price) throw new Error('金币还不够，可以安排一些打工。');
    this.state.gold -= item.price; this.state.inventory.push(id);
    return `已获得${item.name}，效果自动生效。`;
  }
  buyKeepsake(id: string): string {
    const s = this.state, item = KEEPSAKES.find(i => i.id === id);
    if (s.ended) throw new Error('这段旅程已经圆满结束。');
    if (!item || s.month < item.availableMonth) throw new Error('这份纪念还没有来到。');
    if (s.inventory.includes(`keepsake:${id}`)) throw new Error('已经珍藏过这份纪念了。');
    if (s.gold < item.price) throw new Error('金币还不够，慢慢攒也来得及。');
    s.gold -= item.price; s.inventory.push(`keepsake:${id}`);
    this.addDiary('story', item.name, item.description);
    return `已珍藏「${item.name}」，可以在手账里重温。`;
  }
  wear(id: string): string {
    if (this.state.ended) throw new Error('这段旅程已经圆满结束。');
    const outfit = OUTFITS.find(o => o.id === id);
    if (!outfit) throw new Error('没有这件衣装。');
    const had = id === 'garden' || this.state.inventory.includes(`outfit:${id}`);
    this.buyOutfit(id);
    this.state.outfit = id;
    delete this.state.tryOn;
    return had ? `已换上「${outfit.name}」。` : `已买下并换上「${outfit.name}」（−${outfit.price} G）。`;
  }
  /** 看视频试穿一个游戏月：月底自动换回；不算拥有，也不影响服装相关事件条件 */
  tryOutfit(id: string): string {
    const s = this.state;
    const outfit = OUTFITS.find(o => o.id === id);
    if (s.ended) throw new Error('这段旅程已经圆满结束。');
    if (!outfit) throw new Error('没有这件衣装。');
    if (id === 'garden' || s.inventory.includes(`outfit:${id}`)) throw new Error('这件衣装已经拥有，可以直接换上。');
    s.tryOn = { outfit: id, restore: s.tryOn?.restore ?? s.outfit, until: s.month + 1 };
    s.outfit = id;
    return `试穿「${outfit.name}」到这个月底。喜欢的话，可以去集市买下它。`;
  }
  /** 事件条件与存档里“真正穿着”的衣装：试穿期间按原来的衣装算 */
  get realOutfit(): string { return this.state.tryOn?.restore ?? this.state.outfit; }
  /** 本月结算里，广告可加成的打工收入：只算打工活动的学费/薪水，不含交锋奖励与家庭补贴 */
  monthWorkIncome(results: MonthResult[]): number {
    return results.reduce((sum, r) => { const a = ACTIVITIES.find(x => x.name === r.title); return sum + (a?.category === 'work' && a.gold > 0 ? a.gold : 0); }, 0);
  }
  /** 看视频后的月度加成：打工收入的 50%，最多 80 G；没有打工收入时不可用 */
  monthBonus(results: MonthResult[]): number {
    if (this.state.ended) throw new Error('这段旅程已经圆满结束。');
    const amount = Math.min(MONTH_BONUS_CAP, Math.round(this.monthWorkIncome(results) * MONTH_BONUS_RATE));
    if (amount <= 0) throw new Error('这个月没有打工收入。');
    return this.grantAdGold(amount);
  }
  /** 看视频后的“陪她散步”：压力 −15，不占日程格 */
  stroll(): string {
    const s = this.state;
    if (s.ended) throw new Error('这段旅程已经圆满结束。');
    s.stress = clamp(s.stress - 15, 0, 100);
    this.addDiary('story', '一起散步的傍晚', '你们沿着花园小径慢慢走了一圈。她说，肩上的重量好像轻了一点。');
    return '她深深吸了一口气，笑着说：“好像没那么累了。” 压力 −15。';
  }
  /** 新周目的启程礼金 */
  startBonus(): number {
    if (this.state.ended) throw new Error('这段旅程已经圆满结束。');
    return this.grantAdGold(START_BONUS);
  }
  private grantAdGold(amount: number): number {
    const credited = Math.min(amount, remainingAdGold(this.state));
    this.state.gold += credited;
    this.state.adGoldEarned = (this.state.adGoldEarned ?? 0) + credited;
    return credited;
  }
  /** 回到上个月开始前，保留已消耗的广告次数和金币额度。 */
  restoreMonth(snapshot: GameState): void {
    if (this.state.ended || snapshot.ended || snapshot.month !== this.state.month - 1) throw new Error('只能回溯刚刚结束的月份。');
    const spent = this.state.ads, earned = this.state.adGoldEarned ?? 0;
    const restored = structuredClone(snapshot);
    restored.adGoldEarned = Math.max(restored.adGoldEarned ?? 0, earned);
    if (spent) restored.ads = { month: restored.month, used: [...new Set([...(restored.ads?.used ?? []), ...spent.used])], run: [...new Set([...(restored.ads?.run ?? []), ...spent.run])] };
    this.state = restored;
  }
  /**
   * 看视频后重来一次交锋，按新结果结算：赢了补发奖励并收回失败时多出的 6 点压力；再输一次则不变。
   * 每次交锋只能重来一次（result.retried）。返回更新后的这一项结算。
   */
  retryBattle(result: MonthResult): MonthResult {
    const s = this.state;
    if (s.ended) throw new Error('这段旅程已经圆满结束。');
    const old = result.battle;
    if (!old || old.victory) throw new Error('这次交锋已经赢下了。');
    if (result.retried) throw new Error('这次交锋已经重来过一次了。');
    const rng = new Rng(s.rngState);
    const replay = resolveAdventure(s.stats, old.region ?? 'forest', rng);
    s.rngState = rng.state;
    result.retried = true;
    result.battle = replay;
    if (replay.victory) {
      replay.reward = this.grantAdGold(replay.reward);
      const before = s.stress;
      s.stress = clamp(s.stress - 6, 0, 100);
      result.gold += replay.reward;
      result.stress += s.stress - before;
      result.text = `遇到了${replay.enemy}，她再次鼓起勇气，赢下了交锋！采集收益与额外奖励已收入行囊。`;
    } else {
      result.text = `遇到了${replay.enemy}，她又一次安全撤退。下次一定会更有把握。`;
    }
    return result;
  }
  buyOutfit(id: string): string {
    if (this.state.ended) throw new Error('这段旅程已经圆满结束。');
    const outfit = OUTFITS.find(o => o.id === id);
    if (!outfit) throw new Error('没有这件衣装。');
    if (id !== 'garden' && !this.state.inventory.includes(`outfit:${id}`)) {
      if (this.state.gold < outfit.price) throw new Error('金币还不够。');
      this.state.gold -= outfit.price; this.state.inventory.push(`outfit:${id}`);
      // 买下正在试穿的这件：直接成为正式衣装，不再自动换回
      if (this.state.tryOn?.outfit === id) delete this.state.tryOn;
    }
    return `「${outfit.name}」已收入衣橱，各年龄适配款一并拥有。`;
  }
  eligibleEndings() { return [...ENDINGS].sort((a, b) => b.priority - a.priority).filter(e => STAT_KEYS.every(k => this.state.stats[k] >= (e.requires[k] ?? 0)) && this.state.bond >= (e.bond ?? 0)); }
  resolveEnding() { return this.eligibleEndings()[0]!; }
  confirmEnding(id: string): void {
    if (!this.state.ended) throw new Error('等她成年，再一起决定未来吧。');
    if (this.state.endingConfirmed) throw new Error('这一段未来已经写进手账。');
    if (!this.eligibleEndings().some(e => e.id === id)) throw new Error('还没有满足这条未来的条件。');
    this.state.ending = id; this.state.endingConfirmed = true;
  }
  private applyStats(gains: Partial<Stats>): void { for (const k of STAT_KEYS) this.state.stats[k] = clamp(this.state.stats[k] + (gains[k] ?? 0), 0, 999); }
  private addDiary(kind: GameState['diary'][number]['kind'], title: string, text: string): void { this.state.diary.unshift({ month: this.state.month, kind, title, text }); this.state.diary = this.state.diary.slice(0, 400); }
}

export function deserialize(raw: string): GameState | null {
  try {
    const s: unknown = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    const v = s as GameState;
    if (v.version !== 1 || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 8 || typeof v.parent !== 'string' || v.parent.length > 8) return null;
    for (const [key, min, max] of [['month', 0, TOTAL_MONTHS], ['gold', 0, 1e8], ['stress', 0, 100], ['bond', 0, 100], ['rngState', 0, 4294967295], ['talked', -1, TOTAL_MONTHS], ['gifted', -1, TOTAL_MONTHS]] as const) {
      if (!Number.isInteger(v[key]) || v[key] < min || v[key] > max) return null;
    }
    if (!v.stats || !STAT_KEYS.every(k => Number.isInteger(v.stats[k]) && v.stats[k] >= 0 && v.stats[k] <= 999)) return null;
    if (!Array.isArray(v.plan) || v.plan.length !== 3 || !v.plan.every(id => id === null || ACTIVITIES.some(a => a.id === id))) return null;
    if (!Array.isArray(v.inventory) || !v.inventory.every(i => typeof i === 'string') || !Array.isArray(v.flags) || !v.flags.every(f => typeof f === 'string')) return null;
    if (!OUTFITS.some(o => o.id === v.outfit) || typeof v.ended !== 'boolean' || v.ended !== (v.month === TOTAL_MONTHS)) return null;
    if (v.ending !== null && !ENDINGS.some(e => e.id === v.ending)) return null;
    if (v.ended && (!v.ending || v.pendingEvent !== null)) return null;
    // 新字段向后兼容，旧已结局档保持原结局；迁移不扣减已有能力和金币。
    if (v.endingConfirmed === undefined) v.endingConfirmed = v.ended;
    if (typeof v.endingConfirmed !== 'boolean' || (!v.ended && v.endingConfirmed)) return null;
    if (v.adGoldEarned === undefined) v.adGoldEarned = 0;
    if (!Number.isInteger(v.adGoldEarned) || v.adGoldEarned < 0 || v.adGoldEarned > AD_RUN_GOLD_CAP) return null;
    if (v.pendingEvent !== null && !EVENTS.some(e => e.id === v.pendingEvent)) return null;
    if (!Array.isArray(v.diary) || !v.diary.every(d => d && Number.isInteger(d.month) && d.month >= 0 && d.month <= TOTAL_MONTHS && typeof d.title === 'string' && typeof d.text === 'string' && ['month', 'story', 'birthday', 'festival', 'gift'].includes(d.kind))) return null;
    // Additive migration: earlier saves begin new main chapters from their current month.
    if (v.activityCounts === undefined) v.activityCounts = {};
    if (!v.activityCounts || typeof v.activityCounts !== 'object' || Array.isArray(v.activityCounts) || !Object.entries(v.activityCounts).every(([id,count]) => ACTIVITIES.some(a=>a.id===id) && Number.isInteger(count) && count>=0 && count<=TOTAL_MONTHS*3)) return null;
    // 广告记录与试穿都是可选字段：形状不对就丢弃，不影响读档
    if (v.ads !== undefined && !(v.ads && Number.isInteger(v.ads.month) && Array.isArray(v.ads.used) && v.ads.used.every(x => typeof x === 'string') && Array.isArray(v.ads.run) && v.ads.run.every(x => typeof x === 'string'))) delete v.ads;
    if (v.tryOn !== undefined && !(v.tryOn && OUTFITS.some(o => o.id === v.tryOn!.outfit) && OUTFITS.some(o => o.id === v.tryOn!.restore) && Number.isInteger(v.tryOn.until))) { if (v.tryOn && OUTFITS.some(o => o.id === v.tryOn!.restore)) v.outfit = v.tryOn.restore; delete v.tryOn; }
    if (v.storyStartMonth === undefined) v.storyStartMonth = v.month;
    if (!Number.isInteger(v.storyStartMonth) || v.storyStartMonth<0 || v.storyStartMonth>v.month) return null;
    if (v.relations === undefined) v.relations = {};
    if (!v.relations || typeof v.relations !== 'object' || Array.isArray(v.relations) || !Object.entries(v.relations).every(([id,value])=>['mira','rowan','nora','fern'].includes(id) && Number.isInteger(value) && value>=0 && value<=100)) return null;
    return v;
  } catch { return null; }
}

export function statChanges(gains: Partial<Stats>): [Stat, number][] { return STAT_KEYS.filter(k => gains[k]).map(k => [k, gains[k]!] as [Stat, number]); }
