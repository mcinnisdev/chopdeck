// LCD formatting helpers. The display is a character grid, so everything is padded text.
import { MidiOut, NOTE_MIN } from './types';

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const pad3 = (n: number) => String(n).padStart(3, '0');
export const rpad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
export const lpad = (s: string | number, n: number) => { const t = String(s); return t.length >= n ? t.slice(-n) : ' '.repeat(n - t.length) + t; };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 60 -> "C05" style used on the hardware (octave = floor(n/12) - 0 shown 2-digit). */
export function noteName(note: number): string {
  const n = NOTE_NAMES[note % 12];
  const oct = Math.floor(note / 12);
  // Three characters: naturals carry a two-digit octave (C05), sharps a one-digit octave (C#5).
  return n.length === 1 ? `${n}${String(oct).padStart(2, '0')}` : `${n}${oct % 10}`;
}

/** MIDI-style name for MIDI tracks: 60 -> "C 4" ... spec shows 0(C.)-127(G.8); keep compact. */
export function midiNoteName(note: number): string {
  const n = NOTE_NAMES[note % 12];
  const oct = Math.floor(note / 12) - 1;
  return `${n}${oct < 0 ? '.' : oct}`;
}

/** Pad slot 0..63 -> "A01".."D16" */
export function padName(pad: number): string {
  return `${String.fromCharCode(65 + Math.floor(pad / 16))}${pad2((pad % 16) + 1)}`;
}

/** Find the pad (0..63) currently mapped to a note, or -1. */
export function padForNote(padToNote: number[], note: number): number {
  return padToNote.indexOf(note);
}

/** "38/A06" as the hardware shows a note with its pad. */
export function notePad(note: number, padToNote: number[]): string {
  const p = padForNote(padToNote, note);
  return `${pad2(note)}/${p >= 0 ? padName(p) : '---'}`;
}

export function noteIndex(note: number): number { return note - NOTE_MIN; }

export function midiOutName(ch: MidiOut): string {
  if (ch <= 0) return 'OFF';
  return ch <= 16 ? `${ch}A` : `${ch - 16}B`;
}

export function tempoStr(bpm: number): string { return bpm.toFixed(1).padStart(5, ' '); }

export function tsigStr(num: number, den: number): string { return `${lpad(num, 2)}/${lpad(den, 2)}`; }

export function onOff(b: boolean): string { return b ? 'ON' : 'OFF'; }
export function yesNo(b: boolean): string { return b ? 'YES' : 'NO'; }

/** Seconds -> "12.3s" style */
export function secondsStr(s: number): string { return `${s.toFixed(1)}s`; }

export function bytesStr(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`;
  return `${(n / (1024 * 1024)).toFixed(1)}M`;
}
