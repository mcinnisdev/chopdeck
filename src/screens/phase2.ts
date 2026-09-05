// TRACK MUTE (pads toggle tracks, SOLO) and NEXT SEQ (queue the next sequence, SUDDEN, CLEAR, PAD page).
import { ScreenDef, Ctx } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE } from '@/lcd/frame';
import { NUM_SEQUENCES, NUM_TRACKS } from '@/model/types';
import { tickToBBT, formatBBT } from '@/model/time';
import { pad2, tempoStr } from '@/model/format';

const seqOf = (c: Ctx) => c.m.sequences[c.s.seq];
const header = (c: Ctx) => { const q = seqOf(c); return `Sq:${pad2(c.s.seq + 1)}-${(q.used ? q.name : `(${q.name})`).padEnd(16).slice(0, 16)}`; };
const nowStr = (c: Ctx) => `Now:${formatBBT(tickToBBT(seqOf(c).tsigs, c.s.now))}`;

// pad layout: 13 14 15 16 on top, 1 2 3 4 at the bottom
const GRID = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];

let soloHeld = false;

export const trackMuteScreen: ScreenDef = {
  id: 'TRACK_MUTE',
  fields: () => [],
  draw(c, f) {
    const q = seqOf(c);
    text(f, 0, 0, header(c)); text(f, 0, 35, nowStr(c));
    const bank = c.s.padBank;
    GRID.forEach((p, i) => {
      const ti = bank * 16 + p;
      const tr = q.tracks[ti];
      const row = 1 + Math.floor(i / 4), col = (i % 4) * 12;
      const name = (tr.used ? tr.name : `(${tr.name})`).slice(0, 10).padEnd(10, ' ');
      const solo = c.s.soloTrack === ti;
      const on = tr.on && (c.s.soloTrack == null || solo);
      text(f, row, col, on ? `[${name}]` : ` ${name} `, solo ? ATTR_INVERSE : on ? 0 : ATTR_DIM);
    });
    text(f, 5, 0, `BANK ${'ABCD'[bank]}  Tr ${pad2(bank * 16 + 1)}-${pad2(bank * 16 + 16)}`, ATTR_DIM);
    text(f, 6, 0, c.s.soloTrack != null ? 'SOLO is active' : 'Press pads to Track ON/OFF', ATTR_DIM);
  },
  softKeys: c => [null, null, null, null, null,
    { label: 'SOLO', kind: 'action', blink: c.s.soloTrack != null,
      press: x => { soloHeld = true; if (x.s.soloTrack != null) { x.s.soloTrack = null; } },
      release: () => { soloHeld = false; }, },
  ],
  onPad(c, pad, _v, down) {
    if (!down) return true;
    const ti = pad;
    if (ti >= NUM_TRACKS) return true;
    if (soloHeld) c.s.soloTrack = ti;
    else { const tr = seqOf(c).tracks[ti]; tr.on = !tr.on; }
    return true; // pads select tracks here, they do not play
  },
  onLeave() { soloHeld = false; },
};

const seqLabel = (c: Ctx, i: number) => { const q = c.m.sequences[i]; return `${pad2(i + 1)}-${q.used ? q.name : `(${q.name})`}`; };

export const nextSeqScreen: ScreenDef = {
  id: 'NEXT_SEQ',
  fields: () => [
    { id: 'next', row: 2, col: 8, width: 19, label: 'Next Sq:', get: c => (c.s.nextSeq == null ? '--' : seqLabel(c, c.s.nextSeq)),
      wheel: (c, d) => { const cur = c.s.nextSeq ?? c.s.seq; c.s.nextSeq = Math.max(0, Math.min(NUM_SEQUENCES - 1, cur + d)); },
      enter: (c, digits) => { const n = parseInt(digits, 10); if (n >= 1 && n <= NUM_SEQUENCES) c.s.nextSeq = n - 1; } },
  ],
  draw(c, f) {
    const q = seqOf(c);
    text(f, 0, 0, header(c)); text(f, 0, 35, nowStr(c));
    const tempo = q.tempoSource === 'MAS' ? c.s.masterTempo : q.tempo;
    text(f, 1, 0, `♩:${tempoStr(tempo)}(${q.tempoSource}) Timing:${c.m.timing}`);
    text(f, 4, 0, c.s.playing ? 'Plays after the current sequence ends.' : 'Press PLAY: the next sequence follows the first.', ATTR_DIM);
  },
  softKeys: () => [null, null, null,
    { label: 'SUDDEN', kind: 'action', press: c => { if (c.s.nextSeq != null) c.fw.transport.switchSequence?.(c.s.nextSeq); } },
    { label: 'CLEAR', kind: 'action', press: c => { c.s.nextSeq = null; } },
    { label: 'PAD', kind: 'action', press: c => c.fw.openWindow('NEXT_SEQ/PAD') },
  ],
};

export const nextSeqPadWindow: ScreenDef = {
  id: 'NEXT_SEQ/PAD', title: 'Next Sequence Pad',
  fields: () => [],
  draw(c, f) {
    const bank = c.s.padBank;
    GRID.forEach((p, i) => {
      const si = bank * 16 + p;
      const row = 2 + Math.floor(i / 4), col = (i % 4) * 12;
      const q = c.m.sequences[si];
      const label = `${pad2(si + 1)}${(q.used ? q.name : '-').slice(0, 8)}`.padEnd(11, ' ');
      text(f, row, col, label, c.s.nextSeq === si ? ATTR_INVERSE : q.used ? 0 : ATTR_DIM);
    });
    text(f, 6, 0, `BANK ${'ABCD'[bank]}: Sq ${pad2(bank * 16 + 1)}-${pad2(bank * 16 + 16)}  hit a pad`, ATTR_DIM);
  },
  softKeys: () => [null, null, null,
    { label: 'SUDDEN', kind: 'action', press: c => { if (c.s.nextSeq != null) { c.fw.transport.switchSequence?.(c.s.nextSeq); c.fw.closeWindow(); } } },
    { label: 'CLEAR', kind: 'action', press: c => { c.s.nextSeq = null; } },
    { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() },
  ],
  onPad(c, pad, _v, down) { if (down && pad < 64) c.s.nextSeq = pad; return true; },
};

export const phase2Screens: ScreenDef[] = [trackMuteScreen, nextSeqScreen, nextSeqPadWindow];
