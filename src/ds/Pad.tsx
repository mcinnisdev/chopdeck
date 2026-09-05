import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { silk } from './silk';

/**
 * Velocity pad: the signature rubber pad. Strike to trigger a sound; `lit` mirrors sequencer playback.
 * Velocity (1..127) comes from where the pad is struck (top edge 40, bottom edge 127) or, on a real
 * pressure-capable device, from `pressure`. `fixedVelocity` (FULL LEVEL) overrides both.
 * Each pad tracks its own pointer, so multi-touch chords work.
 */
export interface PadProps {
  /** Silkscreen label above the pad, e.g. "PAD 1" */
  label?: string;
  /** Right-aligned note/sub label, e.g. "A8" */
  note?: string;
  /** Name-entry characters printed in the top-right corner of the pad face, e.g. "AB" */
  letters?: string;
  /** Computer-keyboard key printed in the bottom-left corner of the pad face, e.g. "Z" */
  hotkey?: string;
  /** Rubber colour */
  color?: 'red' | 'grey';
  /** Externally lit (sequencer playing this pad) */
  lit?: boolean;
  /** CSS size override (default var(--pad-size)) */
  size?: string | number;
  /** Always send this velocity (FULL LEVEL) */
  fixedVelocity?: number;
  /** Pad struck; velocity 1..127 */
  onTrigger?: (velocity: number) => void;
  /** Pad let go (fires exactly once per press) */
  onRelease?: () => void;
  /** Aftertouch while held, 0..1 (real pressure, or vertical position on non-pressure devices) */
  onPressure?: (value: number) => void;
  style?: CSSProperties;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** Real pressure hardware reports something other than the 0.5 mouse/touch default. */
const hasPressure = (e: PointerEvent) => e.pressure > 0 && e.pressure !== 0.5;

export function Pad({ label = 'PAD 1', note, letters, hotkey, color = 'red', lit = false, size, fixedVelocity, onTrigger, onRelease, onPressure, style }: PadProps) {
  const [down, setDown] = useState(false);
  const held = useRef<number | null>(null);
  const last = useRef(-1);
  const cbs = useRef({ onTrigger, onRelease, onPressure });
  cbs.current = { onTrigger, onRelease, onPressure };
  const active = down || lit;
  const bg = color === 'grey' ? 'var(--surface-pad-alt)' : 'var(--surface-pad)';
  const s = size ?? 'var(--pad-size)';

  /** 0 at the top edge, 1 at the bottom edge. */
  const posT = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return r.height ? clamp((e.clientY - r.top) / r.height, 0, 1) : 1;
  };
  const posVelocity = (e: PointerEvent<HTMLButtonElement>) => Math.round(40 + 87 * posT(e));
  const velocityOf = (e: PointerEvent<HTMLButtonElement>) => {
    if (fixedVelocity != null) return clamp(Math.round(fixedVelocity), 1, 127);
    if (hasPressure(e)) return clamp(Math.round(1 + 126 * e.pressure), 1, 127);
    return posVelocity(e);
  };

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || held.current !== null) return;
    held.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDown(true);
    last.current = hasPressure(e) ? e.pressure : posVelocity(e) / 127;
    cbs.current.onTrigger?.(velocityOf(e));
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (held.current !== e.pointerId || !cbs.current.onPressure) return;
    const v = hasPressure(e) ? e.pressure : posVelocity(e) / 127;
    if (Math.abs(v - last.current) < 1 / 127) return;
    last.current = v;
    cbs.current.onPressure(v);
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (held.current !== e.pointerId) return;
    held.current = null;
    setDown(false);
    cbs.current.onRelease?.();
  };
  useEffect(() => () => { if (held.current !== null) { held.current = null; cbs.current.onRelease?.(); } }, []);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, width: s, userSelect: 'none', ...style }}>
      <div style={silk(false, { display: 'flex', justifyContent: 'space-between' })}>
        <span>{label}</span>{note && <span style={{ opacity: .7 }}>{note}</span>}
      </div>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        style={{
          appearance: 'none', position: 'relative', width: s, height: s, padding: 0,
          border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 'var(--radius-pad)',
          background: active ? (color === 'grey' ? 'var(--cream)' : 'var(--red-soft)') : bg,
          boxShadow: active ? (color === 'grey' ? 'var(--bevel-pad-pressed)' : 'var(--bevel-pad-pressed), var(--pad-glow)') : 'var(--bevel-pad)',
          transform: active ? 'translateY(var(--pad-press-offset))' : 'none',
          transition: 'transform var(--dur-press), box-shadow var(--dur-press), background var(--dur-led)',
          cursor: 'pointer', outline: 'none', userSelect: 'none', touchAction: 'none',
        }}
      >
        {hotkey && (
          <span aria-hidden style={silk(false, { position: 'absolute', bottom: 4, left: 5, fontSize: 9, color: 'var(--ink)', opacity: .6, pointerEvents: 'none' })}>{hotkey}</span>
        )}
        {letters && (
          <span
            aria-hidden
            style={silk(false, { position: 'absolute', top: 4, right: 5, fontSize: 7, color: 'var(--ink)', opacity: .55, pointerEvents: 'none' })}
          >
            {letters}
          </span>
        )}
      </button>
    </div>
  );
}
