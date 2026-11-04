import type Phaser from 'phaser';
import { settings } from './settings';

export type Bgm = 'title' | 'town' | 'wild' | 'fate' | 'danger' | 'immortal' | 'tribulation' | 'cave';
export type Sfx = 'click' | 'tab' | 'item' | 'coin' | 'travel' | 'hit' | 'win' | 'breakthrough' | 'fail' | 'death';

const BGM_VOLUME = 0.45;
const SFX_VOLUME = 0.7;
const FADE_STEPS = 20;
/** 大场面（渡劫、死亡、结局、标题）立即切换，淡入淡出也快些 */
const URGENT: Bgm[] = ['title', 'fate', 'tribulation'];
const FADE_URGENT_MS = 900;
/** 日常背景音乐切得慢：淡入淡出更长 */
const FADE_AMBIENT_MS = 2500;
/** 日常曲目至少播放这么久才会被换掉；天劫曲播完这么久才回到日常曲 */
const MIN_PLAY_MS: Partial<Record<Bgm, number>> = { tribulation: 15_000 };
const MIN_PLAY_AMBIENT_MS = 45_000;
/** 新的日常曲目请求要持续这么久才生效（比如只是进丹房看一眼，不换曲） */
const SETTLE_MS = 3000;

/** 区域对应的背景音乐 */
const REGION_BGM: Record<string, Bgm> = {
  qingshi_village: 'town',
  qingyun_market: 'town',
  luoxia_mountain: 'wild',
  heifeng_valley: 'danger',
  yunmeng_marsh: 'danger',
  beiming_sea: 'immortal',
  kunlun_ruins: 'immortal',
};

export function bgmForRegion(region: string): Bgm {
  return REGION_BGM[region] ?? 'wild';
}

/** 后加的曲子还没有素材时，退回到已有的曲子 */
const BGM_FALLBACK: Partial<Record<Bgm, Bgm>> = { danger: 'wild', immortal: 'wild', tribulation: 'danger', cave: 'town' };

type Volumed = Phaser.Sound.BaseSound & { volume: number };

/**
 * 背景音乐和音效。用全局的 game.sound，音乐跨场景持续播放，切换时淡入淡出。
 * 素材不存在、或在设置里关闭时静默跳过。
 */
class AudioManager {
  private game: Phaser.Game | null = null;
  private current: Volumed | null = null;
  private currentKey: Bgm | null = null;
  /** 当前曲目开始播放的时刻 */
  private startedAt = 0;
  /** 界面最近一次想要的曲目，以及从什么时候开始想要 */
  private wanted: Bgm | null = null;
  private wantedSince = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 界面原本请求的曲目（未经素材退路替换） */
  private requested: Bgm | null = null;

  init(game: Phaser.Game): void {
    this.game = game;
  }

  /**
   * 请求播放某首曲子。界面每次刷新都可以调用；实际何时切换由这里决定：
   * 大场面立即切，日常曲目要等当前曲子播够时长、且新请求稳定一会儿才切，免得频繁换曲。
   */
  playBgm(request: Bgm): void {
    this.requested = request;
    const key = this.resolve(request);
    if (key !== this.wanted) {
      this.wanted = key;
      this.wantedSince = Date.now();
    }
    this.update();
    // 还没切过去的，定时再看一眼
    if (this.wanted !== this.currentKey && !this.timer) {
      this.timer = setInterval(() => this.update(), 1000);
    }
  }

  /** 素材缺失时按退路表换成已有的曲子 */
  private resolve(request: Bgm): Bgm {
    const g = this.game;
    let key: Bgm | undefined = request;
    while (key && g && !g.cache.audio.exists(`bgm_${key}`)) key = BGM_FALLBACK[key];
    return key ?? request;
  }

  private update(): void {
    const key = this.wanted;
    if (!key) return;
    const playing = !!this.current?.isPlaying;
    if (key === this.currentKey && (playing || !settings.music)) return this.stopTimer();
    const now = Date.now();
    const urgent = URGENT.includes(key);
    const minPlay = (this.currentKey && MIN_PLAY_MS[this.currentKey]) ?? MIN_PLAY_AMBIENT_MS;
    const canSwitch = urgent || !playing || (now - this.startedAt >= minPlay && now - this.wantedSince >= SETTLE_MS);
    if (!canSwitch) return;
    this.switchTo(key, urgent ? FADE_URGENT_MS : FADE_AMBIENT_MS);
    this.stopTimer();
  }

  private switchTo(key: Bgm, fadeMs: number): void {
    this.fadeOutCurrent(fadeMs);
    this.currentKey = key;
    this.startedAt = Date.now();
    const g = this.game;
    if (!g || !settings.music || !g.cache.audio.exists(`bgm_${key}`)) return;
    const snd = g.sound.add(`bgm_${key}`, { loop: true, volume: 0 }) as Volumed;
    snd.play();
    this.ramp(snd, BGM_VOLUME, fadeMs);
    this.current = snd;
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 设置里开关音乐后调用 */
  refreshBgm(): void {
    const key = this.requested ?? this.currentKey;
    this.currentKey = null;
    if (!settings.music) return this.fadeOutCurrent(FADE_URGENT_MS);
    // 音频是进游戏后才加载完的，重新按已有素材挑一次
    if (key) {
      this.wanted = this.resolve(key);
      this.switchTo(this.wanted, FADE_URGENT_MS);
    }
  }

  /** 播放广告时整体静音，广告结束后恢复 */
  pauseAll(): void {
    this.game?.sound.pauseAll();
  }

  resumeAll(): void {
    this.game?.sound.resumeAll();
  }

  sfx(key: Sfx): void {
    const g = this.game;
    if (!g || !settings.sfx || !g.cache.audio.exists(`sfx_${key}`)) return;
    g.sound.play(`sfx_${key}`, { volume: SFX_VOLUME });
  }

  private fadeOutCurrent(fadeMs: number): void {
    const old = this.current;
    this.current = null;
    if (!old) return;
    this.ramp(old, 0, fadeMs, () => {
      old.stop();
      old.destroy();
    });
  }

  /** 音量渐变。音乐跨场景，不能用场景的 tween（场景切换时会被清掉） */
  /** 每个声音同时只有一个渐变；新的渐变会顶掉旧的 */
  private ramps = new Map<Volumed, ReturnType<typeof setInterval>>();

  private ramp(snd: Volumed, to: number, ms: number, done?: () => void): void {
    const prev = this.ramps.get(snd);
    if (prev) clearInterval(prev);
    const from = snd.volume;
    let i = 0;
    const timer = setInterval(() => {
      // 声音已被销毁（比如场景重建），停止渐变
      if (!snd.manager) {
        clearInterval(timer);
        this.ramps.delete(snd);
        return;
      }
      i++;
      snd.volume = from + ((to - from) * i) / FADE_STEPS;
      if (i >= FADE_STEPS) {
        clearInterval(timer);
        this.ramps.delete(snd);
        done?.();
      }
    }, ms / FADE_STEPS);
    this.ramps.set(snd, timer);
  }
}

export const audio = new AudioManager();
