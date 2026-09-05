# Chop Deck Design System

**Chop Deck** (formerly "Fun MPC" — renamed because MPC is a third-party trademark; the logo is unchanged) is a simple browser DAW shaped like a classic late-90s hardware sampler/drum machine (MPC 2000XL / MPC Studio form factor). Upload audio, chop it, assign slices to 16 pads, play and record beats. There is no marketing site — the URL *is* the app, and loading it should feel like looking down at the machine. Every UI decision follows from that: **if it isn't on the hardware, it isn't in the UI.**

One product / surface: the app (`ui_kits/chopdeck-app/`).

## Sources
- `uploads/funmpc-logo (1).webp` (original filename) → `assets/logo.webp` — the only brand asset: an isometric pad-grid mark (cream face, red pads, near-black outline).
- `uploads/funmpc-concept.webp`, `uploads/funmpc-concept2.webp` → `assets/reference/` — hardware reference photos (an MPC Studio and an MPC 2000XL). Used for **layout and vocabulary** only; no third-party marks or type are reproduced.
- No codebase, Figma, copy deck or font files were provided. Everything below is a proposal derived from the logo + form factor. **Intentional additions:** the whole component inventory (no source defined one).

## Content fundamentals
- **Voice = firmware.** Copy reads like a 1997 sampler's LCD: terse, imperative, ALL CAPS, abbreviated. "LOAD A SOUND", "ASSIGN TO: PAD 1", "DO IT", "CANCEL", "REPLACE SOUND ON PAD?". No exclamation marks, no emoji, no marketing adjectives.
- **Second person, implied.** Never "I" or "we"; rarely "you" — instructions are bare verbs: "DROP A WAV/MP3 HERE OR PICK A FILE".
- **Confirm/dismiss vocabulary:** F6 = `DO IT`, F5 = `CANCEL`. Never "OK", "Submit", "Save changes".
- **Labels are silkscreen, printed UNDER the control** (pads are the exception: label above). Status LEDs sit directly above the cap — the classic hardware arrangement — and every button reserves that LED slot so caps in a row share a baseline. Short nouns/verbs — `PAD BANK`, `TAP TEMPO`, `OVER DUB`, `PLAY START`, `OPEN WINDOW`. 1–3 words, uppercase, condensed.
- **Numbers are padded and monospaced** on the LCD: `SEQ:01`, `NOW:001.01.00`, `BPM: 93.0`, `ST:0004120`.
- **Body prose (Barlow) appears only outside the machine** (help, settings, legal): plain sentence case, short, dry-friendly: "Drop a WAV or MP3 on the LCD to load it. 16 pads, one bank at a time."
- Brand name: **Chop Deck** in prose (two words); `CHOPDECK` wordmark set solid with no space (CHOP red, DECK italic). Never "MPC" in product copy or UI — it is a third-party trademark; say "sampler", "the machine", "the deck".

## Visual foundations
- **Colour.** From the logo: cream panel `--cream #FBF2DA`, pad red `--red #F23A28`, ink `--ink #1B1B1B`. Chassis: navy `--navy #1F3F6E` (nod to the 2000XL body) with a darker `--navy-deep` edge. Display: yellow-green LCD glass `--lcd #B7C58C` with dark-green ink `--lcd-ink`. Status lives **only in LEDs**: red (rec), green (play), amber (attention/window). App background outside the chassis is ink with faint grain. No gradients except the subtle radial on knob caps; no purple, no pastel.
- **Type.** Three roles, three faces: silkscreen labels = Barlow Condensed 600 uppercase, 9–18px, `letter-spacing .08em`; LCD = VT323 pixel mono, `line-height 1`, `white-space: pre`, on a fixed 48x8 character grid, mixed case exactly as the firmware prints it (`Sq:`, `Now:`, `DO IT`); body = Barlow 400/500 14px only outside the machine. Wordmark = Barlow Condensed 700. *(All Google-Fonts substitutes — see caveats.)*
- **Spacing.** 2/4/8/12/16/24/32/48 scale plus hardware geometry tokens: pad 72 gap 10, key 34×18 / 44×26, knob 56 / 96, LED 6. Values are hardware-plausible, not a web grid.
- **Corner radii.** Tight and industrial: keys 3, LCD glass 4, pads 6, panels 10, chassis 18. Never pills.
- **Bevels & shadows.** Every control sits *on* the panel: a hard 0-blur drop (`0 2px 0 var(--ink)`) is its height, plus a light inset top edge and dark inset bottom edge (`--bevel-key`, `--bevel-pad`, `--bevel-knob`). Recesses (`--recess`) and the LCD (`--lcd-inset`) use inner shadows. The chassis alone gets a soft outer shadow (`--chassis-shadow`). No blur on controls, no glassmorphism, no transparency except LED/pad glow.
- **Press state = physical.** Cap translates down 2px (pads 3px), drop shadow goes to 0, inner shadow deepens. Pads flash lighter red with a red glow (`--pad-glow`). **No hover states** — hardware has none; cursor: pointer is the only affordance. Disabled = 45% opacity.
- **Motion.** `--dur-press 40ms`, `--dur-led 120ms`, LCD redraw 0ms. One easing `--ease-hw`. No fades, slides, bounces or spinners. A "loading" state is LCD text.
- **Borders.** 2px ink on every cap, pad, panel and the chassis (3px). Panels are outlined `fieldset`s with a silkscreen legend, or recessed cream wells for pad grids.
- **Surfaces / texture.** Navy chassis carries a faint SVG grain (`--texture-grain`); cream panels are flat matte; LCD has 1px horizontal scanlines. No photography, no illustration beyond the logo, no full-bleed imagery.
- **Layout.** Fixed 1240px chassis centred in the viewport (scales down; never reflows into a web layout). LCD top-left with F1–F6 beneath, mode/numeric block, DATA wheel + cursor, LOCATE + transport bottom-left; brand + gain/volume, PAD BANK, 4×4 pads on the right. Pads numbered 1 bottom-left → 16 top-right.
- **Cards / dialogs / toasts** do not exist. Any modal is an `LcdWindow` drawn inside the LCD with soft keys; any list is LCD rows with an inverted cursor row.
- **Logo.** `assets/logo.webp` — use as-is on cream, navy, ink or LCD green; never recolour, outline or rotate.

## Iconography
- **No icon set.** The hardware has none; controls are identified by silkscreen words. Where the real machine uses glyphs they are unicode on caps/LCD: `◀ ▲ ▶ ▼` cursor, `< > << >>` locate, `■ ►` stop/play, `●` rec, `▪ ▮ ·` step grid, `═` window rule. Keep to these; no emoji, no SVG icon libraries, no icon fonts.
- Status is an LED, not an icon. Progress is LCD text/blocks.
- Logo is the only pictorial asset (webp). No illustrations were provided; none were created.

## Components
Group **controls/** — `Pad`, `HardButton`, `Led`, `Knob`, `Fader`, `CursorPad`.
Group **display/** — `Lcd`, `LcdField`, `SoftKeys`, `LcdWindow`, `Waveform`, `Panel`, `Silkscreen`, `Wordmark`.
Each has `.jsx` + `.d.ts` + `.prompt.md`; cards in `controls.card.html` / `display.card.html`. Starting points: Pad, HardButton, Lcd, and the full app screen.

## Index
- `styles.css` — entry; imports `tokens/{fonts,colors,typography,spacing,effects,base}.css`
- `tokens/` — colour, type, spacing/geometry, bevel/shadow/motion tokens
- `guidelines/` — 16 specimen cards (Colors, Type, Spacing, Brand)
- `components/controls/`, `components/display/` — see above
- `ui_kits/chopdeck-app/` — the app (`index.html`, `Mpc.jsx`, `Screens.jsx`, `data.js`, README)
- `assets/logo.webp`, `assets/reference/*.webp`
- `thumbnail.html` — homepage tile · `SKILL.md` — agent skill entry

## Caveats
- Fonts are substitutes (Barlow Condensed / Barlow / VT323 via Google Fonts). Replace with licensed faces in `tokens/fonts.css` if the brand has them.
- Colours beyond the three logo colours (navy, LCD green, LEDs) are proposals.
- The UI kit is a hardware-informed proposal, not a recreation of an existing screen.
