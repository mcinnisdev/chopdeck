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
