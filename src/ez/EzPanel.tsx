// EZ mode shell, after the refreshed design: same materials, no chassis. A cream page, the transport in
// the header, four big hard buttons that swap ONE panel (Chop / Sequence / Library / Mix), and the pads
// always on screen. Everything drives the same firmware the OG panel does; nothing lives here but layout.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFirmware } from '@/app/store';
import { useKeyboard, PAD_KEYS } from '@/app/useKeyboard';
import { AudioEngine } from '@/audio/engine';
import { sync } from '@/disk/sync';
import { accountLabel } from '@/app/account-label';
import { PanelSwitch } from '@/app/PanelSwitch';
import { MANUAL_URL } from '@/app/help';
import { padNames } from '@/disk/kit';
import { tickToBBT } from '@/model/time';
import { TEMPO_MIN, TEMPO_MAX } from '@/model/types';
import type { Firmware } from '@/kernel/firmware';
import { Pad, HardButton, Led, Knob, Wordmark } from '@/ds';
import { ChopPanel } from './panels/Chop';
import { SequencePanel } from './panels/Sequence';
import { LibraryPanel } from './panels/Library';
import { MixPanel } from './panels/Mix';
import './ez.css';

export type EzPanelId = 'chop' | 'sequence' | 'library' | 'mix';
const NAV: [EzPanelId, string][] = [['chop', 'Chop'], ['sequence', 'Sequence'], ['library', 'Library'], ['mix', 'Mix']];
const HOTKEYS = PAD_KEYS.map(code => code.replace('Key', '').replace('Digit', ''));
const PAD_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
const PANEL_KEY = 'chopdeck.ezPanel';

export interface EzCtx { fw: Firmware; go(p: EzPanelId): void; note(msg: string): void; standalone: boolean; chop: number; setChop(i: number): void; editPads: boolean; setEditPads(on: boolean): void; editing: number | null; setEditing(i: number | null): void }

function readPanel(): EzPanelId { try { const v = localStorage.getItem(PANEL_KEY); if (v === 'chop' || v === 'sequence' || v === 'library' || v === 'mix') return v; } catch { /* private mode */ } return 'chop'; }

/** Audio boot on the first gesture, and dropped audio files straight into memory as sounds. */
function useEzHost(fw: Firmware, engine: AudioEngine, note: (m: string) => void, go: (p: EzPanelId) => void) {
  useEffect(() => {
    const boot = () => engine.boot();
    const opts = { capture: true, passive: true } as AddEventListenerOptions;
    window.addEventListener('pointerdown', boot, opts); window.addEventListener('keydown', boot, opts);
    const over = (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      if (files.some(f => /\.(chopdeck|zip)$/i.test(f.name))) { note('Project files load from Mix > Project > Load.'); return; }
      void fw.importAudio(files).then(got => { if (got.length) { note(`Added ${got.map(s => s.name).join(', ')}`); go('chop'); } else note('Nothing there the browser could decode'); });
    };
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('pointerdown', boot, opts); window.removeEventListener('keydown', boot, opts); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [fw, engine, note, go]);
}

export function EzPanel({ engine }: { engine: AudioEngine }) {
  const fw = useFirmware();
  useKeyboard(fw);
  const s = fw.s, m = fw.m;
  const q = m.sequences[s.seq];
  const program = m.programs[m.drums[0].pgm];
  const names = padNames(m, program);
  const syncState = useSyncExternalStore(fn => sync.subscribe(fn), () => sync.snapshot);
  const standalone = syncState.status === 'standalone';
  const [panel, setPanelState] = useState<EzPanelId>(readPanel);
  const [chop, setChop] = useState(0);
  const [editPads, setEditPads] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [noteText, setNoteText] = useState<string | null>(null);
  const note = useRef((msg: string) => setNoteText(msg)).current;
  const go = useRef((p: EzPanelId) => { setPanelState(p); try { localStorage.setItem(PANEL_KEY, p); } catch { /* private mode */ } }).current;
  useEffect(() => { if (noteText) { const t = setTimeout(() => setNoteText(null), 4500); return () => clearTimeout(t); } }, [noteText]);
  useEzHost(fw, engine, note, go);

  const chopSound = m.sounds[s.sound] ?? null;
  const bbt = tickToBBT(q.tsigs, Math.max(0, s.now));
  const per = 24; const step = Math.max(0, Math.floor(s.now / per));
  const lit = (i: number) => s.litPads.has(i) || s.padsDown.has(i);

  const hit = (i: number, vel: number) => {
    if (panel === 'chop' && chopSound && chopSound.zones.length > 1) {
      const sl = fw.assignChopToPad(chopSound.id, Math.min(chop, chopSound.zones.length - 1), i);
      if (sl) { note(`Chop ${chop + 1} is on pad ${i + 1}`); fw.padDown(i, vel); }
      return;
    }
    if (panel === 'mix' && editPads) { setEditing(i); return; }
    fw.padDown(i, vel);
  };
  const ctx: EzCtx = { fw, go, note, standalone, chop, setChop, editPads, setEditPads, editing, setEditing };
  const Current = { chop: ChopPanel, sequence: SequencePanel, library: LibraryPanel, mix: MixPanel }[panel];
  const title = NAV.find(n => n[0] === panel)![1];
  const hint = panel === 'chop' && chopSound ? `Tap a pad to put chop ${chop + 1} of ${chopSound.name} on it.` : panel === 'mix' && editPads ? 'Tap a pad to choose its sound or clear it.' : s.record !== 'OFF' ? 'Recording: play the pads in time.' : 'Tap pads to play. Z X C V · A S D F · Q W E R · 1 2 3 4 also work.';

  return (
    <div className="ez" role="region" aria-label="EZ panel">
      <header className="ez-head">
        <a href="/" className="ez-brand" aria-label="Chop Deck"><img src="/logo.webp" alt="" width={36} height={36} /><Wordmark size="sm" /></a>
        <div className="ez-transport">
          <HardButton label="Play" led="green" ledOn={s.playing && s.record === 'OFF'} active={s.playing && s.record === 'OFF'} size="lg" onClick={() => (s.playing ? fw.transport.stop() : fw.transport.play(false))}>►</HardButton>
          <HardButton label="Stop" size="lg" onClick={() => fw.transport.stop()}>■</HardButton>
          <HardButton label="Rec" cap="red" led="red" ledOn={s.record !== 'OFF'} active={s.record !== 'OFF'} size="lg" onClick={() => (s.record !== 'OFF' ? fw.transport.stop() : fw.recordFromStart())}>●</HardButton>
          <div className="ez-bpm">
            <Knob label="Tempo" size="sm" ticks={false} min={TEMPO_MIN} max={TEMPO_MAX} value={fw.tempo()} onChange={v => fw.setTempo(v)} />
            <span className="ez-bpm-read" aria-label="Tempo readout">{fw.tempo().toFixed(1)}<small> bpm</small></span>
          </div>
        </div>
        <PanelSwitch onDark={false} />
      </header>
      <div className="ez-links">
        <a href={MANUAL_URL} target="_blank" rel="noopener">Manual</a>
        {!standalone && <a href="/account/" data-sync={syncState.status}>{accountLabel(syncState)}</a>}
        {!standalone && <><a href="/kits/">Kits</a><a href="/samples/">Samples</a><a href="/beats/">Beats</a><a href="/publish/">Publish</a></>}
        {noteText && <span role="status" style={{ marginLeft: 'auto', color: 'var(--red-deep)' }}>{noteText}</span>}
      </div>

      <nav className="ez-nav" aria-label="Panels">
        {NAV.map(([k, l]) => <HardButton key={k} label={l} size="lg" width="100%" active={panel === k} onClick={() => go(k)} />)}
      </nav>

      <section className="ez-panel" aria-label={title}>
        <h1 className="ez-title">{title}</h1>
        <Current ctx={ctx} />
      </section>

      <section className="ez-pads" aria-label="Pads">
        <div className="ez-bank">
          <span className="ez-bank-label">Bank</span>
          {['A', 'B', 'C', 'D'].map((b, i) => <HardButton key={b} size="sm" active={s.padBank === i} onClick={() => fw.setPadBank(i)}>{b}</HardButton>)}
          <span className="ez-status"><Led color="green" on={s.playing} /> {s.playing ? `Bar ${bbt.bar} · step ${(step % 16) + 1}` : (program.name.trim() || 'untitled')}</span>
        </div>
        <div className="ez-grid">
          {PAD_ORDER.map(i => { const slot = s.padBank * 16 + i; const nm = names[i] ?? ''; return (
            <Pad key={i} fluid label={String(i + 1)} ariaLabel={`Pad ${i + 1}${nm ? `: ${nm}` : ', empty'}`} note={nm || undefined} hotkey={HOTKEYS[i]} color={nm || panel === 'chop' ? 'red' : 'grey'} lit={lit(slot)}
              onTrigger={v => hit(slot, v)} onRelease={() => fw.padUp(slot)} onPressure={p => fw.padPressure(slot, p)} />); })}
        </div>
        <p className="ez-hint">{hint}</p>
      </section>

      <div className="ez-footer">FREE AND <a href="https://github.com/mcinnisdev/chopdeck">OPEN SOURCE</a> · BUILT BY <a href="https://mcinnis.dev">MCINNIS.DEV</a></div>
    </div>
  );
}
