// Hover tooltips for the front panel: a small silkscreen-style plate with the control's purpose and a
// link into the owner's manual. Appears after a short hover, never on touch, never steals the pointer.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { HELP, MANUAL_URL, type HelpEntry } from './help';

interface TipState { entry: HelpEntry; x: number; y: number; below: boolean }
const TipCtx = createContext<{ show: (id: string, el: HTMLElement) => void; hide: () => void } | null>(null);

export function TipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<number | null>(null);
  const show = (id: string, el: HTMLElement) => {
    const entry = HELP[id]; if (!entry) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const below = r.top < 140;
      setTip({ entry, x: Math.min(window.innerWidth - 170, Math.max(170, r.left + r.width / 2)), y: below ? r.bottom + 10 : r.top - 10, below });
    }, 450);
  };
  const hide = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setTip(null); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <TipCtx.Provider value={{ show, hide }}>
      {children}
      {tip && createPortal(<TipCard tip={tip} />, document.body)}
    </TipCtx.Provider>
  );
}

function TipCard({ tip }: { tip: TipState }) {
  const style: CSSProperties = {
    position: 'fixed', left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`, width: 320, zIndex: 50,
    background: 'var(--cream)', color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: 'var(--radius-key)', boxShadow: '0 3px 0 var(--ink)',
    padding: '8px 10px', fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.35, pointerEvents: 'none',
  };
  return (
    <div role="tooltip" style={style}>
      <div style={{ fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{tip.entry.title}</div>
      <div>{tip.entry.text}</div>
      <div style={{ marginTop: 6, fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--red-deep)' }}>
        Owner's manual ▸ {tip.entry.anchor ? `#${tip.entry.anchor}` : ''}
      </div>
    </div>
  );
}

/** Wrap a control: hovering it (with a mouse) shows the tip; clicking with Alt held opens the manual page. */
export function Tip({ id, children, style }: { id: string; children: ReactNode; style?: CSSProperties }) {
  const ctx = useContext(TipCtx);
  const entry = HELP[id];
  const href = `${MANUAL_URL}${entry?.anchor ? `#${entry.anchor}` : ''}`;
  return (
    <span
      style={{ display: 'inline-flex', ...style }}
      onPointerEnter={e => { if (e.pointerType === 'mouse') ctx?.show(id, e.currentTarget); }}
      onPointerLeave={() => ctx?.hide()}
      onPointerDown={e => { ctx?.hide(); if (e.altKey) { e.preventDefault(); e.stopPropagation(); window.open(href, '_blank', 'noopener'); } }}
    >
      {children}
    </span>
  );
}
