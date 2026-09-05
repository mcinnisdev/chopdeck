// LCD screens — each renders the content of one firmware "mode" inside <Lcd>
const { Lcd, LcdField, SoftKeys, LcdWindow, Waveform } = window.FunMPCDesignSystem_3bf065;
const pad2 = (n) => String(n).padStart(2, '0');
const MODES = ['MAIN', 'TRACK', 'SAMPLE', 'CHOP', 'LOAD', 'MIX'];

function MainScreen({ s }) {
  const bar = Math.floor(s.step / 16) + 1, beat = Math.floor((s.step % 16) / 4) + 1, tick = (s.step % 4) * 24;
  return (<>
    <div>SEQ:01-{s.seqName.padEnd(16)}   NOW:{pad2(bar).padStart(3, '0')}.{pad2(beat)}.{pad2(tick)}</div>
    <div><LcdField label="BPM" value={s.bpm.toFixed(1)} selected={s.cursor === 0} />  <LcdField label="LOOP" value={s.loop ? 'ON ' : 'OFF'} selected={s.cursor === 1} />  <LcdField label="BARS" value="1" selected={s.cursor === 2} />  <LcdField label="TSIG" value="4/4" /></div>
    <div style={{ color: 'var(--lcd-dim)' }}>TR:01-DRUMS        PGM:{s.program}</div>
    <div>{s.rec ? '● REC' : s.playing ? '► PLAY' : '■ STOP'}     PAD:{s.lastPad != null ? `${pad2(s.lastPad + 1)} ${window.MPC_PADS[s.lastPad]}` : '--'}</div>
    <div style={{ letterSpacing: 2 }}>{Array.from({ length: 16 }, (_, i) => (i === s.step % 16 && s.playing) ? '▮' : window.MPC_SEQ[i].length ? '▪' : '·').join('')}</div>
  </>);
}
function TrackScreen({ s }) {
  const rows = [['01', 'DRUMS', 'BREAK_93', 'ON '], ['02', 'BASS', '808_KIT', 'ON '], ['03', 'KEYS', 'RHODES_C', 'MUTE'], ['04', '(UNUSED)', '--------', '   ']];
  return (<>
    <div>TRACK MUTE            SEQ:01-{s.seqName}</div>
    <div style={{ color: 'var(--lcd-dim)' }}>TR  NAME      PROGRAM    STATE</div>
    {rows.map((r, i) => <div key={i} style={i === s.cursor ? { background: 'var(--lcd-cursor)', color: 'var(--lcd)' } : null}>{r[0]}  {r[1].padEnd(9)} {r[2].padEnd(10)} {r[3]}</div>)}
  </>);
}
function SampleScreen({ s }) {
  return (<>
    <div>SAMPLE:{s.program.padEnd(14)}  {pad2(s.lastPad != null ? s.lastPad + 1 : 1)} {window.MPC_PADS[s.lastPad ?? 0]}</div>
    <Waveform data={window.MPC_PEAKS} playhead={s.playing ? (s.step % 16) / 16 : undefined} width={s.lcdW - 24} height={60} />
    <div><LcdField label="ST" value="0000000" selected={s.cursor === 0} />  <LcdField label="END" value="0412160" selected={s.cursor === 1} />  <LcdField label="LEVEL" value="100" selected={s.cursor === 2} /></div>
    <div><LcdField label="TUNE" value="+00.00" />  <LcdField label="LOOP" value="OFF" />  <LcdField label="LENGTH" value="9.35S" /></div>
  </>);
}
function ChopScreen({ s }) {
  const c = window.MPC_CHOPS;
  return (<>
    <div>CHOP SHOP   {s.program.padEnd(12)}  REGIONS:{pad2(c.length)}</div>
    <Waveform data={window.MPC_PEAKS} chops={c} selected={s.chop} width={s.lcdW - 24} height={60} />
    <div><LcdField label="CHOP" value={`${pad2(s.chop + 1)}/${pad2(c.length)}`} selected />  <LcdField label="ST" value={String(Math.round(c[s.chop] * 412160)).padStart(7, '0')} />  <LcdField label="END" value={String(Math.round((c[s.chop + 1] ?? 1) * 412160)).padStart(7, '0')} /></div>
    <div style={{ color: 'var(--lcd-dim)' }}>DATA WHEEL MOVES CHOP · PAD ASSIGNS · F6 CONVERTS</div>
  </>);
}
function LoadScreen({ s }) {
  return (<>
    <div>LOAD                 DRIVE:BROWSER  FREE:16.0MB</div>
    <div style={{ color: 'var(--lcd-dim)' }}>DROP A WAV/MP3 HERE OR PICK A FILE</div>
    {window.MPC_FILES.map((f, i) => <div key={f} style={i === s.cursor ? { background: 'var(--lcd-cursor)', color: 'var(--lcd)' } : null}>{i === s.cursor ? '►' : ' '} {f.padEnd(18)} {['1.2MB', '3.4MB', '0.3MB', '2.1MB', '4.0MB', '0.9MB'][i]}</div>)}
  </>);
}
function MixScreen({ s }) {
  const lv = [100, 92, 100, 88, 76, 60, 84, 84, 100, 100, 100, 100, 95, 95, 95, 95];
  return (<>
    <div>MIXER               PGM:{s.program}</div>
    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>{lv.map((v, i) => <div key={i} style={{ width: `calc((100% - 60px) / 16)`, height: 56, display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid var(--lcd-ink)' }}><div style={{ width: '100%', height: `${v * (i === (s.lastPad ?? -1) ? 1 : .8)}%`, background: i === s.lastPad ? 'var(--lcd-ink)' : 'var(--lcd-dim)' }} /></div>)}</div>
    <div style={{ fontSize: 'var(--lcd-sm)', letterSpacing: '.1ch' }}>{Array.from({ length: 16 }, (_, i) => pad2(i + 1)).join(' ')}</div>
  </>);
}
const SCREENS = { MAIN: MainScreen, TRACK: TrackScreen, SAMPLE: SampleScreen, CHOP: ChopScreen, LOAD: LoadScreen, MIX: MixScreen };

function MpcLcd({ s, onSoftKey, onWindowKey, lcdW }) {
  const Screen = SCREENS[s.mode];
  return (
    <Lcd cols={46} rows={7} style={{ width: '100%' }}>
      <div style={{ width: lcdW - 24, display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 26 }}><Screen s={{ ...s, lcdW }} /></div>
      <SoftKeys keys={MODES} active={MODES.indexOf(s.mode)} onSelect={onSoftKey} style={{ position: 'absolute', left: 6, right: 6, bottom: 6 }} />
      {s.window && <LcdWindow title={s.window.title} keys={s.window.keys} onKey={onWindowKey}>{s.window.body.map((l, i) => <div key={i}>{l}</div>)}</LcdWindow>}
    </Lcd>
  );
}
Object.assign(window, { MpcLcd, MPC_MODES: MODES });
