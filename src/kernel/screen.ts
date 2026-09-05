// Screen definitions: the contract every mode page and window implements.
import { LcdFrame, SoftKeyCell } from '@/lcd/frame';
import { Machine } from '@/model/types';
import { Session } from './session';
import { HwKey } from './keys';

export interface Ctx {
  m: Machine;
  s: Session;
  fw: FirmwareApi;
}

/** What screens are allowed to ask the kernel to do. */
export interface FirmwareApi {
  openWindow(id: string, params?: Record<string, unknown>): void;
  closeWindow(): void;
  closeAllWindows(): void;
  setMode(mode: import('./keys').ModeId, page?: string): void;
  setPage(page: string): void;
  setCursor(screenId: string, index: number): void;
  editName(current: string, commit: (name: string) => void): void;
  confirm(opts: ConfirmOpts): void;
  message(text: string | null): void;
  touch(): void;                       // mark model dirty (re-render, autosave)
  snapshotForUndo(): void;
  // hooks filled in by later phases (audio, transport); kept here so screens can call them now
  transport: TransportApi;
  sound: SoundApi;
  host: HostApi;
}

/** Browser-side services the kernel cannot provide itself. */
export interface HostApi {
  pickFiles(): void;
  /** Hand the viewer a file to save (export to the OS). */
  download(name: string, bytes: Uint8Array, mime?: string): void;
}

/** A note-variation override: the parameter in its own units (tune in tenths of a semitone, decay/attack 0..100, filter -50..50). */
export interface NoteVar { param: import('@/model/types').NvParam; value: number }

/** The sampler as screens see it. A silent implementation is installed until the audio engine boots. */
export interface SoundApi {
  /** Play a program note through a DRUM slot (0..3). Velocity 1..127. nv = note-variation slider value (0..127) or undefined. */
  noteOn(drum: number, note: number, vel: number, nv?: NoteVar, when?: number): void;
  noteOff(drum: number, note: number, when?: number): void;
  /** Metronome click. */
  click(accent: boolean, volume01: number, when?: number): void;
  /** Audio clock in seconds (AudioContext.currentTime), 0 before boot. */
  now(): number;
  /** Audition raw sound data (TRIM / LOAD windows), optionally a range in frames. */
  playSound(sound: string | import('@/model/types').Sound, opts?: { from?: number; to?: number; loop?: boolean }): void;
  stopAll(): void;
  /** Decode a file into PCM; resolves to channels + sample rate. */
  decode(file: Blob): Promise<{ pcm: Float32Array[]; rate: number }>;
  /** Per-note stereo level/pan changed on the mixer; engine updates live voices. */
  mixerChanged(): void;
  ready(): boolean;
}

export interface TransportApi {
  play(fromStart: boolean): void;
  stop(): void;
  setRecord(mode: import('./session').RecordMode): void;
  locate(tick: number): void;
  tap(): void;
  /** Pad performance hooks so recording, note repeat and erase can see the pads. */
  padDown?(pad: number, drum: number, note: number, vel: number, nv?: NoteVar): void;
  padUp?(pad: number): void;
  padPressure?(pad: number, value: number): void;
  setRepeat?(on: boolean): void;
  setErase?(on: boolean): void;
  /** Sequencer position at this instant (fractional ticks), for displays. */
  tickNow?(): number;
  /** Jump to another sequence immediately (NEXT SEQ > SUDDEN). */
  switchSequence?(seq: number): void;
}

export interface ConfirmOpts {
  title: string;
  lines: string[];              // body text rows (max 4)
  doIt: () => void;
  doItLabel?: string;           // default 'DO IT'
  cancelLabel?: string;         // default 'CANCEL'
  doItKey?: 4 | 5;              // 0-based soft key index of DO IT (F5 = 4, F6 = 5). default 4
  extra?: { index: number; label: string; run: () => void }; // e.g. ALL SQ on F3
}

export interface Field {
  id: string;
  row: number;
  col: number;                          // column of the value
  width: number;                        // value width; the cursor inverts exactly this many cells
  label?: string;                       // printed immediately left of the value
  get(ctx: Ctx): string;                // display value; the kernel pads/clips to width
  wheel?(ctx: Ctx, delta: number): void;
  enter?(ctx: Ctx, digits: string): void;   // numeric entry commit
  window?(ctx: Ctx): void;              // OPEN WINDOW here
  pad?(ctx: Ctx, pad: number, vel: number): void;   // pad hit while cursor is here
  name?: boolean;                       // wheel/pad opens the Name window (kernel handles) via nameCommit
  nameCommit?(ctx: Ctx, name: string): void;
  /** Raw value handed to the Name window (defaults to get()). */
  nameValue?(ctx: Ctx): string;
  /** SHIFT + LEFT/RIGHT step for large numeric fields. */
  coarse?: number;
  dim?: boolean;
  hidden?(ctx: Ctx): boolean;
  /** Fields that are display-only can still be landed on unless `skip` is true. */
  skip?: boolean;
}

export type SoftKeyDef = SoftKeyCell & {
  press?(ctx: Ctx): void;
  release?(ctx: Ctx): void;
};

export interface ScreenDef {
  id: string;
  /** Window title; presence marks the definition as a window. */
  title?: string;
  /** Window rows (title row + body). Default 6 (rows 1..6). */
  windowRows?: number;
  fields(ctx: Ctx): Field[];
  draw(ctx: Ctx, f: LcdFrame): void;   // static text and graphics; kernel draws labels/values after this
  softKeys(ctx: Ctx): (SoftKeyDef | null)[];
  /** Screen-specific hardware key handling. Return true when handled. */
  onKey?(ctx: Ctx, key: HwKey, down: boolean): boolean;
  /** Pad hit not consumed by the cursor field. Return true when handled. */
  onPad?(ctx: Ctx, pad: number, vel: number, down: boolean): boolean;
  onEnter?(ctx: Ctx): void;
  onLeave?(ctx: Ctx): void;
}
