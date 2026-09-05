// Computer keyboard as a second front panel. Pads on a 4x4 block, transport and cursor on the rest.
import { useEffect } from 'react';
import { Firmware } from '@/kernel/firmware';
import { HwKey, DigitKey } from '@/kernel/keys';

/** Bottom row = pads 1-4, matching the pad numbering (1 is bottom-left). */
export const PAD_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Digit4'];

const KEYS: Record<string, HwKey> = {
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'REC', F8: 'OVERDUB', F9: 'STOP', F10: 'PLAY',
  Enter: 'ENTER', NumpadEnter: 'ENTER', Escape: 'MAIN', Backspace: 'MAIN', Tab: 'WINDOW',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  Comma: 'BAR_L', Period: 'BAR_R', Semicolon: 'STEP_L', Quote: 'STEP_R',
  Home: 'PLAY_START', End: 'STOP', Insert: 'REC', Delete: 'ERASE', KeyG: 'GOTO', KeyT: 'TAP', KeyU: 'UNDO',
  ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
};
const ROW_DIGITS: Record<string, DigitKey> = { Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9' };

export const KEYBOARD_VELOCITY = 100;

export function useKeyboard(fw: Firmware, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const downPads = new Set<number>();
    const isTyping = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };

    const onDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat && e.code !== 'ArrowUp' && e.code !== 'ArrowDown' && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight' && e.code !== 'BracketLeft' && e.code !== 'BracketRight') return;
      const code = e.code;
      // wheel
      if (code === 'BracketLeft' || code === 'BracketRight' || code === 'NumpadSubtract' || code === 'NumpadAdd') {
        const dir = code === 'BracketRight' || code === 'NumpadAdd' ? 1 : -1;
        fw.wheel(dir * (e.shiftKey ? 10 : 1)); e.preventDefault(); return;
      }
      if (code === 'Space') { e.preventDefault(); if (e.repeat) return; if (e.shiftKey) fw.key('PLAY_START'); else fw.key(fw.s.playing ? 'STOP' : 'PLAY'); return; }
      // SHIFT + number row = mode select (the keypad silkscreen)
      if (e.shiftKey && ROW_DIGITS[code]) { e.preventDefault(); fw.key(ROW_DIGITS[code]); return; }
      const pad = PAD_KEYS.indexOf(code);
      if (pad >= 0) { e.preventDefault(); if (downPads.has(pad)) return; downPads.add(pad); fw.padDown(fw.s.padBank * 16 + pad, KEYBOARD_VELOCITY); return; }
      const k = KEYS[code];
      if (!k) return;
      e.preventDefault();
      fw.key(k, true);
    };
    const onUp = (e: KeyboardEvent) => {
      const pad = PAD_KEYS.indexOf(e.code);
      if (pad >= 0) { downPads.delete(pad); fw.padUp(fw.s.padBank * 16 + pad); return; }
      const k = KEYS[e.code];
      if (k) fw.key(k, false);
    };
    const onBlur = () => { for (const p of downPads) fw.padUp(p); downPads.clear(); if (fw.s.shift) fw.key('SHIFT', false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur); };
  }, [fw, enabled]);
}
