// Hover tooltips for the front panel: a small silkscreen-style plate with the control's purpose and a
// link into the owner's manual. Appears after a short hover, never on touch, never steals the pointer.
// TIPS can be switched off; the choice is remembered in this browser.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { HELP, MANUAL_URL, type HelpEntry } from './help';
import { isDesktop, desktopManual } from './desktop';

interface TipState { entry: HelpEntry; x: number; y: number; below: boolean }
interface TipApi {
  enabled: boolean;
  setEnabled(on: boolean): void;
  show(entry: HelpEntry | string, el: HTMLElement): void;
  hide(): void;
}
const TipCtx = createContext<TipApi | null>(null);
const STORAGE_KEY = 'chopdeck.tips';

function readEnabled(): boolean { try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; } }

export function TipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);
  const [enabled, setEnabledState] = useState(readEnabled);
  const timer = useRef<number | null>(null);
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const setEnabled = (on: boolean) => { setEnabledState(on); try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode */ } if (!on) hide(); };
  const show = (e: HelpEntry | string, el: HTMLElement) => {
    if (!enabledRef.current) return;
    const entry = typeof e === 'string' ? HELP[e] : e; if (!entry) return;
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
    <TipCtx.Provider value={{ enabled, setEnabled, show, hide }}>
      {children}
      {tip && createPortal(<TipCard tip={tip} />, document.body)}
    </TipCtx.Provider>
  );
}

export function useTips(): TipApi { const ctx = useContext(TipCtx); if (!ctx) throw new Error('TipProvider missing'); return ctx; }

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
      data-tip={id}
      style={{ display: 'inline-flex', ...style }}
      onPointerEnter={e => { if (e.pointerType === 'mouse') ctx?.show(id, e.currentTarget); }}
      onPointerLeave={() => ctx?.hide()}
      onPointerDown={e => { ctx?.hide(); if (e.altKey) { e.preventDefault(); e.stopPropagation(); if (isDesktop) void desktopManual(entry?.anchor ? `#${entry.anchor}` : ''); else window.open(href, '_blank', 'noopener'); } }}
    >
      {children}
    </span>
  );
}
