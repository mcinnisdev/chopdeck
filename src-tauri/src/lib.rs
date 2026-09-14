// Chop Deck desktop. Everything the machine does lives in the web build under ../dist; this shell only
// adds what a browser tab cannot: a native save dialog for SAVE mode, opening links in the system
// browser, a second window for the owner's manual, and on Linux one nudge to GStreamer so the machine
// is audible.

/// WebKitGTK has no audio stack of its own: Web Audio leaves through GStreamer, and WebKit asks
/// `autoaudiosink` to choose the output element. autoaudiosink prefers `pulsesink`, and pulsesink
/// talking to PipeWire's PulseAudio compatibility layer is **silent on Bluetooth outputs** -- the
/// stream opens, unmuted, at full volume, the AudioContext reports "running", and not one sample
/// arrives. Measured on one machine, same page, same packages, same Bluetooth sink:
///
/// | sink element              | peak   |
/// |---------------------------|--------|
/// | autoaudiosink -> pulsesink| 0.0000 |
/// | pipewiresink ranked MAX   | 0.3349 |
///
/// Ranking the native `pipewiresink` top fixes it and costs nothing on wired outputs, where
/// pulsesink happened to work anyway. Browsers are unaffected because they never use GStreamer,
/// which is why chopdeck.com plays on a machine where this app did not.
///
/// An existing `GST_PLUGIN_FEATURE_RANK` is respected: we append rather than replace, and do
/// nothing at all if the user has already said something about pipewiresink. This must run before
/// the webview starts, because GStreamer reads the variable when it builds its registry.
#[cfg(target_os = "linux")]
fn prefer_pipewire_audio_sink() {
    const KEY: &str = "GST_PLUGIN_FEATURE_RANK";
    let existing = std::env::var(KEY).unwrap_or_default();
    if existing.contains("pipewiresink") {
        return;
    }
    let next = if existing.is_empty() {
        "pipewiresink:MAX".to_owned()
    } else {
        format!("{existing},pipewiresink:MAX")
    };
    std::env::set_var(KEY, next);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    prefer_pipewire_audio_sink();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Chop Deck");
}
