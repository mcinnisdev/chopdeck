# EZ mode

Two front panels, one machine. **OG** is the panel we have: the original workflow, LCD, soft keys,
modes on the keypad, everything the 2000XL could do. **EZ** is a second panel over the same machine
with plain words on everything, laid out the way a browser can lay it out, working across device
sizes. Its goal is parity with OG, reached one workflow at a time, without OG's learning curve. A
physical switch beside the wordmark flips between them, and switching is lossless because there is
nothing to convert.

## The one rule

EZ mode owns no state and no engine. It is a view over the same `Machine`, the same `Session`, the
same `Transport` and `AudioEngine`, driven through the same kernel calls the OG screens use
(`firmware.padDown`, `transport.play`, the event operations in `src/seq/events.ts`, the DSP in
`src/audio/dsp.ts`). Whatever you do in EZ is on the LCD when you switch to OG; whatever you recorded
in OG is on the grid in EZ. Autosave, sync, the libraries, publishing and the desktop app do not know
which panel is showing.

That rule is what keeps this from becoming two products to maintain. EZ cannot drift from the
machine because it has no way to.

## What EZ shows

Words in EZ are the plain ones; each maps onto a machine concept, and the manual's EZ chapter says so.

| EZ says | Machine concept | Notes |
|---|---|---|
| Kit | the program on DRUM1 | Kit picker: the machine's programs by name, plus "from the library" |
| Pads | the 16 pads of bank A | Big, named after their sounds, coloured by whether they hold one |
| Pattern 1 to 8 | sequences 1 to 8 | Bars and tempo shown per pattern; the other 91 stay in OG |
| Steps | events at 1/16 grid ticks on the DRUM1 track | A 16-step row per pad; longer bars scroll; off-grid notes show as dots |
| Swing | `Timing` swing % | One slider |
| Record | REC + PLAY START with count-in and loop on | The red button; UNDO is a button too |
| Sounds | the sounds in memory, LOAD for files | Add files or drop them anywhere; audition; Put on pad; Chop |
| Chop | TRIM, ZONE, SLICE SOUND | Drag the region on the waveform, choose 4/8/16 slices, put on pads in a new kit or this one |
| Edit pads, New kit, Kit name | PROGRAM mode | Tap a pad to choose its sound or clear it; a fresh program on DRUM1; its name |
| Mixer | per-note level and pan on the kit | A fader and a pan knob per pad |
| Song | song 1 | A row of pattern chips in order; later |
| Save, Load | `.CHOPDECK` files, and the browser disk | Two buttons; autosave and sync keep working underneath |

Not in EZ yet: the other sequences and tracks, MIDI tracks and settings, programs beyond the one on
DRUM1, DRUM2 to DRUM4, disk folders, effects routing, note variation, step edit of parameters other
than velocity. Each arrives in EZ when its workflow gets a plain shape; until then it is one flick of
the switch away in OG, and the EZ chapter says where. Parity is the goal, not a fence.

## How it looks

Still the machine's clothes: navy chassis, cream plates, red pads, the amber silkscreen, Barlow
labels, the design system's tokens. No LCD text navigation: fields become labelled controls. Bigger
targets, so this is also the touch layout for phones and tablets that the roadmap owes: EZ reflows
to one column under 900 px, pads full width, the transport pinned to the bottom.

## Where it lives in the code

- `src/ez/` next to `src/app/`: `EzPanel.tsx` and its parts (`Pads`, `Grid`, `Transport`, `Chop`,
  `Mixer`, `KitPicker`). React components that read `firmware.m` and `firmware.s` through the
  existing `useFirmware()` store and call kernel methods. No new stores.
- `src/app/panel.ts`: the toggle. `localStorage` key `chopdeck.panel`, `?panel=ez` in the URL,
  and a first-visit default (below). `main.tsx` renders `<Chassis>` or `<EzPanel>` from it; the
  header line gains `OG · EZ`.
- Kernel additions only where EZ needs an operation the screens did with several key presses, for
  example `firmware.setStep(track, pad, step, on)` or `firmware.sliceToPads(sound, n)`. These become
  plain methods on `Firmware` that the OG screens can use too; nothing is duplicated.
- Tests: EZ operations are kernel methods, so they get unit tests like the screens; the panel gets
  browser tests (record a pattern on the grid, switch to OG, see the notes on the step screen, and
  back).

## Where it stands

The refreshed design (`ui_kits/chopdeck-app/ez.html` in the design system: cream page, transport in the
header, four hard buttons swapping one panel, pads always on screen, phone / tablet / desktop reflow)
is what ships. Chop, Sequence, Library and Mix exist; each grows toward parity from here.

## Phases

Each ships on its own and is usable.

- **EZ 1: Play.** The toggle, the panel shell, pads with names, kit picker, transport with tempo
  and swing, pattern chips, Save and Load, the library and beats links. A casual visitor can play
  the demo, switch kits, and change the tempo.
- **EZ 2: Sequence.** The step grid with velocity on long press, record from the pads, undo,
  pattern length. Switching to OG shows the same notes on STEP.
- **EZ 3: Chop.** Drop a file or open a sample, waveform with a draggable region, slice count,
  "Put on pads" onto the current kit. The samples library becomes useful to a first-timer.
- **EZ 4: Mix and share.** Faders and pans, export WAV, publish a beat from EZ (the existing
  publish page, reached from a button).
- **EZ 5: Touch.** The one-column reflow, pointer sizes, no hover-only affordances; test on a phone.

## Decisions

1. **Default panel for a first visit.** Recommendation: OG on desktop widths, because the machine is
   the brand and the thing people share; EZ on touch and narrow screens, where OG does not fit. The
   tour's first step names the toggle. The other option is EZ everywhere with OG one click away;
   easy to change later, it is one line.
2. **Names.** OG and EZ, as proposed. They read well on the silkscreen and they are honest.
3. **Pattern count.** Eight in EZ. More than a casual user needs, few enough for chips.

## Risks

- **Two machines instead of one.** EZ grows toward parity, but only through kernel methods the OG
  screens share. An EZ feature that needs its own model or its own audio path is the wrong shape.
- **Diverging behaviour.** Any operation EZ needs goes into the kernel as a method, never into the
  EZ component, so OG and EZ cannot disagree about what a step or a slice is.
- **Two panels to keep in the design system's voice.** EZ uses the same components (`src/ds`) and
  tokens; no new visual language.
