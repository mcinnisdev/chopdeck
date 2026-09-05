import {
  Machine, Sequence, Track, Song, Program, NoteParams, DrumSlot, Sound, SequenceDefaults,
  NUM_SEQUENCES, NUM_TRACKS, NUM_SONGS, NUM_PROGRAMS, NUM_DRUMS, NUM_PADS, NUM_NOTES, NOTE_MIN,
} from './types';

export const DEFAULTS: SequenceDefaults = {
  tempo: 120, tempoSource: 'MAS', tsig: { num: 4, den: 4 }, loop: false, bars: 0, pgm: 0,
  trackType: 'DRUM1', channel: 0, veloPct: 100, defaultSeqName: 'Sequence', defaultTrackName: 'Track',
};

/** Hardware default pad map: bank A = 35..50, B = 51..66, C = 67..82, D = 83..98. */
export function defaultPadToNote(): number[] {
  return Array.from({ length: NUM_PADS }, (_, i) => NOTE_MIN + i);
}

export function newTrack(index: number, d: SequenceDefaults = DEFAULTS): Track {
  return {
    name: `${d.defaultTrackName}-${String(index + 1).padStart(2, '0')}`,
    used: false, type: d.trackType, channel: d.channel, on: true, pgm: d.pgm,
    veloPct: d.veloPct, transmitPgm: true, transpose: 0, events: [],
  };
}

export function newSequence(index: number, d: SequenceDefaults = DEFAULTS): Sequence {
  return {
    used: false,
    name: `${d.defaultSeqName}${String(index + 1).padStart(2, '0')}`,
    tempo: d.tempo, tempoSource: d.tempoSource, tempoChangeOn: false,
    tempoChanges: [{ tick: 0, ratio: 1 }],
    tsigs: [{ fromBar: 0, num: d.tsig.num, den: d.tsig.den }],
    bars: d.bars,
    loop: { on: d.loop, first: 1, last: 'END' },
    tracks: Array.from({ length: NUM_TRACKS }, (_, i) => newTrack(i, d)),
  };
}

export function newSong(index: number): Song {
  return {
    used: false, name: `Song${String(index + 1).padStart(2, '0')}`, steps: [],
    loop: { on: false, first: 1, last: 1 }, tempoSource: 'MAS', tempo: 120, ignoreTempoChanges: false,
  };
}

export function newNoteParams(): NoteParams {
  return {
    snd: null, mode: 'NORMAL', alt: [{ note: 0, over: 44 }, { note: 0, over: 88 }],
    attack: 0, decay: 100, dcyMode: 'END', veloAttack: 0, veloStart: 0, veloLevel: 100,
    freq: 100, reson: 0, fenvAttack: 0, fenvDecay: 0, fenvAmount: 0, veloFreq: 0,
    tune: 0, veloPitch: 0, overlap: 'POLY', mutes: [0, 0],
    vol: 100, pan: 50, fxBus: 'OFF', fxSend: 0, indivOut: 0, indivVol: 100, followStereo: false,
  };
}

export function newProgram(index: number, name?: string): Program {
  return {
    used: false,
    name: name ?? `NewPgm-${String.fromCharCode(65 + (index % 26))}`,
    midiPgm: index + 1, padAssign: 'PROGRAM', padToNote: defaultPadToNote(),
    notes: Array.from({ length: NUM_NOTES }, newNoteParams),
  };
}

export function newDrumSlot(index: number): DrumSlot {
  return { pgm: index, pgmChange: 'RECEIVE', midiVolume: 'RECEIVE', currentVol: 127, padToInternal: true };
}

let soundSeq = 0;
export function newSound(name: string, pcm: Float32Array[], rate: number): Sound {
  const length = pcm[0]?.length ?? 0;
  return {
    id: `snd_${Date.now().toString(36)}_${(soundSeq++).toString(36)}`,
    name, rate, channels: pcm.length === 2 ? 2 : 1, length, pcm,
    st: 0, end: length, loopTo: 0, loopLength: length, loopOn: false,
    zones: [{ st: 0, end: length }], level: 100, tune: 0, beat: 4,
  };
}

export function newMachine(): Machine {
  return {
    version: 1,
    sequences: Array.from({ length: NUM_SEQUENCES }, (_, i) => newSequence(i)),
    songs: Array.from({ length: NUM_SONGS }, (_, i) => newSong(i)),
    sounds: [],
    programs: Array.from({ length: NUM_PROGRAMS }, (_, i) => newProgram(i)),
    drums: Array.from({ length: NUM_DRUMS }, (_, i) => newDrumSlot(i)),
    masterPadToNote: defaultPadToNote(),
    masterLevelDb: 0,
    timing: '1/16',
    swing: 50,
    count: {
      countIn: 'OFF', inPlay: false, inRec: true, rate: '1/4', waitForKey: false,
      sound: 'CLICK', clickVolume: 100, accentNote: 37, accentVel: 127, normalNote: 36, normalVel: 64,
    },
    timeDisplay: { style: 'BAR,BEAT,CLOCK', startTime: 0, frameRate: 30 },
    noteVariation: { note: 0, param: 'TUNING', low: -120, high: 120, cc: 0 },
    midi: {
      receiveChannel: 0, progChangeToSeq: false, sustainToDuration: false, softThru: 'OFF',
      deviceNames: Array.from({ length: 32 }, () => ''),
      syncIn: { mode: 'OFF', shiftEarlyMs: 0, receiveMmc: false },
      syncOut: { mode: 'OFF', sendMmc: false },
      footswitches: [{ cc: 10, fn: 'PLAY STRT' }, { cc: 26, fn: 'PLAY' }, { cc: 69, fn: 'STOP' }, { cc: 127, fn: 'REC+PLAY' }],
      inPort: '', outA: '', outB: '',
    },
    tapAveraging: 3,
    defaults: { ...DEFAULTS },
    locateMemories: Array.from({ length: 9 }, () => 0),
    recordMixChanges: false,
  };
}

/** Programs 0 is marked used on a fresh machine so pads have somewhere to land. */
export function newMachineWithStarterProgram(): Machine {
  const m = newMachine();
  m.programs[0].used = true;
  return m;
}
