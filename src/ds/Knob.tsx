import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { silk } from './silk';

/** Rotary knob (drag up/down or arrow keys). Use for continuous values: volume, gain, tempo. Uncontrolled unless `onChange` is given. */
export interface KnobProps {
  label?: string;
  value?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  /** Draw the 270 degree tick ring + MIN/MAX silkscreen */
  ticks?: boolean;
  onDark?: boolean;
  style?: CSSProperties;
}

export function Knob({ label, value = 50, min = 0, max = 100, onChange, size = 'md', ticks = true, onDark = false, style }: KnobProps) {
  const [v, setV] = useState(value);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const cur = onChange ? value : v;
  const d = size === 'lg' ? 'var(--knob-lg)' : size === 'sm' ? '36px' : 'var(--knob-md)';
  const angle = -135 + ((cur - min) / (max - min)) * 270;
  const set = (n: number) => { const c = Math.max(min, Math.min(max, n)); if (onChange) onChange(c); else setV(c); };
  const onDown = (e: PointerEvent<HTMLDivElement>) => { drag.current = { y: e.clientY, v: cur }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (!drag.current) return; set(drag.current.v + (drag.current.y - e.clientY) * ((max - min) / 150)); };
  const onUp = () => { drag.current = null; };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(cur + (max - min) / 20); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(cur - (max - min) / 20); }
  };
  const ringMask = 'radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px) calc(50% - 1px), transparent calc(50% - 1px))';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none', ...style }}>
      {label && <span style={silk(onDark)}>{label}</span>}
      <div style={{ position: 'relative', width: d, height: d }}>
        {ticks && (
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: -6, borderRadius: '50%',
              background: `conic-gradient(from 225deg, ${onDark ? 'var(--cream)' : 'var(--ink)'} 0 270deg, transparent 270deg)`,
              WebkitMask: ringMask, mask: ringMask, opacity: .6,
            }}
          />
        )}
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Math.round(cur)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          style={{
            width: '100%', height: '100%', borderRadius: '50%', border: 'var(--stroke-w) solid var(--stroke)',
            background: 'radial-gradient(circle at 50% 35%, var(--ink-3), var(--ink) 70%)', boxShadow: 'var(--bevel-knob)',
            cursor: 'ns-resize', outline: 'none', position: 'relative', touchAction: 'none',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute', left: '50%', top: '8%', width: 3, height: '36%', marginLeft: -1.5,
              background: 'var(--cream)', borderRadius: 2, transformOrigin: '50% 117%', transform: `rotate(${angle}deg)`,
              transition: drag.current ? 'none' : 'transform 60ms var(--ease-hw)',
            }}
          />
        </div>
      </div>
      {ticks && (
        <div style={{ display: 'flex', justifyContent: 'space-between', width: `calc(${d} + 12px)` }}>
          <span style={silk(onDark, { opacity: .7 })}>MIN</span>
          <span style={silk(onDark, { opacity: .7 })}>MAX</span>
        </div>
      )}
    </div>
  );
}
