import React from 'react';
const G = { red: ['var(--led-red)', 'var(--led-glow-red)'], green: ['var(--led-green)', 'var(--led-glow-green)'], amber: ['var(--led-amber)', 'var(--led-glow-amber)'] };
export function Led({ color = 'red', on = false, size, label, style }) {
  const [c, glow] = G[color] || G.red;
  const s = size || 'var(--led-size)';
  const dot = <span aria-hidden style={{ display: 'inline-block', width: s, height: s, borderRadius: '50%', background: on ? c : 'var(--led-off)', boxShadow: on ? `${glow}, inset 0 0 1px rgba(255,255,255,.8)` : 'inset 0 1px 1px rgba(0,0,0,.6)', transition: 'background var(--dur-led), box-shadow var(--dur-led)' }} />;
  if (!label) return <span style={{ display: 'inline-flex', ...style }}>{dot}</span>;
  return <span role="status" aria-label={`${label} ${on ? 'on' : 'off'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 'var(--label-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: 'var(--text-silkscreen)', ...style }}>{dot}{label}</span>;
}
