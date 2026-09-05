/**
 * Velocity pad — the signature rubber pad. Press to trigger a sound; `lit` mirrors sequencer playback.
 * @startingPoint section="Controls" subtitle="A single MPC pad with silkscreen label" viewport="120x110"
 */
export interface PadProps {
  /** Silkscreen label above the pad, e.g. "PAD 1" */
  label?: string;
  /** Right-aligned note/sub label, e.g. "A8" */
  note?: string;
  /** Rubber colour */
  color?: 'red' | 'grey';
  /** Externally lit (sequencer playing this pad) */
  lit?: boolean;
  /** CSS size override (default var(--pad-size)) */
  size?: string | number;
  onTrigger?: () => void;
  style?: React.CSSProperties;
}
export declare function Pad(props: PadProps): JSX.Element;
