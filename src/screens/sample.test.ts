import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram } from '@/model/factory';
import { allScreens } from '@/screens';
import { installSamplerInput, sampleSettings, SamplerInput } from './sample';
import { frameToLines } from '@/lcd/frame';
import type { RecorderStatus } from '@/audio/recorder';
import { NOTE_MIN } from '@/model/types';

class FakeInput implements SamplerInput {
  st: RecorderStatus = { state: 'idle', levelL: 0, levelR: 0, peakL: 0, peakR: 0, recorded: 0 };
  armed: unknown = null;
  opened: string[] = [];
  async open(input: string) { this.opened.push(input); }
  close() {}
  setMonitor() {}
  arm(o: unknown) { this.armed = o; this.st.state = 'armed'; }
  startNow() { this.st.state = 'recording'; }
  stop() { this.st.state = 'done'; this.st.recorded = 22050; }
  cancel() { this.st.state = 'idle'; }
  take() { this.st.state = 'idle'; return [new Float32Array(22050), new Float32Array(22050)]; }
  status() { return this.st; }
  resetPeak() { this.st.peakL = 0; this.st.peakR = 0; }
  rate() { return 44100; }
}

const boot = () => {
  const fw = new Firmware(newMachineWithStarterProgram(), allScreens);
  const input = new FakeInput(); installSamplerInput(input);
  return { fw, input };
};
const lines = (fw: Firmware) => frameToLines(fw.render());

describe('SAMPLE mode', () => {
  it('shows the record page, arms with the settings, and keeps the take on a note', async () => {
    const { fw, input } = boot();
    fw.key('SHIFT', true); fw.key('4'); fw.key('SHIFT', false);
    expect(fw.s.mode).toBe('SAMPLE');
    await Promise.resolve();
    expect(input.opened).toEqual(['ANALOG']);
    const l = lines(fw);
    expect(l[0]).toBe('Input:ANALOG   Mode:STEREO  Monitor:L/R');
    expect(l[1]).toBe('Threshold:-20  Time:10.0s  Pre-rec:100ms');
    expect(l[7]).toContain('RECORD');
    sampleSettings.seconds = 2;
    fw.key('F6'); // RECORD -> armed
    expect(input.armed).toMatchObject({ mode: 'STEREO', thresholdDb: -20, seconds: 2, preRecMs: 100 });
    expect(lines(fw)[5]).toContain('Waiting for input signal');
    fw.key('F6'); // START
    expect(input.st.state).toBe('recording');
    fw.key('F6'); // STOP -> KEEP window
    expect(fw.s.windows[0]?.id).toBe('SAMPLE/KEEP');
    expect(lines(fw)[1]).toContain('KEEP or RETRY');
    expect(lines(fw)[3]).toContain('Name for new sound:sound1');
    fw.key('DOWN'); fw.padDown(2, 100); fw.padUp(2); // assign to pad A03 -> note 37
    expect(lines(fw)[4]).toContain('Assign to note:37/A03');
    const before = fw.m.sounds.length;
    fw.key('F5'); // KEEP
    expect(fw.m.sounds.length).toBe(before + 1);
    const snd = fw.m.sounds[fw.m.sounds.length - 1];
    expect(snd.channels).toBe(2);
    expect(fw.m.programs[0].notes[37 - NOTE_MIN].snd).toBe(snd.id);
  });
  it('threshold wheel goes down to OFF; OPEN WINDOW shows sound memory', () => {
    const { fw } = boot();
    fw.setMode('SAMPLE');
    fw.key('DOWN'); // threshold
    fw.wheel(-100);
    expect(lines(fw)[1]).toContain('Threshold:OFF');
    fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Sound memory');
    expect(lines(fw)[3]).toContain('Free memory(time):');
  });
});
