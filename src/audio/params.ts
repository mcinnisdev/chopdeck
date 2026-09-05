// Pure mappings from program parameters to synthesis values. Kept separate so they can be unit tested
// without an AudioContext.
import { NoteParams, Sound, NvParam } from '@/model/types';
import { NoteVar } from '@/kernel/screen';

export const MAX_VOICES = 32;
const ENV_MAX_SEC = 5;

/** 0..100 envelope time -> seconds. Quadratic so the useful short range has resolution. */
export function envSeconds(v: number): number { return ENV_MAX_SEC * Math.pow(Math.max(0, Math.min(100, v)) / 100, 2); }

/** Filter index 0..100 -> cutoff Hz (20 Hz .. 20 kHz, log). */
export function cutoffHz(idx: number): number { return 20 * Math.pow(1000, Math.max(0, Math.min(100, idx)) / 100); }

/** Resonance 0..100 -> biquad Q. */
export function resonanceQ(r: number): number { return 0.7 * Math.pow(20, Math.max(0, Math.min(100, r)) / 100); }

/** Tune in tenths of a semitone -> playback rate multiplier. */
export function tuneToRate(tenths: number): number { return Math.pow(2, tenths / 120); }

export interface VoicePlan {
  sound: Sound;
  rate: number;              // playbackRate
  gain: number;              // linear, before pan
  pan: number;               // -1..1
  startFrame: number;        // absolute frame in the sound
  endFrame: number;
  loop: boolean;
  attackSec: number;
  decaySec: number;
  decayMode: 'END' | 'START';
  cutoff: number;            // Hz at rest
  q: number;
  fenv: { attackSec: number; decaySec: number; amountIdx: number; baseIdx: number } | null;
  overlap: NoteParams['overlap'];
  mutes: number[];
}

export interface PlanInput {
  np: NoteParams;
  sound: Sound;
  vel: number;               // 1..127
  nv?: NoteVar;
  drumVol: number;           // 0..1 from DRUM slot MIDI volume
}

export function applyNoteVar(np: NoteParams, nv: NoteVar | undefined): { tune: number; decay: number; attack: number; filter: number } {
  const out = { tune: np.tune, decay: np.decay, attack: np.attack, filter: np.freq };
  if (!nv) return out;
  switch (nv.param) {
    case 'TUNING': out.tune = np.tune + nv.value; break;
    case 'DECAY': out.decay = nv.value; break;
    case 'ATTACK': out.attack = nv.value; break;
    case 'FILTER': out.filter = np.freq + nv.value; break;
  }
  return out;
}

export function planVoice({ np, sound, vel, nv, drumVol }: PlanInput): VoicePlan {
  const v = Math.max(1, Math.min(127, vel)) / 127;
  const varied = applyNoteVar(np, nv);

  const tenths = sound.tune + varied.tune + np.veloPitch * v;
  const rate = tuneToRate(tenths);

  const vl = np.veloLevel / 100;
  const velGain = (1 - vl) + vl * v;
  const gain = (np.vol / 100) * (sound.level / 100) * velGain * drumVol;

  const span = Math.max(1, sound.end - sound.st);
  const startShift = Math.floor((np.veloStart / 100) * (1 - v) * span);
  const startFrame = Math.min(sound.st + startShift, Math.max(sound.st, sound.end - 64));

  const attackSec = envSeconds(varied.attack) * (1 - (np.veloAttack / 100) * v);
  const decaySec = envSeconds(varied.decay);

  const cutIdx = varied.filter + np.veloFreq * v;
  const fenv = np.fenvAmount > 0
    ? { attackSec: envSeconds(np.fenvAttack), decaySec: envSeconds(np.fenvDecay), amountIdx: np.fenvAmount, baseIdx: cutIdx }
    : null;

  return {
    sound, rate, gain, pan: (np.pan - 50) / 50, startFrame, endFrame: sound.end,
    loop: sound.loopOn, attackSec, decaySec, decayMode: np.dcyMode,
    cutoff: cutoffHz(cutIdx), q: resonanceQ(np.reson), fenv, overlap: np.overlap,
    mutes: np.mutes.filter(n => n > 0),
  };
}

/** Which note(s) a hit actually plays, per the program's play mode. Returns note numbers. */
export function resolveNotes(np: NoteParams, note: number, vel: number, decayValue: number): number[] {
  switch (np.mode) {
    case 'SIMULT': return [note, ...np.alt.map(a => a.note).filter(n => n > 0)];
    case 'VEL SW': {
      if (np.alt[1].note > 0 && vel > np.alt[1].over) return [np.alt[1].note];
      if (np.alt[0].note > 0 && vel > np.alt[0].over) return [np.alt[0].note];
      return [note];
    }
    case 'DCY SW': {
      if (np.alt[1].note > 0 && decayValue > np.alt[1].over) return [np.alt[1].note];
      if (np.alt[0].note > 0 && decayValue > np.alt[0].over) return [np.alt[0].note];
      return [note];
    }
    default: return [note];
  }
}

/** Amplitude envelope breakpoints for a voice of `durSec` playback seconds. Returns times relative to start. */
export function ampEnvelope(plan: Pick<VoicePlan, 'attackSec' | 'decaySec' | 'decayMode' | 'loop'>, durSec: number): { attackEnd: number; decayStart: number; tau: number; stopAt: number } {
  const tau = Math.max(0.005, plan.decaySec / 3);
  // "When the sample is short, the decay time has higher priority than the attack time."
  const attackEnd = plan.loop ? plan.attackSec : Math.min(plan.attackSec, Math.max(0, durSec - plan.decaySec));
  if (plan.loop) return { attackEnd, decayStart: Infinity, tau, stopAt: Infinity };
  const decayStart = plan.decayMode === 'START' ? attackEnd : Math.max(attackEnd, durSec - plan.decaySec);
  // in START mode the voice can end long before the sample does
  const stopAt = plan.decayMode === 'START' ? Math.min(durSec, decayStart + tau * 6) : durSec;
  return { attackEnd, decayStart, tau, stopAt };
}

/** 16 LEVELS: the note-variation value for pad i (0..15) of the current bank. */
export function sixteenLevelValue(type: NvParam, i: number, origPad: number, low: number, high: number): NoteVar {
  if (type === 'TUNING') return { param: 'TUNING', value: (i - (origPad - 1)) * 10 };
  return { param: type, value: Math.round(low + (i / 15) * (high - low)) };
}

/** NOTE VARIATION slider 0..127 -> value inside the assigned range. */
export function sliderValue(param: NvParam, slider: number, low: number, high: number): NoteVar {
  return { param, value: Math.round(low + (slider / 127) * (high - low)) };
}
