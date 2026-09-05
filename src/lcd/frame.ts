// The LCD is a fixed character framebuffer. Screens draw into a frame; the renderer paints it.
// 48 columns x 8 rows. Row 7 (0-based) is always the soft-key row.

export const LCD_COLS = 48;
export const LCD_ROWS = 8;
export const SOFTKEY_ROW = LCD_ROWS - 1;

export const ATTR_NONE = 0;
export const ATTR_INVERSE = 1;   // cursor / reversed soft key / window title
export const ATTR_DIM = 2;       // secondary text
export const ATTR_FRAME = 4;     // framed soft key (outline)
export const ATTR_BLINK = 8;     // SOLO label while active

export interface Graphic {
  kind: 'waveform' | 'meter' | 'bar' | 'pan' | 'fader' | 'box';
  row: number; col: number; rows: number; cols: number;   // cell rectangle
  data?: Float32Array | number[];
  value?: number;      // 0..1 for meter/fader/pan
  marks?: number[];    // 0..1 positions (zone lines, thresholds)
  selected?: [number, number]; // 0..1 shaded range
  playhead?: number;   // 0..1
}

export interface LcdFrame {
  cols: number;
  rows: number;
  chars: Uint16Array;    // char codes, row-major
  attrs: Uint8Array;
  graphics: Graphic[];
}

export function newFrame(cols = LCD_COLS, rows = LCD_ROWS): LcdFrame {
  const chars = new Uint16Array(cols * rows).fill(32);
  return { cols, rows, chars, attrs: new Uint8Array(cols * rows), graphics: [] };
}

export function clearFrame(f: LcdFrame): void {
  f.chars.fill(32); f.attrs.fill(0); f.graphics.length = 0;
}

/** Write text at row/col, clipped to the frame. Returns the column after the last char written. */
export function text(f: LcdFrame, row: number, col: number, s: string, attr = ATTR_NONE): number {
  if (row < 0 || row >= f.rows) return col;
  const base = row * f.cols;
  let c = col;
  for (let i = 0; i < s.length; i++, c++) {
    if (c < 0) continue;
    if (c >= f.cols) break;
    f.chars[base + c] = s.charCodeAt(i);
    f.attrs[base + c] = attr;
  }
  return c;
}

/** Fill a rectangle with a character and attribute. */
export function fill(f: LcdFrame, row: number, col: number, rows: number, cols: number, ch = ' ', attr = ATTR_NONE): void {
  const code = ch.charCodeAt(0);
  for (let r = row; r < row + rows; r++) {
    if (r < 0 || r >= f.rows) continue;
    for (let c = col; c < col + cols; c++) {
      if (c < 0 || c >= f.cols) continue;
      f.chars[r * f.cols + c] = code; f.attrs[r * f.cols + c] = attr;
    }
  }
}

/** OR an attribute onto a run of cells (used to invert the cursor field). */
export function setAttr(f: LcdFrame, row: number, col: number, len: number, attr: number): void {
  if (row < 0 || row >= f.rows) return;
  for (let c = Math.max(0, col); c < Math.min(f.cols, col + len); c++) f.attrs[row * f.cols + c] |= attr;
}

/** Soft-key row: six labels of up to 7 chars centred in 8-column slots. */
export interface SoftKeyCell { label: string; kind: 'action' | 'page' | 'current' | 'none'; blink?: boolean }
export function softKeys(f: LcdFrame, keys: SoftKeyCell[]): void {
  const slot = f.cols / 6; // 8
  fill(f, SOFTKEY_ROW, 0, 1, f.cols, ' ', ATTR_NONE);
  keys.slice(0, 6).forEach((k, i) => {
    if (!k || k.kind === 'none' || !k.label) return;
    const label = k.label.slice(0, slot - 1);
    const start = i * slot + Math.floor((slot - label.length) / 2);
    const attr = (k.kind === 'page' ? ATTR_INVERSE : k.kind === 'action' ? ATTR_FRAME : ATTR_NONE) | (k.blink ? ATTR_BLINK : 0);
    // pad the cell to a fixed 7-wide block so reversed/framed keys read as buttons
    fill(f, SOFTKEY_ROW, i * slot, 1, slot - 1, ' ', attr);
    text(f, SOFTKEY_ROW, start, label, attr);
  });
}

/** Debug/golden render: rows as strings. Inverse cells are wrapped with [ ] only when `marks` is true. */
export function frameToLines(f: LcdFrame, marks = false): string[] {
  const out: string[] = [];
  for (let r = 0; r < f.rows; r++) {
    let line = '';
    for (let c = 0; c < f.cols; c++) {
      const i = r * f.cols + c;
      const ch = String.fromCharCode(f.chars[i]);
      line += marks && (f.attrs[i] & ATTR_INVERSE) ? ch.toLowerCase() === ch && ch !== ' ' ? ch.toUpperCase() : ch : ch;
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out;
}

export function frameToString(f: LcdFrame): string { return frameToLines(f).join('\n'); }

/** Draw a window box: title bar (inverse) on `row`, body rows below, all within the frame. */
export function windowBox(f: LcdFrame, title: string, row = 1, rows = 6): void {
  fill(f, row, 0, rows, f.cols, ' ', ATTR_NONE);
  const t = ` ${title} `;
  const start = Math.floor((f.cols - t.length) / 2);
  fill(f, row, 0, 1, f.cols, '=', ATTR_INVERSE);
  text(f, row, start, t, ATTR_INVERSE);
}
