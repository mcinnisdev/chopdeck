# Chop Deck

A browser sampler and sequencer shaped like a late-90s hardware drum machine. The URL is the app: you load
it and look down at the machine. Everything happens on the LCD and the front panel, the way it did on the
16-bit samplers that built a lot of records.

- 99 sequences of 64 tracks at 96 ppq, real-time and step recording, timing correct with swing, note repeat,
  loop record, punch, undo, song mode
- 32-voice sampler: 24 programs, 4 DRUM slots, 64 notes per program, resonant low-pass filter, envelopes,
  velocity modulation, voice overlap and mute groups
- Sampling from a microphone or the machine itself, trim, loop, zone slicing to pads, time stretch,
  resampling, stereo/mono conversion
- Mixer with per-note level and pan, two multi-effect chains and two reverbs
- Web MIDI in and out (pads, MIDI tracks, clock, footswitches)
- A browser disk with folders, standard MIDI file and WAV import/export, mixdown to WAV, project bundles,
  autosave

## Run it

```
npm install
npm run dev
```

Open the printed URL in a Chromium browser (Web MIDI needs Chromium; everything else works in Firefox and
Safari too). Hit a pad. `Shift` + a number key changes mode, exactly like the silkscreen on the keypad.

## Keyboard

| Keys | Machine |
|---|---|
| `Z X C V` / `A S D F` / `Q W E R` / `1 2 3 4` | pads 1-16 (bottom row first, like the panel) |
| `Space`, `Shift+Space` | PLAY / STOP, PLAY START |
| `F1`-`F6` | soft keys under the LCD |
| `F7` `F8` `F9` `F10` | REC, OVER DUB, STOP, PLAY |
| Arrows | CURSOR |
| `[` `]` (`Shift` for x10) | DATA wheel |
| `Enter`, `Esc`/`Backspace`, `Tab` | ENTER, MAIN SCREEN, OPEN WINDOW |
| Numpad `0`-`9` | numeric entry; `Shift` + top-row `0`-`9` = MODE |
| `,` `.` and `;` `'` | BAR << >>, STEP < > |
| `T`, `U`, `Delete`, `G` | TAP TEMPO / NOTE REPEAT, UNDO SEQ, ERASE, GO TO |

The same list lives on the machine under OTHER > HELP.

## Develop

```
npm run typecheck   # strict TypeScript
npm test            # Vitest: model, sequencer, DSP, every screen as text
npm run test:e2e    # Playwright: boots the machine in Chromium, records a loop, loads a file, reloads
npm run build
```

- `design-system/` is the visual source of truth (tokens, component specs, the original concept).
- `src/ds/` typed components ported from it.
- `src/lcd/` the 48x8 character framebuffer and its renderer.
- `src/kernel/` the firmware: modes, screens, fields, cursor, DATA wheel, numeric entry, windows.
- `src/screens/` one file per mode; every screen is a pure function of machine state and is tested as text.
- `src/model/` the machine data model, tick math, serialisation.
- `src/seq/` transport and event operations.
- `src/audio/` the sampler engine, DSP, effects, recorder, offline bounce.
- `src/disk/` file formats (WAV, SMF, ZIP bundles) and the IndexedDB drive.
- `src/midi/` Web MIDI.

`ROADMAP.md` is the plan and its status. `docs/mpc2000xl-feature-inventory.md` is the behavioural spec the
screens follow.
