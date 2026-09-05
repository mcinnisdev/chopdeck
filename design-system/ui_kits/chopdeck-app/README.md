# Chop Deck — app UI kit

chopdeck is the app; there is no marketing site. On load you see the machine.

- `index.html` — the whole chassis, interactive: hit pads (lights + LCD), PLAY/STOP/REC (LEDs, step cursor on LCD), F1–F6 / soft keys switch LCD modes (MAIN, TRACK, SAMPLE, CHOP, LOAD, MIX), OPEN WINDOW raises an LCD modal (LOAD → "LOAD A SOUND" → DO IT loads the file into SAMPLE), DATA wheel nudges BPM on MAIN or the selected chop on CHOP, hitting a pad in CHOP mode asks to assign the chop.
- `Mpc.jsx` — chassis layout + fake state; composes DS components only.
- `Screens.jsx` — one component per LCD mode.
- `data.js` — pad names, demo sequence, chop points, file list, fake peaks.

Layout: navy chassis, LCD top-left, F-keys under the bezel, MODE numeric block, DATA wheel + cursor + fader centre, LOCATE + transport bottom-left; brand + gain/volume, PAD BANK and 4×4 pads on a cream recess to the right. Pads are numbered bottom-left (1) to top-right (16) as on the hardware.

Source: no codebase or Figma was provided — layout is derived from the two hardware reference photos in `assets/reference/` and the logo. Treat as a proposal to iterate on.
