// Which front panel is showing: OG (the original workflow) or EZ (the simple one). Both drive the same
// machine, so switching is only a matter of which React tree renders. Remembered per browser; `?panel=ez`
// in the URL wins; a first visit gets EZ on touch and narrow screens, OG everywhere else.
export type PanelId = 'og' | 'ez';
const KEY = 'chopdeck.panel';

function initial(): PanelId {
  if (typeof window === 'undefined') return 'og';
  const fromUrl = new URLSearchParams(location.search).get('panel');
  if (fromUrl === 'ez' || fromUrl === 'og') return fromUrl;
  try { const v = localStorage.getItem(KEY); if (v === 'ez' || v === 'og') return v; } catch { /* private mode */ }
  const touch = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 900;
  return touch ? 'ez' : 'og';
}

class PanelStore {
  private state: PanelId = initial();
  private listeners = new Set<() => void>();
  get snapshot(): PanelId { return this.state; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  set(p: PanelId) {
    if (p === this.state) return;
    this.state = p;
    try { localStorage.setItem(KEY, p); } catch { /* private mode */ }
    // a ?panel= in the address would override the choice on the next reload; drop it
    try { const u = new URL(location.href); if (u.searchParams.has('panel')) { u.searchParams.delete('panel'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } } catch { /* not in a browser */ }
    for (const fn of this.listeners) fn();
  }
}
export const panel = new PanelStore();
