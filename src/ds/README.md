# src/ds

Typed React ports of the Chop Deck design system (`design-system/components/*`). Import from `@/ds`.

**Rule:** this folder is the only place that imports design tokens. `tokens.css` does
`@import '../../design-system/styles.css'` (fonts, colours, type, spacing, effects, base) and
`index.ts` pulls it in, so anything that imports `@/ds` gets the tokens. Nothing else in `src/`
may import from `design-system/`.

Visual rules carried over: no hover states, hardware press physics (cap drops 2px / pad 3px,
shadow to 0), silkscreen labels under controls (pads and the Keypad print theirs above, as on the
hardware), tokens only, no icon sets, never "MPC" in UI copy.

## Components

Controls: `Led`, `HardButton`, `Pad`, `Knob`, `Fader`, `CursorPad`, `DataWheel` (new), `Keypad` (new).
Display: `Lcd` (bezel + glass), `LcdField`, `SoftKeys`, `LcdWindow`, `Waveform`, `Panel`, `Silkscreen`, `Wordmark`.

## Upgrades over the design-system originals

1. **Press / release / hold semantics.** `HardButton` gets `onPress` / `onRelease` (pointer capture,
   release fires exactly once per press, also on unmount), `shiftLabel` (dim second silkscreen line)
   and `width`. `Pad` gets `onTrigger(velocity 1..127)` (strike position top=40 / bottom=127, real
   pressure when the device reports it, or `fixedVelocity`), `onRelease`, `onPressure(0..1)` while
   held, `letters` on the pad face, and per-pad pointer tracking for multi-touch. `Fader` gets
   `onRelease`. `CursorPad` auto-repeats after 400 ms every 80 ms.
2. **New instrument controls.** `DataWheel`: endless encoder, circular drag with detents
   (`detentPx` of rim travel), x2/x4 acceleration on fast drags, mouse wheel (100 units per detent)
   and keyboard (arrows, Shift = 10). `Keypad`: the 3x4 MODE block built from `HardButton`, with
   `onKey` / `onKeyRelease` and `shiftHeld`.
3. **Display.** `Lcd` drops `cols`/`rows` for `width` / `height` on the glass plus `glassRef` so a
   framebuffer layer can fill and measure it. `SoftKeys` renders the hardware's three states:
   reversed (page jump, default), framed (`framed[i]`, executable action) and plain
   (`active === i`, current page).
