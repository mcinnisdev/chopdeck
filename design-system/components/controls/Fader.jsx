import React, { useRef, useState } from 'react';
export function Fader({ label, value = 64, min = 0, max = 127, onChange, height = 140, onDark = false, style }) {
  const [v, setV] = useState(value);
  const track = useRef(null);
  const cur = onChange ? value : v;
  const pct = (cur - min) / (max - min);
  const set = (n) => { const c = Math.max(min, Math.min(max, n)); onChange ? onChange(c) : setV(c); };
  const fromY = (clientY) => { const r = track.current.getBoundingClientRect(); set(min + (1 - (clientY - r.top) / r.height) * (max - min)); };
  const onDown = (e) => { e.currentTarget.setPointerCapture(e.pointerId); fromY(e.clientY); };
  const onMove = (e) => { if (e.buttons) fromY(e.clientY); };
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, userSelect: 'none', ...style }}>
      {label && <span style={{ fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 'var(--label-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)', lineHeight: 1 }}>{label}</span>}
      <div ref={track} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(cur)} aria-orientation="vertical"
        onPointerDown={onDown} onPointerMove={onMove}
        onKeyDown={(e) => { if (e.key === 'ArrowUp') set(cur + (max - min) / 16); if (e.key === 'ArrowDown') set(cur - (max - min) / 16); }}
        style={{ position: 'relative', width: 28, height, background: 'var(--ink)', borderRadius: 3, boxShadow: 'var(--recess)', cursor: 'pointer', outline: 'none', touchAction: 'none', backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 calc(12.5% - 1px), rgba(255,255,255,.25) calc(12.5% - 1px) 12.5%)' }}>
        <div aria-hidden style={{ position: 'absolute', left: -6, right: -6, height: 22, top: `calc(${(1 - pct) * 100}% - 11px)`, background: 'var(--cream)', border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 'var(--radius-key)', boxShadow: 'var(--bevel-key)', backgroundImage: 'linear-gradient(to bottom, transparent 45%, var(--ink) 45% 55%, transparent 55%)' }} />
      </div>
    </div>
  );
}
