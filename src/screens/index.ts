import { ScreenDef } from '@/kernel/screen';
import { mainScreen, mainWindows } from './main';
import { programScreens } from './program';
import { loadScreens } from './load';
import { performScreens } from './perform';
import { mixerScreens } from './mixer';
import { placeholderScreens } from './placeholders';

// Placeholders come first so any real screen registered later replaces them by id.
export const allScreens: ScreenDef[] = [...placeholderScreens, mainScreen, ...mainWindows, ...programScreens, ...loadScreens, ...performScreens, ...mixerScreens];
