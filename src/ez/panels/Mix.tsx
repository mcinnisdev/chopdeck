// Mix: a level fader per pad, the kit (which program, its name, a new one, editing pads), and the project
// (save and load a .CHOPDECK file). Pad levels are the notes' mixer volumes, as on the MIXER screen.
import { useRef, useState } from 'react';
import { HardButton, Fader } from '@/ds';
import { padNames, programSounds } from '@/disk/kit';
import { encodeProject, decodeProject } from '@/disk/formats';
import { NOTE_MIN } from '@/model/types';
import type { EzCtx } from '../EzPanel';

export function MixPanel({ ctx }: { ctx: EzCtx }) {
  const { fw, note, editPads, setEditPads, editing, setEditing } = ctx;
  const m = fw.m, s = fw.s;
  const pgm = m.drums[0].pgm; const program = m.programs[pgm];
  const names = padNames(m, program);
  const [kitName, setKitName] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; project: NonNullable<ReturnType<typeof decodeProject>> } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const kits = m.programs.map((p, i) => ({ p, i })).filter(x => x.i === pgm || x.p.used || programSounds(m, x.p).length > 0);
  const soundOnPad = (pad: number) => { const map = program.padAssign === 'MASTER' ? m.masterPadToNote : program.padToNote; const n = map[pad]; return n ? program.notes[n - NOTE_MIN]?.snd ?? null : null; };
  const save = () => { const name = `${(m.sequences[s.seq].name.trim() || 'CHOPDECK').replace(/[^A-Za-z0-9_-]+/g, '_').toUpperCase().slice(0, 16)}.CHOPDECK`; fw.host.download(name, encodeProject(m, s.masterTempo), 'application/zip'); note(`Saved ${name}`); };
  const pick = async (f: File) => { const p = decodeProject(new Uint8Array(await f.arrayBuffer())); if (!p) { note('That is not a Chop Deck project file.'); return; } setPending({ name: f.name, project: p }); };

  return (<>
    <p className="ez-help">Level per pad. Tap a pad to hear it while you adjust.</p>
    <div className="ez-well" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 2px 10px' }}>
      {names.map((nm, i) => <Fader key={i} label={String(i + 1)} value={fw.padLevel(i)} min={0} max={100} height={110} onChange={v => fw.setPadLevel(i, v)} style={{ flex: '0 0 44px', opacity: nm ? 1 : .45 }} />)}
    </div>
    <div className="ez-row">
      <HardButton label="Reset levels" onClick={() => { for (let i = 0; i < 16; i++) fw.setPadLevel(i, 100); }} />
    </div>

    <h2 className="ez-title" style={{ fontSize: 16, marginTop: 8 }}>Kit</h2>
    <div className="ez-row">
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
        <span className="ez-bank-label">Kit</span>
        <select className="ez-field" aria-label="Kit" value={pgm} onChange={e => { fw.setProgram(0, Number(e.target.value)); setKitName(null); }}>
          {kits.map(({ p, i }) => <option key={i} value={i}>{i + 1}. {p.name.trim() || 'untitled'} ({programSounds(m, p).length} sounds)</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 140px' }}>
        <span className="ez-bank-label">Kit name</span>
        <input className="ez-field" aria-label="Kit name" type="text" maxLength={16} value={kitName ?? program.name} onChange={e => setKitName(e.target.value)} onBlur={() => { if (kitName != null) { fw.renameProgram(pgm, kitName.trim() || program.name); setKitName(null); } }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ textTransform: 'uppercase' }} />
      </label>
      <HardButton label="New kit" onClick={() => { const i = fw.newProgram(`KIT ${m.programs.filter(p => p.used).length + 1}`); setKitName(m.programs[i].name); }} />
      <HardButton label="Edit pads" active={editPads} onClick={() => { setEditPads(!editPads); setEditing(null); }} />
    </div>
    {editing != null && <div role="dialog" aria-label={`Pad ${editing + 1}`} className="ez-row" style={{ background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 4, padding: 8, alignItems: 'center' }}>
      <span className="ez-bank-label">Pad {editing + 1}</span>
      <select className="ez-field" aria-label={`Sound on pad ${editing + 1}`} value={soundOnPad(editing) ?? ''} onChange={e => fw.assignPad(editing, e.target.value || null)} style={{ flex: '1 1 160px' }}>
        <option value="">empty</option>
        {m.sounds.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <span onPointerDown={() => fw.padDown(editing, 100)} onPointerUp={() => fw.padUp(editing)}><HardButton size="sm">► Hear</HardButton></span>
      <HardButton size="sm" onClick={() => fw.assignPad(editing, null)}>Clear</HardButton>
      <HardButton size="sm" onClick={() => setEditing(null)}>Done</HardButton>
    </div>}

    <h2 className="ez-title" style={{ fontSize: 16, marginTop: 8 }}>Project</h2>
    <div className="ez-row" style={{ alignItems: 'center' }}>
      <HardButton label="Save" onClick={save} />
      <HardButton label="Load" onClick={() => file.current?.click()} />
      <input ref={file} type="file" accept=".chopdeck,.zip" hidden aria-label="Load project" onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
      <span className="ez-help">Everything autosaves in this browser; Save keeps a .CHOPDECK file with the whole machine in it.</span>
    </div>
    {pending && <div role="alertdialog" aria-label="Load project" className="ez-row" style={{ background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 4, padding: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 14 }}>Load <b>{pending.name}</b>? It replaces everything on the machine.</span>
      <HardButton label="Load it" cap="red" onClick={() => { fw.loadProject(pending.project); setPending(null); note(`Loaded ${pending.name}`); }} />
      <HardButton label="Cancel" onClick={() => setPending(null)} />
    </div>}
  </>);
}
