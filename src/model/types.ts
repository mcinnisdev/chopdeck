// Chop Deck machine model. Plain serialisable data; no class instances.
// Limits follow the hardware the screens are designed around (see docs/mpc2000xl-feature-inventory.md).

export const PPQ = 96;
export const NUM_SEQUENCES = 99;
export const NUM_TRACKS = 64;
export const NUM_SONGS = 20;
export const MAX_SONG_STEPS = 250;
export const NUM_SOUNDS = 256;
export const NUM_PROGRAMS = 24;
export const NUM_DRUMS = 4;
export const NUM_PADS = 64; // 16 pads x 4 banks (A01..D16)
export const NOTE_MIN = 35;
export const NOTE_MAX = 98;
export const NUM_NOTES = NOTE_MAX - NOTE_MIN + 1; // 64
export const MAX_ZONES = 16;
export const NAME_LEN = 16;
export const TEMPO_MIN = 30;
export const TEMPO_MAX = 300;

export type TimingValue = 'OFF' | '1/8' | '1/8(3)' | '1/16' | '1/16(3)' | '1/32' | '1/32(3)';
export const TIMING_VALUES: TimingValue[] = ['OFF', '1/8', '1/8(3)', '1/16', '1/16(3)', '1/32', '1/32(3)'];
export const TIMING_TICKS: Record<TimingValue, number> = {
  OFF: 1, '1/8': 48, '1/8(3)': 32, '1/16': 24, '1/16(3)': 16, '1/32': 12, '1/32(3)': 8,
};

export type TrackType = 'MIDI' | 'DRUM1' | 'DRUM2' | 'DRUM3' | 'DRUM4';
export const TRACK_TYPES: TrackType[] = ['MIDI', 'DRUM1', 'DRUM2', 'DRUM3', 'DRUM4'];

/** MIDI output channel: 0 = OFF, 1..16 = 1A..16A, 17..32 = 1B..16B */
export type MidiOut = number;

// ---------- Sequencer events ----------

export interface NoteEvent { kind: 'note'; tick: number; note: number; vel: number; dur: number; nv: number }
export interface BendEvent { kind: 'bend'; tick: number; value: number }            // -8192..8191
export interface CcEvent { kind: 'cc'; tick: number; cc: number; value: number }
export interface PgmEvent { kind: 'pgm'; tick: number; value: number }              // 1..128
export interface ChPressEvent { kind: 'chpress'; tick: number; value: number }
export interface PolyPressEvent { kind: 'polypress'; tick: number; note: number; value: number }
export interface SysexEvent { kind: 'sysex'; tick: number; bytes: number[] }
export type MixerParam = 'LEVEL' | 'PAN' | 'FXSEND' | 'INDIV';
export interface MixerEvent { kind: 'mixer'; tick: number; param: MixerParam; pad: number; value: number }
export type SeqEvent = NoteEvent | BendEvent | CcEvent | PgmEvent | ChPressEvent | PolyPressEvent | SysexEvent | MixerEvent;
export type EventKind = SeqEvent['kind'];

// ---------- Sequence / track ----------

export interface Track {
  name: string;
  used: boolean;            // false renders as (Unused)
  type: TrackType;
  channel: MidiOut;
  on: boolean;
  pgm: number;              // 0 = OFF, 1..128
  veloPct: number;          // playback velocity scaling, 100 = unity
  transmitPgm: boolean;
  transpose: number;        // non-destructive playback transpose (MIDI tracks)
  events: SeqEvent[];       // always sorted by tick, stable
}

export interface TempoChange { tick: number; ratio: number }   // ratio 1.0 = 100.0%
export interface TsigChange { fromBar: number; num: number; den: number }  // fromBar is 0-based
export interface LoopSetting { on: boolean; first: number; last: number | 'END' } // bars, 1-based

export interface Sequence {
  used: boolean;
  name: string;
  tempo: number;
  tempoSource: 'SEQ' | 'MAS';
  tempoChangeOn: boolean;
  tempoChanges: TempoChange[];   // first entry always at tick 0
  tsigs: TsigChange[];           // first entry always fromBar 0
  bars: number;
  loop: LoopSetting;
  tracks: Track[];               // NUM_TRACKS
}

export interface SequenceDefaults {
  tempo: number;
  tempoSource: 'SEQ' | 'MAS';
  tsig: { num: number; den: number };
  loop: boolean;
  bars: number;
  pgm: number;
  trackType: TrackType;
  channel: MidiOut;
  veloPct: number;
  defaultSeqName: string;
  defaultTrackName: string;
}

// ---------- Song ----------

export interface SongStep { seq: number; reps: number }  // seq index 0-based; reps 0 = stop here
export interface Song {
  used: boolean;
  name: string;
  steps: SongStep[];
  loop: { on: boolean; first: number; last: number };   // steps, 1-based
  tempoSource: 'SEQ' | 'MAS';
  tempo: number;
  ignoreTempoChanges: boolean;
}

// ---------- Sounds ----------

export interface Zone { st: number; end: number }
export interface Sound {
  id: string;
  name: string;
  rate: number;
  channels: 1 | 2;
  length: number;           // frames
  pcm: Float32Array[];      // one per channel; not part of JSON, stored separately
  st: number;
  end: number;
  loopTo: number;
  loopLength: number;
  loopOn: boolean;
  zones: Zone[];
  level: number;            // 0..100
  tune: number;             // -120..120 (tenths of a semitone)
  beat: number;             // beats in loop, for Beat Loop tempo
}

// ---------- Programs ----------

export type PlayMode = 'NORMAL' | 'SIMULT' | 'VEL SW' | 'DCY SW';
export type DecayMode = 'END' | 'START';
export type VoiceOverlap = 'POLY' | 'MONO' | 'NOTE OFF';
export type FxBus = 'OFF' | 'M1' | 'M2' | 'R1' | 'R2';

export interface NoteParams {
  snd: string | null;       // Sound id, null = OFF
  mode: PlayMode;
  alt: [{ note: number; over: number }, { note: number; over: number }]; // note 0 = OFF; over = velocity/decay threshold
  attack: number;           // 0..100
  decay: number;            // 0..100
  dcyMode: DecayMode;
  veloAttack: number; veloStart: number; veloLevel: number;
  freq: number; reson: number;                       // 0..100
  fenvAttack: number; fenvDecay: number; fenvAmount: number; veloFreq: number;
  tune: number; veloPitch: number;
  overlap: VoiceOverlap;
  mutes: [number, number];  // notes muted when this one plays; 0 = OFF
  vol: number; pan: number; // 0..100, pan 0 = L, 50 = MID, 100 = R
  fxBus: FxBus; fxSend: number;
  indivOut: number; indivVol: number; followStereo: boolean;
}

export interface Program {
  used: boolean;
  name: string;
  midiPgm: number;          // 1..128
  padAssign: 'PROGRAM' | 'MASTER';
  padToNote: number[];      // NUM_PADS entries, note numbers
  notes: NoteParams[];      // NUM_NOTES entries, index = note - NOTE_MIN
}

export interface DrumSlot {
  pgm: number;              // program index
  pgmChange: 'RECEIVE' | 'IGNORE';
  midiVolume: 'RECEIVE' | 'IGNORE';
  currentVol: number;       // last CC7
  padToInternal: boolean;
}

// ---------- Global settings ----------

export interface CountSettings {
  countIn: 'OFF' | 'REC+PLAY' | 'REC ONLY';
  inPlay: boolean;
  inRec: boolean;
  rate: '1/4' | '1/8' | '1/8(3)' | '1/16' | '1/16(3)' | '1/32' | '1/32(3)';
  waitForKey: boolean;
  sound: 'CLICK' | 'DRUM1' | 'DRUM2' | 'DRUM3' | 'DRUM4';
  clickVolume: number;
  accentNote: number; accentVel: number;
  normalNote: number; normalVel: number;
}

export interface TimeDisplay {
  style: 'BAR,BEAT,CLOCK' | 'HOUR,MINUTE,SEC';
  startTime: number;        // frames offset
  frameRate: 24 | 25 | 29.97 | 30;
}

export type NvParam = 'TUNING' | 'DECAY' | 'ATTACK' | 'FILTER';
export interface NoteVariation { note: number; param: NvParam; low: number; high: number; cc: number } // note 0 = OFF, cc 0 = OFF

export interface MidiSettings {
  receiveChannel: number;   // 0 = ALL
  progChangeToSeq: boolean;
  sustainToDuration: boolean;
  softThru: 'OFF' | 'AS TRACK' | 'OMNI-A' | 'OMNI-B' | 'OMNI-AB';
  deviceNames: string[];    // 32 entries
  syncIn: { mode: 'OFF' | 'MIDI CLOCK' | 'MIDI TIME CODE'; shiftEarlyMs: number; receiveMmc: boolean };
  syncOut: { mode: 'OFF' | 'MIDI CLOCK' | 'MIDI TIME CODE'; sendMmc: boolean };
  footswitches: { cc: number; fn: string }[];
  // port bindings (Web MIDI device names; empty = none)
  inPort: string;
  outA: string;
  outB: string;
}

export interface Machine {
  version: 1;
  sequences: Sequence[];
  songs: Song[];
  sounds: Sound[];
  programs: Program[];
  drums: DrumSlot[];
  masterPadToNote: number[];
  masterLevelDb: number;
  timing: TimingValue;
  swing: number;
  count: CountSettings;
  timeDisplay: TimeDisplay;
  noteVariation: NoteVariation;
  midi: MidiSettings;
  tapAveraging: number;
  defaults: SequenceDefaults;
  locateMemories: number[]; // 9 ticks
  recordMixChanges: boolean;
  fx: FxSets;
}

// ---------- Effects (the EB16-class board, always installed here) ----------

export type ModType = 'PHASE SHIFT' | 'FLANGE' | 'CHORUS' | 'ROTARY SPEAKERS' | 'FMOD/AUTOPAN' | 'PITCH SHIFT';
export type EchoType = 'MONO LEFT' | 'MONO L+R' | 'X-OVER L&R' | 'STEREO';
export type ReverbType = 'LARGE HALL' | 'SMALL HALL' | 'LARGE ROOM' | 'SMALL ROOM' | 'GATED 1' | 'GATED 2' | 'REVERSE';

export interface ReverbParams {
  type: ReverbType;
  predelayMs: number;       // 0..200
  time: number;             // 0..100 (decay)
  diffuse: number;          // 0..100
  hfDamp: number;           // 0..100
  level: number;            // 0..100 wet return
  on: boolean;
}
export interface MultiFxParams {
  dist: { on: boolean; gain: number; level: number; ringFreq: number; ringDepth: number };          // gain/level 0..100, ring depth 0..100 (0 = off)
  filt: { on: boolean; low: number; mid1: number; mid1Freq: number; mid2: number; mid2Freq: number; high: number }; // dB -12..12, freqs Hz
  mod: { on: boolean; type: ModType; speed: number; depth: number; feedback: number };              // speed 0.05..10 Hz, depth 0..100, feedback 0..100
  echo: { on: boolean; type: EchoType; delayMs: number; feedback: number; hfDamp: number };        // delay 0..670 ms
  rev: ReverbParams;
  mix: { on: boolean; direct: boolean; level: number };                                            // level 0..100
}
export interface FxSets { m1: MultiFxParams; m2: MultiFxParams; r1: ReverbParams; r2: ReverbParams }
