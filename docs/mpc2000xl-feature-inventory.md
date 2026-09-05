# Reference: 2000XL feature inventory (derived from the Owner's Manual, OS 1.00)

This is the behavioural spec Chop Deck targets. It was extracted from `design-system/MPC-2000XL_owners_manual.pdf`.
Field labels, soft-key names and window text are quoted verbatim because Chop Deck's LCD imitates that vocabulary.
Internal reference only. Product copy never uses the third-party trademark.

## SPEC NUMBERS

| Item | Value (as stated in manual) |
|---|---|
| Display | 248 x 60 dot graphic LCD, 6 soft keys F1-F6 on bottom line |
| Sequences | 99 |
| Tracks per sequence | 64 |
| Sequencer resolution | 96 ppq (ticks per 1/4 note); position shown as `bar.beat.tick` e.g. `001.01.00` |
| Sequencer memory | about 300,000 notes total; max 50,000 note events per sequence |
| Songs | 20; 250 steps per song; each step = sequence + `Reps` count |
| Tempo | decimal display `120.0`; numeric entry ignores decimal point (`1205` -> 120.5) |
| Timing correct values | OFF, 1/8 (48 tk), 1/8(3) (32 tk), 1/16 (24 tk), 1/16(3) (16 tk), 1/32 (12 tk), 1/32(3) (8 tk) |
| Swing % | shown only for 1/8 and 1/16; default 50 |
| Shift-timing amount | max = half of TC value (e.g. 12 for 1/16) |
| Sounds (samples) in memory | 256 |
| Programs | 24; 64 note assignments per program (notes 35-98) |
| Programs playable at once | 4 (`DRUM 1`-`DRUM 4`) |
| Sounds per note | 1 main + 2 additional (`SIMULT` / `VEL SW` / `DCY SW`) = 3 |
| Polyphony | 32 voices |
| Sample format | 16-bit linear, 44.1 kHz, mono or stereo |
| Sample memory | 2 MB std (21.9 s mono / 10.9 s stereo), max 32 MB (378.6 s mono / 189.2 s stereo) |
| Filter | 12 dB/oct dynamic resonant low-pass per voice |
| Drum pads | 16, velocity + pressure sensitive; 4 banks A-D = 64 pad slots (A01-D16) |
| Default pad -> note map | Bank A pads 1-16 = 35-50; B = 51-66; C = 67-82; D = 83-98 |
| MIDI | 2 IN (merged), 2 OUT (A, B) = 32 output channels (`1A`-`16B`) |
| Sync | MIDI Clock, MTC, MMC; frame rates 24, 25, 29.97 drop, 30 |
| Locate memories | 9 (`1:`-`9:`) |
| Zones (chop) | 1-16 equal zones per sound |
| Time-stretch ratio | 50 %-200 %; 18 presets x quality A/B/C |
| Note Variation slider ranges | TUNING -120..+120, ATTACK 0..100, DECAY 0..100, FILTER -50..+50 (attack/decay map to 0-5000 ms) |
| Transpose (MISC) | +/-12 semitones, MIDI tracks only |
| Names | Up to 16 characters; name entry via pads / DATA wheel |
| Effects (opt. EB16) | 2 multi-FX (DIST, FILT, MOD, ECHO, REV, MIX) + 2 reverbs (R1, R2) |
| Mix-change sysex | `F0 47 00 44 45 <type> <pad> <value> F7`; type 01 STEREO LEVEL, 02 STEREO PAN, 03 FXsend LEVEL, 05 INDIV LEVEL |

---

## 0. Global UI conventions (apply to every mode)

**Front-panel keys (full list):** F1-F6, numeric keypad 0-9 doubling as mode keys with SHIFT, ENTER, SHIFT, MAIN SCREEN, OPEN WINDOW, DATA wheel, CURSOR up/down/left/right, NOTE VARIATION slider, AFTER (SHIFT = ASSIGN), TAP TEMPO / NOTE REPEAT, UNDO SEQ, ERASE, STEP < / >, BAR << / >>, GO TO, REC, OVER DUB, STOP, PLAY, PLAY START, FULL LEVEL, 16 LEVELS, NEXT SEQ, TRACK MUTE, PAD BANK A/B/C/D, 16 pads, REC GAIN knob, MAIN VOLUME knob.

**SHIFT + numeric key = mode:**
`1` SONG, `2` MISC., `3` LOAD (Disk), `4` SAMPLE, `5` TRIM, `6` PROGRAM, `7` MIXER, `8` OTHER, `9` MIDI/SYNC, `0` SAVE (Disk save page).

**Other SHIFT combos:** SHIFT + DATA wheel = LCD contrast (any time). SHIFT + AFTER = ASSIGN screen. SHIFT + CURSOR left/right = coarse increments for large numeric fields (sample points). SHIFT + NOTE VARIATION slider = set St/End/To/Lngth in TRIM/LOOP. SHIFT + pad in mixer = multi-select channels. SHIFT + CURSOR up/down in Step Edit = multi-select events. NOTE REPEAT held, then SHIFT = lock note repeat. SHIFT pressed before ENTER cancels numeric entry.

**Cursor / fields:** Cursor shown inverted. Lands only on data fields (right of `:`). CURSOR keys move between fields.

**DATA wheel:** +/-1 per click, accelerates with speed. On enum fields cycles options.

**Numeric entry:** type digits then ENTER; decimals typed without the point; moving cursor / DATA wheel / MAIN SCREEN before ENTER cancels; SHIFT before ENTER cancels.

**Soft-key rendering:** framed = executable action; reversed = jumps to that page; plain text = current page.

**OPEN WINDOW:** opens a context window for the current field; pressing again (or `CLOSE`) closes it.

**Name window** (common to all name fields; opened by turning DATA wheel or hitting a pad while on a name field):
```
             Name
New name:Sequence01
Press PADs or use DATA knob.
COPY   PASTE        CANCEL ENTER
```
- DATA wheel changes the character under the cursor; CURSOR left/right moves.
- Pads type letters printed on them: PAD1 `AB`, PAD2 `CD`, PAD3 `EF`, PAD4 `GH`, PAD5 `IJ`, PAD6 `KL`, PAD7 `MN`, PAD8 `OP`, PAD9 `QR`, PAD10 `ST`, PAD11 `UV`, PAD12 `WX`, PAD13 `YZ`, PAD14 `&#`, PAD15/16 digits/symbols. Repeated press cycles the pair.
- 16 LEVELS key = space. FULL LEVEL = toggle upper/lower case. `COPY` [F2] copies name to clipboard, `PASTE` [F3] pastes, `ENTER` [F5] confirms, `CANCEL` [F4]. Leaving without ENTER discards.

**Confirm windows:** nearly all destructive actions use a window with `CANCEL`/`CLOSE` [F4] and `DO IT` [F5] (some `DO IT` [F6]).

**Track type / "S:" field states:** `S:` = single-track record, `M:` = multi-track record; type = `MIDI`, `DRUM1`..`DRUM4`.

---

## 1. MAIN SCREEN

```
Sq:01-(Sequence01)              Now:001.01.00
TM:120.0(MAS) Timing:1/16   Tsig: 4/ 4
Count:OFF  Loop:OFF  Bars:  0
Tr:01-(Unused)   ON:YES   Pgm:OFF
S:DRUM1:OFF  New Pgm-A          Velo%:100
STEP  EDIT  TrMUTE SOLO  Tr -  Tr +
```
(The tempo field is drawn with a quarter-note glyph.)

### Fields
| Field | Values | Notes |
|---|---|---|
| `Sq:` | 01-99 + name; `(Unused)` when empty | While playing, turning the wheel sets **Next Sq** instead (footer shows `Next Sq: 2`). |
| `Now:` | `bar.beat.tick` or `HHhMMmSSsFFf` | Editable by wheel = locate. Prefix indicators: `2nd` (second sequence active), `#b` (track transposed), lowercase `c` before tempo (tempo-change active). |
| Tempo | e.g. `120.0`; numeric entry `1205` | Followed by source `(SEQ)` / `(MAS)`. |
| Tempo source | `SEQ` (per-sequence, saved), `MAS` (master, global) | |
| `Timing:` | OFF, 1/8, 1/8(3), 1/16, 1/16(3), 1/32, 1/32(3) | Quantise on real-time record (notes only), step size for STEP </>, note-repeat rate, step-edit auto-increment. |
| `Tsig:` | e.g. ` 4/ 4` | Turning wheel or OPEN WINDOW opens Change Tsig. |
| `Count:` | ON / OFF | Count-in. |
| `Loop:` | ON / OFF | |
| `Bars:` | number | Turning wheel opens Change Bars window. |
| `Tr:` | 01-64 + name; `(Unused)` | |
| `ON:` | YES / NO | Track on/off (mute). |
| `Pgm:` | OFF, 1-128 | MIDI program change sent for the track when sequence selected. |
| `S:`/`M:` | S = single-track rec, M = multi-track rec | |
| Track type | `MIDI`, `DRUM1`-`DRUM4` | |
| MIDI channel | `OFF`, `1A`-`16A`, `1B`-`16B` + device name | For drum tracks: OFF = no MIDI out. |
| program name | display only for DRUM tracks | |
| `Velo%:` | percentage (100 = unity) | Playback-only scaling. |

### Soft keys
- `STEP` [F1] -> Step Edit screen. `EDIT` [F2] -> Sequence Edit screen. `TrMUTE` [F3] toggles `ON:` YES/NO. `SOLO` [F4] solo current track (label blinks while active). `Tr -` [F5] / `Tr +` [F6] select previous/next track.

### Windows (OPEN WINDOW on each field)

**Sq: -> "Sequence" window**
- `Sequence name:` (name window), `Default name:` (auto-name for new sequences).
- Soft keys: `DELETE` [F2], `CLOSE` [F4], `COPY` [F5].
- **Delete Sequence**: "Pressing DO IT will erase this sequence!!"; `ALL SQ` [F3] -> **Delete ALL Sequences**; `CANCEL` [F4], `DO IT` [F5].
- **Copy Sequence**: top `Sq:` source, bottom `Sq:` destination; `PARAMS` [F3] copies only parameters; `CANCEL` [F4]; `DO IT` [F5].

**Now: -> "Time Display" window**
- `Display style:` BAR,BEAT,CLOCK / HOUR,MINUTE,SEC
- `Start time:` `00h00m00s00f00` (also MTC/SMPTE start offset)
- `Frame rate:` 24 / 25 / 29.97 drop / 30
- `CLOSE` [F4]

**Tempo -> "Tempo Change" window**
```
Tempo change:ON     Initial :120.0
 1 :001.01.00  %:100.0  =120.0
 2 :016.01.00  %:100.0  =120.0
DELETE  NOW   CLOSE  INSERT
```
- `Tempo change:` ON/OFF. `Initial:` base tempo. Event list: `bar.beat.tick`, `%:` ratio of initial, absolute tempo (linked). Event 1 cannot be deleted. `INSERT` [F5], `NOW` [F3] sets event time to Now, `DELETE` [F2]. Events cannot pass their neighbours.

**Timing: -> "Timing Correct" window**
```
Note value:1/16        Swing%: 50
Shift timing:EARLIER   amount:  0
Time:001.01.00-001.01.00
Notes:ALL (HIT pad)
CLOSE  DO IT
```
- `Note value:`, `Swing%:` (only 1/8 and 1/16; shifts even-numbered subdivisions), `Shift timing:` EARLIER/LATER, `amount:` ticks (max half TC value), `Time:` range, `Notes:` (MIDI track: `0(C.)-127(G.8)`; drum track: pad hit / ALL). `DO IT` [F5] applies destructive quantise to the current track only. CC / pitch bend never time-corrected.

**Tsig: -> "Change Tsig" window**
- `Bar: 1 - 1` (range), `New Tsig: 4/ 4`. "Pressing DO IT will truncate or add space in each bar." `CANCEL` [F4], `DO IT` [F5].

**Count: -> "Count/Metronome" window**
- `Count IN:` OFF / REC+PLAY / REC ONLY
- `In play:` YES/NO, `In rec:` YES/NO
- `Rate:` 1/4, 1/8 ... (note value of click)
- `Wait for key:` ON/OFF (record starts on first input; first note not recorded)
- `CLOSE` [F4], `SOUND` [F5] -> **Metronome Sound** window:
  - `Sound:` CLICK / DRUM1 / DRUM2 / DRUM3 / DRUM4
  - if CLICK: `Volume:` (0-100), `Output:` STEREO / OUT 1-8
  - if DRUMn: `Accent:` note/pad with `Velocity:` (127), `Normal:` note/pad with `Velocity:` (64)

**Loop: -> "Loop" window**
- `First bar:`, `Last bar:` (number or `END`), `Number of bars:` (linked). `CLOSE` [F4].
- Playback loops region; recording loops and REC auto-switches to OVERDUB after first pass.

**Bars: -> "Change Bars" window**
- `Current= 2 > New bars: 5`; "Pressing DO IT will add blank bars after last bar." / "...truncate bars after last bar."; `IN/DEL` [F3], `CANCEL` [F4], `DO IT` [F5].
- `IN/DEL` -> window: `After bar:`, `Number of bar:` + `INSERT` [F2]; `First bar:`, `Last bar:` + `DELETE` [F5]; `CLOSE` [F4].

**Tr: -> "Track" window**
- `Track name:`, `Default:`. `DELETE` [F2], `CLOSE` [F4], `COPY` [F5].
- **Delete track**: "Pressing DO IT will erase this track !!"; `ALL Tr` [F3] -> **Delete ALL Tracks**; `CANCEL` [F4]; `DO IT` [F5].
- **Copy Track**: upper `Tr:` source, lower `Tr:` destination; `CANCEL`/`DO IT`.

**ON: -> "Erase all OFF tracks" window** with `CLOSE` [F4], `DO IT` [F5].

**Pgm: -> "Program change" window** with `Transmit program changes in this track: YES/NO`.

**Track type field -> "MIDI Input" window**
- `Receive channel:` ALL / 1-16
- `Prog change>seq:` ON/OFF
- `Sustain pedal to Duration:` ON/OFF
- `MIDI filter:` ON/OFF; `Type:` NOTES / PITCH BEND / PROG CHANGE / CH PRESSURE / POLY PRESS / EXCLUSIVE / CONTROL:ALL / CONTROL:#000-#127; `Pass?:` YES/NO
- `MONITR` [F2] -> **MIDI Input Monitor**, `CLOSE` [F4].

**MIDI channel field -> "MIDI Output" window**
- `Soft thru:` OFF / AS TRACK / OMNI-A / OMNI-B / OMNI-AB
- `Device name:` per output channel 01A-16B
- `MONITR` [F2] -> **MIDI Output Monitor**, `CLOSE` [F4], `PANIC` [F6].

**S:/M: field (when M) -> "Multi Recording Setup" window**: table `In` -> `Track` -> `Out`. `CLOSE`.

**Velo%: -> "Edit Velocity" window**
- `Edit type:` ADD VALUE / SUB VALUE / MULT VAL% / SET TO VAL; `Value:`; `Time:` range; `Notes:`. `CLOSE` [F4], `DO IT` [F5].

### Track mute / solo via pads (TRACK MUTE key)
```
Sq:01-Sequence01                Now:001.01.00
Tr:    (Unused) (Unused) (Unused) (Unused)
01-16  ...
BANK A ...
Press pads to Track ON/OFF            SOLO
```
- Bank A = tracks 1-16, B = 17-32, C = 33-48, D = 49-64. Pad toggles track ON/OFF (framed name = ON). `SOLO` [F6] held + pad = solo; press SOLO again to cancel. TRACK MUTE again returns to Main.

### NEXT SEQ key
```
Sq:01-Sequence01                Now:001.01.00
TM:120.0(MAS) Timing:1/16
Next Sq:02-Sequence02
                     SUDDEN CLEAR  PAD
```
- `Next Sq:` plays after current finishes. `SUDDEN` [F4] switches immediately. `CLEAR` [F5] empties. `PAD` [F6] -> pad page: sequences 1-64 mapped to pads A1-D16; `SUDDEN` [F4], `CLEAR` [F5], `CLOSE` [F6].

### Second sequence (SHIFT+MISC -> `2ndSEQ` [F3])
- `SQ:01-Sequence01` "This sequence will play simultaneously with the active sequence or song." `TurnON` [F6] -> Main shows `2nd` by Now:. `OFF` [F6] cancels.

### Sequence user defaults (EDIT -> `USER` [F5])
- Editable: tempo + source, `Tsig:`, `Loop:`, `Bars:`, `Pgm:`, track type/MIDI channel, `Velo%:`. Used when a new sequence is created.

---

## 2. Transport, recording, locate, erase, pad performance features

**Transport keys**
- `PLAY START`: play from bar 1. `PLAY`: play from `Now:`. `STOP`.
- `REC` + PLAY / PLAY START: record (replaces existing events on current track). Works from stop or during playback (punch-in).
- `OVER DUB` + PLAY / PLAY START: overdub (adds); pressing OVERDUB during playback enters overdub.
- Recording past `Bars:` with Loop OFF auto-appends bars; with Loop ON wraps and REC->OVERDUB.
- Count-in per Count/Metronome settings.
- In SONG mode REC/OVERDUB are inactive.

**Locate**
- `BAR <<` / `BAR >>`: +/-1 bar. GO TO + BAR << = start, GO TO + BAR >> = end.
- `STEP <` / `STEP >`: +/- one Timing value (or 1 tick if OFF). GO TO + STEP </> = previous/next event on current track.
- `GO TO` key -> **Locate** window:
```
Go to:001.01.00
7:001.01.00 8:001.01.00 9:001.01.00
4:001.01.00 5:001.01.00 6:001.01.00
1:001.01.00 2:001.01.00 3:001.01.00
STORE        CLOSE  GO TO
```
  `GO TO` [F5] jumps. Cursor to memory 1-9 + `STORE` [F2] stores Now.

**UNDO SEQ**: LED lights after a record/edit; press = revert; press again = redo. Only valid immediately after a sequence record/edit.

**ERASE key**
- During overdub playback: hold ERASE + pad erases that note while held.
- While stopped: **ERASE** window:
```
Track: 1-Track-01 (0=all)
Time:001.01.00-001.01.00
Erase:ALL EVENTS
Notes:ALL (Hit pad)
CANCEL  DO IT
```
  `Erase:` ALL EVENTS / ALL EXCEPT <type> / ONLY ERASE <type>. `DO IT` [F5].

**TAP TEMPO / NOTE REPEAT key**
- Tap in quarter notes sets tempo, averaged over `Tap averaging:` taps (OTHER mode, default 3).
- Hold + pad during play/rec = note repeat at Timing rate; pad pressure sets velocity. Hold NOTE REPEAT then SHIFT = lock.

**FULL LEVEL**: LED on -> all pad hits at velocity 127.

**16 LEVELS** -> "Assign 16 levels" window:
```
Note :47/A10-NR_TOM_M
Param:NOTE VAR
Type:TUNING   Original key pad:4
CANCEL  TurnON
```
- `Param:` VELOCITY (pad 1 softest -> 16 loudest) or NOTE VAR. `Type:` TUNING (semitone steps; `Original key pad:` 1-16) / DECAY / ATTACK / FILTER. `TurnON` [F5].

**NOTE VARIATION slider / ASSIGN (SHIFT+AFTER)**
```
Assign note:38/A06-NORI_SN_0
Parameter:DECAY   High range: 50
                  Low range: 16
Assign NV slider to ctrl change:OFF
```
- `Parameter:` TUNING / DECAY / ATTACK / FILTER. `Low range:` / `High range:`. Slider value recorded with drum notes (`Tun:` in step edit).
- **AFTER key**: LED on -> slider affects the assigned note during playback and movement can be recorded in overdub.

**Pad banks A-D**: 16 pads x 4 banks; LED shows current bank.

**Auto Punch (SHIFT+MISC -> `PUNCH` [F1])**
- `Auto punch:` PUNCH IN ONLY / PUNCH OUT ONLY / PUNCH IN OUT; `IN Time:`, `OUT Time:`. `TurnON` [F6].

**MISC. screen soft keys:** `PUNCH` [F1], `TRANS` [F2], `2ndSEQ` [F3], `TurnON`/`OFF`/`FIX` [F6].

---

## 3. STEP EDIT (Main -> `STEP` [F1])

```
View:ALL EVENTS              Now:001.01.00
>N: 38/A06  Tun:  0  D:   1  V: 37 ###
>N: 46/A07  Tun:  0  D:   2  V: 26 ##
TC   COPY  DELETE INSERT PASTE PLAY
```
- `View:` ALL EVENTS / NOTES (+ range) / PITCH BEND / CTRL: (+ CC or ALL) / PROG CHANGE / CH PRESSURE / POLY PRESS / EXCLUSIVE.
- Event rows: Drum track: `N:` note/pad, `Tun:` note-variation, `D:` duration (ticks), `V:` velocity + bar graph. MIDI track: `N:` note/name, `D:`, `V:`. Other rows: Bend, Control Change, Program Change, Channel Pressure, Poly Pressure, `Exclusive:F0 ... F7`, MIXER events.
- Soft keys: `TC` [F1] (hold + wheel = timing-correct pop-up), `COPY` [F2], `DELETE` [F3], `INSERT` [F4], `PASTE` [F5], `PLAY` [F6].
- **Multi-select**: SHIFT + CURSOR up/down; footer `TC COPY DELETE EDIT PLAY`; `EDIT` [F4] -> **Edit Multiple**: `Change note to:` or `Edit type:` ADD/SUB/MULT/SET + `Value:`.
- **Paste Event** window: `DO IT` [F5]; time-range clipboard: `RPLACE` [F4] / `MERGE` [F5].
- **Insert Event** window: `Type:` NOTE / PITCH BEND / CONTROL CHANGE / PROGRAM CHANGE / CH PRESSURE / POLY PRESSURE / EXCLUSIVE / MIXER.
- **Step recording**: hit pad at Now -> note inserted with played velocity/duration.
- **Step Edit Options** window: `Auto step increment:` YES/NO; `Duration of recorded notes:` AS PLAYED / TC VALUE (+ `%`).

---

## 4. Sequence EDIT screen (Main -> `EDIT` [F2]) and MISC

Footer on all EDIT pages: `EVENTS BARS TrMOVE USER DO IT`.

### EVENTS page, `Edit:` selector
**COPY**
```
Edit:COPY               From sq:80 Tr: 1
Time:                   To sq:80  Tr: 1
 001.01.00-001.01.00    Mode:REPLACE
Notes:ALL               Start:001.01.00
                        Copies: 1
```
**DURATION**: `Mode:` ADD VALUE / SUB VALUE / MULT VAL% / SET TO VAL, `Value:`, `Time:`, `Notes:`.
**VELOCITY**: same fields.
**TRANSPOSE**: `Amount:` semitones "(Except drum track)", `Time:`, `Notes:`.

### BARS page (copy by bar, all tracks)
```
From Sq:80          COPY   To Sq:80
First bar: 1               After bar: 0
 Last bar: 1               Copies: 1
```
Inserts (pushes existing data back). `DO IT`.

### TrMOVE page
Select track with wheel, `SELECT` [F6]; scroll target, `INSERT` [F6] or `CANCEL` [F5].

### USER page: user defaults (see section 1).

### MISC -> TRANS [F2] (playback transpose)
```
Tr:01-(Unused) <Tr:00=ALL>
Transpose amount: 0 <except drum tr>
Pressing FIX will change the note data permanently!!  Bar:001 - 001
PUNCH TRANS 2ndSEQ FIX
```
Non-destructive (Main shows `#b`); `FIX` [F6] makes it permanent.

---

## 5. SONG mode (SHIFT+1)

```
Song:01-Song01                  Now:001.01.00
TEMPO:MAS    Step  Sequence      Reps
  :120.0      1   01-Sequence01   1
LOOP:OFF      2   02-Sequence02   1
             (end of song)
              CONVRT DELETE INSERT
```
- `Song:` 01-20. Selecting a sequence on `(end of song)` appends a step.
- `TEMPO:` SEQ / MAS; OPEN WINDOW -> `Ignore tempo change events in sequence: ON/OFF`.
- `LOOP:` ON/OFF; OPEN WINDOW -> `First step:`, `Last step:`, `Number of steps:`.
- `Reps` (0 = stop). `DELETE` [F5], `INSERT` [F6].
- **Song window**: `Song name:`, `Default name:`; `DELETE` (-> `ALL SG`), `COPY`, `CLOSE`.
- `CONVRT` [F4] -> **Convert Song to Seq**: `From song:`, `To sequence:`, `Track status:` REFERENCED TO 1ST SQ / OFF TRACKS IGNORED / MERGED ON MIDI CH.
- Transport: PLAY START, PLAY, BAR/STEP/GO TO locate; no REC.

---

## 6. SAMPLE mode (SHIFT+4)

```
Input:ANALOG  Mode:STEREO  Monitor:L/R
Threshold:-20  Time: 10.0s  Pre-rec:100ms
 LEFT :######      LEVEL METER
 RIGHT:#####
RESET PEAK                       RECORD
```
- `Input:` ANALOG / DIGITAL. `Mode:` MONO L / MONO R / STEREO. `Monitor:` OFF / L/R.
- `Threshold:` OFF or dB; marker on meter. `Time:` seconds, 0.1 s steps. `Pre-rec:` 0-100 ms.
- Meter: level, threshold marker, peak-hold; `RESET PEAK` [F1].
- `RECORD` [F6] -> "Waiting for input signal..." `CANCEL` [F5] `START` [F6]. Recording: "Recording..." `CANCEL` [F5] `STOP` [F6].
- **KEEP or RETRY** window: `Name for new sound:` (default `soundN`), `Assign to note:`; `RETRY` [F2], `PLAY` [F4], `KEEP` [F5].
- OPEN WINDOW -> **Sound memory**: `Free memory(time):`, `N Megabytes installed`.

---

## 7. TRIM mode (SHIFT+5): TRIM / LOOP / ZONE / PARAMS / EDIT

Footer: `TRIM LOOP ZONE PARAMS EDIT PLAY X`. Waveform full-width, selected region highlighted. Pressing the current page key again toggles sound list order: Memory / Size / Name.

**Common fields:** `Snd:` (`(ST)` suffix for stereo); `PLAY X:` ALL / ZONE / BEFOR ST / BEFORE TO / AFTR END; `View:` LEFT/RIGHT for stereo.

### TRIM page
`St:`, `End:` (wheel, numeric+ENTER, SHIFT+slider, SHIFT+cursor coarse).
- OPEN WINDOW on St -> **Start fine**: `Start:`, `Lngth=`, `Smpl Lngth:` VARI / FIX, `PLAY X:`; `ZOOM-` [F2], `ZOOM+` [F3], `CLOSE` [F4], `PLAY X` [F6].
- OPEN WINDOW on End -> **End fine**: same.

### LOOP page
`To:`, `Lngth:`/`End:` (toggle), `Loop:` ON/OFF.
- `EDIT` [F5] -> **Fit to length** `DO IT`.
- OPEN WINDOW -> **Loop To fine** / **Loop End fine** with `Loop Lngth:` VARI/FIX and zoom.

### ZONE page (chopping)
`St:`, `End:` of current zone, `Zone:` 1-N.
- OPEN WINDOW on Zone -> **Number of Zones**: 1-16; "Pressing DO IT will reset St/End values." (equal division).
- OPEN WINDOW on St -> **Zone start fine** (moves previous zone's end). On End -> **Zone end fine** (moves next zone's start).

### EDIT window (`Edit:` selects op; `CANCEL` [F4] `DO IT` [F5])
| `Edit:` | Fields / behaviour |
|---|---|
| `DISCARD` | Delete audio before St and after End. |
| `LOOP FROM ST TO END` | Set loop = St..End. |
| `SECTION -> NEW SOUND` | `New name:`; copies range to new sound. |
| `INSERT SOUND -> SECTION START` | `Insert snd:`. |
| `DELETE SECTION` | Removes range, closes gap. |
| `SILENCE SECTION` | Zeroes range. |
| `REVERSE SECTION` | Reverses range. |
| `TIME STRETCH` | `New name:`, `Ratio:` 50.00-200.00 %, `Preset:` 18 presets (FEM VOX ... SLOW ORCH.) x `A`/`B`/`C`, `Adjust:`; `BPM` [F2] -> **BPM Match**: `Beat:`, `Source tempo:`, `New tempo:`. |
| `SLICE SOUND` (ZONE page) | `End margin:` samples appended to each slice; `Create new program:` YES/NO; sounds named `<orig>N`, slices assigned to 16 pads. |

### PARAMS page
```
Snd:loop_1                 PLAY X:ALL
Level:100   BEAT      Beat: 4
            LOOP      Sample tempo=120.0
Tune:  0    FUNCTION  New tempo=120.0
```
`Level:` 0-100, `Tune:` +/-, Beat Loop: `Beat:` -> `Sample tempo=`; `New tempo=` after Tune.

### Sound window (OPEN WINDOW on Snd:)
`Sound name:`, `Type:` MONO/STEREO, `Rate:`, `Size:`. `DELETE` [F2] (-> `ALL`), `CONVRT` [F3], `CLOSE` [F4], `COPY` [F5].
- **Convert Sound**: STEREO TO MONO (`-L`/`-R`) / MONO TO STEREO (`-S`) / RE-SAMPLE (`New Fs:`, `Quality:` LOW/MED/HIGH, `New Bit:`, `New name:`).

---

## 8. PROGRAM mode (SHIFT+6)

Entry shows `DRUM 1`-`DRUM 4` on F1-F4. Footer: `ASSIGN PARAMS DRUM PURGE AUTO` (+ `PLAY` [F6]).

### ASSIGN page
```
Pgm: 1-NewPgm-A
Pad:A01=Note:37     Pad assign:PROGRAM
Note:60=Snd:OFF
Mode:NORMAL
```
- `Pgm:` 1-24. `Pad:` A01-D16 -> `Note:` 35-98. `Note:`=`Snd:`. While on Snd:, hitting pads changes Pad/Note.
- `Pad assign:` PROGRAM / MASTER. OPEN WINDOW -> **Initialize Pad Assign**.
- `Mode:` NORMAL / SIMULT (`Also play note:` x2) / VEL SW (`If over: 44, use:36/A02`, `If over: 88, use:53/A16`) / DCY SW.
- OPEN WINDOW on Pad/Note -> **Assignment View**: 4x4 grid of sound names.
- OPEN WINDOW on Pgm -> **Program** window: `Program name:`, `MIDI program change:`; `DELETE` (-> `ALLpgm`), `NEW`, `CLOSE`, `COPY`.

### PARAMS page
```
Pgm: 1  Note:60/C05-OFF
<Envelope>      <Filter>      Tune:-120
Attack:  0      Freq:100      Voice
Decay:100       Reson:  0     Overlap:
Dcy md:END                    POLY
```
- OPEN WINDOW on Note -> **Copy Note Parameters**.
- Envelope: `Attack:` 0-100, `Decay:` 0-100, `Dcy md:` END / START. OPEN WINDOW -> `Velo>Attack:`, `Velo>Start:`, `Velo>Level:`, `Velo:`.
- Filter: `Freq:` 0-100, `Reson:` 0-100. OPEN WINDOW -> **Velo/Env>>filter**: `Attack:`, `Decay:`, `Amount:`, `Velo>Freq:`.
- `Tune:` -120..+120. OPEN WINDOW -> **Velo>>Pitch**: `Tune:`, `Prog tempo:`, `Velo>Pitch:`.
- `Voice Overlap:` POLY / MONO / NOTE OFF. OPEN WINDOW -> **Mute Assign**: `Mutes off:` `Note:` x2.

### DRUM page
`Drum:` 1-4, `Pgm:`, `Program Change:` RECEIVE/IGNORE, `MIDI volume:` RECEIVE/IGNORE, `Current val.:`, `Pad to internal sound:` ON/OFF.

### PURGE page: erase all sounds not used in any program. `DO IT` [F6].

### AUTO page -> **Auto Chromatic Assignment**: `Source:`, `Original key:`, `Tune:`, `Program name:`; assigns across notes 35-98 in semitone steps.

---

## 9. MIXER mode (SHIFT+7)

Entry: DRUM 1-4. Footer: `STEREO INDIV FXsend SETUP FXedit ALL CH`. 16 channel strips for current pad bank; channel by CURSOR left/right or pad; CURSOR up/down toggles top row vs level row. SHIFT+pads multi-select.

- **STEREO**: top = pan (L..MID..R), bottom = level 0-100.
- **INDIV** / **FXsend** (option boards).
- `ALL CH` [F6] links all channels (label becomes `CLEAR`).
- OPEN WINDOW on a channel -> **Channel Settings**: `Vol:`, `Pan:`, indiv `Vol:`/`Out:`, FX, `Follow stereo:`.
- **SETUP**:
```
Mixer setup                 Master Level
Stereo mix source:PROGRAM    0dB
INDIV/FX source:PROGRAM
Copy pgm mix to drum:YES    FX drum
Record mix changes: NO      Drum:1
```
  `Record mix changes:` YES -> mixer moves recorded to sequence as MIXER events.
- **FXedit** (EB16): `Edit:` MULTI FX1 / MULTI FX2 / REVERB 1 / REVERB 2; chain `DIST FILT MOD ECHO REV MIX`; per-module windows (`SOLO` `BYPASS` `CLOSE` `MIXER`):
  - DISTORTION/RING MOD: `Gain:`, `Level:`; `Freq:`, `Depth:`.
  - 4-BAND FILTER: `HIGH:`, `MID1:`/`MID2:` f/dB/Q, `LOW:`, `<F-MOD>`.
  - MODULATION `Type:` PHASE SHIFT / FLANGE / CHORUS / ROTARY SPEAKERS / FMOD/AUTOPAN / PITCH SHIFT / PITCH+FEEDBACK.
  - DELAY/ECHO `Type:` MONO LEFT / MONO L+R / X-OVER L&R / STEREO (`Feedback:`, delay ms, `HF damping:`).
  - REVERB `Type:` LARGE HALL / SMALL HALL / LARGE ROOM / SMALL ROOM / GATED 1 / GATED 2 / REVERSE (`Predelay:`, `Time:`, `Diffuse:`, damping).

---

## 10. MIDI/SYNC (SHIFT+9), OTHER (SHIFT+8), DISK (SHIFT+3 / SHIFT+0)

### MIDI/SYNC, footer `SYNC DUMP MIDIsw`
- **SYNC**: Sync In `Mode:` OFF / MIDI CLOCK (+ `Shift early(ms):`) / MIDI TIME CODE / SMPTE; `Receive MMC:`. Sync Out `Mode:` OFF / MIDI CLOCK / MIDI TIME CODE / SMPTE; `Send MMC:`.
- **DUMP**: MIDI Sample Dump Standard receive/transmit.
- **MIDIsw**: `Switch1`-`Switch4`: `Ctrl:` CC#, `Function:` PLAY STRT / PLAY / STOP / REC+PLAY / ODUB+PLAY / REC/PUNCH / ODUB/PNCH / TAP / PAD BANK A-D / PAD 1-16 / F1-F6.

### OTHER, footer `OTHERS INIT VER.`
- `Tap averaging:` (default 3). INIT: "Initialize ALL PARAMETERS". VER.: OS version.

### DISK, footer `LOAD SAVE FORMAT   DO IT`
**LOAD page**
```
View:ALL Files          :ROOT (folder)
File:LOOP_1 .SND   Size= 862K
Device:Floppy   LOAD   Free memory snd= 1900K
Type=MPC2000XL               seq= 2624K
```
- `View:` filter by type. `Device:`. `Free memory snd=`/`seq=`.
- OPEN WINDOW -> **Directory** window: tree; `DELETE` [F2] (-> `ALL` with `Delete:` type filter), `RENAME` [F3], `Close` [F4], `NEW` [F5] (folder).
- Load flows (`DO IT` [F6]):
  - .SND/.WAV -> **Load a Sound**: `Assign to note:`; `PLAY` [F3], `DSCARD` [F4], `KEEP` [F5].
  - .SEQ/.MID -> **Load a Sequence**: `Load into:` sq number.
  - .PGM -> **Load a Program**: `Replace same sound in memory:`; `CLEAR` [F3], `CANCEL`, `LOAD` [F5]. Missing sound -> "Can't find file:" `AL SKP` / `SKIP` / `LOAD`.
  - .ALL -> "This will replace all existing sequence & songs!" `<SEQ>` [F3] pick one, `CANCEL`, `LOAD`.
  - .APS -> "This will replace existing programs and sounds" `CANCEL`/`LOAD`.

**SAVE page**
```
Type:Save All Sequences & Songs
File:ALL_SEQ_SONG1   Size= 24K
SAVE   Device:Floppy   Free= 821K
```
- `Type:` Save All Sequences & Songs (.ALL) / Save a Sequence (.MID, TYPE 0 / TYPE 1) / Save All Program & Sounds (.APS, `Save:` WITH SOUNDS / WITH.WAV / APS ONLY) / Save a Program & Sounds (.PGM) / Save a Sound (.SND / WAV).
- Confirm windows: `WIPE` [F3], `CANCEL` [F4], `SAVE` [F5].

**FORMAT page**: erase device confirm.

---

## 11. Data model notes

- **Event types per track:** NOTE (note, velocity, duration ticks, note-variation on drum tracks), PITCH BEND, CONTROL CHANGE, PROGRAM CHANGE, CH PRESSURE, POLY PRESSURE, EXCLUSIVE, MIXER. TEMPO CHANGE is a sequence-level list.
- **Per-sequence:** name, tempo + tempo-change list, Tsig (per-bar), bars, loop (first/last/END); per-track: name, type, MIDI channel, ON, Pgm, Velo%, transmit-pgm-change, playback transpose.
- **Per-program:** name, MIDI program change #, pad->note map (or MASTER), 64 x note params (sound, mode + 2 alt notes/thresholds, attack, decay, dcy md, velo->attack/start/level, filter freq/reson, filter env attack/decay/amount, velo->freq, tune, velo->pitch, voice overlap, 2 mute-off notes, stereo vol/pan, indiv out/vol, fx assign/send, follow-stereo), effect sets, NV slider assignment.
- **Per-sound:** name, mono/stereo, rate, St, End, loop To/Lngth/on, zones, Level, Tune, Beat.
- **DRUM slots:** 4 concurrently active programs; a DRUM track plays through its slot's program.
- **Naming defaults:** sequence `<Default name><NN>`; track `Track-NN`; song `Song01`; sample `soundN`; stereo->mono `-L`/`-R`; mono->stereo `-S`; slices `<name>N`.
