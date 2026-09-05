import React, { useState } from 'react';
import { Led } from './Led.jsx';
const CAPS = { key: { bg: 'var(--surface-key)', fg: 'var(--ink)' }, red: { bg: 'var(--red)', fg: 'var(--ink)' }, amber: { bg: 'var(--led-amber)', fg: 'var(--ink)' }, dark: { bg: 'var(--ink-2)', fg: 'var(--cream)' }, navy: { bg: 'var(--navy-light)', fg: 'var(--cream)' } };
export function HardButton({ label, children, cap = 'key', size = 'md', led, ledOn = false, active = false, disabled = false, onClick, labelPosition = 'bottom', onDark = false, style }) {
  const [down, setDown] = useState(false);
  const c = CAPS[cap] || CAPS.key;
  const dims = size === 'sm' ? { w: 'var(--key-w)', h: 'var(--key-h)', fs: 9 } : size === 'lg' ? { w: 'var(--key-lg-w)', h: 'var(--key-lg-h)', fs: 11 } : { w: 'var(--key-lg-w)', h: 'var(--key-h)', fs: 10 };
  const pressed = down || active;
  // Label row and LED slot are fixed-height, so caps line up across a row whether or not a button has a LED/label.
  const lbl = <span style={{ display: 'inline-flex', alignItems: 'center', height: 9, fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 'var(--label-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)', lineHeight: 1, textAlign: 'center', whiteSpace: 'nowrap' }}>{label}</span>;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: disabled ? .45 : 1, userSelect: 'none', ...style }}>
      {labelPosition === 'top' && lbl}
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 'var(--led-size)' }}>{led && <Led color={led} on={ledOn} />}</span>
      <button type="button" disabled={disabled} aria-label={label} aria-pressed={active}
        onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)} onClick={onClick}
        style={{ appearance: 'none', minWidth: dims.w, height: dims.h, padding: '0 6px', border: 'var(--stroke-w) solid var(--stroke)', borderRadius: 'var(--radius-key)', background: c.bg, color: c.fg, fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: dims.fs, letterSpacing: '.04em', textTransform: 'uppercase', lineHeight: 1,
          boxShadow: pressed ? 'var(--bevel-key-pressed)' : 'var(--bevel-key)', transform: pressed ? 'translateY(var(--press-offset))' : 'none', transition: 'transform var(--dur-press), box-shadow var(--dur-press)', cursor: disabled ? 'not-allowed' : 'pointer', outline: 'none' }}>{children}</button>
      {labelPosition === 'bottom' && lbl}
    </div>
  );
}
