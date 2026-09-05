import { useEffect, useRef, type CSSProperties } from 'react';
import { HardButton } from './HardButton';
import { silk } from './silk';

export type CursorDir = 'up' | 'down' | 'left' | 'right';

/** Four-way cursor cluster for navigating LCD fields. Holding a direction auto-repeats (400 ms delay, then every 80 ms). */
export interface CursorPadProps {
  onMove?: (dir: CursorDir) => void;
  label?: string;
  onDark?: boolean;
  style?: CSSProperties;
}

const REPEAT_DELAY = 400;
const REPEAT_EVERY = 80;

export function CursorPad({ onMove, label = 'CURSOR', onDark = false, style }: CursorPadProps) {
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const timers = useRef<{ delay?: number; repeat?: number }>({});

  const stop = () => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
    timers.current = {};
  };
  const start = (dir: CursorDir) => {
    stop();
    moveRef.current?.(dir);
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => moveRef.current?.(dir), REPEAT_EVERY);
    }, REPEAT_DELAY);
  };
  useEffect(() => stop, []);

  const k = (dir: CursorDir, ch: string) => (
    <HardButton size="sm" onPress={() => start(dir)} onRelease={stop}>{ch}</HardButton>
  );
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none', ...style }}>
      <span style={silk(onDark)}>{label}</span>
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto', gap: 2, padding: 6,
          background: 'var(--cream-2)', border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 'var(--radius-panel)', boxShadow: 'var(--recess)',
        }}
      >
        <span /> {k('up', '▲')} <span />
        {k('left', '◀')} <span style={{ width: 'var(--key-w)' }} /> {k('right', '▶')}
        <span /> {k('down', '▼')} <span />
      </div>
    </div>
  );
}
