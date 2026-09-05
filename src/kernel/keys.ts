// Every physical control on the panel, as the kernel sees it.

export type SoftKeyId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6';
export type DigitKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type HwKey =
  | SoftKeyId
  | DigitKey
  | 'SHIFT' | 'ENTER' | 'MAIN' | 'WINDOW'
  | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  | 'PLAY' | 'PLAY_START' | 'STOP' | 'REC' | 'OVERDUB'
  | 'STEP_L' | 'STEP_R' | 'BAR_L' | 'BAR_R' | 'GOTO'
  | 'UNDO' | 'ERASE' | 'TAP' | 'AFTER'
  | 'FULL_LEVEL' | 'SIXTEEN_LEVELS' | 'NEXT_SEQ' | 'TRACK_MUTE'
  | 'BANK_A' | 'BANK_B' | 'BANK_C' | 'BANK_D';

export const SOFT_KEYS: SoftKeyId[] = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
export const DIGITS: DigitKey[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function softKeyIndex(k: HwKey): number { return SOFT_KEYS.indexOf(k as SoftKeyId); }
export function isDigit(k: HwKey): k is DigitKey { return DIGITS.includes(k as DigitKey); }

/** Modes reachable with SHIFT + digit, as printed above the keypad. */
export type ModeId =
  | 'MAIN' | 'STEP' | 'EDIT' | 'TRACK_MUTE' | 'NEXT_SEQ' | 'ASSIGN'
  | 'SONG' | 'MISC' | 'LOAD' | 'SAMPLE' | 'TRIM' | 'PROGRAM' | 'MIXER' | 'OTHER' | 'MIDI' | 'SAVE';

export const SHIFT_MODES: Record<DigitKey, ModeId> = {
  '1': 'SONG', '2': 'MISC', '3': 'LOAD', '4': 'SAMPLE', '5': 'TRIM', '6': 'PROGRAM',
  '7': 'MIXER', '8': 'OTHER', '9': 'MIDI', '0': 'SAVE',
};
