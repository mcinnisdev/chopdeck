// Chop Deck desktop. Everything the machine does lives in the web build under ../dist; this shell only
// adds what a browser tab cannot: a native save dialog for SAVE mode, opening links in the system
// browser, and a second window for the owner's manual.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Chop Deck");
}
