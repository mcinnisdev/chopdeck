Physical push-button: the only kind of button in Chop Deck. Label is silkscreened on the panel under the cap (never on it); LEDs sit above the cap; the slot is reserved on every button so caps align in a row.

```jsx
<HardButton label="PLAY START" led="green" ledOn={playing} onClick={play} />
<HardButton label="REC" cap="red" led="red" ledOn={rec} />
<HardButton label="F1" size="sm" />
```

- `cap="red"` only for REC/OVER DUB; `cap="amber"` only for OPEN WINDOW / attention.
- `size="sm"` for F-keys and numeric pads; `lg` for transport.
- `active` latches the pressed state (e.g. current mode).
