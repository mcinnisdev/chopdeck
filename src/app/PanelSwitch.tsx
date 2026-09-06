// The OG · EZ switch: a chunky slide switch on the silkscreen, the kind that picks a voltage on the
// back of an amplifier. Left is OG, right is EZ. Lives next to the wordmark on both panels.
import { useSyncExternalStore, type CSSProperties } from 'react';
import { panel } from './panel';

export function PanelSwitch({ onDark = true }: { onDark?: boolean }) {
  const which = useSyncExternalStore(fn => panel.subscribe(fn), () => panel.snapshot);
  const ez = which === 'ez';
  const lbl: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: onDark ? 'var(--cream)' : 'var(--ink)', lineHeight: 1, userSelect: 'none' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...lbl, opacity: ez ? .55 : 1 }}>OG</span>
      <button type="button" role="switch" aria-checked={ez} aria-label="EZ mode" onClick={() => panel.set(ez ? 'og' : 'ez')}
        style={{ position: 'relative', width: 54, height: 24, padding: 0, cursor: 'pointer', background: 'var(--ink)', border: '2px solid var(--ink-3, #333)', borderRadius: 6, boxShadow: 'inset 0 2px 4px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.12)' }}>
        {/* the slot */}
        <span aria-hidden style={{ position: 'absolute', left: 4, right: 4, top: 9, height: 2, background: 'rgba(255,255,255,.08)', borderRadius: 1 }} />
        {/* the knob: cream, ridged, with a travel of 26px */}
        <span aria-hidden style={{ position: 'absolute', top: 1, left: ez ? 27 : 1, width: 22, height: 18, borderRadius: 4, backgroundColor: '#f3e9cf', backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 3px, rgba(0,0,0,.16) 3px 4px), linear-gradient(180deg, #fff8e6, #f3e9cf 55%, #d9cfb3)', backgroundSize: '70% 55%, 100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center, 0 0', border: '1px solid var(--ink)', boxSizing: 'border-box', boxShadow: '0 2px 0 rgba(0,0,0,.6), inset 0 -2px 0 rgba(0,0,0,.15)', transition: 'left .12s ease-out' }} />
      </button>
      <span style={{ ...lbl, opacity: ez ? 1 : .55, color: ez ? 'var(--led-amber)' : lbl.color }}>EZ</span>
    </span>
  );
}
