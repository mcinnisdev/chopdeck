// Helpers shared by screen definitions.
import { Ctx, Field } from '@/kernel/screen';

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Cycle through an enum list with the wheel. */
export function cycle<T>(list: readonly T[], cur: T, delta: number): T {
  const i = list.indexOf(cur);
  const n = ((i < 0 ? 0 : i) + delta) % list.length;
  return list[(n + list.length) % list.length];
}

/** Integer field bound to a getter/setter with clamping and numeric entry. */
export function intField(opts: {
  id: string; row: number; col: number; width: number; label?: string;
  get: (c: Ctx) => number; set: (c: Ctx, v: number) => void; min: number; max: number;
  fmt?: (v: number) => string; step?: number; coarse?: number; window?: (c: Ctx) => void; dim?: boolean; hidden?: (c: Ctx) => boolean;
}): Field {
  const fmt = opts.fmt ?? ((v: number) => String(v).padStart(opts.width, ' '));
  return {
    id: opts.id, row: opts.row, col: opts.col, width: opts.width, label: opts.label, dim: opts.dim, hidden: opts.hidden,
    coarse: opts.coarse,
    get: c => fmt(opts.get(c)),
    wheel: (c, d) => { opts.set(c, clamp(opts.get(c) + d * (opts.step ?? 1), opts.min, opts.max)); c.fw.touch(); },
    enter: (c, digits) => { const n = parseInt(digits, 10); if (!isNaN(n)) { opts.set(c, clamp(n, opts.min, opts.max)); c.fw.touch(); } },
    window: opts.window,
  };
}

/** Enum field. */
export function enumField<T extends string>(opts: {
  id: string; row: number; col: number; width: number; label?: string; values: readonly T[];
  get: (c: Ctx) => T; set: (c: Ctx, v: T) => void; window?: (c: Ctx) => void; dim?: boolean; hidden?: (c: Ctx) => boolean;
}): Field {
  return {
    id: opts.id, row: opts.row, col: opts.col, width: opts.width, label: opts.label, dim: opts.dim, hidden: opts.hidden,
    get: c => opts.get(c),
    wheel: (c, d) => { opts.set(c, cycle(opts.values, opts.get(c), d)); c.fw.touch(); },
    window: opts.window,
  };
}

/** Boolean shown as ON/OFF or YES/NO. */
export function boolField(opts: {
  id: string; row: number; col: number; width: number; label?: string; style?: 'ON' | 'YES';
  get: (c: Ctx) => boolean; set: (c: Ctx, v: boolean) => void; window?: (c: Ctx) => void; dim?: boolean;
}): Field {
  const on = opts.style === 'YES' ? 'YES' : 'ON';
  const off = opts.style === 'YES' ? 'NO' : 'OFF';
  return {
    id: opts.id, row: opts.row, col: opts.col, width: opts.width, label: opts.label, dim: opts.dim,
    get: c => (opts.get(c) ? on : off),
    wheel: (c, d) => { opts.set(c, d > 0); c.fw.touch(); },
    window: opts.window,
  };
}

/** Name field: wheel or pad opens the Name window. */
export function nameField(opts: {
  id: string; row: number; col: number; width?: number; label?: string;
  get: (c: Ctx) => string; set: (c: Ctx, v: string) => void; window?: (c: Ctx) => void;
  /** Raw name for the Name window when the display value is decorated, e.g. "(Unused)". */
  raw?: (c: Ctx) => string;
}): Field {
  return {
    id: opts.id, row: opts.row, col: opts.col, width: opts.width ?? 16, label: opts.label,
    get: c => opts.get(c), name: true, nameValue: opts.raw ?? opts.get,
    nameCommit: (c, n) => { opts.set(c, n); c.fw.touch(); },
    window: opts.window,
  };
}

/** Display-only text that the cursor skips. */
export function textField(id: string, row: number, col: number, width: number, get: (c: Ctx) => string, dim = false): Field {
  return { id, row, col, width, get, skip: true, dim };
}
