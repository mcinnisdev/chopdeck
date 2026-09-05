// SONG mode: a list of sequence steps with repeats, loop, tempo, and conversion to a sequence.
import { ScreenDef, Ctx, Field } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE } from '@/lcd/frame';
import { NUM_SEQUENCES, NUM_SONGS, MAX_SONG_STEPS, TEMPO_MIN, TEMPO_MAX } from '@/model/types';
import { tickToBBT, formatBBT, sequenceLengthTicks } from '@/model/time';
import { pad2, tempoStr } from '@/model/format';
import { newSong } from '@/model/factory';
import { convertSong, ConvertMode, expandSong } from '@/seq/song';
import { intField, enumField, boolField, nameField, clamp } from './util';

const VISIBLE = 4;
const songOf = (c: Ctx) => c.m.songs[c.s.song];
const seqLabel = (c: Ctx, i: number) => { const q = c.m.sequences[i]; return `${pad2(i + 1)}-${(q.used ? q.name : `(${q.name})`).slice(0, 12)}`; };
const wp = (c: Ctx): Record<string, unknown> => { const w = c.s.windows[c.s.windows.length - 1]; if (!w) return {}; if (!w.params) w.params = {}; return w.params; };
let offset = 0;

/** Song position as bar.beat.tick across the steps played so far. */
function songNow(c: Ctx): string {
  const song = songOf(c); const s = c.s;
  let ticks = 0;
  if (s.songPlaying) {
    const played = expandSong(song);
    let count = 0; for (let i = 0; i < s.songStep; i++) count += Math.max(1, song.steps[i].reps);
    for (let i = 0; i < Math.min(played.length, count + s.songRep); i++) ticks += sequenceLengthTicks(c.m.sequences[played[i]]);
  }
  const q = c.m.sequences[song.steps[s.songStep]?.seq ?? c.s.seq];
  return formatBBT(tickToBBT(q.tsigs, ticks + s.now));
}

const stepRow = (i: number) => 2 + i;
function fields(c: Ctx): Field[] {
  const song = songOf(c);
  const f: Field[] = [
    intField({ id: 'song', row: 0, col: 5, width: 2, label: 'Song:', min: 1, max: NUM_SONGS, get: x => x.s.song + 1, set: (x, v) => { x.s.song = v - 1; offset = 0; }, fmt: pad2, window: x => x.fw.openWindow('SONG/SONG') }),
    { id: 'dash', row: 0, col: 7, width: 1, get: () => '-', skip: true },
    nameField({ id: 'name', row: 0, col: 8, get: x => (songOf(x).used ? songOf(x).name : `(${songOf(x).name})`), raw: x => songOf(x).name, set: (x, n) => { songOf(x).name = n; songOf(x).used = true; }, window: x => x.fw.openWindow('SONG/SONG') }),
    enumField({ id: 'tsrc', row: 1, col: 6, width: 3, label: 'TEMPO:', values: ['SEQ', 'MAS'] as const, get: x => songOf(x).tempoSource, set: (x, v) => { songOf(x).tempoSource = v; }, window: x => x.fw.openWindow('SONG/TEMPO') }),
    { id: 'tempo', row: 2, col: 2, width: 5, label: '♩:', hidden: x => songOf(x).tempoSource !== 'MAS', get: x => tempoStr(songOf(x).tempo), wheel: (x, d) => { songOf(x).tempo = clamp(Math.round((songOf(x).tempo + d / 10) * 10) / 10, TEMPO_MIN, TEMPO_MAX); }, enter: (x, digits) => { songOf(x).tempo = clamp(parseInt(digits, 10) / (digits.length > 3 ? 10 : 1), TEMPO_MIN, TEMPO_MAX); } },
    boolField({ id: 'loop', row: 3, col: 5, width: 3, label: 'LOOP:', get: x => songOf(x).loop.on, set: (x, v) => { songOf(x).loop.on = v; }, window: x => x.fw.openWindow('SONG/LOOP') }),
  ];
  for (let r = 0; r < VISIBLE; r++) {
    const i = offset + r;
    if (i > song.steps.length) break;
    const row = stepRow(r);
    if (i === song.steps.length) {
      // the (end of song) row: picking a sequence appends a step
      f.push({ id: `s${i}`, row, col: 20, width: 15, get: () => '(end of song)', wheel: (x, d) => { if (song.steps.length < MAX_SONG_STEPS) { song.steps.push({ seq: clamp((song.steps[i - 1]?.seq ?? x.s.seq) + d, 0, NUM_SEQUENCES - 1), reps: 1 }); song.used = true; } } });
      break;
    }
    f.push({ id: `s${i}`, row, col: 20, width: 15, get: x => seqLabel(x, song.steps[i].seq), wheel: (_x, d) => { song.steps[i].seq = clamp(song.steps[i].seq + d, 0, NUM_SEQUENCES - 1); }, enter: (_x, digits) => { const n = parseInt(digits, 10); if (n >= 1 && n <= NUM_SEQUENCES) song.steps[i].seq = n - 1; } });
    f.push(intField({ id: `r${i}`, row, col: 38, width: 3, min: 0, max: 99, get: () => song.steps[i].reps, set: (_x, v) => { song.steps[i].reps = v; } }));
  }
  return f;
}
function selectedStep(c: Ctx): number {
  const all = fields(c).sort((a, b) => a.row - b.row || a.col - b.col);
  const id = all[clamp(c.s.cursor.SONG ?? 0, 0, all.length - 1)]?.id ?? '';
  const m = /^[sr](\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : -1;
}

export const songScreen: ScreenDef = {
  id: 'SONG',
  fields,
  draw(c, f) {
    const song = songOf(c);
    text(f, 0, 35, `Now:${songNow(c)}`);
    text(f, 1, 13, 'Step  Sequence        Reps', ATTR_DIM);
    for (let r = 0; r < VISIBLE; r++) {
      const i = offset + r; if (i > song.steps.length) break;
      const playing = c.s.songPlaying && c.s.songStep === i;
      text(f, stepRow(r), 14, String(i + 1).padStart(3, ' '), playing ? ATTR_INVERSE : 0);
    }
    if (song.steps.length + 1 > offset + VISIBLE) text(f, 6, 42, 'more', ATTR_DIM);
    if (!c.s.songPlaying && song.steps.length) text(f, 6, 0, 'PLAY START plays the song from step 1.', ATTR_DIM);
  },
  softKeys: () => [null, null, null,
    { label: 'CONVRT', kind: 'action', press: c => c.fw.openWindow('SONG/CONVERT', { to: c.s.seq, mode: 'REFERENCED TO 1ST SQ' }) },
    { label: 'DELETE', kind: 'action', press: c => { const i = selectedStep(c); const song = songOf(c); if (i >= 0 && i < song.steps.length) { song.steps.splice(i, 1); offset = clamp(offset, 0, Math.max(0, song.steps.length - VISIBLE + 1)); } } },
    { label: 'INSERT', kind: 'action', press: c => { const i = selectedStep(c); const song = songOf(c); if (song.steps.length >= MAX_SONG_STEPS) return; const at = i < 0 ? song.steps.length : Math.min(i + 1, song.steps.length); song.steps.splice(at, 0, { seq: song.steps[i]?.seq ?? 0, reps: 1 }); song.used = true; } },
  ],
  onKey(c, k, down) {
    if (!down) return false;
    const i = selectedStep(c); const n = songOf(c).steps.length;
    if (k === 'DOWN' && i >= 0 && i - offset === VISIBLE - 1 && offset + VISIBLE <= n) { offset++; return true; }
    if (k === 'UP' && i >= 0 && i === offset && offset > 0) { offset--; return true; }
    return false;
  },
  onEnter() { offset = 0; },
};

export const songWindow: ScreenDef = {
  id: 'SONG/SONG', title: 'Song',
  fields: () => [
    nameField({ id: 'name', row: 3, col: 13, label: 'Song name:', get: c => songOf(c).name, set: (c, n) => { songOf(c).name = n; songOf(c).used = true; } }),
    nameField({ id: 'default', row: 4, col: 13, label: 'Default name:', get: () => 'Song', set: () => {} }),
  ],
  draw() {},
  softKeys: () => [null,
    { label: 'DELETE', kind: 'action', press: c => c.fw.confirm({ title: 'Delete Song', lines: [`Song:${pad2(c.s.song + 1)}-${songOf(c).name}`, '', 'Pressing DO IT will erase this song!!'], doIt: () => { c.m.songs[c.s.song] = newSong(c.s.song); c.fw.closeAllWindows(); },
      extra: { index: 2, label: 'ALL SG', run: () => c.fw.confirm({ title: 'Delete ALL Songs', lines: ['', 'Pressing DO IT will erase ALL songs!!'], doIt: () => { c.m.songs = c.m.songs.map((_, i) => newSong(i)); c.fw.closeAllWindows(); } }) } }) },
    null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'COPY', kind: 'action', press: c => c.fw.openWindow('SONG/COPY', { to: c.s.song }) }, null],
};
export const copySongWindow: ScreenDef = {
  id: 'SONG/COPY', title: 'Copy Song',
  fields: () => [
    { id: 'from', row: 3, col: 8, width: 20, label: 'Song:', get: c => `${pad2(c.s.song + 1)}-${songOf(c).name}`, wheel: (c, d) => { c.s.song = clamp(c.s.song + d, 0, NUM_SONGS - 1); } },
    { id: 'to', row: 5, col: 8, width: 20, label: 'Song:', get: c => { const t = (wp(c).to as number) ?? c.s.song; return `${pad2(t + 1)}-${c.m.songs[t].name}`; }, wheel: (c, d) => { wp(c).to = clamp(((wp(c).to as number) ?? c.s.song) + d, 0, NUM_SONGS - 1); } },
  ],
  draw(c, f) { text(f, 4, 12, '>>> copy to >>>', ATTR_DIM); void c; },
  softKeys: () => [null, null, null, { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() }, { label: 'DO IT', kind: 'action', press: c => { const t = (wp(c).to as number) ?? c.s.song; c.m.songs[t] = structuredClone(songOf(c)); c.fw.closeAllWindows(); } }, null],
};
export const songLoopWindow: ScreenDef = {
  id: 'SONG/LOOP', title: 'Loop',
  fields: () => [
    intField({ id: 'first', row: 3, col: 18, width: 3, label: 'First step:', min: 1, max: MAX_SONG_STEPS, get: c => songOf(c).loop.first, set: (c, v) => { const l = songOf(c).loop; l.first = v; if (l.last < v) l.last = v; } }),
    intField({ id: 'last', row: 4, col: 18, width: 3, label: ' Last step:', min: 1, max: MAX_SONG_STEPS, get: c => songOf(c).loop.last, set: (c, v) => { const l = songOf(c).loop; l.last = Math.max(v, l.first); } }),
    intField({ id: 'n', row: 5, col: 18, width: 3, label: 'Number of steps:', min: 1, max: MAX_SONG_STEPS, get: c => songOf(c).loop.last - songOf(c).loop.first + 1, set: (c, v) => { const l = songOf(c).loop; l.last = l.first + v - 1; } }),
  ],
  draw() {},
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, null, null],
  onEnter(c) { const l = songOf(c).loop; const n = Math.max(1, songOf(c).steps.length); l.first = clamp(l.first, 1, n); l.last = clamp(l.last, l.first, n); },
};
export const songTempoWindow: ScreenDef = {
  id: 'SONG/TEMPO', title: 'Tempo change',
  fields: () => [boolField({ id: 'ignore', row: 3, col: 40, width: 3, label: 'Ignore tempo change events in sequence:', get: c => songOf(c).ignoreTempoChanges, set: (c, v) => { songOf(c).ignoreTempoChanges = v; } })],
  draw() {},
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, null, null],
};
const MODES: readonly ConvertMode[] = ['REFERENCED TO 1ST SQ', 'OFF TRACKS IGNORED', 'MERGED ON MIDI CH'];
export const convertWindow: ScreenDef = {
  id: 'SONG/CONVERT', title: 'Convert Song to Seq',
  fields: () => [
    { id: 'from', row: 2, col: 11, width: 20, label: 'From song:', get: c => `${pad2(c.s.song + 1)}-${songOf(c).name}`, wheel: (c, d) => { c.s.song = clamp(c.s.song + d, 0, NUM_SONGS - 1); } },
    { id: 'to', row: 3, col: 13, width: 20, label: 'To sequence:', get: c => seqLabel(c, (wp(c).to as number) ?? c.s.seq), wheel: (c, d) => { wp(c).to = clamp(((wp(c).to as number) ?? c.s.seq) + d, 0, NUM_SEQUENCES - 1); } },
    enumField({ id: 'mode', row: 4, col: 14, width: 20, label: 'Track status:', values: MODES, get: c => (wp(c).mode as ConvertMode) ?? 'REFERENCED TO 1ST SQ', set: (c, v) => { wp(c).mode = v; } }),
  ],
  draw(c, f) { text(f, 6, 2, `${expandSong(songOf(c)).length} sequence plays -> one sequence`, ATTR_DIM); },
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => { const song = songOf(c); if (!song.steps.length) return; const to = (wp(c).to as number) ?? c.s.seq; c.m.sequences[to] = convertSong(c.m, song, (wp(c).mode as ConvertMode) ?? 'REFERENCED TO 1ST SQ'); c.fw.closeAllWindows(); c.fw.message(`Sq ${pad2(to + 1)} made`); } }, null],
};

export const songScreens: ScreenDef[] = [songScreen, songWindow, copySongWindow, songLoopWindow, songTempoWindow, convertWindow];
