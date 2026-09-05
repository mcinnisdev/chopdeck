import React, { useState } from 'react';
export function Pad({ label = 'PAD 1', note, color = 'red', lit = false, size, onTrigger, style }) {
  const [down, setDown] = useState(false);
  const active = down || lit;
  const bg = color === 'grey' ? 'var(--surface-pad-alt)' : 'var(--surface-pad)';
  const s = size || 'var(--pad-size)';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, width: s, userSelect: 'none', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 'var(--label-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: 'var(--text-silkscreen)', lineHeight: 1 }}>
        <span>{label}</span>{note && <span style={{ opacity: .7 }}>{note}</span>}
      </div>
      <button type="button" aria-label={label} aria-pressed={active}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDown(true); onTrigger?.(); }}
        onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)}
        style={{ appearance: 'none', width: s, height: s, padding: 0, border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 'var(--radius-pad)', background: active ? (color === 'grey' ? 'var(--cream)' : 'var(--red-soft)') : bg,
          boxShadow: active ? (color === 'grey' ? 'var(--bevel-pad-pressed)' : 'var(--bevel-pad-pressed), var(--pad-glow)') : 'var(--bevel-pad)',
          transform: active ? 'translateY(var(--pad-press-offset))' : 'none', transition: 'transform var(--dur-press), box-shadow var(--dur-press), background var(--dur-led)', cursor: 'pointer', outline: 'none' }} />
    </div>
  );
}
