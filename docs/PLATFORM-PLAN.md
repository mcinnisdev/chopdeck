# Chop Deck as a real application

The machine is finished: every mode, disk, MIDI, effects, a manual, a tour, and a deploy path. This
document plans what turns it into a product people come back to: accounts and cloud saves, a
samples library, a pad-bank (kit) library, published beats that anyone can play and remix, and a path
to money and other venues. It follows the same rule as everything else here: the UI is the machine.
Accounts and libraries appear as devices and screens on the LCD, not as web chrome around it.

Read this alongside [ROADMAP.md](../ROADMAP.md) (phases 0 to 6, the machine itself) and
[DEPLOY.md](DEPLOY.md) (how it ships today).

## 1. Where we start

What exists and shapes every decision below:

- **Local-first persistence.** The whole machine state autosaves to IndexedDB, and the disk screens
  read and write a browser drive behind one small interface, `Drive` in `src/disk/drive.ts`
  (list, read, write, mkdir, remove, rename, usage). LOAD and SAVE already switch between devices
  (`BROWSER`, `IMPORT`, `DOWNLOAD`) through a `Device:` field.
- **Portable formats.** `.CHOPDECK` is a zip holding the entire machine; `.PGM` is a program with or
  without its sounds; `.APS` is every program; `.SND` is one sound with its metadata; `.WAV`, `.MID`
  and `.SEQ` are the interchange formats. Everything the platform stores is one of these.
- **Offline rendering.** `bounce.ts` renders a sequence or song to WAV through an OfflineAudioContext,
  so a preview mixdown of a beat can be made on the user's machine at publish time, not on a server.
- **Hosting.** Cloudflare Pages on chopdeck.com. Cloudflare also sells the storage and compute this
  plan needs, in the same account, with no egress fees on audio.
- **No tracking, no chrome.** The tour, tips and manual already handle onboarding without leaving
  the panel. The platform must not break that.

## 2. Product shape

Four things a visitor can do, in the order they will want them:

1. **Keep my work.** Sign in; everything I make follows me to another browser or computer.
2. **Find sounds.** Browse a samples library and a kit library from inside LOAD, pull a sound or a
   whole pad bank onto the machine in two key presses.
3. **Show a beat.** Publish a project as a page with a player and a card that unfurls on social
   media; anyone can open it on the machine and hear it exactly as made.
4. **Remix.** Press REMIX on someone's beat and get my own copy of the project, sounds and pad banks,
   with credit to the original kept in the lineage.

Around them: a tip jar now, supporter accounts later, and installable builds for desktop and Steam.

## 3. Architecture

### 3.1 Stack

| Concern | Choice | Why |
|---|---|---|
| API | Cloudflare Pages Functions (Hono) in `functions/` of this repo, at `chopdeck.com/api/*` | Same deploy as the site, no second pipeline, previews per PR include the API |
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

### 3.3 The machine's view: a `CloudDrive`

The kernel and screens do not learn about HTTP. A `CloudDrive` implements `Drive` over the API, and
the `Device:` field on LOAD and SAVE grows from `BROWSER / IMPORT` to `BROWSER / CLOUD / LIBRARY /
IMPORT`. Folders on CLOUD are the user's; folders on LIBRARY are the public libraries (`SAMPLES/`,
`KITS/`, `BEATS/`) with the Directory screen's existing search and folder navigation. That is the
entire in-machine UI for storage, and it is mostly built.

Autosave gains a second target: when signed in, the debounced autosave also pushes the project
manifest to CLOUD (and any new sound blobs). Offline, it keeps working locally and syncs when back.
Conflicts are last-writer-wins per project with the older version kept as a revision; the LOAD
screen's `Version:` field on a cloud project lists revisions. This is enough for one person on several
machines, which is the case we serve. Real-time collaboration is out of scope.

### 3.4 Account UI

Sign-in cannot live on the LCD (OAuth redirects, email links), so it gets a plain page at
`/account/` in the manual's typography: one email field or two buttons. Everything else stays on the
panel:

- The header silkscreen gains `SIGN IN` next to QUICK START; signed in, it shows the handle.
- OTHER mode gets an `ACCOUNT` page: `User:`, `Plan:`, `Cloud used:`, soft keys `SYNC`, `SIGN OUT`.
- SAVE mode gains a `PUBLISH` soft key (section 5).

### 3.5 Data model

```
users          id, handle (unique, 3-24 chars), email, display_name, plan, created_at
blobs          hash (pk), bytes, mime, sample_rate, channels, duration_ms, uploader_id, license, created_at
projects       id, owner_id, title, manifest (json), revision, parent_beat_id?, is_public, updated_at
project_blobs  project_id, hash                     -- what a project references
project_revs   project_id, revision, manifest, created_at   -- last 20 kept
kits           id, owner_id, title, manifest (.PGM json), license, tags, is_public, downloads, created_at
kit_blobs      kit_id, hash
samples        hash, owner_id, title, tags, license, is_public, downloads   -- a library entry for a blob
beats          id, project_id, owner_id, slug, title, description, tags, license, bpm, duration_ms,
               preview_hash (mp3/ogg), cover_hash?, plays, likes, remixes, published_at, takedown?
beat_lineage   beat_id, parent_beat_id, depth        -- the remix tree
likes          user_id, beat_id
reports        id, target_type, target_id, reporter_id, reason, status
```

Licenses are a fixed list the uploader chooses from: CC0, CC-BY, CC-BY-NC, "all rights reserved,
remix on Chop Deck allowed". Publishing a beat requires every referenced sound to be either yours,
library, or remix-allowed; the publish window shows what blocks it.

### 3.6 API surface (first cut)

```
POST /api/auth/*                     Better Auth
GET  /api/me                         user, plan, usage
GET  /api/drive/list?folder=          CloudDrive.list
GET  /api/drive/read?path=            CloudDrive.read (manifest with hashes resolved to signed R2 URLs)
PUT  /api/drive/write                 CloudDrive.write (manifest + list of hashes; 409 lists missing hashes)
POST /api/blobs/:hash                 upload one blob (direct-to-R2 signed PUT; server verifies hash)
HEAD /api/blobs/:hash                 exists?
GET  /api/library/samples?q=&tag=     paged
GET  /api/library/kits?q=&tag=
POST /api/library/samples             publish a blob you uploaded
POST /api/library/kits                publish a program (+ its blobs)
POST /api/beats                       publish a project: manifest, preview blob, metadata
GET  /api/beats/:slug                 public
POST /api/beats/:slug/remix           copies manifest into caller's drive, records lineage
POST /api/beats/:slug/like
POST /api/reports
```

Rate limits per user and per IP at the edge; upload size caps (a sound at most 60 s of 44.1 kHz
stereo, a project at most 200 sounds); quotas per plan (free 250 MB, supporter 5 GB).

## 4. Libraries

### 4.1 Samples library

Two sources: a **curated** set we ship (the starter kit and demo break are already synthesised in
code; add a few hundred CC0 one-shots and breaks, hashed and uploaded once with a script), and
**user uploads** published from the machine (`SAVE > SOUND > Device:LIBRARY` asks for title, tags
and license). Browsing happens in LOAD with `Device:LIBRARY`, folders by category (`DRUMS/KICK`,
`BREAKS`, `BASS`, `KEYS`, `FX`, `VOCAL`), a search field, and the existing Load a Sound window to
audition (`PLAY`) and assign to a pad. The web has a matching `/samples/` page for discovery and SEO.

### 4.2 Pad bank (kit) library

A kit is a `.PGM` with sounds: sixteen pads, note parameters, mixer settings. Publishing a program
(`SAVE > PROGRAM > Device:LIBRARY`) uploads it; loading one (`LOAD > Device:LIBRARY > KITS/`)
uses the existing Load Program window, which already handles "with sounds" and DRUM slot choice.
`/kits/` on the web lists them with a pad-grid preview that plays each pad in the browser.

### 4.3 Beats

A beat is a published project revision plus a preview mixdown. See section 5.

## 5. Publishing and remixing

**Publish** (SAVE mode, `PUBLISH` soft key, signed in):

1. Window: `Title:`, `Tags:`, `License:`, `Source: SEQUENCE / SONG`, `Cover: none / pad grid`.
2. The machine bounces the source with `bounce.ts` and encodes a preview (MP3 through a small WASM
   encoder, or Opus via `MediaRecorder` where available) on the client.
3. Uploads any blobs the server lacks, then the manifest and preview. The window shows progress on
   the LCD's meter line and the URL when done, with a `COPY URL` soft key.

**Beat page** (`/beats/<handle>/<slug>`): server-rendered HTML from a Pages Function so it works
without JavaScript and has full Open Graph tags. Player for the preview, title, handle, tags,
license, lineage ("Remix of ... by ..."), play and like counts, and three buttons:

- **OPEN ON THE MACHINE**: loads the project read-only into the visitor's browser machine
  (`/?beat=<slug>`; the loader fetches the manifest and blobs, installs them like `installDemo`),
  so anyone can hear it exactly as made and poke at it. Their own work stays autosaved separately.
- **REMIX**: requires sign-in; copies the manifest into the user's CLOUD drive as a new project with
  `parent_beat_id` set, opens it on the machine. Publishing the remix records lineage and shows up on
  the original's page under "Remixes".
- **DOWNLOAD .CHOPDECK**: if the license allows.

Per-beat OG images are generated by a Pages Function (the OG card from `scripts/og/card.html`
parameterised with title, handle and the pad grid, rendered with `workers-og` or `@vercel/og`
on the edge). `/beats/` is the public feed: new, most played, most remixed, by tag.

**Moderation.** Every beat, kit and sample has a report link; reports go to a table and an email.
A `takedown` flag hides the item and its blob references everywhere; a DMCA address on the site.
Handles are reserved for obvious abuse words and trademarks (including the one we do not use).

## 6. Money and venues

**Now**: a `Buy me a coffee` link. On the panel it belongs in the same silkscreen line as the manual
link (`SUPPORT`), and on the manual and beat pages in the footer. No code beyond a link.

**Supporter tier** (after accounts): Stripe Checkout, a monthly or yearly price, unlocks a larger
cloud quota, longer samples, early features, and a supporter mark on the handle. Never gate the
machine itself; the free tier must stay a complete instrument.

**Desktop**: Tauri 2 wraps the built `dist/` in a native window with the system webview.
It gives file-system access (drag folders in, save to real disk), ASIO/CoreAudio via the webview's
Web Audio, and a 10 MB installer. Same code, one `src-tauri/` folder. Electron would work too and
costs 150 MB and Chromium updates; Tauri is the recommendation.

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
- `/account/` page; `SIGN IN` in the header; ACCOUNT page in OTHER mode.
- Blob upload with client-side hashing and dedupe; `CloudDrive`; `Device:CLOUD` in LOAD and SAVE.
- Autosave sync with revisions; conflict rule; "Cloud used" in ACCOUNT.
- Privacy policy and terms pages; data export (download all as `.CHOPDECK` zips) and account delete.
- Tests: API integration tests with Miniflare; e2e sign-in with a test mailbox; sync round-trip.

### Phase 8: Libraries
- `Device:LIBRARY` in LOAD with folders, search and audition; `Device:LIBRARY` publishing in SAVE.
- Curated CC0 samples ingested by script; license and tag metadata; quotas and size caps.
- `/samples/` and `/kits/` web pages with in-browser preview and OG tags.
- Report links and takedown flag.

### Phase 9: Publish and remix
- `PUBLISH` soft key and window; client-side preview encoding; upload with progress.
- Beat pages with server-rendered HTML, player, lineage, dynamic OG image; `/beats/` feed.
- `OPEN ON THE MACHINE` read-only loading; `REMIX` copy with lineage; likes and play counts.
- Handle pages (`/@handle`) listing a user's beats and kits.

### Phase 10: Support and venues
- `SUPPORT` link (Buy Me a Coffee) on the panel and pages.
- Stripe supporter tier with quota changes and a supporter mark.
- Tauri desktop builds for Windows, macOS and Linux in CI; itch.io page.
- Steamworks integration and a Steam store page once itch.io shows demand.
- Touch layout for phones.

Phases 8 and 9 can swap: if we would rather have beats before libraries, nothing in 9 depends on 8
except the license check, which can start as "your own sounds only".

## 8. Decisions to make now

1. **Handles and privacy.** Public handles from day one (needed for beat URLs), or private accounts
   until publishing? Recommendation: choose a handle at sign-up, nothing is public until you publish.
2. **Preview format.** MP3 via WASM (works everywhere, 300 KB of code) or Opus via MediaRecorder
   (free, not in Safari). Recommendation: MP3.
3. **Default license.** For uploads: CC-BY (credit) or "remix on Chop Deck only". Recommendation:
   default to the Chop Deck remix license; CC options for those who want them.
4. **Free quota.** 250 MB is roughly 25 minutes of stereo 44.1 kHz WAV, plenty for dozens of projects
   under content addressing. Revisit with real numbers.
5. **Repo.** Keep one repo: `functions/` for the API, `src-tauri/` later. Split only if CI time hurts.

## 9. Risks

- **Copyright.** People will upload commercial breaks. Mitigations: license selection, reports,
  takedown flag, DMCA agent, no public library entry without an explicit publish step, and a
  fingerprinting check later if volume justifies it.
- **Cost surprises.** R2 storage is cheap and egress free; D1 reads are the only metered thing that
  scales with traffic. Beat pages are cacheable at the edge; cache them.
- **Auth complexity.** Keep to magic link and two OAuth providers; no passwords, no password resets.
- **Sync bugs.** Local-first with last-writer-wins and kept revisions means nothing is ever lost,
  only possibly duplicated. Surface revisions on the LCD so users can recover on their own.
- **Scope.** Each phase is a shippable product. Do not start phase 9 UI before phase 7 sync is solid;
  remix depends entirely on it.

## 10. First steps

1. Create the D1 database and R2 bucket in the Cloudflare account; add bindings to the Pages project.
2. Scaffold `functions/` with Hono and Better Auth; `GET /api/me` behind a magic link; deploy to a
   preview branch.
3. Add `hashSound()` and the manifest-with-hashes encoder next to `encodeProject`, with unit tests.
4. Write `CloudDrive` against the `Drive` interface with a fake server in tests; add `CLOUD` to the
   `Device:` fields.
5. Wire autosave sync; sign in on two browsers and watch a project follow you.
