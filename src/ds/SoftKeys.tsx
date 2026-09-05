import type { CSSProperties } from 'react';

/**
 * Bottom row of six soft-key labels mapped to F1-F6. Empty slots stay blank.
 * Three hardware states per key:
 *  - reversed (default): filled block, jumps to that page
 *  - framed (`framed[i]`): 1px lcd-ink outline, no fill, an executable action
 *  - plain (`active === i`): no fill, no frame, the current page
 */
export interface SoftKeysProps {
  keys?: (string | undefined)[];
  /** Index of the current page: rendered plain */
  active?: number;
  /** Per-key flag: render as a framed (executable) key instead of reversed */
  framed?: boolean[];
  onSelect?: (index: number, key: string) => void;
  style?: CSSProperties;
}

export function SoftKeys({ keys = [], active, framed, onSelect, style }: SoftKeysProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, ...style }}>
      {Array.from({ length: 6 }, (_, i) => {
        const k = keys[i];
        const state = !k ? 'empty' : active === i ? 'plain' : framed?.[i] ? 'framed' : 'reversed';
        return (
          <button
            key={i}
            type="button"
            disabled={!k}
            onClick={() => k && onSelect?.(i, k)}
            style={{
              appearance: 'none', border: 0, height: 20, padding: 0,
              fontFamily: 'var(--font-lcd)', fontSize: 'var(--lcd-sm)', lineHeight: 1, textTransform: 'uppercase',
              background: state === 'reversed' ? 'var(--lcd-cursor)' : 'transparent',
              boxShadow: state === 'framed' ? 'inset 0 0 0 1px var(--lcd-ink)' : 'none',
              color: state === 'empty' ? 'transparent' : state === 'reversed' ? 'var(--surface-lcd)' : 'var(--lcd-ink)',
              cursor: k ? 'pointer' : 'default', borderRadius: 1, outline: 'none', userSelect: 'none',
            }}
          >
            {k || '·'}
          </button>
        );
      })}
    </div>
  );
}
