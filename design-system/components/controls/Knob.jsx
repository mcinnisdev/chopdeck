import React, { useRef, useState } from 'react';
export function Knob({ label, value = 50, min = 0, max = 100, onChange, size = 'md', ticks = true, onDark = false, style }) {
  const [v, setV] = useState(value);
  const drag = useRef(null);
  const cur = onChange ? value : v;
  const d = size === 'lg' ? 'var(--knob-lg)' : size === 'sm' ? '36px' : 'var(--knob-md)';
  const angle = -135 + ((cur - min) / (max - min)) * 270;
  const set = (n) => { const c = Math.max(min, Math.min(max, n)); onChange ? onChange(c) : setV(c); };
  const onDown = (e) => { drag.current = { y: e.clientY, v: cur }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!drag.current) return; set(drag.current.v + (drag.current.y - e.clientY) * ((max - min) / 150)); };
  const onUp = () => { drag.current = null; };
  const lbl = (t, extra) => <span style={{ fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 'var(--label-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)', lineHeight: 1, ...extra }}>{t}</span>;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none', ...style }}>
      {label && lbl(label)}
      <div style={{ position: 'relative', width: d, height: d }}>
        {ticks && <div aria-hidden style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: `conic-gradient(from 225deg, ${onDark ? 'var(--cream)' : 'var(--ink)'} 0 270deg, transparent 270deg)`, WebkitMask: 'radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px) calc(50% - 1px), transparent calc(50% - 1px))', mask: 'radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px) calc(50% - 1px), transparent calc(50% - 1px))', opacity: .6 }} />}
        <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(cur)}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(cur + (max - min) / 20); if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(cur - (max - min) / 20); }}
          style={{ width: '100%', height: '100%', borderRadius: '50%', border: 'var(--stroke-w) solid var(--stroke)', background: 'radial-gradient(circle at 50% 35%, var(--ink-3), var(--ink) 70%)', boxShadow: 'var(--bevel-knob)', cursor: 'ns-resize', outline: 'none', position: 'relative', touchAction: 'none' }}>
          <div aria-hidden style={{ position: 'absolute', left: '50%', top: '8%', width: 3, height: '36%', marginLeft: -1.5, background: 'var(--cream)', borderRadius: 2, transformOrigin: '50% 117%', transform: `rotate(${angle}deg)`, transition: drag.current ? 'none' : 'transform 60ms var(--ease-hw)' }} />
        </div>
      </div>
      {ticks && <div style={{ display: 'flex', justifyContent: 'space-between', width: `calc(${d} + 12px)` }}>{lbl('MIN', { opacity: .7 })}{lbl('MAX', { opacity: .7 })}</div>}
    </div>
  );
}
