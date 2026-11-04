const VOICE_ROOT = `${import.meta.env.BASE_URL}assets/stargarden/audio/dialogue-all-v1/`;

type Stage = 'child' | 'teen' | 'grown';
type VoiceClip = {
  id: string;
  age: Stage;
  src: string;
  parent?: '爸爸' | '妈妈';
};
type VoiceManifest = { clips: VoiceClip[] };

/** One reusable HTMLAudio voice channel; a new line always replaces the previous one. */
export class DialogueVoice {
  enabled = true;
  volume = .8;
  private audio: HTMLAudioElement | null = null;
  private playVersion = 0;
  private clips = new Map<string, VoiceClip>();
  private ready: Promise<void>;

  constructor() {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch(`${VOICE_ROOT}manifest.json`, { cache: 'no-cache' });
      if (!response.ok) return;
      const manifest = await response.json() as VoiceManifest;
      this.clips = new Map((manifest.clips ?? []).map(clip => [`${clip.age}|${clip.id}`, clip]));
    } catch {
      // Voice files are optional while a new recording batch is being generated.
    }
  }

  private stage(age: number): Stage {
    return age >= 16 ? 'grown' : age >= 14 ? 'teen' : 'child';
  }

  async play(id: string, age: number, parent: '爸爸' | '妈妈'): Promise<void> {
    await this.playSequence([id], age, parent);
  }

  async playSequence(ids: string[], age: number, parent: '爸爸' | '妈妈'): Promise<void> {
    const version = ++this.playVersion;
    await this.ready;
    if (version !== this.playVersion || !this.enabled || document.hidden) return;
    const stage = this.stage(age);
    const parentSuffix = parent === '爸爸' ? '.dad' : '.mom';
    for (const id of ids) {
      if (version !== this.playVersion || !this.enabled || document.hidden) return;
      const clip = this.clips.get(`${stage}|${id}${parentSuffix}`) ?? this.clips.get(`${stage}|${id}`);
      if (!clip) continue;
      this.stopAudio();
      const audio = new Audio(`${VOICE_ROOT}${clip.src}`);
      audio.volume = this.volume;
      this.audio = audio;
      try {
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener('ended', () => resolve(), { once: true });
          audio.addEventListener('error', () => reject(new Error('Voice unavailable')), { once: true });
          void audio.play().catch(reject);
        });
      } catch {
        // Continue to the next stable line; a missing or blocked clip must not stall play.
      } finally {
        if (this.audio === audio) this.audio = null;
      }
    }
  }

  pause(): void {
    this.playVersion++;
    this.stopAudio();
  }

  private stopAudio(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.audio = null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.pause();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio) this.audio.volume = this.volume;
  }
}
