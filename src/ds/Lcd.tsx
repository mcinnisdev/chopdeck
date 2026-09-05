import type { CSSProperties, ReactNode, Ref } from 'react';
import { silk } from './silk';

/**
 * The green backlit LCD bezel + glass. Every piece of app "content" (file lists, parameters,
 * waveforms, dialogs) is drawn inside it. The glass is `position: relative; overflow: hidden`
 * so an absolutely positioned framebuffer layer can fill it; `glassRef` lets callers measure it.
 */
export interface LcdProps {
  children?: ReactNode;
  /** Silkscreen title above the bezel */
  title?: string;
  /** CSS width of the glass (default: content) */
  width?: string | number;
  /** CSS height of the glass (default: content) */
  height?: string | number;
  fontSize?: string;
  /** Ref to the glass element (for measuring the drawable area) */
  glassRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}

export function Lcd({ children, title, width, height, fontSize = 'var(--lcd-md)', glassRef, style }: LcdProps) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, ...style }}>
      {title && <span style={silk()}>{title}</span>}
      <div style={{ padding: 6, background: 'var(--ink)', borderRadius: 'var(--radius-lcd)', boxShadow: '0 2px 0 var(--ink-3), inset 0 1px 0 rgba(255,255,255,.12)' }}>
        <div
          ref={glassRef}
          role="region"
          aria-label={title || 'LCD'}
          style={{
            position: 'relative', boxSizing: 'border-box', width, height, padding: '8px 10px',
            background: 'var(--surface-lcd)', borderRadius: 2, boxShadow: 'var(--lcd-inset)',
            fontFamily: 'var(--font-lcd)', fontSize, lineHeight: 'var(--lcd-line)', color: 'var(--text-lcd)',
            textTransform: 'uppercase', whiteSpace: 'pre', overflow: 'hidden',
            backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 3px, rgba(0,0,0,.05) 3px 4px)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
