/**
 * 背景音乐与短乐句。文件由 scripts/stargarden-music-build.py 生成（public/assets/stargarden/audio/music/）。
 * 用音频元素边下载边播放（流式，不把整首解码进内存），经 Web Audio 控制音量（iOS 上 HTMLAudioElement.volume 不可写）；换曲交叉淡入淡出，
 * 每首在结尾前 2.5 秒从头淡入下一遍，循环处不留空隙；短乐句播放时把背景音乐压低。
 */
export type Track =
  | 'bgm_opening_night' | 'bgm_opening_morning' | 'bgm_home' | 'bgm_home_winter' | 'bgm_schedule' | 'bgm_town'
  | 'bgm_story' | 'bgm_rain' | 'bgm_night' | 'bgm_explore' | 'bgm_battle' | 'bgm_festival' | 'bgm_growing';
export type Jingle =
  | 'jingle_victory' | 'jingle_retreat' | 'jingle_month_end' | 'jingle_letter' | 'jingle_chapter'
  | 'jingle_birthday' | 'jingle_festival_award' | 'jingle_ending';

const ROOT = `${import.meta.env.BASE_URL}assets/stargarden/audio/music/`;
const FADE = .9, LOOP_OVERLAP = 2.5, DUCK = .35;

interface Voice { track: Track; el: HTMLAudioElement; gain: GainNode; looping: boolean }

export class MusicPlayer {
  enabled = false;
  volume = .5;
  /** 最近一次请求的曲目；关闭音乐时也记住，打开后从这里开始 */
  current: Track | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private duck: GainNode | null = null;
  private voices = new Set<Voice>();
  private voiceDucked = false;
  private jingleCount = 0;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try { this.ctx = new AudioContext(); } catch { return null; }
    this.master = this.ctx.createGain();
    this.duck = this.ctx.createGain();
    this.duck.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolume(0);
    return this.ctx;
  }
  private applyVolume(ramp = .15): void {
    if (!this.ctx || !this.master) return;
    // 默认 50% 对应 0.8 倍增益；文件已标准化到约 -20 LUFS
    this.master.gain.setTargetAtTime(Math.min(1, this.volume * 1.6), this.ctx.currentTime, ramp || .001);
  }
  private updateDuck(ramp = .12): void {
    if (!this.ctx || !this.duck) return;
    const target = this.voiceDucked || this.jingleCount > 0 ? DUCK : 1;
    this.duck.gain.setTargetAtTime(target, this.ctx.currentTime, ramp);
  }
  setVolume(value: number): void { this.volume = Math.min(1, Math.max(0, value)); this.applyVolume(); }
  /** Dialogue ducks the music without muting it, then restores the previous music level. */
  setVoiceDucked(active: boolean): void {
    if (this.voiceDucked === active) return;
    this.voiceDucked = active;
    this.updateDuck();
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) { const ctx = this.ensure(); void ctx?.resume().catch(() => {}); if (this.current) this.start(this.current); }
    else for (const v of this.voices) this.fadeOut(v);
  }
  /** 切到某首背景音乐；同一首正在播放时不会从头开始 */
  play(track: Track): void {
    this.current = track;
    if (!this.enabled) return;
    const playing = [...this.voices].some(v => v.track === track && !v.looping && v.gain.gain.value > 0);
    if (playing) return;
    this.start(track);
  }
  private start(track: Track): void {
    const ctx = this.ensure();
    if (!ctx || !this.duck) return;
    void ctx.resume().catch(() => {});
    for (const v of this.voices) if (v.track !== track || !v.looping) this.fadeOut(v);
    this.spawn(track, FADE);
  }
  private spawn(track: Track, fadeIn: number): void {
    const ctx = this.ctx!, el = new Audio(`${ROOT}${track}.mp3`);
    el.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeIn);
    ctx.createMediaElementSource(el).connect(gain);
    gain.connect(this.duck!);
    const voice: Voice = { track, el, gain, looping: false };
    this.voices.add(voice);
    el.addEventListener('timeupdate', () => {
      // 结尾前从头淡入下一遍，形成无缝循环
      if (!voice.looping && this.current === track && el.duration && el.duration - el.currentTime < LOOP_OVERLAP) {
        voice.looping = true;
        this.spawn(track, LOOP_OVERLAP);
        this.fadeOut(voice, LOOP_OVERLAP);
      }
    });
    el.addEventListener('ended', () => this.drop(voice));
    el.addEventListener('error', () => this.drop(voice));
    void el.play().catch(() => { /* 自动播放被拦截：等下一次用户操作时 resume */ });
  }
  private fadeOut(voice: Voice, seconds = FADE): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + seconds);
    voice.looping = true;
    setTimeout(() => this.drop(voice), seconds * 1000 + 100);
  }
  private drop(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    voice.el.pause(); voice.el.removeAttribute('src'); voice.el.load();
    voice.gain.disconnect();
  }
  /** 短乐句：播放一次，期间背景音乐压低 */
  jingle(id: Jingle): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.duck || !this.master) return;
    void ctx.resume().catch(() => {});
    this.jingleCount++;
    this.updateDuck(.08);
    const el = new Audio(`${ROOT}${id}.mp3`);
    const source = ctx.createMediaElementSource(el);
    source.connect(this.master);
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      this.jingleCount = Math.max(0, this.jingleCount - 1);
      this.updateDuck(.4);
      source.disconnect();
    };
    el.addEventListener('ended', restore);
    el.addEventListener('error', restore);
    void el.play().catch(restore);
  }
  /**
   * 在用户点击（click / touchend / keydown）时调用：恢复音频环境，并重试被浏览器拦下的播放。
   * 注意：触摸屏上 pointerdown 不算“用户允许播放”，必须等手指抬起。
   */
  unlock(): void {
    if (!this.enabled) return;
    void this.ensure()?.resume().catch(() => {});
    for (const v of this.voices) if (v.el.paused && !v.looping) void v.el.play().catch(() => {});
    if (!this.voices.size && this.current) this.start(this.current);
  }
  pause(): void { void this.ctx?.suspend().catch(() => {}); }
  resume(): void { if (this.enabled) void this.ctx?.resume().catch(() => {}); }
  /** 供测试检查：当前正在发声的曲目 */
  get audible(): Track[] { return [...this.voices].filter(v => !v.looping).map(v => v.track); }
}
