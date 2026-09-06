// A pad on the EZ panel: big, named after its sound, red when it holds one. Velocity from where you
// strike it, like the OG pad: near the bottom is soft, near the top is hard.
import { useRef, type CSSProperties } from 'react';

export interface EzPadProps { index: number; name: string; hotkey: string; lit: boolean; onDown(vel: number): void; onUp(): void }

export function EzPad({ index, name, hotkey, lit, onDown, onUp }: EzPadProps) {
  const down = useRef(false);
  const has = name.length > 0;
  const style: CSSProperties = {
    aspectRatio: '1', width: '100%', border: 'var(--stroke-w) solid var(--ink)', borderRadius: 'var(--radius-pad)',
    background: lit ? 'var(--red-lit, #ff8a72)' : has ? 'var(--red)' : 'var(--cream-3)',
    boxShadow: down.current ? 'inset 0 2px 0 rgba(255,255,255,.25), inset 0 -2px 0 rgba(0,0,0,.2), 0 1px 0 var(--ink)' : 'inset 0 3px 0 rgba(255,255,255,.35), inset 0 -6px 0 rgba(0,0,0,.22), 0 4px 0 var(--ink)',
    transform: down.current ? 'translateY(3px)' : 'none', cursor: has ? 'pointer' : 'default', touchAction: 'none', userSelect: 'none', position: 'relative', padding: 0,
    fontFamily: 'var(--font-label)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: has ? 'var(--cream)' : 'var(--ink-3)', textShadow: has ? '0 1px 0 rgba(0,0,0,.45)' : 'none',
  };
  return (
    <button type="button" aria-label={`Pad ${index + 1}${has ? `: ${name}` : ', empty'}`} aria-pressed={lit} style={style}
      onPointerDown={e => { if (!has) return; e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); const f = 1 - (e.clientY - r.top) / r.height; down.current = true; onDown(Math.max(20, Math.min(127, Math.round(40 + f * 87)))); }}
      onPointerUp={() => { if (down.current) { down.current = false; onUp(); } }}
      onPointerCancel={() => { if (down.current) { down.current = false; onUp(); } }}
      onLostPointerCapture={() => { if (down.current) { down.current = false; onUp(); } }}>
      <span style={{ position: 'absolute', left: 10, bottom: 8, right: 10, fontSize: 'clamp(11px, 1.6vw, 16px)', lineHeight: 1.05, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{has ? name : 'empty'}</span>
      <span style={{ position: 'absolute', right: 10, top: 8, fontSize: 11, opacity: .7 }}>{hotkey}</span>
      <span style={{ position: 'absolute', left: 10, top: 8, fontSize: 11, opacity: .7 }}>{index + 1}</span>
    </button>
  );
}
