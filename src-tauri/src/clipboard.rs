//! Pano izleyici: oyunda Ctrl+C ile kopyalanan item metnini yakalar.
//!
//! Oyuna hiçbir tuş gönderilmez; yalnızca panodaki metin okunur ve bir PoE
//! item'ına benziyorsa arayüze `item-copied` olayı gönderilir.

use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL: Duration = Duration::from_millis(350);

/// Metin oyundan kopyalanmış bir item mi? (3.14+ biçimi: "Item Class:" + "Rarity:")
pub fn looks_like_item(text: &str) -> bool {
    let mut lines = text.lines().map(str::trim);
    let first = lines.next().unwrap_or("");
    let second = lines.next().unwrap_or("");
    first.starts_with("Item Class:") && second.starts_with("Rarity:")
}

pub fn start(app: AppHandle) {
    let _ = thread::Builder::new()
        .name("clipboard-watcher".into())
        .spawn(move || {
            let mut clip: Option<arboard::Clipboard> = None;
            // Açılışta panoda duran eski item tetiklemesin.
            let mut last: Option<String> = None;
            loop {
                if clip.is_none() {
                    clip = arboard::Clipboard::new().ok();
                }
                if let Some(c) = clip.as_mut() {
                    // Pano başka program tarafından kilitliyse hata gelir; sonraki turda dene.
                    if let Ok(text) = c.get_text() {
                        let changed = last.as_deref() != Some(text.as_str());
                        if changed {
                            let first_read = last.is_none();
                            last = Some(text.clone());
                            if !first_read && looks_like_item(&text) {
                                let _ = app.emit("item-copied", text);
                            }
                        }
                    } else if last.is_none() {
                        last = Some(String::new());
                    }
                }
                thread::sleep(POLL);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_item_text() {
        let t = "Item Class: Body Armours\r\nRarity: Unique\r\nCloak of Flame\r\nScholar's Robe\r\n--------\r\n";
        assert!(looks_like_item(t));
    }

    #[test]
    fn ignores_other_text() {
        assert!(!looks_like_item("merhaba kanka"));
        assert!(!looks_like_item("Rarity: Unique\nItem Class: x"));
        assert!(!looks_like_item(""));
    }
}
