// The EZ panel: the same machine behind a simple front. Reads the firmware's machine and session, calls
// the same kernel methods the OG screens use, and owns nothing of its own beyond what is on screen.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useFirmware } from '@/app/store';
import { useKeyboard, PAD_KEYS } from '@/app/useKeyboard';
import { useHostEvents } from '@/app/host';
import { AudioEngine } from '@/audio/engine';
import { sync } from '@/disk/sync';
import { panel } from '@/app/panel';
import { accountLabel } from '@/app/account-label';
import { MANUAL_URL } from '@/app/help';
import { padNames, programSounds } from '@/disk/kit';
import { encodeProject, decodeProject } from '@/disk/formats';
import { tickToBBT } from '@/model/time';
import { TEMPO_MIN, TEMPO_MAX } from '@/model/types';
import { Wordmark } from '@/ds';
import { EzPad } from './EzPad';

const HOTKEYS = PAD_KEYS.map(code => code.replace('Key', '').replace('Digit', ''));
const PATTERNS = 8;

const label: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const silk: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--cream)', lineHeight: 1 };
const amber: CSSProperties = { color: 'var(--led-amber)', textDecoration: 'none', borderBottom: '1px solid var(--led-amber)' };
const plate: CSSProperties = { background: 'var(--cream)', border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-panel)', padding: 14, boxShadow: 'inset 0 2px 6px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', gap: 10 };

function Big({ children, on, red, onClick, ariaLabel, disabled }: { children: ReactNode; on?: boolean; red?: boolean; onClick(): void; ariaLabel: string; disabled?: boolean }) {
  const style: CSSProperties = {
    fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', padding: '14px 12px', minWidth: 96, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .45 : 1,
    background: on ? 'var(--led-amber)' : red ? 'var(--red)' : 'var(--cream-2, #f1e6c8)', color: on ? 'var(--ink)' : red ? 'var(--cream)' : 'var(--ink)',
    border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-key)', boxShadow: '0 3px 0 var(--ink)', touchAction: 'manipulation',
  };
  return <button type="button" aria-label={ariaLabel} aria-pressed={on ?? undefined} disabled={disabled} onClick={onClick} style={style}>{children}</button>;
}

export function EzPanel({ engine }: { engine: AudioEngine }) {
  const fw = useFirmware();
  useKeyboard(fw);
  useHostEvents(fw, engine);
  const s = fw.s, m = fw.m;
  const q = m.sequences[s.seq];
  const pgm = m.drums[0].pgm;
  const program = m.programs[pgm];
  const names = padNames(m, program);
  const syncState = useSyncExternalStore(fn => sync.subscribe(fn), () => sync.snapshot);
  const standalone = syncState.status === 'standalone';
  const bbt = tickToBBT(q.tsigs, Math.max(0, s.now));
  const [tempoText, setTempoText] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; machine: ReturnType<typeof decodeProject> } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 4000); return () => clearTimeout(t); } }, [note]);

  const commitTempo = () => { if (tempoText != null) { const v = Number(tempoText); if (!isNaN(v)) fw.setTempo(v); setTempoText(null); } };
  const kits = m.programs.map((p, i) => ({ p, i })).filter(x => x.i === pgm || programSounds(m, x.p).length > 0);

  const save = () => {
    const name = `${(q.name.trim() || 'CHOPDECK').replace(/[^A-Za-z0-9_-]+/g, '_').toUpperCase().slice(0, 16)}.CHOPDECK`;
    fw.host.download(name, encodeProject(m, s.masterTempo), 'application/zip');
    setNote(`Saved ${name}`);
  };
  const pick = async (f: File) => {
    const p = decodeProject(new Uint8Array(await f.arrayBuffer()));
    if (!p) { setNote('That is not a Chop Deck project file.'); return; }
    setPending({ name: f.name, machine: p });
  };

  return (
    <div role="region" aria-label="EZ panel" style={{ maxWidth: 1180, margin: '0 auto', background: 'var(--navy) var(--texture-grain)', border: '3px solid var(--ink)', borderRadius: 'var(--radius-chassis)', boxShadow: 'var(--chassis-shadow)', padding: 18, boxSizing: 'border-box', color: 'var(--cream)' }}>
      <style>{`.ez-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,440px);gap:16px}@media(max-width:900px){.ez-grid{grid-template-columns:1fr}.ez-head-links{display:none}}`}</style>

      {/* header: the same silkscreen line as OG, with the panel switch */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Wordmark size="sm" />
          <span style={{ ...silk, opacity: .85 }}>
            <button type="button" aria-label="OG" onClick={() => panel.set('og')} style={{ ...silk, background: 'none', border: 0, padding: 0, cursor: 'pointer', ...amber }}>OG</button>
            {' · '}<span aria-current="true" style={{ borderBottom: '1px solid var(--cream)' }}>EZ</span>
            {' · '}<a href={MANUAL_URL} target="_blank" rel="noopener" style={amber}>MANUAL</a>
            {!standalone && <>{' · '}<a href="/account/" data-sync={syncState.status} style={{ ...amber, color: syncState.user ? 'var(--cream)' : 'var(--led-amber)', borderBottomColor: 'currentColor' }}>{accountLabel(syncState)}</a></>}
          </span>
        </div>
        {!standalone && <span className="ez-head-links" style={{ ...silk, opacity: .85 }}>
          <a href="/kits/" style={amber}>KITS</a>{' · '}<a href="/samples/" style={amber}>SAMPLES</a>{' · '}<a href="/beats/" style={amber}>BEATS</a>{' · '}<a href="/publish/" style={amber}>PUBLISH</a>
        </span>}
      </div>

      <div className="ez-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* transport */}
          <div style={{ ...plate, color: 'var(--ink)' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Big ariaLabel="Play" on={s.playing && s.record === 'OFF'} onClick={() => (s.playing ? fw.transport.stop() : fw.transport.play(false))}>{s.playing ? '■ Stop' : '► Play'}</Big>
              <Big ariaLabel="Stop" onClick={() => fw.transport.stop()}>■ Stop</Big>
              <Big ariaLabel="Record" red on={s.record !== 'OFF'} onClick={() => (s.record !== 'OFF' ? fw.transport.stop() : fw.recordFromStart())}>● Record</Big>
              <Big ariaLabel="Undo" disabled={!s.undoAvailable} onClick={() => fw.key('UNDO', true)}>Undo</Big>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-lcd)', fontSize: 26, background: 'var(--lcd)', color: 'var(--lcd-ink)', padding: '4px 12px', borderRadius: 3, minWidth: 110, textAlign: 'center' }} aria-label="Position">{String(bbt.bar).padStart(3, '0')}.{String(bbt.beat).padStart(2, '0')}</span>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={label}>Tempo</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button type="button" aria-label="Slower" onClick={() => fw.setTempo(fw.tempo() - 1)} style={{ ...label, padding: '8px 10px', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--white)', cursor: 'pointer' }}>−</button>
                  <input aria-label="Tempo" type="number" inputMode="decimal" min={TEMPO_MIN} max={TEMPO_MAX} step={0.1} value={tempoText ?? fw.tempo().toFixed(1)}
                    onChange={e => setTempoText(e.target.value)} onBlur={commitTempo} onKeyDown={e => { if (e.key === 'Enter') { commitTempo(); (e.target as HTMLInputElement).blur(); } }}
                    style={{ width: 84, fontFamily: 'var(--font-lcd)', fontSize: 24, textAlign: 'center', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--lcd)', color: 'var(--lcd-ink)', padding: '4px 6px' }} />
                  <button type="button" aria-label="Faster" onClick={() => fw.setTempo(fw.tempo() + 1)} style={{ ...label, padding: '8px 10px', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--white)', cursor: 'pointer' }}>+</button>
                </span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 160px' }}>
                <span style={label}>Swing {m.swing}%</span>
                <input aria-label="Swing" type="range" min={50} max={75} value={m.swing} onChange={e => fw.setSwing(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--red)' }} />
              </label>
              <span style={{ ...label, alignSelf: 'center' }}>{q.bars} bars · loop {q.loop.on ? 'on' : 'off'}</span>
            </div>
          </div>

          {/* patterns */}
          <div style={{ ...plate, color: 'var(--ink)' }}>
            <span style={label}>Pattern</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 8 }}>
              {Array.from({ length: PATTERNS }, (_, i) => {
                const sq = m.sequences[i]; const on = (s.playing && s.nextSeq != null ? s.nextSeq : s.seq) === i;
                const notes = sq.tracks.reduce((a, t) => a + t.events.length, 0);
                return <button key={i} type="button" aria-label={`Pattern ${i + 1}: ${sq.name.trim() || 'empty'}`} aria-pressed={on} onClick={() => fw.setSequence(i)}
                  style={{ textAlign: 'left', padding: '8px 10px', border: '2px solid var(--ink)', borderRadius: 'var(--radius-key)', background: on ? 'var(--led-amber)' : notes ? 'var(--white)' : 'var(--cream-3)', cursor: 'pointer', boxShadow: on ? 'none' : '0 2px 0 var(--ink)', color: 'var(--ink)' }}>
                  <div style={{ ...label, color: 'var(--ink)' }}>{i + 1}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sq.name.trim() || 'empty'}</div>
                  <div style={{ ...label, fontSize: 9 }}>{notes ? `${sq.bars} bars · ${notes} notes` : `${sq.bars} bars`}</div>
                </button>;
              })}
            </div>
          </div>

          {/* kit, save, load */}
          <div style={{ ...plate, color: 'var(--ink)' }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
                <span style={label}>Kit</span>
                <select aria-label="Kit" value={pgm} onChange={e => fw.setProgram(0, Number(e.target.value))} style={{ font: 'inherit', fontSize: 16, padding: '8px 10px', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--white)', color: 'var(--ink)' }}>
                  {kits.map(({ p, i }) => <option key={i} value={i}>{i + 1}. {p.name.trim() || 'untitled'} ({programSounds(m, p).length} sounds)</option>)}
                </select>
              </label>
              <Big ariaLabel="Save" onClick={save}>Save</Big>
              <Big ariaLabel="Load" onClick={() => file.current?.click()}>Load</Big>
              <input ref={file} type="file" accept=".chopdeck,.zip" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
            </div>
            {!standalone && <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>More kits and records to chop: <a href="/kits/" style={{ color: 'var(--red-deep)' }}>kits</a>, <a href="/samples/" style={{ color: 'var(--red-deep)' }}>samples</a>. Drop audio files anywhere on the panel to load them.</span>}
            {standalone && <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>Drop audio files anywhere on the panel to load them; the OG panel chops them (TRIM, ZONE).</span>}
            {pending && <div role="alertdialog" aria-label="Load project" style={{ background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 4, padding: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>Load <b>{pending.name}</b>? It replaces everything on the machine.</span>
              <Big ariaLabel="Load it" red onClick={() => { fw.loadProject(pending.machine!); setPending(null); setNote(`Loaded ${pending.name}`); }}>Load it</Big>
              <Big ariaLabel="Cancel" onClick={() => setPending(null)}>Cancel</Big>
            </div>}
            {note && <span role="status" style={{ fontFamily: 'var(--font-label)', fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--red-deep)' }}>{note}</span>}
          </div>
        </div>

        {/* pads */}
        <div style={{ ...plate, color: 'var(--ink)', alignSelf: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={label}>Pads</span><span style={{ ...label, fontSize: 9 }}>{program.name.trim() || 'untitled'}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].map(i => (
              <EzPad key={i} index={i} name={names[i] ?? ''} hotkey={HOTKEYS[i]} lit={s.litPads.has(i) || s.padsDown.has(i)} onDown={v => fw.padDown(i, v)} onUp={() => fw.padUp(i)} />
            ))}
          </div>
          <span style={{ ...label, fontSize: 9, textAlign: 'center' }}>Z X C V · A S D F · Q W E R · 1 2 3 4 play the pads</span>
        </div>
      </div>

      <div style={{ ...silk, opacity: .45, textAlign: 'center', fontSize: 8, marginTop: 14 }}>FREE AND <a href="https://github.com/mcinnisdev/chopdeck" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>OPEN SOURCE</a> · BUILT BY <a href="https://mcinnis.dev" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>MCINNIS.DEV</a></div>
    </div>
  );
}
