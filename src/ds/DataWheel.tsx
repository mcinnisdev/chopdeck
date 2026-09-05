import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { silk } from './silk';

/**
 * Endless rotary encoder drawn like the big DATA knob. Emits integer detents (clockwise positive):
 *  - circular drag around the centre (`detentPx` px of rim travel = 1 detent; fast successive detents accelerate x2 / x4)
 *  - mouse wheel (100 units of deltaY = 1 detent; scrolling down = negative)
 *  - keyboard: ArrowUp/Right +1, ArrowDown/Left -1, Shift+arrow +/-10
 */
export interface DataWheelProps {
  /** Silkscreen label above the knob (default "DATA") */
  label?: string;
  /** Signed integer detents; acceleration is already applied */
  onTurn: (detents: number) => void;
  onDark?: boolean;
  style?: CSSProperties;
  /** Rim travel in px per detent (default 10) */
  detentPx?: number;
}

const WHEEL_UNITS_PER_DETENT = 100;
const DEG = 180 / Math.PI;

export function DataWheel({ label = 'DATA', onTurn, onDark = false, style, detentPx = 10 }: DataWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; cx: number; cy: number; last: number } | null>(null);
  const remainder = useRef(0); // radians not yet turned into a detent
  const wheelAcc = useRef(0); // deltaY units not yet turned into a detent
  const lastDetentAt = useRef(0);
  const turnRef = useRef(onTurn);
  turnRef.current = onTurn;

  const radius = () => ((ref.current?.getBoundingClientRect().width ?? 96) / 2) || 48;
  /** Radians of rotation per detent, so `detentPx` is real rim travel. */
  const perDetent = () => detentPx / radius();
  const spin = (detents: number) => setAngle((a) => a + detents * perDetent() * DEG);

  /** Drag emission: successive detents within 30 ms count x4, within 60 ms x2. */
  const emitAccelerated = (n: number) => {
    const now = performance.now();
    const dt = now - lastDetentAt.current;
    lastDetentAt.current = now;
    const m = dt < 30 ? 4 : dt < 60 ? 2 : 1;
    turnRef.current(n * m);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    drag.current = { id: e.pointerId, cx, cy, last: Math.atan2(e.clientY - cy, e.clientX - cx) };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setDragging(true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
    let delta = a - d.last;
    if (delta > Math.PI) delta -= 2 * Math.PI; else if (delta < -Math.PI) delta += 2 * Math.PI;
    d.last = a;
    setAngle((v) => v + delta * DEG); // the dimple just follows the finger
    remainder.current += delta;
    const per = perDetent();
    const n = Math.trunc(remainder.current / per);
    if (n) { remainder.current -= n * per; emitAccelerated(n); }
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  // React registers wheel listeners passively, so attach natively to be able to preventDefault.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? WHEEL_UNITS_PER_DETENT / 3 : e.deltaMode === 2 ? WHEEL_UNITS_PER_DETENT : 1;
      wheelAcc.current -= e.deltaY * unit;
      const n = Math.trunc(wheelAcc.current / WHEEL_UNITS_PER_DETENT);
      if (n) { wheelAcc.current -= n * WHEEL_UNITS_PER_DETENT; spin(n); turnRef.current(n); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [detentPx]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    let n = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') n = step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') n = -step;
    if (!n) return;
    e.preventDefault();
    spin(n);
    turnRef.current(n);
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none', ...style }}>
      {label && <span style={silk(onDark)}>{label}</span>}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label || 'DATA'}
        aria-valuenow={Math.round(angle)}
        aria-valuetext="endless"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        style={{
          width: 'var(--knob-lg)', height: 'var(--knob-lg)', borderRadius: '50%', border: 'var(--stroke-w) solid var(--stroke)',
          background: 'radial-gradient(circle at 50% 35%, var(--ink-3), var(--ink) 70%)', boxShadow: 'var(--bevel-knob)',
          cursor: dragging ? 'grabbing' : 'grab', outline: 'none', position: 'relative', touchAction: 'none', userSelect: 'none',
        }}
      >
        <div aria-hidden style={{ position: 'absolute', inset: 0, transform: `rotate(${angle}deg)`, transition: dragging ? 'none' : 'transform 60ms var(--ease-hw)' }}>
          <div
            style={{
              position: 'absolute', left: '50%', top: '10%', width: 14, height: 14, marginLeft: -7, borderRadius: '50%',
              background: 'var(--cream)', boxShadow: 'inset 0 2px 3px rgba(0,0,0,.45), inset 0 -1px 0 rgba(255,255,255,.6)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
