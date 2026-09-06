# Chop Deck as a real application

The machine is finished: every mode, disk, MIDI, effects, a manual, a tour, and a deploy path. This
document plans what turns it into a product people come back to: accounts and cloud saves, a
samples library, a pad-bank (kit) library, published beats that anyone can play and remix, and a path
to money and other venues.

**The rule.** The machine owns beat creation and stays at 2000XL parity. Everything the original
could not do (accounts, libraries, publishing, remixing, profiles) is a Chop Deck page, built in the
same typography and palette as the owner's manual. The two surfaces meet at exactly one doorway: the
silkscreen header line above the LCD, which already carries the non-machine links (QUICK START,
OWNER'S MANUAL, TIPS). Nothing new is added to the LCD, the keypad or the disk screens.

Read this alongside [ROADMAP.md](../ROADMAP.md) (phases 0 to 6, the machine itself) and
[DEPLOY.md](DEPLOY.md) (how it ships today).

## 1. Where we start

What exists and shapes every decision below:

- **Local-first persistence.** The whole machine state autosaves to IndexedDB (`disk/autosave.ts`),
  and the disk screens read and write a browser drive (`disk/drive.ts`). Pages on chopdeck.com share
  that origin, so a page can read the same autosaved state the machine wrote.
- **Files in, files out.** Dropping audio or project files anywhere on the panel puts them in the
  import tray of LOAD mode (`app/host.ts`); SAVE downloads them. A page that wants to put something
  on the machine hands it a file the same way. Loading and saving files is something the original
  machine did, so this seam adds nothing to the panel.
- **Portable formats.** `.CHOPDECK` is a zip holding the entire machine; `.PGM` is a program with or
  without its sounds; `.APS` is every program; `.SND` is one sound with its metadata; `.WAV`, `.MID`
  and `.SEQ` are the interchange formats. Everything the platform stores is one of these.
- **Offline rendering.** `audio/bounce.ts` renders a sequence or song to WAV through an
  OfflineAudioContext, so a page can make a beat's preview on the user's computer at publish time.
- **Hosting.** Cloudflare Pages on chopdeck.com. Cloudflare also sells the storage and compute this
  plan needs, in the same account, with no egress fees on audio.
- **No tracking, no chrome.** The tour, tips and manual already handle onboarding without leaving
  the panel. The pages must feel like the manual, not like a dashboard bolted onto a machine.

## 2. Product shape

Four things a visitor can do, in the order they will want them:

1. **Keep my work.** Sign in; everything I make follows me to another browser or computer, without
   doing anything on the machine.
2. **Find sounds.** Browse a samples library and a kit library on the site, audition in the page, and
   send a sound or a whole pad bank to the machine in one click.
3. **Show a beat.** Publish a project as a page with a player and a card that unfurls on social
   media; anyone can open it on the machine and hear it exactly as made.
4. **Remix.** Press REMIX on someone's beat and get my own copy of the project, sounds and pad banks,
   with credit to the original kept in the lineage.

Around them: a tip jar now, supporter accounts later, and installable builds for desktop and Steam.

## 3. Architecture

### 3.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Pages | Static and server-rendered HTML from Cloudflare Pages Functions, same repo, manual typography | Beat and library pages need real HTML for sharing and search; no SPA framework required |
| API | Cloudflare Pages Functions (Hono) in `functions/`, at `chopdeck.com/api/*` | Same deploy as the site, previews per PR include the API |
| Database | Cloudflare D1 (SQLite) | Tiny relational needs, free tier covers early years, one vendor |
| Blobs | Cloudflare R2 | Audio is the cost. R2 has zero egress; a popular beat costs nothing to serve |
| Auth | Better Auth on D1, magic-link email plus Google and GitHub OAuth | Passwordless keeps the sign-in page to one field; OAuth for the rest |
| Email | Resend | Magic links and nothing else at first |
| Payments | Buy Me a Coffee link now; Stripe Checkout + Customer Portal for supporter tier later | Zero code until there is something to sell |
| Analytics | Cloudflare Web Analytics (cookieless) | Page and beat plays without tracking people |

The alternative is Supabase (Postgres, Auth, Storage in one). It is faster for the first week and
worse for the fifth month: storage egress is billed, audio is the only thing we serve in bulk, and it
means a second vendor beside Cloudflare. If D1 ever pinches, the schema below is plain SQL and moves.

### 3.2 Content addressing is the whole trick

Every sound is stored once, keyed by the SHA-256 of its canonical bytes (the `.SND` payload: WAV plus
metadata). Projects, programs and kits are small JSON manifests that reference sounds by hash.

- **Remix is a manifest copy.** Copying a beat copies a few kilobytes of JSON and a row per
  reference; the audio is shared. No storage grows on remix.
- **Libraries are free to include.** Putting a library sound in a project references the same hash.
- **Quotas are honest.** A user's usage is the bytes of blobs they were first to upload.
- **Takedowns work.** Removing a hash removes it from every project at once, and the machine already
  reports `missing` sounds when it decodes a program, so affected projects degrade instead of break.
- **Uploads dedupe.** The client hashes before uploading and skips blobs the server already has.

The `.CHOPDECK` zip stays the export format. The cloud format is the same manifest with sounds
replaced by hashes; converting between them is one function next to `encodeProject`.

### 3.3 The seam: how pages and the machine meet

Three flows, none of which add anything to the panel:

- **Sync (machine to account).** A small `sync.ts` next to `autosave.ts` watches the same autosave
  and, when the site says you are signed in, pushes the project manifest and any new sound blobs to
  your account, debounced and off the audio thread. Offline it does nothing; back online it catches
  up. Conflicts are last-writer-wins with the older version kept as a revision on the account page.
  On a fresh browser, signing in pulls your latest project down before the machine powers on. The
  disk screens are untouched: the browser disk is still the disk. The header shows the handle and a
  one-word sync state (`SYNCED`, `SYNCING`, `OFFLINE`) where it now shows nothing.
- **Hand-off (page to machine).** "Send to machine" on a sample, kit or beat page fetches the file
  and opens `/` with it in the import tray, exactly as if it had been dropped on the panel. For a
  beat or remix, the file is a `.CHOPDECK` project; opening it is the LOAD flow the original had.
  The page and the machine share the origin, so the file goes through IndexedDB, not a URL.
- **Read (page from machine).** The publish page reads the autosaved machine state from IndexedDB,
  renders the preview with `bounce.ts` in the page, and uploads. The machine never learns about
  publishing.

### 3.4 The pages

All under chopdeck.com, server-rendered where sharing or search matters, static otherwise, styled
like the manual (Barlow, cream and ink, LCD green for accents). The header on every page is the same
mark and link row, and "Back to the machine" is always one click.

| Page | Purpose |
|---|---|
| `/account/` | Sign in (one email field, two OAuth buttons); handle, plan, cloud usage, revisions of your project, export everything as `.CHOPDECK`, delete account |
| `/samples/` | The samples library: search, tags, category folders, in-page audition, "Send to machine", upload with license |
| `/kits/` | The pad-bank library: a playable 16-pad grid per kit, "Send to machine", upload from a `.PGM` |
| `/beats/` | The feed: new, most played, most remixed, by tag |
| `/beats/<handle>/<slug>` | One beat: player, lineage, license, OPEN ON THE MACHINE, REMIX, download if allowed |
| `/publish/` | Reads the machine's current project, asks title, tags, license, source (sequence or song), renders the preview, uploads |
| `/@<handle>` | A person's beats and kits |
| `/support/` | The tip jar, later the supporter tier |
| `/terms/`, `/privacy/`, `/dmca/` | Legal |

The machine's header line gains one link, `SIGN IN`, which becomes the handle plus sync state once
signed in and links to `/account/`. That is the only change to the panel in this whole plan.

### 3.5 Data model

```
users          id, handle (unique, 3-24 chars), email, display_name, plan, created_at
blobs          hash (pk), bytes, mime, sample_rate, channels, duration_ms, uploader_id, license, created_at
projects       id, owner_id, title, manifest (json), revision, parent_beat_id?, updated_at
project_blobs  project_id, hash                     -- what a project references
project_revs   project_id, revision, manifest, created_at   -- last 20 kept
kits           id, owner_id, title, manifest (.PGM json), license, tags, downloads, created_at
kit_blobs      kit_id, hash
samples        hash, owner_id, title, tags, license, downloads   -- a library entry for a blob
beats          id, project_id, owner_id, slug, title, description, tags, license, bpm, duration_ms,
               preview_hash (mp3), cover_hash?, plays, likes, remixes, published_at, takedown?
beat_lineage   beat_id, parent_beat_id, depth        -- the remix tree
likes          user_id, beat_id
reports        id, target_type, target_id, reporter_id, reason, status
```

Licenses are a fixed list the uploader chooses from: CC0, CC-BY, CC-BY-NC, "all rights reserved,
remix on Chop Deck allowed". Publishing a beat requires every referenced sound to be yours, library,
or remix-allowed; the publish page shows what blocks it.

### 3.6 API surface (first cut)

```
POST /api/auth/*                     Better Auth
GET  /api/me                         user, plan, usage
GET  /api/project                    latest manifest (hashes resolved to signed R2 URLs)
PUT  /api/project                    sync: manifest + list of hashes; 409 lists missing hashes
GET  /api/project/revisions          last 20
POST /api/blobs/:hash                 upload one blob (direct-to-R2 signed PUT; server verifies hash)
HEAD /api/blobs/:hash                 exists?
GET  /api/library/samples?q=&tag=     paged
GET  /api/library/kits?q=&tag=
POST /api/library/samples             publish a blob you uploaded
POST /api/library/kits                publish a program (+ its blobs)
POST /api/beats                       publish: manifest, preview blob, metadata
GET  /api/beats/:slug                 public
POST /api/beats/:slug/remix           copies manifest into caller's account, records lineage
POST /api/beats/:slug/like
POST /api/reports
```

Rate limits per user and per IP at the edge; upload size caps (a sound at most 60 s of 44.1 kHz
stereo, a project at most 200 sounds); quotas per plan (free 250 MB, supporter 5 GB).

## 4. Libraries

### 4.1 Samples library (`/samples/`)

Two sources: a **curated** set we ship (the starter kit and demo break are already synthesised in
code; add a few hundred CC0 one-shots and breaks, hashed and uploaded once with a script), and
**user uploads** from the page (drop files, choose title, tags and license). Browse by category
(`Drums / Kick`, `Breaks`, `Bass`, `Keys`, `FX`, `Vocal`), search, audition with a waveform in the
page, and "Send to machine", which lands the sound in the import tray where the Load a Sound window
assigns it to a pad exactly as it does for a dropped file.

### 4.2 Pad bank (kit) library (`/kits/`)

A kit is a `.PGM` with sounds: sixteen pads, note parameters, mixer settings. Upload one from the
page (or the page offers to publish a program straight from the machine's autosave, choosing which of
your programs); the listing shows a playable pad grid per kit. "Send to machine" hands over the
`.PGM`, and the existing Load Program window handles "with sounds" and the DRUM slot.

### 4.3 Beats (`/beats/`)

A beat is a published project revision plus a preview mixdown. See section 5.

## 5. Publishing and remixing

**Publish** (`/publish/`, signed in):

1. The page reads the machine's autosaved project and lists what will be published: sequences,
   songs, programs, sounds, and any sound whose license blocks publishing.
2. Fields: title, tags, license, source (a sequence or the song), cover (none or the pad grid).
3. The page bounces the source with `bounce.ts`, encodes an MP3 preview with a WASM encoder, uploads
   missing blobs, then the manifest and preview, with a progress bar, and shows the beat URL.

**Beat page** (`/beats/<handle>/<slug>`): server-rendered HTML so it works without JavaScript and
carries full Open Graph tags. Player for the preview, title, handle, tags, license, lineage ("Remix
of ... by ..."), play and like counts, and three buttons:

- **OPEN ON THE MACHINE**: hands the project to the machine read-only (`/?beat=<slug>`; the loader
  fetches the manifest and blobs and loads them like a dropped `.CHOPDECK`), so anyone can hear it
  exactly as made and poke at it. Their own autosaved work is set aside and restored when they leave
  or press MAIN SCREEN twice; the header says whose beat is loaded.
- **REMIX**: requires sign-in; copies the manifest into the user's account as a new project with
  `parent_beat_id` set, then opens it on the machine as their current project. Publishing the remix
  records lineage and shows up on the original's page under "Remixes".
- **DOWNLOAD .CHOPDECK**: if the license allows.

Per-beat share cards are generated by a Pages Function (the card from `scripts/og/card.html`
parameterised with title, handle and the pad grid, rendered at the edge). `/beats/` is the public
feed: new, most played, most remixed, by tag.

**Moderation.** Every beat, kit and sample has a report link; reports go to a table and an email.
A `takedown` flag hides the item and its blob references everywhere; a DMCA page names an agent.
Handles are reserved for obvious abuse words and trademarks (including the one we do not use).

## 6. Money and venues

**Now**: a `Buy me a coffee` link at `/support/`, linked from the manual's footer and from the beat
and library pages. Not on the panel; the header line stays QUICK START, OWNER'S MANUAL, TIPS and
SIGN IN.

**Supporter tier** (after accounts): Stripe Checkout, a monthly or yearly price, unlocks a larger
cloud quota, longer samples, early features, and a supporter mark on the handle. Never gate the
machine itself; the free tier must stay a complete instrument.

**Desktop**: Tauri 2 wraps the built `dist/` in a native window with the system webview.
It gives file-system access (drag folders in, save to real disk), ASIO/CoreAudio via the webview's
Web Audio, and a 10 MB installer. Same code, one `src-tauri/` folder. Electron would work too and
costs 150 MB and Chromium updates; Tauri is the recommendation. The pages stay on the web; the
desktop build opens them in the system browser.

**Steam**: the Tauri build plus a Steamworks app id, a store page, and screenshots. Steam wants
achievements and cloud saves to feel native; the account sync from phase 7 covers cloud saves and
a handful of achievements (first beat published, first remix) can be sent through the Steamworks
SDK from the Tauri side. itch.io first: the same build, a day's work, tells us whether anyone pays
for a desktop version before the Steam fee and review cycle.

**Mobile**: the panel already scales; pads on a phone need a touch-first layout (pads full width,
LCD above). Do it as a responsive mode of the same page before considering app stores.

## 7. Phases

Each phase ships on its own and leaves the site fully usable if we stop there.

### Phase 7: Accounts and cloud saves
- Pages Functions project, D1 schema, R2 bucket, Better Auth with magic link + Google + GitHub.
- `/account/` page; `SIGN IN` in the machine's header, becoming handle plus sync state.
- `sync.ts` beside autosave: client-side hashing, blob dedupe, manifest push, pull on sign-in,
  revisions listed on the account page.
- Privacy policy and terms pages; export everything; delete account.
- Tests: API integration tests with Miniflare; e2e sign-in with a test mailbox; a project made in
  one browser context appearing in another.

### Phase 8: Libraries
- `/samples/` and `/kits/` with search, audition, upload with license, "Send to machine" through
  the import tray.
- Curated CC0 samples ingested by script; quotas and size caps; reports and takedown flag.
- Open Graph tags and per-item cards for search and sharing.

### Phase 9: Publish and remix
- `/publish/` reading the machine's autosave; client-side preview encoding; upload with progress.
- Beat pages with server-rendered HTML, player, lineage, dynamic share card; `/beats/` feed.
- OPEN ON THE MACHINE with the visitor's own work set aside and restored; REMIX with lineage;
  likes and play counts; `/@handle` pages.

### Phase 10: Support and venues
- `/support/` with Buy Me a Coffee, linked from the manual and pages.
- Stripe supporter tier with quota changes and a supporter mark.
- Tauri desktop builds for Windows, macOS and Linux in CI; itch.io page.
- Steamworks integration and a Steam store page once itch.io shows demand.
- Touch layout for phones.

Phases 8 and 9 can swap: if we would rather have beats before libraries, nothing in 9 depends on 8
except the license check, which can start as "your own sounds only".

## 8. Decisions to make now

1. **Handles and privacy.** Choose a handle at sign-up, nothing public until you publish (recommended),
   or fully public profiles from day one.
2. **Preview format.** MP3 via a WASM encoder (recommended: works everywhere, about 300 KB of code)
   or Opus via MediaRecorder (free, not in Safari).
3. **Default license.** Default to "remix on Chop Deck allowed" (recommended), with Creative Commons
   options for those who want them.
4. **Free quota.** 250 MB is roughly 25 minutes of stereo 44.1 kHz WAV, plenty for dozens of projects
   under content addressing. Revisit with real numbers.
5. **Repo.** Keep one repo: `functions/` for the API, `pages/` for the new HTML, `src-tauri/` later.
   Split only if CI time hurts.

## 9. Risks

- **Copyright.** People will upload commercial breaks. Mitigations: license selection, reports,
  takedown flag, DMCA agent, no public library entry without an explicit publish step, and a
  fingerprinting check later if volume justifies it.
- **Cost surprises.** R2 storage is cheap and egress free; D1 reads are the only metered thing that
  scales with traffic. Beat pages are cacheable at the edge; cache them.
- **Auth complexity.** Keep to magic link and two OAuth providers; no passwords, no password resets.
- **Sync bugs.** Local-first with last-writer-wins and kept revisions means nothing is ever lost,
  only possibly duplicated. Revisions on the account page let users recover on their own.
- **Two products.** The pages must look and read like the manual, or the site will feel like a
  dashboard with a toy in it. One header, one palette, one voice, and the header link is the only
  doorway; resist adding more.
- **Scope.** Each phase is a shippable product. Do not start phase 9 before phase 7 sync is solid;
  remix depends entirely on it.

## 10. First steps

1. Create the D1 database and R2 bucket in the Cloudflare account; add bindings to the Pages project.
2. Scaffold `functions/` with Hono and Better Auth; `GET /api/me` behind a magic link; deploy to a
   preview branch; `/account/` in the manual's typography.
3. Add `hashSound()` and the manifest-with-hashes encoder next to `encodeProject`, with unit tests.
4. Write `sync.ts` against a fake server in tests; add `SIGN IN` and the sync state to the header.
5. Sign in on two browsers and watch a project follow you.
