// Session = everything about the machine's *current state of use* that is not project data.
// Not saved with the project (but may be restored across reloads later).
import { ModeId } from './keys';

export type RecordMode = 'OFF' | 'REC' | 'OVERDUB';

export interface NameEdit {
  value: string;          // always NAME_LEN wide (space padded)
  pos: number;            // cursor char
  lastPad: number;        // for cycling letter pairs
  lastPadAt: number;
  upper: boolean;
  commit: (name: string) => void;
}

export interface WindowState {
  id: string;             // screen id of the window definition
  params?: Record<string, unknown>;
}

export interface Session {
  mode: ModeId;
  page: Record<string, string>;         // mode -> current sub page (e.g. TRIM -> 'LOOP')
  windows: WindowState[];               // window stack, last = top
  cursor: Record<string, number>;       // screen id -> field index
  numeric: string | null;               // pending keypad entry
  shift: boolean;
  held: Set<string>;                    // keys currently held (for GO TO + BAR etc.)
  nameEdit: NameEdit | null;
  clipboardName: string;

  // sequencer position / transport
  seq: number;                          // active sequence index
  track: number;                        // active track index
  now: number;                          // tick
  playing: boolean;
  record: RecordMode;
  nextSeq: number | null;
  secondSeq: number | null;
  soloTrack: number | null;
  masterTempo: number;

  // pads and performance
  padBank: number;                      // 0..3
  fullLevel: boolean;
  sixteenLevels: boolean;
  after: boolean;
  nvValue: number;                      // slider 0..127
  lastPad: number | null;               // 0..63
  lastVel: number;
  litPads: Set<number>;

  // selections in the sound modes
  drum: number;                         // 0..3 selected DRUM slot
  program: number;                      // selected program index (PROGRAM mode)
  note: number;                         // selected note (PARAMS page)
  pad: number;                          // selected pad slot 0..63 (ASSIGN page)
  sound: number;                        // selected sound index

  // undo
  undoAvailable: boolean;

  // message overlay (bottom-right one-liner like "Next Sq: 2")
  message: string | null;
}

export function newSession(): Session {
  return {
    mode: 'MAIN', page: {}, windows: [], cursor: {}, numeric: null, shift: false, held: new Set(),
    nameEdit: null, clipboardName: '',
    seq: 0, track: 0, now: 0, playing: false, record: 'OFF', nextSeq: null, secondSeq: null, soloTrack: null,
    masterTempo: 120,
    padBank: 0, fullLevel: false, sixteenLevels: false, after: false, nvValue: 64, lastPad: null, lastVel: 0,
    litPads: new Set(),
    drum: 0, program: 0, note: 60, pad: 0, sound: 0,
    undoAvailable: false,
    message: null,
  };
}
