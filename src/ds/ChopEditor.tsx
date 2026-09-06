// EZ chopping: a big waveform with draggable markers, one per chop start. Ported from the design
// system's Waveform + ChopEditor. Markers are fractions of the sound (0..1); the selected one is red.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent, type MouseEvent } from 'react';

export function Waveform({ data, chops = [], selected, playhead, height = 80, width = 480, style }: { data: number[]; chops?: number[]; selected?: number; playhead?: number; height?: number; width?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(c); const ink = cs.getPropertyValue('--lcd-ink').trim() || '#1C2814'; const dim = cs.getPropertyValue('--lcd-dim').trim() || '#5C6B44';
    ctx.clearRect(0, 0, width, height);
    const pts = data.length ? data : [0];
    const mid = height / 2; const step = width / pts.length;
    ctx.fillStyle = ink;
    pts.forEach((a, i) => { const h = Math.max(1, a * (height - 8)); ctx.fillRect(i * step, mid - h / 2, Math.max(1, step - 1), h); });
    ctx.fillStyle = dim; ctx.fillRect(0, mid, width, 1);
    chops.forEach((x, i) => {
      const px = x * width;
      ctx.fillStyle = ink; ctx.fillRect(px, 0, i === selected ? 2 : 1, height);
      ctx.font = '12px VT323, monospace'; ctx.fillText(String(i + 1).padStart(2, '0'), px + 3, 11);
      if (i === selected) { const nx = (chops[i + 1] ?? 1) * width; ctx.fillStyle = 'rgba(28,40,20,.18)'; ctx.fillRect(px, 0, nx - px, height); }
    });
    if (playhead != null) { ctx.fillStyle = ink; ctx.fillRect(playhead * width, 0, 2, height); }
  }, [data, chops, selected, playhead, height, width]);
  return <canvas ref={ref} role="img" aria-label="Waveform" style={{ width, height, display: 'block', imageRendering: 'pixelated', ...style }} />;
}

export interface ChopEditorProps { data: number[]; chops: number[]; selected: number; onChange(chops: number[]): void; onSelect(i: number): void; playhead?: number; height?: number; style?: CSSProperties }

export function ChopEditor({ data, chops, selected, onChange, onSelect, playhead, height = 96, style }: ChopEditorProps) {
  const ref = useRef<HTMLDivElement>(null); const [w, setW] = useState(400); const drag = useRef<number | null>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const pos = (e: { clientX: number }) => { const r = ref.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, w))); };
  const onDown = (i: number) => (e: RPointerEvent<HTMLDivElement>) => { e.stopPropagation(); drag.current = i; e.currentTarget.setPointerCapture(e.pointerId); onSelect(i); };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => { if (drag.current == null) return; const i = drag.current; const next = chops.slice(); const lo = i > 0 ? chops[i - 1] + .01 : 0, hi = i < chops.length - 1 ? chops[i + 1] - .01 : 1; next[i] = Math.max(lo, Math.min(hi, pos(e))); onChange(next); };
  const onUp = () => { drag.current = null; };
  const clickRegion = (e: MouseEvent<HTMLDivElement>) => { const x = pos(e); let i = chops.findIndex((c, k) => x >= c && x < (chops[k + 1] ?? 1)); if (i < 0) i = chops.length - 1; onSelect(i); };
  const onKey = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => { const d = e.key === 'ArrowRight' ? .005 : e.key === 'ArrowLeft' ? -.005 : 0; if (d) { const n = chops.slice(); n[i] = Math.max(0, Math.min(1, chops[i] + d)); onChange(n); } };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={clickRegion} style={{ position: 'relative', width: '100%', height, touchAction: 'none', cursor: 'crosshair', ...style }}>
      <Waveform data={data} chops={chops} selected={selected} playhead={playhead} width={w} height={height} />
      {chops.map((c, i) => <div key={i} role="slider" aria-label={`Chop ${i + 1} start`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c * 100)} tabIndex={0} onPointerDown={onDown(i)} onKeyDown={onKey(i)}
        style={{ position: 'absolute', top: -4, left: `calc(${c * 100}% - 8px)`, width: 16, height: height + 8, cursor: 'ew-resize', outline: 'none' }}>
        <span aria-hidden style={{ position: 'absolute', top: 0, left: 4, width: 8, height: 10, background: i === selected ? 'var(--red)' : 'var(--lcd-ink)', clipPath: 'polygon(0 0,100% 0,50% 100%)' }} />
      </div>)}
    </div>
  );
}
