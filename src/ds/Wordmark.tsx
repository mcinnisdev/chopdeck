import type { CSSProperties } from 'react';

/** Typographic "CHOP DECK" wordmark. Use the pad-grid logo (assets/logo.webp) as the mark; this is the type lockup beside it. */
export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  onDark?: boolean;
  style?: CSSProperties;
}

export function Wordmark({ size = 'md', onDark = false, style }: WordmarkProps) {
  const fs = size === 'lg' ? 'var(--display-lg)' : size === 'sm' ? 'var(--label-xl)' : 'var(--display-md)';
  return (
    <span
      aria-label="Chop Deck"
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: '.18em', fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: fs,
        lineHeight: 1, letterSpacing: '-.01em', textTransform: 'uppercase', color: onDark ? 'var(--cream)' : 'var(--ink)', ...style,
      }}
    >
      <span style={{ color: 'var(--red)' }}>CHOP</span><span style={{ fontStyle: 'italic' }}>DECK</span>
    </span>
  );
}
