// Tick <-> bar.beat.tick and tick <-> seconds. Pure functions over Sequence data.
import { PPQ, Sequence, TsigChange, TempoChange } from './types';

export interface BBT { bar: number; beat: number; tick: number } // all 1-based except tick (0-based)

export function ticksPerBeat(den: number): number { return (PPQ * 4) / den; }
export function ticksPerBar(t: { num: number; den: number }): number { return t.num * ticksPerBeat(t.den); }

/** Time signature in force at a 0-based bar. */
export function tsigAtBar(tsigs: TsigChange[], bar: number): TsigChange {
  let cur = tsigs[0];
  for (const t of tsigs) { if (t.fromBar <= bar) cur = t; else break; }
  return cur;
}

/** Tick at the start of a 0-based bar. */
export function barStartTick(tsigs: TsigChange[], bar: number): number {
  let tick = 0;
  let b = 0;
  for (let i = 0; i < tsigs.length && b < bar; i++) {
    const t = tsigs[i];
    const nextFrom = tsigs[i + 1]?.fromBar ?? Infinity;
    const count = Math.min(bar, nextFrom) - b;
    if (count > 0) { tick += count * ticksPerBar(t); b += count; }
  }
  if (b < bar) tick += (bar - b) * ticksPerBar(tsigs[tsigs.length - 1]);
  return tick;
}

export function tickToBBT(tsigs: TsigChange[], tick: number): BBT {
  let bar = 0;
  let remaining = Math.max(0, tick);
  for (;;) {
    const t = tsigAtBar(tsigs, bar);
    const len = ticksPerBar(t);
    if (remaining < len) {
      const tpb = ticksPerBeat(t.den);
      return { bar: bar + 1, beat: Math.floor(remaining / tpb) + 1, tick: remaining % tpb };
    }
    remaining -= len;
    bar++;
    if (bar > 100000) return { bar: bar + 1, beat: 1, tick: 0 };
  }
}

export function bbtToTick(tsigs: TsigChange[], bbt: BBT): number {
  const bar0 = Math.max(0, bbt.bar - 1);
  const t = tsigAtBar(tsigs, bar0);
  return barStartTick(tsigs, bar0) + (Math.max(1, bbt.beat) - 1) * ticksPerBeat(t.den) + Math.max(0, bbt.tick);
}

export function formatBBT(b: BBT): string {
  return `${String(b.bar).padStart(3, '0')}.${String(b.beat).padStart(2, '0')}.${String(b.tick).padStart(2, '0')}`;
}

export function sequenceLengthTicks(seq: Pick<Sequence, 'tsigs' | 'bars'>): number {
  return barStartTick(seq.tsigs, seq.bars);
}

/** Effective tempo at a tick, given base tempo and change list. */
export function tempoAtTick(base: number, changeOn: boolean, changes: TempoChange[], tick: number): number {
  if (!changeOn || changes.length === 0) return base;
  let ratio = changes[0].ratio;
  for (const c of changes) { if (c.tick <= tick) ratio = c.ratio; else break; }
  return base * ratio;
}

/** Seconds from tick 0 to `tick`, integrating the tempo map. */
export function tickToSeconds(base: number, changeOn: boolean, changes: TempoChange[], tick: number): number {
  const secPerTick = (bpm: number) => 60 / (bpm * PPQ);
  if (!changeOn || changes.length <= 1) return tick * secPerTick(base * (changes[0]?.ratio ?? 1) || base);
  let sec = 0;
  for (let i = 0; i < changes.length; i++) {
    const from = changes[i].tick;
    const to = Math.min(tick, changes[i + 1]?.tick ?? Infinity);
    if (to <= from) { if (from >= tick) break; continue; }
    sec += (to - from) * secPerTick(base * changes[i].ratio);
    if (to >= tick) break;
  }
  return sec;
}

/** Inverse of tickToSeconds (fractional ticks). */
export function secondsToTick(base: number, changeOn: boolean, changes: TempoChange[], seconds: number): number {
  const ticksPerSec = (bpm: number) => (bpm * PPQ) / 60;
  if (!changeOn || changes.length <= 1) return seconds * ticksPerSec(base * (changes[0]?.ratio ?? 1) || base);
  let sec = 0;
  for (let i = 0; i < changes.length; i++) {
    const from = changes[i].tick;
    const to = changes[i + 1]?.tick ?? Infinity;
    const tps = ticksPerSec(base * changes[i].ratio);
    const segSec = (to - from) / tps;
    if (seconds - sec <= segSec || !isFinite(segSec)) return from + (seconds - sec) * tps;
    sec += segSec;
  }
  return 0;
}

/** Quantise a tick to the nearest grid point, with optional swing (50 = straight) applied to even grid slots. */
export function quantiseTick(tick: number, gridTicks: number, swingPct = 50): number {
  if (gridTicks <= 1) return tick;
  const slot = Math.round(tick / gridTicks);
  let q = slot * gridTicks;
  if (swingPct !== 50 && slot % 2 === 1) q += Math.round(((swingPct - 50) / 100) * gridTicks * 2);
  return Math.max(0, q);
}

/** The swing-aware grid point for a slot index (used by note repeat and step edit). */
export function gridTick(slot: number, gridTicks: number, swingPct = 50): number {
  let q = slot * gridTicks;
  if (swingPct !== 50 && slot % 2 === 1) q += Math.round(((swingPct - 50) / 100) * gridTicks * 2);
  return q;
}
