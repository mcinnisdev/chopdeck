# Contributing to Chop Deck

Thanks for looking under the panel. This page is how the project is built and what a good change
looks like. The short version: the machine is the spec, the manual is the contract, and every screen
is tested as text.

## Set up

```
git clone https://github.com/mcinnisdev/chopdeck.git
cd chopdeck
npm install
npm run dev            # the machine at http://localhost:5173, no accounts, no server
```

That is the whole instrument. Accounts, the libraries and beats are optional and need the API
(`server/`, run as Cloudflare Pages Functions). To work on those:

```
cp .dev.vars.example .dev.vars
npm run db:local       # a local SQLite database with the schema
npm run build          # once, so wrangler has a dist/ to serve
npm run dev:api        # the API at :8788; Vite proxies /api to it
```

## Check your change

```
npm run typecheck      # strict TypeScript, app and server
npm test               # Vitest: model, sequencer, DSP, every screen as text, the API on Miniflare
npm run test:e2e       # Playwright: boots the machine, records, loads, syncs, publishes
npm run build
```

CI runs all four on every push and pull request. Please run them before opening a PR.

## How the code is laid out

Five layers, each only talking to the one below it:

| Layer | Where | What |
|---|---|---|
| Chassis | `src/app`, `src/ds` | The front panel in React; typed design-system components |
| Firmware | `src/kernel`, `src/screens`, `src/lcd` | Modes, screens, fields, cursor, windows; the 48x8 LCD framebuffer |
| Machine | `src/model` | The data model, tick math, serialisation |
| Transport and audio | `src/seq`, `src/audio` | The sequencer clock and scheduler; the sampler, DSP, effects, recorder, bounce |
| Disk and MIDI | `src/disk`, `src/midi` | File formats, the IndexedDB drive, sync, the libraries' client side; Web MIDI |

Outside the machine: `manual/` (the owner's manual), the pages (`account/`, `kits/`, `samples/`,
`beats/`, `beat/`, `publish/`, `support/`, `terms/`, `privacy/`), `server/` (the API), `functions/`
(the Pages glue), `scripts/` (assets and seeding), `e2e/` (browser tests).

## The rules that keep it coherent

- **The machine stays at parity with the original.** Everything on the LCD and the panel is
  something the 2000XL could do (see `docs/mpc2000xl-feature-inventory.md`). Anything it could not
  do lives on a page. The only doorway between the two is the silkscreen text on the panel.
- **Screens are pure.** A screen is a `ScreenDef`: fields, a `draw` into the framebuffer, soft keys,
  key handlers. Screens never touch the DOM or audio directly; they go through the `Ctx`. Every
  screen has a text test in `src/screens/*.test.ts` that renders it with `frameToLines`.
- **The manual is the contract.** If you change what a screen does, change `manual/index.html` in
  the same PR, and the tooltip copy in `src/app/help.ts` or `src/app/field-help.ts` if it applies.
- **Write like the manual.** Plain sentences, the machine's own words for things (`Sq`, `Tr`,
  `Timing`), no marketing. Prose in the design system's voice (`design-system/readme.md`).
- **Local first.** Nothing about an account may be required to use the instrument. A build served
  from a plain folder with no API must work completely; the machine detects that and hides the
  site's links.
- **No new dependencies without a reason.** The app is React, Vite and the browser. The server is
  Hono, Better Auth and Kysely on Cloudflare.

## Making a fork your own

The code is MIT; the name and logo are not (see `LICENSE`). To run your own copy:

- Change the name and marks: `src/ds/Wordmark.tsx`, `public/logo.webp`, `public/manifest.webmanifest`,
  the `<title>` and Open Graph tags in `index.html` and the pages, `scripts/og/card.html`.
- Point the site at your domain: `wrangler.toml` (`SITE_URL`, your own D1 and R2 names),
  `public/sitemap.xml`, `public/robots.txt`, the canonical URLs in the pages.
- Or skip the site entirely: `npm run build` and serve `dist/` from anywhere. The machine works
  offline, keeps projects in the browser, and imports and exports files.

## Reporting bugs

Open an issue with what you did, what the LCD showed, and what the manual says should have
happened. A `.CHOPDECK` file that reproduces it (SAVE mode, Device DOWNLOAD) is gold.
