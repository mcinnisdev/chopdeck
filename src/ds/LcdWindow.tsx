import type { CSSProperties, ReactNode } from 'react';
import { SoftKeys } from './SoftKeys';

/** Modal "window" drawn on the LCD (like OPEN WINDOW). Replaces web dialogs, toasts and confirms. Confirm is always the F6 soft key "DO IT". */
export interface LcdWindowProps {
  title: string;
  children?: ReactNode;
  /** Six soft-key labels; default puts CANCEL on F5 and DO IT on F6 */
  keys?: (string | undefined)[];
  /** Per-key framed (executable) flag, passed to SoftKeys */
  framed?: boolean[];
  onKey?: (index: number, key: string) => void;
  style?: CSSProperties;
}

export function LcdWindow({ title, children, keys = ['', '', '', '', 'CANCEL', 'DO IT'], framed, onKey, style }: LcdWindowProps) {
  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: 'absolute', inset: 10, background: 'var(--surface-lcd)', border: '2px solid var(--lcd-ink)',
        boxShadow: '4px 4px 0 var(--lcd-cursor)', padding: '4px 8px 26px',
        fontFamily: 'var(--font-lcd)', fontSize: 'var(--lcd-md)', lineHeight: 1, color: 'var(--text-lcd)',
        textTransform: 'uppercase', whiteSpace: 'pre', ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px -8px 6px', padding: '2px 0', background: 'var(--lcd-ink)', color: 'var(--surface-lcd)' }}>
        {`═ ${title} ═`}
      </div>
      {children}
      <SoftKeys keys={keys} framed={framed} onSelect={onKey} style={{ position: 'absolute', left: 2, right: 2, bottom: 2 }} />
    </div>
  );
}
