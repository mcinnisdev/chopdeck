// The EZ panel: the same machine behind a simple front. Reads the firmware's machine and session, calls
// the same kernel methods the OG screens use, and owns nothing of its own beyond what is on screen.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useFirmware } from '@/app/store';
import { useKeyboard, PAD_KEYS } from '@/app/useKeyboard';
import { AudioEngine } from '@/audio/engine';
import { sync } from '@/disk/sync';
import { accountLabel } from '@/app/account-label';
import { PanelSwitch } from '@/app/PanelSwitch';
import { MANUAL_URL } from '@/app/help';
import { padNames, programSounds } from '@/disk/kit';
import { encodeProject, decodeProject } from '@/disk/formats';
import { tickToBBT } from '@/model/time';
import { TEMPO_MIN, TEMPO_MAX, NOTE_MIN } from '@/model/types';
import type { Firmware } from '@/kernel/firmware';
import { Wordmark } from '@/ds';
import { EzPad } from './EzPad';
import { EzSounds } from './EzSounds';
import { EzChop } from './EzChop';

const HOTKEYS = PAD_KEYS.map(code => code.replace('Key', '').replace('Digit', ''));
const PATTERNS = 8;
const PAD_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];

const label: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const silk: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--cream)', lineHeight: 1 };
const amber: CSSProperties = { color: 'var(--led-amber)', textDecoration: 'none', borderBottom: '1px solid var(--led-amber)' };
const plate: CSSProperties = { background: 'var(--cream)', border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-panel)', padding: 14, boxShadow: 'inset 0 2px 6px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--ink)' };
const field: CSSProperties = { font: 'inherit', fontSize: 16, padding: '8px 10px', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--white)', color: 'var(--ink)' };
const small: CSSProperties = { ...label, color: 'var(--ink)', padding: '8px 10px', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--white)', cursor: 'pointer', boxShadow: '0 2px 0 var(--ink)' };

function Big({ children, on, red, onClick, ariaLabel, disabled }: { children: ReactNode; on?: boolean; red?: boolean; onClick(): void; ariaLabel: string; disabled?: boolean }) {
  const style: CSSProperties = {
    fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', padding: '14px 12px', minWidth: 96, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .45 : 1,
    background: on ? 'var(--led-amber)' : red ? 'var(--red)' : 'var(--cream-2, #f1e6c8)', color: on ? 'var(--ink)' : red ? 'var(--cream)' : 'var(--ink)',
    border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-key)', boxShadow: '0 3px 0 var(--ink)', touchAction: 'manipulation',
  };
  return <button type="button" aria-label={ariaLabel} aria-pressed={on ?? undefined} disabled={disabled} onClick={onClick} style={style}>{children}</button>;
}

/** Audio boot on the first gesture, and dropped audio files straight into memory as sounds. */
function useEzHost(fw: Firmware, engine: AudioEngine, onNote: (m: string) => void) {
  useEffect(() => {
    const boot = () => engine.boot();
    const opts = { capture: true, passive: true } as AddEventListenerOptions;
    window.addEventListener('pointerdown', boot, opts); window.addEventListener('keydown', boot, opts);
    const over = (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      const projects = files.filter(f => /\.(chopdeck|zip)$/i.test(f.name));
      if (projects.length) { onNote('Use Load for project files.'); return; }
      void fw.importAudio(files).then(got => onNote(got.length ? `Added ${got.map(s => s.name).join(', ')}` : 'Nothing there the browser could decode'));
    };
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('pointerdown', boot, opts); window.removeEventListener('keydown', boot, opts); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [fw, engine, onNote]);
}

export function EzPanel({ engine }: { engine: AudioEngine }) {
  const fw = useFirmware();
  useKeyboard(fw);
  const s = fw.s, m = fw.m;
  const q = m.sequences[s.seq];
  const pgm = m.drums[0].pgm;
  const program = m.programs[pgm];
  const names = padNames(m, program);
  const syncState = useSyncExternalStore(fn => sync.subscribe(fn), () => sync.snapshot);
  const standalone = syncState.status === 'standalone';
  const bbt = tickToBBT(q.tsigs, Math.max(0, s.now));
  const [tempoText, setTempoText] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; machine: NonNullable<ReturnType<typeof decodeProject>> } | null>(null);
  const [note, setNoteState] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);   // sound id waiting for a pad
  const [editPads, setEditPads] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);        // pad index open in the pad editor
  const [chopping, setChopping] = useState<string | null>(null);      // sound id in the chop editor
  const [kitName, setKitName] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const setNote = useRef((msg: string) => setNoteState(msg)).current;
  useEffect(() => { if (note) { const t = setTimeout(() => setNoteState(null), 4500); return () => clearTimeout(t); } }, [note]);
  useEzHost(fw, engine, setNote);

  const commitTempo = () => { if (tempoText != null) { const v = Number(tempoText); if (!isNaN(v)) fw.setTempo(v); setTempoText(null); } };
  const kits = m.programs.map((p, i) => ({ p, i })).filter(x => x.i === pgm || x.p.used || programSounds(m, x.p).length > 0);
  const soundOnPad = (pad: number) => { const map = program.padAssign === 'MASTER' ? m.masterPadToNote : program.padToNote; const n = map[pad]; return n ? program.notes[n - NOTE_MIN]?.snd ?? null : null; };
  const chopSound = chopping ? m.sounds.find(x => x.id === chopping) ?? null : null;

  const padDown = (i: number, v: number) => {
    if (assigning) { fw.assignPad(i, assigning); setNote(`${m.sounds.find(x => x.id === assigning)?.name ?? 'Sound'} is on pad ${i + 1}`); setAssigning(null); return; }
    if (editPads) { setEditing(i); return; }
    fw.padDown(i, v);
  };
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
  const newKit = () => { const i = fw.newProgram(`KIT ${m.programs.filter(p => p.used).length + 1}`); setKitName(m.programs[i].name); };

  return (
    <div role="region" aria-label="EZ panel" style={{ maxWidth: 1180, margin: '0 auto', background: 'var(--navy) var(--texture-grain)', border: '3px solid var(--ink)', borderRadius: 'var(--radius-chassis)', boxShadow: 'var(--chassis-shadow)', padding: 18, boxSizing: 'border-box', color: 'var(--cream)' }}>
      <style>{`.ez-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,440px);gap:16px}@media(max-width:900px){.ez-grid{grid-template-columns:1fr}.ez-head-links{display:none}.ez-pads{order:-1}}`}</style>

      {/* header: wordmark, the switch, the same silkscreen links as OG */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Wordmark size="sm" onDark />
          <PanelSwitch />
          <span style={{ ...silk, opacity: .85 }}>
            <a href={MANUAL_URL} target="_blank" rel="noopener" style={amber}>MANUAL</a>
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
          <div style={plate}>
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
                  <button type="button" aria-label="Slower" onClick={() => fw.setTempo(fw.tempo() - 1)} style={small}>−</button>
                  <input aria-label="Tempo" type="number" inputMode="decimal" min={TEMPO_MIN} max={TEMPO_MAX} step={0.1} value={tempoText ?? fw.tempo().toFixed(1)}
                    onChange={e => setTempoText(e.target.value)} onBlur={commitTempo} onKeyDown={e => { if (e.key === 'Enter') { commitTempo(); (e.target as HTMLInputElement).blur(); } }}
                    style={{ width: 84, fontFamily: 'var(--font-lcd)', fontSize: 24, textAlign: 'center', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--lcd)', color: 'var(--lcd-ink)', padding: '4px 6px' }} />
                  <button type="button" aria-label="Faster" onClick={() => fw.setTempo(fw.tempo() + 1)} style={small}>+</button>
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
          <div style={plate}>
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

          {/* kit */}
          <div style={plate}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
                <span style={label}>Kit</span>
                <select aria-label="Kit" value={pgm} onChange={e => { fw.setProgram(0, Number(e.target.value)); setKitName(null); }} style={field}>
                  {kits.map(({ p, i }) => <option key={i} value={i}>{i + 1}. {p.name.trim() || 'untitled'} ({programSounds(m, p).length} sounds)</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px' }}>
                <span style={label}>Kit name</span>
                <input aria-label="Kit name" type="text" maxLength={16} value={kitName ?? program.name} onChange={e => setKitName(e.target.value)} onBlur={() => { if (kitName != null) { fw.renameProgram(pgm, kitName.trim() || program.name); setKitName(null); } }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ ...field, textTransform: 'uppercase' }} />
              </label>
              <button type="button" style={small} onClick={newKit}>New kit</button>
              <button type="button" style={{ ...small, background: editPads ? 'var(--led-amber)' : 'var(--white)' }} aria-pressed={editPads} onClick={() => { setEditPads(!editPads); setEditing(null); }}>Edit pads</button>
            </div>
            {editPads && editing == null && <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>Tap a pad to choose its sound or clear it.</span>}
            {editing != null && <div role="dialog" aria-label={`Pad ${editing + 1}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 4, padding: 8 }}>
              <span style={label}>Pad {editing + 1}</span>
              <select aria-label={`Sound on pad ${editing + 1}`} value={soundOnPad(editing) ?? ''} onChange={e => fw.assignPad(editing, e.target.value || null)} style={{ ...field, flex: '1 1 160px' }}>
                <option value="">empty</option>
                {m.sounds.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button type="button" style={small} onPointerDown={() => fw.padDown(editing, 100)} onPointerUp={() => fw.padUp(editing)}>► Hear</button>
              <button type="button" style={small} onClick={() => fw.assignPad(editing, null)}>Clear</button>
              <button type="button" style={{ ...small, boxShadow: 'none', background: 'transparent' }} onClick={() => setEditing(null)}>Done</button>
            </div>}
            {assigning && <div role="status" style={{ background: 'var(--led-amber)', border: '2px solid var(--ink)', borderRadius: 4, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ ...label, color: 'var(--ink)' }}>Tap a pad for {m.sounds.find(x => x.id === assigning)?.name}</span>
              <button type="button" style={{ ...small, boxShadow: 'none' }} onClick={() => setAssigning(null)}>Cancel</button>
            </div>}
          </div>

          {/* sounds and chopping */}
          <div style={plate}>
            {chopSound
              ? <EzChop key={chopSound.id} fw={fw} sound={chopSound} onDone={msg => { setChopping(null); if (msg) setNote(msg); }} />
              : <EzSounds fw={fw} onPutOnPad={id => { setAssigning(id); setEditPads(false); setEditing(null); }} onChop={id => setChopping(id)} onNote={setNote} />}
          </div>

          {/* save and load */}
          <div style={plate}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={label}>Project</span>
              <Big ariaLabel="Save" onClick={save}>Save</Big>
              <Big ariaLabel="Load" onClick={() => file.current?.click()}>Load</Big>
              <input ref={file} type="file" accept=".chopdeck,.zip" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>{standalone ? 'Everything autosaves in this browser; Save keeps a .CHOPDECK file.' : <>Everything autosaves. More kits and records to chop: <a href="/kits/" style={{ color: 'var(--red-deep)' }}>kits</a>, <a href="/samples/" style={{ color: 'var(--red-deep)' }}>samples</a>.</>}</span>
            </div>
            {pending && <div role="alertdialog" aria-label="Load project" style={{ background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 4, padding: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>Load <b>{pending.name}</b>? It replaces everything on the machine.</span>
              <Big ariaLabel="Load it" red onClick={() => { fw.loadProject(pending.machine); setPending(null); setNote(`Loaded ${pending.name}`); }}>Load it</Big>
              <Big ariaLabel="Cancel" onClick={() => setPending(null)}>Cancel</Big>
            </div>}
            {note && <span role="status" style={{ ...label, color: 'var(--red-deep)' }}>{note}</span>}
          </div>
        </div>

        {/* pads */}
        <div className="ez-pads" style={{ ...plate, alignSelf: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={label}>Pads{editPads ? ' · editing' : assigning ? ' · tap one' : ''}</span><span style={{ ...label, fontSize: 9 }}>{program.name.trim() || 'untitled'}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, outline: assigning || editPads ? '3px solid var(--led-amber)' : 'none', outlineOffset: 6, borderRadius: 4 }}>
            {PAD_ORDER.map(i => (
              <EzPad key={i} index={i} name={names[i] ?? ''} hotkey={HOTKEYS[i]} lit={s.litPads.has(i) || s.padsDown.has(i)} onDown={v => padDown(i, v)} onUp={() => fw.padUp(i)} armed={!!assigning || editPads} />
            ))}
          </div>
          <span style={{ ...label, fontSize: 9, textAlign: 'center' }}>Z X C V · A S D F · Q W E R · 1 2 3 4 play the pads</span>
        </div>
      </div>

      <div style={{ ...silk, opacity: .45, textAlign: 'center', fontSize: 8, marginTop: 14 }}>FREE AND <a href="https://github.com/mcinnisdev/chopdeck" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>OPEN SOURCE</a> · BUILT BY <a href="https://mcinnis.dev" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>MCINNIS.DEV</a></div>
    </div>
  );
}
