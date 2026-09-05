// MAIN screen and its windows.
import { ScreenDef, Ctx, Field } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE } from '@/lcd/frame';
import { NUM_SEQUENCES, NUM_TRACKS, TIMING_VALUES, TRACK_TYPES, TEMPO_MIN, TEMPO_MAX, TIMING_TICKS, Sequence } from '@/model/types';
import { tickToBBT, formatBBT, barStartTick, tsigAtBar, ticksPerBar } from '@/model/time';
import { eventsInRange } from '@/seq/events';
import { pad2, midiOutName, tsigStr, tempoStr } from '@/model/format';
import { newSequence } from '@/model/factory';
import { intField, enumField, boolField, nameField, textField, clamp } from './util';

export const seqOf = (c: Ctx): Sequence => c.m.sequences[c.s.seq];
export const trackOf = (c: Ctx) => seqOf(c).tracks[c.s.track];
const seqLabel = (c: Ctx, i: number) => { const q = c.m.sequences[i]; return `${pad2(i + 1)}-${q.used ? q.name : `(${q.name})`}`; };

function tempoOf(c: Ctx) { return seqOf(c).tempoSource === 'MAS' ? c.s.masterTempo : seqOf(c).tempo; }
function setTempo(c: Ctx, v: number) { const t = clamp(Math.round(v * 10) / 10, TEMPO_MIN, TEMPO_MAX); if (seqOf(c).tempoSource === 'MAS') c.s.masterTempo = t; else seqOf(c).tempo = t; }

const mainFields = (c: Ctx): Field[] => {
  const seq = seqOf(c);
  const tr = trackOf(c);
  const isDrum = tr.type !== 'MIDI';
  return [
    intField({ id: 'seq', row: 0, col: 3, width: 2, label: 'Sq:', min: 1, max: NUM_SEQUENCES, get: c => c.s.seq + 1, set: (c, v) => { c.s.seq = v - 1; }, fmt: pad2,
      window: c => c.fw.openWindow('MAIN/SEQUENCE') }),
    textField('seqDash', 0, 5, 1, () => '-'),
    nameField({ id: 'seqName', row: 0, col: 6, raw: c => seqOf(c).name, get: c => (seq.used ? seq.name : `(${seq.name})`), set: (c, n) => { seqOf(c).name = n; seqOf(c).used = true; },
      window: c => c.fw.openWindow('MAIN/SEQUENCE') }),
    { id: 'now', row: 0, col: 39, width: 9, label: 'Now:', get: c => formatBBT(tickToBBT(seqOf(c).tsigs, c.s.now)),
      wheel: (c, d) => c.fw.transport.locate(Math.max(0, c.s.now + d * TIMING_TICKS[c.m.timing])),
      enter: (c, digits) => { const bar = parseInt(digits, 10); if (bar >= 1) c.fw.transport.locate(barStartTick(seqOf(c).tsigs, bar - 1)); },
      window: c => c.fw.openWindow('MAIN/TIME_DISPLAY') },
    { id: 'tempo', row: 1, col: 2, width: 5, label: '♩:', get: c => tempoStr(tempoOf(c)),
      wheel: (c, d) => setTempo(c, tempoOf(c) + d / 10),
      enter: (c, digits) => setTempo(c, parseInt(digits, 10) / (digits.length > 3 ? 10 : 1)),
      window: c => c.fw.openWindow('MAIN/TEMPO_CHANGE') },
    enumField({ id: 'tempoSrc', row: 1, col: 8, width: 3, label: '(', values: ['SEQ', 'MAS'] as const, get: c => seqOf(c).tempoSource, set: (c, v) => { seqOf(c).tempoSource = v; } }),
    textField('tempoSrcClose', 1, 11, 1, () => ')'),
    enumField({ id: 'timing', row: 1, col: 21, width: 7, label: 'Timing:', values: TIMING_VALUES, get: c => c.m.timing, set: (c, v) => { c.m.timing = v; },
      window: c => c.fw.openWindow('MAIN/TIMING_CORRECT') }),
    { id: 'tsig', row: 1, col: 36, width: 5, label: 'Tsig:', get: c => { const t = tsigAtBar(seqOf(c).tsigs, 0); return tsigStr(t.num, t.den); },
      wheel: c => c.fw.openWindow('MAIN/CHANGE_TSIG'), window: c => c.fw.openWindow('MAIN/CHANGE_TSIG') },
    boolField({ id: 'count', row: 2, col: 6, width: 3, label: 'Count:', get: c => c.m.count.countIn !== 'OFF', set: (c, v) => { c.m.count.countIn = v ? 'REC+PLAY' : 'OFF'; },
      window: c => c.fw.openWindow('MAIN/COUNT') }),
    boolField({ id: 'loop', row: 2, col: 16, width: 3, label: 'Loop:', get: c => seqOf(c).loop.on, set: (c, v) => { seqOf(c).loop.on = v; },
      window: c => c.fw.openWindow('MAIN/LOOP') }),
    { id: 'bars', row: 2, col: 26, width: 3, label: 'Bars:', get: c => String(seqOf(c).bars).padStart(3, ' '),
      wheel: (c, d) => c.fw.openWindow('MAIN/CHANGE_BARS', { newBars: clamp(seqOf(c).bars + d, 0, 999) }),
      enter: (c, digits) => c.fw.openWindow('MAIN/CHANGE_BARS', { newBars: clamp(parseInt(digits, 10) || 0, 0, 999) }),
      window: c => c.fw.openWindow('MAIN/CHANGE_BARS', { newBars: seqOf(c).bars }) },
    intField({ id: 'track', row: 3, col: 3, width: 2, label: 'Tr:', min: 1, max: NUM_TRACKS, get: c => c.s.track + 1, set: (c, v) => { c.s.track = v - 1; }, fmt: pad2,
      window: c => c.fw.openWindow('MAIN/TRACK') }),
    textField('trDash', 3, 5, 1, () => '-'),
    nameField({ id: 'trackName', row: 3, col: 6, raw: c => trackOf(c).name, get: c => (tr.used ? tr.name : `(${tr.name})`), set: (c, n) => { trackOf(c).name = n; trackOf(c).used = true; },
      window: c => c.fw.openWindow('MAIN/TRACK') }),
    boolField({ id: 'on', row: 3, col: 27, width: 3, label: 'ON:', style: 'YES', get: c => trackOf(c).on, set: (c, v) => { trackOf(c).on = v; },
      window: c => c.fw.openWindow('MAIN/ERASE_OFF_TRACKS') }),
    intField({ id: 'pgm', row: 3, col: 37, width: 3, label: 'Pgm:', min: 0, max: 128, get: c => trackOf(c).pgm, set: (c, v) => { trackOf(c).pgm = v; },
      fmt: v => (v === 0 ? 'OFF' : String(v).padStart(3, ' ')) }),
    textField('recMode', 4, 0, 2, () => 'S:'),
    enumField({ id: 'type', row: 4, col: 2, width: 5, values: TRACK_TYPES, get: c => trackOf(c).type, set: (c, v) => { trackOf(c).type = v; },
      window: c => c.fw.openWindow('MAIN/MIDI_INPUT') }),
    textField('typeSep', 4, 7, 1, () => ':'),
    intField({ id: 'channel', row: 4, col: 8, width: 3, min: 0, max: 32, get: c => trackOf(c).channel, set: (c, v) => { trackOf(c).channel = v; }, fmt: midiOutName,
      window: c => c.fw.openWindow('MAIN/MIDI_OUTPUT') }),
    textField('pgmName', 4, 13, 16, c => (isDrum ? c.m.programs[c.m.drums[TRACK_TYPES.indexOf(trackOf(c).type) - 1].pgm].name : c.m.midi.deviceNames[trackOf(c).channel - 1] ?? '')),
    intField({ id: 'velo', row: 4, col: 42, width: 3, label: 'Velo%:', min: 1, max: 200, get: c => trackOf(c).veloPct, set: (c, v) => { trackOf(c).veloPct = v; },
      window: c => c.fw.openWindow('MAIN/EDIT_VELOCITY') }),
  ];
};

/** Rows 5-6: a 1/16 grid of the current bar for the current track, plus transport status. */
function drawStepGrid(c: Ctx, f: import('@/lcd/frame').LcdFrame) {
  const seq = seqOf(c); const tr = trackOf(c); const s = c.s;
  const bbt = tickToBBT(seq.tsigs, s.now);
  const bar0 = bbt.bar - 1;
  const ts = tsigAtBar(seq.tsigs, bar0);
  const barLen = ticksPerBar(ts);
  const start = barStartTick(seq.tsigs, bar0);
  const cells = Math.min(16, Math.max(4, ts.num * 4));
  const cellTicks = barLen / cells;
  const cellW = Math.floor(48 / cells);
  for (let i = 0; i < cells; i++) {
    const a = start + Math.round(i * cellTicks), b = start + Math.round((i + 1) * cellTicks);
    const has = eventsInRange(tr.events, a, b).some(e => e.kind === 'note');
    const here = s.now >= a && s.now < b && s.playing;
    text(f, 5, i * cellW, (has ? '▪' : '·').padEnd(cellW, ' '), here ? ATTR_INVERSE : has ? 0 : ATTR_DIM);
  }
  const status = s.record === 'REC' ? '● REC' : s.record === 'OVERDUB' ? '● DUB' : s.playing ? '► PLAY' : '■ STOP';
  const notes = tr.events.reduce((n, e) => n + (e.kind === 'note' ? 1 : 0), 0);
  text(f, 6, 0, `${status}  ${String(notes).padStart(5, ' ')} notes`, s.record !== 'OFF' ? 0 : ATTR_DIM);
}

export const mainScreen: ScreenDef = {
  id: 'MAIN',
  fields: mainFields,
  draw(c, f) {
    const s = c.s;
    // status glyphs the hardware prints beside Now: (2nd, transpose, tempo change)
    const flags = [s.secondSeq != null ? '2nd' : '', seqOf(c).tempoChangeOn ? 'c' : ''].filter(Boolean).join(' ');
    if (flags) text(f, 0, 34 - flags.length, flags, ATTR_DIM);
    drawStepGrid(c, f);
    if (s.soloTrack != null) text(f, 6, 24, 'SOLO is active', ATTR_DIM);
    if (s.nextSeq != null) text(f, 6, 24, `Next Sq:${seqLabel(c, s.nextSeq).slice(0, 15)}`);
  },
  softKeys: c => [
    { label: 'STEP', kind: 'page', press: x => x.fw.setMode('STEP') },
    { label: 'EDIT', kind: 'page', press: x => x.fw.setMode('EDIT') },
    { label: 'TrMUTE', kind: 'action', press: x => { trackOf(x).on = !trackOf(x).on; } },
    { label: 'SOLO', kind: 'action', blink: c.s.soloTrack != null, press: x => { x.s.soloTrack = x.s.soloTrack == null ? x.s.track : null; } },
    { label: 'Tr -', kind: 'action', press: x => { x.s.track = Math.max(0, x.s.track - 1); } },
    { label: 'Tr +', kind: 'action', press: x => { x.s.track = Math.min(NUM_TRACKS - 1, x.s.track + 1); } },
  ],
};

// ---------- windows ----------

export const sequenceWindow: ScreenDef = {
  id: 'MAIN/SEQUENCE', title: 'Sequence',
  fields: () => [
    nameField({ id: 'name', row: 3, col: 17, label: 'Sequence name:', get: c => seqOf(c).name, set: (c, n) => { seqOf(c).name = n; seqOf(c).used = true; } }),
    nameField({ id: 'default', row: 4, col: 17, label: 'Default name:', get: c => c.m.defaults.defaultSeqName, set: (c, n) => { c.m.defaults.defaultSeqName = n; } }),
  ],
  draw() {},
  softKeys: () => [
    null,
    { label: 'DELETE', kind: 'action', press: c => c.fw.confirm({
      title: 'Delete Sequence',
      lines: [`Sq:${seqLabel(c, c.s.seq)}`, '', 'Pressing DO IT will erase this sequence!!'],
      doIt: () => { c.m.sequences[c.s.seq] = newSequence(c.s.seq, c.m.defaults); c.fw.closeAllWindows(); },
      extra: { index: 2, label: 'ALL SQ', run: () => c.fw.confirm({
        title: 'Delete ALL Sequences', lines: ['', 'Pressing DO IT will erase ALL sequences!!'],
        doIt: () => { c.m.sequences = c.m.sequences.map((_, i) => newSequence(i, c.m.defaults)); c.fw.closeAllWindows(); },
      }) },
    }) },
    null,
    { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'COPY', kind: 'action', press: c => c.fw.openWindow('MAIN/COPY_SEQUENCE', { to: c.s.seq }) },
    null,
  ],
};

export const copySequenceWindow: ScreenDef = {
  id: 'MAIN/COPY_SEQUENCE', title: 'Copy Sequence',
  fields: () => [
    { id: 'from', row: 3, col: 6, width: 21, label: 'Sq:', get: c => seqLabel(c, c.s.seq), wheel: (c, d) => { c.s.seq = clamp(c.s.seq + d, 0, NUM_SEQUENCES - 1); } },
    { id: 'to', row: 5, col: 6, width: 21, label: 'Sq:', get: c => seqLabel(c, to(c)), wheel: (c, d) => { setTo(c, clamp(to(c) + d, 0, NUM_SEQUENCES - 1)); } },
  ],
  draw(c, f) { text(f, 4, 12, '>>> copy to >>>', ATTR_DIM); },
  softKeys: () => [
    null, null,
    { label: 'PARAMS', kind: 'action', press: c => { const src = seqOf(c); const dst = c.m.sequences[to(c)]; const events = dst.tracks.map(t => t.events); Object.assign(dst, structuredClone(src)); dst.tracks.forEach((t, i) => { t.events = events[i]; }); c.fw.closeWindow(); } },
    { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => { c.m.sequences[to(c)] = structuredClone(seqOf(c)); c.fw.closeAllWindows(); } },
    null,
  ],
};
const to = (c: Ctx) => (c.s.windows[c.s.windows.length - 1]?.params?.to as number) ?? c.s.seq;
const setTo = (c: Ctx, v: number) => { const w = c.s.windows[c.s.windows.length - 1]; if (w) w.params = { ...w.params, to: v }; };

export const loopWindow: ScreenDef = {
  id: 'MAIN/LOOP', title: 'Loop',
  fields: () => [
    intField({ id: 'first', row: 3, col: 18, width: 3, label: 'First bar:', min: 1, max: 999, get: c => seqOf(c).loop.first, set: (c, v) => { const l = seqOf(c).loop; l.first = v; if (l.last !== 'END' && l.last < v) l.last = v; } }),
    { id: 'last', row: 4, col: 18, width: 3, label: ' Last bar:', get: c => { const l = seqOf(c).loop.last; return l === 'END' ? 'END' : String(l).padStart(3, ' '); },
      wheel: (c, d) => { const l = seqOf(c).loop; const bars = Math.max(1, seqOf(c).bars); const cur = l.last === 'END' ? bars + 1 : l.last; const n = clamp(cur + d, l.first, bars + 1); l.last = n > bars ? 'END' : n; } },
    { id: 'count', row: 5, col: 18, width: 3, label: 'Number of bars:', get: c => { const l = seqOf(c).loop; const last = l.last === 'END' ? Math.max(seqOf(c).bars, l.first) : l.last; return String(last - l.first + 1).padStart(3, ' '); },
      wheel: (c, d) => { const l = seqOf(c).loop; const last = l.last === 'END' ? Math.max(seqOf(c).bars, l.first) : l.last; const n = clamp(last - l.first + 1 + d, 1, 999); l.last = l.first + n - 1; } },
  ],
  draw() {},
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, null, null],
};

export const changeBarsWindow: ScreenDef = {
  id: 'MAIN/CHANGE_BARS', title: 'Change Bars',
  fields: () => [
    intField({ id: 'new', row: 3, col: 28, width: 3, label: 'New bars:', min: 0, max: 999, get: c => newBars(c), set: (c, v) => setNewBars(c, v) }),
  ],
  draw(c, f) {
    text(f, 3, 4, `Current=${String(seqOf(c).bars).padStart(3, ' ')} >`);
    const n = newBars(c); const cur = seqOf(c).bars;
    text(f, 5, 2, n >= cur ? 'Pressing DO IT will add blank bars after last bar.' : 'Pressing DO IT will truncate bars after last bar.', ATTR_DIM);
  },
  softKeys: () => [
    null, null, null,
    { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => { c.fw.snapshotForUndo(); setBars(seqOf(c), newBars(c)); c.fw.closeWindow(); } },
    null,
  ],
};
const newBars = (c: Ctx) => (c.s.windows[c.s.windows.length - 1]?.params?.newBars as number) ?? seqOf(c).bars;
const setNewBars = (c: Ctx, v: number) => { const w = c.s.windows[c.s.windows.length - 1]; if (w) w.params = { ...w.params, newBars: v }; };
export function setBars(seq: Sequence, bars: number) {
  if (bars < seq.bars) {
    const end = barStartTick(seq.tsigs, bars);
    for (const t of seq.tracks) t.events = t.events.filter(e => e.tick < end);
  }
  seq.bars = bars;
  if (bars > 0) seq.used = true;
}

export const trackWindow: ScreenDef = {
  id: 'MAIN/TRACK', title: 'Track',
  fields: () => [
    nameField({ id: 'name', row: 3, col: 17, label: 'Track name:', get: c => trackOf(c).name, set: (c, n) => { trackOf(c).name = n; trackOf(c).used = true; } }),
    nameField({ id: 'default', row: 4, col: 17, label: 'Default:', get: c => c.m.defaults.defaultTrackName, set: (c, n) => { c.m.defaults.defaultTrackName = n; } }),
  ],
  draw() {},
  softKeys: () => [
    null,
    { label: 'DELETE', kind: 'action', press: c => c.fw.confirm({
      title: 'Delete Track',
      lines: [`Tr:${pad2(c.s.track + 1)}-${trackOf(c).name}`, '', 'Pressing DO IT will erase this track !!'],
      doIt: () => { c.fw.snapshotForUndo(); const t = trackOf(c); t.events = []; t.used = false; c.fw.closeAllWindows(); },
      extra: { index: 2, label: 'ALL Tr', run: () => c.fw.confirm({
        title: 'Delete ALL Tracks', lines: ['', 'Pressing DO IT will erase ALL tracks!!'],
        doIt: () => { c.fw.snapshotForUndo(); for (const t of seqOf(c).tracks) { t.events = []; t.used = false; } c.fw.closeAllWindows(); },
      }) },
    }) },
    null,
    { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'COPY', kind: 'action', press: c => c.fw.openWindow('MAIN/COPY_TRACK', { to: c.s.track }) },
    null,
  ],
};

export const copyTrackWindow: ScreenDef = {
  id: 'MAIN/COPY_TRACK', title: 'Copy Track',
  fields: () => [
    { id: 'from', row: 3, col: 6, width: 21, label: 'Tr:', get: c => `${pad2(c.s.track + 1)}-${trackOf(c).name}`, wheel: (c, d) => { c.s.track = clamp(c.s.track + d, 0, NUM_TRACKS - 1); } },
    { id: 'to', row: 5, col: 6, width: 21, label: 'Tr:', get: c => `${pad2(to(c) + 1)}-${seqOf(c).tracks[to(c)].name}`, wheel: (c, d) => setTo(c, clamp(to(c) + d, 0, NUM_TRACKS - 1)) },
  ],
  draw(c, f) { text(f, 4, 12, '>>> copy to >>>', ATTR_DIM); },
  softKeys: () => [
    null, null, null,
    { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => { c.fw.snapshotForUndo(); seqOf(c).tracks[to(c)] = structuredClone(trackOf(c)); c.fw.closeAllWindows(); } },
    null,
  ],
};

export const eraseOffTracksWindow: ScreenDef = {
  id: 'MAIN/ERASE_OFF_TRACKS', title: 'Erase all OFF tracks',
  fields: () => [],
  draw(c, f) { text(f, 4, 4, 'Pressing DO IT will erase all OFF tracks!!'); },
  softKeys: () => [
    null, null, null,
    { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => { c.fw.snapshotForUndo(); for (const t of seqOf(c).tracks) if (!t.on) { t.events = []; t.used = false; t.on = true; } c.fw.closeWindow(); } },
    null,
  ],
};

export const mainWindows = [sequenceWindow, copySequenceWindow, loopWindow, changeBarsWindow, trackWindow, copyTrackWindow, eraseOffTracksWindow];
