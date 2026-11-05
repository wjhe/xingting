import { ACTIVITIES, ENDINGS, EVENTS, OUTFITS, SHOP, STAT_INFO } from './content';
import { createState, DAUGHTER_NAME, RaisingGame, statChanges, TOTAL_MONTHS } from './game';
import { icon } from './icons';
import { loadMeta, loadState, saveMeta, saveState } from './storage';
import { createStage } from './stage';
import { videoAsset, activityArt, birthdayArt, festivalArt, heroArt, lootArt, npcAsset, bodyAsset, growthRatio, eventArt, eventExpression, faceAsset, outfitAsset, roomArt, setRoomSeason, TOWN_ART, sceneAsset, NEW_OUTFITS } from './art';
import { STAT_KEYS, type Stat as StatKey, type BattleReplay, type Category, type MonthResult } from './types';
import { CHAPTERS, PEOPLE, storyOutcomeVoiceSequence, storyText, storyVoiceSequence } from './story';
import { GameSound, type SoundName } from './sound';
import { DialogueVoice } from './voice';
import { playOpening } from './opening';
import { playTimelapse } from './timelapse';
import { MusicPlayer, type Track } from './music';
import './style.css';
import './classic.css';
import './storybook.css';
import './home-layout.css';
import './pages.css';

type Page = 'home' | 'schedule' | 'town' | 'diary' | 'wardrobe';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const signed = (n: number) => n > 0 ? `+${n}` : `${n}`;
const categoryNames: Record<Category, string> = { learn: '学习课程', work: '打工赚钱', rest: '休息放松', adventure: '外出探索' };
const categoryIcons: Record<Category, string> = { learn: 'book', work: 'coin', rest: 'cup', adventure: 'compass' };
const nav: [Page, string, string][] = [['home', 'home', '庭院'], ['diary', 'book', '手账'], ['town', 'castle', '城镇'], ['wardrobe', 'wardrobe', '衣橱']];

export function startRaisingGame(root: HTMLElement): void {
  const INTRO_KEY = 'stargarden_intro_v1';
  // 第一次打开（没有存档、也没看过开场）时播放开场剧情。
  const firstRun = (() => { try { return !localStorage.getItem('stargarden_save_v1') && !localStorage.getItem(INTRO_KEY); } catch { return false; } })();
  /** 第一次打开、开场还没完成时不写存档：中途刷新会重新播放开场，而不是留下一份没取名的存档。 */
  let awaitingOpening = firstRun;
  const loaded = loadState();
  // 女儿的名字固定为“艾莉”（配音与剧情都按这个名字制作）；旧存档里的自定义名字统一改回。
  if (loaded.state.name !== DAUGHTER_NAME) loaded.state.name = DAUGHTER_NAME;
  let game = new RaisingGame(loaded.state);
  let meta = loadMeta();
  const voiceParent = (): '爸爸' | '妈妈' => game.state.parent === '妈妈' ? '妈妈' : '爸爸';
  let page: Page = 'home';
  let activeSlot = 0;
  let category: Category = 'learn';
  let journalTab = 'diary';
  let stage: ReturnType<typeof createStage> | null = null;
  let stageKey = '';
  /** 本月结算让压力刚达到 75：月度总结出现时播放提醒音 */
  let stressWarnPending = false;
  let toastTimer: ReturnType<typeof setTimeout>;
  const sound = new GameSound();
  const voicePrefs = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('stargarden_voice_v1') ?? '{}');
      return {
        enabled: saved.enabled !== false,
        volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 1,
      };
    } catch {
      return { enabled: true, volume: 1 };
    }
  })();
  let voiceEnabled = voicePrefs.enabled;
  const saveVoice = () => { try { localStorage.setItem('stargarden_voice_v1', JSON.stringify({ enabled: voiceEnabled, volume: voicePrefs.volume })); } catch { /* Optional preference. */ } };
  const dialogueVoice = new DialogueVoice();
  dialogueVoice.setEnabled(voiceEnabled);
  dialogueVoice.setVolume(voicePrefs.volume);
  const musicPrefs = (() => { try { const v = JSON.parse(localStorage.getItem('stargarden_music_v1') ?? '{}'); /* 第 2 版起才是正式音乐；旧版（合成占位旋律、默认关闭）存下的“关”不作数，只保留音量 */ return { enabled: v.v === 2 ? v.enabled !== false : true, volume: typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : .5 }; } catch { return { enabled: false, volume: .5 }; } })();
  let musicEnabled = false;
  const saveMusic = () => { try { localStorage.setItem('stargarden_music_v1', JSON.stringify({ v: 2, enabled: musicEnabled, volume: musicPrefs.volume })); } catch { /* 偏好可选 */ } };
  const music = new MusicPlayer();
  dialogueVoice.onActiveChange = active => music.setVoiceDucked(active);
  music.setVolume(musicPrefs.volume);
  let lastPlan: (string | null)[] = [];
  let latestResults: MonthResult[] = [];
  let battleTimer: ReturnType<typeof setInterval> | undefined;
  let skipBattle: (() => void) | null = null;
  let savingFailed = false;
  let stopResults: (() => void) | null = null;
  let nextResult: (() => void) | null = null;
  let resultSpeed = 1;
  let resultsAge = game.age;
  root.innerHTML = `<div class="desktop-note"><span class="tiny-star">✧</span><p>把平凡的日子<br>养成闪光的故事</p><span class="desktop-line"></span><small>STARGARDEN · A GROWING STORY</small></div><div class="game-shell"><header id="header"></header><main id="main"></main><div id="page-actions"></div><nav id="nav" aria-label="主导航"></nav><div id="toast" role="status" aria-live="polite"></div><div id="modal-root"></div></div><div class="desktop-flower">✽</div>`;
  const main = root.querySelector<HTMLElement>('#main')!;
  const modalRoot = root.querySelector<HTMLElement>('#modal-root')!;
  const toastEl = root.querySelector<HTMLElement>('#toast')!;
  const dockObserver = new ResizeObserver(() => {
    const dock = root.querySelector<HTMLElement>('#page-actions')!;
    const navigation = root.querySelector<HTMLElement>('#nav')!;
    toastEl.style.bottom = `${dock.offsetHeight + navigation.offsetHeight + 12}px`;
  });
  dockObserver.observe(root.querySelector('#page-actions')!);
  dockObserver.observe(root.querySelector('#nav')!);
  function toast(text: string): void { clearTimeout(toastTimer); toastEl.textContent = text; toastEl.classList.add('visible'); toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 3400); }
  function persist(): void {
    if (awaitingOpening) return;
    const ok = saveState(game.state);
    if (!ok && !savingFailed) toast('浏览器暂时无法存档，请在设置里导出备份。');
    savingFailed = !ok;
    if (game.state.ended && game.state.ending && !meta.endings.includes(game.state.ending)) { meta.endings.push(game.state.ending); meta.runs++; saveMeta(meta); }
  }
  function header(): void {
    const c = game.calendar;
    const el = root.querySelector<HTMLElement>('#header')!;
    el.className = 'unified-header';
    el.innerHTML = `<div class="home-date"><span class="home-moon">${icon(game.season==='冬'?'moon':'sun')}</span><div><b><span class="date-era">星历 </span>${c.year} 年 · ${c.month} 月</b><small>${game.season}日 · 陪伴的第 ${game.state.month + 1} 个月</small></div></div><span class="gold-pill">${icon('coin')}<b>${game.state.gold.toLocaleString()}</b><small>G</small></span><button class="icon-btn" data-action="settings" aria-label="设置与存档">${icon('settings')}</button>`;
  }
  function render(): void {
    setRoomSeason(game.season);
    music.play(pageTrack());
    // 年龄、服装、季节都没变时保留原来的舞台（只把画布挪进新的容器），避免关弹窗、送礼后画面重建闪一下
    const key = `${game.age}|${game.state.outfit}|${game.season}`;
    const keepStage = page === 'home' && stage && stageKey === key ? main.querySelector<HTMLElement>('#portrait-stage') : null;
    if (!keepStage) { stage?.destroy(); stage = null; }
    root.querySelector('.game-shell')!.classList.toggle('home-layout', page === 'home');
    header();
    root.querySelector('#nav')!.innerHTML = nav.map(([id, img, title]) => { const current = page === id || (id === 'home' && page === 'schedule'); return `<button class="nav-item ${current ? 'active' : ''}" data-action="nav" data-page="${id}" ${current ? 'aria-current="page"' : ''}>${icon(img)}<span>${title}</span>${id === 'diary' && game.state.pendingEvent ? '<i></i>' : ''}</button>`; }).join('');
    main.innerHTML = page === 'home' ? home() : page === 'schedule' ? schedule() : page === 'town' ? town() : page === 'diary' ? journal() : wardrobe();
    const actions = root.querySelector<HTMLElement>('#page-actions')!;
    actions.replaceChildren();
    if (page === 'home') actions.append(main.querySelector('.home-console')!);
    else if (page === 'schedule') {
      const s = game.state;
      const filled = s.plan.filter(Boolean).length;
      const total = s.plan.reduce((sum,id) => sum + (ACTIVITIES.find(a=>a.id===id)?.gold??0),0);
      const action = s.ended ? 'ending' : s.pendingEvent ? 'event' : filled === 3 ? 'advance' : 'continue-plan';
      actions.innerHTML = `<div class="schedule-confirm"><div class="schedule-confirm-info"><b>本月安排 ${filled}/3</b><span>月末金币约 <strong class="${s.gold+total+40<0?'rose-text':'green-text'}">${(s.gold+total+40).toLocaleString()} G</strong></span></div><button class="primary-button" data-action="${action}" data-slot="${Math.max(0,s.plan.findIndex(id=>!id))}"><span>${s.ended?'查看她的未来':s.pendingEvent?'先回应她的故事':filled===3?'确认日程 · 开始本月':'继续安排日程'}</span>${icon('arrow')}</button></div>`;
    }
    if (page === 'home') {
      const parent = main.querySelector<HTMLElement>('#portrait-stage')!;
      if (keepStage) parent.replaceWith(keepStage);
      else { stage = createStage(parent, game.age, game.state.outfit); stageKey = key; }
    }
  }
  function navigate(target: Page): void { page = target; closeModal(() => {}); render(); main.scrollTo({ top: 0 }); }
  function home(): string {
    const s = game.state;
    const mood = s.stress >= 75 ? '有些疲惫' : s.stress > 45 ? '需要放松' : '心情晴朗';
    const line = s.ended ? '谢谢你，陪我走过每一个春天。' : s.stress >= 75 ? '今天有点累……可以休息一下吗？' : s.flags.includes('cat') ? '小猫今天也在等我们回家呢。' : ['今天的阳光很好，要一起去看看花吗？', '我想学的东西，还有好多好多呢。', '只要和你在一起，普通的一天也很特别。', '听说城里的花开了，我们去看看吧？'][s.month % 4];
    const chosen = s.plan.map(id => ACTIVITIES.find(a => a.id === id));
    const filled = chosen.filter(Boolean).length;
    const story = EVENTS.find(e => e.id === s.pendingEvent);
    return `<div class="home-screen"><section class="home-hero outfit-${s.outfit}"><div id="portrait-stage" aria-label="${escape(s.name)}的庭院画像"></div><div class="hero-shade"></div>
      <div class="hero-profile"><h1>${escape(s.name)} <span>${game.age} <small>岁</small></span></h1><span class="profile-seal">${OUTFITS.find(o=>o.id===s.outfit)!.name}</span><button class="music-btn ${musicEnabled?'on':''}" data-action="music" aria-label="${musicEnabled?'关闭':'开启'}背景音乐">${icon('music')}</button></div>
      <section class="vitals"><div><span>${icon('heart')} 亲密 <b>${s.bond}</b></span><div class="meter bond"><i style="width:${s.bond}%"></i></div></div><div><span>${icon('leaf')} 压力 <b class="${s.stress>=75?'danger-text':''}">${s.stress}</b></span><div class="meter stress"><i style="width:${s.stress}%"></i></div></div><div class="home-mood" aria-label="心情"><span>${icon(s.stress>=75?'moon':'sun')} ${mood}</span></div></section>
      <button class="hero-speech" data-action="talk"><span>${escape(line!)}</span><small>轻触 · 与她谈心</small></button>
      <div class="hero-actions"><button data-action="talk">${icon('chat')}<span>谈心</span></button><button data-action="gift" ${s.gifted===s.month||s.ended?'disabled':''} aria-label="送礼物，40 金币">${icon('gift')}<span>${s.gifted===s.month?'已送礼':'送礼'}</span></button></div>
      <span class="home-chapter">第 ${Math.min(8,Math.floor(s.month/12)+1)} 章 · ${CHAPTERS[Math.min(7,Math.floor(s.month/12))]}</span></section>
      <section class="home-console" aria-label="能力与本月安排"><div class="home-attributes">${STAT_KEYS.map(k=>`<button data-action="attributes" style="--stat-color:${STAT_INFO[k].color}"><span>${STAT_INFO[k].name}</span><div class="home-stat-track"><i style="width:${Math.min(100,s.stats[k]/999*100)}%"></i></div><b>${s.stats[k]}</b></button>`).join('')}</div>
      ${story?`<button class="home-story-link" data-action="event">${icon('book')}<span>${story.kind==='main'?'主线':'故事'} · ${escape(story.title)}</span>${icon('chevron')}</button>`:''}
      <div class="home-month-controls"><div class="home-plan-slots">${chosen.map((a,i)=>`<button data-action="pick" data-slot="${i}" aria-label="${['上旬','中旬','下旬'][i]}：${a?.name??'安排日程'}"><small>${['上旬','中旬','下旬'][i]}</small>${icon(a?.icon??'plus')}<span>${a?.name??'待安排'}</span></button>`).join('')}</div><button class="primary-button plan-cta" data-action="${s.ended?'ending':story?'event':filled===3?'advance':'nav'}" data-page="schedule"><span>${s.ended?'她的未来':story?'继续故事':filled===3?'开始本月':'安排本月'}</span><small>${s.ended?'成长已完成':story?'有新的来信':`日程 ${filled}/3`}</small></button></div>
      ${savingFailed?'<p class="home-save-warning">存档失败，请在设置中导出备份。</p>':''}</section></div>`;
  }

  function pageTitle(title: string, aside = ''): string { return `<div class="pg-head"><h1>${title}</h1>${aside ? `<span class="pg-chip">${aside}</span>` : ''}</div>`; }
  function gainChips(gains: Partial<Record<StatKey, number>>): string { return statChanges(gains).map(([k, v]) => `<i>${STAT_INFO[k].name} +${v}</i>`).join(''); }
  function schedule(): string {
    const s = game.state;
    const chosen = s.plan.map(id => ACTIVITIES.find(a => a.id === id));
    const price = chosen.reduce((sum, a) => sum + (a?.gold ?? 0), 0);
    const stress = chosen.reduce((sum, a) => sum + (a?.stress ?? 0), 0);
    const gains: Partial<Record<StatKey, number>> = {};
    for (const a of chosen) if (a) for (const [k, v] of statChanges(a.gains)) gains[k] = (gains[k] ?? 0) + v;
    const goldAfter = s.gold + price + 40, stressAfter = Math.max(0, Math.min(100, s.stress + stress));
    const when = ['上旬', '中旬', '下旬'];
    return `<div class="page-pad pg">${pageTitle('本月日程', `${game.calendar.month} 月 · ${game.age} 岁`)}
      ${s.ended ? '<div class="inline-note">她已年满 18 岁，这一段成长旅程圆满完成。</div>' : s.pendingEvent ? `<button class="story-notice" data-action="event">${icon('chat')} 先听听她上个月的小故事 ${icon('chevron')}</button>` : ''}
      <div class="pg-slots">${chosen.map((a, i) => `<div class="plan-slot ${a ? 'filled' : ''}"><button class="pg-slot" data-action="pick" data-slot="${i}"><span class="pg-when"><b>${when[i]}</b><small>${['01—10', '11—20', '21—30'][i]} 日</small></span>${a ? `<img class="pg-thumb" src="${activityArt(a.id, game.age)}" alt="">` : `<span class="pg-thumb empty">${icon('plus')}</span>`}<span class="pg-slot-text"><b>${a?.name ?? '待安排'}</b><small>${a ? `${gainChips(a.gains)}<i>压力 ${signed(a.stress)}</i>` : '学习、打工、休息或外出'}</small></span>${a ? `<em class="${a.gold < 0 ? 'rose-text' : 'green-text'}">${signed(a.gold)} G</em>` : icon('chevron')}</button>${a ? `<button class="slot-remove icon-btn" data-action="remove-plan" data-slot="${i}" aria-label="移除${when[i]}日程">${icon('close')}</button>` : ''}</div>`).join('')}</div>
      <div class="pg-tools"><button data-action="recommend">${icon('sparkle')} 均衡安排</button><button data-action="repeat" ${lastPlan.length ? '' : 'disabled'}>${icon('reset')} 沿用上月</button><button data-action="clear-plan" ${chosen.some(Boolean) ? '' : 'disabled'}>${icon('close')} 清空</button></div>
      <section class="pg-card pg-forecast"><h3>月末预计</h3><div><span>${icon('coin')} 金币</span><b>${s.gold.toLocaleString()} → <strong class="${goldAfter < 0 ? 'rose-text' : ''}">${goldAfter.toLocaleString()}</strong></b></div><div><span>${icon('leaf')} 压力</span><b>${s.stress} → <strong class="${stressAfter >= 75 ? 'rose-text' : ''}">${stressAfter}</strong></b></div>${statChanges(gains).length ? `<p class="pg-gains">${gainChips(gains)}</p>` : ''}<small>含每月家庭净收入 +40 G；物品加成与高压减半以实际结算为准。</small></section>
      ${s.stress >= 60 ? `<div class="pg-tip">${icon('leaf')}<p>她最近有些累了，安排一次休息，之后的学习会更有效。</p></div>` : ''}<p class="quiet-note">距离 18 岁还有 ${Math.max(0, TOTAL_MONTHS - s.month)} 个月</p></div>`;
  }
  function town(): string {
    const count = (cat: Category) => { const list = ACTIVITIES.filter(a => a.category === cat); return `${list.filter(a => game.available(a)).length}/${list.length} 可选`; };
    const places: [string, string, string, string, string][] = [
      ['town-place-academy', '星庭学院', `选课程 · ${count('learn')}`, 'location', 'learn'],
      ['town-place-teahouse', '花园茶屋', `找打工 · ${count('work')}`, 'location', 'work'],
      ['town-place-gate', '城外探索', `去冒险 · ${count('adventure')}`, 'location', 'adventure'],
      ['shop-interior', '花语集市', '买衣装与小物', 'shop', ''],
    ];
    return `<div class="page-pad pg">${pageTitle('星庭小城')}<div class="town-map"><img src="${TOWN_ART}" alt="花园、学院和城堡环绕的星庭小城"><button class="map-pin academy" data-action="location" data-category="learn">${icon('book')} 星庭学院</button><button class="map-pin market" data-action="shop">${icon('coin')} 花语集市</button><button class="map-pin forest" data-action="location" data-category="adventure">${icon('tree')} 微光森林</button></div>
      <div class="pg-places">${places.map(([img, name, desc, action, cat]) => `<button class="pg-place" data-action="${action}" ${cat ? `data-category="${cat}"` : ''}><img class="pg-place-art" src="${sceneAsset(img)}" alt=""><span><b>${name}</b><small>${desc}</small></span></button>`).join('')}</div>
      <p class="pg-hint">学院、茶屋和探索会排进本月空着的日程。</p>${peopleMarkup()}</div>`;
  }
  function journal(): string {
    const s = game.state;
    const mainDone = EVENTS.filter(e=>e.kind==='main'&&s.flags.includes(`event:${e.id}`)).length;
    return `<div class="page-pad pg">${pageTitle(`${escape(s.name)}的成长手账`, `陪伴 ${s.month} 个月`)}${s.pendingEvent ? `<button class="story-notice" data-action="event">${icon('chat')} 有一封新的来信，等你回应 ${icon('chevron')}</button>` : ''}<div class="story-progress"><span>成长主线 <b>${mainDone} / 24</b></span><small>当前章节：${CHAPTERS[Math.min(7,Math.floor(s.month/12))]}</small><div><i style="width:${mainDone/24*100}%"></i></div></div><div class="segmented"><button class="${journalTab === 'diary' ? 'selected' : ''}" data-action="journal-tab" data-tab="diary">成长日记 <small>${s.diary.length}</small></button><button class="${journalTab === 'endings' ? 'selected' : ''}" data-action="journal-tab" data-tab="endings">未来图鉴 <small>${meta.endings.length}/${ENDINGS.length}</small></button></div>
      ${journalTab === 'diary' ? s.diary.length ? `<div class="diary-list">${[...s.diary].reverse().map(d => `<article class="diary-entry"><span class="diary-dot">${icon(d.kind === 'birthday' ? 'gift' : d.kind === 'festival' ? 'trophy' : d.kind === 'month' ? 'calendar' : 'flower')}</span><small>星历 ${1001 + Math.floor(d.month / 12)} 年 ${d.month % 12 + 1} 月</small><h3>${escape(d.title)}</h3><p>${escape(d.text)}</p></article>`).join('')}</div>` : `<div class="empty-state">${icon('book')}<h3>第一页，留给今天</h3><p>聊一次心事，或度过一个月，<br>你们的故事就会被写在这里。</p><button class="outline-button" data-action="talk">和她谈谈心</button></div>` : `<p class="collection-note">不同的培养方向，会开出不同的花。已收集的结局会跨周目保留。</p><div class="ending-grid">${ENDINGS.map(e => { const unlocked = meta.endings.includes(e.id); return `<button class="ending-card ${unlocked ? 'unlocked' : ''}" data-action="ending-info" data-id="${e.id}">${icon(unlocked ? e.icon : 'lock')}<b>${e.title}</b><small>${unlocked ? '已珍藏' : '等待花开'}</small></button>`; }).join('')}</div>`}</div>`;
  }
  function peopleMarkup(): string {
    const people = Object.entries(PEOPLE);
    const met = people.filter(([id]) => (game.state.relations[id] ?? 0) > 0);
    const rows = met.map(([id, name]) => { const value = game.state.relations[id]!; return `<div class="person-entry"><img class="pg-avatar" src="${npcAsset(id, game.age)}" alt=""><span>${name}</span><div><i style="width:${value}%"></i></div><small>${value >= 40 ? '彼此信任' : value >= 16 ? '渐渐熟悉' : '初次相识'}</small></div>`; }).join('');
    const note = met.length === people.length ? '城里的朋友都已经认识啦。' : `${met.length ? `还有 ${people.length - met.length} 位等待相遇。` : '还没有结识朋友。'}上课、打工和出门探索时，会遇见新的人。`;
    return `<section class="pg-card pg-people" aria-label="人物羁绊"><h3>城里的朋友 <small>${met.length}/${people.length}</small></h3>${rows}<p>${note}</p></section>`;
  }
  function wardrobe(): string {
    const s = game.state;
    const owned = (id: string) => !NEW_OUTFITS.includes(id) || s.inventory.includes(`outfit:${id}`);
    const current = OUTFITS.find(o => o.id === s.outfit)!;
    return `<div class="page-pad pg">${pageTitle('衣橱', `已拥有 ${OUTFITS.filter(o => owned(o.id)).length}/${OUTFITS.length}`)}<div class="pg-wardrobe"><figure class="wardrobe-layers" role="img" aria-label="${escape(s.name)}穿着${current.name}"><img class="wardrobe-room" src="${roomArt()}" alt=""><span class="wardrobe-character" style="--grow:${growthRatio(game.age)}"><img src="${bodyAsset(game.age, s.outfit)}" alt=""><img src="${outfitAsset(game.age, s.outfit)}" alt=""></span></figure><div class="pg-wardrobe-caption"><small>今日衣装</small><b>${current.name}</b><p>${current.description}</p></div></div><div class="outfit-list">${[...OUTFITS].sort((a, b) => Number(b.id === s.outfit) - Number(a.id === s.outfit) || Number(owned(b.id)) - Number(owned(a.id))).map(o => `<button class="outfit-card ${s.outfit === o.id ? 'equipped' : ''} ${owned(o.id) ? '' : 'not-owned'}" data-action="${owned(o.id) ? 'wear' : 'shop'}" data-id="${o.id}"><span class="outfit-swatch" style="--swatch:${o.color}">${NEW_OUTFITS.includes(o.id)?`<img src="${bodyAsset(game.age,o.id)}" alt="">`:icon('wardrobe')}</span><span><b>${o.name}</b><small>${o.description}</small></span><em>${s.outfit === o.id ? `${icon('check')} 已穿戴` : owned(o.id) ? '换上' : `去集市 · ${o.price} G`}</em></button>`).join('')}</div><p class="quiet-note">新款购买一次，各年龄适配款一并拥有；买下后可随时换上。</p></div>`;
  }
  function sheet(title: string, subtitle: string, content: string, cls = ''): void {
    dialogueVoice.pause();
    stopResults?.(); stopResults = null; nextResult = null;
    clearInterval(battleTimer); skipBattle = null;
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${escape(title)}" tabindex="-1"><div class="sheet-handle"></div><div class="sheet-header"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-btn" data-action="close" aria-label="关闭弹窗">${icon('close')}</button></div><div class="sheet-body">${content}</div></section></div>`;
    modalRoot.querySelector<HTMLElement>('.sheet')?.focus();
  }
  /** 跨过 14、16、17 岁的那次结算之后，离开结算画面时先播“时光流逝”过场 */
  let pendingTimelapse: number | null = null;
  function startTimelapse(then: () => void): void {
    const age = pendingTimelapse!; pendingTimelapse = null;
    playTimelapse({ host: root.querySelector<HTMLElement>('.game-shell')!, year: game.calendar.year, name: game.state.name, age,
      chapter: `第 ${Math.min(8, Math.floor(game.state.month / 12) + 1)} 章 · ${CHAPTERS[Math.min(7, Math.floor(game.state.month / 12))]}`,
      onStart: () => music.jingle('jingle_chapter'), onDone: then });
  }
  function closeModal(afterTimelapse?: () => void): void {
    dialogueVoice.pause();
    if (modalRoot.innerHTML) music.play(pageTrack()); stopResults?.(); stopResults = null; nextResult = null; clearInterval(battleTimer); skipBattle = null; modalRoot.innerHTML = '';
    if (pendingTimelapse) startTimelapse(afterTimelapse ?? (() => navigate('home')));
  }
  function picker(slot = activeSlot): void {
    activeSlot = slot;
    const others = game.state.plan.reduce((sum, id, i) => i === slot ? sum : sum + (ACTIVITIES.find(a => a.id === id)?.gold ?? 0), 0);
    sheet('给时光一个小小计划', ['上旬 01—10 日', '中旬 11—20 日', '下旬 21—30 日'][slot]!, `<div class="pg-picker-status"><span>${icon('coin')} 金币 <b>${game.state.gold.toLocaleString()}</b></span><span>其他两段 <b class="${others < 0 ? 'rose-text' : ''}">${signed(others)} G</b></span><span>${icon('leaf')} 压力 <b class="${game.state.stress >= 60 ? 'rose-text' : ''}">${game.state.stress}</b></span></div><div class="picker-tabs">${(Object.keys(categoryNames) as Category[]).map(cat => `<button class="${category === cat ? 'active' : ''}" data-action="category" data-category="${cat}">${icon(categoryIcons[cat])}${categoryNames[cat].slice(0, 2)}</button>`).join('')}</div><div class="activity-list">${ACTIVITIES.filter(a => a.category === category).map(a => { const available = game.available(a); return `<button class="activity-card ${available ? '' : 'locked'} ${game.state.plan[slot] === a.id ? 'current' : ''}" data-action="select-activity" data-id="${a.id}" ${available ? '' : 'disabled'}><span class="activity-icon ${category}"><img src="${activityArt(a.id, game.age)}" alt=""></span><span class="activity-info"><span><b>${a.name}</b><em>${a.gold >= 0 ? '+' : '−'}${Math.abs(a.gold)} G</em></span><small>${a.description}</small><span class="activity-gains">${available ? `${statChanges(a.gains).map(([k, v]) => `<i>${STAT_INFO[k].name} +${v}</i>`).join('')}<i class="${a.stress < 0 ? 'green-text' : ''}">压力 ${signed(a.stress)}</i>` : `${a.age && game.age < a.age ? `${a.age} 岁` : ''}${a.age && game.age < a.age && a.unlock ? ' · ' : ''}${a.unlock ? `${STAT_INFO[a.unlock.stat].name} ≥ ${a.unlock.value}` : ''} 解锁`}</span></span></button>`; }).join('')}</div>`, 'picker-sheet');
  }
  function showResults(results: MonthResult[]): void {
    latestResults = results;
    let cursor = 0;
    const play = () => {
      const r = results[cursor];
      if (!r) { showResultsSummary(results); return; }
      const activity = cursor < 3 ? ACTIVITIES.find(a => a.name === r.title) : undefined;
      const art = activity ? activityArt(activity.id, resultsAge) : r.icon === 'trophy' ? festivalArt(resultsAge) : r.icon === 'gift' ? birthdayArt(game.age) : roomArt();
      const date = cursor < 3 ? ['上旬 · 01—10 日', '中旬 · 11—20 日', '下旬 · 21—30 日'][cursor] : '月末 · 成长记事';
      const layered = activity && ['home', 'free'].includes(activity.id);
      const battle = r.battle;
      const region = battle ? battleRegion(battle) : null;
      // 交锋：开场 600ms，之后每回合 450ms（受倍速影响），打完再揭晓结果。
      const fightEnd = battle ? 600 + battle.steps.length * 450 : 0;
      // 生日：在窗口里播放 6 秒的生日视频（横版，与窗口比例接近），播完再进入下一项；减少动态效果时仍用静态插画
      const birthdayVideo = r.icon === 'gift' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? videoAsset(`vid-birthday-${game.age >= 16 ? 'grown' : game.age >= 14 ? 'teen' : 'child'}`) : null;
      const revealAt = battle ? fightEnd + 300 : 1700, advanceAt = battle ? fightEnd + 2600 : birthdayVideo ? 7000 : 4100;
      // 与“再看一次交锋”相同的布局：画面不被遮挡，下方是带数字的血条和最近几回合的战况记录
      const scene = battle && region ? `<div class="replay-battle rb-full" data-fighting="true"><div class="battle-picture" style="--battle-bg:url('${sceneAsset(region.bg)}')"><img class="battle-fighter" src="${heroArt(resultsAge)}" alt="${escape(game.state.name)}"><img class="battle-enemy" src="${sceneAsset(battle.enemyArt ?? region.enemy)}" alt="${escape(battle.enemy)}"><span class="battle-region">${date} · ${region.name}</span><div class="rb-verdict" aria-hidden="true"></div></div><div class="battle-arena"><div class="battle-side">${icon('sword')}<b>${escape(game.state.name)}</b><div class="battle-hp"><i class="rb-player"></i></div><small class="rb-player-hp">${battle.playerMaxHp} / ${battle.playerMaxHp}</small></div><span>VS</span><div class="battle-side enemy">${icon(battle.enemyIcon)}<b>${escape(battle.enemy)}</b><div class="battle-hp"><i class="rb-enemy"></i></div><small class="rb-enemy-hp">${battle.enemyMaxHp} / ${battle.enemyMaxHp}</small></div></div><div class="battle-log rb-log" aria-live="polite"><p>遇到了${escape(battle.enemy)}！深呼吸，勇敢地迈出第一步。</p></div></div>` : '';
      const resultVoiceIds = r.icon === 'gift' ? ['birthday.girl'] : [];
      sheet('时光，一天天向前', `星历 ${1001 + Math.floor((game.state.month - 1) / 12)} 年 ${(game.state.month - 1) % 12 + 1} 月 · 日程进行中`, `<div class="schedule-replay" data-step="${cursor}" data-phase="playing"><div class="replay-track" aria-label="本月进度">${results.map((item, i) => `<span class="${i < cursor ? 'done' : i === cursor ? 'current' : ''}" ${i === cursor ? 'aria-current="step"' : ''}>${i < cursor ? '✓' : i + 1}<small>${i < 3 ? ['上旬','中旬','下旬'][i] : item.icon === 'coin' ? '账本' : item.icon === 'gift' ? '生日' : '庆典'}</small></span>`).join('')}</div>${scene || `<div class="replay-scene${birthdayVideo ? ' has-video' : ''}">${birthdayVideo ? `<video class="replay-video" src="${birthdayVideo.src}" poster="${birthdayVideo.poster}" muted playsinline autoplay aria-label="${escape(r.title)}"></video>` : `<img class="replay-background" src="${art}" alt="${escape(r.title)}">`}${layered ? `<div class="replay-person"><img src="${bodyAsset(resultsAge, game.state.outfit)}" alt="${escape(game.state.name)}"><img src="${outfitAsset(resultsAge, game.state.outfit)}" alt=""></div>` : ''}<span class="replay-date">${date}</span><div class="replay-sparkles" aria-hidden="true">✧ <span>✦</span> ✧</div><div class="replay-caption">${icon(r.icon)}<h3>${escape(r.title)}</h3><span class="replay-status">正在${activity ? activity.category === 'rest' ? '享受悠闲时光' : activity.category === 'work' ? '认真工作' : activity.category === 'adventure' ? '探索新的道路' : '努力练习' : '记录这个月的收获'}<i>…</i></span></div></div>`}<div class="replay-days" aria-hidden="true"><i></i></div><div class="replay-outcome" aria-live="polite"><p>${escape(r.text)}</p><div class="replay-rewards">${statChanges(r.gains).map(([k,v],i) => `<span style="--reward-order:${i}">${icon(STAT_INFO[k].icon)}${STAT_INFO[k].name}<b>+${v}</b></span>`).join('')}${r.gold ? `<span class="${r.gold < 0 ? 'cost' : ''}">${icon('coin')}金币<b>${signed(r.gold)}</b></span>` : ''}${r.stress ? `<span class="${r.stress > 0 ? 'cost' : ''}">${icon('leaf')}压力<b>${signed(r.stress)}</b></span>` : ''}${!r.gold && !r.stress && !statChanges(r.gains).length ? '<span>✦ 又珍藏了一份回忆</span>' : ''}</div></div><div class="replay-controls"><button class="outline-button" data-action="result-speed">${resultSpeed}× 速度</button><button class="primary-button" data-action="result-next">下一项 ${icon('arrow')}</button></div><button class="text-btn full-width" data-action="skip-results">跳过演出 · 查看月度总结</button></div>`, 'replay-sheet');
      music.play(battle ? 'bgm_battle' : activity?.category === 'adventure' ? 'bgm_explore' : r.icon === 'gift' || r.icon === 'trophy' ? 'bgm_festival' : 'bgm_schedule');
      if (r.icon === 'gift') music.jingle('jingle_birthday');
      if (r.icon === 'trophy') music.jingle('jingle_festival_award');
      let frame = 0, elapsed = 0, previous = performance.now(), revealed = false, stopped = false, shown = 0, lastTick = 0;
      const drawBattle = (count: number) => {
        if (!battle || count <= shown) return; // 每帧都会调用；只有新回合时才更新，否则战况文字的淡入动画会被反复重置
        for (; shown < count; shown++) {
          const step = battle.steps[shown]!;
          if (count - shown <= 1) sound.play(step.actor === 'daughter' ? 'hit' : 'hurt');
          strike(modalRoot.querySelector('.replay-battle .battle-fighter'), modalRoot.querySelector('.replay-battle .battle-enemy'), step.actor === 'daughter');
          modalRoot.querySelector<HTMLElement>('.rb-player')!.style.width = `${step.playerHp / battle.playerMaxHp * 100}%`;
          modalRoot.querySelector<HTMLElement>('.rb-enemy')!.style.width = `${step.enemyHp / battle.enemyMaxHp * 100}%`;
          modalRoot.querySelector('.rb-player-hp')!.textContent = `${step.playerHp} / ${battle.playerMaxHp}`;
          modalRoot.querySelector('.rb-enemy-hp')!.textContent = `${step.enemyHp} / ${battle.enemyMaxHp}`;
        }
        // 战况记录保留最近 4 回合，一来一回看得清节奏
        const log = modalRoot.querySelector('.rb-log');
        if (log && count) log.innerHTML = battle.steps.slice(Math.max(0, count - 4), count).map(st => `<p class="${st.actor}">${st.actor === 'daughter' ? `${escape(game.state.name)}勇敢出击` : `${escape(battle.enemy)}发起反击`}，造成 <b>${st.damage}</b> 点伤害。</p>`).join('');
      };
      const finishBattle = () => {
        if (!battle) return;
        drawBattle(battle.steps.length);
        const stage = modalRoot.querySelector<HTMLElement>('.replay-battle');
        if (!stage || stage.dataset.fighting === 'false') return;
        stage.dataset.fighting = 'false';
        stage.dataset.result = battle.victory ? 'victory' : 'retreat';
        modalRoot.querySelector('.rb-verdict')!.innerHTML = battle.victory ? `交锋胜利！<small>额外收获 ${battle.reward} G</small>` : '平安撤退<small>及时撤退也是勇气</small>';
        if (!battle.victory) modalRoot.querySelector('.replay-battle .battle-picture')?.insertAdjacentHTML('beforeend', `<img class="rb-retreat" src="${sceneAsset('battle-retreat')}" alt="${escape(game.state.name)}靠着树干休息">`);
        music.jingle(battle.victory ? 'jingle_victory' : 'jingle_retreat');
      };
      const reveal = () => {
        if (revealed) return;
        finishBattle();
        revealed = true;
        modalRoot.querySelector('.schedule-replay')?.setAttribute('data-phase', 'complete');
        const status = modalRoot.querySelector('.replay-status');
        if (status) status.textContent = '这段时光，完成了！';
        if (battle || r.icon === 'trophy') sound.play(r.icon === 'trophy' || battle?.victory ? 'victory' : 'back'); else rewardSounds(r);
        if (resultVoiceIds.length) void dialogueVoice.playSequence(resultVoiceIds, resultsAge, voiceParent());
      };
      nextResult = () => { if (!revealed) { elapsed = Math.max(elapsed, revealAt); reveal(); } else { cursor++; play(); } };
      stopResults = () => { stopped = true; cancelAnimationFrame(frame); };
      const tick = (now: number) => {
        if (stopped) return;
        if (!document.hidden) elapsed += Math.min(now - previous, 100) * resultSpeed;
        previous = now;
        const progress = modalRoot.querySelector<HTMLElement>('.replay-days i');
        if (progress) progress.style.width = `${Math.min(100, elapsed / revealAt * 100)}%`;
        if (battle && !revealed) drawBattle(Math.max(0, Math.min(battle.steps.length, Math.floor((elapsed - 600) / 450) + 1)));
        if (!revealed && !battle && now - lastTick > 600 / resultSpeed) { lastTick = now; sound.play('day_progress'); }
        if (elapsed >= revealAt) reveal();
        if (elapsed >= advanceAt) { cursor++; play(); return; }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    play();
  }
  function showResultsSummary(results: MonthResult[]): void {
    const firstShow = latestResults !== results || !modalRoot.querySelector('.result-list');
    if (stressWarnPending) { stressWarnPending = false; setTimeout(() => sound.play('stress_warn'), 700); }
    latestResults = results;
    music.play('bgm_schedule');
    if (firstShow && !modalRoot.querySelector('.result-list')) music.jingle('jingle_month_end');
    const s = game.state;
    const total: Partial<Record<StatKey, number>> = {};
    for (const r of results) for (const [k, v] of statChanges(r.gains)) total[k] = (total[k] ?? 0) + v;
    const gold = results.reduce((n, r) => n + r.gold, 0), stress = results.reduce((n, r) => n + r.stress, 0);
    sheet('又一起长大了一点', '每一份认真，都悄悄留下了痕迹。', `<div class="pg-month-total"><b>本月合计</b><div class="replay-rewards">${statChanges(total).map(([k, v]) => `<span>${icon(STAT_INFO[k].icon)}${STAT_INFO[k].name}<b>+${v}</b></span>`).join('')}${gold ? `<span class="${gold < 0 ? 'cost' : ''}">${icon('coin')}金币<b>${signed(gold)}</b></span>` : ''}${stress ? `<span class="${stress > 0 ? 'cost' : ''}">${icon('leaf')}压力<b>${signed(stress)}</b></span>` : ''}</div></div><div class="result-list pg-summary">${results.map((r, i) => `<article class="result-row" style="--delay:${i * 80}ms"><span class="result-icon">${icon(r.icon)}</span><div>${ACTIVITIES.some(a=>a.name===r.title)?`<img class="result-art" src="${r.battle ? (r.battle.victory ? lootArt(r.battle.region) : sceneAsset('battle-retreat')) : activityArt(ACTIVITIES.find(a=>a.name===r.title)!.id, resultsAge)}" alt="${r.title}">`:r.icon==='trophy'?`<img class="result-art" src="${festivalArt(resultsAge)}" alt="收获祭">`:r.icon==='gift'?`<img class="result-art" src="${birthdayArt(game.age)}" alt="生日">`:''}<h3>${r.title}<small>${r.gold ? `${signed(r.gold)} G` : ''}</small></h3><p>${r.text}</p><span class="result-gains">${statChanges(r.gains).map(([k, v]) => `<i>${STAT_INFO[k].name} +${v}</i>`).join('')}${r.stress ? `<i>压力 ${signed(r.stress)}</i>` : ''}</span>${r.battle ? `<button class="text-btn battle-review" data-action="battle" data-index="${i}">${icon('sword')} 再看一次交锋 ${icon('chevron')}</button>` : ''}</div></article>`).join('')}</div><button class="primary-button pg-sticky-cta" data-action="after-results"><span>${s.ended ? '看看她的未来' : s.pendingEvent ? '听听她的小故事' : '收藏这段时光'}</span>${icon('arrow')}</button>`);
  }
  /** 出击方先冲一下，约 0.12 秒后受击方闪白抖动 */
  function strike(fighter: Element | null, enemy: Element | null, daughterAttacks: boolean): void {
    const [attacker, victim] = daughterAttacks ? [fighter, enemy] : [enemy, fighter];
    const replay = (el: Element | null, cls: string) => { if (!el) return; el.classList.remove('lunge', 'struck'); void (el as HTMLElement).offsetWidth; el.classList.add(cls); };
    replay(attacker, 'lunge');
    setTimeout(() => replay(victim, 'struck'), 120);
  }
  /** 演出揭晓时按实际收获依次轻响：能力 → 金币 → 压力下降；什么都没有就用事件提示声 */
  function rewardSounds(r: MonthResult): void {
    const queue: SoundName[] = [];
    if (statChanges(r.gains).length) queue.push('stat_up');
    if (r.gold) queue.push(r.gold > 0 ? 'coin_gain' : 'coin_spend');
    if (r.stress < 0) queue.push('stress_down');
    if (!queue.length) queue.push('event');
    queue.forEach((name, i) => setTimeout(() => sound.play(name), i * 220));
  }
  function battleRegion(replay: BattleReplay): { bg: string; enemy: string; name: string } {
    return replay.region === 'ruins' ? { bg: 'battle-ruins', enemy: 'enemy-stone', name: '古塔遗迹' } : replay.region === 'mountain' ? { bg: 'battle-mountain', enemy: 'enemy-spirit', name: '星落山脉' } : { bg: 'battle-forest', enemy: 'enemy-wolf', name: '微光森林' };
  }
  function showBattle(replay: BattleReplay): void {
    sheet('小小冒险家的勇气', `与${replay.enemy}的交锋 · 奖励已计入本月结算`, `<div class="battle-picture" style="--battle-bg:url('${sceneAsset(replay.region==='ruins'?'battle-ruins':replay.region==='mountain'?'battle-mountain':'battle-forest')}')"><img class="battle-fighter" src="${heroArt(game.age)}" alt="持木剑的冒险者"><img class="battle-enemy" src="${sceneAsset(replay.enemyArt ?? (replay.region==='ruins'?'enemy-stone':replay.region==='mountain'?'enemy-spirit':'enemy-wolf'))}" alt="${replay.enemy}"><span class="battle-region">${replay.region==='ruins'?'古塔遗迹':replay.region==='mountain'?'星落山脉':'微光森林'}</span></div><div class="battle-arena"><div class="battle-side">${icon('sword')}<b>${escape(game.state.name)}</b><div class="battle-hp"><i id="player-hp-bar"></i></div><small id="player-hp">${replay.playerMaxHp} / ${replay.playerMaxHp}</small></div><span>VS</span><div class="battle-side enemy">${icon(replay.enemyIcon)}<b>${replay.enemy}</b><div class="battle-hp"><i id="enemy-hp-bar"></i></div><small id="enemy-hp">${replay.enemyMaxHp} / ${replay.enemyMaxHp}</small></div></div><div id="battle-log" class="battle-log" aria-live="polite"><p>深呼吸，勇敢地迈出第一步。</p></div><p id="battle-verdict" class="battle-verdict">交锋正在进行……</p><button class="outline-button" data-action="skip-battle">${icon('arrow')} 跳到结果</button><button class="text-btn full-width" data-action="back-results">返回本月结算</button>`);
    let cursor = 0;
    const draw = () => {
      const current = replay.steps[cursor - 1];
      if (current) {
        sound.play(current.actor === 'daughter' ? 'hit' : 'hurt');
        strike(modalRoot.querySelector('.battle-fighter'), modalRoot.querySelector('.battle-enemy'), current.actor === 'daughter');
        modalRoot.querySelector<HTMLElement>('#player-hp-bar')!.style.width = `${current.playerHp / replay.playerMaxHp * 100}%`;
        modalRoot.querySelector<HTMLElement>('#enemy-hp-bar')!.style.width = `${current.enemyHp / replay.enemyMaxHp * 100}%`;
        modalRoot.querySelector('#player-hp')!.textContent = `${current.playerHp} / ${replay.playerMaxHp}`;
        modalRoot.querySelector('#enemy-hp')!.textContent = `${current.enemyHp} / ${replay.enemyMaxHp}`;
        modalRoot.querySelector('#battle-log')!.innerHTML = replay.steps.slice(Math.max(0, cursor - 4), cursor).map(step => `<p class="${step.actor}">${step.actor === 'daughter' ? escape(game.state.name) : replay.enemy}${step.actor === 'daughter' ? '勇敢出击' : '发起反击'}，造成 <b>${step.damage}</b> 点伤害。</p>`).join('');
      }
      if (cursor >= replay.steps.length) {
        clearInterval(battleTimer);
        sound.play(replay.victory ? 'victory' : 'back');
        music.jingle(replay.victory ? 'jingle_victory' : 'jingle_retreat');
        modalRoot.querySelector('#battle-verdict')!.textContent = replay.victory ? `交锋胜利！额外收获 ${replay.reward} G。` : '及时撤退也是勇气。她带着经验平安回家。';
        const button = modalRoot.querySelector<HTMLButtonElement>('[data-action="skip-battle"]')!;
        button.disabled = true; button.textContent = replay.victory ? '这份勇气，已经珍藏' : '成长的路上，下次再试';
      }
    };
    skipBattle = () => { cursor = replay.steps.length; draw(); };
    battleTimer = setInterval(() => { cursor++; draw(); }, 450);
  }
  function showEvent(): void {
    const event = EVENTS.find(e => e.id === game.state.pendingEvent);
    if (!event) return;
    const art=eventArt(event.id,event.art??(event.icon==='book'?'activity-study':event.icon==='compass'?'battle-forest':'room'));
    const npc = /^side_([a-z]+)_/.exec(event.id)?.[1];
    sheet(event.kind==='main'?'星庭手账 · 成长主线':'生活的小小来信', event.kind==='main'?CHAPTERS[Math.min(7,Math.floor((event.dueMonth??0)/12))]!:'有些时刻，想和你一起做决定。', `<div class="story-art ${art==='room'?'layered-story':''}"><img src="${sceneAsset(art)}" alt="${escape(event.title)}">${art==='room'?`<img class="story-person" src="${bodyAsset(game.age,game.state.outfit)}" alt="${escape(game.state.name)}"><img class="story-person story-clothing" src="${outfitAsset(game.age,game.state.outfit)}" alt="">`:''}</div><div class="story-speaker"><img src="${faceAsset(game.age,eventExpression(event.id))}" alt="${escape(game.state.name)}"><span>${escape(game.state.name)}</span>${npc ? `<span class="story-npc"><img src="${npcAsset(npc, game.age)}" alt=""><span>${PEOPLE[npc as keyof typeof PEOPLE]}</span></span>` : ''}</div><div class="event-copy"><small>${event.kind==='main'?'成长主线':event.kind==='side'?'人物故事':'生活记事'}</small><h3>${event.title}</h3><p>${escape(storyText(event,game.state))}</p></div><div class="event-choices">${event.choices.map((c,i)=>`<button class="outline-button" data-action="choose" data-index="${i}" ${(c.outcome.gold??0)+game.state.gold<0?'disabled':''}>${c.label}${(c.outcome.gold??0)<0?`<small>${c.outcome.gold} G</small>`:''}${icon('chevron')}</button>`).join('')}</div>`, 'story-sheet');
    music.play(eventExpression(event.id) === 'sad' ? 'bgm_rain' : 'bgm_story');
    if (music.enabled) music.jingle('jingle_letter'); else sound.play('letter_arrive');
    void dialogueVoice.playSequence(storyVoiceSequence(event, game.state), game.age, voiceParent());
  }
  function choiceDiff(before: { gold: number; stress: number; bond: number; stats: Record<StatKey, number>; relations: Record<string, number> }): string {
    const st = game.state;
    const rows: [string, number, string, boolean][] = STAT_KEYS.filter(k => st.stats[k] !== before.stats[k]).map(k => [STAT_INFO[k].name, st.stats[k] - before.stats[k], STAT_INFO[k].icon, false]);
    if (st.bond !== before.bond) rows.push(['亲密', st.bond - before.bond, 'heart', st.bond < before.bond]);
    if (st.stress !== before.stress) rows.push(['压力', st.stress - before.stress, 'leaf', st.stress > before.stress]);
    if (st.gold !== before.gold) rows.push(['金币', st.gold - before.gold, 'coin', st.gold < before.gold]);
    for (const [id, name] of Object.entries(PEOPLE)) { const d = (st.relations[id] ?? 0) - (before.relations[id] ?? 0); if (d) rows.push([`与${name}`, d, 'heart', d < 0]); }
    return rows.length ? `<div class="replay-rewards pg-choice-diff">${rows.map(([name, v, img, cost]) => `<span class="${cost ? 'cost' : ''}">${icon(img)}${name}<b>${signed(v)}</b></span>`).join('')}</div>` : '';
  }
  function showEnding(id = game.state.ending): void {
    const e = ENDINGS.find(e => e.id === id);
    if (!e) return;
    sheet('花开的那一天', '八年时光，长成了她自己的模样。', `<div class="ending-reveal"><img class="ending-art" src="${sceneAsset(`ending-${e.id}`)}" alt="${e.title}">${icon(e.icon)}<small>THE STORY YOU GREW TOGETHER</small><h2>${e.title}</h2><em>${e.subtitle}</em><p>${e.text}</p><div class="ending-sign">${escape(game.state.name)} · 18 岁<br><small>谢谢你，陪我慢慢长大。</small></div></div><button class="primary-button" data-action="new-game">翻开另一个春天 ${icon('arrow')}</button><button class="text-btn full-width" data-action="close">再看看我们的手账</button>`);
    music.play('bgm_growing');
    music.jingle('jingle_ending');
    const endingLine = e.id === 'knight' ? 'ending.knight.0' : e.id === 'gardener' ? 'ending.gardener.0' : null;
    if (endingLine) void dialogueVoice.play(endingLine, 18, voiceParent());
  }
  function showAttributes(): void {
    sheet('她正在成为的模样', '能力上限 999；不同能力组合会走向不同职业。', `<div class="detail-stats">${STAT_KEYS.map(k => `<div><span style="color:${STAT_INFO[k].color}">${icon(STAT_INFO[k].icon)} ${STAT_INFO[k].name}</span><b>${game.state.stats[k]}<small> /999</small></b></div>`).join('')}</div><p class="soft-paragraph">亲密度反映你们的关系。压力达到 75 后，非休息日程的基础能力收益减半。每月谈心、送礼和适当休息，都能让她更从容地成长。</p><button class="outline-button" data-action="view-endings">查看未来图鉴 ${icon('arrow')}</button>`);
  }
  function shop(): void {
    sheet('花语集市', '挑一件能陪她慢慢长大的小物。', `<img class="pg-shop-banner" src="${sceneAsset('shop-interior')}" alt="花语集市店内"><div class="shop-balance">${icon('coin')} 现有金币 <b>${game.state.gold} G</b></div><h4 class="pg-shop-h">新款衣装 <small>买下后在衣橱换上</small></h4><div class="shop-clothes">${OUTFITS.filter(o=>NEW_OUTFITS.includes(o.id)).map(o=>`<article class="clothing-shop-row"><img src="${bodyAsset(game.age,o.id)}" alt="${o.name}"><div><h3>${o.name}</h3><p>${o.description}</p><small>含各年龄适配款 · ${o.price} G</small></div><button class="small-button" data-action="buy-outfit" data-id="${o.id}" ${game.state.inventory.includes(`outfit:${o.id}`)?'disabled':''}>${game.state.inventory.includes(`outfit:${o.id}`)?'已拥有':'购买'}</button></article>`).join('')}</div><h4 class="pg-shop-h">生活小物 <small>购买一次，效果自动生效</small></h4><div class="shop-items">${SHOP.map(i => `<article class="shop-item"><span class="location-icon">${icon(i.icon)}</span><div><h3>${i.name}</h3><p>${i.description}</p></div><button class="small-button" data-action="buy" data-id="${i.id}" ${game.state.inventory.includes(i.id) ? 'disabled' : ''}>${game.state.inventory.includes(i.id) ? '已拥有' : `${i.price} G`}</button></article>`).join('')}</div><button class="outline-button pg-shop-wardrobe" data-action="nav" data-page="wardrobe">去衣橱换装 ${icon('wardrobe')}</button>`, 'pg-shop');
  }
  function settings(): void {
    const row = (action: string, img: string, title: string, value: string, extra = '') => `<button data-action="${action}" ${extra}>${icon(img)}<span>${title}</span><b>${value}</b></button>`;
    const slider = (kind: 'music' | 'sound' | 'voice', value: number, on: boolean) => `<label class="pg-volume ${on ? '' : 'off'}" data-volume-row="${kind}"><span>音量</span><input type="range" min="0" max="100" step="5" value="${Math.round(value * 100)}" style="--fill:${Math.round(value * 100)}%" data-volume="${kind}" aria-label="${kind === 'music' ? '背景音乐' : kind === 'sound' ? '音效' : '人物配音'}音量"><b>${Math.round(value * 100)}%</b></label>`;
    sheet('设置', '进度会自动保存在这台设备上。', `<div class="pg-settings"><div class="pg-settings-group">${row('toggle-parent', 'heart', '我是', escape(game.state.parent), 'data-switch="parent" aria-label="切换称呼：爸爸或妈妈"')}</div><h4>背景音乐</h4><div class="pg-settings-group">${row('music', 'music', '背景音乐', musicEnabled ? '开' : '关', 'data-switch="music"')}${slider('music', musicPrefs.volume, musicEnabled)}</div><h4>人物配音</h4><div class="pg-settings-group">${row('voice-toggle', 'chat', '女儿配音', voiceEnabled ? '开' : '关', 'data-switch="voice"')}${slider('voice', voicePrefs.volume, voiceEnabled)}</div><h4>游戏音效</h4><div class="pg-settings-group">${row('sound-toggle', 'sparkle', '界面与战斗音效', sound.enabled ? '开' : '关', 'data-switch="sound"')}${slider('sound', sound.volume, sound.enabled)}</div><h4>其他</h4><div class="pg-settings-group">${row('help', 'info', '养成指南', '')}${row('replay-opening', 'star', '重看开场', '')}${row('new-game', 'reset', '开启新的故事', '图鉴保留')}</div></div><p class="settings-footer">星庭物语 · 原创竖屏养成游戏</p>`);
  }
  /** 只更新设置面板里对应的文字，不重建弹窗，避免闪烁。 */
  function refreshAudioControls(): void {
    for (const [kind, on] of [['music', musicEnabled], ['sound', sound.enabled], ['voice', voiceEnabled]] as const) {
      const value = modalRoot.querySelector(`[data-switch="${kind}"] b`);
      if (value) value.textContent = on ? '开' : '关';
      modalRoot.querySelector(`[data-volume-row="${kind}"]`)?.classList.toggle('off', !on);
    }
    const homeButton = root.querySelector<HTMLElement>('.music-btn');
    if (homeButton) { homeButton.classList.toggle('on', musicEnabled); homeButton.setAttribute('aria-label', `${musicEnabled ? '关闭' : '开启'}背景音乐`); }
  }
  function help(): void {
    sheet('慢慢长大的小指南', '你不需要完美，只要愿意陪她一起走。', `<div class="guide-steps">${[
      ['calendar', '每个月，安排三段时光', '每段持续 10 天，可以选择课程、打工、休息或探索。点“均衡安排”可以快速开始。'],
      ['coin', '学费与生活，需要一点计划', '打工赚钱，课程花钱。日程按顺序结算，所以可以先打工，再上课。每月家庭净收入 40 G。'],
      ['leaf', '累了，就让她休息一下', '压力达到 75，非休息日程基础能力收益减半。高压力不会导致死亡，休息能慢慢恢复状态。'],
      ['heart', '陪伴，比任何数值都珍贵', '每月谈心一次，亲密 +3、压力 −5；40 G 的小礼物，亲密 +7、压力 −8。生活事件也会留下成长印记。'],
      ['trophy', '把目光放得长远一点', '每年 9 月自动参加收获祭。10 岁到 18 岁共 96 个月，六项能力和亲密度决定最终职业。未来图鉴可查看条件。'],
      ['save', '离开也没关系，故事会等你', '每个操作都会自动保存。清理浏览器数据会删除本地进度。'],
    ].map(([img, title, text]) => `<article><span>${icon(img!)}</span><div><h3>${title}</h3><p>${text}</p></div></article>`).join('')}</div><button class="primary-button" data-action="close">知道啦，慢慢来 ${icon('leaf')}</button>`);
  }
  function newGameDialog(): void {
    sheet('又一个春天，即将开始', '重新开始会替换本局进度，已收集的结局会保留。', `<p class="soft-paragraph">新的故事会从那个星落之夜重新开始，你会再一次遇见艾莉。从 10 岁起，一起度过八年。</p><button class="primary-button" data-action="confirm-new-game">开始新的故事 ${icon('arrow')}</button><button class="text-btn full-width" data-action="close">继续当前的故事</button>`);
  }
  function startOpening(fixed?: { parent: string }): void {
    closeModal();
    playOpening({
      host: root.querySelector<HTMLElement>('.game-shell')!,
      fixed,
      onSound: name => { sound.unlock(); sound.play(name); },
      onBeat: index => music.play(index < 4 ? 'bgm_opening_night' : 'bgm_opening_morning'),
      onLine: (beat, line, parent, who) => { if (who === 'girl') void dialogueVoice.play(`opening.${beat}.${line}`, 10, parent === '妈妈' ? '妈妈' : '爸爸'); },
      onTitle: () => music.jingle('jingle_chapter'),
      onDone: parent => {
        try { localStorage.setItem(INTRO_KEY, 'seen'); } catch { /* 可选 */ }
        if (fixed) return;
        awaitingOpening = false;
        game = new RaisingGame(createState(DAUGHTER_NAME, parent, Date.now())); lastPlan = []; persist(); navigate('home');
        toast(`欢迎回家，${DAUGHTER_NAME}。`);
      },
    });
  }

  /** 当前页面的背景音乐：最后一年与结局用成长曲，城镇与日程用城镇曲，其余用庭院曲（冬季换冬日版） */
  function pageTrack(): Track {
    if (game.state.ended || TOTAL_MONTHS - game.state.month <= 12) return 'bgm_growing';
    if (page === 'town' || page === 'schedule') return 'bgm_town';
    return game.season === '冬' ? 'bgm_home_winter' : 'bgm_home';
  }
  function toggleMusic(): void {
    musicEnabled = !musicEnabled;
    music.setEnabled(musicEnabled);
    saveMusic();
    refreshAudioControls();
  }

  root.addEventListener('click', e => {
    const target = (e.target as Element).closest<HTMLElement>('[data-action]');
    if (!target || target.matches(':disabled')) return;
    e.preventDefault();
    const action = target.dataset.action;
    sound.unlock();
    // 关闭用合书声，切换页面与分页用翻页声，把活动放进旬格用放下书本的声音，其余按钮用轻拍皮革声
    sound.play(action==='close'?'back':action==='nav'||action==='journal-tab'||action==='category'?'page':action==='select-activity'?'place':action==='advance'?'month_start':action==='remove-plan'?'plan_remove':action==='choose'?'choice_pick':action==='talk'?'talk_open':'click');
    try {
      switch (action) {
        case 'nav': navigate(target.dataset.page as Page); break;
        case 'settings': settings(); break;
        case 'close': closeModal(); break;
        case 'help': help(); break;
        case 'music': toggleMusic(); break;
        case 'sound-toggle': sound.toggle(); refreshAudioControls(); break;
        case 'voice-toggle': voiceEnabled = !voiceEnabled; dialogueVoice.setEnabled(voiceEnabled); saveVoice(); refreshAudioControls(); break;
        case 'attributes': showAttributes(); break;
        case 'talk': { const talkId = `talk.${game.state.month % 5}`; const text = game.talk(); persist(); render(); sheet('庭院里的悄悄话', `${escape(game.state.name)} · ${game.state.parent === '家长' ? '只想说给你听' : `想对${escape(game.state.parent)}说`}`, `<div class="talk-portrait"><img src="${faceAsset(game.age,game.state.stress>=75?'tired':game.state.bond>=80?'happy':'calm')}" alt="${escape(game.state.name)}"></div><p class="talk-words">“${escape(text)}”</p><button class="outline-button" data-action="close">我有认真听哦 ${icon('heart')}</button>`); music.play('bgm_night'); void dialogueVoice.play(talkId, game.age, voiceParent()); break; }
        case 'gift': sheet('送她一份小礼物', '每月一次', `<div class="gift-confirm"><p>一小盒蜂蜜饼干，是她最喜欢的点心。</p><div class="replay-rewards"><span class="cost">${icon('coin')}金币<b>−40</b></span><span>${icon('heart')}亲密<b>+7</b></span><span>${icon('leaf')}压力<b>−8</b></span></div><p class="gift-balance">现有金币 ${game.state.gold.toLocaleString()} G</p><div class="replay-controls"><button class="outline-button" data-action="close">再想想</button><button class="primary-button" data-action="confirm-gift">送给她 ${icon('gift')}</button></div></div>`, 'gift-sheet'); break;
        case 'confirm-gift': { const text = game.gift(); sound.play('gift_give'); closeModal(); persist(); render(); toast(text); void dialogueVoice.play('gift.girl', game.age, voiceParent()); break; }
        case 'continue-plan':
        case 'pick': if (game.state.ended) showEnding(); else if (game.state.pendingEvent) showEvent(); else picker(Number(target.dataset.slot)); break;
        case 'category': category = target.dataset.category as Category; picker(); break;
        case 'select-activity': if (game.setPlan(activeSlot, target.dataset.id!)) { persist(); closeModal(); render(); } break;
        case 'remove-plan': game.setPlan(Number(target.dataset.slot), null); persist(); render(); break;
        case 'clear-plan': for (let i = 0; i < 3; i++) game.setPlan(i, null); persist(); render(); break;
        case 'recommend': { const ids = ['farm', game.state.gold >= 0 ? 'literature' : 'home', 'home']; ids.forEach((id, i) => game.setPlan(i, id)); persist(); render(); toast('打工、学习、休息，给成长一点平衡。'); break; }
        case 'repeat': lastPlan.forEach((id, i) => game.setPlan(i, id)); persist(); render(); break;
        case 'advance': { const issue = game.planIssue(); if (issue) { sound.play('deny'); toast(issue); break; } const stressBefore = game.state.stress; resultsAge = game.age; lastPlan = [...game.state.plan]; const results = game.advance(); stressWarnPending = stressBefore < 75 && game.state.stress >= 75; if (game.age !== resultsAge && [14, 16, 17].includes(game.age)) pendingTimelapse = game.age; persist(); render(); main.scrollTo({ top: 0 }); showResults(results); break; }
        case 'result-next': nextResult?.(); break;
        case 'result-speed': resultSpeed = resultSpeed === 1 ? 2 : resultSpeed === 2 ? 4 : 1; target.textContent = `${resultSpeed}× 速度`; break;
        case 'skip-results': showResultsSummary(latestResults); break;
        case 'after-results': { const next = () => { if (game.state.ended) showEnding(); else if (game.state.pendingEvent) showEvent(); else { closeModal(); navigate('home'); } }; if (pendingTimelapse) { closeModal(next); } else next(); break; }
        case 'battle': { const replay = latestResults[Number(target.dataset.index)]?.battle; if (replay) showBattle(replay); break; }
        case 'skip-battle': skipBattle?.(); break;
        case 'back-results': showResultsSummary(latestResults); break;
        case 'event': showEvent(); break;
        case 'choose': { const eventId = game.state.pendingEvent; const choiceIndex = Number(target.dataset.index); const before = structuredClone({ gold: game.state.gold, stress: game.state.stress, bond: game.state.bond, stats: game.state.stats, relations: game.state.relations }); const result = game.choose(choiceIndex); persist(); render(); sheet('这份心意，好好收到了', '属于你们的故事，已经记进手账。', `<div class="talk-portrait"><img src="${faceAsset(game.age,'happy')}" alt="${escape(game.state.name)}"></div><p class="talk-words">${result}</p>${choiceDiff(before)}<button class="primary-button" data-action="close">收藏这一刻 ${icon('flower')}</button>`); if (eventId) { const dialogue = storyOutcomeVoiceSequence(eventId, choiceIndex); if (dialogue.length) void dialogueVoice.playSequence(dialogue, game.age, voiceParent()); } setTimeout(() => sound.play('diary_write'), 450); break; }
        case 'location': category = target.dataset.category as Category; page = 'schedule'; render(); picker(game.state.plan.findIndex(id => !id) === -1 ? 0 : game.state.plan.findIndex(id => !id)); break;
        case 'shop': shop(); break;
        case 'buy': sound.play('buy'); toast(game.buy(target.dataset.id!)); persist(); header(); shop(); break;
        case 'buy-outfit': toast(game.buyOutfit(target.dataset.id!)); sound.play('buy'); persist(); header(); shop(); break;
        case 'wear': sound.play('dress'); toast(game.wear(target.dataset.id!)); persist(); render(); break;
        case 'journal-tab': journalTab = target.dataset.tab!; render(); break;
        case 'view-endings': journalTab = 'endings'; navigate('diary'); break;
        case 'ending-info': { const end = ENDINGS.find(en => en.id === target.dataset.id)!; sheet(end.title, end.subtitle, `${meta.endings.includes(end.id)?`<img class="ending-art" src="${sceneAsset(`ending-${end.id}`)}" alt="${end.title}">`:`<div class="talk-emblem">${icon('lock')}</div>`}<p class="soft-paragraph">${meta.endings.includes(end.id) ? end.text : '培养条件'}${!meta.endings.includes(end.id) ? `：${statChanges(end.requires).map(([k, v]) => `${STAT_INFO[k].name} ≥ ${v}`).join('、') || '完成八年的成长'}${end.bond ? `，亲密度 ≥ ${end.bond}` : ''}。若同时满足多个职业，会优先选择要求更综合的结局。` : ''}</p><button class="outline-button" data-action="close">把未来交给时间 ${icon('flower')}</button>`); break; }
        case 'ending': showEnding(); break;
        case 'new-game': newGameDialog(); break;
        case 'confirm-new-game': startOpening(); break;
        case 'replay-opening': startOpening({ parent: game.state.parent }); break;
        case 'toggle-parent': {
          game.state.parent = game.state.parent === '爸爸' ? '妈妈' : '爸爸'; persist();
          dialogueVoice.pause();
          const value = modalRoot.querySelector('[data-switch="parent"] b');
          if (value) value.textContent = game.state.parent;
          break;
        }
      }
    } catch (err) { sound.play('deny'); toast(err instanceof Error ? err.message : '这次操作没有完成，请再试一次。'); }
  });
  root.addEventListener('input', e => {
    const input = (e.target as Element).closest<HTMLInputElement>('[data-volume]');
    if (!input) return;
    const value = Number(input.value) / 100;
    if (input.dataset.volume === 'music') { musicPrefs.volume = value; music.setVolume(value); saveMusic(); }
    else if (input.dataset.volume === 'voice') { voicePrefs.volume = value; dialogueVoice.setVolume(value); saveVoice(); }
    else sound.setVolume(value);
    input.style.setProperty('--fill', `${input.value}%`);
    const label = input.parentElement?.querySelector('b');
    if (label) label.textContent = `${input.value}%`;
  });
  // 浏览器要求用户先点一下才能出声：上次开着音乐的，第一次点击时自动恢复。
  const audioGesture = () => {
    if (musicPrefs.enabled && !musicEnabled) { musicEnabled = true; music.setEnabled(true); refreshAudioControls(); }
    musicPrefs.enabled = false;
    music.unlock();
    dialogueVoice.retry();
  };
  for (const type of ['click', 'touchend', 'keydown']) document.addEventListener(type, audioGesture, { capture: true });
  root.addEventListener('submit', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab' && modalRoot.innerHTML) {
      const focusable = Array.from(modalRoot.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement?.classList.contains('sheet'))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  document.addEventListener('visibilitychange', () => { persist(); if (document.hidden) { music.pause(); sound.pause(); dialogueVoice.pause(); } else { music.resume(); sound.resume(); } });
  window.addEventListener('pagehide', persist);
  render();
  if (firstRun) startOpening(); else persist();
  if (loaded.corrupted) toast('原存档无法读取，已创建新故事。');
  if (import.meta.env.DEV) (window as unknown as { __stargarden: unknown }).__stargarden = { get game() { return game; }, navigate, render, get meta() { return meta; }, music };
}
