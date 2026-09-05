/** Rotary knob (drag up/down or arrow keys). Use for continuous values: volume, gain, tempo. Uncontrolled unless `onChange` is given. */
export interface KnobProps {
  label?: string;
  value?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  /** Draw the 270° tick ring + MIN/MAX silkscreen */
  ticks?: boolean;
  onDark?: boolean;
  style?: React.CSSProperties;
}
export declare function Knob(props: KnobProps): JSX.Element;
