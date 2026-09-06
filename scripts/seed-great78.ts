// Seed the samples library with public-domain 78s from the Internet Archive's Great 78 Project.
//
//   CHOPDECK_ADMIN_TOKEN=... npx vite-node scripts/seed-great78.ts --site https://chopdeck.com --count 24
//   npx vite-node scripts/seed-great78.ts --dry            # only list what would be picked
//
// Picks recordings published up to 1925 (US public domain as of 2026 under the Music Modernization
// Act: pre-1923 since 2022, then 100 years after publication), sorted by popularity, restricted to
// instrumental, jazz, blues, ragtime and dance subjects, and screened against a list of slurs that
// the era's titles are full of. Each pick is downloaded as MP3, decoded in headless Chromium,
// downmixed to mono at 44.1 kHz, cut to four minutes, wrapped as a .SND, and published through the
// admin API with the Internet Archive item as its source.
import { chromium } from '@playwright/test';
import { encodeSnd } from '@/disk/formats';
import { newSound } from '@/model/factory';
import { peaksOf, durationMs } from '@/disk/sample';
import { sha256 } from '@/disk/manifest';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? '1' : process.argv[++i]); }
const SITE = (args.get('site') ?? 'https://chopdeck.com').replace(/\/$/, '');
const COUNT = Number(args.get('count') ?? 24);
const DRY = args.has('dry');
const TOKEN = process.env.CHOPDECK_ADMIN_TOKEN ?? '';
if (!DRY && !TOKEN) { console.error('set CHOPDECK_ADMIN_TOKEN (or pass --dry)'); process.exit(1); }

const UA = 'chopdeck-seed/1.0 (+https://chopdeck.com)';
const BLOCK = /\b(n[i1]gg|coon|darkie|darky|darkey|pickaninn|mammy|chink|jap\b|wop\b|kike|sambo|rastus|hottentot|jungle bunn|watermel)/i;
// Archive dates are sometimes wrong by a decade or more; performers who recorded only later are left out.
const LATER = /(willie lewis|wingy man+one|frankie masters|glenn miller|benny goodman|count basie|duke ellington|artie shaw|tommy dorsey|jimmy dorsey|fats waller|django|cab calloway|louis prima|bob crosby|harry james)/i;
/** Latest year we treat as public domain in the US today (pre-1923 since 2022, then one more year each January). */
const LAST_YEAR = Math.min(1946, new Date().getFullYear() - 101);
const titleCase = (s: string) => s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(\-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()) : s;
const SUBJECTS = ['Jazz', 'Blues', 'Ragtime', 'Instrumental', '"Fox Trot"', 'Dance', 'Hawaiian', 'Tango', '"One Step"', 'Waltz', 'March', 'Banjo', 'Piano', 'Xylophone', 'Orchestra'];

interface Doc { identifier: string; title: string; creator?: string | string[]; date?: string; downloads?: number; subject?: string | string[] }
interface Meta { metadata: Record<string, unknown>; files: { name: string; format?: string; size?: string; length?: string }[] }

const arr = (x: unknown): string[] => Array.isArray(x) ? x.map(String) : x == null ? [] : [String(x)];
const year = (d?: string) => Number((d ?? '').slice(0, 4)) || 0;

async function search(rows: number): Promise<Doc[]> {
  const q = `collection:georgeblood AND mediatype:audio AND date:[1900-01-01 TO ${LAST_YEAR}-12-31] AND subject:(${SUBJECTS.join(' OR ')})`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date&fl[]=downloads&fl[]=subject&sort[]=downloads+desc&rows=${rows}&output=json`;
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`search ${r.status}`);
  return (await r.json() as { response: { docs: Doc[] } }).response.docs;
}

function pick(docs: Doc[], n: number): Doc[] {
  const out: Doc[] = []; const seen = new Set<string>();
  for (const d of docs) {
    const title = String(d.title ?? '').trim();
    const key = `${title.toLowerCase()}|${arr(d.creator)[0]?.toLowerCase() ?? ''}`;
    if (!title || seen.has(key) || year(d.date) > LAST_YEAR || year(d.date) === 0) continue;
    if (BLOCK.test(title) || BLOCK.test(arr(d.creator).join(' ')) || BLOCK.test(arr(d.subject).join(' '))) continue;
    if (LATER.test(arr(d.creator).join(' ')) || LATER.test(title)) continue;
    seen.add(key); out.push(d);
    if (out.length >= n) break;
  }
  return out;
}

async function meta(id: string): Promise<Meta> {
  const r = await fetch(`https://archive.org/metadata/${id}`, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`metadata ${r.status}`);
  return await r.json() as Meta;
}

/** The transfer to use: George Blood items carry several stylus sizes; take the MP3 marked restored if any, else the first MP3. */
function pickFile(m: Meta): { name: string; size: number } | null {
  const mp3s = m.files.filter(f => /\.mp3$/i.test(f.name)).map(f => ({ name: f.name, size: Number(f.size ?? 0) }));
  if (!mp3s.length) return null;
  return mp3s.find(f => /restored/i.test(f.name)) ?? mp3s.sort((a, b) => a.size - b.size)[0];
}

async function main() {
  console.log(`searching the Great 78 Project (site ${SITE}, ${DRY ? 'dry run' : 'publishing'})`);
  const docs = pick(await search(COUNT * 6), COUNT);
  console.log(`picked ${docs.length}:`);
  for (const d of docs) console.log(`  ${year(d.date)}  ${d.title}  (${arr(d.creator).join(', ')})  ${d.downloads ?? 0} downloads`);
  if (DRY) return;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const auth = { authorization: `Bearer ${TOKEN}` };
  let done = 0;
  for (const d of docs) {
    try {
      const m = await meta(d.identifier);
      const f = pickFile(m);
      if (!f) { console.log(`  skip ${d.identifier}: no mp3`); continue; }
      const src = `https://archive.org/download/${d.identifier}/${encodeURIComponent(f.name)}`;
      const res = await fetch(src, { headers: { 'user-agent': UA } });
      if (!res.ok) { console.log(`  skip ${d.identifier}: download ${res.status}`); continue; }
      const mp3 = new Uint8Array(await res.arrayBuffer());
      console.log(`  ${d.title}: downloaded ${(mp3.byteLength / 1024 / 1024).toFixed(1)} MB, decoding`);
      // decode in Chromium: mono, 44.1 kHz, at most four minutes, back as 16-bit PCM
      const pcm16 = await page.evaluate(async (b64: string) => {
        const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const buf = await ctx.decodeAudioData(bytes.buffer);
        const n = Math.min(buf.length, 44100 * 240);
        const out = new Int16Array(n);
        const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
        for (let i = 0; i < n; i++) { let v = 0; for (const c of chans) v += c[i]; v /= chans.length; out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767))); }
        let s = ''; const u8 = new Uint8Array(out.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
        return btoa(s);
      }, Buffer.from(mp3).toString('base64'));
      const i16 = new Int16Array(Buffer.from(pcm16, 'base64').buffer.slice(0));
      const pcm = new Float32Array(i16.length); for (let i = 0; i < i16.length; i++) pcm[i] = i16[i] / 32768;
      const creator = arr(d.creator).slice(0, 3).map(titleCase).join(', ');
      const title = titleCase(String(d.title).trim().replace(/\.$/, ''));
      const name = title.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'RECORD';
      const sound = newSound(name, [pcm], 44100);
      const snd = encodeSnd(sound);
      const hash = await sha256(snd);
      console.log(`  ${d.title}: ${(snd.byteLength / 1024 / 1024).toFixed(1)} MB .SND, uploading`);
      // HEAD needs a user session, so anything but 200 means upload; the admin route dedupes anyway
      const head = await fetch(`${SITE}/api/blobs/${hash}`, { method: 'HEAD', headers: auth });
      if (head.status !== 200) {
        const up = await fetch(`${SITE}/api/admin/blobs/${hash}?license=PD`, { method: 'POST', headers: { ...auth, 'content-type': 'application/zip' }, body: snd });
        if (!up.ok) { console.log(`  skip ${d.identifier}: upload ${up.status} ${await up.text()}`); continue; }
      }
      const subjects = arr(d.subject).map(s => s.toLowerCase()).filter(s => !/^lp$/.test(s));
      const tags = ['78rpm', `${Math.floor(year(d.date) / 10) * 10}s`, ...subjects].slice(0, 5);
      const label = String(m.metadata.publisher ?? m.metadata.label ?? '').trim();
      const description = `${creator ? `${creator}, ` : ''}${year(d.date)}${label ? `, ${label}` : ''}. A 78 rpm record digitised by the Great 78 Project at the Internet Archive, dated ${year(d.date)} by the Archive and public domain in the United States. Mono, four minutes at most.`;
      const pub = await fetch(`${SITE}/api/admin/samples`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({
        hash, title: title.slice(0, 64), description, source: `https://archive.org/details/${d.identifier}`, tags, license: 'PD',
        durationMs: durationMs(sound), rate: 44100, channels: 1, peaks: peaksOf(sound.pcm), featured: done < 6, slug: d.identifier.replace(/^78_/, '').replace(/_gbia\d+[ab]?$/, ''),
      }) });
      if (!pub.ok) { console.log(`  skip ${d.identifier}: publish ${pub.status} ${await pub.text()}`); continue; }
      done++;
      console.log(`  published ${d.title} (${(snd.byteLength / 1024 / 1024).toFixed(1)} MB) -> ${(await pub.json() as { url: string }).url}`);
    } catch (e) { console.log(`  skip ${d.identifier}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  await browser.close();
  console.log(`published ${done} of ${docs.length}`);
}

void main();
