// Standard MIDI File read/write at the machine's 96 ppq. Type 0 (one track) or type 1 (a track per sequence track).
import { Sequence, SeqEvent, PPQ, TRACK_TYPES } from '@/model/types';
import { newSequence } from '@/model/factory';
import { insertEvent } from '@/seq/events';

const enc = new TextEncoder();
function vlq(n: number): number[] { const out = [n & 0x7f]; n >>= 7; while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; } return out; }
function u32(n: number) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function u16(n: number) { return [(n >> 8) & 255, n & 255]; }
function chunk(id: string, body: number[]): number[] { return [...enc.encode(id), ...u32(body.length), ...body]; }

interface Raw { tick: number; bytes: number[]; order: number }

/** Channel for a track: MIDI tracks use their channel (1A..16A -> 0..15, B -> same numbers), drum tracks use 9 (GM drums). */
function channelOf(tr: Sequence['tracks'][number]): number {
  if (tr.type !== 'MIDI') return 9;
  return tr.channel > 0 ? (tr.channel - 1) % 16 : 0;
}

function trackEvents(tr: Sequence['tracks'][number], events: Raw[]) {
  const ch = channelOf(tr);
  let order = 0;
  for (const e of tr.events) {
    const t = e.tick;
    switch (e.kind) {
      case 'note': events.push({ tick: t, bytes: [0x90 | ch, e.note & 127, e.vel & 127], order: order++ }); events.push({ tick: t + Math.max(1, e.dur), bytes: [0x80 | ch, e.note & 127, 64], order: order++ }); break;
      case 'cc': events.push({ tick: t, bytes: [0xb0 | ch, e.cc & 127, e.value & 127], order: order++ }); break;
      case 'pgm': events.push({ tick: t, bytes: [0xc0 | ch, (e.value - 1) & 127], order: order++ }); break;
      case 'chpress': events.push({ tick: t, bytes: [0xd0 | ch, e.value & 127], order: order++ }); break;
      case 'polypress': events.push({ tick: t, bytes: [0xa0 | ch, e.note & 127, e.value & 127], order: order++ }); break;
      case 'bend': { const v = Math.max(0, Math.min(16383, e.value + 8192)); events.push({ tick: t, bytes: [0xe0 | ch, v & 127, (v >> 7) & 127], order: order++ }); break; }
      case 'sysex': { const body = e.bytes[0] === 0xf0 ? e.bytes.slice(1) : e.bytes; events.push({ tick: t, bytes: [0xf0, ...vlq(body.length), ...body], order: order++ }); break; }
      case 'mixer': { const body = [0x47, 0x00, 0x44, 0x45, { LEVEL: 1, PAN: 2, FXSEND: 3, INDIV: 5 }[e.param], e.pad & 63, e.value & 127, 0xf7]; events.push({ tick: t, bytes: [0xf0, ...vlq(body.length), ...body], order: order++ }); break; }
    }
  }
}

function encodeTrack(events: Raw[], extra: Raw[] = []): number[] {
  const all = [...extra, ...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out: number[] = []; let last = 0;
  for (const e of all) { out.push(...vlq(Math.max(0, e.tick - last)), ...e.bytes); last = Math.max(last, e.tick); }
  out.push(0, 0xff, 0x2f, 0); // end of track
  return out;
}

export function encodeSmf(seq: Sequence, type: 0 | 1, tempo: number): Uint8Array {
  const meta: Raw[] = [];
  const name = enc.encode(seq.name);
  meta.push({ tick: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...name], order: -3 });
  const ts0 = seq.tsigs[0]; meta.push({ tick: 0, bytes: [0xff, 0x58, 4, ts0.num, Math.round(Math.log2(ts0.den)), 24, 8], order: -2 });
  const changes = seq.tempoChangeOn ? seq.tempoChanges : [{ tick: 0, ratio: 1 }];
  for (const c of changes) { const us = Math.round(60000000 / (tempo * c.ratio)); meta.push({ tick: c.tick, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255], order: -1 }); }
  const used = seq.tracks.map((t, i) => ({ t, i })).filter(x => x.t.events.length);
  let body: number[] = [];
  if (type === 0) {
    const ev: Raw[] = []; for (const { t } of used) trackEvents(t, ev);
    body = [...chunk('MThd', [...u16(0), ...u16(1), ...u16(PPQ)]), ...chunk('MTrk', encodeTrack(ev, meta))];
  } else {
    const tracks = [chunk('MTrk', encodeTrack([], meta))];
    for (const { t } of used) { const ev: Raw[] = []; trackEvents(t, ev); const tn = enc.encode(t.name); tracks.push(chunk('MTrk', encodeTrack(ev, [{ tick: 0, bytes: [0xff, 0x03, ...vlq(tn.length), ...tn], order: -1 }]))); }
    body = [...chunk('MThd', [...u16(1), ...u16(tracks.length), ...u16(PPQ)]), ...tracks.flat()];
  }
  return Uint8Array.from(body);
}

/** Parse an SMF into a Sequence. Channels map to tracks: ch10 -> DRUM1 track, others -> MIDI tracks by channel. */
export function decodeSmf(bytes: Uint8Array, index = 0): Sequence | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 14 || tag(0) !== 'MThd') return null;
  const ntrk = v.getUint16(10); const div = v.getUint16(12);
  if (div & 0x8000) return null; // SMPTE timing unsupported
  const scale = PPQ / div;
  const seq = newSequence(index); seq.used = true; seq.tempoSource = 'SEQ';
  const tempos: { tick: number; bpm: number }[] = [];
  let o = 14; let maxTick = 0;
  for (let t = 0; t < ntrk && o + 8 <= bytes.length; t++) {
    if (tag(o) !== 'MTrk') break;
    const len = v.getUint32(o + 4); const end = o + 8 + len; let p = o + 8; let tick = 0; let running = 0;
    const open = new Map<string, { ev: SeqEvent & { kind: 'note' }; trackIdx: number }>();
    const trackFor = (ch: number) => { const idx = ch === 9 ? 32 : ch; const tr = seq.tracks[idx]; if (!tr.used) { tr.used = true; tr.type = ch === 9 ? 'DRUM1' : 'MIDI'; tr.channel = ch === 9 ? 0 : ch + 1; tr.name = ch === 9 ? 'Drums' : `MIDI ${ch + 1}A`; } return tr; };
    const readVlq = () => { let n = 0; for (;;) { const b = bytes[p++]; n = (n << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return n; };
    while (p < end) {
      tick += Math.round(readVlq() * scale);
      let status = bytes[p];
      if (status < 0x80) status = running; else p++;
      if (status === 0xff) { const type = bytes[p++]; const l = readVlq(); const d = bytes.subarray(p, p + l); p += l;
        if (type === 0x51) tempos.push({ tick, bpm: 60000000 / ((d[0] << 16) | (d[1] << 8) | d[2]) });
        if (type === 0x58) seq.tsigs = [{ fromBar: 0, num: d[0], den: 1 << d[1] }];
        if (type === 0x03 && t === 0) seq.name = new TextDecoder().decode(d).slice(0, 16) || seq.name;
        continue; }
      if (status === 0xf0 || status === 0xf7) { const l = readVlq(); const d = Array.from(bytes.subarray(p, p + l)); p += l; const tr = trackFor(0); insertEvent(tr.events, { kind: 'sysex', tick, bytes: [0xf0, ...d] }); continue; }
      running = status;
      const ch = status & 15; const hi = status & 0xf0; const tr = trackFor(ch);
      const d1 = bytes[p++]; const d2 = hi === 0xc0 || hi === 0xd0 ? 0 : bytes[p++];
      maxTick = Math.max(maxTick, tick);
      if (hi === 0x90 && d2 > 0) { const ev = { kind: 'note' as const, tick, note: d1, vel: d2, dur: 1, nv: 0 }; insertEvent(tr.events, ev); open.set(`${ch}:${d1}`, { ev, trackIdx: 0 }); }
      else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) { const k = `${ch}:${d1}`; const n = open.get(k); if (n) { n.ev.dur = Math.max(1, tick - n.ev.tick); open.delete(k); } }
      else if (hi === 0xb0) insertEvent(tr.events, { kind: 'cc', tick, cc: d1, value: d2 });
      else if (hi === 0xc0) insertEvent(tr.events, { kind: 'pgm', tick, value: d1 + 1 });
      else if (hi === 0xd0) insertEvent(tr.events, { kind: 'chpress', tick, value: d1 });
      else if (hi === 0xa0) insertEvent(tr.events, { kind: 'polypress', tick, note: d1, value: d2 });
      else if (hi === 0xe0) insertEvent(tr.events, { kind: 'bend', tick, value: ((d2 << 7) | d1) - 8192 });
    }
    o = end;
  }
  if (tempos.length) { seq.tempo = Math.round(tempos[0].bpm * 10) / 10; if (tempos.length > 1) { seq.tempoChangeOn = true; seq.tempoChanges = tempos.map(t => ({ tick: t.tick, ratio: t.bpm / tempos[0].bpm })); if (seq.tempoChanges[0].tick !== 0) seq.tempoChanges.unshift({ tick: 0, ratio: 1 }); } }
  const barTicks = seq.tsigs[0].num * (PPQ * 4 / seq.tsigs[0].den);
  seq.bars = Math.max(1, Math.ceil((maxTick + 1) / barTicks));
  void TRACK_TYPES;
  return seq;
}
