// Sequence: the current track on a 1/16 grid, one row per pad, plus live recording from the pads.
// The grid is the sequence's events; STEP EDIT on the OG panel shows the same notes.
import { Lcd, StepGrid, HardButton } from '@/ds';
import { padNames } from '@/disk/kit';
import type { EzCtx } from '../EzPanel';

const SWINGS = [50, 54, 58, 62, 66];

export function SequencePanel({ ctx }: { ctx: EzCtx }) {
  const { fw } = ctx;
  const m = fw.m, s = fw.s;
  const q = m.sequences[s.seq];
  const tr = q.tracks[s.track];
  const { steps, rows, per } = fw.stepGrid();
  const pgmIndex = fw.padTarget(0).program;
  const names = padNames(m, m.programs[pgmIndex]);
  const labels = names.map((n, i) => `${i + 1} ${n || '·'}`);
  const current = s.playing ? Math.floor(Math.max(0, s.now) / per) % steps : undefined;
  const notes = tr.events.filter(e => e.kind === 'note').length;
  const usedTracks = q.tracks.map((t, i) => ({ t, i })).filter(x => x.i === s.track || x.t.used || x.t.events.length);
  return (<>
    <p className="ez-help">
      Tap a cell to place a hit. Press Rec and play the pads to record live instead. Pattern <b>{s.seq + 1}</b> <em>{q.name.trim() || 'untitled'}</em>, {q.bars} {q.bars === 1 ? 'bar' : 'bars'}, track{' '}
      <select className="ez-field" aria-label="Track" value={s.track} onChange={e => { s.track = Number(e.target.value); fw.touch(); }} style={{ fontSize: 13, padding: '3px 6px' }}>
        {usedTracks.map(({ t, i }) => <option key={i} value={i}>{i + 1} {t.name.trim() || '(unused)'} · {t.type}</option>)}
      </select>{' '}{notes} notes.
    </p>
    <Lcd style={{ width: '100%', display: 'flex' }}>
      <div style={{ whiteSpace: 'normal', width: '100%', overflowX: 'auto' }}>
        <StepGrid rows={labels} steps={steps} pattern={rows} current={current} onToggle={(r, st) => fw.toggleStep(r, st)} />
      </div>
    </Lcd>
    <div className="ez-row">
      <HardButton label="Loop" led="green" ledOn={q.loop.on} onClick={() => fw.setLoop(!q.loop.on)} />
      <HardButton label="Clear" onClick={() => fw.clearTrack()} />
      <HardButton label="Undo" disabled={!s.undoAvailable} onClick={() => fw.key('UNDO', true)} />
      <HardButton label={`Swing ${m.swing}%`} size="sm" active={m.swing > 50} onClick={() => fw.setSwing(SWINGS[(SWINGS.indexOf(m.swing) + 1) % SWINGS.length] ?? 50)} />
      <span onPointerDown={() => fw.key('TAP', true)} onPointerUp={() => fw.key('TAP', false)}><HardButton label="Tap tempo" /></span>
      <span style={{ width: 8 }} />
      <HardButton label="Bars" size="sm" disabled={q.bars <= 1} onClick={() => fw.setBars(q.bars - 1)}>−</HardButton>
      <HardButton label={`${q.bars}`} size="sm" onClick={() => fw.setBars(q.bars + 1)}>+</HardButton>
    </div>
    <div className="ez-row" role="group" aria-label="Patterns">
      <span className="ez-bank-label" style={{ alignSelf: 'center' }}>Pattern</span>
      {Array.from({ length: 8 }, (_, i) => { const sq = m.sequences[i]; const n = sq.tracks.reduce((a, t) => a + t.events.length, 0); return <HardButton key={i} size="sm" active={(s.playing && s.nextSeq != null ? s.nextSeq : s.seq) === i} label={`${i + 1}`} onClick={() => fw.setSequence(i)}>{n ? `${n}` : '·'}</HardButton>; })}
    </div>
  </>);
}
