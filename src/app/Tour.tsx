// Quick start: a guided walk around the front panel. A spotlight sits on one control at a time with a
// silkscreen plate beside it; the rest of the machine stays live so the visitor can try each step.
// Opens by itself on the first visit and any time from the QUICK START link in the header.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { MANUAL_URL } from './help';

export const TOUR_KEY = 'chopdeck.tour';
/** True when this browser has never finished or skipped the tour. */
export function shouldAutoStartTour(): boolean { try { return localStorage.getItem(TOUR_KEY) !== 'done'; } catch { return true; } }
function markSeen() { try { localStorage.setItem(TOUR_KEY, 'done'); } catch { /* private mode */ } }

export interface TourStep { title: string; text: string; keys?: string; target: string | null; anchor: string }

export const TOUR_STEPS: TourStep[] = [
  { title: 'Welcome to Chop Deck', target: '[data-tip=play]', anchor: 'quick-start',
    text: 'This is a drum machine: sixteen pads, a small green screen, a sequencer behind it. A demo beat is already loaded. Press PLAY to hear it and STOP when you have had enough. The machine keeps running while this tour is open, so try everything as you go.',
    keys: 'Space plays and stops. Shift+Space plays from the start.' },
  { title: 'Hit the pads', target: '[data-tip=pads]', anchor: 'pads',
    text: 'The pads play the sounds of the current program. Strike near the bottom edge for a soft hit, near the top for a hard one. FULL LEVEL makes every hit loud; 16 LEVELS spreads one sound over the pads at sixteen velocities. PAD BANK A to D gives you four sets of sixteen.',
    keys: 'Z X C V = pads 1 to 4, A S D F = 5 to 8, Q W E R = 9 to 12, 1 2 3 4 = 13 to 16.' },
  { title: 'The screen is the whole interface', target: '[role=region][aria-label=LCD]', anchor: 'lcd',
    text: 'Everything you can change is a field on the LCD. The reversed block is the cursor. The bottom line names the six soft keys under the glass: press the word to press the key. There are no menus outside the machine.',
    keys: 'F1 to F6 press the soft keys.' },
  { title: 'Cursor and DATA wheel', target: '[data-tip=data]', anchor: 'cursor',
    text: 'Move the cursor between fields, then turn the DATA wheel to change the value. Numbers can also be typed on the keypad and confirmed with ENTER. OPEN WINDOW shows the settings behind the field under the cursor. Try it: put the cursor on the tempo and turn the wheel while the beat plays.',
    keys: 'Arrow keys move the cursor, [ and ] turn the wheel, Enter confirms a typed number.' },
  { title: 'Modes live on the keypad', target: '[data-tip=mode]', anchor: 'modes',
    text: 'Hold SHIFT and press a number to change mode, as printed above each key: 3 LOAD, 4 SAMPLE, 5 TRIM, 6 PROGRAM, 7 MIXER, 0 SAVE and so on. MAIN SCREEN always brings you back to the sequencer.',
    keys: 'Shift + a number on the top row of your keyboard.' },
  { title: 'Bring your own sounds', target: '[role=region][aria-label=LCD]', anchor: 'loading',
    text: 'Drag WAV, AIFF, MP3 or other audio files from your computer and drop them anywhere on the machine. They land in the import tray of LOAD mode (SHIFT+3). Pick a file, press DO IT, audition it with PLAY, then KEEP to place it on a pad. PICK opens a file chooser if you would rather browse.',
    keys: 'Drop files anywhere on the panel.' },
  { title: 'Sample from the microphone', target: '[data-tip=recGain]', anchor: 'sampling',
    text: 'SAMPLE mode (SHIFT+4) records from your microphone or line input. Set the REC GAIN, press RECORD, and the machine starts when the level passes the threshold. STOP, name it, and it is a sound like any other.',
    keys: 'The browser will ask for microphone permission the first time.' },
  { title: 'Chop a break onto the pads', target: '[role=region][aria-label=LCD]', anchor: 'zone',
    text: 'TRIM mode (SHIFT+5) shows the waveform. Set St and End around the part you want, go to the ZONE page, open the window on the Zone field to choose how many slices, then EDIT and SLICE SOUND to put each zone on its own pad in a new program. The demo program BREAK CHOPS was made exactly this way.',
    keys: 'PLAY X auditions the selection.' },
  { title: 'Record a beat', target: '[data-tip=rec]', anchor: 'recording',
    text: 'Hold REC and press PLAY START. After a one-bar count-in the sequence loops and every pad you hit is recorded with timing correction from the Timing field. Keep playing over the loop to add more; press STOP when you are done. UNDO SEQ takes back the last pass, and ERASE removes notes while it runs.',
    keys: 'F7 = REC, F8 = OVER DUB, F9 = STOP, F10 = PLAY.' },
  { title: 'Save your work', target: '[data-tip=mode]', anchor: 'disk',
    text: 'Everything autosaves to this browser, so closing the tab is safe. SAVE mode (SHIFT+0) also writes projects, sequences, programs and sounds to the built-in drive, or downloads them as files you can keep or share. LOAD brings them back.',
    keys: 'A .CHOPDECK file holds the whole machine.' },
  { title: 'That is the tour', target: '[data-tip=manual]', anchor: 'quick-start',
    text: 'Hover any control for a short explanation with a link into the Owner\'s Manual, and switch TIPS off when you no longer need them. The manual covers every mode and window in the order they appear on the machine. Come back to this tour any time from QUICK START.',
    keys: 'Alt+click a control to open its manual section.' },
];

interface Box { x: number; y: number; w: number; h: number }
const PAD = 8;

function measure(sel: string | null): Box | null {
  if (!sel) return null;
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

export function Tour({ open, onClose }: { open: boolean; onClose(): void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[i];

  useEffect(() => { if (open) setI(0); }, [open]);

  // follow the target every frame while open: the chassis rescales, the page scrolls, and the LCD
  // font arriving late pushes everything under it down. Only re-render when the box actually moves.
  useEffect(() => {
    if (!open) return;
    let raf = 0, last = '';
    const tick = () => {
      const b = measure(step.target);
      const key = b ? `${b.x},${b.y},${b.w},${b.h}` : '';
      if (key !== last) { last = key; setBox(b); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, step]);

  // place the plate beside the spotlight, inside the viewport
  useLayoutEffect(() => {
    if (!open || !card.current) return;
    const cw = card.current.offsetWidth, ch = card.current.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight, m = 12;
    if (!box) { setPos({ left: (vw - cw) / 2, top: Math.max(m, (vh - ch) / 2) }); return; }
    let top = box.y + box.h + 14;
    if (top + ch > vh - m) top = box.y - ch - 14;
    if (top < m) top = Math.min(vh - ch - m, Math.max(m, box.y + box.h / 2 - ch / 2));
    let left = box.x + box.w / 2 - cw / 2;
    // beside the target when there is no room above or below
    if (box.y + box.h + 14 + ch > vh - m && box.y - ch - 14 < m) left = box.x + box.w + 14 + cw <= vw - m ? box.x + box.w + 14 : box.x - cw - 14;
    left = Math.min(vw - cw - m, Math.max(m, left));
    setPos({ left, top });
  }, [open, box, i]);

  // Escape closes; every other key keeps working the machine
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); finish(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open) return null;
  const finish = () => { markSeen(); onClose(); };
  const last = i === TOUR_STEPS.length - 1;
  const label: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' };
  const btn: CSSProperties = { ...label, background: 'var(--ink)', color: 'var(--cream)', border: '2px solid var(--ink)', borderRadius: 'var(--radius-key)', padding: '6px 12px', cursor: 'pointer', boxShadow: '0 2px 0 var(--ink-3)' };
  const ghost: CSSProperties = { ...btn, background: 'transparent', color: 'var(--ink)', boxShadow: 'none' };

  return createPortal(
    <div role="dialog" aria-label="Quick start" aria-modal="false" style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }}>
      {box && (
        <div aria-hidden style={{ position: 'fixed', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 10, border: '3px solid var(--led-amber)', boxShadow: '0 0 0 200vmax rgba(0,0,0,.55), 0 0 18px var(--led-amber)', transition: 'left .25s, top .25s, width .25s, height .25s' }} />
      )}
      {!box && <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)' }} />}
      <div ref={card} style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: 360, pointerEvents: 'auto', zIndex: 61,
        background: 'var(--cream)', color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: 'var(--radius-key)', boxShadow: '0 4px 0 var(--ink), 0 12px 30px rgba(0,0,0,.4)',
        padding: '10px 12px 12px', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ ...label, color: 'var(--red-deep)' }}>Quick start · step {i + 1} of {TOUR_STEPS.length}</span>
          <button type="button" onClick={finish} style={{ ...ghost, padding: '2px 4px', fontSize: 10 }}>Skip</button>
        </div>
        <div style={{ ...label, fontSize: 13, marginBottom: 6 }}>{step.title}</div>
        <div>{step.text}</div>
        {step.keys && <div style={{ marginTop: 6, fontFamily: 'var(--font-lcd, monospace)', fontSize: 15, lineHeight: 1.2, background: 'var(--lcd)', color: 'var(--lcd-ink)', padding: '4px 8px', borderRadius: 3 }}>{step.keys}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
          <a href={`${MANUAL_URL}#${step.anchor}`} target="_blank" rel="noopener" style={{ ...label, color: 'var(--red-deep)', textDecoration: 'none', borderBottom: '1px solid currentColor', fontSize: 10 }}>Manual ▸ #{step.anchor}</a>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} style={{ ...ghost, opacity: i === 0 ? .35 : 1 }}>Back</button>
            <button type="button" onClick={() => last ? finish() : setI(i + 1)} style={btn}>{last ? 'Finish' : 'Next'}</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
