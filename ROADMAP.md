# Chop Deck: from concept to working machine

Goal: a browser DAW with the workflow, depth and feel of a late-90s 16-bit sampler/sequencer. The bar is
functional parity with the 2000XL as documented in `docs/mpc2000xl-feature-inventory.md`, minus the parts
that only exist because of 1999 hardware (floppies, SCSI, option boards). Retro on the outside, modern
underneath: Web Audio, Web MIDI, IndexedDB, and a real build.

The design-system rule still governs everything: **the UI is the machine.** Every feature lands as an LCD
screen, a window, a soft key, or a hardware key. Nothing lands as web chrome.

---

## 1. Where we are

What exists today lives in `design-system/`:

- **Tokens and guidelines are solid.** Colour, type, spacing, bevels, motion, radii are all tokenised and
  documented. Nothing here needs to change to ship a product.
- **13 components** (`Pad`, `HardButton`, `Led`, `Knob`, `Fader`, `CursorPad`, `Lcd`, `LcdField`,
  `SoftKeys`, `LcdWindow`, `Waveform`, `Panel`, `Silkscreen`, `Wordmark`). Good visual fidelity, inline
  styles, ESM-ready JSX. They are presentational only.
- **The app kit** (`ui_kits/chopdeck-app/`) is a static mock: 80 lines of fake state in `Mpc.jsx`, six
  hard-coded screens in `Screens.jsx`, canned data in `data.js`. No audio, no persistence, no real
  sequencer. It runs React and Babel from unpkg at page load with no build, no tests, no git.

Gaps between the kit and the hardware it imitates, all of which the plan fixes:

| Area | Kit today | Hardware / target |
|---|---|---|
| Soft keys F1-F6 | Global mode tabs (MAIN/TRACK/SAMPLE/CHOP/LOAD/MIX) | Contextual per screen (`STEP EDIT TrMUTE SOLO Tr- Tr+` on Main, `TRIM LOOP ZONE PARAMS EDIT PLAY X` in Trim, and so on) |
| MODE keypad | 7 MIDI, 8 OTHER, 9 MIXER, 2 STEP, 0 ENTER | 7 MIXER, 8 OTHER, 9 MIDI/SYNC, 2 MISC, 0 SAVE, separate ENTER; modes reached with SHIFT + digit |
| Missing keys | NEXT SEQ, TRACK MUTE, AFTER/ASSIGN, NOTE REPEAT label, MAIN SCREEN and OPEN WINDOW as distinct keys | All present on the panel |
| DATA wheel | Bounded 0-1000 knob | Endless encoder with detents and acceleration |
| Pads | Trigger on press only, no velocity, no release | Velocity from pointer/keyboard, note-off on release, pressure for note repeat |
| Keys | Click only | Hold semantics (ERASE + pad, NOTE REPEAT + pad, GO TO + BAR, SHIFT modifier) |
| LCD | Free-form JSX, 46 columns, no attributes | Fixed character grid with inverse/dim attributes and bitmap regions (waveform, meters, faders) |
| Sequencer | `setInterval` stepping 16 lit pads | 96 ppq, audio-clocked, 99 sequences x 64 tracks |
| Sound | None | 32-voice sampler with filter, envelopes, voice overlap, mute groups |

---

## 2. What "parity" means here

**In scope (everything the manual describes that a browser can do):**
sequencer (99 seq x 64 tracks, 96 ppq, tempo map, time signatures, loop, count-in, metronome, timing
correct with swing and shift, note repeat, 16 levels, note variation slider, punch, erase, undo, step edit,
event edit, bar copy, track move, user defaults, next sequence, second sequence, track mute/solo pages),
song mode (20 songs, 250 steps, reps, convert to sequence), sampler (32 voices, 4 DRUM slots, 24 programs,
256 sounds, 64 notes per program, 3 sounds per note with SIMULT/VEL SW/DCY SW, envelopes, 12 dB resonant
low-pass, velocity mods, tune, voice overlap, mute assign, auto chromatic, purge), sound editing (trim,
loop, zones, slice to program, discard/section/insert/delete/silence/reverse, time stretch with BPM match,
convert stereo/mono, resample, beat loop tempo), sampling from an input with threshold and pre-record,
mixer (level/pan per note, channel settings, ALL CH link, master, mix-change recording), effects (the
EB16-class chain: distortion, 4-band EQ, modulation, echo, reverb), MIDI (in/out, tracks to external
channels, clock and MTC sync, MMC, footswitch CCs, soft thru, monitors, panic), disk (load/save/delete/
rename/folders for all data types, WAV and standard MIDI file import/export).

**Deliberately modern (kept inside the LCD so nothing breaks the retro rule):**

- Bounce a sequence or song to WAV. Essential for a DAW, not on the hardware.
- Drag-and-drop and file-picker loading of WAV/AIFF/MP3/FLAC.
- The "disk" is IndexedDB, plus optional access to a real folder through the File System Access API.
  Device field shows `BROWSER` or `FOLDER` instead of `Floppy` / `SCSI`.
- Computer keyboard as a second set of pads and transport.
- Memory limits are shown for flavour but not enforced at 2 MB. We keep the 256 sounds / 24 programs / 99
  sequences caps because the screens are designed around them.
- Multi-touch pads with pressure where the device reports it.

**Out of scope (hardware-only):** floppy/SCSI/F-ROM devices, formatting, OS loading, individual analogue
outputs, digital input, SMPTE, the MPC60 conversion tables, MIDI sample dump. Reading the machine's native
`.SND`/`.PGM`/`.SEQ`/`.ALL` files is a stretch goal, not a requirement.

---

## 3. Architecture

Five layers, strictly one-directional. React never talks to Web Audio directly, and the audio engine never
knows what a screen is.

```
chassis UI (React + design-system components)
        |  dispatch(key events, pad hits, wheel deltas)   ^ machine state + LCD buffer
firmware kernel (modes, screens, fields, cursor, windows, name entry, numeric entry, SHIFT)
        |  mutates                                          ^ reads
machine model (sequences, songs, sounds, programs, drums, mixer, midi, other, disk)   <- pure data + pure functions
        |  schedules                                        ^ transport position, meters
audio engine (Web Audio: voices, buses, fx, scheduler, recorder, bounce)
disk + midi adapters (IndexedDB, File System Access, Web MIDI)
```

### 3.1 Stack

- **Vite + React 18 + TypeScript.** The existing components port as-is (they already `import React`).
  New code is TypeScript; the ported components get `.d.ts` first and real types over time.
- **State:** a single machine store outside React (Zustand or a hand-rolled reducer + `useSyncExternalStore`).
  Audio-rate state (playhead, meters) lives in refs and is polled by `requestAnimationFrame`, never in
  React state.
- **Tests:** Vitest for the model and kernel. Playwright for a handful of end-to-end flows and audio golden
  renders through `OfflineAudioContext`.
- **Deploy:** static site. PWA manifest and service worker later so it installs and works offline.

### 3.2 The LCD as a character framebuffer

The single most important architectural choice. Every screen is a pure function
`(machine, uiState) -> LcdFrame`, where a frame is a fixed grid of cells with `{ch, inverse, dim}` plus
optional bitmap regions (waveform, level meter, fader strips, pan glyphs) that are drawn to a canvas layer
over the same cell coordinates.

- Grid: **48 columns x 8 rows.** The real display is roughly 41 x 6 (five data rows plus the soft-key
  row). The manual's screens all fit in 41 columns, so with 48 we can lay them out verbatim with breathing
  room and still keep two extra rows for things like the step grid or a wider waveform. The cell size
  scales to the bezel; the grid never changes.
- Row 8 is always the soft-key row. Rows 1-7 belong to the screen. Windows overlay rows 2-7 with a
  double-rule title.
- This gives us **golden-screen tests**: render a screen to text, diff against the manual's layout.
  Every screen in `docs/mpc2000xl-feature-inventory.md` becomes a fixture.

### 3.3 The firmware kernel

All 30-odd screens share one interaction model, so build it once:

- A **screen definition** declares fields (label, position, type: int / enum / name / time / note, range,
  getter, setter, `onWheel`, `onOpenWindow`), soft keys (label -> action or page), and which hardware keys
  it captures.
- The kernel owns: cursor position and movement across fields, DATA wheel deltas with acceleration,
  numeric keypad buffer + ENTER commit + cancel-on-move, SHIFT state (mode select, coarse steps, multi-
  select), the OPEN WINDOW stack (windows are screen definitions too), the shared **Name** window (pads
  type letters, 16 LEVELS = space, FULL LEVEL = case), the shared confirm window (`CANCEL` / `DO IT`),
  MAIN SCREEN key resets, and the "press page key again cycles list order" behaviour.
- Hardware keys that act globally regardless of screen (transport, locate, pad bank, FULL LEVEL,
  16 LEVELS, TAP TEMPO/NOTE REPEAT, UNDO SEQ, ERASE, AFTER, NEXT SEQ, TRACK MUTE) route through the kernel
  to the model, with screen-specific overrides where the manual says so.

### 3.4 Audio engine

- **Voice graph** (native nodes, 32 voices allocated from a pool):
  `AudioBufferSourceNode` (playbackRate = 2^(tune/120) x velocity-to-pitch) -> `BiquadFilterNode` lowpass
  (12 dB/oct, matching the hardware; `Freq` 0-100 mapped log 20 Hz-20 kHz, `Reson` -> Q, filter envelope
  and velocity-to-freq through AudioParam automation) -> `GainNode` amp envelope (attack ramp, decay with
  `END`/`START` modes) -> `StereoPannerNode` -> per-note stereo level `GainNode` -> DRUM bus -> master
  `GainNode` -> `AnalyserNode` for meters -> destination. FX sends tap the per-note gain into FX buses.
- **Voice allocator** implements POLY / MONO / NOTE OFF overlap, mute-assign (a note cutting two others),
  velocity switch / decay switch / simultaneous alternates, voice stealing when 32 are busy.
- **Scheduler:** the standard lookahead design. A Worker posts a tick every 25 ms (immune to background-tab
  throttling); the main thread converts ticks to seconds through the tempo map and schedules every event
  in the next 100 ms against `AudioContext.currentTime`. Tempo changes, loop wrap, count-in, metronome and
  next-sequence switching are all resolved in tick space before scheduling.
- **Record:** pad hits and MIDI input are timestamped against the audio clock, converted to ticks, and
  quantised on the fly when Timing is not OFF.
- **Sampler input:** `getUserMedia` -> `AudioWorkletNode` that fills a ring buffer, gives us the pre-record
  window, threshold detection, and peak-hold meters. A second source, the master bus, gives us resampling
  of the machine's own output.
- **Offline ops:** trim/section/reverse/silence/insert/normalise are array operations on `Float32Array`.
  Resample uses `OfflineAudioContext`. Time stretch is a small WSOLA implemented in a Worker; the 18
  presets x A/B/C map onto grain size and overlap. Deliberately lo-fi, like the original.
- **Bounce:** re-run the scheduler against an `OfflineAudioContext` and encode 16-bit WAV.

### 3.5 Data model (TypeScript, serialisable, no class instances)

```
Machine { sequences[99], songs[20], sounds[256], programs[24], drums[4], master, midi, other, defaults }
Sequence { name, tempo, tempoSource, tempoChanges[], tsig[], bars, loop, tracks[64] }
Track { name, type: MIDI|DRUM1..4, channel, on, pgm, veloPct, transmitPgm, transpose, events[] }
Event = Note{tick,note,vel,dur,nv} | Bend | CC | PgmChange | ChPressure | PolyPressure | Sysex | Mixer
Song { name, steps[{seq, reps}], loop, tempoSource, tempo, ignoreTempoChanges }
Sound { id, name, rate, channels, pcm: Float32Array[], st, end, loopTo, loopLength, loopOn, zones[], level, tune, beat }
Program { name, midiPgm, padAssign: PROGRAM|MASTER, padToNote[64], notes: Record<35..98, NoteParams>, fx }
NoteParams { snd, mode, alt[2], attack, decay, dcyMode, veloAttack, veloStart, veloLevel, freq, reson,
             fenvAttack, fenvDecay, fenvAmount, veloFreq, tune, veloPitch, overlap, mutes[2],
             vol, pan, fxSend, fxBus }
```

PCM lives in the sound store and is referenced by id from programs. Undo for the sequencer is the hardware's
single-level UNDO SEQ (snapshot of the current sequence before each record/edit, toggled by the key).

---

## 4. Panel corrections

Before any feature work, bring the chassis in line with the front panel so screens have keys to route to:

- MODE block: `7 MIXER, 8 OTHER, 9 MIDI/SYNC / 4 SAMPLE, 5 TRIM, 6 PROGRAM / 1 SONG, 2 MISC, 3 LOAD /
  SHIFT, 0 SAVE, ENTER`. Silkscreen the mode name above each digit. MAIN SCREEN and OPEN WINDOW become
  two keys in a row above the DATA wheel, as on the hardware.
- Add NEXT SEQ and TRACK MUTE beside FULL LEVEL / 16 LEVELS. Add AFTER (silkscreen `ASSIGN` beneath for
  the SHIFT function) next to the NOTE VARIATION slider. Relabel TAP TEMPO as `TAP TEMPO / NOTE REPEAT`.
- LEDs on: REC, OVER DUB, PLAY, AFTER, FULL LEVEL, 16 LEVELS, UNDO SEQ, PAD BANK A-D.
- LOCATE row keeps `< STEP >` and `<< BAR >>` with `EVENT`, `START`, `END` as shift silkscreens.
- Soft keys F1-F6 render whatever the current screen's row 8 says; the LCD soft-key row and the F-key
  caps are the same six actions.

Design-system additions this implies (each gets `.jsx` + `.d.ts` + `.prompt.md` like the others):
`DataWheel` (endless, detents, acceleration), `LcdScreen` (grid renderer with attributes and bitmap
layers), `LcdList` (scrolling rows with inverted cursor), `LcdMeter`, `LcdMixerStrip`, `LcdWaveform`
(replaces `Waveform`: zoom, sample-precise markers, zone shading), `Keypad` (the 3x4 mode block).
Existing `Pad` gains velocity, release and pressure callbacks; `HardButton` gains press/release/hold and a
`shifted` label slot.

Keyboard map (documented on an LCD help screen under OTHER, not as web UI): pads on `Z X C V / A S D F /
Q W E R / 1 2 3 4` (bottom row = pads 1-4, matching the pad numbering), Space = PLAY/STOP, Enter = ENTER,
arrows = CURSOR, `[` `]` = DATA wheel, Shift = SHIFT, Backspace = MAIN SCREEN, Tab = OPEN WINDOW,
F1-F6 = soft keys (with `Alt+1..6` as a fallback for browsers that reserve F-keys).

---

## 5. Phases

Each phase ends with something you can make a beat with. Ordering is chosen so the fun arrives early:
sounds first, then recording, then chopping, then depth.

### Phase 0: Foundation

Turn the design system into a codebase.

- [x] `git init`, Vite + React 18 + TypeScript scaffold at repo root; `design-system/` stays as the source
      of truth for tokens and component specs, `src/ds/` holds the ported components.
- [x] Port all 13 components and tokens; drop unpkg/Babel; pin React. Rename the bundle global (it still
      says `FunMPC`).
- [x] `LcdScreen` framebuffer renderer + `LcdFrame` type + golden-screen test harness.
- [x] Firmware kernel: screen definitions, cursor, DATA wheel, numeric entry, SHIFT, window stack, Name
      window, confirm window, MAIN SCREEN key.
- [x] Panel corrections from section 4, including `DataWheel`, `Keypad`, `Pad` velocity/release,
      `HardButton` hold.
- [x] Machine model types + empty-machine factory + JSON (de)serialisation.
- [x] Keyboard map. Vitest + Playwright wired. CI that runs both.

Done when: the chassis renders from a real machine store, every hardware key dispatches, SHIFT+digit
switches modes to placeholder screens, the Name window works with pads, and the MAIN screen's fields
(`Sq:`, `Now:`, tempo, `Timing:`, `Tsig:`, `Count:`, `Loop:`, `Bars:`, `Tr:`, `ON:`, `Pgm:`, `Velo%:`) are
cursor-navigable and wheel-editable against the model with no audio yet.

### Phase 1: Sound (pads, programs, mixer)

Make it an instrument.

- [x] Audio engine core: context lifecycle (unlock on first gesture), voice pool, voice graph, allocator,
      master and DRUM buses, MAIN VOLUME knob, meters.
- [x] LOAD: drag-and-drop anywhere on the LCD and file picker; decode WAV/AIFF/MP3/FLAC; "Load a Sound"
      window with `Assign to note:` + `PLAY` / `DSCARD` / `KEEP`. Sounds list with Memory/Size/Name order.
- [ ] PROGRAM mode: DRUM 1-4 select; ASSIGN (pad->note, note->sound, PROGRAM/MASTER pad assign,
      NORMAL/SIMULT/VEL SW/DCY SW, Assignment View window, Program window with NEW/COPY/DELETE/rename);
      PARAMS (envelope, decay mode, filter, tune, voice overlap, and the four OPEN WINDOW sub-pages:
      velocity->envelope, velocity/env->filter, velocity->pitch, mute assign; Copy Note Parameters);
      DRUM page; PURGE; AUTO chromatic.
- [x] Pad performance: banks A-D, FULL LEVEL, 16 LEVELS window (VELOCITY and NOTE VAR types), NOTE
      VARIATION slider with ASSIGN screen and AFTER key, pressure where available.
- [x] MIXER STEREO page (16 strips per bank, pan row / level row, pad selects channel, SHIFT+pad
      multi-select, ALL CH link), Channel Settings window, SETUP page (master level, mix source PROGRAM vs
      DRUM, copy pgm mix to drum).
- [x] Bundled starter kit: synthesised in code (kick, snare, hats, clap, rim, toms, bass, keys) so first load is playable with nothing to license.

Done when: load a kit, tweak filter/decay/tune per pad, play with mouse, touch and keyboard at low
latency, mix it, and the whole state survives a reload (Phase 4 does the real disk, Phase 1 autosaves the
machine to IndexedDB).

### Phase 2: Sequencer core

Make it a drum machine.

- [x] Tick engine: tempo map (initial tempo + tempo-change list, SEQ vs MAS source), tsig per bar,
      `bar.beat.tick` and `h m s f` display styles, Worker clock + lookahead scheduler.
- [x] Transport: PLAY, PLAY START, STOP, REC, OVER DUB with all the manual's combinations, punch-in by
      pressing REC/OVERDUB during play, loop (First/Last/END window) with REC->OVERDUB on wrap, auto-append
      bars when Loop is OFF, count-in and metronome (CLICK or DRUM accent/normal), Wait for key.
- [x] Recording: audio-clock timestamps, real-time timing correct with swing and shift timing, note
      duration from release, note variation captured per note, Velo% playback scaling, track ON/OFF,
      TrMUTE / SOLO soft keys, Tr- / Tr+.
- [x] Locate: STEP < >, BAR << >>, GO TO combos (start, end, previous/next event), Locate window with
      nine memories, `Now:` wheel-editable.
- [x] ERASE: hold + pad during overdub; Erase window when stopped (track, time range, event-type filter,
      notes filter).
- [x] UNDO SEQ single-level with LED; TAP TEMPO with averaging; NOTE REPEAT with pressure velocity and
      SHIFT lock.
- [x] All MAIN windows from the inventory: Sequence (rename/default/delete/all/copy/params), Time Display,
      Tempo Change, Timing Correct (destructive), Change Tsig, Count/Metronome + Metronome Sound, Loop,
      Change Bars + IN/DEL, Track (rename/default/delete/all/copy), Erase all OFF tracks, Edit Velocity.
- [x] TRACK MUTE pad page with SOLO; NEXT SEQ screen with SUDDEN / CLEAR / PAD page; second sequence.
- [x] Sequence user defaults (EDIT -> USER).

Done when: you can record a two-bar loop with count-in, quantise it with swing, overdub hats with note
repeat, erase a stray hit while looping, undo, set up a tempo change, and chain Next Seq live.

### Phase 3: The chop shop (sampling and sound editing)

Make it worthy of the name.

- [x] SAMPLE mode: input selection (mic/line via `getUserMedia`, plus `RESAMPLE` = master bus), MONO L /
      MONO R / STEREO, monitor, threshold with meter marker, pre-record, time, RESET PEAK, RECORD ->
      waiting -> recording -> KEEP or RETRY window with name and assign-to-note; Sound memory window.
- [x] `LcdWaveform`: full-width overview, region shading, zoom windows with sample-accurate St/End markers.
- [x] TRIM page: St/End with wheel, numeric entry, SHIFT+slider, SHIFT+cursor coarse; Start fine / End
      fine windows with ZOOM-/ZOOM+ and Smpl Lngth VARI/FIX; PLAY X modes.
- [x] LOOP page: To/Lngth/End toggle, Loop ON/OFF, fine windows, Fit to length.
- [x] ZONE page: Number of Zones window, per-zone St/End fine windows that move neighbours, and
      **SLICE SOUND** with End margin and Create new program (the headline feature).
- [x] EDIT window ops: DISCARD, LOOP FROM ST TO END, SECTION -> NEW SOUND, INSERT SOUND, DELETE /
      SILENCE / REVERSE SECTION, TIME STRETCH (ratio, presets x A/B/C, adjust, BPM Match window).
- [x] PARAMS page: Level, Tune, Beat Loop with computed sample tempo and new tempo.
- [x] Sound window: rename, delete (and ALL), copy, Convert (stereo->mono L/R, mono->stereo, resample).

Done when: sample a phrase from the mic or a loaded record, trim it, split it into 8 zones, nudge a zone
boundary in the fine window, slice to a new program, play the chops from the pads and sequence them.

### Phase 4: Sequencer depth, song mode, disk

Make it a DAW.

- [x] STEP EDIT: event list with View filters, TC pop-up, COPY / DELETE / INSERT / PASTE, multi-select +
      Edit Multiple, Insert Event window for every event type, step recording, Step Edit Options.
- [x] EDIT screen: EVENTS (COPY with REPLACE/MERGE and Copies, DURATION, VELOCITY, TRANSPOSE), BARS copy,
      TrMOVE.
- [x] MISC: Auto punch, playback TRANS with FIX, 2ndSEQ.
- [x] SONG mode: 20 songs, step list, reps, loop window, tempo window, Song window (rename/delete/all/
      copy), CONVRT to sequence with the three track-status modes, transport in song context.
- [x] DISK: IndexedDB device with folders; LOAD page with View filter, Directory window (delete, delete
      ALL by type, rename, new folder); SAVE page with the five save types; file types: project bundle
      (`.ALL` equivalent), program + sounds (`.PGM`/`.APS` equivalents), sound as WAV, sequence as standard
      MIDI file type 0/1; import of the same plus WAV/MIDI from the OS; export to the OS as a download or
      straight into a chosen folder via the File System Access API.
- [x] Bounce sequence/song to WAV (a new `Type:` on the SAVE page).
- [x] Autosave the whole machine on every change, with a "power-on" restore.

Done when: build a song from four sequences, step-edit a fill, save the project, reload the browser,
load it back, export a MIDI file and a mixdown.

### Phase 5: MIDI, effects, and the last screens

Make it play with other gear.

- [x] Web MIDI: input to pads and to MIDI tracks (Receive channel, filters, Sustain-to-duration, Prog
      change->seq), MIDI tracks out to chosen port + channel (`1A`-`16B` as two virtual outs mapped to
      real ports), Device names, Soft thru, input/output monitors, PANIC, footswitch CC functions, MIDI
      program change into DRUM slots, CC7 volume.
- [x] SYNC: MIDI clock out and in (tempo follow, start/stop). MTC and MMC are not built.
- [x] Effects: two multi-FX chains and two reverbs on Web Audio (`WaveShaperNode` distortion + ring mod,
      4-band `BiquadFilterNode` EQ, chorus/flange/phaser/rotary/autopan/pitch via delay-line modulation,
      echo types, algorithmic or convolution reverb with the seven types), FXsend mixer page, FXedit
      pages and module windows, Effect Mixer routing, Copy Effect Settings. Record mix changes as MIXER
      events and play them back.
- [x] OTHER: tap averaging, INIT, VER. LCD contrast on SHIFT+DATA. Help screens (keyboard map, credits)
      under OTHER, written as LCD text.
- [ ] Stretch: read native `.SND`/`.PGM`/`.SEQ`/`.ALL` files so real 2000XL disks load. Formats are
      publicly documented; this is the biggest authenticity win available.

### Phase 6: Feel and finish

Make it something people keep open.

- [ ] Latency and performance pass: `latencyHint: 'interactive'`, voice stealing under load, waveform
      rendering off the main thread, no allocation in the scheduler hot path.
- [ ] Touch: multi-touch pads, pressure, no 300 ms delay, landscape phone/tablet scaling of the fixed
      chassis.
- [ ] Accessibility: every control already has labels; add focus order that follows the panel and screen-
      reader text for the LCD frame.
- [x] PWA: installable, offline, file-handler registration for `.wav` and project files.
- [ ] Content: two or three more starter kits and breaks (the demo project that loads on first visit is done).
- [x] Docs outside the machine (Barlow prose, per the design system): a one-page manual and a keyboard card.

### Phases 7 to 10: the platform

Planned in full in [docs/PLATFORM-PLAN.md](docs/PLATFORM-PLAN.md). The machine stays at 2000XL
parity; everything the original could not do is a Chop Deck page, and the two meet only at the
header link above the LCD. In one line each:

- **Phase 7: Accounts and cloud saves.** Magic-link and OAuth sign-in on `/account/`, content-addressed
  sound blobs on R2, transparent sync of the existing autosave with kept revisions, `SIGN IN` becoming
  the handle and sync state in the header.
- **Phase 8: Libraries.** Done. `/kits/` (browse, audition in the page, publish from `/kits/publish/`,
  "Send to machine" through the import tray) and `/samples/` (records, breaks and hits to chop, with
  waveforms, publish from a machine sound or a file), both with licences, featured and takedown flags.
  Still to come: report links on items.
- **Phase 9: Publish and remix.** Done. `/publish/` reads the machine's autosave, renders the preview
  with the machine's engine and draws the share card in the browser; `/beats/` feed with sorts and
  tags; `/beats/<handle>/<slug>` pages with share tags filled in at the edge, a player, likes, plays,
  OPEN ON THE MACHINE (the visitor's project is saved to the browser disk first), REMIX with lineage,
  download where the licence allows; `/beats/<handle>/` per person.
- **Phase 10: Support and venues.** `/support/` with Buy Me a Coffee (done), the open-source
  release (done: MIT licence, CONTRIBUTING, standalone builds that hide the site's links), the
  desktop app (done: Tauri around the same `dist/`, installers for Windows, macOS and Linux from a
  tag, see `docs/DESKTOP.md`). Parked until the product has found its feet: Stripe supporter tier,
  itch.io, Steam. Still to do: a touch layout for phones, code signing for the desktop builds.

---

### Phase 11: EZ mode

A second front panel over the same machine for casual visitors, toggled OG · EZ in the header:
plain words, big pads, a step grid, a chop flow, faders, and the touch layout for phones. It owns no
state and no engine; every operation is a kernel method the OG screens can use too. Planned in
[docs/EZ-MODE.md](docs/EZ-MODE.md) in five steps: play, sequence, chop, mix and share, touch.

- [x] EZ 1: the OG · EZ switch, pads with names, kit picker, transport with tempo and swing,
      patterns 1 to 8, save and load, the site's links; phones start on EZ.
- [ ] EZ 2: the step grid, recording from the pads, undo, pattern length.
- [ ] EZ 3: chop a file or a sample onto the pads.
- [ ] EZ 4: faders and pans, export, publish from EZ.
- [ ] EZ 5: the touch pass.

## 6. Decisions to make now

Recommendations first; each is cheap to change now and expensive later.

1. **TypeScript from day one.** The data model is large and the kernel is generic. Types pay for themselves
   in the first week.
2. **48 x 8 LCD grid** (section 3.2). Alternative is the faithful 41 x 6, which would force us to redesign
   every screen that needs a waveform or a 16-step strip.
3. **Native Web Audio nodes per voice, not a custom DSP worklet.** 32 voices of buffer + biquad + gain +
   panner is trivial for the browser and keeps the code readable. A worklet is only justified if we later
   want bit-accurate 12-bit or 16-bit emulation; leave a seam for it.
4. **Own WSOLA for time stretch** rather than a library. Small, dependency-free, and the original was lo-fi
   anyway; the presets become a nice authentic knob.
5. **IndexedDB as the primary disk**, File System Access as an optional real folder. Everything exportable
   as ordinary files so nothing is trapped in the browser.
6. **Web MIDI is Chromium-only.** The MIDI screen says `NO MIDI PORTS` elsewhere; the rest of the machine
   does not depend on it.
7. **Keep the hardware caps** (99/64/24/256/20) because the screens assume two-digit fields. Raise the
   sample memory silently.
8. **Vocabulary:** LCD text follows the manual (`Sq:`, `Now:`, `Tsig:`, `Timing:`, `DO IT`), which is
   generic firmware English. Product name, wordmark and prose stay Chop Deck, never the trademark.

---

## 7. Risks

- **Scope.** Full parity is a multi-month build for one person plus an agent. The phase gates exist so any
  stopping point is a usable instrument; Phases 0-3 alone are a complete sampler-sequencer.
- **Browser audio input** needs HTTPS and a permission prompt; the SAMPLE screen must handle "no input"
  gracefully (LCD text, not a browser error).
- **F-keys in browsers.** F1 and F5 are commonly intercepted. The `Alt+1..6` fallback covers it, and the
  on-screen soft keys are always clickable.
- **Autoplay policy.** The audio context unlocks on first pointer or key event; the LCD shows
  `HIT ANY KEY TO POWER ON` until then, which fits the fiction.
- **Fixed 1240 px chassis on phones.** It scales down; below roughly 700 px wide the pads become too small
  to play. Landscape is the supported phone orientation, and that is a documented limitation.

---

## 8. First steps (this week)

1. `git init` at the repo root and commit the design system as-is.
2. Scaffold Vite + React + TypeScript; move the app under `src/`, port the components to `src/ds/`.
3. Build `LcdScreen` and render the MAIN screen from the manual as the first golden test.
4. Build the kernel's cursor + wheel + numeric entry against MAIN's fields.
5. Correct the panel (section 4).
6. Stand up the audio engine with one voice and one pad, then scale to 32 voices and PROGRAM mode.

References: `docs/mpc2000xl-feature-inventory.md` (the spec, screen by screen),
`design-system/readme.md` (visual and copy rules), the original machine's owner's manual (not in the repository)
(source of truth when the inventory is ambiguous).
