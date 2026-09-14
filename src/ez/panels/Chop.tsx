// Chop: the current sound on one fluid LCD with draggable markers; auto-chop buttons; arm "Put on pads"
// and tap a pad to place the selected chop. Markers are the sound's zones, the same ones TRIM's ZONE page
// shows. An unchopped sound shows eight suggested chops without writing them; the first real edit fixes them.
import { useEffect } from 'react';
import { useMemo } from 'react';
import { Lcd, ChopEditor, HardButton } from '@/ds';
import { peaksOf } from '@/disk/sample';
import type { EzCtx } from '../EzPanel';

export function ChopPanel({ ctx }: { ctx: EzCtx }) {
  const { fw, chop, setChop, go, note, placing, setPlacing } = ctx;
  const m = fw.m, s = fw.s;
  const sound = m.sounds[s.sound] ?? null;
  const peaks = useMemo(() => sound ? peaksOf(sound.pcm, 320) : [], [sound]);
  // Leaving the panel must not leave the pads armed to rewrite the kit.
  useEffect(() => () => setPlacing(false), [setPlacing]);
  if (!sound) return (<>
    <p className="ez-help">Nothing to chop yet. Load a record from the library, drop an audio file anywhere on this page, or add one below.</p>
    <div className="ez-row"><HardButton label="Load audio" cap="amber" onClick={() => go('library')} /></div>
  </>);
  const chops = fw.zoneStarts(sound.id);
  const sel = Math.min(chop, chops.length - 1);
  // A sound nobody has chopped yet carries one zone spanning itself, but the editor shows eight suggested
  // chops; read the selection off those fractions so the times match what is on screen either way.
  const zone = sound.zones.length > 1 && sound.zones[sel]
    ? sound.zones[sel]
    : { st: Math.round(chops[sel] * sound.length), end: Math.round((chops[sel + 1] ?? 1) * sound.length) };
  const secs = (f: number) => (f / sound.rate).toFixed(2);
  const hear = (i: number) => {
    const st = sound.zones.length > 1 && sound.zones[i] ? sound.zones[i].st : Math.round(chops[i] * sound.length);
    const end = sound.zones.length > 1 && sound.zones[i] ? sound.zones[i].end : Math.round((chops[i + 1] ?? 1) * sound.length);
    // Grabbing a marker selects it and the click that follows selects it again; cut the last voice so one
    // gesture is one chop, not two stacked on top of each other.
    fw.sound.stopAll();
    fw.sound.playSound(sound, { from: st, to: end });
  };
  const select = (i: number) => { setChop(i); hear(i); };
  const onPad = (() => { const map = m.programs[m.drums[0].pgm]; const pads = map.padAssign === 'MASTER' ? m.masterPadToNote : map.padToNote; const want = `${sound.name.slice(0, 15 - String(sel + 1).length)}${sel + 1}`; const ids = new Set(m.sounds.filter(x => x.name === want && x.length === zone.end - zone.st).map(x => x.id)); const i = pads.findIndex(n => n && ids.has(map.notes[n - 35]?.snd ?? '')); return i >= 0 ? i + 1 : null; })();
  const auto = (n: number) => { fw.setZoneStarts(sound.id, Array.from({ length: n }, (_, i) => i / n)); setChop(0); };
  return (<>
    <p className="ez-help">
      <select className="ez-field" aria-label="Sound to chop" value={s.sound} onChange={e => { s.sound = Number(e.target.value); setChop(0); setPlacing(false); fw.touch(); }} style={{ fontSize: 13, padding: '4px 8px', marginRight: 8 }}>
        {m.sounds.map((x, i) => <option key={x.id} value={i}>{x.name}</option>)}
      </select>
      {chops.length} chops. Drag a marker to move it, tap a region to hear it, then arm <b>Put on pads</b> and tap a pad.
    </p>
    <Lcd style={{ width: '100%', display: 'flex' }}>
      <div style={{ whiteSpace: 'normal', display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <ChopEditor data={peaks} chops={chops} selected={sel} onChange={c => fw.setZoneStarts(sound.id, c)} onSelect={select} height={110} />
        <div className="ez-lcd-body">Chop {sel + 1} of {chops.length} · start {secs(zone.st)}s · end {secs(zone.end)}s{onPad ? ` · on pad ${onPad}` : ' · not on a pad yet'}</div>
      </div>
    </Lcd>
    <div className="ez-row">
      <HardButton label="Load audio" cap="amber" onClick={() => go('library')} />
      <span style={{ width: 8 }} />
      <HardButton label="4 slices" size="sm" active={chops.length === 4} onClick={() => auto(4)} />
      <HardButton label="8 slices" size="sm" active={chops.length === 8} onClick={() => auto(8)} />
      <HardButton label="16 slices" size="sm" active={chops.length === 16} onClick={() => auto(16)} />
      <HardButton label="Transients" size="sm" onClick={() => { fw.chopOnsets(sound.id, 16); setChop(0); }} />
      <span style={{ width: 8 }} />
      <HardButton label="Add" size="sm" onClick={() => { const c = chops[sel], n = chops[sel + 1] ?? 1; fw.setZoneStarts(sound.id, [...chops, (c + n) / 2]); }}>+</HardButton>
      <HardButton label="Remove" size="sm" disabled={chops.length <= 1 || sel === 0} onClick={() => { fw.setZoneStarts(sound.id, chops.filter((_, i) => i !== sel)); setChop(Math.max(0, sel - 1)); }}>−</HardButton>
      <span style={{ width: 8 }} />
      <span onPointerDown={() => hear(sel)} onPointerUp={() => fw.sound.stopAll()} onPointerLeave={() => fw.sound.stopAll()}><HardButton label="Hear chop" led="green">►</HardButton></span>
    </div>
    <div className="ez-row">
      <HardButton label="Put on pads" cap="amber" active={placing} led="amber" ledOn={placing} onClick={() => setPlacing(!placing)} />
      <HardButton label="All to pads" onClick={() => { const got = fw.chopToPads(sound.id, null, 'current'); setPlacing(false); setChop(0); note(`${got.length} chops on pads 1 to ${got.length}`); }} />
      <span className="ez-help" style={{ margin: 0 }}>{placing ? `Tap a pad: chop ${sel + 1} lands on it and the next chop comes up.` : 'Arm Put on pads to place chops one at a time, or send them all to pads 1 up.'}</span>
    </div>
  </>);
}
