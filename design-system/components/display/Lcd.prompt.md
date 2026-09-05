The LCD is the app's only "screen" — all lists, parameters, dialogs and waveforms live here in VT323 pixel type, uppercase, `white-space: pre`.

```jsx
<Lcd cols={40} rows={8}>
  <div>SEQ:01-FUNKY DRUMMER      NOW:001.01.00</div>
  <div><LcdField label="BPM" value="93.0" selected /> <LcdField label="LOOP" value="ON" /></div>
  <SoftKeys keys={['MAIN','TRACK','SAMPLE','CHOP','','MIX']} active={0} onSelect={setMode} style={{ position:'absolute', left:6, right:6, bottom:6 }} />
</Lcd>
```

- Keep to a fixed character grid (cols/rows) — line up columns with spaces like a real firmware.
- `LcdField selected` is the cursor; only one selected field per screen.
- SoftKeys sit on the LCD bottom edge and correspond to the F1–F6 `HardButton`s below the bezel.
