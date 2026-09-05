/** Modal "window" drawn on the LCD (like OPEN WINDOW). Replaces web dialogs, toasts and confirms. Confirm is always the F6 soft key "DO IT". */
export interface LcdWindowProps {
  title: string;
  children?: React.ReactNode;
  /** Six soft-key labels; default puts CANCEL on F5 and DO IT on F6 */
  keys?: (string | undefined)[];
  onKey?: (index: number, key: string) => void;
  style?: React.CSSProperties;
}
export declare function LcdWindow(props: LcdWindowProps): JSX.Element;
