import { ScreenDef } from '@/kernel/screen';
import { mainScreen, mainWindows } from './main';
import { mainWindowScreens } from './main-windows';
import { programScreens } from './program';
import { loadScreens } from './load';
import { performScreens } from './perform';
import { mixerScreens } from './mixer';
import { phase2Screens } from './phase2';
import { sampleScreens } from './sample';
import { trimScreens } from './trim';
import { stepScreens } from './step';
import { editScreens } from './edit';
import { miscScreens } from './misc';
import { songScreens } from './song';
import { placeholderScreens } from './placeholders';

// Placeholders come first so any real screen registered later replaces them by id.
export const allScreens: ScreenDef[] = [
  ...placeholderScreens, mainScreen, ...mainWindows, ...mainWindowScreens, ...programScreens, ...loadScreens, ...performScreens,
  ...mixerScreens, ...phase2Screens, ...sampleScreens, ...trimScreens, ...stepScreens, ...editScreens, ...miscScreens, ...songScreens,
];
