// One record in the samples library: a sleeve with a cover area and a typed sticker. Ported from the design system.
import type { CSSProperties, ReactNode } from 'react';

export interface SleeveProps { title: string; source?: string; year?: number | string; duration?: string; cover?: string; children?: ReactNode; size?: number; selected?: boolean; onClick?: () => void; style?: CSSProperties }

export function Sleeve({ title, source, year, duration, cover, children, size = 200, selected = false, onClick, style }: SleeveProps) {
  const lbl: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 600, letterSpacing: 'var(--label-tracking, .08em)', textTransform: 'uppercase', lineHeight: 1.15, color: 'var(--ink)' };
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={title} aria-pressed={onClick ? selected : undefined} onClick={onClick} onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      style={{ position: 'relative', width: size, height: size, flex: '0 0 auto', background: 'var(--surface-sleeve, #E8D9B5)', border: 'var(--stroke-w) solid var(--ink)', borderRadius: 2, boxSizing: 'border-box', boxShadow: selected ? '0 0 0 2px var(--cream), 0 0 0 4px var(--ink), 4px 6px 0 rgba(0,0,0,.35)' : '3px 4px 0 rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.4)', cursor: onClick ? 'pointer' : 'default', userSelect: 'none', overflow: 'hidden', ...style }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'var(--texture-grain)', opacity: .8, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 8, bottom: 46, background: 'var(--kraft-2, #A9864F)', border: '1px solid var(--ink)', overflow: 'hidden' }}>
        {cover ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : children || <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', ...lbl, fontSize: 9, color: 'var(--sleeve-paper, #E8D9B5)', textAlign: 'center', padding: 12, background: 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,.08) 6px 7px)' }}>{source ?? 'RECORD'}</div>}
      </div>
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 32, background: 'var(--white)', border: '1px solid var(--ink)', padding: '3px 5px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: 'rotate(-.6deg)' }}>
        <div style={{ ...lbl, fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ ...lbl, fontSize: 8, color: 'var(--ink-3)', display: 'flex', justifyContent: 'space-between', gap: 6 }}><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{source}</span><span style={{ whiteSpace: 'nowrap' }}>{[year, duration].filter(Boolean).join(' · ')}</span></div>
      </div>
    </div>
  );
}
