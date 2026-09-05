// The firmware kernel: owns machine + session, routes all input, renders the LCD frame.
import { Machine, Sequence, NAME_LEN, TIMING_TICKS } from '@/model/types';
import { barStartTick, tickToBBT, sequenceLengthTicks } from '@/model/time';
import { rpad } from '@/model/format';
import {
  LcdFrame, newFrame, text, fill, setAttr, softKeys, windowBox, SoftKeyCell,
  ATTR_NONE, ATTR_INVERSE, ATTR_DIM,
} from '@/lcd/frame';
import { HwKey, ModeId, SHIFT_MODES, isDigit, softKeyIndex } from './keys';
import { Session, newSession, RecordMode } from './session';
import { Ctx, Field, FirmwareApi, ScreenDef, ConfirmOpts, TransportApi, SoftKeyDef, SoundApi, HostApi, NoteVar } from './screen';
import { sixteenLevelValue, sliderValue } from '@/audio/params';
import { Transport } from '@/seq/transport';
import { ManualClock } from '@/seq/clock';
import { TRACK_TYPES } from '@/model/types';

const NAME_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&\'()+,-.;=@[]^_`{}~';
export const PAD_LETTERS = ['AB', 'CD', 'EF', 'GH', 'IJ', 'KL', 'MN', 'OP', 'QR', 'ST', 'UV', 'WX', 'YZ', '&#', '-_.', '0123456789'];
const PAD_CYCLE_MS = 800;

export interface PadHooks {
  padPressure?(pad: number, value: number): void;
}

/** Installed until the audio engine boots. */
export class NullSound implements SoundApi {
  noteOn() {}
  noteOff() {}
  click() {}
  now() { return 0; }
  playSound() {}
  stopAll() {}
  async decode(): Promise<{ pcm: Float32Array[]; rate: number }> { throw new Error('audio engine not running'); }
  mixerChanged() {}
  ready() { return false; }
}

export class Firmware {
  m: Machine;
  s: Session;
  version = 0;
  transport: TransportApi;
  sound: SoundApi = new NullSound();
  host: HostApi = { pickFiles() {}, download() {} };
  /** MIDI output, installed by the app; the transport reads it through the host. */
  midi?: import('@/midi/io').MidiOutApi;
  hooks: PadHooks = {};
  private heldPads = new Map<number, { drum: number; note: number }>();
  private gotoCombo = false;
  private screens = new Map<string, ScreenDef>();
  private listeners = new Set<() => void>();
  private undoSnapshot: { seq: number; data: Sequence } | null = null;
  private undoRedo: { seq: number; data: Sequence } | null = null;

  constructor(machine: Machine, screens: ScreenDef[] = []) {
    this.m = machine;
    this.s = newSession();
    // the real sequencer with a manual clock; the app swaps in a WorkerClock
    this.transport = new Transport(this, new ManualClock());
    for (const d of screens) this.register(d);
    this.register(confirmWindow);
  }

  register(def: ScreenDef) { this.screens.set(def.id, def); }
  has(id: string) { return this.screens.has(id); }

  // ---------- store plumbing ----------
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  touch() { this.version++; for (const l of this.listeners) l(); }

  // ---------- API given to screens ----------
  readonly api: FirmwareApi = {
    openWindow: (id, params) => { if (!this.screens.has(id)) return; this.s.windows.push({ id, params }); this.s.numeric = null; this.screens.get(id)?.onEnter?.(this.ctx()); this.touch(); },
    closeWindow: () => { const w = this.s.windows.pop(); if (w) this.screens.get(w.id)?.onLeave?.(this.ctx()); this.s.numeric = null; this.touch(); },
    closeAllWindows: () => { while (this.s.windows.length) this.api.closeWindow(); },
    setMode: (mode, page) => this.setMode(mode, page),
    setPage: (page) => { this.s.page[this.s.mode] = page; this.s.numeric = null; this.touch(); },
    setCursor: (screenId, index) => { this.s.cursor[screenId] = index; this.touch(); },
    editName: (current, commit) => this.beginNameEdit(current, commit),
    confirm: (opts) => this.api.openWindow('CONFIRM', { opts }),
    message: (t) => { this.s.message = t; this.touch(); },
    touch: () => this.touch(),
    snapshotForUndo: () => this.snapshotForUndo(),
    get transport() { return undefined as unknown as TransportApi; },
    get sound() { return undefined as unknown as SoundApi; },
    get host() { return undefined as unknown as HostApi; },
  };

  ctx(): Ctx {
    // transport is looked up live so Phase 2 can swap the implementation
    const api = Object.create(this.api, { transport: { get: () => this.transport }, sound: { get: () => this.sound }, host: { get: () => this.host } }) as FirmwareApi;
    return { m: this.m, s: this.s, fw: api };
  }

  // ---------- screen resolution ----------
  modeScreenId(): string {
    const page = this.s.page[this.s.mode];
    const paged = page ? `${this.s.mode}/${page}` : null;
    return paged && this.screens.has(paged) ? paged : this.s.mode;
  }
  modeScreen(): ScreenDef | undefined { return this.screens.get(this.modeScreenId()); }
  topWindow(): ScreenDef | undefined { const w = this.s.windows[this.s.windows.length - 1]; return w ? this.screens.get(w.id) : undefined; }
  current(): ScreenDef | undefined { return this.topWindow() ?? this.modeScreen(); }
  windowParams(): Record<string, unknown> { return this.s.windows[this.s.windows.length - 1]?.params ?? {}; }

  setMode(mode: ModeId, page?: string) {
    const ctx = this.ctx();
    this.modeScreen()?.onLeave?.(ctx);
    this.api.closeAllWindows();
    this.s.mode = mode;
    if (page !== undefined) this.s.page[mode] = page;
    this.s.numeric = null;
    this.s.message = null;
    this.modeScreen()?.onEnter?.(this.ctx());
    this.touch();
  }

  // ---------- fields & cursor ----------
  visibleFields(def: ScreenDef, ctx: Ctx): Field[] {
    return def.fields(ctx).filter(f => !f.hidden?.(ctx)).sort((a, b) => a.row - b.row || a.col - b.col);
  }
  cursorIndex(def: ScreenDef, fields: Field[]): number {
    const i = this.s.cursor[def.id] ?? 0;
    return Math.min(Math.max(0, i), Math.max(0, fields.length - 1));
  }
  cursorField(): { def: ScreenDef; field: Field | undefined; fields: Field[] } | null {
    const def = this.current(); if (!def) return null;
    const ctx = this.ctx();
    const fields = this.visibleFields(def, ctx).filter(f => !f.skip);
    return { def, field: fields[this.cursorIndex(def, fields)], fields };
  }
  /** The field (label or value) drawn at an LCD cell, on the top window or the mode screen. */
  fieldAt(row: number, col: number): { def: ScreenDef; field: Field } | null {
    const def = this.current(); if (!def) return null;
    const ctx = this.ctx();
    for (const f of this.visibleFields(def, ctx)) {
      if (f.row !== row) continue;
      const start = f.col - (f.label?.length ?? 0);
      if (col >= start && col < f.col + f.width) return { def, field: f };
    }
    return null;
  }

  moveCursor(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') {
    const cf = this.cursorField(); if (!cf || !cf.field) return;
    const { def, fields } = cf;
    const i = this.cursorIndex(def, fields);
    let next = i;
    if (dir === 'LEFT') next = Math.max(0, i - 1);
    else if (dir === 'RIGHT') next = Math.min(fields.length - 1, i + 1);
    else {
      const cur = fields[i];
      const rows = dir === 'UP' ? fields.filter(f => f.row < cur.row) : fields.filter(f => f.row > cur.row);
      if (!rows.length) return;
      const targetRow = dir === 'UP' ? Math.max(...rows.map(f => f.row)) : Math.min(...rows.map(f => f.row));
      const cands = fields.filter(f => f.row === targetRow);
      const best = cands.reduce((b, f) => Math.abs(f.col - cur.col) < Math.abs(b.col - cur.col) ? f : b, cands[0]);
      next = fields.indexOf(best);
    }
    this.s.cursor[def.id] = next;
    this.s.numeric = null;
    this.touch();
  }

  // ---------- input: keys ----------
  key(k: HwKey, down = true) {
    const s = this.s;
    if (down) s.held.add(k); else s.held.delete(k);
    if (k === 'SHIFT') { s.shift = down; this.touch(); return; }

    if (s.nameEdit) { if (down) this.nameKey(k); return; }

    const ctx = this.ctx();
    const def = this.current();

    // soft keys go to the current screen (window first)
    const si = softKeyIndex(k);
    if (si >= 0) {
      const sk = def?.softKeys(ctx)[si];
      if (down) sk?.press?.(ctx); else sk?.release?.(ctx);
      this.touch();
      return;
    }

    if (def?.onKey?.(ctx, k, down)) { this.touch(); return; }
    if (!down) {
      if (k === 'TAP') this.transport.setRepeat?.(false);
      if (k === 'ERASE') this.transport.setErase?.(false);
      if (k === 'GOTO' && !this.gotoCombo && !s.windows.length) this.api.openWindow('LOCATE');
      this.touch();
      return;
    }

    // mode select
    if (isDigit(k) && s.shift) { this.setMode(SHIFT_MODES[k]); return; }

    switch (k) {
      case 'MAIN': this.setMode('MAIN'); return;
      case 'WINDOW': {
        if (s.windows.length) { this.api.closeWindow(); return; }
        const cf = this.cursorField();
        cf?.field?.window?.(ctx);
        this.touch();
        return;
      }
      case 'ENTER': {
        const cf = this.cursorField();
        if (s.numeric != null && cf?.field?.enter) cf.field.enter(ctx, s.numeric);
        s.numeric = null;
        this.touch();
        return;
      }
      case 'UP': case 'DOWN': case 'LEFT': case 'RIGHT': {
        const cf = this.cursorField();
        if (s.shift && cf?.field?.coarse && (k === 'LEFT' || k === 'RIGHT')) {
          cf.field.wheel?.(ctx, k === 'RIGHT' ? cf.field.coarse : -cf.field.coarse);
          this.touch();
          return;
        }
        this.moveCursor(k);
        return;
      }
      case 'PLAY': this.transport.play(false); return;
      case 'PLAY_START': this.transport.play(true); return;
      case 'STOP': this.transport.stop(); return;
      case 'REC': this.transport.setRecord('REC'); return;
      case 'OVERDUB': this.transport.setRecord('OVERDUB'); return;
      case 'TAP': this.transport.tap(); this.transport.setRepeat?.(true); return;
      case 'ERASE':
        if (s.playing) this.transport.setErase?.(true);
        else if (s.mode === 'MAIN' && !s.windows.length) this.api.openWindow('MAIN/ERASE');
        return;
      case 'GOTO': this.gotoCombo = false; return;
      case 'BANK_A': case 'BANK_B': case 'BANK_C': case 'BANK_D':
        s.padBank = ['BANK_A', 'BANK_B', 'BANK_C', 'BANK_D'].indexOf(k); this.touch(); return;
      case 'FULL_LEVEL': s.fullLevel = !s.fullLevel; this.touch(); return;
      case 'SIXTEEN_LEVELS':
        if (s.sixteenLevels) { s.sixteenLevels = false; this.touch(); } else this.api.openWindow('SIXTEEN_LEVELS');
        return;
      case 'AFTER':
        if (s.shift) this.setMode('ASSIGN'); else { s.after = !s.after; this.touch(); }
        return;
      case 'NEXT_SEQ': this.setMode(s.mode === 'NEXT_SEQ' ? 'MAIN' : 'NEXT_SEQ'); return;
      case 'TRACK_MUTE': this.setMode(s.mode === 'TRACK_MUTE' ? 'MAIN' : 'TRACK_MUTE'); return;
      case 'BAR_L': case 'BAR_R': case 'STEP_L': case 'STEP_R': this.locateKey(k); return;
      case 'UNDO': this.undo(); return;
      default:
        if (isDigit(k)) {
          const cf = this.cursorField();
          if (cf?.field?.enter) { s.numeric = ((s.numeric ?? '') + k).slice(-10); this.touch(); }
          return;
        }
    }
  }

  private locateKey(k: 'BAR_L' | 'BAR_R' | 'STEP_L' | 'STEP_R') {
    const s = this.s; const seq = this.m.sequences[s.seq];
    const goto = s.held.has('GOTO');
    if (goto) this.gotoCombo = true;
    const len = sequenceLengthTicks(seq);
    if (k === 'BAR_L' || k === 'BAR_R') {
      if (goto) { this.transport.locate(k === 'BAR_L' ? 0 : len); return; }
      const bbt = tickToBBT(seq.tsigs, s.now);
      const bar0 = bbt.bar - 1;
      const start = barStartTick(seq.tsigs, bar0);
      if (k === 'BAR_L') this.transport.locate(s.now > start ? start : barStartTick(seq.tsigs, Math.max(0, bar0 - 1)));
      else this.transport.locate(barStartTick(seq.tsigs, bar0 + 1));
      return;
    }
    if (goto) {
      const ev = seq.tracks[s.track].events;
      const target = k === 'STEP_L' ? [...ev].reverse().find(e => e.tick < s.now) : ev.find(e => e.tick > s.now);
      if (target) this.transport.locate(target.tick);
      return;
    }
    const step = TIMING_TICKS[this.m.timing];
    this.transport.locate(k === 'STEP_L' ? Math.max(0, s.now - step) : s.now + step);
  }

  // ---------- input: pads / wheel / slider ----------
  padDown(pad: number, vel: number) {
    const s = this.s;
    const v = s.fullLevel ? 127 : Math.max(1, Math.min(127, Math.round(vel)));
    s.lastPad = pad; s.lastVel = v;
    if (s.nameEdit) { this.namePad(pad); return; }
    const ctx = this.ctx();
    const cf = this.cursorField();
    if (cf?.field?.name) { this.beginNameEdit(cf.field.nameValue?.(ctx) ?? cf.field.get(ctx), n => cf.field!.nameCommit?.(ctx, n)); this.namePad(pad); return; }
    if (cf?.field?.pad) { cf.field.pad(ctx, pad, v); this.touch(); return; }
    if (cf?.def.onPad?.(ctx, pad, v, true)) { this.touch(); return; }
    this.triggerPad(pad, v);
    this.touch();
  }
  /** Play a pad through the sampler, honouring 16 LEVELS and the NOTE VARIATION slider. */
  triggerPad(pad: number, vel: number) {
    const s = this.s; const m = this.m;
    const { drum, note } = this.padTarget(pad);
    let playNote = note; let v = vel; let nv: NoteVar | undefined;
    const i = pad % 16;
    const { low, high, param, note: nvNote } = m.noteVariation;
    if (s.sixteenLevels) {
      playNote = s.sixteen.note;
      if (s.sixteen.param === 'VELOCITY') v = (i + 1) * 8 - 1;
      else nv = sixteenLevelValue(s.sixteen.type, i, s.sixteen.origPad, low, high);
    } else if (nvNote === playNote) nv = sliderValue(param, s.nvValue, low, high);
    this.heldPads.set(pad, { drum, note: playNote });
    s.padsDown.add(pad);
    this.transport.padDown?.(pad, drum, playNote, v, nv);
    if (!(this.transportRepeating())) this.sound.noteOn(drum, playNote, v, nv);
  }
  private transportRepeating(): boolean { return this.s.held.has('TAP') && this.s.playing && this.m.timing !== 'OFF'; }
  padUp(pad: number) {
    const ctx = this.ctx();
    if (!this.s.nameEdit) this.current()?.onPad?.(ctx, pad, 0, false);
    const held = this.heldPads.get(pad) ?? this.padTarget(pad);
    this.heldPads.delete(pad);
    this.s.padsDown.delete(pad);
    this.transport.padUp?.(pad);
    this.sound.noteOff(held.drum, held.note);
    this.touch();
  }
  /** Which DRUM slot and note a pad slot (0..63) plays right now. */
  padTarget(pad: number): { drum: number; note: number; program: number } {
    const tr = this.m.sequences[this.s.seq].tracks[this.s.track];
    const ti = TRACK_TYPES.indexOf(tr.type);
    const drum = ti > 0 ? ti - 1 : this.s.drum;
    const program = this.m.drums[drum].pgm;
    const pg = this.m.programs[program];
    const map = pg.padAssign === 'MASTER' ? this.m.masterPadToNote : pg.padToNote;
    return { drum, note: map[pad], program };
  }
  padPressure(pad: number, value: number) { this.transport.padPressure?.(pad, value); this.hooks.padPressure?.(pad, value); }

  wheel(delta: number) {
    const s = this.s;
    if (!delta) return;
    if (s.nameEdit) { this.nameWheel(delta); return; }
    s.numeric = null;
    const ctx = this.ctx();
    const cf = this.cursorField();
    if (!cf?.field) return;
    if (cf.field.name) { this.beginNameEdit(cf.field.nameValue?.(ctx) ?? cf.field.get(ctx), n => cf.field!.nameCommit?.(ctx, n)); this.nameWheel(delta); return; }
    cf.field.wheel?.(ctx, delta);
    this.touch();
  }

  slider(value: number) { this.s.nvValue = Math.max(0, Math.min(127, Math.round(value))); this.touch(); }

  // ---------- name window ----------
  beginNameEdit(current: string, commit: (name: string) => void) {
    this.s.nameEdit = { value: rpad(current, NAME_LEN), pos: 0, lastPad: -1, lastPadAt: 0, upper: true, commit };
    this.touch();
  }
  private setNameChar(ch: string, advance: boolean) {
    const n = this.s.nameEdit!;
    n.value = n.value.slice(0, n.pos) + ch + n.value.slice(n.pos + 1);
    if (advance) n.pos = Math.min(NAME_LEN - 1, n.pos + 1);
  }
  private nameWheel(delta: number) {
    const n = this.s.nameEdit!;
    const cur = NAME_CHARS.indexOf(n.value[n.pos]);
    const i = ((cur < 0 ? 0 : cur) + delta) % NAME_CHARS.length;
    this.setNameChar(NAME_CHARS[(i + NAME_CHARS.length) % NAME_CHARS.length], false);
    this.touch();
  }
  private namePad(pad: number) {
    const n = this.s.nameEdit!;
    const group = PAD_LETTERS[pad % 16];
    const now = Date.now();
    const same = n.lastPad === pad && now - n.lastPadAt < PAD_CYCLE_MS;
    let ch: string;
    if (same) {
      // cycle within the group at the previous position
      n.pos = Math.max(0, n.pos - 1);
      const prev = n.value[n.pos];
      const gi = group.indexOf(n.upper ? prev.toUpperCase() : prev.toLowerCase());
      const idx = group.indexOf(prev) >= 0 ? group.indexOf(prev) : gi;
      ch = group[(idx + 1) % group.length];
    } else ch = group[0];
    ch = n.upper ? ch.toUpperCase() : ch.toLowerCase();
    this.setNameChar(ch, true);
    n.lastPad = pad; n.lastPadAt = now;
    this.touch();
  }
  private nameKey(k: HwKey) {
    const n = this.s.nameEdit!;
    switch (k) {
      case 'LEFT': n.pos = Math.max(0, n.pos - 1); break;
      case 'RIGHT': n.pos = Math.min(NAME_LEN - 1, n.pos + 1); break;
      case 'SIXTEEN_LEVELS': this.setNameChar(' ', true); break;
      case 'FULL_LEVEL': n.upper = !n.upper; break;
      case 'F2': this.s.clipboardName = n.value; break;
      case 'F3': if (this.s.clipboardName) n.value = rpad(this.s.clipboardName, NAME_LEN); break;
      case 'F4': case 'MAIN': this.s.nameEdit = null; break;
      case 'F5': case 'ENTER': {
        const commit = n.commit; const value = n.value.replace(/\s+$/, '');
        this.s.nameEdit = null;
        commit(value);
        break;
      }
      default: break;
    }
    this.touch();
  }

  // ---------- undo ----------
  snapshotForUndo() {
    const seq = this.m.sequences[this.s.seq];
    this.undoSnapshot = { seq: this.s.seq, data: structuredClone(seq) };
    this.undoRedo = null;
    this.s.undoAvailable = true;
  }
  undo() {
    if (this.undoSnapshot) {
      const cur = structuredClone(this.m.sequences[this.undoSnapshot.seq]);
      this.m.sequences[this.undoSnapshot.seq] = this.undoSnapshot.data;
      this.undoRedo = { seq: this.undoSnapshot.seq, data: cur };
      this.undoSnapshot = null;
    } else if (this.undoRedo) {
      const cur = structuredClone(this.m.sequences[this.undoRedo.seq]);
      this.m.sequences[this.undoRedo.seq] = this.undoRedo.data;
      this.undoSnapshot = { seq: this.undoRedo.seq, data: cur };
      this.undoRedo = null;
    }
    this.s.undoAvailable = !!this.undoSnapshot;
    this.touch();
  }

  // ---------- render ----------
  render(): LcdFrame {
    const f = newFrame();
    const ctx = this.ctx();
    const base = this.modeScreen();
    if (base) { base.draw(ctx, f); this.drawFields(base, ctx, f, this.s.windows.length === 0); }
    this.s.windows.forEach((w, i) => {
      const def = this.screens.get(w.id); if (!def) return;
      windowBox(f, def.title ?? def.id, 1, def.windowRows ?? 6);
      def.draw(ctx, f);
      this.drawFields(def, ctx, f, i === this.s.windows.length - 1 && !this.s.nameEdit);
    });
    const top = this.current();
    if (top) softKeys(f, top.softKeys(ctx).map<SoftKeyCell>(k => k ?? { label: '', kind: 'none' }));
    if (this.s.message) text(f, 6, f.cols - this.s.message.length, this.s.message);
    if (this.s.nameEdit) this.drawNameWindow(f);
    return f;
  }

  private drawFields(def: ScreenDef, ctx: Ctx, f: LcdFrame, cursorActive: boolean) {
    const fields = this.visibleFields(def, ctx);
    const landable = fields.filter(x => !x.skip);
    const ci = this.cursorIndex(def, landable);
    fields.forEach(field => {
      if (field.label) text(f, field.row, field.col - field.label.length, field.label, field.dim ? ATTR_DIM : ATTR_NONE);
      const isCursor = cursorActive && landable[ci] === field;
      const raw = isCursor && this.s.numeric != null ? this.s.numeric.padStart(field.width, ' ') : field.get(ctx);
      const val = raw.length > field.width ? raw.slice(0, field.width) : rpad(raw, field.width);
      text(f, field.row, field.col, val, field.dim ? ATTR_DIM : ATTR_NONE);
      if (isCursor) setAttr(f, field.row, field.col, field.width, ATTR_INVERSE);
    });
  }

  private drawNameWindow(f: LcdFrame) {
    const n = this.s.nameEdit!;
    windowBox(f, 'Name', 1, 6);
    text(f, 3, 6, 'New name:');
    text(f, 3, 15, n.value);
    setAttr(f, 3, 15 + n.pos, 1, ATTR_INVERSE);
    text(f, 5, 6, 'Press PADs or use DATA knob.', ATTR_DIM);
    softKeys(f, [
      { label: '', kind: 'none' }, { label: 'COPY', kind: 'action' }, { label: 'PASTE', kind: 'action' },
      { label: 'CANCEL', kind: 'action' }, { label: 'ENTER', kind: 'action' }, { label: '', kind: 'none' },
    ]);
  }

  /** Soft-key labels for the F-key caps and the hardware LEDs. */
  softKeyLabels(): SoftKeyDef[] { const d = this.current(); return d ? d.softKeys(this.ctx()).map(k => k ?? { label: '', kind: 'none' }) : []; }
}

// ---------- the shared confirm window ----------
const confirmWindow: ScreenDef = {
  id: 'CONFIRM',
  title: '',
  fields: () => [],
  draw(ctx, f) {
    const opts = (ctx.fw as unknown as { _opts?: ConfirmOpts })._opts ?? currentConfirm(ctx);
    if (!opts) return;
    windowBox(f, opts.title, 1, 6);
    opts.lines.slice(0, 4).forEach((l, i) => text(f, 2 + i, 2, l));
  },
  softKeys(ctx) {
    const opts = currentConfirm(ctx);
    if (!opts) return [];
    const keys: (SoftKeyDef | null)[] = [null, null, null, null, null, null];
    const doItIndex = opts.doItKey ?? 4;
    keys[3] = { label: opts.cancelLabel ?? 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() };
    keys[doItIndex] = { label: opts.doItLabel ?? 'DO IT', kind: 'action', press: c => { c.fw.closeWindow(); opts.doIt(); } };
    if (opts.extra) keys[opts.extra.index] = { label: opts.extra.label, kind: 'action', press: () => opts.extra!.run() };
    return keys;
  },
};
function currentConfirm(ctx: Ctx): ConfirmOpts | undefined {
  const w = ctx.s.windows[ctx.s.windows.length - 1];
  return w?.id === 'CONFIRM' ? (w.params?.opts as ConfirmOpts | undefined) : undefined;
}
