import React from 'react';
import { createRoot } from 'react-dom/client';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram } from '@/model/factory';
import { allScreens } from '@/screens';
import { AudioEngine } from '@/audio/engine';
import { Transport } from '@/seq/transport';
import { WorkerClock } from '@/seq/clock';
import { installDemo } from '@/audio/demo';
import { loadAutosave, startAutosave } from '@/disk/autosave';
import { sync } from '@/disk/sync';
import { FirmwareContext } from '@/app/store';
import { Chassis } from '@/app/Chassis';
import { EzPanel } from '@/ez/EzPanel';
import { panel } from '@/app/panel';
import { useSyncExternalStore } from 'react';
import { TipProvider } from '@/app/Tip';
import { installHost } from '@/app/host';
import { installSamplerInput, keep } from '@/screens/sample';
import { installDrive, loadImported } from '@/screens/disk';
import { importFiles } from '@/screens/load';
import { takeHandoff } from '@/disk/handoff';
import { installMidiPorts } from '@/screens/midi';
import { MidiIO } from '@/midi/io';
import { handleMidiIn } from '@/kernel/midi-in';
import { IdbDrive, typeOf } from '@/disk/drive';
import { encodeProject } from '@/disk/formats';
import { isDesktop, installDesktopLinks } from '@/app/desktop';
import '@/ds';

const style = document.createElement('style');
style.textContent = 'html,body{min-height:100%}body{margin:0;background:var(--surface-app-bg) var(--texture-grain);padding:28px 20px;box-sizing:border-box}';
document.head.appendChild(style);

/** OG or EZ: two front panels over the same firmware. */
function Root({ engine }: { engine: AudioEngine }) {
  const which = useSyncExternalStore(fn => panel.subscribe(fn), () => panel.snapshot);
  return which === 'ez' ? <EzPanel engine={engine} /> : <Chassis engine={engine} />;
}

async function powerOn() {
  const restored = await loadAutosave();
  // signed in somewhere else since this browser last synced? the account's version wins
  const pulled = await sync.boot(!!restored);
  const machine = pulled?.machine ?? restored ?? newMachineWithStarterProgram();
  if (!restored && !pulled) installDemo(machine);

  const firmware = new Firmware(machine, allScreens);
  if (pulled) firmware.s.masterTempo = pulled.masterTempo;
  const engine = new AudioEngine(() => firmware.m);
  firmware.sound = engine;
  firmware.transport = new Transport(firmware, new WorkerClock());
  installHost(firmware, engine);
  const drive = new IdbDrive();
  installDrive(drive);
  // MIDI: ports bound from the model, input routed through the kernel, output timestamped against the audio clock
  const midi = new MidiIO();
  midi.audioToPerf = when => performance.now() + Math.max(0, when - engine.now()) * 1000;
  midi.onMessage = msg => handleMidiIn(firmware, msg);
  midi.onPorts = () => firmware.touch();
  installMidiPorts(midi);
  Object.assign(firmware, { midi });
  void midi.init().then(() => midi.bind(firmware.m.midi));
  // SAMPLE mode input: the engine's recorder, meters throttled to the LCD
  installSamplerInput({ open: (i, mon) => engine.recorder.open(i, mon), close: () => engine.recorder.close(), setMonitor: on => engine.recorder.setMonitor(on), arm: o => engine.recorder.arm(o), startNow: () => engine.recorder.startNow(), stop: () => engine.recorder.stop(), cancel: () => engine.recorder.cancel(), take: () => engine.recorder.take(), status: () => engine.recorder.status(), resetPeak: () => engine.recorder.resetPeak(), rate: () => engine.sampleRate() });
  let meterAt = 0;
  engine.recorder.onChange = () => {
    if (engine.recorder.status().state === 'done') { keep(firmware.ctx()); return; }
    const t = performance.now(); if (t - meterAt > 50) { meterAt = t; firmware.touch(); }
  };
  startAutosave(() => firmware.m, fn => firmware.subscribe(fn));
  sync.attach(() => firmware.m, () => firmware.s.masterTempo);
  firmware.subscribe(() => sync.changed());

  // a file a Chop Deck page left for the machine (a kit from the library): into the import tray and straight to its Load window
  const handoff = await takeHandoff();
  if (handoff) {
    if (handoff.setAside) {
      // a beat is about to replace everything: keep what was here on the browser disk first
      const stamp = new Date().toISOString().slice(2, 16).replace(/[-:T]/g, '');
      const name = `BEFORE_${stamp}.CHOPDECK`;
      try { await drive.write('', name, encodeProject(firmware.m, firmware.s.masterTempo), typeOf(name)); firmware.s.message = `SAVED AS ${name}`; firmware.touch(); } catch { /* disk full or blocked */ }
    }
    importFiles(firmware.ctx(), [new File([handoff.bytes as BlobPart], handoff.name)]);
    void loadImported(firmware.ctx(), handoff.name);
    if (location.search.includes('handoff')) history.replaceState(null, '', '/');
  }

  if (isDesktop) installDesktopLinks();

  // handy in the console while developing
  Object.assign(window, { chopdeck: firmware, chopdeckAudio: engine });

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <FirmwareContext.Provider value={firmware}>
        <TipProvider><Root engine={engine} /></TipProvider>
      </FirmwareContext.Provider>
    </React.StrictMode>,
  );
}

void powerOn();

// offline shell (production builds only; the dev server serves modules live)
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
