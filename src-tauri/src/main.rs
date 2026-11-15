#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    qrcode_generator_lib::run();
}
