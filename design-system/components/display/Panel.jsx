import React from 'react';
export function Panel({ title, children, recessed = false, onDark = false, padding = 'var(--space-4)', style }) {
  return (
    <fieldset style={{ position: 'relative', margin: 0, padding, border: `var(--stroke-w) solid ${onDark ? 'var(--cream)' : 'var(--stroke)'}`, borderRadius: 'var(--radius-panel)', background: recessed ? (onDark ? 'var(--navy-deep)' : 'var(--surface-panel-recessed)') : 'transparent', boxShadow: recessed ? 'var(--recess)' : 'none', minWidth: 0, ...style }}>
      {title && <legend style={{ padding: '0 6px', marginLeft: 8, fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 'var(--label-sm)', letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)', lineHeight: 1 }}>{title}</legend>}
      {children}
    </fieldset>
  );
}
export function Silkscreen({ children, size = 'sm', onDark = false, align = 'left', as = 'span', style }) {
  const fs = { xs: 'var(--label-xs)', sm: 'var(--label-sm)', md: 'var(--label-md)', lg: 'var(--label-lg)', xl: 'var(--label-xl)' }[size];
  return React.createElement(as, { style: { display: 'block', fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: fs, letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)', lineHeight: 1, textAlign: align, ...style } }, children);
}
export function Wordmark({ size = 'md', onDark = false, style }) {
  const fs = size === 'lg' ? 'var(--display-lg)' : size === 'sm' ? 'var(--label-xl)' : 'var(--display-md)';
  return (
    <span aria-label="Chop Deck" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0, fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: fs, lineHeight: 1, letterSpacing: '-.01em', textTransform: 'uppercase', color: onDark ? 'var(--cream)' : 'var(--ink)', ...style }}>
      <span style={{ color: 'var(--red)' }}>CHOP</span><span style={{ fontStyle: 'italic' }}>DECK</span>
    </span>
  );
}
