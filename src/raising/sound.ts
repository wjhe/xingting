const ROOT = `${import.meta.env.BASE_URL}assets/stargarden/audio/`;
const FILES = { click:'click', page:'page', place:'place', back:'back', buy:'buy', dress:'dress', event:'event', hit:'hit', hurt:'hurt', victory:'victory' } as const;
type SoundName = keyof typeof FILES;
type Voice = { source: AudioBufferSourceNode; gain: GainNode; factor: number };
/** Decode once, resume on user gestures, then reuse the context for battle timers. */
export class GameSound {
  enabled = true;
  volume = .5;
  private context: AudioContext | null = null;
  private voices = new Set<Voice>();
  private buffers = new Map<SoundName,AudioBuffer>();
  private pending = new Map<SoundName,Promise<AudioBuffer | null>>();
  private last = new Map<string,number>();
  private extension = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'wav';
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem('stargarden_sound_v1') ?? '{}');
      this.enabled = saved.enabled !== false;
      if(typeof saved.volume==='number' && Number.isFinite(saved.volume)) this.volume=Math.min(1,Math.max(0,saved.volume));
    } catch { /* Audio preferences must not block play. */ }
  }
  unlock(): void {
    if(!this.context) {
      try{this.context=new AudioContext();}catch{return;}
      for(const name of Object.keys(FILES) as SoundName[])void this.buffer(name);
    }
    if(this.enabled)this.resume();
  }
  resume(): void {if(this.enabled&&!document.hidden&&this.context)void this.context.resume().catch(()=>{});}
  private buffer(name:SoundName):Promise<AudioBuffer|null> {
    const cached=this.buffers.get(name);if(cached)return Promise.resolve(cached);
    const pending=this.pending.get(name);if(pending)return pending;
    const context=this.context;if(!context)return Promise.resolve(null);
    const request=fetch(`${ROOT}${FILES[name]}.${this.extension}`).then(response=>{
      if(!response.ok)throw new Error('Sample unavailable');return response.arrayBuffer();
    }).then(data=>context.decodeAudioData(data)).then(buffer=>{
      this.buffers.set(name,buffer);this.pending.delete(name);return buffer;
    }).catch(()=>{this.pending.delete(name);return null;});
    this.pending.set(name,request);return request;
  }
  play(name: SoundName): void {
    const context=this.context;
    if (!context || !this.enabled || document.hidden) return;
    const now=performance.now();
    if(now-(this.last.get(name)??-1000)<70) return;
    this.last.set(name,now);
    void this.buffer(name).then(buffer=>{
      if(!buffer||!this.enabled||document.hidden||context.state!=='running')return;
      if(this.voices.size>=4){const oldest=this.voices.values().next().value as Voice|undefined;if(oldest)this.stop(oldest);}
      const source=context.createBufferSource(),gain=context.createGain(),factor=name==='click'||name==='page'?.6:.75;
      source.buffer=buffer;gain.gain.value=this.volume*factor;source.connect(gain);gain.connect(context.destination);
      const voice={source,gain,factor};this.voices.add(voice);
      source.onended=()=>{this.voices.delete(voice);source.disconnect();gain.disconnect();};source.start();
    });
  }
  private stop(voice:Voice):void {this.voices.delete(voice);try{voice.source.stop();}catch{/* Already ended. */}}
  pause(): void {for(const voice of this.voices)this.stop(voice);if(this.context)void this.context.suspend().catch(()=>{});}
  toggle(): void {this.enabled=!this.enabled;if(!this.enabled)this.pause();else this.resume();this.save();}
  setVolume(value:number):void {this.volume=Math.min(1,Math.max(0,value));for(const voice of this.voices)voice.gain.gain.value=this.volume*voice.factor;this.save();}
  private save():void { try{localStorage.setItem('stargarden_sound_v1',JSON.stringify({enabled:this.enabled,volume:this.volume}));}catch{/* Optional preference. */} }
}
