// OTHER mode: OTHERS (tap averaging, keyboard help), INIT (factory reset), VER. (about).
import { ScreenDef, Ctx } from '@/kernel/screen';
import { text, ATTR_DIM } from '@/lcd/frame';
import { intField, clamp } from './util';
import { newMachine } from '@/model/factory';
import { installDemo } from '@/audio/demo';

export const OS_VERSION = '0.4';
let helpPage = 0;
const HELP: string[][] = [
  ['Pads: Z X C V / A S D F / Q W E R / 1 2 3 4', 'Space PLAY/STOP  Shift+Space PLAY START', 'F1-F6 soft keys  F7 REC  F8 OVER DUB', 'F9 STOP  F10 PLAY  Home PLAY START'],
  ['Arrows CURSOR   [ ] DATA wheel (Shift x10)', 'Enter ENTER  Esc/Backspace MAIN  Tab WINDOW', 'Numpad 0-9 numeric   Shift+0-9 = MODE', ', . BAR << >>   ; \' STEP < >   G GO TO'],
  ['T TAP TEMPO / NOTE REPEAT (hold + pads)', 'U UNDO SEQ   Delete ERASE (hold + pads)', 'Drop WAV/MP3 or project files on the machine.', 'SHIFT + AFTER = note variation ASSIGN.'],
];

const footer = (page: string): ((c: Ctx) => (import('@/kernel/screen').SoftKeyDef | null)[]) => () => [
  { label: 'OTHERS', kind: page === 'OTHERS' ? 'current' : 'page', press: c => c.fw.setPage('OTHERS') },
  { label: 'INIT', kind: page === 'INIT' ? 'current' : 'page', press: c => c.fw.setPage('INIT') },
  { label: 'VER.', kind: page === 'VER' ? 'current' : 'page', press: c => c.fw.setPage('VER') },
  page === 'OTHERS' ? { label: 'HELP', kind: 'action', press: () => { helpPage = (helpPage + 1) % HELP.length; } } : null,
  null,
  page === 'INIT' ? { label: 'DO IT', kind: 'action', press: c => c.fw.confirm({ title: 'Initialize ALL PARAMETERS', lines: ['', 'Pressing DO IT will initialize!!', 'Sequences, programs and sounds are erased.'], doIt: () => { const fresh = newMachine(); fresh.programs[0].used = true; installDemo(fresh); Object.assign(c.m, fresh); c.s.seq = 0; c.s.track = 0; c.s.now = 0; c.s.sound = 0; c.s.program = 0; c.fw.message('INITIALIZED'); } }) } : null,
];

export const othersPage: ScreenDef = {
  id: 'OTHER/OTHERS',
  fields: () => [intField({ id: 'tap', row: 0, col: 15, width: 2, label: 'Tap averaging:', min: 2, max: 8, get: c => c.m.tapAveraging, set: (c, v) => { c.m.tapAveraging = clamp(v, 2, 8); } })],
  draw(c, f) {
    text(f, 0, 22, 'Display contrast: browser zoom', ATTR_DIM);
    text(f, 1, 0, `Keyboard (${helpPage + 1}/${HELP.length}, HELP turns the page):`, ATTR_DIM);
    HELP[helpPage].forEach((l, i) => text(f, 2 + i, 0, l));
    void c;
  },
  softKeys: footer('OTHERS'),
};
export const initPage: ScreenDef = {
  id: 'OTHER/INIT', fields: () => [],
  draw(c, f) { text(f, 1, 0, 'Initialize ALL PARAMETERS'); text(f, 3, 0, 'Pressing DO IT will initialize!!'); text(f, 5, 0, `${c.m.sounds.length} sounds, ${c.m.sequences.filter(s => s.used).length} sequences in memory.`, ATTR_DIM); },
  softKeys: footer('INIT'),
};
export const verPage: ScreenDef = {
  id: 'OTHER/VER', fields: () => [],
  draw(c, f) { text(f, 1, 0, `Operating system:${OS_VERSION}   2026`); text(f, 3, 0, 'CHOP DECK  integrated rhythm machine'); text(f, 4, 0, '99 seq x 64 tr, 96 ppq, 32 voices, 24 pgm', ATTR_DIM); text(f, 6, 0, `${typeof navigator !== 'undefined' ? navigator.userAgent.split(' ').pop() ?? '' : ''}`.slice(0, 48), ATTR_DIM); void c; },
  softKeys: footer('VER'),
};
export const otherEntry: ScreenDef = { id: 'OTHER', fields: () => [], draw() {}, softKeys: footer('OTHERS'), onEnter(c) { if (!c.s.page.OTHER) c.fw.setPage('OTHERS'); } };
export const otherScreens: ScreenDef[] = [otherEntry, othersPage, initPage, verPage];
