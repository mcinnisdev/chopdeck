/** Monochrome LCD waveform with chop markers. Renders inside `Lcd`. */
export interface WaveformProps {
  /** Normalised amplitudes 0–1 (omit for a placeholder drum hit) */
  data?: number[];
  /** Chop start positions 0–1 */
  chops?: number[];
  /** Index of the selected chop (shaded region) */
  selected?: number;
  /** Playhead position 0–1 */
  playhead?: number;
  height?: number;
  width?: number;
  style?: React.CSSProperties;
}
export declare function Waveform(props: WaveformProps): JSX.Element;
