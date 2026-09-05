import React from 'react';
import { createRoot } from 'react-dom/client';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram } from '@/model/factory';
import { allScreens } from '@/screens';
import { FirmwareContext } from '@/app/store';
import { Chassis } from '@/app/Chassis';
import '@/ds';

const firmware = new Firmware(newMachineWithStarterProgram(), allScreens);
// handy in the console while developing
(window as unknown as { chopdeck: Firmware }).chopdeck = firmware;

const style = document.createElement('style');
style.textContent = 'html,body{min-height:100%}body{margin:0;background:var(--surface-app-bg) var(--texture-grain);padding:28px 20px;box-sizing:border-box}';
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FirmwareContext.Provider value={firmware}>
      <Chassis />
    </FirmwareContext.Provider>
  </React.StrictMode>,
);
