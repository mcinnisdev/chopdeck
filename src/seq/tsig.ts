// Time-signature edits on a Sequence (the Change Tsig window). Pure functions over model data.
import { Sequence, TsigChange } from '@/model/types';
import { tsigAtBar, barStartTick, ticksPerBar, tickToBBT } from '@/model/time';

/** Sort a tsig list, drop entries equal to their predecessor and make sure it starts at bar 0. */
export function normaliseTsigs(list: TsigChange[]): TsigChange[] {
  const sorted = [...list].sort((a, b) => a.fromBar - b.fromBar);
  const out: TsigChange[] = [];
  for (const t of sorted) {
    const last = out[out.length - 1];
    if (last && last.fromBar === t.fromBar) { out[out.length - 1] = { ...t }; continue; } // later entry at the same bar wins
    if (last && last.num === t.num && last.den === t.den) continue;
    out.push({ ...t });
  }
  if (!out.length) out.push({ fromBar: 0, num: 4, den: 4 });
  if (out[0].fromBar !== 0) out[0] = { ...out[0], fromBar: 0 };
  return out;
}

/**
 * Give bars firstBar..lastBar (1-based, inclusive) the signature num/den.
 * Every event keeps its bar and its tick offset inside that bar; offsets past the new bar
 * length are dropped ("truncate or add space in each bar"). Bars outside the range keep
 * their signature, so later bars shift by the cumulative length difference.
 */
export function changeTsig(seq: Sequence, firstBar: number, lastBar: number, num: number, den: number): void {
  const old = seq.tsigs;
  const first = Math.max(0, firstBar - 1);
  const last = Math.max(first, lastBar - 1);
  const n = Math.max(seq.bars, last + 1);
  const perBar: TsigChange[] = [];
  for (let b = 0; b < n; b++) perBar.push(b >= first && b <= last ? { fromBar: b, num, den } : { ...tsigAtBar(old, b), fromBar: b });
  for (const t of old) if (t.fromBar >= n) perBar.push({ ...t });
  const next = normaliseTsigs(perBar);

  for (const tr of seq.tracks) {
    const kept = [];
    for (const e of tr.events) {
      const bar0 = tickToBBT(old, e.tick).bar - 1;
      const off = e.tick - barStartTick(old, bar0);
      if (off >= ticksPerBar(tsigAtBar(next, bar0))) continue;
      e.tick = barStartTick(next, bar0) + off;
      kept.push(e);
    }
    tr.events = kept.sort((a, b) => a.tick - b.tick);
  }
  seq.tsigs = next;
}
