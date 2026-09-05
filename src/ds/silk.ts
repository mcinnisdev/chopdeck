import type { CSSProperties } from 'react';

/** Silkscreen label style: Barlow Condensed 600, uppercase, tracked. Shared by every control. */
export function silk(onDark = false, extra?: CSSProperties): CSSProperties {
  return {
    fontFamily: 'var(--font-label)',
    fontWeight: 600,
    fontSize: 'var(--label-xs)',
    letterSpacing: 'var(--label-tracking)',
    textTransform: 'uppercase',
    color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)',
    lineHeight: 1,
    ...extra,
  };
}
