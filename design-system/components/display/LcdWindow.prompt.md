A firmware-style modal drawn over the LCD contents. Use instead of any web dialog/toast/alert.

```jsx
<Lcd cols={40} rows={8}>
  {screen}
  {confirm && <LcdWindow title="LOAD A SOUND" onKey={(i,k) => k === 'DO IT' ? load() : close()}>
    <div>FILE: BREAK_93.WAV</div><div>ASSIGN TO: PAD 1</div>
  </LcdWindow>}
</Lcd>
```

Confirm is "DO IT" (F6), dismiss is "CANCEL" (F5) — keep this vocabulary.
