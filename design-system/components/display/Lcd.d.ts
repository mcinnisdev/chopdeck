/**
 * The green backlit LCD: every piece of app "content" — file lists, parameters, waveforms, dialogs — is drawn inside it.
 * @startingPoint section="Display" subtitle="Green LCD with soft-key bar" viewport="520x220"
 */
export interface LcdProps {
  children?: React.ReactNode;
  /** Silkscreen title above the bezel */
  title?: string;
  /** Character columns (sets min width) */
  cols?: number;
  /** Text rows (sets min height) */
  rows?: number;
  fontSize?: string;
  style?: React.CSSProperties;
}
export declare function Lcd(props: LcdProps): JSX.Element;
/** A label:value pair on the LCD; `selected` renders the inverted cursor block. */
export interface LcdFieldProps { label?: string; value: React.ReactNode; selected?: boolean; width?: string | number; style?: React.CSSProperties; }
export declare function LcdField(props: LcdFieldProps): JSX.Element;
/** Bottom row of six inverted soft-key labels mapped to F1–F6. Empty slots stay blank. */
export interface SoftKeysProps { keys?: (string | undefined)[]; active?: number; onSelect?: (index: number, key: string) => void; style?: React.CSSProperties; }
export declare function SoftKeys(props: SoftKeysProps): JSX.Element;
