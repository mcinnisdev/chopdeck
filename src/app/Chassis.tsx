// The front panel. Composes design-system controls around the LCD and routes everything to the firmware.
import { useEffect, useRef, useState, CSSProperties } from 'react';
import { Pad, HardButton, Led, Knob, Fader, CursorPad, DataWheel, Keypad, Panel, Wordmark, Lcd } from '@/ds';
import { LcdScreen } from '@/lcd/LcdScreen';
import { HwKey } from '@/kernel/keys';
import { PAD_LETTERS } from '@/kernel/firmware';
import { useFirmware } from './store';
import { useKeyboard } from './useKeyboard';
import { useHostEvents } from './host';
import { AudioEngine } from '@/audio/engine';

const CHASSIS_W = 1240;
const BANKS = ['A', 'B', 'C', 'D'] as const;

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

  return (
    <div style={{ height: h || 'auto', position: 'relative' }}>
      <div ref={wrapRef} style={{ width: CHASSIS_W, position: 'absolute', left: '50%', top: 0, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center', background: 'var(--navy) var(--texture-grain)', border: '3px solid var(--ink)', borderRadius: 'var(--radius-chassis)', boxShadow: 'var(--chassis-shadow)', padding: 22, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, color: 'var(--cream)' }}>

        {/* ---------- LEFT: LCD, F-keys, mode block, wheel, transport ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...lbl, opacity: .8 }}>INTEGRATED RHYTHM MACHINE · 16 BIT SAMPLER · SEQUENCER · RUNS IN YOUR BROWSER</span>
            <div style={{ display: 'flex', gap: 14 }}>
              <Led color="green" on={s.playing} label="PLAY" style={{ color: 'var(--cream)' }} />
              <Led color="red" on={s.record !== 'OFF'} label="REC" style={{ color: 'var(--cream)' }} />
              <Led color="amber" on={s.windows.length > 0 || !!s.nameEdit} label="WINDOW" style={{ color: 'var(--cream)' }} />
            </div>
          </div>

          <div>
            <Lcd style={{ width: '100%' }}>
              <LcdScreen frame={frame} onSoftKey={i => { const k = `F${i + 1}` as HwKey; fw.key(k, true); fw.key(k, false); }} />
            </Lcd>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', padding: '10px 12px 0', justifyItems: 'center' }}>
              {[0, 1, 2, 3, 4, 5].map(i => <HardButton key={i} label={`F${i + 1}`} size="sm" onDark disabled={!soft[i]?.label} {...key(`F${i + 1}` as HwKey)} />)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 18, alignItems: 'start' }}>
            {/* MODE block */}
            <Panel title="MODE" onDark padding="10px 12px" style={{ minWidth: 'max-content' }}>
              <Keypad onDark shiftHeld={s.shift} onKey={k => fw.key(k, true)} onKeyRelease={k => fw.key(k, false)} />
            </Panel>

            {/* centre: MAIN/WINDOW, DATA wheel, cursor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <HardButton label="MAIN SCREEN" onDark active={s.mode === 'MAIN' && !s.windows.length} {...key('MAIN')} />
                <HardButton label="OPEN WINDOW" cap="amber" onDark active={s.windows.length > 0} {...key('WINDOW')} />
              </div>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <DataWheel label="DATA" onDark onTurn={d => fw.wheel(d)} />
                <CursorPad onDark onMove={d => fw.key(d.toUpperCase() as HwKey)} />
              </div>
            </div>

            {/* right: note variation, tap, undo, erase */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <HardButton label="AFTER" shiftLabel="ASSIGN" size="sm" onDark led="red" ledOn={s.after} {...key('AFTER')} />
                <Fader label="NOTE VARIATION" height={110} onDark value={s.nvValue} onChange={v => fw.slider(v)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <HardButton label="TAP TEMPO" shiftLabel="NOTE REPEAT" size="lg" onDark {...key('TAP')} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <HardButton label="UNDO SEQ" onDark led="red" ledOn={s.undoAvailable} {...key('UNDO')} />
                  <HardButton label="ERASE" onDark {...key('ERASE')} />
                </div>
              </div>
            </div>
          </div>

          {/* LOCATE + transport */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Panel title="LOCATE" onDark padding="8px 10px">
              <div style={{ display: 'flex', gap: 10 }}>
                <HardButton label="STEP" shiftLabel="EVENT" onDark size="sm" {...key('STEP_L')}>&lt;</HardButton>
                <HardButton label="" onDark size="sm" {...key('STEP_R')}>&gt;</HardButton>
                <HardButton label="GO TO" onDark size="sm" {...key('GOTO')} />
                <HardButton label="BAR" shiftLabel="START" onDark size="sm" {...key('BAR_L')}>&lt;&lt;</HardButton>
                <HardButton label="" shiftLabel="END" onDark size="sm" {...key('BAR_R')}>&gt;&gt;</HardButton>
              </div>
            </Panel>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <HardButton label="REC" cap="red" led="red" ledOn={s.record === 'REC'} size="lg" onDark {...key('REC')} />
              <HardButton label="OVER DUB" cap="red" led="red" ledOn={s.record === 'OVERDUB'} size="lg" onDark {...key('OVERDUB')} />
              <HardButton label="STOP" size="lg" onDark {...key('STOP')}>■</HardButton>
              <HardButton label="PLAY" size="lg" led="green" ledOn={s.playing} onDark {...key('PLAY')}>►</HardButton>
              <HardButton label="PLAY START" size="lg" width={56} onDark {...key('PLAY_START')} />
            </div>
          </div>
        </div>

        {/* ---------- RIGHT: brand, knobs, bank, pads ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src="/logo.webp" alt="" style={{ width: 44, height: 44 }} /><Wordmark onDark /></div>
            <div style={{ display: 'flex', gap: 18 }}>
              <Knob label="REC GAIN" size="sm" ticks={false} value={gain} onChange={setGain} onDark />
              <Knob label="MAIN VOLUME" size="sm" ticks={false} value={vol} onChange={setVol} onDark />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'space-between', alignItems: 'stretch' }}>
            <Panel title="" onDark padding="6px 10px"><div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '8px 12px' }}>
              <HardButton label="FULL LEVEL" size="sm" onDark led="red" ledOn={s.fullLevel} {...key('FULL_LEVEL')} />
              <HardButton label="16 LEVELS" size="sm" onDark led="red" ledOn={s.sixteenLevels} {...key('SIXTEEN_LEVELS')} />
              <HardButton label="NEXT SEQ" size="sm" onDark active={s.mode === 'NEXT_SEQ'} {...key('NEXT_SEQ')} />
              <HardButton label="TRACK MUTE" size="sm" onDark active={s.mode === 'TRACK_MUTE'} {...key('TRACK_MUTE')} />
            </div></Panel>
            <Panel title="PAD BANK" onDark padding="6px 12px" style={{ display: 'flex', alignItems: 'center' }}><div style={{ display: 'flex', gap: 14 }}>
              {BANKS.map((b, i) => <HardButton key={b} label={b} size="sm" led="green" ledOn={s.padBank === i} onDark {...key(`BANK_${b}` as HwKey)} />)}
            </div></Panel>
          </div>

          <div style={{ background: 'var(--cream)', border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-panel)', padding: 14, boxShadow: 'inset 0 2px 6px rgba(0,0,0,.25)', display: 'grid', gridTemplateColumns: 'repeat(4, var(--pad-size))', gap: 'var(--pad-gap)', justifyContent: 'center' }}>
            {[12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].map(i => {
              const slot = s.padBank * 16 + i;
              return <Pad key={i} label={`PAD ${i + 1}`} note={String(fw.m.programs[fw.m.drums[s.drum].pgm].padToNote[slot])} letters={PAD_LETTERS[i].slice(0, 2)} lit={s.litPads.has(slot) || s.lastPad === slot && s.playing}
                onTrigger={v => fw.padDown(slot, v)} onRelease={() => fw.padUp(slot)} onPressure={p => fw.padPressure(slot, p)} />;
            })}
          </div>
          <span style={{ ...lbl, opacity: .7, textAlign: 'center' }}>BANK {BANKS[s.padBank]} · {fw.m.programs[fw.m.drums[s.drum].pgm].name} · HIT A PAD, PRESS PLAY</span>
        </div>
      </div>
    </div>
  );
}
