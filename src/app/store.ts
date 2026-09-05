import { createContext, useContext, useSyncExternalStore } from 'react';
import { Firmware } from '@/kernel/firmware';

export const FirmwareContext = createContext<Firmware | null>(null);

/** Subscribe a component to the machine; re-renders on every `touch()`. */
export function useFirmware(): Firmware {
  const fw = useContext(FirmwareContext);
  if (!fw) throw new Error('FirmwareContext missing');
  useSyncExternalStore(fw.subscribe.bind(fw), () => fw.version, () => fw.version);
  return fw;
}
