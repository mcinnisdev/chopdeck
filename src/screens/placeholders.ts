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
];
