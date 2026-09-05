import React from 'react';
import { createRoot } from 'react-dom/client';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram } from '@/model/factory';
import { allScreens } from '@/screens';
import { AudioEngine } from '@/audio/engine';
import { Transport } from '@/seq/transport';
import { WorkerClock } from '@/seq/clock';
import { installStarterKit } from '@/audio/starterKit';
import { loadAutosave, startAutosave } from '@/disk/autosave';
import { FirmwareContext } from '@/app/store';
import { Chassis } from '@/app/Chassis';
import { installHost } from '@/app/host';
import { installSamplerInput, keep } from '@/screens/sample';
import '@/ds';

const style = document.createElement('style');
style.textContent = 'html,body{min-height:100%}body{margin:0;background:var(--surface-app-bg) var(--texture-grain);padding:28px 20px;box-sizing:border-box}';
document.head.appendChild(style);

async function powerOn() {
  const restored = await loadAutosave();
  const machine = restored ?? newMachineWithStarterProgram();
  if (!restored) installStarterKit(machine);

  const firmware = new Firmware(machine, allScreens);
  const engine = new AudioEngine(() => firmware.m);
  firmware.sound = engine;
  firmware.transport = new Transport(firmware, new WorkerClock());
  installHost(firmware, engine);
  // SAMPLE mode input: the engine's recorder, meters throttled to the LCD
  installSamplerInput({ open: (i, mon) => engine.recorder.open(i, mon), close: () => engine.recorder.close(), setMonitor: on => engine.recorder.setMonitor(on), arm: o => engine.recorder.arm(o), startNow: () => engine.recorder.startNow(), stop: () => engine.recorder.stop(), cancel: () => engine.recorder.cancel(), take: () => engine.recorder.take(), status: () => engine.recorder.status(), resetPeak: () => engine.recorder.resetPeak(), rate: () => engine.sampleRate() });
  let meterAt = 0;
  engine.recorder.onChange = () => {
    if (engine.recorder.status().state === 'done') { keep(firmware.ctx()); return; }
    const t = performance.now(); if (t - meterAt > 50) { meterAt = t; firmware.touch(); }
  };
  startAutosave(() => firmware.m, fn => firmware.subscribe(fn));

  // handy in the console while developing
  Object.assign(window, { chopdeck: firmware, chopdeckAudio: engine });

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <FirmwareContext.Provider value={firmware}>
        <Chassis engine={engine} />
      </FirmwareContext.Provider>
    </React.StrictMode>,
  );
}

void powerOn();
