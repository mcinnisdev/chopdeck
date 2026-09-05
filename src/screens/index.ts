import { ScreenDef } from '@/kernel/screen';
import { mainScreen, mainWindows } from './main';
import { placeholderScreens } from './placeholders';

export const allScreens: ScreenDef[] = [mainScreen, ...mainWindows, ...placeholderScreens];
