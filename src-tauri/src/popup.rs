//! Fiyat popup penceresi: oyunda Ctrl+C yapılan item için imlecin yanında
//! açılan küçük, çerçevesiz, her zaman üstte pencere.

use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

const LABEL: &str = "popup";
const WIDTH: f64 = 460.0;
const HEIGHT: f64 = 640.0;

/// Pencere yeni açılıyorsa sayfa yüklenene kadar item metni burada bekler.
#[derive(Default)]
pub struct PendingItem(pub Mutex<Option<String>>);

fn get_or_create(app: &AppHandle) -> Result<(WebviewWindow, bool), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok((w, false));
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("popup.html".into()))
        .title("Fiyat")
        .inner_size(WIDTH, HEIGHT)
        .min_inner_size(360.0, 300.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok((w, true))
}

/// Pencereyi imlecin sağına (sığmazsa soluna) ve ekran içine yerleştirir.
fn place_near_cursor(app: &AppHandle, w: &WebviewWindow) {
    let Ok(cur) = app.cursor_position() else { return };
    let size = w.outer_size().ok();
    let (pw, ph) = size.map(|s| (s.width as f64, s.height as f64)).unwrap_or((WIDTH, HEIGHT));
    let Some(mon) = app.monitor_from_point(cur.x, cur.y).ok().flatten() else {
        let _ = w.set_position(PhysicalPosition::new(cur.x + 24.0, cur.y - ph / 3.0));
        return;
    };
    let (mx, my) = (mon.position().x as f64, mon.position().y as f64);
    let (mw, mh) = (mon.size().width as f64, mon.size().height as f64);
    let mut x = cur.x + 32.0;
    if x + pw > mx + mw {
        x = cur.x - pw - 32.0;
    }
    let y = (cur.y - ph / 3.0).clamp(my, (my + mh - ph).max(my));
    let x = x.clamp(mx, (mx + mw - pw).max(mx));
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

#[tauri::command]
pub async fn show_price_popup(
    app: AppHandle,
    pending: State<'_, PendingItem>,
    text: String,
) -> Result<(), String> {
    let (w, created) = get_or_create(&app)?;
    if created {
        // Sayfa açılınca take_popup_item ile alacak.
        *pending.0.lock().map_err(|e| e.to_string())? = Some(text);
    } else {
        w.emit_to(LABEL, "popup-item", text).map_err(|e| e.to_string())?;
    }
    place_near_cursor(&app, &w);
    w.show().map_err(|e| e.to_string())?;
    let _ = w.unminimize();
    let _ = w.set_focus();
    Ok(())
}

#[tauri::command]
pub fn take_popup_item(pending: State<'_, PendingItem>) -> Option<String> {
    pending.0.lock().ok().and_then(|mut g| g.take())
}
