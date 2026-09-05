Sample waveform drawn in LCD ink — for the CHOP / TRIM screens. Always place inside `Lcd`.

```jsx
<Lcd cols={44} rows={7}>
  <Waveform data={peaks} chops={[0, .18, .41, .63]} selected={1} width={430} height={70} />
</Lcd>
```
