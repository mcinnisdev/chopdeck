# Deploying Chop Deck to chopdeck.com

Chop Deck is a static site: `npm run build` produces `dist/` with two pages (`/` the machine, `/manual/`
the owner's manual), a service worker, and a web manifest. There is no server. Everything a visitor makes
stays in their browser. That makes Cloudflare Pages the natural host, and since the domain already lives
on Cloudflare, DNS and certificates are handled for you.

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

4. **Environment variables** (build): add `NODE_VERSION` = `22`. Nothing else is needed; the app has no
   secrets or API keys.
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

## 7. Alternatives, if you ever want them

- **Deploy from GitHub Actions instead of Cloudflare's Git integration**: add a job that runs
  `npm ci && npm run build` and then `npx wrangler pages deploy dist --project-name chopdeck`, with
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets. Useful if you want the
  browser tests to gate production, since Cloudflare's own integration does not wait for Actions.
- **Any static host** (Netlify, GitHub Pages, an S3 bucket behind a CDN) works the same way: build,
  upload `dist/`, serve `/manual/` from `manual/index.html`. Only the `_headers` file is Cloudflare-specific.

## 8. Things that are not there yet

- No analytics or error reporting are wired in. If you want either, Cloudflare Web Analytics is a single
  script tag in `index.html` and respects the no-tracking spirit of the machine.
- No custom 404 page. Pages serves its default; `public/404.html` would replace it.
