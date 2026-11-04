import { faceAsset, sceneAsset, videoAsset, type Expression } from './art';
import './opening.css';

/** 开场演出：星落之夜，你在庭院遇见不记得名字的她，并为她取一个新名字。 */
type Line =
  | { kind: 'say'; who: 'narration' | 'girl'; face?: Expression; text: string }
  | { kind: 'parent' };
interface Beat {
  art: string;
  /** 竖屏裁切时让人物居中的横向位置（仅静态图） */
  x: number;
  camera: 'down' | 'in' | 'left' | 'right' | 'still';
  effect?: 'starfall' | 'embers';
  /** AI 视频（竖版 3:4，自带运镜与特效）。有视频时用视频第一帧作封面，播放一次后停在最后一帧。 */
  video?: string;
  lines: Line[];
}

const n = (text: string): Line => ({ kind: 'say', who: 'narration', text });
const g = (text: string, face: Expression = 'calm'): Line => ({ kind: 'say', who: 'girl', face, text });

const BEATS: Beat[] = [
  { art: 'op-starfall', x: 87, camera: 'down', effect: 'starfall', video: 'vid-op-starfall', lines: [
    n('星历 1000 年，冬至的夜晚。'),
    n('星庭小城的人们都睡了。只有一颗星，悄悄离开了天空。'),
  ] },
  { art: 'op-garden', x: 48, camera: 'in', effect: 'embers', video: 'vid-op-garden', lines: [
    n('你听见庭院里传来很轻的声响。'),
    n('花丛中间，坐着一个抱着旧旅行包的小女孩。她身边的星光，正一点一点熄灭。'),
    g('……这里，是哪里？', 'sad'),
  ] },
  { art: 'op-hand', x: 44, camera: 'in', video: 'vid-op-hand', lines: [
    n('她不记得自己从哪里来，也说不出自己的名字。'),
    g('我只记得……要找一个，有灯亮着的地方。', 'shy'),
    n('你蹲下来，向她伸出手。'),
    g('……可以吗？', 'shy'),
  ] },
  { art: 'op-lamp', x: 50, camera: 'left', video: 'vid-op-lamp', lines: [
    n('那一晚，屋里的灯一直亮着。'),
    g('好暖和。', 'happy'),
    n('她捧着汤，一小口一小口地喝完了，却始终把旅行包放在脚边。'),
  ] },
  { art: 'op-morning', x: 40, camera: 'right', video: 'vid-op-morning', lines: [
    n('天亮了。她站在窗边，看着星庭小城慢慢醒来。'),
    g('我……没有名字。', 'shy'),
    g('你可以，给我一个吗？', 'shy'),
    n('你想起昨夜，她说自己在找一个有灯亮着的地方。'),
    n('在星庭的老话里，“艾莉”的意思是——被灯光找到的人。'),
    n('“艾莉。”你说。'),
    g('艾莉……艾莉。', 'happy'),
    n('她小声念了两遍，然后笑了。'),
    g('那，我该怎么称呼你呢？', 'calm'),
    { kind: 'parent' },
    g('{parent}。……从今天起，这里就是我的家了吗？', 'happy'),
    n('你点了点头。'),
  ] },
];
/** 最后一幕里“艾莉”这个名字第一次说出口的位置，此后名牌显示她的名字 */
const NAMED_AT = BEATS[BEATS.length - 1]!.lines.findIndex(l => l.kind === 'say' && l.text.startsWith('艾莉……'));

export interface OpeningOptions {
  host: HTMLElement;
  /** 重看开场时传入现有称呼，跳过选择，结束后不改动存档 */
  fixed?: { parent: string };
  onSound?: (name: 'click' | 'event' | 'victory') => void;
  /** 切到第 index 幕时调用（用于切换开场配乐） */
  onBeat?: (index: number) => void;
  /** Called after the player's parent choice is known. */
  onLine?: (beat: number, line: number, parent: string) => void;
  /** 出现章节卡时调用 */
  onTitle?: () => void;
  /** parent 为“爸爸”或“妈妈” */
  onDone: (parent: string) => void;
}


export function playOpening(options: OpeningOptions): void {
  const { host, fixed, onSound, onBeat, onLine, onTitle, onDone } = options;
  let parent = fixed?.parent ?? '爸爸', chosen = false;
  let beat = -1, line = -1, typing: ReturnType<typeof setInterval> | undefined, full = '', finished = false;
  const el = document.createElement('div');
  el.className = 'opening';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '开场剧情');
  el.innerHTML = `<div class="op-stage"><div class="op-layer" data-layer="a"></div><div class="op-layer" data-layer="b"></div><div class="op-fx"></div></div>
    <button class="op-skip" type="button" data-op="skip">跳过 ▸▸</button>
    <div class="op-box" data-op="next"><img class="op-face" alt=""><div class="op-text"><b class="op-who"></b><p></p></div><span class="op-more" aria-hidden="true">▼</span></div>
    <form class="op-input" hidden></form>
    <div class="op-title" hidden><small>在星庭，她将度过八年的时光</small><h2>第 1 章 · 窗边的新名字</h2></div>`;
  host.append(el);
  const box = el.querySelector<HTMLElement>('.op-box')!, text = box.querySelector('p')!, who = box.querySelector<HTMLElement>('.op-who')!, face = box.querySelector<HTMLImageElement>('.op-face')!;
  const form = el.querySelector<HTMLFormElement>('.op-input')!;
  let front = 'a';
  // 开启“减少动态效果”时不播视频，只用静态图。
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // 封面全部预载；视频只预载当前与下一幕（每段约 2 MB，同时下载会拖慢第一段）。
  const videos = BEATS.map((b, i) => {
    if (!b.video || still) { const img = new Image(); img.src = sceneAsset(b.art); return null; }
    const asset = videoAsset(b.video);
    const img = new Image(); img.src = asset.poster;
    const v = document.createElement('video');
    v.className = 'op-video'; v.muted = true; v.playsInline = true; v.preload = i < 2 ? 'auto' : 'none'; v.poster = asset.poster;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.src = asset.src;
    // 视频加载失败就移除，图层里的封面静态图继续显示。
    v.addEventListener('error', () => v.remove());
    return v;
  });

  const showBeat = (index: number) => {
    const b = BEATS[index]!;
    const back = front === 'a' ? 'b' : 'a';
    const layer = el.querySelector<HTMLElement>(`[data-layer="${back}"]`)!;
    layer.querySelectorAll('video').forEach(old => { old.pause(); old.remove(); });
    const video = videos[index];
    if (video) {
      // 视频自带运镜与流星、星光等特效，这一幕关闭 CSS 运镜和粒子，避免重复。
      layer.style.backgroundImage = `url('${videoAsset(b.video!).poster}')`;
      layer.style.backgroundPosition = '50% 50%';
      layer.dataset.camera = 'still';
      video.preload = 'auto';
      video.currentTime = 0;
      layer.append(video);
      void video.play().catch(() => { /* 自动播放被拦截时保留封面 */ });
    } else {
      layer.style.backgroundImage = `url('${sceneAsset(b.art)}')`;
      layer.style.backgroundPosition = `${b.x}% 50%`;
      layer.dataset.camera = b.camera;
    }
    layer.classList.remove('shown'); void layer.offsetWidth; layer.classList.add('shown');
    el.querySelector(`[data-layer="${front}"]`)!.classList.remove('shown');
    front = back;
    // 提前加载下一幕的视频。
    const upcoming = videos[index + 1];
    if (upcoming && upcoming.preload !== 'auto') { upcoming.preload = 'auto'; upcoming.load(); }
    const effect = video ? undefined : b.effect;
    el.querySelector('.op-fx')!.className = `op-fx ${effect ?? ''}`;
    el.querySelector('.op-fx')!.innerHTML = effect === 'embers' ? Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('') : effect === 'starfall' ? '<i></i>' : '';
    onSound?.('event');
    onBeat?.(index);
  };
  const fill = (s: string) => s.split('{parent}').join(parent);
  const type = (value: string) => {
    clearInterval(typing);
    full = value; let shown = 0;
    text.textContent = '';
    box.classList.add('typing');
    typing = setInterval(() => {
      shown += 1; text.textContent = full.slice(0, shown);
      if (shown >= full.length) { clearInterval(typing); typing = undefined; box.classList.remove('typing'); }
    }, 42);
  };
  const ask = () => {
    box.hidden = true;
    form.hidden = false;
    form.dataset.kind = 'parent';
    form.innerHTML = `<p class="op-ask">你是她的——</p><div class="op-choice">${['爸爸', '妈妈'].map(v => `<button type="button" data-op="parent" data-value="${v}">${v}</button>`).join('')}</div>`;
    form.querySelector<HTMLButtonElement>('button')?.focus();
  };
  const next = () => {
    if (finished) return;
    if (typing) { clearInterval(typing); typing = undefined; text.textContent = full; box.classList.remove('typing'); return; }
    line++;
    if (beat < 0 || line >= BEATS[beat]!.lines.length) {
      beat++; line = 0;
      if (beat >= BEATS.length) { finish(); return; }
      showBeat(beat);
    }
    const l = BEATS[beat]!.lines[line]!;
    if (l.kind === 'parent') {
      if (fixed) { next(); return; }
      ask(); return;
    }
    box.hidden = false;
    box.dataset.who = l.who;
    // 取名之前她还没有名字，名牌显示“？？？”
    who.textContent = l.who === 'girl' ? (beat === BEATS.length - 1 && line >= NAMED_AT ? '艾莉' : '？？？') : '';
    face.hidden = l.who !== 'girl';
    if (l.who === 'girl') face.src = faceAsset(10, l.face);
    type(fill(l.text));
    onLine?.(beat, line, parent);
  };
  const finish = () => {
    finished = true;
    clearInterval(typing);
    box.hidden = true; form.hidden = true;
    el.querySelector<HTMLElement>('.op-skip')!.hidden = true;
    el.querySelector<HTMLElement>('.op-title')!.hidden = false;
    el.classList.add('ending');
    if (onTitle) onTitle(); else onSound?.('victory');
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => { el.remove(); onDone(parent); }, 700); }, 2600);
  };
  const skip = () => {
    if (finished) return;
    clearInterval(typing); typing = undefined;
    // 跳过演出，但称呼必须选：直接来到“你是她的——爸爸 / 妈妈”。
    const last = BEATS.length - 1;
    if (fixed || chosen) { finish(); return; }
    if (beat !== last) { beat = last; showBeat(last); }
    line = BEATS[last]!.lines.findIndex(x => x.kind === 'parent') - 1;
    next();
  };

  el.addEventListener('click', e => {
    const target = (e.target as Element).closest<HTMLElement>('[data-op]');
    if (target?.dataset.op === 'skip') { e.stopPropagation(); skip(); return; }
    if (target?.dataset.op === 'parent') { parent = target.dataset.value!; chosen = true; form.hidden = true; onSound?.('click'); next(); return; }
    if (!form.hidden || finished) return;
    onSound?.('click');
    next();
  });
  form.addEventListener('submit', e => e.preventDefault());
  el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && form.hidden) { e.preventDefault(); next(); } });
  el.tabIndex = -1; el.focus();
  next();
}
