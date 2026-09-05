// The chassis: full-app frame composing every DS control around the LCD
const { Pad, HardButton, Led, Knob, Fader, CursorPad, Panel, Silkscreen, Wordmark } = window.FunMPCDesignSystem_3bf065;
const { useState, useEffect, useRef } = React;

function useSequencer(s, set) {
  useEffect(() => {
    if (!s.playing) return;
    const id = setInterval(() => set(p => ({ ...p, step: p.step + 1, litPads: window.MPC_SEQ[(p.step + 1) % 16] })), (60000 / s.bpm) / 4);
    return () => clearInterval(id);
  }, [s.playing, s.bpm]);
}

function Mpc() {
  const [s, set] = useState({ mode: 'MAIN', seqName: 'FUNKY DRUMMER', program: 'BREAK_93', bpm: 93, loop: true, playing: false, rec: false, step: 0, cursor: 0, chop: 1, lastPad: null, litPads: [], bank: 0, window: null, vol: 72, gain: 40, data: 500 });
  useSequencer(s, set);
  const u = (patch) => set(p => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }));
  const lcdRef = useRef(null); const [lcdW, setLcdW] = useState(560);
  const wrapRef = useRef(null); const [scale, setScale] = useState(1); const [h, setH] = useState(0);
  useEffect(() => { const r = () => { lcdRef.current && setLcdW(lcdRef.current.clientWidth); const w = wrapRef.current; if (w) { const sc = Math.min(1, w.parentElement.clientWidth / 1240); setScale(sc); setH(w.offsetHeight * sc); } }; r(); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const hit = (i) => u(p => ({ lastPad: i, ...(p.mode === 'CHOP' ? { window: { title: 'ASSIGN CHOP', keys: ['', '', '', '', 'CANCEL', 'DO IT'], body: [`CHOP ${String(p.chop + 1).padStart(2, '0')}  ->  PAD ${String(i + 1).padStart(2, '0')} ${window.MPC_PADS[i]}`, '', 'REPLACE SOUND ON PAD?'] } } : {}) }));
  const move = (dir) => u(p => ({ cursor: dir === 'down' || dir === 'right' ? Math.min(5, p.cursor + 1) : Math.max(0, p.cursor - 1) }));
  const data = (v) => u(p => { const d = v - p.data; if (p.mode === 'MAIN' && p.cursor === 0) return { data: v, bpm: Math.max(40, Math.min(240, p.bpm + d / 10)) }; if (p.mode === 'CHOP') return { data: v, chop: Math.max(0, Math.min(7, Math.round(v / 1000 * 7))) }; return { data: v }; });
  const windowKey = (i, k) => u(p => { if (k === 'DO IT' && p.window?.title === 'LOAD A SOUND') return { window: null, program: window.MPC_FILES[p.cursor].replace('.WAV', ''), mode: 'SAMPLE', cursor: 0 }; return { window: null }; });
  const openWindow = () => u(p => p.mode === 'LOAD' ? { window: { title: 'LOAD A SOUND', keys: ['', '', '', '', 'CANCEL', 'DO IT'], body: [`FILE:  ${window.MPC_FILES[p.cursor]}`, 'TYPE:  16 BIT 44.1K STEREO', 'LOAD TO: PROGRAM  BREAK_93'] } } : p.mode === 'MAIN' ? { window: { title: 'SEQUENCE', keys: ['', '', 'RENAME', 'COPY', 'CANCEL', 'DO IT'], body: [`SEQ:01  ${p.seqName}`, `BPM: ${p.bpm.toFixed(1)}   BARS: 1   LOOP: ${p.loop ? 'ON' : 'OFF'}`] } } : {});
  const play = () => u(p => ({ playing: !p.playing, rec: false, litPads: p.playing ? [] : p.litPads }));
  const stop = () => u({ playing: false, rec: false, litPads: [], step: 0 });
  const rec = () => u(p => ({ rec: !p.rec, playing: p.rec ? p.playing : true }));
  const F = (i) => <HardButton key={i} label={`F${i + 1}`} size="sm" onDark active={window.MPC_MODES[i] === s.mode} onClick={() => u({ mode: window.MPC_MODES[i], cursor: 0, window: null })} />;
  const lbl = { fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--cream)', lineHeight: 1 };

  return (
    <div style={{ height: h || 'auto', position: 'relative' }}>
    <div ref={wrapRef} data-screen-label="Chop Deck" style={{ width: 1240, position: 'absolute', left: '50%', top: 0, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center', background: 'var(--navy) var(--texture-grain)', border: '3px solid var(--ink)', borderRadius: 'var(--radius-chassis)', boxShadow: 'var(--chassis-shadow)', padding: 22, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, color: 'var(--cream)' }}>
      {/* LEFT: LCD + F-keys + numerics + transport */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...lbl, fontSize: 9, opacity: .8 }}>INTEGRATED RHYTHM MACHINE · 16 BIT SAMPLER · SEQUENCER · RUNS IN YOUR BROWSER</span>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Led color="green" on={s.playing} label="PLAY" style={{ color: 'var(--cream)' }} /><Led color="red" on={s.rec} label="REC" style={{ color: 'var(--cream)' }} /><Led color="amber" on={!!s.window} label="WINDOW" style={{ color: 'var(--cream)' }} /></div>
        </div>
        <div ref={lcdRef} style={{ position: 'relative' }}>
          <window.MpcLcd s={s} lcdW={lcdW} onSoftKey={(i) => u({ mode: window.MPC_MODES[i], cursor: 0, window: null })} onWindowKey={windowKey} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', padding: '10px 12px 0', justifyItems: 'center' }}>{[0, 1, 2, 3, 4, 5].map(F)}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 20, alignItems: 'start' }}>
          <Panel title="MODE" onDark padding="10px 12px" style={{ minWidth: 'max-content' }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '16px 12px' }}>
            {[['7', 'MIDI'], ['8', 'OTHER'], ['9', 'MIXER'], ['4', 'SAMPLE'], ['5', 'TRIM'], ['6', 'PROGRAM'], ['1', 'SONG'], ['2', 'STEP'], ['3', 'LOAD'], ['SHIFT', ''], ['0', 'ENTER'], ['MAIN', '']].map(([k, m]) => <HardButton key={k} label={m} onDark size="sm" cap={k === 'SHIFT' ? 'dark' : k === 'MAIN' ? 'amber' : 'key'} active={(k === 'MAIN' && s.mode === 'MAIN') || (m === 'LOAD' && s.mode === 'LOAD') || (m === 'SAMPLE' && s.mode === 'SAMPLE') || (m === 'MIXER' && s.mode === 'MIX')} onClick={() => { if (k === 'MAIN') u({ mode: 'MAIN', cursor: 0, window: null }); if (m === 'LOAD') u({ mode: 'LOAD', cursor: 0 }); if (m === 'SAMPLE') u({ mode: 'SAMPLE', cursor: 0 }); if (m === 'MIXER') u({ mode: 'MIX' }); if (m === 'TRIM') u({ mode: 'CHOP' }); }}>{k}</HardButton>)}
          </div></Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <Knob label="DATA" size="lg" ticks={false} min={0} max={1000} value={s.data} onChange={data} onDark />
              <CursorPad onMove={move} onDark />
              <Fader label="NOTE VAR" height={120} onDark />
            </div>
            <div style={{ display: 'flex', gap: 20 }}><HardButton label="WINDOW" cap="amber" onDark onClick={openWindow} /><HardButton label="TAP TEMPO" onDark size="lg" onClick={() => u(p => ({ lastPad: p.lastPad }))} /><HardButton label="UNDO SEQ" onDark onClick={() => u({ window: null })} /><HardButton label="ERASE" onDark /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Panel title="LOCATE" onDark padding="8px 10px"><div style={{ display: 'flex', gap: 10 }}><HardButton label="STEP" onDark size="sm" onClick={() => u(p => ({ step: Math.max(0, p.step - 1) }))}>&lt;</HardButton><HardButton label="" onDark size="sm" onClick={() => u(p => ({ step: p.step + 1 }))}>&gt;</HardButton><HardButton label="GO TO" onDark size="sm" onClick={() => u({ step: 0 })} /><HardButton label="BAR" onDark size="sm">&lt;&lt;</HardButton><HardButton label="" onDark size="sm">&gt;&gt;</HardButton></div></Panel>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <HardButton label="REC" cap="red" led="red" ledOn={s.rec} size="lg" onDark onClick={rec} /><HardButton label="OVER DUB" cap="red" led="red" ledOn={s.rec && s.playing} size="lg" onDark onClick={rec} /><HardButton label="STOP" size="lg" onDark onClick={stop}>■</HardButton><HardButton label="PLAY" size="lg" led="green" ledOn={s.playing} onDark onClick={play}>►</HardButton><HardButton label="PLAY START" size="lg" onDark onClick={() => u({ step: 0, playing: true })} />
            </div>
          </div>
        </div>
      </div>
      {/* RIGHT: brand, knobs, pad bank, pads */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src="../../assets/logo.webp" alt="" style={{ width: 44, height: 44 }} /><Wordmark onDark /></div>
          <div style={{ display: 'flex', gap: 18 }}><Knob label="REC GAIN" size="sm" ticks={false} value={s.gain} onChange={(v) => u({ gain: v })} onDark /><Knob label="MAIN VOLUME" size="sm" ticks={false} value={s.vol} onChange={(v) => u({ vol: v })} onDark /></div>
        </div>
        <Panel title="PAD BANK" onDark padding="8px 12px"><div style={{ display: 'flex', gap: 14, justifyContent: 'space-between' }}>{['A', 'B', 'C', 'D'].map((b, i) => <HardButton key={b} label={b} size="sm" led="green" ledOn={s.bank === i} onDark onClick={() => u({ bank: i })} />)}<HardButton label="FULL LEVEL" size="sm" onDark /><HardButton label="16 LEVELS" size="sm" onDark /></div></Panel>
        <div style={{ background: 'var(--cream)', border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-panel)', padding: 14, boxShadow: 'inset 0 2px 6px rgba(0,0,0,.25)', display: 'grid', gridTemplateColumns: 'repeat(4, var(--pad-size))', gap: 'var(--pad-gap)', justifyContent: 'center' }}>
          {[12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].map(i => <Pad key={i} label={`PAD ${i + 1}`} note={window.MPC_NOTES[i]} lit={s.litPads.includes(i)} onTrigger={() => hit(i)} />)}
        </div>
        <span style={{ ...lbl, opacity: .7, textAlign: 'center' }}>BANK {['A', 'B', 'C', 'D'][s.bank]} · {s.program} · HIT A PAD, PRESS PLAY</span>
      </div>
    </div>
    </div>
  );
}
Object.assign(window, { Mpc });
