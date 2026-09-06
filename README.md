# Chop Deck

A browser sampler and sequencer shaped like a late-90s hardware drum machine. The URL is the app: you load
it and look down at the machine. Everything happens on the LCD and the front panel, the way it did on the
16-bit samplers that built a lot of records. Free, open source, no ads, no tracking, works offline.

**Play it at [chopdeck.com](https://chopdeck.com).** Read the [owner's manual](https://chopdeck.com/manual/).

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
- Optional, on chopdeck.com: an account that carries your project between computers, libraries of kits and
  public-domain samples, and beats you can publish, open on the machine and remix

## Run it

```
npm install
npm run dev
```

The machine boots with a factory demo: a starter kit, a two-bar break already chopped onto program 2, two sequences and a song, so PLAY START makes a beat on the first visit (OTHER > INIT restores it). Open the printed URL in a Chromium browser (Web MIDI needs Chromium; everything else works in Firefox and
Safari too). Hit a pad. `Shift` + a number key changes mode, exactly like the silkscreen on the keypad.

## Run it anywhere, offline

```
npm run build
```

`dist/` is the whole instrument as static files. Serve it from any web server, a USB stick, or
`npx serve dist`. No account, no API, no network: the machine notices there is no site behind it and
hides the site's links. Projects live in the browser; SAVE mode exports `.CHOPDECK`, `.WAV` and `.MID`
files and LOAD brings them back.

## Desktop app

The same build in a native window, for Windows, macOS and Linux, working entirely offline. Installers
are attached to each [GitHub release](https://github.com/mcinnisdev/chopdeck/releases). `docs/DESKTOP.md`
explains how it is put together (Tauri around `dist/`, one codebase) and how to cut a release.

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

The same list lives on the machine under OTHER > HELP, and every control shows a tooltip on hover that links into the owner's manual at `/manual/` (hold `Alt` and click a control to jump straight there). A first visit opens the QUICK START tour, a ten-step walk around the panel that ends with dropping in your own sounds, chopping them and recording; the same guide opens the manual.

## Develop

```
npm run typecheck   # strict TypeScript, app and server
npm test            # Vitest: model, sequencer, DSP, every screen as text, the API on Miniflare
npm run test:e2e    # Playwright: boots the machine in Chromium, records a loop, loads a file, syncs, publishes
npm run build
npm run assets      # re-render public/og.png and the PNG icons from scripts/og/card.html
```

- `design-system/` is the visual source of truth (tokens, component specs, the original concept).
- `src/ds/` typed components ported from it.
- `src/lcd/` the 48x8 character framebuffer and its renderer.
- `src/kernel/` the firmware: modes, screens, fields, cursor, DATA wheel, numeric entry, windows.
- `src/screens/` one file per mode; every screen is a pure function of machine state and is tested as text.
- `src/model/` the machine data model, tick math, serialisation.
- `src/seq/` transport and event operations.
- `src/audio/` the sampler engine, DSP, effects, recorder, offline bounce.
- `src/disk/` file formats (WAV, SMF, ZIP bundles), the IndexedDB drive, account sync, the libraries' client side.
- `src/midi/` Web MIDI.
- `server/` and `functions/` the optional API: accounts, sync, kits, samples, beats, on Cloudflare Pages
  Functions with D1 and R2. `docs/DEPLOY.md` covers running it.

`CONTRIBUTING.md` has the rules that keep the code coherent and how to make a fork your own.
`ROADMAP.md` is the plan and its status. `docs/mpc2000xl-feature-inventory.md` is the behavioural spec
the screens follow.

## Licence

MIT, see `LICENSE`. The name "Chop Deck", the wordmark and the logo are not part of the licence; forks are
asked to pick their own. The machines that inspired this project and their names belong to their makers.
Built by [mcinnis.dev](https://mcinnis.dev). If it earned a place on your desk,
[buy the maker a coffee](https://buymeacoffee.com/nickmcinnis).
