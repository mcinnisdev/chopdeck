// Pure operations on track event lists. Lists are kept sorted by tick (stable).
import { SeqEvent, NoteEvent, Track, Sequence, EventKind, TIMING_TICKS, TimingValue } from '@/model/types';
import { quantiseTick } from '@/model/time';

export function insertEvent(events: SeqEvent[], ev: SeqEvent): void {
  // binary search for the first event with tick > ev.tick so equal ticks keep insertion order
  let lo = 0, hi = events.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (events[mid].tick <= ev.tick) lo = mid + 1; else hi = mid; }
  events.splice(lo, 0, ev);
}

export function sortEvents(events: SeqEvent[]): SeqEvent[] { return events.sort((a, b) => a.tick - b.tick); }

/** Index of the first event with tick >= t. */
export function firstAtOrAfter(events: SeqEvent[], t: number): number {
  let lo = 0, hi = events.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (events[mid].tick < t) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Events with from <= tick < to. */
export function eventsInRange(events: SeqEvent[], from: number, to: number): SeqEvent[] {
  const out: SeqEvent[] = [];
  for (let i = firstAtOrAfter(events, from); i < events.length && events[i].tick < to; i++) out.push(events[i]);
  return out;
}

export interface EraseFilter {
  from: number; to: number;                       // tick range [from, to)
  mode?: 'ALL' | 'ONLY' | 'EXCEPT';
  kind?: EventKind;
  notes?: { lo: number; hi: number } | null;      // note range for NOTES (null = all)
}

export function eraseEvents(track: Track, f: EraseFilter): number {
  const before = track.events.length;
  track.events = track.events.filter(e => {
    if (e.tick < f.from || e.tick >= f.to) return true;
    const kindMatch = !f.kind || e.kind === f.kind;
    // a note range restricts erasing to notes inside it
    const noteOk = !f.notes || (e.kind === 'note' && e.note >= f.notes.lo && e.note <= f.notes.hi);
    const mode = f.mode ?? 'ALL';
    let erase: boolean;
    if (mode === 'ALL') erase = noteOk;
    else if (mode === 'ONLY') erase = kindMatch && (f.kind !== 'note' || noteOk);
    else erase = !kindMatch; // EXCEPT: keep the matching kind, erase the rest
    return !erase;
  });
  return before - track.events.length;
}

/** Timing correct (destructive): quantise notes in range, with swing and shift, keeping other events. */
export function timingCorrect(track: Track, opts: { value: TimingValue; swing: number; shift: number; from: number; to: number; notes?: { lo: number; hi: number } | null }): void {
  const grid = TIMING_TICKS[opts.value];
  if (opts.value === 'OFF') return;
  for (const e of track.events) {
    if (e.kind !== 'note' || e.tick < opts.from || e.tick >= opts.to) continue;
    if (opts.notes && (e.note < opts.notes.lo || e.note > opts.notes.hi)) continue;
    e.tick = Math.max(0, quantiseTick(e.tick, grid, opts.swing) + opts.shift);
  }
  sortEvents(track.events);
}

/** Quantise a single freshly recorded note (real-time timing correct). */
export function correctTick(tick: number, value: TimingValue, swing: number): number {
  return value === 'OFF' ? tick : quantiseTick(tick, TIMING_TICKS[value], swing);
}

export type ValueEdit = { type: 'ADD VALUE' | 'SUB VALUE' | 'MULT VAL%' | 'SET TO VAL'; value: number };
export function applyValueEdit(cur: number, e: ValueEdit, lo: number, hi: number): number {
  let v = cur;
  switch (e.type) {
    case 'ADD VALUE': v = cur + e.value; break;
    case 'SUB VALUE': v = cur - e.value; break;
    case 'MULT VAL%': v = Math.round(cur * e.value / 100); break;
    case 'SET TO VAL': v = e.value; break;
  }
  return Math.max(lo, Math.min(hi, v));
}

export function editVelocity(track: Track, e: ValueEdit, from: number, to: number, notes?: { lo: number; hi: number } | null): void {
  for (const ev of track.events) if (ev.kind === 'note' && ev.tick >= from && ev.tick < to && (!notes || (ev.note >= notes.lo && ev.note <= notes.hi))) ev.vel = applyValueEdit(ev.vel, e, 1, 127);
}
export function editDuration(track: Track, e: ValueEdit, from: number, to: number, notes?: { lo: number; hi: number } | null): void {
  for (const ev of track.events) if (ev.kind === 'note' && ev.tick >= from && ev.tick < to && (!notes || (ev.note >= notes.lo && ev.note <= notes.hi))) ev.dur = applyValueEdit(ev.dur, e, 1, 99999);
}
export function transposeEvents(track: Track, amount: number, from: number, to: number, notes?: { lo: number; hi: number } | null): void {
  for (const ev of track.events) if (ev.kind === 'note' && ev.tick >= from && ev.tick < to && (!notes || (ev.note >= notes.lo && ev.note <= notes.hi))) ev.note = Math.max(0, Math.min(127, ev.note + amount));
}

/** Copy events [from,to) of src into dst starting at `start`, `copies` times, REPLACE (clear destination span first) or MERGE. */
export function copyEvents(src: Track, dst: Track, opts: { from: number; to: number; start: number; copies: number; mode: 'REPLACE' | 'MERGE'; notes?: { lo: number; hi: number } | null }): void {
  const span = opts.to - opts.from;
  if (span <= 0 || opts.copies <= 0) return;
  const picked = eventsInRange(src.events, opts.from, opts.to).filter(e => !opts.notes || e.kind !== 'note' || (e.note >= opts.notes.lo && e.note <= opts.notes.hi)).map(e => structuredClone(e));
  if (opts.mode === 'REPLACE') dst.events = dst.events.filter(e => e.tick < opts.start || e.tick >= opts.start + span * opts.copies);
  for (let c = 0; c < opts.copies; c++) for (const e of picked) insertEvent(dst.events, { ...e, tick: e.tick - opts.from + opts.start + c * span });
}

/** Insert `count` blank bars after bar `after` (0 = at the start) by shifting events. */
export function insertBars(seq: Sequence, after: number, count: number, barTicks: number): void {
  const at = after * barTicks; const shift = count * barTicks;
  for (const t of seq.tracks) for (const e of t.events) if (e.tick >= at) e.tick += shift;
  seq.bars += count;
}

/** Delete bars [first, last] (1-based) and close the gap. */
export function deleteBars(seq: Sequence, first: number, last: number, barTicks: number): void {
  const from = (first - 1) * barTicks, to = last * barTicks, span = to - from;
  if (span <= 0) return;
  for (const t of seq.tracks) {
    t.events = t.events.filter(e => e.tick < from || e.tick >= to);
    for (const e of t.events) if (e.tick >= to) e.tick -= span;
  }
  seq.bars = Math.max(0, seq.bars - (last - first + 1));
}

/** Copy bars [first,last] of src after bar `after` of dst (inserting), all tracks, `copies` times. */
export function copyBars(src: Sequence, dst: Sequence, first: number, last: number, after: number, copies: number, barTicks: number): void {
  const from = (first - 1) * barTicks, to = last * barTicks, span = to - from;
  if (span <= 0 || copies <= 0) return;
  const at = after * barTicks;
  const picked = src.tracks.map(t => eventsInRange(t.events, from, to).map(e => structuredClone(e)));
  insertBars(dst, after, (last - first + 1) * copies, barTicks);
  dst.tracks.forEach((t, i) => { for (let c = 0; c < copies; c++) for (const e of picked[i]) insertEvent(t.events, { ...e, tick: e.tick - from + at + c * span }); });
  if (dst.bars > 0) dst.used = true;
}

export function noteEvent(tick: number, note: number, vel: number, dur: number, nv = 0): NoteEvent { return { kind: 'note', tick, note, vel, dur, nv }; }
