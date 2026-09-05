import { describe, it, expect } from 'vitest';
import { encodeWav, decodeWav } from './wav';
import { encodeSmf, decodeSmf } from './smf';
import { zipStore, zipRead, crc32 } from './zip';
import { MemoryDrive } from './drive';
import { newSequence } from '@/model/factory';
import { noteEvent } from '@/seq/events';
import { PPQ } from '@/model/types';

describe('wav', () => {
  it('round-trips 16-bit stereo', () => {
    const l = Float32Array.from([0, 0.5, -0.5, 1]), r = Float32Array.from([0.25, -0.25, 0, -1]);
    const bytes = encodeWav([l, r], 44100);
    expect(bytes.length).toBe(44 + 4 * 2 * 2);
    const back = decodeWav(bytes)!;
    expect(back.rate).toBe(44100);
    expect(Array.from(back.pcm[0]).map(v => Math.round(v * 100) / 100)).toEqual([0, 0.5, -0.5, 1]);
    expect(back.pcm[1][3]).toBeCloseTo(-1, 3);
  });
  it('decodes 24-bit', () => {
    const bytes = encodeWav([Float32Array.from([0.5])], 22050, 24);
    expect(decodeWav(bytes)!.pcm[0][0]).toBeCloseTo(0.5, 4);
  });
});

describe('smf', () => {
  it('writes type 0 and type 1 and reads them back with tempo, notes and controllers', () => {
    const seq = newSequence(0); seq.used = true; seq.name = 'Break'; seq.bars = 2; seq.tempo = 93; seq.tempoSource = 'SEQ';
    seq.tracks[0].events = [noteEvent(0, 36, 100, 24), noteEvent(PPQ, 38, 90, 12)];
    seq.tracks[1].type = 'MIDI'; seq.tracks[1].channel = 3; seq.tracks[1].events = [noteEvent(48, 60, 80, 96), { kind: 'cc', tick: 0, cc: 7, value: 100 }, { kind: 'bend', tick: 10, value: 2000 }];
    for (const type of [0, 1] as const) {
      const bytes = encodeSmf(seq, type, 93);
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd');
      const back = decodeSmf(bytes)!;
      expect(back.tempo).toBe(93);
      expect(back.name).toBe('Break');
      const drums = back.tracks[32].events.filter(e => e.kind === 'note');
      expect(drums.map(e => [e.tick, (e as { note: number }).note, (e as { dur: number }).dur])).toEqual([[0, 36, 24], [PPQ, 38, 12]]);
      const midi = back.tracks[2];
      expect(midi.type).toBe('MIDI'); expect(midi.channel).toBe(3);
      expect(midi.events.find(e => e.kind === 'cc')).toMatchObject({ cc: 7, value: 100 });
      expect(midi.events.find(e => e.kind === 'bend')).toMatchObject({ value: 2000 });
      expect(midi.events.find(e => e.kind === 'note')).toMatchObject({ note: 60, dur: 96 });
      expect(back.bars).toBe(1);
    }
  });
  it('handles a different ppq and tempo changes', () => {
    const seq = newSequence(0); seq.bars = 1; seq.tempo = 120; seq.tempoSource = 'SEQ'; seq.tempoChangeOn = true; seq.tempoChanges = [{ tick: 0, ratio: 1 }, { tick: 192, ratio: 1.5 }];
    seq.tracks[0].events = [noteEvent(192, 36, 100, 10)];
    const back = decodeSmf(encodeSmf(seq, 0, 120))!;
    expect(back.tempoChangeOn).toBe(true);
    expect(back.tempoChanges[1].ratio).toBeCloseTo(1.5, 2);
  });
});

describe('zip', () => {
  it('stores and reads entries with a valid crc', () => {
    const a = new TextEncoder().encode('hello'); const b = Uint8Array.from([1, 2, 3, 4]);
    const z = zipStore([{ name: 'a.txt', data: a }, { name: 'dir/b.bin', data: b }]);
    expect(z[0]).toBe(0x50);
    const back = zipRead(z);
    expect(back.map(e => e.name)).toEqual(['a.txt', 'dir/b.bin']);
    expect(new TextDecoder().decode(back[0].data)).toBe('hello');
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('drive', () => {
  it('writes, lists, renames and removes files and folders', async () => {
    const d = new MemoryDrive();
    await d.mkdir('', 'KITS');
    await d.write('KITS', 'KICK.WAV', new Uint8Array(10));
    await d.write('', 'SONG.ALL', new Uint8Array(5));
    expect((await d.list('')).map(f => [f.name, f.type])).toEqual([['KITS', 'DIR'], ['SONG.ALL', 'ALL']]);
    expect((await d.list('KITS')).map(f => f.path)).toEqual(['KITS/KICK.WAV']);
    await d.rename('KITS', 'DRUMS');
    expect((await d.list('DRUMS')).map(f => f.path)).toEqual(['DRUMS/KICK.WAV']);
    expect(await d.usage()).toBe(15);
    await d.remove('DRUMS');
    expect((await d.list('')).map(f => f.name)).toEqual(['SONG.ALL']);
  });
});
