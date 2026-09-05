// SAMPLE mode: record a new sound from the input (or resample the machine) with threshold and pre-record.
import { ScreenDef, Ctx, SoundApi } from '@/kernel/screen';
import { text, ATTR_DIM } from '@/lcd/frame';
import { NOTE_MIN, NOTE_MAX, Sound } from '@/model/types';
import { newSound } from '@/model/factory';
import { notePad } from '@/model/format';
import { enumField, intField, clamp } from './util';
import type { RecorderStatus, RecorderInput, RecorderMode } from '@/audio/recorder';

/** What SAMPLE mode needs from the host; the audio engine provides it in the app. */
export interface SamplerInput {
  open(input: RecorderInput, monitor: boolean): Promise<void>;
  close(): void;
  setMonitor(on: boolean): void;
  arm(opts: { mode: RecorderMode; thresholdDb: number | null; seconds: number; preRecMs: number }): void;
  startNow(): void;
  stop(): void;
  cancel(): void;
  take(): Float32Array[];
  status(): RecorderStatus;
  resetPeak(): void;
  rate(): number;
}

export const sampleSettings = { input: 'ANALOG' as RecorderInput, mode: 'STEREO' as RecorderMode, monitor: 'L/R' as 'OFF' | 'L/R', thresholdDb: -20 as number | null, seconds: 10, preRecMs: 100 };
let recorder: SamplerInput | null = null;
let openError: string | null = null;
export function installSamplerInput(r: SamplerInput) { recorder = r; }

const programMap = (c: Ctx) => { const pg = c.m.programs[c.m.drums[c.s.drum].pgm]; return pg.padAssign === 'MASTER' ? c.m.masterPadToNote : pg.padToNote; };
const dbStr = (v: number | null) => (v == null ? 'OFF' : `${v}`.padStart(3, ' '));

export const sampleScreen: ScreenDef = {
  id: 'SAMPLE',
  fields: () => [
    enumField({ id: 'input', row: 0, col: 6, width: 8, label: 'Input:', values: ['ANALOG', 'RESAMPLE'] as const, get: () => sampleSettings.input, set: (c, v) => { sampleSettings.input = v; void reopen(c); } }),
    enumField({ id: 'mode', row: 0, col: 20, width: 6, label: 'Mode:', values: ['MONO L', 'MONO R', 'STEREO'] as const, get: () => sampleSettings.mode, set: (_c, v) => { sampleSettings.mode = v; } }),
    enumField({ id: 'monitor', row: 0, col: 36, width: 3, label: 'Monitor:', values: ['OFF', 'L/R'] as const, get: () => sampleSettings.monitor, set: (_c, v) => { sampleSettings.monitor = v; recorder?.setMonitor(v !== 'OFF'); } }),
    { id: 'threshold', row: 1, col: 10, width: 3, label: 'Threshold:', get: () => dbStr(sampleSettings.thresholdDb),
      wheel: (_c, d) => { const t = sampleSettings.thresholdDb; if (t == null) { if (d > 0) sampleSettings.thresholdDb = -60; } else { const n = t + d; sampleSettings.thresholdDb = n < -60 ? null : Math.min(0, n); } } },
    { id: 'time', row: 1, col: 20, width: 5, label: 'Time:', get: () => `${sampleSettings.seconds.toFixed(1)}s`.padStart(5, ' '),
      wheel: (_c, d) => { sampleSettings.seconds = clamp(Math.round((sampleSettings.seconds + d / 10) * 10) / 10, 0.1, 600); },
      enter: (_c, digits) => { const n = parseInt(digits, 10); if (n > 0) sampleSettings.seconds = clamp(n / 10, 0.1, 600); } },
    intField({ id: 'prerec', row: 1, col: 35, width: 3, label: 'Pre-rec:', min: 0, max: 100, get: () => sampleSettings.preRecMs, set: (_c, v) => { sampleSettings.preRecMs = v; }, fmt: v => `${v}`.padStart(3, ' ') }),
  ],
  draw(c, f) {
    text(f, 1, 38, 'ms');
    const st = recorder?.status();
    const level = (row: number, name: string, lv: number, pk: number) => {
      text(f, row, 0, `${name}:`);
      f.graphics.push({ kind: 'meter', row, col: 7, rows: 1, cols: 30, value: Math.min(1, lv), marks: [...(sampleSettings.thresholdDb != null ? [Math.min(1, Math.pow(10, sampleSettings.thresholdDb / 20))] : []), Math.min(1, pk)] });
      text(f, row, 38, `${Math.round(20 * Math.log10(Math.max(1e-4, pk)))}dB`.padStart(6, ' '), ATTR_DIM);
    };
    level(2, ' LEFT', st?.levelL ?? 0, st?.peakL ?? 0);
    level(3, 'RIGHT', st?.levelR ?? 0, st?.peakR ?? 0);
    text(f, 2, 45, 'LVL', ATTR_DIM);
    const rate = recorder?.rate() ?? 44100;
    if (openError) text(f, 5, 0, `Input: ${openError}`.slice(0, 48), ATTR_DIM);
    else if (!recorder) text(f, 5, 0, 'Audio engine not running.', ATTR_DIM);
    else if (st?.state === 'armed') text(f, 5, 0, 'Waiting for input signal...');
    else if (st?.state === 'recording') text(f, 5, 0, `Recording... ${(st.recorded / rate).toFixed(1)}s`);
    else if (st?.state === 'done') text(f, 5, 0, `Done. ${(st.recorded / rate).toFixed(1)}s captured.`);
    else text(f, 5, 0, sampleSettings.input === 'RESAMPLE' ? 'Resample: records what the machine plays.' : 'Press RECORD, then play into the input.', ATTR_DIM);
    void c;
  },
  softKeys: () => {
    const st = recorder?.status().state ?? 'idle';
    if (st === 'armed') return [null, null, null, null, { label: 'CANCEL', kind: 'action', press: () => recorder?.cancel() }, { label: 'START', kind: 'action', press: () => recorder?.startNow() }];
    if (st === 'recording') return [null, null, null, null, { label: 'CANCEL', kind: 'action', press: () => recorder?.cancel() }, { label: 'STOP', kind: 'action', press: c => { recorder?.stop(); keep(c); } }];
    return [
      { label: 'RESET', kind: 'action', press: () => recorder?.resetPeak() },
      { label: 'PEAK', kind: 'action', press: () => recorder?.resetPeak() },
      null, null, null,
      { label: 'RECORD', kind: 'action', press: c => { if (!recorder) return; recorder.arm({ mode: sampleSettings.mode, thresholdDb: sampleSettings.thresholdDb, seconds: sampleSettings.seconds, preRecMs: sampleSettings.preRecMs }); c.fw.touch(); } },
    ];
  },
  onEnter(c) { void reopen(c); },
  onLeave() { recorder?.cancel(); recorder?.close(); },
  onKey(c, key, down) {
    if (down && key === 'WINDOW' && !c.s.windows.length) { c.fw.openWindow('SAMPLE/MEMORY'); return true; }
    // the recorder finishes on its own at the time limit: promote to the KEEP window
    if (down && key === 'STOP' && recorder?.status().state === 'recording') { recorder.stop(); keep(c); return true; }
    return false;
  },
};

async function reopen(c: Ctx) {
  if (!recorder) return;
  try { openError = null; await recorder.open(sampleSettings.input, sampleSettings.monitor !== 'OFF'); }
  catch (e) { openError = e instanceof Error ? e.message : String(e); }
  c.fw.touch();
}

/** Called when a take finished: move to the KEEP or RETRY window. */
export function keep(c: Ctx) {
  if (!recorder) return;
  const pcm = recorder.take();
  if (!pcm[0]?.length) return;
  const n = c.m.sounds.filter(s => /^sound\d+$/i.test(s.name)).length + 1;
  const sound = newSound(`sound${n}`, pcm, recorder.rate());
  c.fw.openWindow('SAMPLE/KEEP', { sound, note: 0 });
}

export const keepWindow: ScreenDef = {
  id: 'SAMPLE/KEEP', title: 'KEEP or RETRY',
  fields: () => [
    { id: 'name', row: 3, col: 20, width: 16, label: 'Name for new sound:', get: c => (params(c).sound.name), name: true, nameValue: c => params(c).sound.name, nameCommit: (c, n) => { params(c).sound.name = n; } },
    { id: 'note', row: 4, col: 16, width: 20, label: 'Assign to note:', get: c => { const p = params(c); return p.note ? notePad(p.note, programMap(c)) : '--/OFF'; },
      wheel: (c, d) => { const p = params(c); const n = p.note === 0 ? (d > 0 ? NOTE_MIN : 0) : p.note + d; p.note = n < NOTE_MIN ? 0 : Math.min(NOTE_MAX, n); },
      pad: (c, pad) => { params(c).note = programMap(c)[pad]; } },
  ],
  draw(c, f) { const p = params(c); text(f, 5, 2, `${p.sound.channels === 2 ? 'STEREO' : 'MONO'}  ${(p.sound.length / p.sound.rate).toFixed(2)}s`, ATTR_DIM); },
  softKeys: () => [null,
    { label: 'RETRY', kind: 'action', press: c => { c.fw.sound.stopAll(); c.fw.closeWindow(); } },
    null,
    { label: 'PLAY', kind: 'action', press: c => c.fw.sound.playSound(params(c).sound) },
    { label: 'KEEP', kind: 'action', press: c => {
      const p = params(c);
      c.m.sounds.push(p.sound);
      if (p.note) { const pg = c.m.programs[c.m.drums[c.s.drum].pgm]; pg.notes[p.note - NOTE_MIN].snd = p.sound.id; pg.used = true; }
      c.fw.sound.stopAll(); c.fw.closeWindow();
    } },
    null],
  onLeave(c) { c.fw.sound.stopAll(); },
};
const params = (c: Ctx) => c.s.windows[c.s.windows.length - 1]?.params as unknown as { sound: Sound; note: number };

export const soundMemoryWindow: ScreenDef = {
  id: 'SAMPLE/MEMORY', title: 'Sound memory',
  fields: () => [],
  draw(c, f) {
    const bytes = c.m.sounds.reduce((a, s) => a + s.length * s.channels * 2, 0);
    const total = 32 * 1024 * 1024;
    const rate = recorder?.rate() ?? 44100;
    text(f, 3, 4, `Free memory(time): ${((total - bytes) / (rate * 2)).toFixed(1)}sec`);
    text(f, 4, 4, `${c.m.sounds.length} sounds in memory, 32 Megabytes installed`, ATTR_DIM);
  },
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, null, null],
};

export const sampleScreens: ScreenDef[] = [sampleScreen, keepWindow, soundMemoryWindow];
export type { SoundApi };
