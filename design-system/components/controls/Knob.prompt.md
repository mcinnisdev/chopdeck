Rotary control for continuous values — volume, rec gain, data entry (as the big `size="lg"` DATA wheel).

```jsx
<Knob label="MAIN VOLUME" value={vol} onChange={setVol} />
<Knob label="DATA" size="lg" ticks={false} value={pos} min={0} max={999} onChange={setPos} />
```

Drag vertically or use arrow keys. Replaces every `<input type="range">` / slider in the product.
