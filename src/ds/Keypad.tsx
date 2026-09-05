import type { CSSProperties } from 'react';
import { HardButton } from './HardButton';

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'SHIFT' | 'ENTER';

/**
 * The 3x4 MODE block: digits 7-9 / 4-6 / 1-3 / SHIFT 0 ENTER. Each digit key shows its digit on the cap and its
 * mode name silkscreened ABOVE the cap (the one exception besides pads to labels-under-controls, as on the hardware).
 */
export interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  /** Needed for SHIFT hold */
  onKeyRelease?: (key: KeypadKey) => void;
  /** Renders SHIFT latched */
  shiftHeld?: boolean;
  onDark?: boolean;
  style?: CSSProperties;
}

const MODES: Partial<Record<KeypadKey, string>> = {
  '7': 'MIXER', '8': 'OTHER', '9': 'MIDI/SYNC',
  '4': 'SAMPLE', '5': 'TRIM', '6': 'PROGRAM',
  '1': 'SONG', '2': 'MISC.', '3': 'LOAD',
  '0': 'SAVE',
};
const ROWS: KeypadKey[][] = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['SHIFT', '0', 'ENTER']];

export function Keypad({ onKey, onKeyRelease, shiftHeld = false, onDark = false, style }: KeypadProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '6px 8px', justifyItems: 'center', alignItems: 'end', userSelect: 'none', ...style }}>
      {ROWS.flat().map((k) => (
        <HardButton
          key={k}
          size="sm"
          labelPosition="top"
          label={MODES[k]}
          cap={k === 'SHIFT' ? 'dark' : 'key'}
          active={k === 'SHIFT' && shiftHeld}
          onDark={onDark}
          onPress={() => onKey(k)}
          onRelease={() => onKeyRelease?.(k)}
        >
          {k}
        </HardButton>
      ))}
    </div>
  );
}
