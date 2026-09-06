// The listening deck in the samples library: spins while a record previews; the tonearm moves inward with progress.
import { useEffect, type CSSProperties } from 'react';

let injected = false;
export interface TurntableProps { playing?: boolean; progress?: number; label?: string; labelColor?: string; size?: number; rpm?: number; style?: CSSProperties }

export function Turntable({ playing = false, progress = 0, label, labelColor = 'var(--red)', size = 220, rpm = 33, style }: TurntableProps) {
  useEffect(() => { if (injected) return; injected = true; const st = document.createElement('style'); st.textContent = '@keyframes cd-spin{to{transform:rotate(360deg)}}'; document.head.appendChild(st); }, []);
  const disc = size * .86; const arm = playing || progress > 0 ? 14 + progress * 22 : -18;
  const lbl: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 7, letterSpacing: '.06em', textTransform: 'uppercase', lineHeight: 1.1, color: 'var(--cream)', textAlign: 'center' };
  return (
    <div role="img" aria-label={`Turntable ${playing ? 'playing' : 'stopped'}${label ? ': ' + label : ''}`} style={{ position: 'relative', width: size, height: size, flex: '0 0 auto', background: 'var(--ink-2, #2b2b2b)', border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-panel)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.5)', boxSizing: 'border-box', ...style }}>
      <div aria-hidden style={{ position: 'absolute', left: (size - disc) / 2 - 8, top: (size - disc) / 2, width: disc, height: disc, borderRadius: '50%', background: '#4a4a4a', boxShadow: '0 3px 0 var(--ink)' }} />
      <div aria-hidden style={{ position: 'absolute', left: (size - disc) / 2 - 8, top: (size - disc) / 2, width: disc, height: disc, borderRadius: '50%', background: 'repeating-radial-gradient(circle at 50% 50%, #151414 0 1.5px, #3A3A3A 1.5px 2px)', boxShadow: 'inset 0 0 0 2px var(--ink), inset 0 0 30px rgba(255,255,255,.06)', animation: playing ? `cd-spin ${60 / rpm}s linear infinite` : 'none' }}>
        <div style={{ position: 'absolute', inset: '35%', borderRadius: '50%', background: labelColor, border: '1px solid var(--ink)', display: 'grid', placeItems: 'center', padding: 4, boxSizing: 'border-box' }}><span style={lbl}>{label}</span><span style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: 'var(--ink)' }} /></div>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(from 200deg, transparent 0 40%, rgba(255,255,255,.08) 48%, transparent 56%, transparent 80%, rgba(255,255,255,.06) 88%, transparent 96%)', pointerEvents: 'none' }} />
      </div>
      <div aria-hidden style={{ position: 'absolute', right: 10, top: 10, width: 22, height: 22, borderRadius: '50%', background: '#8a8a8a', border: 'var(--stroke-w) solid var(--ink)', boxShadow: 'inset 0 2px 0 rgba(255,255,255,.3), inset 0 -2px 0 rgba(0,0,0,.4)' }} />
      <div aria-hidden style={{ position: 'absolute', right: 19, top: 19, width: 5, height: size * .62, background: '#b8b8b8', border: '1px solid var(--ink)', borderRadius: 3, transformOrigin: '50% 3px', transform: `rotate(${arm}deg)`, transition: 'transform 300ms ease-out', boxShadow: '2px 2px 0 rgba(0,0,0,.35)' }}>
        <div style={{ position: 'absolute', left: -6, bottom: -4, width: 16, height: 22, background: 'var(--ink)', border: '1px solid var(--ink)', borderRadius: 2 }} />
      </div>
      <div aria-hidden style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: playing ? 'var(--led-green)' : '#3a3a3a', boxShadow: playing ? '0 0 6px var(--led-green)' : 'none' }} /><span style={{ ...lbl, fontSize: 8 }}>{rpm} RPM</span></div>
    </div>
  );
}
