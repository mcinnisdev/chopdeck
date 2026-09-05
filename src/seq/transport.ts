// The sequencer transport: play, record, overdub, loop, count-in, metronome, note repeat, erase, tap tempo.
// Lookahead scheduling against the audio clock; ticks are the only unit inside the model.
import { Machine, Sequence, NoteEvent, PPQ, TIMING_TICKS, NOTE_MIN, TRACK_TYPES, SeqEvent } from '@/model/types';
import { tickToSeconds, secondsToTick, sequenceLengthTicks, barStartTick, tickToBBT, ticksPerBar, tsigAtBar, gridTick } from '@/model/time';
import { Session, RecordMode } from '@/kernel/session';
import { TransportApi, SoundApi, NoteVar } from '@/kernel/screen';
import { insertEvent, correctTick, eventsInRange } from './events';
import { Clock } from './clock';

export interface TransportHost {
  m: Machine;
  s: Session;
  sound: SoundApi;
  touch(): void;
  snapshotForUndo(): void;
  /** Which DRUM slot / note a pad plays right now. */
  padTarget(pad: number): { drum: number; note: number; program: number };
}

const LOOKAHEAD_SEC = 0.12;
const PUMP_MS = 25;
const UI_EVERY = 2;

interface PendingNote { ev: NoteEvent; track: number; startTick: number }

export class Transport implements TransportApi {
  private anchorTick = 0;        // tick at anchorTime
  private anchorTime = 0;        // audio seconds
  private scheduledTo = 0;       // ticks scheduled so far (exclusive)
  private tempoKey = '';
  private running = false;
  private armed: RecordMode = 'OFF';
  private recording: RecordMode = 'OFF';
  private recordedNow = new Set<SeqEvent>();   // events written during this pass; REC must not erase them
  private erasedTo = 0;                        // REC replace window progress
  private pending = new Map<number, PendingNote>();   // pad -> note being held
  private repeatHeld = false;
  private eraseHeld = false;
  private heldPads = new Map<number, { drum: number; note: number; vel: number; nv?: NoteVar; pressure: number; program: number }>();
  private repeatLast = new Map<number, number>();      // pad -> last grid slot emitted
  private taps: number[] = [];
  private pumpCount = 0;
  private countInEnd = 0;        // tick (negative start) where count-in ends; 0 when none
  private waiting = false;       // Wait for key
  private stopAtEnd = false;

  constructor(private host: TransportHost, private clock: Clock) {}

  // ---------- helpers ----------
  private get m() { return this.host.m; }
  private get s() { return this.host.s; }
  private seq(): Sequence { return this.m.sequences[this.s.seq]; }
  private baseTempo(seq = this.seq()): number {
    if (this.s.songPlaying) { const song = this.m.songs[this.s.song]; if (song.tempoSource === 'MAS') return song.tempo; }
    return seq.tempoSource === 'MAS' ? this.s.masterTempo : seq.tempo;
  }
  /** Song: move to the next repeat/step. Returns false when the song is over. */
  private advanceSong(): boolean {
    const song = this.m.songs[this.s.song]; const s = this.s;
    const step = song.steps[s.songStep]; if (!step) return false;
    if (step.reps === 0) return false;
    if (s.songRep + 1 < step.reps) { s.songRep++; return true; }
    s.songRep = 0; s.songStep++;
    if (s.songStep >= song.steps.length || (song.loop.on && s.songStep >= song.loop.last)) {
      if (!song.loop.on) return false;
      s.songStep = Math.max(0, song.loop.first - 1);
    }
    s.seq = song.steps[s.songStep].seq;
    return true;
  }
  private tempoSignature(): string { const q = this.seq(); return `${this.baseTempo(q)}|${q.tempoChangeOn}|${q.tempoChanges.map(c => `${c.tick}:${c.ratio}`).join(',')}`; }
  // the tempo map in force since the last anchor; live edits take effect at the next re-anchor
  private map = { base: 120, on: false, changes: [{ tick: 0, ratio: 1 }] as Sequence['tempoChanges'] };
  private secAt(tick: number): number { return tickToSeconds(this.map.base, this.map.on, this.map.changes, tick); }
  private tickAtSec(sec: number): number { return secondsToTick(this.map.base, this.map.on, this.map.changes, sec); }
  private timeAtTick(tick: number): number { return this.anchorTime + (this.secAt(tick) - this.secAt(this.anchorTick)); }
  private tickAtTime(time: number): number { return this.tickAtSec(this.secAt(this.anchorTick) + (time - this.anchorTime)); }
  tickNow(): number { return this.running ? this.tickAtTime(this.host.sound.now()) : this.s.now; }

  private loopRegion(): { start: number; end: number } | null {
    const q = this.seq();
    if (!q.loop.on || this.s.songPlaying) return null;
    const start = barStartTick(q.tsigs, Math.max(0, q.loop.first - 1));
    const endBar = q.loop.last === 'END' ? q.bars : Math.min(q.loop.last, Math.max(q.bars, q.loop.first));
    const end = barStartTick(q.tsigs, Math.max(endBar, q.loop.first));
    if (end <= start) return null;
    return { start, end };
  }

  private reanchor(tick: number, time: number) {
    this.anchorTick = tick; this.anchorTime = time;
    const q = this.seq();
    this.map = { base: this.baseTempo(q), on: q.tempoChangeOn, changes: q.tempoChanges.map(c => ({ ...c })) };
    this.tempoKey = this.tempoSignature();
  }

  // ---------- TransportApi ----------
  play(fromStart: boolean) {
    if (this.running) { if (fromStart) this.locate(0); return; }
    this.s.songPlaying = false;
    if (this.s.mode === 'SONG') {
      const song = this.m.songs[this.s.song];
      if (!song.steps.length) return;
      if (fromStart || this.s.songStep >= song.steps.length) { this.s.songStep = 0; this.s.songRep = 0; this.s.now = 0; }
      this.s.seq = song.steps[this.s.songStep].seq;
      this.s.songPlaying = true;
      this.armed = 'OFF';
    }
    const q = this.seq();
    if (fromStart) this.s.now = 0;
    const loop = this.loopRegion();
    if (loop && (this.s.now < loop.start || this.s.now >= loop.end)) this.s.now = fromStart ? 0 : loop.start;
    this.recording = this.armed;
    if (this.recording !== 'OFF') { this.host.snapshotForUndo(); q.used = true; }
    this.recordedNow.clear();
    const now = this.host.sound.now();
    // count-in: one bar before the start tick
    const c = this.m.count;
    const wantsCount = c.countIn === 'REC+PLAY' || (c.countIn === 'REC ONLY' && this.recording !== 'OFF');
    const barTicks = ticksPerBar(tsigAtBar(q.tsigs, Math.max(0, tickToBBT(q.tsigs, this.s.now).bar - 1)));
    const startTick = wantsCount ? this.s.now - barTicks : this.s.now;
    this.countInEnd = wantsCount ? this.s.now : 0;
    this.reanchor(startTick, now + 0.03);
    this.scheduledTo = startTick;
    this.erasedTo = this.s.now;
    this.stopAtEnd = false;
    this.waiting = this.recording !== 'OFF' && c.waitForKey;
    this.running = true;
    this.s.playing = true;
    this.s.record = this.recording;
    if (!this.waiting) this.clock.start(() => this.pump(), PUMP_MS);
    this.host.touch();
  }

  stop() {
    if (this.running) {
      const now = this.host.sound.now();
      const tick = Math.max(0, Math.floor(this.tickAtTime(now)));
      this.finishPending(tick);
      this.s.now = this.clampToSeq(tick);
    }
    this.clock.stop();
    this.running = false;
    this.waiting = false;
    this.recording = 'OFF';
    this.armed = 'OFF';
    this.s.playing = false;
    this.s.record = 'OFF';
    this.s.songPlaying = false;
    this.s.litPads.clear();
    this.host.sound.stopAll();
    this.host.touch();
  }

  setRecord(mode: RecordMode) {
    if (this.running) {
      // punch in / out
      if (this.recording === mode) { this.recording = 'OFF'; this.armed = 'OFF'; }
      else { this.recording = mode; this.armed = mode; this.host.snapshotForUndo(); this.seq().used = true; this.recordedNow.clear(); this.erasedTo = Math.floor(this.tickNow()); }
    } else {
      this.armed = this.armed === mode ? 'OFF' : mode;
    }
    this.s.record = this.running ? this.recording : this.armed;
    this.host.touch();
  }

  locate(tick: number) {
    const t = Math.max(0, tick);
    if (this.running) {
      const now = this.host.sound.now();
      this.finishPending(Math.floor(this.tickAtTime(now)));
      this.host.sound.stopAll();
      this.reanchor(t, now + 0.02);
      this.scheduledTo = t;
      this.erasedTo = t;
      this.countInEnd = 0;
    }
    this.s.now = t;
    this.host.touch();
  }

  tap() {
    const now = performance.now() / 1000;
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2) this.taps = [];
    this.taps.push(now);
    const n = Math.max(2, this.m.tapAveraging + 1);
    if (this.taps.length > n) this.taps.shift();
    if (this.taps.length >= 2) {
      const intervals = this.taps.slice(1).map((t, i) => t - this.taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round((60 / avg) * 10) / 10;
      if (bpm >= 30 && bpm <= 300) { const q = this.seq(); if (q.tempoSource === 'MAS') this.s.masterTempo = bpm; else q.tempo = bpm; this.host.touch(); }
    }
  }

  /** NEXT SEQ > SUDDEN: jump to another sequence right now (from its start). */
  switchSequence(seq: number) {
    if (seq === this.s.seq) return;
    this.s.seq = seq; this.s.nextSeq = null; this.s.message = null;
    if (this.running) { const now = this.host.sound.now(); this.finishPending(Math.floor(this.tickAtTime(now))); this.host.sound.stopAll(); this.reanchor(0, now + 0.02); this.scheduledTo = 0; this.erasedTo = 0; this.recordedNow.clear(); }
    this.s.now = 0;
    this.host.touch();
  }

  setRepeat(on: boolean) { this.repeatHeld = on; if (!on) this.repeatLast.clear(); }
  setErase(on: boolean) { this.eraseHeld = on; }

  // ---------- pads ----------
  padDown(pad: number, drum: number, note: number, vel: number, nv?: NoteVar) {
    const { program } = this.host.padTarget(pad);
    this.heldPads.set(pad, { drum, note, vel, nv, pressure: vel / 127, program });
    if (this.repeatHeld) this.taps = [];
    if (!this.running) return;
    if (this.waiting) { this.waiting = false; this.clock.start(() => this.pump(), PUMP_MS); this.reanchor(this.anchorTick, this.host.sound.now() + 0.01); return; }
    if (this.repeatHeld) return; // repeats are emitted by the scheduler on the grid
    if (this.eraseHeld) return;
    if (this.recording === 'OFF') return;
    const tr = this.seq().tracks[this.s.track];
    const raw = this.tickAtTime(this.host.sound.now());
    if (!this.inPunch(raw)) return;
    let tick = Math.round(raw);
    tick = correctTick(tick, this.m.timing, this.m.swing);
    tick = Math.max(0, tick);
    const loop = this.loopRegion();
    if (loop && tick >= loop.end) tick = loop.start + (tick - loop.end);
    const ev: NoteEvent = { kind: 'note', tick, note, vel, dur: 1, nv: nv?.value ?? 0 };
    insertEvent(tr.events, ev);
    tr.used = true;
    this.recordedNow.add(ev);
    this.pending.set(pad, { ev, track: this.s.track, startTick: tick });
    this.host.touch();
  }

  padUp(pad: number) {
    this.heldPads.delete(pad);
    this.repeatLast.delete(pad);
    const p = this.pending.get(pad);
    if (!p) return;
    this.pending.delete(pad);
    if (!this.running) return;
    const end = Math.round(this.tickAtTime(this.host.sound.now()));
    p.ev.dur = Math.max(1, end - p.startTick);
  }

  padPressure(pad: number, value: number) { const h = this.heldPads.get(pad); if (h) h.pressure = Math.max(0.05, Math.min(1, value)); }

  /** Auto punch: is this position inside the recording window? */
  private inPunch(tick: number): boolean {
    const p = this.s.punch; if (!p) return true;
    if (p.mode === 'PUNCH IN ONLY') return tick >= p.in;
    if (p.mode === 'PUNCH OUT ONLY') return tick < p.out;
    return tick >= p.in && tick < p.out;
  }

  private finishPending(tick: number) {
    for (const [, p] of this.pending) p.ev.dur = Math.max(1, tick - p.startTick);
    this.pending.clear();
  }

  private clampToSeq(tick: number): number {
    const loop = this.loopRegion();
    if (loop && tick >= loop.end) return loop.start + ((tick - loop.start) % (loop.end - loop.start));
    return tick;
  }

  // ---------- the scheduler ----------
  private pump() {
    if (!this.running) return;
    const sound = this.host.sound;
    const now = sound.now();
    if (this.tempoSignature() !== this.tempoKey) this.reanchor(this.tickAtTime(now), now);
    const horizon = now + LOOKAHEAD_SEC;
    let budget = 8;
    while (budget-- > 0) {
      const targetTick = Math.floor(this.tickAtTime(horizon));
      if (targetTick <= this.scheduledTo) break;
      const q = this.seq();
      const loop = this.loopRegion();
      const seqEnd = sequenceLengthTicks(q);
      let to = targetTick;
      let wrapAt: number | null = null;
      if (loop && this.scheduledTo < loop.end && to >= loop.end) { to = loop.end; wrapAt = loop.end; }
      else if (!loop && seqEnd > 0 && this.scheduledTo < seqEnd && to >= seqEnd) {
        if (this.s.songPlaying) { to = seqEnd; wrapAt = seqEnd; }
        else if (this.recording !== 'OFF') { q.bars += 1; continue; }   // auto-append while recording
        else if (this.s.nextSeq != null) { to = seqEnd; wrapAt = seqEnd; }
        else { to = seqEnd; this.stopAtEnd = true; }
      }
      this.scheduleRange(this.scheduledTo, to);
      this.scheduledTo = to;
      if (wrapAt != null) {
        const t = this.timeAtTick(wrapAt);
        this.finishPending(wrapAt);
        if (this.s.songPlaying) { if (this.advanceSong()) { this.reanchor(0, t); this.scheduledTo = 0; } else { this.stopAtEnd = true; break; } }
        else if (this.s.nextSeq != null) { this.s.seq = this.s.nextSeq; this.s.nextSeq = null; this.s.message = null; this.reanchor(0, t); this.scheduledTo = 0; this.erasedTo = 0; this.recordedNow.clear(); }
        else { const start = loop!.start; this.reanchor(start, t); this.scheduledTo = start; this.erasedTo = start; this.recordedNow.clear(); if (this.recording === 'REC') { this.recording = 'OVERDUB'; this.armed = 'OVERDUB'; this.s.record = 'OVERDUB'; } }
      }
      if (this.stopAtEnd) break;
    }
    // position + UI
    const tick = this.tickAtTime(now);
    if (this.stopAtEnd && tick >= sequenceLengthTicks(this.seq())) { this.stop(); this.s.now = 0; this.host.touch(); return; }
    this.s.now = Math.max(0, Math.floor(tick));
    this.updateLitPads(tick);
    if (++this.pumpCount % UI_EVERY === 0) this.host.touch();
  }

  /** Schedule everything with from <= tick < to (ticks may be negative during count-in). */
  private scheduleRange(from: number, to: number) {
    if (to <= from) return;
    const q = this.seq();
    const sound = this.host.sound;
    const c = this.m.count;

    // metronome / count-in
    const clickOn = from < 0 || (this.recording !== 'OFF' ? c.inRec : c.inPlay);
    if (clickOn) {
      const rateTicks = c.rate === '1/4' ? PPQ : TIMING_TICKS[c.rate] ?? PPQ;
      for (let t = Math.ceil(from / rateTicks) * rateTicks; t < to; t += rateTicks) {
        if (t < 0 && t < this.countInEnd - ticksPerBar(tsigAtBar(q.tsigs, 0))) continue;
        const bbt = tickToBBT(q.tsigs, Math.max(0, t));
        const accent = t <= 0 ? t === this.countInEnd - ticksPerBar(tsigAtBar(q.tsigs, 0)) || t === 0 : bbt.beat === 1 && bbt.tick === 0;
        const when = this.timeAtTick(t);
        if (c.sound === 'CLICK') sound.click(accent, c.clickVolume / 100, when);
        else { const drum = ['DRUM1', 'DRUM2', 'DRUM3', 'DRUM4'].indexOf(c.sound); sound.noteOn(drum, accent ? c.accentNote : c.normalNote, accent ? c.accentVel : c.normalVel, undefined, when); }
      }
    }
    if (to <= 0) return;
    const f0 = Math.max(0, from);

    // REC replaces: drop pre-existing events on the record track as the head passes over them
    if (this.recording === 'REC') {
      const tr = q.tracks[this.s.track];
      const a = Math.max(this.erasedTo, f0);
      if (to > a) { tr.events = tr.events.filter(e => e.tick < a || e.tick >= to || this.recordedNow.has(e) || !this.inPunch(e.tick)); this.erasedTo = to; }
    }
    // ERASE held + pads held during overdub: erase those notes as the head passes
    if (this.eraseHeld && this.recording === 'OVERDUB' && this.heldPads.size) {
      const notes = new Set([...this.heldPads.values()].map(h => h.note));
      const tr = q.tracks[this.s.track];
      tr.events = tr.events.filter(e => !(e.kind === 'note' && e.tick >= f0 && e.tick < to && notes.has(e.note)));
    }

    // track playback (the active sequence, plus the second sequence when one is switched on)
    const second = this.s.secondSeq != null && this.s.secondSeq !== this.s.seq ? this.m.sequences[this.s.secondSeq] : null;
    const play = (tracks: Sequence['tracks'], primary: boolean) => tracks.forEach((tr, ti) => {
      if (!tr.on || (primary && this.s.soloTrack != null && this.s.soloTrack !== ti)) return;
      const ti0 = TRACK_TYPES.indexOf(tr.type);
      if (ti0 <= 0) return; // MIDI tracks: Phase 5
      const drum = ti0 - 1;
      for (const e of eventsInRange(tr.events, f0, to)) {
        if (e.kind !== 'note') continue;
        if (this.recordedNow.has(e)) continue; // the pad already sounded live
        const vel = Math.min(127, Math.max(1, Math.round(e.vel * tr.veloPct / 100)));
        const when = this.timeAtTick(e.tick);
        const nv: NoteVar | undefined = e.nv ? { param: this.m.noteVariation.param, value: e.nv } : undefined;
        sound.noteOn(drum, e.note, vel, nv, when);
        sound.noteOff(drum, e.note, this.timeAtTick(e.tick + e.dur));
      }
    });
    play(q.tracks, true);
    if (second) play(second.tracks, false);

    // note repeat: held pads on the timing grid
    if (this.repeatHeld && this.heldPads.size && this.m.timing !== 'OFF') {
      const grid = TIMING_TICKS[this.m.timing];
      const tr = q.tracks[this.s.track];
      for (const [pad, h] of this.heldPads) {
        for (let slot = Math.ceil(f0 / grid) - 1; ; slot++) {
          const t = gridTick(slot, grid, this.m.swing);
          if (t < f0) continue;
          if (t >= to) break;
          if (this.repeatLast.get(pad) === slot) continue;
          this.repeatLast.set(pad, slot);
          const vel = Math.max(1, Math.round(h.pressure * 127));
          sound.noteOn(h.drum, h.note, vel, h.nv, this.timeAtTick(t));
          if (this.recording !== 'OFF') {
            const ev: NoteEvent = { kind: 'note', tick: t, note: h.note, vel, dur: Math.max(1, grid - 2), nv: h.nv?.value ?? 0 };
            insertEvent(tr.events, ev); tr.used = true; this.recordedNow.add(ev);
          }
        }
      }
    }
  }

  private updateLitPads(tick: number) {
    const q = this.seq();
    const lit = new Set<number>();
    const win = 6;
    const pg = this.m.programs[this.m.drums[this.s.drum].pgm];
    const map = pg.padAssign === 'MASTER' ? this.m.masterPadToNote : pg.padToNote;
    for (const tr of q.tracks) {
      if (!tr.on || tr.type === 'MIDI') continue;
      for (const e of eventsInRange(tr.events, Math.floor(tick) - win, Math.floor(tick) + 1)) if (e.kind === 'note') { const p = map.indexOf(e.note); if (p >= 0) lit.add(p); }
    }
    this.s.litPads = lit;
  }

  /** Tick range check used by tests. */
  get isRunning() { return this.running; }
  get recordMode() { return this.recording; }
}

export { NOTE_MIN };
