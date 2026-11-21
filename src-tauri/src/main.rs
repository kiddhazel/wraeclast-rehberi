// Release derlemesinde arkada konsol penceresi açılmasın.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod log_watcher;
mod net;
mod popup;

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// Aktif log izleyicisi (aynı anda en fazla bir tane).
struct WatcherState(Mutex<Option<log_watcher::WatcherHandle>>);

/// Bilinen kurulum konumlarında Client.txt arar.
#[tauri::command]
fn detect_log_path() -> Option<String> {
    log_watcher::detect_default_path().map(|p| p.to_string_lossy().into_owned())
}

/// Verilen Client.txt dosyasını izlemeye başlar (öncekini durdurur).
#[tauri::command]
fn start_watching(app: AppHandle, state: State<WatcherState>, path: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = guard.take() {
        old.stop();
    }
    *guard = Some(log_watcher::start(app, path.into())?);
    Ok(())
}

#[tauri::command]
fn stop_watching(state: State<WatcherState>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(h) = guard.take() {
            h.stop();
        }
    }
}

fn main() {
    tauri::Builder::default()
        // Build rehberindeki linkleri sistem tarayıcısında açmak için.
        .plugin(tauri_plugin_opener::init())
        // Client.txt'yi elle seçmek için dosya penceresi.
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState(Mutex::new(None)))
        .manage(popup::PendingItem::default())
        .setup(|app| {
            // Fiyat sorgusu için: oyunda Ctrl+C ile kopyalanan item'ları yakala.
            clipboard::start(app.app_handle().clone());
            Ok(())
        })
        // Ana pencere kapanınca gizli popup yüzünden uygulama açık kalmasın.
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            detect_log_path,
            start_watching,
            stop_watching,
            net::http_get,
            net::http_get_cached,
            net::http_post_json,
            popup::show_price_popup,
            popup::take_popup_item
        ])
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılamadı");
}
