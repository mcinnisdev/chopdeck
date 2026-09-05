import type { CSSProperties } from 'react';
import { silk } from './silk';

/** Status LED. Red = record, green = play/active, amber = attention. Off state is a dark, unlit dome. */
export interface LedProps {
  color?: 'red' | 'green' | 'amber';
  on?: boolean;
  /** Diameter (default var(--led-size)) */
  size?: string | number;
  /** Optional silkscreen label to the right */
  label?: string;
  style?: CSSProperties;
}

const G: Record<NonNullable<LedProps['color']>, [string, string]> = {
  red: ['var(--led-red)', 'var(--led-glow-red)'],
  green: ['var(--led-green)', 'var(--led-glow-green)'],
  amber: ['var(--led-amber)', 'var(--led-glow-amber)'],
};

export function Led({ color = 'red', on = false, size, label, style }: LedProps) {
  const [c, glow] = G[color] ?? G.red;
  const s = size ?? 'var(--led-size)';
  const dot = (
    <span
      aria-hidden
      style={{
        display: 'inline-block', width: s, height: s, borderRadius: '50%',
        background: on ? c : 'var(--led-off)',
        boxShadow: on ? `${glow}, inset 0 0 1px rgba(255,255,255,.8)` : 'inset 0 1px 1px rgba(0,0,0,.6)',
        transition: 'background var(--dur-led), box-shadow var(--dur-led)',
      }}
    />
  );
  if (!label) return <span style={{ display: 'inline-flex', ...style }}>{dot}</span>;
  return (
    <span
      role="status"
      aria-label={`${label} ${on ? 'on' : 'off'}`}
      style={silk(false, { display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: undefined, ...style })}
    >
      {dot}{label}
    </span>
  );
}
