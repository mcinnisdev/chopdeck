/** Vertical slider with a cream cap — note-variation / level control. Uncontrolled unless `onChange` is given. */
export interface FaderProps {
  label?: string;
  value?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  /** Track height in px */
  height?: number;
  onDark?: boolean;
  style?: React.CSSProperties;
}
export declare function Fader(props: FaderProps): JSX.Element;
