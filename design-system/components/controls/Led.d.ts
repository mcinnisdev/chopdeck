/** Status LED. Red = record, green = play/active, amber = attention. Off state is a dark, unlit dome. */
export interface LedProps {
  color?: 'red' | 'green' | 'amber';
  on?: boolean;
  /** Diameter (default var(--led-size)) */
  size?: string | number;
  /** Optional silkscreen label to the right */
  label?: string;
  style?: React.CSSProperties;
}
export declare function Led(props: LedProps): JSX.Element;
