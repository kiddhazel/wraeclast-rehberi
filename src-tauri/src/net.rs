//! Arayüz için HTTP köprüsü.
//!
//! WebView'den doğrudan istek atmak CORS'a takılır; istekler burada yapılır.
//! Güvenlik için yalnızca bilinen PoE sitelerine HTTPS isteğine izin verilir.

use std::sync::OnceLock;
use std::time::Duration;

const ALLOWED_HOSTS: &[&str] = &[
    "poe.ninja",
    "www.pathofexile.com",
    "pathofexile.com",
    "pobb.in",
    "pastebin.com",
];

const USER_AGENT: &str = "wraeclast-rehberi/0.1 (kisisel PoE yardimci araci)";

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(20))
            .build()
            .expect("HTTP istemcisi oluşturulamadı")
    })
}

/// GitHub'da yalnızca GGG'nin resmi pasif ağaç verisine izin verilir.
const GITHUB_RAW_PREFIX: &str = "/grindinggear/skilltree-export/";

pub fn check_url(url: &str) -> Result<reqwest::Url, String> {
    let u = reqwest::Url::parse(url).map_err(|e| format!("Geçersiz adres: {e}"))?;
    if u.scheme() != "https" {
        return Err("Yalnızca https adreslerine izin var".into());
    }
    match u.host_str() {
        Some(h) if ALLOWED_HOSTS.contains(&h) => Ok(u),
        Some("raw.githubusercontent.com") if u.path().starts_with(GITHUB_RAW_PREFIX) => Ok(u),
        Some(h) => Err(format!("İzin verilmeyen site: {h}")),
        None => Err("Adreste site yok".into()),
    }
}

fn cache_file(app: &tauri::AppHandle, url: &str) -> Option<std::path::PathBuf> {
    use std::hash::{Hash, Hasher};
    use tauri::Manager;
    let mut h = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut h);
    let dir = app.path().app_cache_dir().ok()?.join("http");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(format!("{:016x}.cache", h.finish())))
}

/// Büyük ve seyrek değişen veriler (pasif ağaç, trade stat listesi) için
/// diske önbellekli GET. `max_age_secs` geçmemişse ağa hiç gidilmez;
/// ağ hatasında eski kopya varsa o döndürülür.
#[tauri::command]
pub async fn http_get_cached(app: tauri::AppHandle, url: String, max_age_secs: u64) -> Result<String, String> {
    let file = cache_file(&app, &url);
    if let Some(f) = &file {
        if let Ok(meta) = std::fs::metadata(f) {
            let age = meta.modified().ok().and_then(|m| m.elapsed().ok()).map(|d| d.as_secs());
            if age.is_some_and(|a| a < max_age_secs) {
                if let Ok(text) = std::fs::read_to_string(f) {
                    return Ok(text);
                }
            }
        }
    }
    match http_get(url).await {
        Ok(text) => {
            if let Some(f) = &file {
                let _ = std::fs::write(f, &text);
            }
            Ok(text)
        }
        Err(e) => file
            .and_then(|f| std::fs::read_to_string(f).ok())
            .ok_or(e),
    }
}

async fn finish(resp: reqwest::Response) -> Result<String, String> {
    let status = resp.status();
    if status.as_u16() == 429 {
        let wait = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("?")
            .to_string();
        return Err(format!("Trade API hız sınırı — {wait} sn sonra tekrar dene"));
    }
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("HTTP {}: {}", status.as_u16(), snippet));
    }
    Ok(body)
}

#[tauri::command]
pub async fn http_get(url: String) -> Result<String, String> {
    let u = check_url(&url)?;
    let resp = client().get(u).send().await.map_err(|e| e.to_string())?;
    finish(resp).await
}

#[tauri::command]
pub async fn http_post_json(url: String, body: String) -> Result<String, String> {
    let u = check_url(&url)?;
    let resp = client()
        .post(u)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    finish(resp).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_known_https_hosts() {
        assert!(check_url("https://poe.ninja/poe1/api/x").is_ok());
        assert!(check_url("https://www.pathofexile.com/api/trade/data/leagues").is_ok());
        assert!(check_url("https://pobb.in/abc/raw").is_ok());
    }

    #[test]
    fn rejects_other_hosts_and_http() {
        assert!(check_url("http://poe.ninja/").is_err());
        assert!(check_url("https://evil.example.com/").is_err());
        assert!(check_url("https://poe.ninja.evil.com/").is_err());
        assert!(check_url("file:///C:/x").is_err());
    }

    #[test]
    fn github_only_for_tree_export() {
        assert!(check_url("https://raw.githubusercontent.com/grindinggear/skilltree-export/master/data.json").is_ok());
        assert!(check_url("https://raw.githubusercontent.com/someone/else/main/x.json").is_err());
    }
}
