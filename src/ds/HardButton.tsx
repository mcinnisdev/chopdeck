import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Led } from './Led';
import { silk } from './silk';

/**
 * Hardware push button with silkscreen label. All actions in Chop Deck are hard buttons, never web buttons.
 * Press physics: `onPress` on pointerdown, `onRelease` exactly once on pointerup / pointercancel / capture lost
 * (pointer capture keeps a release outside the cap honest). `onClick` still fires as usual.
 */
export interface HardButtonProps {
  /** Silkscreen label printed on the panel */
  label?: string;
  /** Second, dimmer silkscreen line under the label: the key's SHIFT function (e.g. "ASSIGN" under "AFTER") */
  shiftLabel?: string;
  /** Optional text printed on the cap itself (keep to 1-6 chars) */
  children?: ReactNode;
  /** Cap colour: white key (default), red (REC / OVERDUB), amber (OPEN WINDOW), dark, navy */
  cap?: 'key' | 'red' | 'amber' | 'dark' | 'navy';
  size?: 'sm' | 'md' | 'lg';
  /** Override the cap's min-width (e.g. a wider PLAY START cap) */
  width?: number | string;
  /** Adds a status LED above the cap (the LED slot is always reserved so caps stay aligned) */
  led?: 'red' | 'green' | 'amber';
  ledOn?: boolean;
  /** Latched/pressed look */
  active?: boolean;
  disabled?: boolean;
  /** Default 'bottom': all hard-button labels sit under the cap so rows line up */
  labelPosition?: 'top' | 'bottom';
  /** Use cream silkscreen when placed on the navy chassis */
  onDark?: boolean;
  onClick?: () => void;
  /** Pointer went down on the cap */
  onPress?: () => void;
  /** Pointer let go (fires exactly once per press, even if released off the cap) */
  onRelease?: () => void;
  style?: CSSProperties;
}

const CAPS: Record<NonNullable<HardButtonProps['cap']>, { bg: string; fg: string }> = {
  key: { bg: 'var(--surface-key)', fg: 'var(--ink)' },
  red: { bg: 'var(--red)', fg: 'var(--ink)' },
  amber: { bg: 'var(--led-amber)', fg: 'var(--ink)' },
  dark: { bg: 'var(--ink-2)', fg: 'var(--cream)' },
  navy: { bg: 'var(--navy-light)', fg: 'var(--cream)' },
};

export function HardButton({
  label, shiftLabel, children, cap = 'key', size = 'md', width, led, ledOn = false, active = false, disabled = false,
  onClick, onPress, onRelease, labelPosition = 'bottom', onDark = false, style,
}: HardButtonProps) {
  const [down, setDown] = useState(false);
  const held = useRef<number | null>(null);
  const cbs = useRef({ onPress, onRelease });
  cbs.current = { onPress, onRelease };
  const c = CAPS[cap] ?? CAPS.key;
  const dims = size === 'sm'
    ? { w: 'var(--key-w)', h: 'var(--key-h)', fs: 9 }
    : size === 'lg'
      ? { w: 'var(--key-lg-w)', h: 'var(--key-lg-h)', fs: 11 }
      : { w: 'var(--key-lg-w)', h: 'var(--key-h)', fs: 10 };
  const pressed = down || active;

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0 || held.current !== null) return;
    held.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDown(true);
    cbs.current.onPress?.();
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (held.current !== e.pointerId) return;
    held.current = null;
    setDown(false);
    cbs.current.onRelease?.();
  };
  // A press still held at unmount is released so hold semantics (SHIFT, NOTE REPEAT) never stick.
  useEffect(() => () => { if (held.current !== null) { held.current = null; cbs.current.onRelease?.(); } }, []);

  // Label row (and optional SHIFT row) and LED slot are fixed-height, so caps line up across a row
  // whether or not a button has a LED/label. The SHIFT slot is only reserved when provided.
  const lbl = (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={silk(onDark, { display: 'inline-flex', alignItems: 'center', height: 9, textAlign: 'center', whiteSpace: 'nowrap' })}>{label}</span>
      {shiftLabel && (
        <span style={silk(onDark, { display: 'inline-flex', alignItems: 'center', height: 8, fontSize: 8, opacity: .6, textAlign: 'center', whiteSpace: 'nowrap' })}>{shiftLabel}</span>
      )}
    </span>
  );

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: disabled ? .45 : 1, userSelect: 'none', ...style }}>
      {labelPosition === 'top' && lbl}
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 'var(--led-size)' }}>{led && <Led color={led} on={ledOn} />}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        onPointerDown={onDown}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onClick={onClick}
        style={{
          appearance: 'none', minWidth: width ?? dims.w, height: dims.h, padding: '0 6px',
          border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 'var(--radius-key)', background: c.bg, color: c.fg,
          fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: dims.fs, letterSpacing: '.04em', textTransform: 'uppercase', lineHeight: 1,
          boxShadow: pressed ? 'var(--bevel-key-pressed)' : 'var(--bevel-key)',
          transform: pressed ? 'translateY(var(--press-offset))' : 'none',
          transition: 'transform var(--dur-press), box-shadow var(--dur-press)',
          cursor: disabled ? 'not-allowed' : 'pointer', outline: 'none', userSelect: 'none', touchAction: 'none',
        }}
      >
        {children}
      </button>
      {labelPosition === 'bottom' && lbl}
    </div>
  );
}
