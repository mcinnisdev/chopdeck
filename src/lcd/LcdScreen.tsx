// Paints an LcdFrame as 8 rows of monospace runs. The glass measures itself and sizes the font so
// exactly 48 columns fit; the grid never changes, only the cell size.
import { useLayoutEffect, useRef, useState, useEffect, CSSProperties, memo } from 'react';
import { LcdFrame, ATTR_INVERSE, ATTR_DIM, ATTR_FRAME, ATTR_BLINK, SOFTKEY_ROW } from './frame';
import { drawGraphics } from './graphics';

/** VT323 advance width / font-size, measured on a real span inside the glass so it tracks the loaded font. */
function measureRatio(host: HTMLElement): number {
  // a DOM probe measured with offsetWidth: layout width, unaffected by the chassis scale transform,
  // and laid out by the same text engine as the rows (canvas metrics can disagree with it by a few percent)
  const probe = document.createElement('span');
  probe.textContent = '000000000000000000000000000000000000000000000000';
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit;font-size:100px;line-height:1;left:0;top:0';
  host.appendChild(probe);
  const w = probe.offsetWidth / 48;
  host.removeChild(probe);
  if (w > 20 && w < 80) return w / 100;
  try {
    const c = document.createElement('canvas').getContext('2d');
    if (c) { c.font = `100px ${getComputedStyle(host).fontFamily || 'VT323, monospace'}`; const cw = c.measureText('0000000000').width / 10; if (cw > 20 && cw < 80) return cw / 100; }
  } catch { /* fall through */ }
  return 0.5;
}

interface Run { text: string; attr: number }
function rowRuns(f: LcdFrame, r: number): Run[] {
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (let c = 0; c < f.cols; c++) {
    const i = r * f.cols + c;
    const ch = String.fromCharCode(f.chars[i]);
    const attr = f.attrs[i];
    if (cur && cur.attr === attr) cur.text += ch;
    else { cur = { text: ch, attr }; runs.push(cur); }
  }
  return runs;
}

function runStyle(attr: number): CSSProperties | undefined {
  if (!attr) return undefined;
  const s: CSSProperties = {};
  if (attr & ATTR_INVERSE) { s.background = 'var(--lcd-ink)'; s.color = 'var(--surface-lcd)'; }
  if (attr & ATTR_DIM) s.color = attr & ATTR_INVERSE ? 'var(--lcd-2)' : 'var(--text-lcd-dim)';
  if (attr & ATTR_FRAME) { s.boxShadow = 'inset 0 0 0 1px var(--lcd-ink)'; }
  if (attr & ATTR_BLINK) s.animation = 'lcd-blink 1s steps(2, start) infinite';
  return s;
}

export interface LcdScreenProps {
  frame: LcdFrame;
  onSoftKey?: (index: number) => void;
  /** Mouse over a soft-key slot (index) or off the row (null), with the slot element for positioning. */
  onSoftKeyHover?: (index: number | null, el: HTMLElement) => void;
  /** Mouse over a content cell (rows 0..6), or null when the pointer leaves the row. */
  onCellHover?: (cell: { row: number; col: number } | null, el: HTMLElement) => void;
  style?: CSSProperties;
}

export const LcdScreen = memo(function LcdScreen({ frame, onSoftKey, onSoftKeyHover, onCellHover, style }: LcdScreenProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(20);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const ratio = measureRatio(el); setFontSize(Math.floor((el.clientWidth / frame.cols) / ratio * 0.985 * 100) / 100); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    // re-fit once the LCD font is actually available (fonts.ready can resolve before the webfont is requested)
    document.fonts?.load('100px VT323').then(fit).catch(() => {});
    document.fonts?.ready.then(fit).catch(() => {});
    const onDone = () => fit();
    document.fonts?.addEventListener?.('loadingdone', onDone);
    return () => { ro.disconnect(); document.fonts?.removeEventListener?.('loadingdone', onDone); };
  }, [frame.cols]);

  // feedback: if a rendered row still overflows the glass (glyph rounding at small sizes), shrink to fit
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const over = el.scrollWidth / Math.max(1, el.clientWidth);
    if (over > 1.003) setFontSize(f => Math.floor((f / over) * 100) / 100);
  }, [fontSize, frame]);

  const rows = [];
  for (let r = 0; r < frame.rows; r++) rows.push(rowRuns(frame, r));

  // graphics layer
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current; const el = ref.current; if (!cv || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth, h = fontSize * frame.rows;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!frame.graphics.length) return;
    const cs = getComputedStyle(el);
    const ink = cs.getPropertyValue('--lcd-ink').trim() || '#1C2814', dim = cs.getPropertyValue('--lcd-dim').trim() || '#5C6B44', glass = cs.getPropertyValue('--lcd').trim() || '#B7C58C';
    drawGraphics(g, frame.graphics, { cellW: w / frame.cols, cellH: fontSize }, ink, dim, glass);
  }, [frame, fontSize]);

  return (
    <div ref={ref} style={{ width: '100%', fontFamily: 'var(--font-lcd)', fontSize, lineHeight: 1, color: 'var(--text-lcd)', whiteSpace: 'pre', textTransform: 'none', userSelect: 'none', position: 'relative', ...style }}>
      <style>{'@keyframes lcd-blink{50%{opacity:0}}'}</style>
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: fontSize * frame.rows, pointerEvents: 'none', imageRendering: 'pixelated' }} />
      {rows.map((runs, r) => (
        <div key={r} style={{ height: fontSize, display: 'flex' }}
          onPointerMove={r === SOFTKEY_ROW || !onCellHover ? undefined : e => { if (e.pointerType !== 'mouse') return; const rect = e.currentTarget.getBoundingClientRect(); const col = Math.floor(((e.clientX - rect.left) / rect.width) * frame.cols); onCellHover({ row: r, col }, e.currentTarget); }}
          onPointerLeave={r === SOFTKEY_ROW || !onCellHover ? undefined : e => onCellHover(null, e.currentTarget)}>
          {r === SOFTKEY_ROW && onSoftKey
            ? Array.from({ length: 6 }, (_, i) => {
                const slot = frame.cols / 6;
                const seg = runs.length ? sliceRuns(runs, i * slot, slot) : [];
                return <span key={i} onPointerDown={() => onSoftKey(i)} onPointerEnter={e => { if (e.pointerType === 'mouse') onSoftKeyHover?.(i, e.currentTarget); }} onPointerLeave={e => onSoftKeyHover?.(null, e.currentTarget)} style={{ cursor: 'pointer', display: 'inline-block' }}>{seg.map((run, j) => <span key={j} style={runStyle(run.attr)}>{run.text}</span>)}</span>;
              })
            : runs.map((run, j) => <span key={j} style={runStyle(run.attr)}>{run.text}</span>)}
        </div>
      ))}
    </div>
  );
});

function sliceRuns(runs: Run[], start: number, len: number): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const rs = pos, re = pos + r.text.length;
    const s = Math.max(rs, start), e = Math.min(re, start + len);
    if (e > s) out.push({ text: r.text.slice(s - rs, e - rs), attr: r.attr });
    pos = re;
    if (pos >= start + len) break;
  }
  return out;
}
