// 16-step grid sequencer for the EZ panel, drawn inside an Lcd. Ported from the design system's StepGrid.
import { Fragment, type CSSProperties } from 'react';

export interface StepGridProps {
  rows: string[];
  steps?: number;
  /** pattern[row][step] */
  pattern: boolean[][];
  /** the step the transport is on, if playing */
  current?: number;
  onToggle?: (row: number, step: number) => void;
  cellHeight?: number;
  style?: CSSProperties;
}

export function StepGrid({ rows, steps = 16, pattern, current, onToggle, cellHeight = 16, style }: StepGridProps) {
  const on = (r: number, s: number) => !!(pattern[r] && pattern[r][s]);
  return (
    <div role="grid" aria-label="Step sequencer" style={{ display: 'grid', gridTemplateColumns: `minmax(64px, auto) repeat(${steps}, minmax(14px, 1fr))`, gap: 2, fontFamily: 'var(--font-lcd)', fontSize: 'var(--lcd-sm, 15px)', lineHeight: 1, color: 'var(--text-lcd)', textTransform: 'uppercase', ...style }}>
      <span aria-hidden />
      {Array.from({ length: steps }, (_, s) => <span key={s} aria-hidden style={{ textAlign: 'center', fontSize: 11, color: s === current ? 'var(--text-lcd)' : 'var(--text-lcd-dim, var(--lcd-dim))', height: 12 }}>{s % 4 === 0 ? (s / 4) % 4 + 1 : '·'}</span>)}
      {rows.map((row, r) => (<Fragment key={r}>
        <span role="rowheader" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 6, alignSelf: 'center' }}>{row}</span>
        {Array.from({ length: steps }, (_, s) => { const a = on(r, s); const cur = s === current; return (
          <button key={s} type="button" role="gridcell" aria-pressed={a} aria-label={`${row} step ${s + 1}`} onClick={() => onToggle?.(r, s)}
            style={{ appearance: 'none', padding: 0, minWidth: 0, height: cellHeight, border: `1px solid ${a ? 'var(--lcd-ink)' : 'var(--lcd-dim)'}`, borderRadius: 1, background: a ? 'var(--lcd-ink)' : cur ? 'rgba(0,0,0,.18)' : (s % 8 < 4 ? 'transparent' : 'rgba(0,0,0,.06)'), boxShadow: a && cur ? 'inset 0 0 0 2px var(--surface-lcd, var(--lcd))' : 'none', cursor: 'pointer', outline: 'none' }} />); })}
      </Fragment>))}
    </div>
  );
}
