// Sounds on the EZ panel: what is in memory, add more from files, audition, put one on a pad, chop one.
import { useRef, type CSSProperties } from 'react';
import type { Firmware } from '@/kernel/firmware';
import type { Sound } from '@/model/types';

const label: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const small: CSSProperties = { fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', padding: '6px 9px', border: '2px solid var(--ink)', borderRadius: 3, background: 'var(--white)', color: 'var(--ink)', cursor: 'pointer', boxShadow: '0 2px 0 var(--ink)' };
const secs = (s: Sound) => { const t = s.length / s.rate; return t < 10 ? `${t.toFixed(2)}s` : t < 60 ? `${t.toFixed(1)}s` : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`; };

export function EzSounds({ fw, onPutOnPad, onChop, onNote }: { fw: Firmware; onPutOnPad(id: string): void; onChop(id: string): void; onNote(msg: string): void }) {
  const input = useRef<HTMLInputElement>(null);
  const sounds = fw.m.sounds;
  const add = async (files: File[]) => { const got = await fw.importAudio(files); onNote(got.length ? `Added ${got.map(s => s.name).join(', ')}` : 'Nothing there the browser could decode'); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={label}>Sounds · {sounds.length}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={small} onClick={() => input.current?.click()}>Add sounds</button>
          <input ref={input} type="file" multiple accept="audio/*,.wav,.aif,.aiff,.mp3,.flac,.ogg,.m4a" hidden aria-label="Add sounds" onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) void add(f); e.target.value = ''; }} />
        </span>
      </div>
      {!sounds.length && <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>No sounds yet. Add files, or drop them anywhere on the panel.</span>}
      <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
        {sounds.map(s => (
          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 4, padding: '4px 8px' }}>
            <button type="button" aria-label={`Play ${s.name}`} onPointerDown={() => fw.sound.playSound(s)} onPointerUp={() => fw.sound.stopAll()} onPointerLeave={() => fw.sound.stopAll()}
              style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--red)', color: 'var(--cream)', border: '2px solid var(--ink)', cursor: 'pointer', boxShadow: '0 2px 0 var(--ink)', padding: 0 }}>►</button>
            <span style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
              <div style={{ ...label, fontSize: 9 }}>{secs(s)} · {s.channels === 2 ? 'stereo' : 'mono'} · {Math.round(s.rate / 100) / 10} kHz</div>
            </span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" style={small} aria-label={`Put ${s.name} on a pad`} onClick={() => onPutOnPad(s.id)}>Put on pad</button>
              <button type="button" style={small} aria-label={`Chop ${s.name}`} onClick={() => onChop(s.id)}>Chop</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
