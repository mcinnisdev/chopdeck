/**
 * Hardware push button with silkscreen label. All actions in Chop Deck are hard buttons — never web buttons.
 * @startingPoint section="Controls" subtitle="Silkscreen-labelled hardware key" viewport="140x80"
 */
export interface HardButtonProps {
  /** Silkscreen label printed on the panel */
  label?: string;
  /** Optional text printed on the cap itself (keep to 1–6 chars) */
  children?: React.ReactNode;
  /** Cap colour: white key (default), red (REC / OVERDUB), amber (OPEN WINDOW), dark, navy */
  cap?: 'key' | 'red' | 'amber' | 'dark' | 'navy';
  size?: 'sm' | 'md' | 'lg';
  /** Adds a status LED above the cap (the LED slot is always reserved so caps stay aligned) */
  led?: 'red' | 'green' | 'amber';
  ledOn?: boolean;
  /** Latched/pressed look */
  active?: boolean;
  disabled?: boolean;
  /** Default 'bottom' — all hard-button labels sit under the cap so rows line up */
  labelPosition?: 'top' | 'bottom';
  /** Use cream silkscreen when placed on the navy chassis */
  onDark?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function HardButton(props: HardButtonProps): JSX.Element;
