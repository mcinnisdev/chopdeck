// The front panel. Composes design-system controls around the LCD and routes everything to the firmware.
import { useEffect, useRef, useState, useSyncExternalStore, CSSProperties } from 'react';
import { Pad, HardButton, Led, Knob, Fader, CursorPad, DataWheel, Keypad, Panel, Wordmark, Lcd } from '@/ds';
import { LcdScreen } from '@/lcd/LcdScreen';
import { HwKey } from '@/kernel/keys';
import { PAD_LETTERS } from '@/kernel/firmware';
import { useFirmware } from './store';
import { useKeyboard, PAD_KEYS } from './useKeyboard';
import { useHostEvents } from './host';
import { AudioEngine } from '@/audio/engine';
import { Tip, useTips } from './Tip';
import { MANUAL_URL, softKeyHelp } from './help';
import { Tour, shouldAutoStartTour } from './Tour';
import { sync, type SyncState } from '@/disk/sync';

/** The account link's text: SIGN IN, or the handle and a one-word sync state. */
function accountLabel(s: SyncState): string {
  if (!s.user) return s.status === 'booting' ? '' : 'SIGN IN';
  const who = s.user.handle ? `@${s.user.handle.toUpperCase()}` : 'ACCOUNT';
  const word = { booting: '', 'signed-out': '', idle: '', syncing: 'SYNCING', synced: 'SYNCED', offline: 'OFFLINE', error: 'SYNC ERROR' }[s.status];
  return word ? `${who} · ${word}` : who;
}
import { fieldHelp } from './field-help';

const CHASSIS_W = 1240;
const LCD_W = 640;
const LCD_INSET = 16;                       // bezel 6 + glass padding 10, see ds/Lcd.tsx
const LCD_COL = (LCD_W - 2 * LCD_INSET) / 48; // one character cell of the 48-column grid
const BANKS = ['A', 'B', 'C', 'D'] as const;
const HOTKEYS = PAD_KEYS.map(code => code.replace('Key', '').replace('Digit', ''));

export function Chassis({ engine }: { engine: AudioEngine }) {
  const fw = useFirmware();
  useKeyboard(fw);
  useHostEvents(fw, engine);
  const s = fw.s;
  const frame = fw.render();
  const soft = fw.softKeyLabels();

  // scale the fixed-width chassis to the viewport
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(0);
  useEffect(() => {
    const r = () => { const w = wrapRef.current; if (!w?.parentElement) return; const sc = Math.min(1, w.parentElement.clientWidth / CHASSIS_W); setScale(sc); setH(w.offsetHeight * sc); };
    r();
    const ro = new ResizeObserver(r); if (wrapRef.current?.parentElement) ro.observe(wrapRef.current.parentElement);
    return () => ro.disconnect();
  }, []);

  const key = (k: HwKey) => ({ onPress: () => fw.key(k, true), onRelease: () => fw.key(k, false) });
  const lbl: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--cream)', lineHeight: 1 };
  const [vol, setVol] = useState(80);
  const [gain, setGain] = useState(40);
  useEffect(() => { engine.setVolume(Math.pow(vol / 100, 1.5)); }, [vol, engine]);
  const padProgram = fw.m.programs[fw.m.drums[s.drum].pgm];
  const tips = useTips();
  const [tour, setTour] = useState(shouldAutoStartTour);
  const syncState = useSyncExternalStore(fn => sync.subscribe(fn), () => sync.snapshot);

  return (
    <div style={{ height: h || 'auto', position: 'relative' }}>
      <Tour open={tour} onClose={() => setTour(false)} />
      <div ref={wrapRef} style={{ width: CHASSIS_W, position: 'absolute', left: '50%', top: 0, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center', background: 'var(--navy) var(--texture-grain)', border: '3px solid var(--ink)', borderRadius: 'var(--radius-chassis)', boxShadow: 'var(--chassis-shadow)', padding: 22, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, color: 'var(--cream)' }}>

        {/* ---------- LEFT: LCD, F-keys, mode block, wheel, transport ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...lbl, opacity: .8 }}>
              INTEGRATED RHYTHM MACHINE · 16 BIT SAMPLER · SEQUENCER ·{' '}
              <Tip id="quickStart"><button type="button" onClick={() => setTour(true)} style={{ ...lbl, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--led-amber)', borderBottom: '1px solid var(--led-amber)' }}>QUICK START</button></Tip>
              {' · '}
              <Tip id="manual"><a href={MANUAL_URL} target="_blank" rel="noopener" style={{ color: 'var(--led-amber)', textDecoration: 'none', borderBottom: '1px solid var(--led-amber)' }}>OWNER'S MANUAL</a></Tip>
              {' · '}
              <Tip id="tips"><button type="button" aria-pressed={tips.enabled} onClick={() => tips.setEnabled(!tips.enabled)} style={{ ...lbl, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: tips.enabled ? 'var(--led-amber)' : 'var(--cream)', opacity: tips.enabled ? 1 : .6, borderBottom: '1px solid currentColor' }}>TIPS {tips.enabled ? 'ON' : 'OFF'}</button></Tip>
              {' · '}
              <Tip id="account"><a href="/account/" data-sync={syncState.status} style={{ color: syncState.user ? 'var(--cream)' : 'var(--led-amber)', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>{accountLabel(syncState)}</a></Tip>
            </span>
            <div style={{ display: 'flex', gap: 14 }}>
              <Led color="green" on={s.playing} label="PLAY" style={{ color: 'var(--cream)' }} />
              <Led color="red" on={s.record !== 'OFF'} label="REC" style={{ color: 'var(--cream)' }} />
              <Led color="amber" on={s.windows.length > 0 || !!s.nameEdit} label="WINDOW" style={{ color: 'var(--cream)' }} />
            </div>
          </div>

          {/* the display sits in the panel like the hardware's: fixed width, F-keys aligned beneath it */}
          <div style={{ width: LCD_W, margin: '0 auto' }}>
            <Lcd style={{ width: '100%' }}>
              <LcdScreen frame={frame} onSoftKey={i => { const k = `F${i + 1}` as HwKey; fw.key(k, true); fw.key(k, false); }}
                onSoftKeyHover={(i, el) => { if (i == null) { tips.hide(); return; } const entry = softKeyHelp(soft[i]?.label ?? '', i); if (entry) tips.show(entry, el); }}
                onCellHover={(cell, el) => {
                  if (!cell) { tips.hide(); return; }
                  const hit = fw.fieldAt(cell.row, cell.col);
                  if (!hit) { tips.hide(); return; }
                  tips.show(fieldHelp(hit.def.id, hit.field.id, hit.field.label, fw.s.mode, hit.field.get(fw.ctx())), el);
                }} />
            </Lcd>
            {/* F keys sit under the centre of each soft-key label: labels are 7 columns wide at the start of an 8-column slot,
                and the text grid starts one bezel (6) plus one glass padding (10) in from the display's edge */}
            <Tip id="f" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', padding: `10px ${LCD_INSET + LCD_COL / 2}px 0 ${LCD_INSET - LCD_COL / 2}px`, justifyItems: 'center' }}>
              {[0, 1, 2, 3, 4, 5].map(i => <HardButton key={i} label={`F${i + 1}`} size="sm" onDark disabled={!soft[i]?.label} {...key(`F${i + 1}` as HwKey)} />)}
            </Tip>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 18, alignItems: 'start' }}>
            {/* MODE block */}
            <Tip id="mode">
              <Panel title="MODE" onDark padding="10px 12px" style={{ minWidth: 'max-content' }}>
                <Keypad onDark shiftHeld={s.shift} onKey={k => fw.key(k, true)} onKeyRelease={k => fw.key(k, false)} />
              </Panel>
            </Tip>

            {/* centre: MAIN/WINDOW, DATA wheel, cursor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <Tip id="main"><HardButton label="MAIN SCREEN" onDark active={s.mode === 'MAIN' && !s.windows.length} {...key('MAIN')} /></Tip>
                <Tip id="window"><HardButton label="OPEN WINDOW" cap="amber" onDark active={s.windows.length > 0} {...key('WINDOW')} /></Tip>
              </div>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <Tip id="data"><DataWheel label="DATA" onDark onTurn={d => fw.wheel(d)} /></Tip>
                <Tip id="cursor"><CursorPad onDark onMove={d => fw.key(d.toUpperCase() as HwKey)} /></Tip>
              </div>
            </div>

            {/* right: note variation, tap, undo, erase */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Tip id="after"><HardButton label="AFTER" shiftLabel="ASSIGN" size="sm" onDark led="red" ledOn={s.after} {...key('AFTER')} /></Tip>
                <Tip id="nv"><Fader label="NOTE VARIATION" height={110} onDark value={s.nvValue} onChange={v => fw.slider(v)} /></Tip>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Tip id="tap"><HardButton label="TAP TEMPO" shiftLabel="NOTE REPEAT" size="lg" onDark {...key('TAP')} /></Tip>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Tip id="undo"><HardButton label="UNDO SEQ" onDark led="red" ledOn={s.undoAvailable} {...key('UNDO')} /></Tip>
                  <Tip id="erase"><HardButton label="ERASE" onDark {...key('ERASE')} /></Tip>
                </div>
              </div>
            </div>
          </div>

          {/* LOCATE + transport */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Panel title="LOCATE" onDark padding="8px 10px">
              <div style={{ display: 'flex', gap: 10 }}>
                <Tip id="step"><HardButton label="STEP" shiftLabel="EVENT" onDark size="sm" {...key('STEP_L')}>&lt;</HardButton></Tip>
                <Tip id="step"><HardButton label="" onDark size="sm" {...key('STEP_R')}>&gt;</HardButton></Tip>
                <Tip id="goto"><HardButton label="GO TO" onDark size="sm" {...key('GOTO')} /></Tip>
                <Tip id="bar"><HardButton label="BAR" shiftLabel="START" onDark size="sm" {...key('BAR_L')}>&lt;&lt;</HardButton></Tip>
                <Tip id="bar"><HardButton label="" shiftLabel="END" onDark size="sm" {...key('BAR_R')}>&gt;&gt;</HardButton></Tip>
              </div>
            </Panel>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <Tip id="rec"><HardButton label="REC" cap="red" led="red" ledOn={s.record === 'REC'} size="lg" onDark {...key('REC')} /></Tip>
              <Tip id="overdub"><HardButton label="OVER DUB" cap="red" led="red" ledOn={s.record === 'OVERDUB'} size="lg" onDark {...key('OVERDUB')} /></Tip>
              <Tip id="stop"><HardButton label="STOP" size="lg" onDark {...key('STOP')}>■</HardButton></Tip>
              <Tip id="play"><HardButton label="PLAY" size="lg" led="green" ledOn={s.playing} onDark {...key('PLAY')}>►</HardButton></Tip>
              <Tip id="playStart"><HardButton label="PLAY START" size="lg" width={56} onDark {...key('PLAY_START')} /></Tip>
            </div>
          </div>
        </div>

        {/* ---------- RIGHT: brand, knobs, bank, pads ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src="/logo.webp" alt="" style={{ width: 44, height: 44 }} /><Wordmark onDark /></div>
            <div style={{ display: 'flex', gap: 18 }}>
              <Tip id="recGain"><Knob label="REC GAIN" size="sm" ticks={false} value={gain} onChange={setGain} onDark /></Tip>
              <Tip id="volume"><Knob label="MAIN VOLUME" size="sm" ticks={false} value={vol} onChange={setVol} onDark /></Tip>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'space-between', alignItems: 'stretch' }}>
            <Panel title="" onDark padding="6px 10px"><div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '8px 12px' }}>
              <Tip id="fullLevel"><HardButton label="FULL LEVEL" size="sm" onDark led="red" ledOn={s.fullLevel} {...key('FULL_LEVEL')} /></Tip>
              <Tip id="sixteenLevels"><HardButton label="16 LEVELS" size="sm" onDark led="red" ledOn={s.sixteenLevels} {...key('SIXTEEN_LEVELS')} /></Tip>
              <Tip id="nextSeq"><HardButton label="NEXT SEQ" size="sm" onDark active={s.mode === 'NEXT_SEQ'} {...key('NEXT_SEQ')} /></Tip>
              <Tip id="trackMute"><HardButton label="TRACK MUTE" size="sm" onDark active={s.mode === 'TRACK_MUTE'} {...key('TRACK_MUTE')} /></Tip>
            </div></Panel>
            <Tip id="bank"><Panel title="PAD BANK" onDark padding="6px 12px" style={{ display: 'flex', alignItems: 'center' }}><div style={{ display: 'flex', gap: 14 }}>
              {BANKS.map((b, i) => <HardButton key={b} label={b} size="sm" led="green" ledOn={s.padBank === i} onDark {...key(`BANK_${b}` as HwKey)} />)}
            </div></Panel></Tip>
          </div>

          <Tip id="pads" style={{ display: 'block' }}>
            <div style={{ background: 'var(--cream)', border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-panel)', padding: 14, boxShadow: 'inset 0 2px 6px rgba(0,0,0,.25)', display: 'grid', gridTemplateColumns: 'repeat(4, var(--pad-size))', gap: 'var(--pad-gap)', justifyContent: 'center' }}>
              {[12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].map(i => {
                const slot = s.padBank * 16 + i;
                return <Pad key={i} label={`PAD ${i + 1}`} note={String(padProgram.padToNote[slot])} letters={PAD_LETTERS[i].slice(0, 2)} hotkey={HOTKEYS[i]} lit={s.litPads.has(slot) || s.padsDown.has(slot)}
                  onTrigger={v => fw.padDown(slot, v)} onRelease={() => fw.padUp(slot)} onPressure={p => fw.padPressure(slot, p)} />;
              })}
            </div>
          </Tip>
          <span style={{ ...lbl, opacity: .7, textAlign: 'center' }}>BANK {BANKS[s.padBank]} · {padProgram.name} · HIT A PAD, PRESS PLAY</span>
          {/* the kit library and publishing live on Chop Deck pages; these links are the pads' doorway to them */}
          <span style={{ ...lbl, textAlign: 'center' }}>
            <Tip id="kits"><a href="/kits/" style={{ color: 'var(--led-amber)', textDecoration: 'none', borderBottom: '1px solid var(--led-amber)' }}>KITS LIBRARY</a></Tip>
            {' · '}
            <Tip id="samples"><a href="/samples/" style={{ color: 'var(--led-amber)', textDecoration: 'none', borderBottom: '1px solid var(--led-amber)' }}>SAMPLES LIBRARY</a></Tip>
            {' · '}
            <Tip id="publishKit"><a href={`/kits/publish/?pgm=${fw.m.drums[s.drum].pgm}`} style={{ color: 'var(--led-amber)', textDecoration: 'none', borderBottom: '1px solid var(--led-amber)' }}>PUBLISH THIS KIT</a></Tip>
          </span>
        </div>
      </div>
    </div>
  );
}
