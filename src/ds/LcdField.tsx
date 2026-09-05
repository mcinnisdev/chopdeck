import type { CSSProperties, ReactNode } from 'react';

/** A label:value pair on the LCD; `selected` renders the inverted cursor block. */
export interface LcdFieldProps {
  label?: string;
  value: ReactNode;
  selected?: boolean;
  width?: string | number;
  style?: CSSProperties;
}

export function LcdField({ label, value, selected = false, width, style }: LcdFieldProps) {
  return (
    <span style={{ display: 'inline-flex', gap: '1ch', ...style }}>
      {label && <span style={{ color: 'var(--text-lcd-dim)' }}>{label}:</span>}
      <span
        style={{
          minWidth: width,
          background: selected ? 'var(--lcd-cursor)' : 'transparent',
          color: selected ? 'var(--surface-lcd)' : 'inherit',
          padding: '0 2px', margin: '0 -2px',
        }}
      >
        {value}
      </span>
    </span>
  );
}
