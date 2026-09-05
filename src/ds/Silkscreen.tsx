import type { CSSProperties, ElementType, ReactNode } from 'react';
import { silk } from './silk';

/** Silkscreen text: uppercase condensed label printed on the panel. All non-LCD text in the product is silkscreen. */
export interface SilkscreenProps {
  children?: ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  onDark?: boolean;
  align?: 'left' | 'center' | 'right';
  as?: keyof JSX.IntrinsicElements;
  style?: CSSProperties;
}

const FS: Record<NonNullable<SilkscreenProps['size']>, string> = {
  xs: 'var(--label-xs)', sm: 'var(--label-sm)', md: 'var(--label-md)', lg: 'var(--label-lg)', xl: 'var(--label-xl)',
};

export function Silkscreen({ children, size = 'sm', onDark = false, align = 'left', as = 'span', style }: SilkscreenProps) {
  const Tag = as as ElementType;
  return <Tag style={silk(onDark, { display: 'block', fontSize: FS[size], textAlign: align, ...style })}>{children}</Tag>;
}
