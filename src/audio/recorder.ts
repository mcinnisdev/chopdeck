// SAMPLE mode input: captures mic/line (or the machine's own output) into a ring buffer with a pre-record
// window, threshold start and peak metering. Pure state machine over an AudioWorklet; UI reads `status()`.

export type RecorderInput = 'ANALOG' | 'RESAMPLE';
export type RecorderMode = 'MONO L' | 'MONO R' | 'STEREO';

export interface RecorderStatus {
  state: 'idle' | 'armed' | 'recording' | 'done';
  levelL: number; levelR: number;      // 0..1 instantaneous
  peakL: number; peakR: number;        // hold
  recorded: number;                    // frames captured so far
}

const WORKLET = `
class CapProc extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = e => { if (e.data === 'start') this.on = true; if (e.data === 'stop') this.on = false; }; }
  process(inputs) {
    const inp = inputs[0]; if (!inp || !inp.length) return true;
    const l = inp[0], r = inp[1] || inp[0];
    let pl = 0, pr = 0; for (let i = 0; i < l.length; i++) { const a = Math.abs(l[i]); if (a > pl) pl = a; const b = Math.abs(r[i]); if (b > pr) pr = b; }
    this.port.postMessage({ l: l.slice(), r: r.slice(), pl, pr }, [l.slice().buffer, r.slice().buffer].filter(Boolean));
    return true;
  }
}
registerProcessor('chopdeck-capture', CapProc);`;

export class Recorder {
  private node: AudioWorkletNode | null = null;
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private ring: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];
  private ringPos = 0;
  private ringFilled = 0;
  private chunks: [Float32Array[], Float32Array[]] = [[], []];
  private st: RecorderStatus = { state: 'idle', levelL: 0, levelR: 0, peakL: 0, peakR: 0, recorded: 0 };
  private thresholdLin = 0;      // 0 = OFF
  private maxFrames = 0;
  private preFrames = 0;
  private mode: RecorderMode = 'STEREO';
  private workletReady: Promise<void> | null = null;
  onChange: (() => void) | null = null;

  constructor(private ctx: () => AudioContext, private masterTap: () => AudioNode) {}

  status(): RecorderStatus { return this.st; }
  resetPeak() { this.st.peakL = 0; this.st.peakR = 0; this.onChange?.(); }

  /** Open the input. ANALOG asks for the microphone; RESAMPLE listens to the master bus. */
  async open(input: RecorderInput, monitor = false): Promise<void> {
    const c = this.ctx();
    await this.ensureWorklet(c);
    this.close();
    if (input === 'ANALOG') {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
      this.source = c.createMediaStreamSource(this.stream);
    } else this.source = this.masterTap();
    this.node = new AudioWorkletNode(c, 'chopdeck-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2 });
    this.node.port.onmessage = (e: MessageEvent<{ l: Float32Array; r: Float32Array; pl: number; pr: number }>) => this.onBlock(e.data);
    this.source.connect(this.node);
    // keep the worklet alive; monitor through a muted (or unmuted) gain
    const g = c.createGain(); g.gain.value = monitor && input === 'ANALOG' ? 1 : 0;
    this.node.connect(g); g.connect(c.destination);
    this.monitorGain = g;
  }
  private monitorGain: GainNode | null = null;
  setMonitor(on: boolean) { if (this.monitorGain) this.monitorGain.gain.value = on ? 1 : 0; }

  private ensureWorklet(c: AudioContext): Promise<void> {
    if (!this.workletReady) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      this.workletReady = c.audioWorklet.addModule(url);
    }
    return this.workletReady;
  }

  close() {
    try { this.node?.disconnect(); this.monitorGain?.disconnect(); if (this.stream) this.stream.getTracks().forEach(t => t.stop()); if (this.source && this.stream) this.source.disconnect(); } catch { /* fine */ }
    this.node = null; this.stream = null; this.source = null; this.monitorGain = null;
  }

  /** Arm: start capturing when the input crosses the threshold (or immediately when threshold is OFF). */
  arm(opts: { mode: RecorderMode; thresholdDb: number | null; seconds: number; preRecMs: number }) {
    const rate = this.ctx().sampleRate;
    this.mode = opts.mode;
    this.thresholdLin = opts.thresholdDb == null ? 0 : Math.pow(10, opts.thresholdDb / 20);
    this.maxFrames = Math.max(rate * 0.1, Math.floor(opts.seconds * rate));
    this.preFrames = Math.floor((opts.preRecMs / 1000) * rate);
    this.ring = [new Float32Array(this.preFrames + 1), new Float32Array(this.preFrames + 1)];
    this.ringPos = 0; this.ringFilled = 0;
    this.chunks = [[], []];
    this.st = { ...this.st, state: 'armed', recorded: 0 };
    this.node?.port.postMessage('start');
    if (this.thresholdLin === 0) this.startNow();
    this.onChange?.();
  }

  /** Manual START while armed. */
  startNow() {
    if (this.st.state !== 'armed') return;
    // pre-record: copy the ring into the first chunk
    if (this.ringFilled > 0) {
      for (let ch = 0; ch < 2; ch++) {
        const out = new Float32Array(this.ringFilled);
        for (let i = 0; i < this.ringFilled; i++) out[i] = this.ring[ch][(this.ringPos - this.ringFilled + i + this.ring[ch].length) % this.ring[ch].length];
        this.chunks[ch].push(out);
      }
      this.st.recorded = this.ringFilled;
    }
    this.st.state = 'recording';
    this.onChange?.();
  }

  stop() { if (this.st.state === 'recording' || this.st.state === 'armed') { this.st.state = this.st.state === 'recording' ? 'done' : 'idle'; this.node?.port.postMessage('stop'); this.onChange?.(); } }
  cancel() { this.st.state = 'idle'; this.chunks = [[], []]; this.st.recorded = 0; this.node?.port.postMessage('stop'); this.onChange?.(); }

  /** The captured audio in the requested channel layout, trimmed to the time limit. */
  take(): Float32Array[] {
    const join = (parts: Float32Array[]) => { const n = parts.reduce((a, p) => a + p.length, 0); const out = new Float32Array(Math.min(n, this.maxFrames)); let pos = 0; for (const p of parts) { const take = Math.min(p.length, out.length - pos); if (take <= 0) break; out.set(p.subarray(0, take), pos); pos += take; } return out; };
    const l = join(this.chunks[0]), r = join(this.chunks[1]);
    this.st.state = 'idle';
    if (this.mode === 'MONO L') return [l];
    if (this.mode === 'MONO R') return [r];
    return [l, r];
  }

  private onBlock(b: { l: Float32Array; r: Float32Array; pl: number; pr: number }) {
    this.st.levelL = b.pl; this.st.levelR = b.pr;
    this.st.peakL = Math.max(this.st.peakL, b.pl); this.st.peakR = Math.max(this.st.peakR, b.pr);
    if (this.st.state === 'armed') {
      // fill the pre-record ring
      const n = this.ring[0].length;
      if (n > 1) for (let i = 0; i < b.l.length; i++) { this.ring[0][this.ringPos] = b.l[i]; this.ring[1][this.ringPos] = b.r[i]; this.ringPos = (this.ringPos + 1) % n; this.ringFilled = Math.min(n - 1, this.ringFilled + 1); }
      if (this.thresholdLin > 0 && Math.max(b.pl, b.pr) >= this.thresholdLin) {
        this.startNow();
        // include this block from the threshold crossing onward
        this.chunks[0].push(b.l); this.chunks[1].push(b.r); this.st.recorded += b.l.length;
      }
    } else if (this.st.state === 'recording') {
      this.chunks[0].push(b.l); this.chunks[1].push(b.r); this.st.recorded += b.l.length;
      if (this.st.recorded >= this.maxFrames) { this.st.state = 'done'; this.node?.port.postMessage('stop'); }
    }
    this.onChange?.();
  }
}
