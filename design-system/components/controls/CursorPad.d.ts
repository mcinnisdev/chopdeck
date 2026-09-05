/** Four-way cursor cluster for navigating LCD fields. */
export interface CursorPadProps {
  onMove?: (dir: 'up' | 'down' | 'left' | 'right') => void;
  label?: string;
  onDark?: boolean;
  style?: React.CSSProperties;
}
export declare function CursorPad(props: CursorPadProps): JSX.Element;
