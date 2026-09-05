// Web MIDI adapter: ports, input dispatch, timestamped output, clock. Chromium only; elsewhere `available` is false.

export interface MidiMessage { data: Uint8Array; port: string; time: number }
export type MidiOutName = 'A' | 'B';

export interface MidiOutApi {
  noteOn(out: MidiOutName, ch: number, note: number, vel: number, when?: number): void;
  noteOff(out: MidiOutName, ch: number, note: number, when?: number): void;
  cc(out: MidiOutName, ch: number, cc: number, value: number, when?: number): void;
  pgm(out: MidiOutName, ch: number, value: number, when?: number): void;
  bend(out: MidiOutName, ch: number, value: number, when?: number): void;
  chpress(out: MidiOutName, ch: number, value: number, when?: number): void;
  polypress(out: MidiOutName, ch: number, note: number, value: number, when?: number): void;
  sysex(out: MidiOutName, bytes: number[], when?: number): void;
  clock(out: MidiOutName, when: number): void;
  start(out: MidiOutName, when: number, cont?: boolean): void;
  stop(out: MidiOutName, when: number): void;
  panic(): void;
}

export class MidiIO implements MidiOutApi {
  access: MIDIAccess | null = null;
  available = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  onMessage: ((m: MidiMessage) => void) | null = null;
  onPorts: (() => void) | null = null;
  /** performance.now()-domain time for an audio-clock time (seconds). Set by the app from the AudioContext. */
  audioToPerf: (when: number) => number = () => performance.now();
  private bindings: { inPort: string; outA: string; outB: string } = { inPort: '', outA: '', outB: '' };
  private activity = { in: new Set<number>(), outA: new Set<number>(), outB: new Set<number>() };
  private activityAt = 0;
  private lastInput: string = '';

  async init(): Promise<boolean> {
    if (!this.available) return false;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: true });
      this.access.onstatechange = () => { this.bind(this.bindings); this.onPorts?.(); };
      this.bind(this.bindings);
      return true;
    } catch { this.available = false; return false; }
  }
  inputs(): string[] { return this.access ? [...this.access.inputs.values()].map(p => p.name ?? p.id) : []; }
  outputs(): string[] { return this.access ? [...this.access.outputs.values()].map(p => p.name ?? p.id) : []; }
  lastInputSummary() { return this.lastInput; }
  /** Channels (0..15) that saw traffic in the last second, for the monitors. */
  monitor(which: 'in' | 'outA' | 'outB'): Set<number> { if (performance.now() - this.activityAt > 1000) { this.activity.in.clear(); this.activity.outA.clear(); this.activity.outB.clear(); } return this.activity[which]; }

  bind(b: { inPort: string; outA: string; outB: string }) {
    this.bindings = { ...b };
    if (!this.access) return;
    for (const inp of this.access.inputs.values()) {
      const name = inp.name ?? inp.id;
      inp.onmidimessage = name === b.inPort || (!b.inPort && inp === [...this.access.inputs.values()][0])
        ? (e: MIDIMessageEvent) => { if (!e.data) return; const d = e.data; if (d[0] !== 0xf8 && d[0] !== 0xfe) { this.lastInput = Array.from(d).map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(' '); this.activity.in.add(d[0] & 15); this.activityAt = performance.now(); } this.onMessage?.({ data: d, port: name, time: e.timeStamp }); }
        : null;
    }
  }
  private port(out: MidiOutName): MIDIOutput | null {
    if (!this.access) return null;
    const want = out === 'A' ? this.bindings.outA : this.bindings.outB;
    const list = [...this.access.outputs.values()];
    return list.find(p => (p.name ?? p.id) === want) ?? (out === 'A' && !want ? list[0] ?? null : null);
  }
  private send(out: MidiOutName, bytes: number[], when?: number) {
    const p = this.port(out); if (!p) return;
    try { p.send(bytes, when != null ? this.audioToPerf(when) : undefined); } catch { /* port closed */ }
    if (bytes[0] < 0xf0) { this.activity[out === 'A' ? 'outA' : 'outB'].add(bytes[0] & 15); this.activityAt = performance.now(); }
  }
  noteOn(out: MidiOutName, ch: number, note: number, vel: number, when?: number) { this.send(out, [0x90 | (ch & 15), note & 127, Math.max(1, vel & 127)], when); }
  noteOff(out: MidiOutName, ch: number, note: number, when?: number) { this.send(out, [0x80 | (ch & 15), note & 127, 64], when); }
  cc(out: MidiOutName, ch: number, cc: number, value: number, when?: number) { this.send(out, [0xb0 | (ch & 15), cc & 127, value & 127], when); }
  pgm(out: MidiOutName, ch: number, value: number, when?: number) { this.send(out, [0xc0 | (ch & 15), (value - 1) & 127], when); }
  bend(out: MidiOutName, ch: number, value: number, when?: number) { const v = Math.max(0, Math.min(16383, value + 8192)); this.send(out, [0xe0 | (ch & 15), v & 127, (v >> 7) & 127], when); }
  chpress(out: MidiOutName, ch: number, value: number, when?: number) { this.send(out, [0xd0 | (ch & 15), value & 127], when); }
  polypress(out: MidiOutName, ch: number, note: number, value: number, when?: number) { this.send(out, [0xa0 | (ch & 15), note & 127, value & 127], when); }
  sysex(out: MidiOutName, bytes: number[], when?: number) { const b = bytes[0] === 0xf0 ? bytes : [0xf0, ...bytes]; this.send(out, b[b.length - 1] === 0xf7 ? b : [...b, 0xf7], when); }
  clock(out: MidiOutName, when: number) { this.send(out, [0xf8], when); }
  start(out: MidiOutName, when: number, cont = false) { this.send(out, [cont ? 0xfb : 0xfa], when); }
  stop(out: MidiOutName, when: number) { this.send(out, [0xfc], when); }
  panic() { for (const out of ['A', 'B'] as const) for (let ch = 0; ch < 16; ch++) { this.send(out, [0xb0 | ch, 123, 0]); this.send(out, [0xb0 | ch, 121, 0]); } }
}

/** Decode a raw message into something the kernel can route. */
export type Parsed =
  | { kind: 'noteOn'; ch: number; note: number; vel: number }
  | { kind: 'noteOff'; ch: number; note: number }
  | { kind: 'cc'; ch: number; cc: number; value: number }
  | { kind: 'pgm'; ch: number; value: number }
  | { kind: 'bend'; ch: number; value: number }
  | { kind: 'chpress'; ch: number; value: number }
  | { kind: 'polypress'; ch: number; note: number; value: number }
  | { kind: 'sysex'; bytes: number[] }
  | { kind: 'clock' } | { kind: 'start' } | { kind: 'continue' } | { kind: 'stop' }
  | { kind: 'other' };
export function parseMidi(d: Uint8Array | number[]): Parsed {
  const s = d[0]; const ch = s & 15; const hi = s & 0xf0;
  if (s === 0xf8) return { kind: 'clock' }; if (s === 0xfa) return { kind: 'start' }; if (s === 0xfb) return { kind: 'continue' }; if (s === 0xfc) return { kind: 'stop' };
  if (s === 0xf0) return { kind: 'sysex', bytes: Array.from(d) };
  if (hi === 0x90) return d[2] > 0 ? { kind: 'noteOn', ch, note: d[1], vel: d[2] } : { kind: 'noteOff', ch, note: d[1] };
  if (hi === 0x80) return { kind: 'noteOff', ch, note: d[1] };
  if (hi === 0xb0) return { kind: 'cc', ch, cc: d[1], value: d[2] };
  if (hi === 0xc0) return { kind: 'pgm', ch, value: d[1] + 1 };
  if (hi === 0xe0) return { kind: 'bend', ch, value: ((d[2] << 7) | d[1]) - 8192 };
  if (hi === 0xd0) return { kind: 'chpress', ch, value: d[1] };
  if (hi === 0xa0) return { kind: 'polypress', ch, note: d[1], value: d[2] };
  return { kind: 'other' };
}

/** Footswitch function names, as on the MIDIsw page. */
export const FOOTSWITCH_FNS = ['PLAY STRT', 'PLAY', 'STOP', 'REC+PLAY', 'ODUB+PLAY', 'REC/PUNCH', 'ODUB/PNCH', 'TAP', 'PAD BANK A', 'PAD BANK B', 'PAD BANK C', 'PAD BANK D', ...Array.from({ length: 16 }, (_, i) => `PAD ${i + 1}`), 'F1', 'F2', 'F3', 'F4', 'F5', 'F6'] as const;

/** Simple MIDI clock follower: tempo from the spacing of 24 pulses per quarter note. */
export class ClockFollower {
  private times: number[] = [];
  bpm: number | null = null;
  pulse(perfNowMs: number) {
    this.times.push(perfNowMs); if (this.times.length > 48) this.times.shift();
    if (this.times.length >= 24) { const span = this.times[this.times.length - 1] - this.times[this.times.length - 24]; if (span > 0) this.bpm = Math.round((60000 / (span / 23 * 24)) * 10) / 10; }
  }
  reset() { this.times = []; this.bpm = null; }
}
