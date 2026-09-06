// Chop: the current sound on one fluid LCD with draggable markers; auto-chop buttons; tap a pad to place
// the selected chop. Markers are the sound's zones, the same ones TRIM's ZONE page shows.
import { useEffect, useMemo } from 'react';
import { Lcd, ChopEditor, HardButton } from '@/ds';
import { peaksOf } from '@/disk/sample';
import type { EzCtx } from '../EzPanel';

export function ChopPanel({ ctx }: { ctx: EzCtx }) {
  const { fw, chop, setChop, go, note } = ctx;
  const m = fw.m, s = fw.s;
  const sound = m.sounds[s.sound] ?? null;
  const peaks = useMemo(() => sound ? peaksOf(sound.pcm, 320) : [], [sound]);
  useEffect(() => { if (sound && sound.zones.length <= 1) fw.setZoneStarts(sound.id, Array.from({ length: 8 }, (_, i) => i / 8)); }, [sound, fw]);
  if (!sound) return (<>
    <p className="ez-help">Nothing to chop yet. Load a record from the library, drop an audio file anywhere on this page, or add one below.</p>
    <div className="ez-row"><HardButton label="Load audio" cap="amber" onClick={() => go('library')} /></div>
  </>);
  const chops = fw.zoneStarts(sound.id);
  const sel = Math.min(chop, chops.length - 1);
  const zone = sound.zones[sel] ?? { st: 0, end: sound.length };
  const secs = (f: number) => (f / sound.rate).toFixed(2);
  const onPad = (() => { const map = m.programs[m.drums[0].pgm]; const pads = map.padAssign === 'MASTER' ? m.masterPadToNote : map.padToNote; const want = `${sound.name.slice(0, 15 - String(sel + 1).length)}${sel + 1}`; const ids = new Set(m.sounds.filter(x => x.name === want && x.length === zone.end - zone.st).map(x => x.id)); const i = pads.findIndex(n => n && ids.has(map.notes[n - 35]?.snd ?? '')); return i >= 0 ? i + 1 : null; })();
  const auto = (n: number) => { fw.setZoneStarts(sound.id, Array.from({ length: n }, (_, i) => i / n)); setChop(0); };
  return (<>
    <p className="ez-help">
      <select className="ez-field" aria-label="Sound to chop" value={s.sound} onChange={e => { s.sound = Number(e.target.value); setChop(0); fw.touch(); }} style={{ fontSize: 13, padding: '4px 8px', marginRight: 8 }}>
        {m.sounds.map((x, i) => <option key={x.id} value={i}>{x.name}</option>)}
      </select>
      {chops.length} chops. Drag a marker to move it, tap a region to select it, then tap a pad to put it there.
    </p>
    <Lcd style={{ width: '100%', display: 'flex' }}>
      <div style={{ whiteSpace: 'normal', display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <ChopEditor data={peaks} chops={chops} selected={sel} onChange={c => fw.setZoneStarts(sound.id, c)} onSelect={setChop} height={110} />
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
      <span onPointerDown={() => fw.sound.playSound(sound, { from: zone.st, to: zone.end })} onPointerUp={() => fw.sound.stopAll()} onPointerLeave={() => fw.sound.stopAll()}><HardButton label="Hear chop" led="green">►</HardButton></span>
      <HardButton label="All to pads" onClick={() => { const got = fw.chopToPads(sound.id, null, 'current'); note(`${got.length} chops on pads 1 to ${got.length}`); }} />
    </div>
  </>);
}
