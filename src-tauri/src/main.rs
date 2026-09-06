// The desktop app: a native window around the same build the website serves. No console window on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    chopdeck_lib::run()
}
