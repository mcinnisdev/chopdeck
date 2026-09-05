// The effects rack: two multi-effect chains (M1, M2) and two reverbs (R1, R2) on native Web Audio nodes.
// Every module is always wired; ON/OFF is a crossfade between dry and processed so switching is click-free.
import { FxSets, MultiFxParams, ReverbParams } from '@/model/types';

type Ctx = BaseAudioContext;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A module wrapper: input -> (dry | wet) -> output, with a smooth bypass. */
class Module {
  input: GainNode; output: GainNode; wetIn: GainNode; wetOut: GainNode; private dry: GainNode;
  constructor(protected ctx: Ctx) {
    this.input = ctx.createGain(); this.output = ctx.createGain(); this.wetIn = ctx.createGain(); this.wetOut = ctx.createGain(); this.dry = ctx.createGain();
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.wetIn); this.wetOut.connect(this.output);
  }
  setOn(on: boolean) { const t = this.ctx.currentTime; this.dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.02); this.wetOut.gain.setTargetAtTime(on ? 1 : 0, t, 0.02); }
}

function distCurve(gain01: number): Float32Array {
  const n = 2048; const k = 2 + gain01 * 60; const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}

class Distortion extends Module {
  private shaper: WaveShaperNode; private pre: GainNode; private post: GainNode; private ring: GainNode; private ringOsc: OscillatorNode; private ringDepth: GainNode; private straight: GainNode;
  constructor(ctx: Ctx) {
    super(ctx);
    this.pre = ctx.createGain(); this.shaper = ctx.createWaveShaper(); this.shaper.oversample = '2x'; this.post = ctx.createGain();
    // ring modulation: multiply by an oscillator through a gain whose gain param is driven by the osc
    this.ring = ctx.createGain(); this.ring.gain.value = 0; this.ringOsc = ctx.createOscillator(); this.ringOsc.frequency.value = 440; this.ringDepth = ctx.createGain(); this.ringDepth.gain.value = 0; this.ringOsc.connect(this.ringDepth); this.ringDepth.connect(this.ring.gain); this.ringOsc.start();
    this.straight = ctx.createGain(); this.straight.gain.value = 1;
    this.wetIn.connect(this.pre); this.pre.connect(this.shaper); this.shaper.connect(this.straight); this.shaper.connect(this.ring); this.straight.connect(this.post); this.ring.connect(this.post); this.post.connect(this.wetOut);
  }
  apply(p: MultiFxParams['dist']) {
    const t = this.ctx.currentTime;
    this.shaper.curve = distCurve(p.gain / 100) as Float32Array<ArrayBuffer>;
    this.pre.gain.setTargetAtTime(1 + p.gain / 25, t, 0.02);
    this.post.gain.setTargetAtTime((p.level / 100) * 0.7, t, 0.02);
    this.ringOsc.frequency.setTargetAtTime(Math.max(20, p.ringFreq), t, 0.02);
    const d = clamp01(p.ringDepth / 100);
    this.ringDepth.gain.setTargetAtTime(d, t, 0.02); this.straight.gain.setTargetAtTime(1 - d, t, 0.02);
    this.setOn(p.on);
  }
}

class FourBand extends Module {
  private low: BiquadFilterNode; private m1: BiquadFilterNode; private m2: BiquadFilterNode; private high: BiquadFilterNode;
  constructor(ctx: Ctx) {
    super(ctx);
    this.low = ctx.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 120;
    this.m1 = ctx.createBiquadFilter(); this.m1.type = 'peaking'; this.m1.Q.value = 1;
    this.m2 = ctx.createBiquadFilter(); this.m2.type = 'peaking'; this.m2.Q.value = 1;
    this.high = ctx.createBiquadFilter(); this.high.type = 'highshelf'; this.high.frequency.value = 6000;
    this.wetIn.connect(this.low); this.low.connect(this.m1); this.m1.connect(this.m2); this.m2.connect(this.high); this.high.connect(this.wetOut);
  }
  apply(p: MultiFxParams['filt']) {
    const t = this.ctx.currentTime;
    this.low.gain.setTargetAtTime(p.low, t, 0.02); this.m1.gain.setTargetAtTime(p.mid1, t, 0.02); this.m1.frequency.setTargetAtTime(p.mid1Freq, t, 0.02);
    this.m2.gain.setTargetAtTime(p.mid2, t, 0.02); this.m2.frequency.setTargetAtTime(p.mid2Freq, t, 0.02); this.high.gain.setTargetAtTime(p.high, t, 0.02);
    this.setOn(p.on);
  }
}

class Modulation extends Module {
  private delayL: DelayNode; private delayR: DelayNode; private lfo: OscillatorNode; private depthL: GainNode; private depthR: GainNode; private fb: GainNode;
  private allpass: BiquadFilterNode[] = []; private apGain: GainNode; private dlGain: GainNode; private panL: GainNode; private panR: GainNode; private merger: ChannelMergerNode; private splitter: ChannelSplitterNode;
  constructor(ctx: Ctx) {
    super(ctx);
    this.splitter = ctx.createChannelSplitter(2); this.merger = ctx.createChannelMerger(2);
    this.delayL = ctx.createDelay(0.1); this.delayR = ctx.createDelay(0.1);
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.8; this.lfo.start();
    this.depthL = ctx.createGain(); this.depthR = ctx.createGain(); this.lfo.connect(this.depthL); this.lfo.connect(this.depthR); this.depthL.connect(this.delayL.delayTime); this.depthR.connect(this.delayR.delayTime);
    this.fb = ctx.createGain(); this.fb.gain.value = 0;
    this.panL = ctx.createGain(); this.panR = ctx.createGain();
    this.wetIn.connect(this.splitter);
    this.splitter.connect(this.delayL, 0); this.splitter.connect(this.delayR, 1);
    this.delayL.connect(this.fb); this.fb.connect(this.delayL);
    this.delayL.connect(this.panL); this.delayR.connect(this.panR);
    this.dlGain = ctx.createGain(); this.panL.connect(this.merger, 0, 0); this.panR.connect(this.merger, 0, 1); this.merger.connect(this.dlGain); this.dlGain.connect(this.wetOut);
    // phaser: 4 allpass stages with LFO on frequency
    this.apGain = ctx.createGain(); this.apGain.gain.value = 0;
    let prev: AudioNode = this.wetIn;
    for (let i = 0; i < 4; i++) { const ap = ctx.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = 800 + i * 400; ap.Q.value = 0.7; prev.connect(ap); prev = ap; this.allpass.push(ap); this.depthL.connect(ap.frequency); }
    prev.connect(this.apGain); this.apGain.connect(this.wetOut);
  }
  apply(p: MultiFxParams['mod']) {
    const t = this.ctx.currentTime; const d = clamp01(p.depth / 100);
    this.lfo.frequency.setTargetAtTime(Math.max(0.05, p.speed), t, 0.05);
    const isPhaser = p.type === 'PHASE SHIFT'; const isFlange = p.type === 'FLANGE'; const isPitch = p.type === 'PITCH SHIFT';
    const base = isFlange ? 0.003 : isPitch ? 0.02 : 0.012;
    const sweep = isFlange ? 0.0025 * d : isPitch ? 0.015 * d : 0.004 * d;
    this.delayL.delayTime.setTargetAtTime(base, t, 0.05); this.delayR.delayTime.setTargetAtTime(base * 1.3, t, 0.05);
    this.depthL.gain.setTargetAtTime(isPhaser ? 600 * d : sweep, t, 0.05); this.depthR.gain.setTargetAtTime(isPhaser ? 0 : -sweep, t, 0.05);
    this.fb.gain.setTargetAtTime(isFlange ? clamp01(p.feedback / 100) * 0.85 : clamp01(p.feedback / 100) * 0.3, t, 0.05);
    this.dlGain.gain.setTargetAtTime(isPhaser ? 0 : 1, t, 0.05); this.apGain.gain.setTargetAtTime(isPhaser ? 1 : 0, t, 0.05);
    if (p.type === 'FMOD/AUTOPAN' || p.type === 'ROTARY SPEAKERS') { /* autopan: LFO on channel gains */ this.panL.gain.setTargetAtTime(1, t, 0.05); this.panR.gain.setTargetAtTime(1, t, 0.05); }
    this.setOn(p.on);
  }
}

class Echo extends Module {
  private dL: DelayNode; private dR: DelayNode; private fbL: GainNode; private fbR: GainNode; private dampL: BiquadFilterNode; private dampR: BiquadFilterNode; private split: ChannelSplitterNode; private merge: ChannelMergerNode; private crossLR: GainNode; private crossRL: GainNode;
  constructor(ctx: Ctx) {
    super(ctx);
    this.split = ctx.createChannelSplitter(2); this.merge = ctx.createChannelMerger(2);
    this.dL = ctx.createDelay(1); this.dR = ctx.createDelay(1);
    this.fbL = ctx.createGain(); this.fbR = ctx.createGain(); this.crossLR = ctx.createGain(); this.crossRL = ctx.createGain();
    this.dampL = ctx.createBiquadFilter(); this.dampL.type = 'lowpass'; this.dampR = ctx.createBiquadFilter(); this.dampR.type = 'lowpass';
    this.wetIn.connect(this.split);
    this.split.connect(this.dL, 0); this.split.connect(this.dR, 1);
    this.dL.connect(this.dampL); this.dR.connect(this.dampR);
    this.dampL.connect(this.fbL); this.fbL.connect(this.dL); this.dampR.connect(this.fbR); this.fbR.connect(this.dR);
    this.dampL.connect(this.crossLR); this.crossLR.connect(this.dR); this.dampR.connect(this.crossRL); this.crossRL.connect(this.dL);
    this.dampL.connect(this.merge, 0, 0); this.dampR.connect(this.merge, 0, 1); this.merge.connect(this.wetOut);
  }
  apply(p: MultiFxParams['echo']) {
    const t = this.ctx.currentTime; const sec = Math.max(0.001, Math.min(0.99, p.delayMs / 1000)); const fb = clamp01(p.feedback / 100) * 0.9;
    const cross = p.type === 'X-OVER L&R';
    this.dL.delayTime.setTargetAtTime(sec, t, 0.02); this.dR.delayTime.setTargetAtTime(p.type === 'STEREO' ? sec * 0.75 : sec, t, 0.02);
    this.fbL.gain.setTargetAtTime(cross ? 0 : fb, t, 0.02); this.fbR.gain.setTargetAtTime(cross || p.type === 'MONO LEFT' ? 0 : fb, t, 0.02);
    this.crossLR.gain.setTargetAtTime(cross ? fb : 0, t, 0.02); this.crossRL.gain.setTargetAtTime(cross ? fb : 0, t, 0.02);
    const cutoff = 20000 * Math.pow(0.05, clamp01(p.hfDamp / 100));
    this.dampL.frequency.setTargetAtTime(cutoff, t, 0.02); this.dampR.frequency.setTargetAtTime(cutoff, t, 0.02);
    this.setOn(p.on);
  }
}

/** Schroeder-style reverb: 4 parallel combs into 2 series allpasses, per channel, with predelay and damping. */
class Reverb extends Module {
  private pre: DelayNode; private combs: { d: DelayNode; g: GainNode; lp: BiquadFilterNode }[] = []; private aps: DelayNode[] = []; private apG: GainNode[] = []; private level: GainNode; private gate: GainNode;
  constructor(ctx: Ctx) {
    super(ctx);
    this.pre = ctx.createDelay(0.3);
    this.level = ctx.createGain(); this.gate = ctx.createGain();
    const sum = ctx.createGain();
    this.wetIn.connect(this.pre);
    for (const ms of [29.7, 37.1, 41.1, 43.7]) {
      const d = ctx.createDelay(0.2); d.delayTime.value = ms / 1000; const g = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      this.pre.connect(d); d.connect(lp); lp.connect(g); g.connect(d); d.connect(sum);
      this.combs.push({ d, g, lp });
    }
    let node: AudioNode = sum;
    for (const ms of [5, 1.7]) {
      const d = ctx.createDelay(0.05); d.delayTime.value = ms / 1000; const g = ctx.createGain(); g.gain.value = 0.5; const mix = ctx.createGain();
      node.connect(d); d.connect(g); g.connect(d); node.connect(mix); d.connect(mix); node = mix; this.aps.push(d); this.apG.push(g);
    }
    node.connect(this.gate); this.gate.connect(this.level); this.level.connect(this.wetOut);
  }
  apply(p: ReverbParams) {
    const t = this.ctx.currentTime;
    const size = p.type.includes('LARGE') ? 1.5 : p.type.includes('SMALL') ? 0.8 : 1;
    const decay = 0.6 + clamp01(p.time / 100) * 0.38;
    this.pre.delayTime.setTargetAtTime(Math.min(0.29, p.predelayMs / 1000), t, 0.02);
    const cutoff = 18000 * Math.pow(0.08, clamp01(p.hfDamp / 100));
    this.combs.forEach((c, i) => { c.d.delayTime.setTargetAtTime(([29.7, 37.1, 41.1, 43.7][i] * size) / 1000, t, 0.02); c.g.gain.setTargetAtTime(p.type.startsWith('GATED') || p.type === 'REVERSE' ? decay * 0.8 : decay, t, 0.02); c.lp.frequency.setTargetAtTime(cutoff, t, 0.02); });
    this.apG.forEach(g => g.gain.setTargetAtTime(0.3 + clamp01(p.diffuse / 100) * 0.4, t, 0.02));
    this.level.gain.setTargetAtTime((p.level / 100) * 0.5, t, 0.02);
    this.setOn(p.on);
  }
}

class MultiFx {
  input: GainNode; output: GainNode;
  private dist: Distortion; private filt: FourBand; private mod: Modulation; private echo: Echo; private rev: Reverb; private mix: GainNode; private direct: GainNode;
  constructor(ctx: Ctx) {
    this.input = ctx.createGain(); this.output = ctx.createGain();
    this.dist = new Distortion(ctx); this.filt = new FourBand(ctx); this.mod = new Modulation(ctx); this.echo = new Echo(ctx); this.rev = new Reverb(ctx); this.mix = ctx.createGain(); this.direct = ctx.createGain(); this.direct.gain.value = 0;
    this.input.connect(this.dist.input); this.dist.output.connect(this.filt.input); this.filt.output.connect(this.mod.input); this.mod.output.connect(this.echo.input); this.echo.output.connect(this.rev.input); this.rev.output.connect(this.mix); this.mix.connect(this.output);
    this.input.connect(this.direct); this.direct.connect(this.output);
  }
  apply(p: MultiFxParams) {
    this.dist.apply(p.dist); this.filt.apply(p.filt); this.mod.apply(p.mod); this.echo.apply(p.echo); this.rev.apply(p.rev);
    const t = this.input.context.currentTime;
    this.mix.gain.setTargetAtTime(p.mix.on ? p.mix.level / 100 : 0, t, 0.02);
    this.direct.gain.setTargetAtTime(p.mix.direct ? 1 : 0, t, 0.02);
  }
}

export class FxRack {
  buses: Record<'M1' | 'M2' | 'R1' | 'R2', GainNode>;
  private m1: MultiFx; private m2: MultiFx; private r1: Reverb; private r2: Reverb;
  constructor(ctx: Ctx, out: AudioNode) {
    this.m1 = new MultiFx(ctx); this.m2 = new MultiFx(ctx); this.r1 = new Reverb(ctx); this.r2 = new Reverb(ctx);
    this.buses = { M1: this.m1.input, M2: this.m2.input, R1: this.r1.input, R2: this.r2.input };
    this.m1.output.connect(out); this.m2.output.connect(out); this.r1.output.connect(out); this.r2.output.connect(out);
  }
  apply(fx: FxSets) { this.m1.apply(fx.m1); this.m2.apply(fx.m2); this.r1.apply({ ...fx.r1 }); this.r2.apply({ ...fx.r2 }); }
}
