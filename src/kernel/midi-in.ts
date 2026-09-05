// Routes incoming MIDI to the machine: notes to pads/tracks, CCs to footswitches and the NV slider,
// program change to sequence select, clock to tempo follow.
import { Firmware } from './firmware';
import { parseMidi, ClockFollower, MidiMessage, FOOTSWITCH_FNS } from '@/midi/io';
import { HwKey } from './keys';
import { NOTE_MIN, NOTE_MAX, TRACK_TYPES, NoteEvent } from '@/model/types';
import { insertEvent } from '@/seq/events';

const follower = new ClockFollower();
const heldNotes = new Map<string, number>(); // "ch:note" -> synthetic pad id

const FN_KEY: Record<string, HwKey | undefined> = { 'PLAY STRT': 'PLAY_START', PLAY: 'PLAY', STOP: 'STOP', 'REC+PLAY': 'REC', 'ODUB+PLAY': 'OVERDUB', 'REC/PUNCH': 'REC', 'ODUB/PNCH': 'OVERDUB', TAP: 'TAP', 'PAD BANK A': 'BANK_A', 'PAD BANK B': 'BANK_B', 'PAD BANK C': 'BANK_C', 'PAD BANK D': 'BANK_D', F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6' };

export function handleMidiIn(fw: Firmware, msg: MidiMessage): void {
  const m = fw.m; const s = fw.s;
  const p = parseMidi(msg.data);
  const rx = m.midi.receiveChannel; // 0 = ALL
  const chOk = (ch: number) => rx === 0 || rx === ch + 1;

  switch (p.kind) {
    case 'clock': {
      if (m.midi.syncIn.mode !== 'MIDI CLOCK') return;
      follower.pulse(msg.time || performance.now());
      if (follower.bpm && Math.abs(follower.bpm - s.masterTempo) >= 0.5) { s.masterTempo = follower.bpm; fw.touch(); }
      return;
    }
    case 'start': if (m.midi.syncIn.mode === 'MIDI CLOCK') { follower.reset(); fw.transport.play(true); } return;
    case 'continue': if (m.midi.syncIn.mode === 'MIDI CLOCK') fw.transport.play(false); return;
    case 'stop': if (m.midi.syncIn.mode === 'MIDI CLOCK') fw.transport.stop(); return;
    case 'cc': {
      if (!chOk(p.ch)) return;
      // footswitches
      const sw = m.midi.footswitches.find(f => f.cc === p.cc);
      if (sw) { footswitch(fw, sw.fn, p.value >= 64); return; }
      // NV slider from a controller
      if (m.noteVariation.cc && p.cc === m.noteVariation.cc) { fw.slider(p.value); return; }
      recordEvent(fw, { kind: 'cc', tick: 0, cc: p.cc, value: p.value });
      return;
    }
    case 'pgm': {
      if (!chOk(p.ch)) return;
      if (m.midi.progChangeToSeq && !s.playing) { s.seq = Math.min(98, p.value - 1); fw.touch(); return; }
      // program change into the DRUM slot of the current track
      const tr = m.sequences[s.seq].tracks[s.track]; const d = TRACK_TYPES.indexOf(tr.type) - 1;
      if (d >= 0 && m.drums[d].pgmChange === 'RECEIVE' && p.value - 1 < m.programs.length) { m.drums[d].pgm = p.value - 1; fw.touch(); }
      recordEvent(fw, { kind: 'pgm', tick: 0, value: p.value });
      return;
    }
    case 'bend': if (chOk(p.ch)) recordEvent(fw, { kind: 'bend', tick: 0, value: p.value }); return;
    case 'chpress': if (chOk(p.ch)) { recordEvent(fw, { kind: 'chpress', tick: 0, value: p.value }); for (const id of heldNotes.values()) fw.padPressure(id, p.value / 127); } return;
    case 'polypress': if (chOk(p.ch)) recordEvent(fw, { kind: 'polypress', tick: 0, note: p.note, value: p.value }); return;
    case 'noteOn': {
      if (!chOk(p.ch)) return;
      const tr = m.sequences[s.seq].tracks[s.track];
      if (tr.type !== 'MIDI') {
        // drum track: the note plays the program note directly (pads are just one way to reach it)
        if (p.note < NOTE_MIN || p.note > NOTE_MAX) return;
        const { program } = fw.padTarget(0);
        const pg = m.programs[program]; const map = pg.padAssign === 'MASTER' ? m.masterPadToNote : pg.padToNote;
        const pad = map.indexOf(p.note);
        const id = pad >= 0 ? pad : 1000 + p.note;
        heldNotes.set(`${p.ch}:${p.note}`, id);
        if (pad >= 0) fw.padDown(pad, p.vel); else { fw.transport.padDown?.(id, TRACK_TYPES.indexOf(tr.type) - 1, p.note, p.vel); fw.sound.noteOn(TRACK_TYPES.indexOf(tr.type) - 1, p.note, p.vel); }
        return;
      }
      // MIDI track: record + soft thru
      const id = 2000 + p.note; heldNotes.set(`${p.ch}:${p.note}`, id);
      fw.transport.padDown?.(id, 0, p.note, p.vel);
      softThru(fw, p.ch, [0x90 | p.ch, p.note, p.vel]);
      return;
    }
    case 'noteOff': {
      const id = heldNotes.get(`${p.ch}:${p.note}`); if (id == null) return;
      heldNotes.delete(`${p.ch}:${p.note}`);
      if (id < 64) fw.padUp(id);
      else { fw.transport.padUp?.(id); if (id < 2000) { const tr = m.sequences[s.seq].tracks[s.track]; fw.sound.noteOff(Math.max(0, TRACK_TYPES.indexOf(tr.type) - 1), p.note); } else softThru(fw, p.ch, [0x80 | p.ch, p.note, 64]); }
      return;
    }
    default: return;
  }
}

function footswitch(fw: Firmware, fn: string, on: boolean) {
  if (fn.startsWith('PAD ') && !fn.startsWith('PAD BANK')) { const i = parseInt(fn.slice(4), 10) - 1; if (on) fw.padDown(fw.s.padBank * 16 + i, 127); else fw.padUp(fw.s.padBank * 16 + i); return; }
  const key = FN_KEY[fn]; if (!key) return;
  if (fn === 'TAP') { fw.key('TAP', on); return; }
  if (on) { fw.key(key, true); fw.key(key, false); if ((fn === 'REC+PLAY' || fn === 'ODUB+PLAY') && !fw.s.playing) fw.key('PLAY', true); }
  void FOOTSWITCH_FNS;
}

/** Non-note events land on the current MIDI track while recording. */
function recordEvent(fw: Firmware, ev: Exclude<import('@/model/types').SeqEvent, NoteEvent>) {
  const s = fw.s; if (!s.playing || s.record === 'OFF') return;
  const tr = fw.m.sequences[s.seq].tracks[s.track]; if (tr.type !== 'MIDI') return;
  const tick = Math.max(0, Math.round(fw.transport.tickNow?.() ?? s.now));
  insertEvent(tr.events, { ...ev, tick }); tr.used = true;
}

function softThru(fw: Firmware, ch: number, bytes: number[]) {
  const midi = fw.midi; if (!midi) return;
  const mode = fw.m.midi.softThru; if (mode === 'OFF') return;
  const tr = fw.m.sequences[fw.s.seq].tracks[fw.s.track];
  const send = (out: 'A' | 'B', c: number) => { const st = bytes[0] & 0xf0; if (st === 0x90) midi.noteOn(out, c, bytes[1], bytes[2]); else if (st === 0x80) midi.noteOff(out, c, bytes[1]); };
  if (mode === 'AS TRACK') { if (tr.channel > 0) send(tr.channel <= 16 ? 'A' : 'B', (tr.channel - 1) % 16); }
  else { if (mode !== 'OMNI-B') send('A', ch); if (mode !== 'OMNI-A') send('B', ch); }
}
