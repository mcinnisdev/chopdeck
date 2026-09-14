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
| Playing, sequencing, disk | yes | yes | yes, with the GStreamer plugins below |
| Sampling from the microphone | yes, with a permission prompt | yes; `Info.plist` carries the usage text | yes, where PipeWire or PulseAudio is present |
| Web MIDI | yes | no: WebKit has no Web MIDI | no |
| `.CHOPDECK` files open the app | registered by the installer | registered | registered by the `.deb` |

**Linux needs GStreamer, and fails silently without it.** WebKitGTK has no audio stack of its own:
Web Audio and `decodeAudioData` both run through GStreamer, so a machine missing the output elements
runs the machine perfectly and plays nothing — no error, no warning, just silence. The element
WebKitGTK reaches for is `autoaudiosink`, which lives in the "good" plugin set, and MP3 and M4A
decoding wants `gst-libav` on top. The installers declare these (`bundle.linux.deb.depends` and
`.rpm.depends`) and the AppImage carries its own copies via `linuxdeploy-plugin-gstreamer`, so this
only bites when running the bare binary from `cargo build`:

```
sudo pacman -S gst-plugins-good gst-libav                              # Arch
sudo apt install gstreamer1.0-plugins-good gstreamer1.0-libav          # Debian / Ubuntu
```

Check with `gst-inspect-1.0 autoaudiosink`. If that says "No such element", the app will be silent.

**And `pulsesink` is silent on Bluetooth.** Having the plugins is not the end of it. WebKit asks
`autoaudiosink` to choose the output element; autoaudiosink prefers `pulsesink`; and pulsesink
talking to PipeWire's PulseAudio compatibility layer plays nothing at all on a Bluetooth sink. The
failure is invisible from inside the page — the stream opens, unmuted, at full volume, the
AudioContext says `running`, `currentTime` advances, and the samples go nowhere. Measured on the
same page with the same packages, same Bluetooth device:

| sink element | peak |
|---|---|
| `autoaudiosink` → `pulsesink` | 0.0000 |
| `pipewiresink` ranked MAX | 0.3349 |

So `src-tauri/src/lib.rs` sets `GST_PLUGIN_FEATURE_RANK=pipewiresink:MAX` before the webview
starts, which makes the sink follow the desktop's default output. Set that variable yourself to
override it. Browsers never use GStreamer, which is why chopdeck.com plays on a machine where the
desktop app is mute — a difference worth remembering before blaming the machine.

One more, not a bug: WebKit reports the AudioContext state as `interrupted` (not a standard state)
whenever the window does not have focus, and freezes `currentTime`. An unfocused window is silent
by design; it resumes on focus.

The builds are not code-signed yet. macOS will refuse to open the app until you right-click it and
choose Open once; Windows SmartScreen asks for confirmation. Signing (an Apple Developer ID and a
Windows certificate) is the step to take before listing on itch.io or Steam, and it is only secrets
in the release workflow: Tauri's action supports both.

## Version numbers

`package.json` is the single version. `src-tauri/tauri.conf.json` reads it (`"version":
"../package.json"`), the release tag is derived from it, and `Cargo.toml` carries its own copy only
because Cargo requires one; keep the two in step when bumping.
