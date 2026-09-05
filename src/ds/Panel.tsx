import type { CSSProperties, ReactNode } from 'react';
import { silk } from './silk';

/** Outlined control group with a silkscreen legend (e.g. "PAD BANK", "LOCATE"). `recessed` sinks it into the panel. */
export interface PanelProps {
  title?: string;
  children?: ReactNode;
  recessed?: boolean;
  onDark?: boolean;
  padding?: string | number;
  style?: CSSProperties;
}

export function Panel({ title, children, recessed = false, onDark = false, padding = 'var(--space-4)', style }: PanelProps) {
  return (
    <fieldset
      style={{
        position: 'relative', margin: 0, padding,
        border: `var(--stroke-w) solid ${onDark ? 'var(--cream)' : 'var(--stroke)'}`,
        borderRadius: 'var(--radius-panel)',
        background: recessed ? (onDark ? 'var(--navy-deep)' : 'var(--surface-panel-recessed)') : 'transparent',
        boxShadow: recessed ? 'var(--recess)' : 'none',
        minWidth: 0, ...style,
      }}
    >
      {title && (
        <legend style={silk(onDark, { padding: '0 6px', marginLeft: 8, fontSize: 'var(--label-sm)' })}>{title}</legend>
      )}
      {children}
    </fieldset>
  );
}
