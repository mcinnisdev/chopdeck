// Every other mode, with its real soft-key row, so navigation is complete before the pages are built.
import { ScreenDef, SoftKeyDef, Ctx } from '@/kernel/screen';
import { ModeId } from '@/kernel/keys';
import { text, ATTR_DIM } from '@/lcd/frame';
import { pad2 } from '@/model/format';
import { formatBBT, tickToBBT } from '@/model/time';

const page = (label: string, id: string): SoftKeyDef => ({ label, kind: 'page', press: c => c.fw.setPage(id) });
const action = (label: string): SoftKeyDef => ({ label, kind: 'action' });

function header(c: Ctx, title: string): string {
  const seq = c.m.sequences[c.s.seq];
  return `${title.padEnd(28)}Now:${formatBBT(tickToBBT(seq.tsigs, c.s.now))}`;
}

function placeholder(id: ModeId, title: string, keys: (SoftKeyDef | null)[], pages?: string[]): ScreenDef[] {
  const make = (pid: string | null): ScreenDef => ({
    id: pid ? `${id}/${pid}` : id,
    fields: () => [],
    draw(c, f) {
      text(f, 0, 0, header(c, title));
      const seq = c.m.sequences[c.s.seq];
      text(f, 1, 0, `Sq:${pad2(c.s.seq + 1)}-${seq.name}`);
      text(f, 3, 0, pid ? `${pid} page` : title, ATTR_DIM);
      text(f, 5, 0, 'This page is not installed in this OS yet.', ATTR_DIM);
    },
    softKeys: c => keys.map(k => {
      if (!k) return null;
      if (pages && k.kind === 'page') {
        const cur = c.s.page[id] ?? pages[0];
        const target = pages.find(p => k.label.toUpperCase().startsWith(p.slice(0, 4)));
        return target === cur ? { ...k, kind: 'current' } : k;
      }
      return k;
    }),
  });
  if (!pages) return [make(null)];
  return [make(null), ...pages.map(p => make(p))];
}

export const placeholderScreens: ScreenDef[] = [
  ...placeholder('STEP', 'STEP EDIT', [action('TC'), action('COPY'), action('DELETE'), action('INSERT'), action('PASTE'), action('PLAY')]),
  ...placeholder('EDIT', 'EDIT', [page('EVENTS', 'EVENTS'), page('BARS', 'BARS'), page('TrMOVE', 'TRMOVE'), null, page('USER', 'USER'), action('DO IT')], ['EVENTS', 'BARS', 'TRMOVE', 'USER']),
  ...placeholder('SONG', 'SONG', [null, null, null, action('CONVRT'), action('DELETE'), action('INSERT')]),
  ...placeholder('MISC', 'MISC.', [page('PUNCH', 'PUNCH'), page('TRANS', 'TRANS'), page('2ndSEQ', '2NDSEQ'), null, null, action('TurnON')], ['PUNCH', 'TRANS', '2NDSEQ']),
  ...placeholder('LOAD', 'LOAD', [page('LOAD', 'LOAD'), page('SAVE', 'SAVE'), page('FORMAT', 'FORMAT'), null, null, action('DO IT')], ['LOAD', 'SAVE', 'FORMAT']),
  ...placeholder('SAVE', 'SAVE', [page('LOAD', 'LOAD'), page('SAVE', 'SAVE'), page('FORMAT', 'FORMAT'), null, null, action('DO IT')], ['LOAD', 'SAVE', 'FORMAT']),
  ...placeholder('SAMPLE', 'SAMPLE', [action('RESET'), action('PEAK'), null, null, null, action('RECORD')]),
  ...placeholder('TRIM', 'TRIM', [page('TRIM', 'TRIM'), page('LOOP', 'LOOP'), page('ZONE', 'ZONE'), page('PARAMS', 'PARAMS'), action('EDIT'), action('PLAY X')], ['TRIM', 'LOOP', 'ZONE', 'PARAMS']),
  ...placeholder('PROGRAM', 'PROGRAM', [page('ASSIGN', 'ASSIGN'), page('PARAMS', 'PARAMS'), page('DRUM', 'DRUM'), page('PURGE', 'PURGE'), page('AUTO', 'AUTO'), action('PLAY')], ['ASSIGN', 'PARAMS', 'DRUM', 'PURGE', 'AUTO']),
  ...placeholder('MIXER', 'MIXER', [page('STEREO', 'STEREO'), page('INDIV', 'INDIV'), page('FXsend', 'FXSEND'), page('SETUP', 'SETUP'), page('FXedit', 'FXEDIT'), action('ALL CH')], ['STEREO', 'INDIV', 'FXSEND', 'SETUP', 'FXEDIT']),
  ...placeholder('OTHER', 'OTHER', [page('OTHERS', 'OTHERS'), page('INIT', 'INIT'), page('VER.', 'VER'), null, null, null], ['OTHERS', 'INIT', 'VER']),
  ...placeholder('MIDI', 'MIDI/SYNC', [page('SYNC', 'SYNC'), page('DUMP', 'DUMP'), page('MIDIsw', 'MIDISW'), null, null, null], ['SYNC', 'DUMP', 'MIDISW']),
  ...placeholder('TRACK_MUTE', 'TRACK MUTE', [null, null, null, null, null, action('SOLO')]),
  ...placeholder('NEXT_SEQ', 'NEXT SEQ', [null, null, null, action('SUDDEN'), action('CLEAR'), action('PAD')]),
  ...placeholder('ASSIGN', 'ASSIGN', [null, null, null, null, null, null]),
];
