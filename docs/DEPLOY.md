# Deploying Chop Deck to chopdeck.com

Chop Deck is a static site plus one small API: `npm run build` produces `dist/` with the machine (`/`),
the owner's manual (`/manual/`), the account and legal pages, a service worker and a web manifest;
`functions/` holds the account API that Cloudflare Pages runs at `/api/*` against a D1 database and an
R2 bucket (section 7). Without an account, everything a visitor makes stays in their browser. Cloudflare
Pages is the natural host, and since the domain already lives on Cloudflare, DNS and certificates are
handled for you.

The whole setup is about ten minutes. Steps 1 to 4 are one-time.

## 1. What you need

- The GitHub repository `mcinnisdev/chopdeck` (this repo). Cloudflare deploys from it on every push to `main`.
- A Cloudflare account that owns the `chopdeck.com` zone.
- Node 22 locally only if you want to build by hand (`npm run build`).

## 2. Create the Pages project

1. Cloudflare dashboard, **Workers & Pages**, **Create**, **Pages**, **Connect to Git**.
2. Authorise GitHub if asked and pick `mcinnisdev/chopdeck`.
3. Build settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | Vite (or None) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | leave empty |

4. **Environment variables** (build): add `NODE_VERSION` = `22`. The account secrets come in section 7,
   after the project exists.
5. **Save and Deploy**. The first build takes two or three minutes. You get a `*.pages.dev` URL immediately;
   check the machine loads, hit a pad, open `/manual/`.

The build runs `tsc --noEmit` before Vite, so a type error fails the deploy rather than shipping. Unit and
browser tests run on GitHub Actions (`.github/workflows/ci.yml`) on every push, independently of Cloudflare.

## 3. Attach the domain

1. In the Pages project, **Custom domains**, **Set up a custom domain**, enter `chopdeck.com`.
   Because the zone is on the same account, Cloudflare offers to add the DNS record itself. Accept.
2. Repeat for `www.chopdeck.com`. Then, in the zone's **Rules**, **Redirect Rules**, add a rule that
   redirects `www.chopdeck.com/*` to `https://chopdeck.com/${1}` (301), so there is one canonical address.
   (Cloudflare's "Bulk Redirects" or the single-redirect template "Redirect from WWW to root" both work.)
3. Certificates are issued automatically; the domain is usually live within a few minutes.

Under the zone's **SSL/TLS**, keep encryption mode on **Full (strict)** and switch on **Always Use HTTPS**.
Both Web MIDI and microphone access require a secure origin, so HTTPS is not optional here.

## 4. Caching and headers

`public/_headers` ships with the repo and Cloudflare Pages applies it:

- hashed assets under `/assets/` are cached for a year (Vite renames them on every change);
- `sw.js`, the HTML pages and the manifest are revalidated on every visit so a new deploy reaches
  returning visitors on their next load.

The service worker caches the app shell for offline use. Its cache name is `chopdeck-v1` in
`public/sw.js`; bump it (`chopdeck-v2`) whenever you change something that must invalidate every
visitor's cached shell at once. Ordinary deploys do not need this: the worker refreshes cached files in
the background on each visit.

## 5. Day to day

- **Ship**: merge or push to `main`. Cloudflare builds and publishes; GitHub Actions runs the tests.
- **Preview**: every pull request gets its own `*.pages.dev` preview URL from Cloudflare, posted as a
  check on the PR. Use it to look at a change on a phone before merging.
- **Roll back**: Pages project, **Deployments**, pick an earlier deployment, **Rollback**. Instant.
- **Logs**: the build log is in the deployment's details if a build fails. Nine times out of ten it is
  a type error; run `npm run typecheck` locally.

## 6. Verifying a deployment

After the first production deploy, run through this on `https://chopdeck.com`:

1. The machine boots to `Sq:01-First Beat`; PLAY START (or Space) plays the demo.
2. Pads sound from the mouse and from the keyboard (`Z X C V`).
3. `/manual/` opens and the OWNER'S MANUAL link on the chassis reaches it.
4. SAMPLE mode (`Shift`+4) asks for microphone permission (proves the origin is secure).
5. In Chrome, MIDI/SYNC mode (`Shift`+9), PORTS lists any connected MIDI device.
6. Reload: the sequence and any sounds you added come back (IndexedDB autosave).
7. Chrome's address bar offers **Install** (the PWA manifest is served).
8. A first visit (private window) opens the QUICK START tour; Escape closes it; QUICK START in the
   header reopens it.
9. `https://chopdeck.com/og.png`, `/robots.txt` and `/sitemap.xml` load. Paste the URL into
   [opengraph.xyz](https://www.opengraph.xyz/) or the LinkedIn Post Inspector: title, description and
   the 1200x630 card should appear. Slack and iMessage show the same card.
10. Search Console: add the `chopdeck.com` property (Cloudflare can verify the DNS record for you) and
    submit `https://chopdeck.com/sitemap.xml`.

## 7. Accounts: the API, database, storage and secrets

Accounts run as Cloudflare Pages Functions in `functions/` (code in `server/`), with a D1 database
and an R2 bucket that already exist in the account and are named in `wrangler.toml`:

| Resource | Name | Binding |
|---|---|---|
| D1 database | `chopdeck` (id `e0f0be15-fe22-4b3a-9812-e288e66e1042`) | `DB` |
| R2 bucket | `chopdeck-blobs` | `BLOBS` |

Pages reads the bindings from `wrangler.toml`, so nothing needs adding in the dashboard for them.

### 7.1 One-time setup, after the Pages project exists

1. **Schema.** `npm run db:remote` applies `server/schema.sql` to the production database. It is
   idempotent; run it again after any schema change.
2. **Secrets.** Set these on the Pages project (Settings, Environment variables, Production, encrypted;
   or `npx wrangler pages secret put NAME --project-name chopdeck`):

   | Secret | What |
   |---|---|
   | `BETTER_AUTH_SECRET` | 32+ random characters; `openssl rand -base64 32`. Rotating it signs everyone out. |
   | `RESEND_API_KEY` | From resend.com. Sign-in links go out from `hello@mail.chopdeck.com`, on the verified domain `mail.chopdeck.com`. Replies and the contact address are `hello@chopdeck.com`. |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. Google Cloud console, OAuth client, web application, redirect URI `https://chopdeck.com/api/auth/callback/google`. |
   | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Optional. GitHub, Developer settings, OAuth app, callback `https://chopdeck.com/api/auth/callback/github`. |

   Without the Google or GitHub pair the account page simply does not show that button. Never set
   `DEV_MAGIC_LINKS` in production: it stores sign-in links in the database instead of emailing them.
3. **Redeploy** after setting secrets (Deployments, Retry, or push a commit): Functions read secrets
   at deploy time.

`SITE_URL` in `wrangler.toml` is `https://chopdeck.com`, and sign-in cookies and links are bound to it,
so accounts work on the production domain only. Preview deployments (`*.pages.dev`) serve the machine
and the pages but cannot sign anyone in; that is intended.

### 7.2 Local development

- `cp .dev.vars.example .dev.vars` (already ignored by git). It points `SITE_URL` at the Vite dev
  server and turns on `DEV_MAGIC_LINKS`, so the account page shows the sign-in link instead of emailing it.
- `npm run db:local` creates the local D1 with the schema (state lives in `.wrangler/`, ignored).
- `npm run build` once, so `wrangler pages dev` has a `dist/` to serve, then two terminals:
  `npm run dev:api` (the API on :8788) and `npm run dev` (Vite on :5173, which proxies `/api` to it).
- `npm test` runs the API against an in-process Miniflare D1 and R2; `npm run test:e2e` starts both
  servers itself and signs in, syncs and deletes a throwaway account.

### 7.3 The libraries

Kits (`/kits/`, publishing at `/kits/publish/`) and samples (`/samples/`, `/samples/publish/`) use
the same database and bucket. After any schema change run `npm run db:remote` again. Both tables have
`featured` and `takedown` flags. To feature something at the top of its library:

```
npx wrangler d1 execute chopdeck --remote --command "UPDATE kits SET featured = 1 WHERE slug = 'handle-kit-name'"
npx wrangler d1 execute chopdeck --remote --command "UPDATE samples SET featured = 1 WHERE slug = 'handle-sample-name'"
```

To take something down without deleting it (it disappears from the library and its audio stops being
public), set `takedown = 1` the same way. Samples are at most four minutes; kits at most 64 sounds.

### 7.4 What to check after deploying

1. `https://chopdeck.com/api/health` answers `{"ok":true}`.
2. `/account/`: request a link, receive the email from `hello@mail.chopdeck.com`, land back signed in.
3. Choose a handle; open the machine; the header shows the handle and, a few seconds after a change,
   `SYNCED`. The account page lists the project and its version.
4. A private window: sign in, and the machine boots with the same project.

## 8. Share cards and search

Everything search engines and link previews read is static and lives in the repo:

- `index.html` and `manual/index.html` carry the title, description, canonical URL, Open Graph and
  Twitter card tags, and (on the front page) a `WebApplication` JSON-LD block. Both point at
  `https://chopdeck.com/og.png`; if the domain ever changes, change the URLs there and in
  `public/sitemap.xml` and `public/robots.txt`.
- `public/og.png` (1200x630) and the PNG icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`)
  are rendered from the design system by `npm run assets`, which drives Playwright over
  `scripts/og/card.html`. Edit the card, run the script, commit the images. Social networks cache the
  card by URL for days; after changing it, re-scrape with the inspector above.
- `public/manifest.webmanifest` names the app, its icons and a screenshot for the install prompt.
- `public/404.html` is the not-found page Pages serves for unknown paths.

## 9. Alternatives, if you ever want them

- **Deploy from GitHub Actions instead of Cloudflare's Git integration**: add a job that runs
  `npm ci && npm run build` and then `npx wrangler pages deploy dist --project-name chopdeck`, with
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets. Useful if you want the
  browser tests to gate production, since Cloudflare's own integration does not wait for Actions.
- **Any static host** (Netlify, GitHub Pages, an S3 bucket behind a CDN) works the same way: build,
  upload `dist/`, serve `/manual/` from `manual/index.html`. Only the `_headers` file is Cloudflare-specific.

## 10. Things that are not there yet

- No analytics or error reporting are wired in. If you want either, Cloudflare Web Analytics is a single
  script tag in `index.html` and respects the no-tracking spirit of the machine.
