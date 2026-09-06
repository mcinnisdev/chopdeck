// Chop on the EZ panel: a waveform, a region you drag, a slice count, and "Put on pads". The same
// operation as TRIM's ZONE page and SLICE SOUND, through the kernel's chopToPads.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Firmware } from '@/kernel/firmware';
import type { Sound } from '@/model/types';
import { peaksOf } from '@/disk/sample';

const label: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const btn: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', padding: '10px 12px', border: '2px solid var(--ink)', borderRadius: 'var(--radius-key)', background: 'var(--cream-2, #f1e6c8)', color: 'var(--ink)', cursor: 'pointer', boxShadow: '0 3px 0 var(--ink)' };
const chip = (on: boolean): CSSProperties => ({ ...label, color: on ? 'var(--cream)' : 'var(--ink)', background: on ? 'var(--ink)' : 'var(--white)', border: '2px solid var(--ink)', borderRadius: 3, padding: '5px 10px', cursor: 'pointer' });

export function EzChop({ fw, sound, onDone }: { fw: Firmware; sound: Sound; onDone(msg: string | null): void }) {
  const [st, setSt] = useState(sound.st);
  const [end, setEnd] = useState(sound.end);
  const [n, setN] = useState(8);
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<'st' | 'end' | null>(null);
  const peaks = useMemo(() => peaksOf(sound.pcm, 400), [sound]);
  const len = Math.max(1, sound.length);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cs = getComputedStyle(c); const ink = cs.getPropertyValue('--lcd-ink').trim() || '#1C2814'; const dim = cs.getPropertyValue('--lcd-dim').trim() || '#5C6B44';
    const x0 = (st / len) * w, x1 = (end / len) * w;
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x0, 0, x1 - x0, h);
    const bw = w / peaks.length;
    peaks.forEach((p, i) => { const ph = Math.max(1, p * (h - 10)); const x = i * bw; g.fillStyle = x >= x0 && x <= x1 ? ink : dim; g.fillRect(x + 0.5, (h - ph) / 2, Math.max(1, bw - 1), ph); });
    g.fillStyle = 'rgba(232,65,46,.9)';
    for (let k = 1; k < n; k++) { const x = x0 + ((x1 - x0) * k) / n; g.fillRect(x - 0.5, 0, 1.5, h); }
    g.fillStyle = '#E8412E'; g.fillRect(x0 - 2, 0, 4, h); g.fillRect(x1 - 2, 0, 4, h);
  }, [peaks, st, end, n, len]);

  const frameAt = (e: React.PointerEvent) => { const r = (e.target as HTMLElement).getBoundingClientRect(); return Math.max(0, Math.min(len, Math.round(((e.clientX - r.left) / r.width) * len))); };
  const down = (e: React.PointerEvent) => {
    const f = frameAt(e); const r = (e.target as HTMLElement).getBoundingClientRect(); const px = r.width / len;
    drag.current = Math.abs(f - st) * px <= Math.abs(f - end) * px ? 'st' : 'end';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    move(e);
  };
  const move = (e: React.PointerEvent) => { if (!drag.current) return; const f = frameAt(e); if (drag.current === 'st') setSt(Math.min(f, end - 1)); else setEnd(Math.max(f, st + 1)); };
  const up = () => { drag.current = null; };
  const put = (target: 'new' | 'current') => {
    const slices = fw.chopToPads(sound.id, n, target, st, end);
    onDone(slices.length ? `${slices.length} slices of ${sound.name} on the pads${target === 'new' ? ` in kit ${sound.name.slice(0, 16)}` : ''}` : 'Could not chop that');
  };
  const secs = (f: number) => (f / sound.rate).toFixed(2);

  return (
    <div role="dialog" aria-label={`Chop ${sound.name}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 4, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={label}>Chop {sound.name}</span>
        <span style={{ ...label, fontSize: 9 }}>{secs(st)}s to {secs(end)}s · drag the red edges</span>
      </div>
      <canvas ref={cv} aria-label="Waveform" style={{ width: '100%', height: 110, background: 'var(--lcd)', border: '2px solid var(--ink)', borderRadius: 4, cursor: 'col-resize', touchAction: 'none', display: 'block' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={label}>Slices</span>
        {[4, 8, 16].map(k => <button key={k} type="button" aria-pressed={n === k} aria-label={`${k} slices`} style={chip(n === k)} onClick={() => setN(k)}>{k}</button>)}
        <button type="button" style={{ ...btn, marginLeft: 'auto' }} onPointerDown={() => fw.sound.playSound(sound, { from: st, to: end })} onPointerUp={() => fw.sound.stopAll()} onPointerLeave={() => fw.sound.stopAll()}>► Hear region</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={{ ...btn, background: 'var(--red)', color: 'var(--cream)' }} onClick={() => put('new')}>Put on pads in a new kit</button>
        <button type="button" style={btn} onClick={() => put('current')}>Put on this kit's pads</button>
        <button type="button" style={{ ...btn, background: 'transparent', boxShadow: 'none' }} onClick={() => onDone(null)}>Cancel</button>
      </div>
    </div>
  );
}
