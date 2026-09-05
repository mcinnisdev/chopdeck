import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { silk } from './silk';

export type CursorDir = 'up' | 'down' | 'left' | 'right';

/**
 * Four-way cursor cluster for navigating LCD fields, built like the hardware's: four chunky wedge keys that
 * together form one rounded square on a dark plinth, each with a chevron. Holding a direction auto-repeats
 * (400 ms delay, then every 80 ms).
 */
export interface CursorPadProps {
  onMove?: (dir: CursorDir) => void;
  label?: string;
  onDark?: boolean;
  /** Cluster width in px (height is 0.85 of it). Default 104. */
  size?: number;
  style?: CSSProperties;
}

const REPEAT_DELAY = 400;
const REPEAT_EVERY = 80;

// wedge outlines in percent of the cluster box; the gaps between them show the plinth through
const WEDGE: Record<CursorDir, string> = {
  up: 'polygon(2% 0%, 98% 0%, 64% 36%, 36% 36%)',
  down: 'polygon(36% 64%, 64% 64%, 98% 100%, 2% 100%)',
  left: 'polygon(0% 2%, 34% 38%, 34% 62%, 0% 98%)',
  right: 'polygon(66% 38%, 100% 2%, 100% 98%, 66% 62%)',
};
// chevron centres and rotation (a "^" drawn pointing up, rotated per direction)
const CHEVRON: Record<CursorDir, { left: string; top: string; rot: number }> = {
  up: { left: '50%', top: '17%', rot: 0 },
  down: { left: '50%', top: '83%', rot: 180 },
  left: { left: '16%', top: '50%', rot: -90 },
  right: { left: '84%', top: '50%', rot: 90 },
};

export function CursorPad({ onMove, label = 'CURSOR', onDark = false, size = 104, style }: CursorPadProps) {
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const timers = useRef<{ delay?: number; repeat?: number }>({});
  const [down, setDown] = useState<CursorDir | null>(null);

  const stop = () => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
    timers.current = {};
    setDown(null);
  };
  const start = (dir: CursorDir) => {
    stop();
    setDown(dir);
    moveRef.current?.(dir);
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => moveRef.current?.(dir), REPEAT_EVERY);
    }, REPEAT_DELAY);
  };
  useEffect(() => stop, []);

  const w = size, h = Math.round(size * 0.85);
  const wedge = (dir: CursorDir) => {
    const pressed = down === dir;
    const c = CHEVRON[dir];
    const onDown = (e: PointerEvent<HTMLButtonElement>) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); start(dir); };
    return (
      <button
        key={dir}
        type="button"
        aria-label={`${label} ${dir}`}
        onPointerDown={onDown}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        style={{
          appearance: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, border: 0, outline: 'none',
          clipPath: WEDGE[dir], cursor: 'pointer', touchAction: 'none',
          // the cap: light grey key with a lit top edge and a shaded bottom edge; pressed sinks and darkens
          background: pressed
            ? 'linear-gradient(to bottom, rgba(0,0,0,.16), rgba(0,0,0,.06) 40%, rgba(255,255,255,.15)), var(--steel-2)'
            : 'linear-gradient(to bottom, rgba(255,255,255,.75), rgba(255,255,255,0) 32%, rgba(0,0,0,.12) 88%, rgba(0,0,0,.2)), var(--steel)',
          transition: 'background var(--dur-press)',
        }}
      >
        <svg aria-hidden width="16" height="10" viewBox="0 0 16 10" style={{ position: 'absolute', left: c.left, top: c.top, transform: `translate(-50%, -50%) rotate(${c.rot}deg) translateY(${pressed ? 1 : 0}px)`, overflow: 'visible' }}>
          <polyline points="2,8.5 8,2 14,8.5" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none', ...style }}>
      <span style={silk(onDark)}>{label}</span>
      {/* the plinth: dark, recessed, rounded; the four keys sit inside a thin rim */}
      <div style={{ position: 'relative', width: w, height: h, padding: 5, boxSizing: 'border-box', background: 'var(--ink-2)', border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 12, boxShadow: 'inset 0 2px 4px rgba(0,0,0,.6), 0 2px 0 var(--ink)' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 6, overflow: 'hidden', background: 'var(--ink)' }}>
          {(['up', 'down', 'left', 'right'] as CursorDir[]).map(wedge)}
          {/* the hub between the keys */}
          <div aria-hidden style={{ position: 'absolute', left: '36%', top: '38%', width: '28%', height: '24%', background: 'var(--ink-2)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.7)', borderRadius: 2, pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  );
}
