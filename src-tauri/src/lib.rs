use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![validate_history_file])
        .run(tauri::generate_context!())
        .expect("error while running QR Code Generator");
}
// Store's initial load falls back to defaults on parse errors. Check the original
// file first so malformed history can never silently become an empty document.
fn check_history_bytes(bytes: &[u8]) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    if value.get("version").and_then(|v| v.as_u64()) != Some(1)
        || !value.get("entries").is_some_and(|v| v.is_array())
    {
        return Err("Invalid or unsupported history document".into());
    }
    Ok(())
}

#[tauri::command]
fn validate_history_file(app: tauri::AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("history.json");
    match std::fs::read(path) {
        Ok(bytes) => check_history_bytes(&bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::check_history_bytes;

    #[test]
    fn rejects_damaged_and_unsupported_history() {
        for bytes in [
            b"not json".as_slice(),
            b"{}",
            b"[]",
            b"{\"version\":2,\"entries\":[]}",
            b"{\"version\":1,\"entries\":null}",
        ] {
            assert!(check_history_bytes(bytes).is_err());
        }
        assert!(check_history_bytes(b"{\"version\":1,\"entries\":[]}").is_ok());
    }
}
