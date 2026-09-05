/** Outlined control group with a silkscreen legend (e.g. "PAD BANK", "LOCATE"). `recessed` sinks it into the panel. */
export interface PanelProps {
  title?: string;
  children?: React.ReactNode;
  recessed?: boolean;
  onDark?: boolean;
  padding?: string | number;
  style?: React.CSSProperties;
}
export declare function Panel(props: PanelProps): JSX.Element;
/** Silkscreen text — uppercase condensed label printed on the panel. All non-LCD text in the product is silkscreen. */
export interface SilkscreenProps { children?: React.ReactNode; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; onDark?: boolean; align?: 'left' | 'center' | 'right'; as?: keyof JSX.IntrinsicElements; style?: React.CSSProperties; }
export declare function Silkscreen(props: SilkscreenProps): JSX.Element;
/** Typographic "CHOP DECK" wordmark. Use the pad-grid logo (assets/logo.webp) as the mark; this is the type lockup beside it. */
export interface WordmarkProps { size?: 'sm' | 'md' | 'lg'; onDark?: boolean; style?: React.CSSProperties; }
export declare function Wordmark(props: WordmarkProps): JSX.Element;
