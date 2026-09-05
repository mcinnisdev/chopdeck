The 4×4 rubber pad — press to trigger a sample; use in a grid with `gap: var(--pad-gap)`.

```jsx
<Pad label="PAD 1" note="A8" onTrigger={() => play(0)} lit={step === 0} />
```

- `color="grey"` for the studio-style grey rubber; default red matches the logo.
- `lit` lights the pad from outside (playback); the pad also lights itself while pressed.
- Silkscreen label lives above the pad, like on the hardware — never inside it.
