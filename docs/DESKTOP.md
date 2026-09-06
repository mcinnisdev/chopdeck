# The desktop app

Chop Deck on the desktop is the website's build in a native window. There is one codebase: the
React app, the screens, the audio engine and the manual are the same files, built once by `npm run
build` into `dist/`, and [Tauri](https://tauri.app) wraps that folder in a window with the
platform's own web view (WebView2 on Windows, WebKit on macOS and Linux). A fix to the machine on
the web is a fix on the desktop the next time a release is cut; nothing is written twice.

What is different from a browser tab, all of it in one file, `src/app/desktop.ts`:

- **Saving** goes through the native save dialog (SAVE mode, Device `DOWNLOAD`) instead of a browser
  download. Files dropped on the window or picked with PICK work as before.
- **Links** to the web (GitHub, support, mcinnis.dev) open in the system browser. The owner's manual
  opens in its own window.
- **No accounts, libraries or beats.** The desktop app runs standalone: it has no site behind it, so
  the machine hides those links, exactly as a fork served from a plain folder does. Projects live in
  the app's own browser storage and in the `.CHOPDECK` files you save.

Everything else is untouched: the desktop code never reaches into the machine.

## Building

Builds happen on GitHub Actions; nothing needs installing locally to ship a release.

```
npm version minor          # or patch; bumps package.json, which the app reads for its version
git push --follow-tags
```

The tag starts `.github/workflows/release.yml`, which builds installers for Windows (`.msi`, `.exe`),
macOS (`.dmg` for Apple silicon and for Intel) and Linux (`.AppImage`, `.deb`, `.rpm`) and attaches
them to a **draft** GitHub Release named after the tag. Open the release, try an installer, then
publish it. The first run of each platform takes ten minutes or so; later runs cache the Rust build.

To build on your own machine instead: install Rust (rustup.rs), the platform prerequisites Tauri
lists (on Windows the Visual Studio C++ build tools and WebView2, which Windows 11 has), then
`npm run desktop` for a live-reloading window against the Vite dev server, or `npm run desktop:build`
for installers under `src-tauri/target/release/bundle/`.

## Platform notes

| | Windows (WebView2) | macOS (WebKit) | Linux (WebKitGTK) |
|---|---|---|---|
| Playing, sequencing, disk | yes | yes | yes |
| Sampling from the microphone | yes, with a permission prompt | yes; `Info.plist` carries the usage text | yes, where PipeWire or PulseAudio is present |
| Web MIDI | yes | no: WebKit has no Web MIDI | no |
| `.CHOPDECK` files open the app | registered by the installer | registered | registered by the `.deb` |

The builds are not code-signed yet. macOS will refuse to open the app until you right-click it and
choose Open once; Windows SmartScreen asks for confirmation. Signing (an Apple Developer ID and a
Windows certificate) is the step to take before listing on itch.io or Steam, and it is only secrets
in the release workflow: Tauri's action supports both.

## Version numbers

`package.json` is the single version. `src-tauri/tauri.conf.json` reads it (`"version":
"../package.json"`), the release tag is derived from it, and `Cargo.toml` carries its own copy only
because Cargo requires one; keep the two in step when bumping.
