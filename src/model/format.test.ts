import { describe, it, expect } from 'vitest';
import { padName, notePad, midiOutName, tsigStr, tempoStr, noteName } from './format';
import { defaultPadToNote } from './factory';

describe('format', () => {
  it('names pads A01..D16', () => {
    expect(padName(0)).toBe('A01');
    expect(padName(15)).toBe('A16');
    expect(padName(16)).toBe('B01');
    expect(padName(63)).toBe('D16');
  });
  it('shows note with its pad using the default map', () => {
    const m = defaultPadToNote();
    expect(notePad(35, m)).toBe('35/A01');
    expect(notePad(98, m)).toBe('98/D16');
  });
  it('formats MIDI outs', () => {
    expect(midiOutName(0)).toBe('OFF');
    expect(midiOutName(1)).toBe('1A');
    expect(midiOutName(16)).toBe('16A');
    expect(midiOutName(17)).toBe('1B');
    expect(midiOutName(32)).toBe('16B');
  });
  it('formats tsig and tempo like the LCD', () => {
    expect(tsigStr(4, 4)).toBe(' 4/ 4');
    expect(tempoStr(93)).toBe(' 93.0');
    expect(tempoStr(120)).toBe('120.0');
  });
  it('names notes', () => {
    expect(noteName(60)).toBe('C05');
    expect(noteName(37)).toBe('C#3');
  });
});
