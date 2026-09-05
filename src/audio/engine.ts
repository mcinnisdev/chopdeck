// The sampler. Native Web Audio nodes per voice; the machine model is the only source of parameters.
import { Machine, Sound, NOTE_MIN, NOTE_MAX } from '@/model/types';
import { SoundApi, NoteVar } from '@/kernel/screen';
import { planVoice, resolveNotes, ampEnvelope, cutoffHz, MAX_VOICES, VoicePlan } from './params';
import { Recorder } from './recorder';

interface Voice {
  id: number;
  drum: number;
  note: number;
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  amp: GainNode;
  pan: StereoPannerNode;
  startedAt: number;
  releaseOnOff: boolean;
  tau: number;
}

export class AudioEngine implements SoundApi {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private analyser!: AnalyserNode;
  private drumBus: GainNode[] = [];
  private voices: Voice[] = [];
  private buffers = new Map<string, { pcm: Float32Array; buf: AudioBuffer }>();
  private nextId = 1;
  private volume = 0.8;

  /** SAMPLE mode input; taps the master bus for RESAMPLE. */
  readonly recorder = new Recorder(() => this.boot(), () => this.analyser);

  /** `opts.context` renders offline (bounce); `opts.now` supplies the virtual clock the scheduler follows. */
  constructor(private getMachine: () => Machine, private opts: { context?: BaseAudioContext; now?: () => number } = {}) {}

  sampleRate(): number { return this.ctx?.sampleRate ?? 44100; }

  /** Create/resume the context. Safe to call on every user gesture. */
  boot(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = (this.opts.context as AudioContext | undefined) ?? new Ctor({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.volume;
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -3; this.limiter.knee.value = 6; this.limiter.ratio.value = 12; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.1;
      this.analyser = c.createAnalyser(); this.analyser.fftSize = 512;
      this.master.connect(this.limiter); this.limiter.connect(this.analyser); this.analyser.connect(c.destination);
      for (let i = 0; i < 4; i++) { const g = c.createGain(); g.connect(this.master); this.drumBus.push(g); }
    }
    if (!this.opts.context && this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setVolume(v01: number) { this.volume = v01; if (this.master) this.master.gain.setTargetAtTime(v01, this.ctx!.currentTime, 0.01); }

  /** Master output level 0..1 (peak of the last analyser block). */
  level(): number {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
    return peak;
  }

  // ---------- buffers ----------
  private bufferFor(sound: Sound): AudioBuffer | null {
    const c = this.ctx!;
    if (!sound.pcm.length || !sound.length) return null;
    const cached = this.buffers.get(sound.id);
    if (cached && cached.pcm === sound.pcm[0] && cached.buf.length === sound.length) return cached.buf;
    const buf = c.createBuffer(sound.pcm.length, sound.length, sound.rate);
    sound.pcm.forEach((ch, i) => buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
    this.buffers.set(sound.id, { pcm: sound.pcm[0], buf });
    return buf;
  }
  invalidate(soundId: string) { this.buffers.delete(soundId); }

  // ---------- SoundApi ----------
  noteOn(drum: number, note: number, vel: number, nv?: NoteVar, when?: number) {
    const c = this.boot();
    const m = this.getMachine();
    const slot = m.drums[drum]; if (!slot) return;
    const pg = m.programs[slot.pgm]; if (!pg) return;
    if (note < NOTE_MIN || note > NOTE_MAX) return;
    const np = pg.notes[note - NOTE_MIN];
    const decayValue = nv?.param === 'DECAY' ? nv.value : np.decay;
    const drumVol = slot.midiVolume === 'RECEIVE' ? slot.currentVol / 127 : 1;
    for (const n of resolveNotes(np, note, vel, decayValue)) {
      const p = pg.notes[n - NOTE_MIN]; if (!p?.snd) continue;
      const sound = m.sounds.find(s => s.id === p.snd); if (!sound) continue;
      const plan = planVoice({ np: p, sound, vel, nv, drumVol });
      this.startVoice(c, drum, n, plan, when);
    }
  }

  private startVoice(c: AudioContext, drum: number, note: number, plan: VoicePlan, when?: number) {
    const buf = this.bufferFor(plan.sound); if (!buf) return;
    const now = Math.max(c.currentTime, when ?? 0);

    // voice overlap and mute groups (cut at the scheduled time, not before)
    for (const v of [...this.voices]) {
      if (v.drum !== drum) continue;
      if (plan.mutes.includes(v.note) || (v.note === note && plan.overlap !== 'POLY')) this.release(v, now, 0.004);
    }
    while (this.voices.length >= MAX_VOICES) this.release(this.voices[0], now, 0.004);

    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = plan.rate;
    const startSec = plan.startFrame / plan.sound.rate;
    const endSec = plan.endFrame / plan.sound.rate;
    if (plan.loop) {
      src.loop = true;
      src.loopStart = plan.sound.loopTo / plan.sound.rate;
      src.loopEnd = Math.min(endSec, (plan.sound.loopTo + plan.sound.loopLength) / plan.sound.rate);
    }
    const durSec = Math.max(0.001, (endSec - startSec) / plan.rate);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = plan.q;
    if (plan.fenv) {
      const f = plan.fenv;
      const at = (idx: number) => cutoffHz(Math.min(100, idx));
      filter.frequency.setValueAtTime(at(f.baseIdx), now);
      filter.frequency.linearRampToValueAtTime(at(f.baseIdx + f.amountIdx), now + Math.max(0.002, f.attackSec));
      filter.frequency.setTargetAtTime(at(f.baseIdx), now + Math.max(0.002, f.attackSec), Math.max(0.005, f.decaySec / 3));
    } else filter.frequency.value = plan.cutoff;

    const amp = c.createGain();
    const env = ampEnvelope(plan, durSec);
    amp.gain.setValueAtTime(env.attackEnd > 0.002 ? 0 : plan.gain, now);
    if (env.attackEnd > 0.002) amp.gain.linearRampToValueAtTime(plan.gain, now + env.attackEnd);
    if (isFinite(env.decayStart)) amp.gain.setTargetAtTime(0, now + env.decayStart, env.tau);

    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, plan.pan));

    src.connect(filter); filter.connect(amp); amp.connect(pan); pan.connect(this.drumBus[drum]);
    src.start(now, startSec, plan.loop ? undefined : Math.max(0.001, endSec - startSec));
    if (isFinite(env.stopAt) && !plan.loop) src.stop(now + env.stopAt + 0.01);

    const voice: Voice = { id: this.nextId++, drum, note, src, filter, amp, pan, startedAt: now, releaseOnOff: plan.overlap === 'NOTE OFF' || plan.loop, tau: env.tau };
    this.voices.push(voice);
    src.onended = () => { this.voices = this.voices.filter(v => v !== voice); try { src.disconnect(); filter.disconnect(); amp.disconnect(); pan.disconnect(); } catch { /* already gone */ } };
  }

  private release(v: Voice, now: number, tau: number) {
    try {
      v.amp.gain.cancelScheduledValues(now);
      v.amp.gain.setValueAtTime(v.amp.gain.value, now);
      v.amp.gain.setTargetAtTime(0, now, tau);
      v.src.stop(now + tau * 6 + 0.005);
    } catch { /* already stopped */ }
    this.voices = this.voices.filter(x => x !== v);
  }

  noteOff(drum: number, note: number, when?: number) {
    if (!this.ctx) return;
    const now = Math.max(this.ctx.currentTime, when ?? 0);
    for (const v of [...this.voices]) if (v.drum === drum && v.note === note && v.releaseOnOff && v.startedAt <= now) this.release(v, now, v.tau > 0.01 ? v.tau : 0.004);
  }

  now(): number { return this.opts.now ? this.opts.now() : (this.ctx?.currentTime ?? 0); }

  /** Metronome: a short sine blip, higher for the accent. */
  click(accent: boolean, volume01: number, when?: number) {
    const c = this.boot();
    const t = Math.max(c.currentTime, when ?? 0);
    const osc = c.createOscillator(); osc.type = 'square'; osc.frequency.value = accent ? 1760 : 1175;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * volume01 + 0.0001, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + (accent ? 0.06 : 0.035));
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.08);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }

  playSound(sound: string | Sound, opts: { from?: number; to?: number; loop?: boolean } = {}) {
    const c = this.boot();
    const m = this.getMachine();
    const snd = typeof sound === 'string' ? m.sounds.find(s => s.id === sound) : sound;
    if (!snd) return;
    const buf = this.bufferFor(snd); if (!buf) return;
    this.stopAudition();
    const src = c.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = Math.pow(2, snd.tune / 120);
    const from = (opts.from ?? 0) / snd.rate, to = (opts.to ?? snd.length) / snd.rate;
    const g = c.createGain(); g.gain.value = snd.level / 100;
    src.connect(g); g.connect(this.master);
    if (opts.loop) { src.loop = true; src.loopStart = from; src.loopEnd = to; src.start(c.currentTime, from); }
    else src.start(c.currentTime, from, Math.max(0.001, to - from));
    this.audition = src;
    src.onended = () => { if (this.audition === src) this.audition = null; };
  }
  private audition: AudioBufferSourceNode | null = null;
  stopAudition() { try { this.audition?.stop(); } catch { /* fine */ } this.audition = null; }

  stopAll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of [...this.voices]) this.release(v, now, 0.004);
    this.stopAudition();
  }

  async decode(file: Blob): Promise<{ pcm: Float32Array[]; rate: number }> {
    const c = this.boot();
    const ab = await file.arrayBuffer();
    const buf = await c.decodeAudioData(ab.slice(0));
    const pcm: Float32Array[] = [];
    for (let i = 0; i < Math.min(2, buf.numberOfChannels); i++) pcm.push(buf.getChannelData(i).slice());
    return { pcm, rate: buf.sampleRate };
  }

  /** Mixer moved: update level/pan of voices still sounding and the master trim. */
  mixerChanged() {
    if (!this.ctx) return;
    const m = this.getMachine();
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volume * Math.pow(10, m.masterLevelDb / 20), now, 0.02);
    for (const v of this.voices) {
      const pg = m.programs[m.drums[v.drum]?.pgm ?? 0]; const np = pg?.notes[v.note - NOTE_MIN]; if (!np) continue;
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (np.pan - 50) / 50)), now, 0.02);
    }
  }
}
