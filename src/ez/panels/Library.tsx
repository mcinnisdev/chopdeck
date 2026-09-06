// Library: the samples library as a row of record sleeves with a turntable to listen on, and the sounds
// already in memory. "Send to chopper" adds the record to memory and opens Chop.
import { useEffect, useRef, useState } from 'react';
import { HardButton, Sleeve, Turntable } from '@/ds';
import { fetchBlobs } from '@/disk/sync';
import { decodeSnd } from '@/disk/formats';
import type { Sound } from '@/model/types';
import type { EzCtx } from '../EzPanel';

interface Rec { id: string; slug: string; hash: string; title: string; description: string; tags: string[]; source: string; durationMs: number; handle: string | null }
let cache: Rec[] | null = null;
const fmt = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const yearOf = (r: Rec) => (r.description.match(/\b(18|19|20)\d\d\b/) ?? [])[0] ?? '';
const HUES = ['#B4432F', '#2B4C7E', '#4A4A48', '#3E6B48', '#7A4A8A', '#A0642B'];

export function LibraryPanel({ ctx }: { ctx: EzCtx }) {
  const { fw, go, note, standalone } = ctx;
  const [recs, setRecs] = useState<Rec[] | null>(cache);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<{ id: string; sound: Sound } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const started = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (standalone || cache) return;
    fetch('/api/samples?limit=60', { credentials: 'same-origin' }).then(r => r.ok ? r.json() as Promise<{ samples: Rec[] }> : null).then(d => { cache = d?.samples ?? []; setRecs(cache); }).catch(() => setRecs([]));
  }, [standalone]);
  useEffect(() => {
    if (!playing || !loaded) return;
    const dur = loaded.sound.length / loaded.sound.rate;
    let raf = 0;
    const tick = () => { const p = (performance.now() - started.current) / 1000 / dur; if (p >= 1) { setPlaying(false); setProgress(0); return; } setProgress(p); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [playing, loaded]);

  const rec = recs?.[index] ?? null;
  const fetchRec = async (r: Rec): Promise<Sound | null> => {
    if (loaded?.id === r.id) return loaded.sound;
    setBusy(true);
    try {
      const blobs = await fetchBlobs([r.hash]); const bytes = blobs.get(r.hash); const snd = bytes ? decodeSnd(bytes) : null;
      if (!snd) { note('Could not fetch that record.'); return null; }
      setLoaded({ id: r.id, sound: snd }); return snd;
    } finally { setBusy(false); }
  };
  const listen = async () => {
    if (!rec) return;
    if (playing) { fw.sound.stopAll(); setPlaying(false); setProgress(0); return; }
    const snd = await fetchRec(rec); if (!snd) return;
    fw.sound.playSound(snd); started.current = performance.now(); setPlaying(true);
  };
  const send = async () => {
    if (!rec) return;
    const snd = await fetchRec(rec); if (!snd) return;
    fw.sound.stopAll(); setPlaying(false);
    fw.addSound(rec.title, snd.pcm, snd.rate);
    note(`${rec.title} is in the chopper`);
    go('chop');
  };
  const pick = (i: number) => { if (playing) { fw.sound.stopAll(); setPlaying(false); setProgress(0); } setIndex(i); };
  const m = fw.m;

  return (<>
    {!standalone && <>
      <p className="ez-help">Public-domain records. Pick one, listen, then send it to the chopper. Or drop your own audio file anywhere on this page.</p>
      {recs == null && <p className="ez-help">Opening the crate.</p>}
      {recs && recs.length === 0 && <p className="ez-help">The crate is empty. <a href="/samples/publish/">Publish a record</a> and it shows up here.</p>}
      {recs && recs.length > 0 && <>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}>
          {recs.map((r, i) => <Sleeve key={r.id} title={r.title} source={(r.tags[0] ?? r.handle ?? 'chop deck').toUpperCase()} year={yearOf(r)} duration={fmt(r.durationMs)} size={132} selected={i === index} onClick={() => pick(i)} style={{ scrollSnapAlign: 'start' }} />)}
        </div>
        {rec && <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Turntable playing={playing} progress={progress} label={rec.title} labelColor={HUES[index % HUES.length]} rpm={rec.tags.includes('78rpm') ? 78 : 33} size={120} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 200 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: 14, letterSpacing: '.06em', textTransform: 'uppercase' }}>{rec.title}</div>
              <p className="ez-help">{rec.description.split('. ')[0]}{rec.source ? ` · ${rec.source}` : ''} · {fmt(rec.durationMs)}</p>
            </div>
            <div className="ez-row">
              <HardButton label={playing ? 'Pause' : busy ? 'Fetching' : 'Listen'} led="green" ledOn={playing} disabled={busy} onClick={() => void listen()}>►</HardButton>
              <HardButton label="Send to chopper" cap="amber" size="lg" disabled={busy} onClick={() => void send()} />
            </div>
          </div>
        </div>}
      </>}
    </>}
    {standalone && <p className="ez-help">Drop audio files anywhere on this page, or add them below. The public-domain record crate lives on chopdeck.com.</p>}

    <div className="ez-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="ez-bank-label">Your sounds · {m.sounds.length}</span>
      <HardButton label="Add sounds" size="sm" onClick={() => input.current?.click()} />
      <input ref={input} type="file" multiple accept="audio/*,.wav,.aif,.aiff,.mp3,.flac,.ogg,.m4a" hidden aria-label="Add sounds" onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void fw.importAudio(f).then(got => { note(got.length ? `Added ${got.map(x => x.name).join(', ')}` : 'Nothing there the browser could decode'); if (got.length) go('chop'); }); }} />
    </div>
    <div className="ez-list">
      {m.sounds.map((x, i) => (
        <div key={x.id}>
          <button type="button" aria-label={`Play ${x.name}`} onPointerDown={() => fw.sound.playSound(x)} onPointerUp={() => fw.sound.stopAll()} onPointerLeave={() => fw.sound.stopAll()}
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--red)', color: 'var(--cream)', border: '2px solid var(--ink)', cursor: 'pointer', boxShadow: '0 2px 0 var(--ink)', padding: 0 }}>►</button>
          <span style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</div>
            <div className="ez-bank-label" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{(x.length / x.rate).toFixed(2)}s · {x.channels === 2 ? 'stereo' : 'mono'}</div>
          </span>
          <button type="button" aria-label={`Chop ${x.name}`} onClick={() => { fw.s.sound = i; fw.touch(); go('chop'); }}
            style={{ fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', padding: '6px 9px', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--white)', color: 'var(--ink)', cursor: 'pointer', boxShadow: '0 2px 0 var(--ink)' }}>Chop</button>
        </div>
      ))}
    </div>
  </>);
}
