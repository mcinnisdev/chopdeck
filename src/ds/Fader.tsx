import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { silk } from './silk';

/** Vertical slider with a cream cap: note-variation / level control. Uncontrolled unless `onChange` is given. */
export interface FaderProps {
  label?: string;
  value?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  /** Fired once when the pointer lets go of the cap (pointerup / pointercancel / capture lost) */
  onRelease?: () => void;
  /** Track height in px */
  height?: number;
  onDark?: boolean;
  style?: CSSProperties;
}

export function Fader({ label, value = 64, min = 0, max = 127, onChange, onRelease, height = 140, onDark = false, style }: FaderProps) {
  const [v, setV] = useState(value);
  const track = useRef<HTMLDivElement>(null);
  const held = useRef<number | null>(null);
  const releaseRef = useRef(onRelease);
  releaseRef.current = onRelease;
  const cur = onChange ? value : v;
  const pct = (cur - min) / (max - min);
  const set = (n: number) => { const c = Math.max(min, Math.min(max, n)); if (onChange) onChange(c); else setV(c); };
  const fromY = (clientY: number) => {
    const el = track.current; if (!el) return;
    const r = el.getBoundingClientRect();
    set(min + (1 - (clientY - r.top) / r.height) * (max - min));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (held.current !== null) return;
    held.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    fromY(e.clientY);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (held.current === e.pointerId) fromY(e.clientY); };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (held.current !== e.pointerId) return;
    held.current = null;
    releaseRef.current?.();
  };
  useEffect(() => () => { if (held.current !== null) { held.current = null; releaseRef.current?.(); } }, []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); set(cur + (max - min) / 16); }
    if (e.key === 'ArrowDown') { e.preventDefault(); set(cur - (max - min) / 16); }
  };
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, userSelect: 'none', ...style }}>
      {label && <span style={silk(onDark)}>{label}</span>}
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(cur)}
        aria-orientation="vertical"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={onKey}
        style={{
          position: 'relative', width: 28, height, background: 'var(--ink)', borderRadius: 3, boxShadow: 'var(--recess)',
          cursor: 'pointer', outline: 'none', touchAction: 'none',
          backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 calc(12.5% - 1px), rgba(255,255,255,.25) calc(12.5% - 1px) 12.5%)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute', left: -6, right: -6, height: 22, top: `calc(${(1 - pct) * 100}% - 11px)`,
            background: 'var(--cream)', border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 'var(--radius-key)', boxShadow: 'var(--bevel-key)',
            backgroundImage: 'linear-gradient(to bottom, transparent 45%, var(--ink) 45% 55%, transparent 55%)',
          }}
        />
      </div>
    </div>
  );
}
