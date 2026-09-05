import React from 'react';
export function Lcd({ children, title, cols = 40, rows = 8, fontSize = 'var(--lcd-md)', style }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, ...style }}>
      {title && <span style={{ fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 'var(--label-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: 'var(--text-silkscreen)', lineHeight: 1 }}>{title}</span>}
      <div style={{ padding: 6, background: 'var(--ink)', borderRadius: 'var(--radius-lcd)', boxShadow: '0 2px 0 var(--ink-3), inset 0 1px 0 rgba(255,255,255,.12)' }}>
        <div role="region" aria-label={title || 'LCD'} style={{ position: 'relative', minWidth: `${cols}ch`, minHeight: `calc(${rows} * ${fontSize} * var(--lcd-line))`, padding: '8px 10px', background: 'var(--surface-lcd)', borderRadius: 2, boxShadow: 'var(--lcd-inset)', fontFamily: 'var(--font-lcd)', fontSize, lineHeight: 'var(--lcd-line)', color: 'var(--text-lcd)', textTransform: 'uppercase', whiteSpace: 'pre', overflow: 'hidden',
          backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 3px, rgba(0,0,0,.05) 3px 4px)' }}>{children}</div>
      </div>
    </div>
  );
}
export function LcdField({ label, value, selected = false, width, style }) {
  return (
    <span style={{ display: 'inline-flex', gap: '1ch', ...style }}>
      {label && <span style={{ color: 'var(--text-lcd-dim)' }}>{label}:</span>}
      <span style={{ minWidth: width, background: selected ? 'var(--lcd-cursor)' : 'transparent', color: selected ? 'var(--surface-lcd)' : 'inherit', padding: '0 2px', margin: '0 -2px' }}>{value}</span>
    </span>
  );
}
export function SoftKeys({ keys = [], active, onSelect, style }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, ...style }}>
      {Array.from({ length: 6 }, (_, i) => {
        const k = keys[i]; const on = active === i;
        return <button key={i} type="button" disabled={!k} onClick={() => k && onSelect?.(i, k)} style={{ appearance: 'none', border: 0, height: 20, padding: 0, fontFamily: 'var(--font-lcd)', fontSize: 'var(--lcd-sm)', lineHeight: 1, textTransform: 'uppercase', background: on ? 'var(--lcd-ink)' : k ? 'var(--lcd-cursor)' : 'transparent', color: k ? 'var(--surface-lcd)' : 'transparent', cursor: k ? 'pointer' : 'default', borderRadius: 1, outline: 'none' }}>{k || '·'}</button>;
      })}
    </div>
  );
}
