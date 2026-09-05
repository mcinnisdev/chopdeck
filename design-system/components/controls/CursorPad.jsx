import React from 'react';
import { HardButton } from './HardButton.jsx';
export function CursorPad({ onMove, label = 'CURSOR', onDark = false, style }) {
  const k = (dir, ch, extra) => <HardButton size="sm" onClick={() => onMove?.(dir)} style={extra}>{ch}</HardButton>;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, ...style }}>
      <span style={{ fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 'var(--label-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)', lineHeight: 1 }}>{label}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto', gap: 2, padding: 6, background: 'var(--cream-2)', border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 'var(--radius-panel)', boxShadow: 'var(--recess)' }}>
        <span /> {k('up', '▲')} <span />
        {k('left', '◀')} <span style={{ width: 'var(--key-w)' }} /> {k('right', '▶')}
        <span /> {k('down', '▼')} <span />
      </div>
    </div>
  );
}
