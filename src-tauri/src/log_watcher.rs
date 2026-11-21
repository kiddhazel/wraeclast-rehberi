//! Path of Exile `Client.txt` log izleyicisi.
//!
//! Oyun her bölge değişiminde ve seviye atlamada log dosyasına satır yazar:
//!   `... [DEBUG Client 1234] Generating level 12 area "1_1_7_1" with seed 1`
//!   `... [INFO Client 1234] : You have entered The Coast.`
//!   `... [INFO Client 1234] : Karakter (Witch) is now level 12`
//! Bu modül dosyanın SONUNU takip eder (dosya yüzlerce MB olabilir) ve
//! yeni satırları ayrıştırıp arayüze `log-event` olarak gönderir.

use regex::Regex;
use serde::Serialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_millis(300);
const RETRY_INTERVAL: Duration = Duration::from_secs(2);
/// Başlangıçta son durumu bulmak için okunan kuyruk boyutu.
const INITIAL_TAIL_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LogEvent {
    /// Bölge oluşturuldu: alan seviyesi ve iç kimlik (örn. "1_1_2" → Act 1).
    AreaGenerated { level: u32, area_id: String },
    /// Oyuncu bir bölgeye girdi (oyundaki İngilizce adıyla).
    ZoneEntered { zone: String },
    /// Karakter seviye atladı.
    LevelUp { character: String, class: String, level: u32 },
}

#[derive(Debug, Clone, Serialize)]
pub struct LogPayload {
    #[serde(flatten)]
    pub event: LogEvent,
    /// true ise olay, izleme başlarken eski loglardan okunmuş "son durum"dur.
    pub initial: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatusPayload {
    pub connected: bool,
    pub message: String,
}

pub struct Parser {
    area: Regex,
    zone: Regex,
    level: Regex,
}

impl Parser {
    pub fn new() -> Self {
        Self {
            area: Regex::new(r#"Generating level (\d+) area "([^"]+)""#).unwrap(),
            zone: Regex::new(r"\] : You have entered (.+?)\.?\s*$").unwrap(),
            level: Regex::new(r"\] : (.+?) \(([^)]+)\) is now level (\d+)").unwrap(),
        }
    }

    pub fn parse_line(&self, line: &str) -> Option<LogEvent> {
        let line = line.trim_end();
        if let Some(c) = self.area.captures(line) {
            return Some(LogEvent::AreaGenerated {
                level: c[1].parse().ok()?,
                area_id: c[2].to_string(),
            });
        }
        if let Some(c) = self.zone.captures(line) {
            return Some(LogEvent::ZoneEntered { zone: c[1].to_string() });
        }
        if let Some(c) = self.level.captures(line) {
            return Some(LogEvent::LevelUp {
                character: c[1].to_string(),
                class: c[2].to_string(),
                level: c[3].parse().ok()?,
            });
        }
        None
    }
}

pub struct WatcherHandle {
    stop: Arc<AtomicBool>,
}

impl WatcherHandle {
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

/// Windows kayıt defterinden bir metin değeri okur (64-bit ve 32-bit görünümler).
#[cfg(windows)]
fn reg_string(root: winreg::HKEY, path: &str, name: &str) -> Option<String> {
    use winreg::enums::{KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
    let key = winreg::RegKey::predef(root);
    for flag in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
        if let Ok(k) = key.open_subkey_with_flags(path, KEY_READ | flag) {
            if let Ok(v) = k.get_value::<String, _>(name) {
                if !v.trim().is_empty() {
                    return Some(v);
                }
            }
        }
    }
    None
}

/// Oyunun kurulu olabileceği klasörler (kayıt defteri + Steam kütüphaneleri + varsayılanlar).
fn install_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = vec![
        r"C:\Program Files (x86)\Grinding Gear Games\Path of Exile".into(),
        r"C:\Program Files\Grinding Gear Games\Path of Exile".into(),
    ];
    let mut steam_roots: Vec<PathBuf> = vec![
        r"C:\Program Files (x86)\Steam".into(),
        r"C:\Program Files\Steam".into(),
    ];

    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        // Steam kurulumu (uygulama 238960 = Path of Exile)
        let steam_app = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 238960";
        if let Some(p) = reg_string(HKEY_LOCAL_MACHINE, steam_app, "InstallLocation") {
            dirs.insert(0, p.into());
        }
        // Standalone (GGG istemcisi)
        if let Some(p) = reg_string(HKEY_CURRENT_USER, r"Software\GrindingGearGames\Path of Exile", "InstallLocation") {
            dirs.insert(0, p.into());
        }
        // Steam'in kendisi başka sürücüde olabilir
        if let Some(p) = reg_string(HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath") {
            steam_roots.insert(0, p.replace('/', r"\").into());
        }
        if let Some(p) = reg_string(HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath") {
            steam_roots.insert(0, p.into());
        }
    }

    let re = Regex::new(r#""path"\s+"([^"]+)""#).unwrap();
    for root in steam_roots {
        let mut libs = vec![root.clone()];
        if let Ok(text) = std::fs::read_to_string(root.join(r"steamapps\libraryfolders.vdf")) {
            for c in re.captures_iter(&text) {
                libs.push(PathBuf::from(c[1].replace(r"\\", r"\")));
            }
        }
        for lib in libs {
            dirs.push(lib.join(r"steamapps\common\Path of Exile"));
        }
    }
    dirs
}

/// Bulunan tüm Client.txt dosyalarından EN SON güncelleneni seçer
/// (eski bir kurulumda kalmış log yerine gerçekten oynanan oyunu bulmak için).
pub fn detect_default_path() -> Option<PathBuf> {
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for dir in install_dirs() {
        let f = dir.join(r"logs\Client.txt");
        let Ok(meta) = std::fs::metadata(&f) else { continue };
        let modified = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
        if best.as_ref().map_or(true, |(t, _)| modified > *t) {
            best = Some((modified, f));
        }
    }
    best.map(|(_, p)| p)
}

/// İzleyici iş parçacığını başlatır.
pub fn start(app: AppHandle, path: PathBuf) -> Result<WatcherHandle, String> {
    if path.as_os_str().is_empty() {
        return Err("Log dosyası yolu boş".into());
    }
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = stop.clone();
    thread::Builder::new()
        .name("client-log-watcher".into())
        .spawn(move || watch_loop(app, path, stop_flag))
        .map_err(|e| e.to_string())?;
    Ok(WatcherHandle { stop })
}

fn emit_status(app: &AppHandle, connected: bool, message: impl Into<String>) {
    let _ = app.emit(
        "watcher-status",
        StatusPayload { connected, message: message.into() },
    );
}

fn emit_event(app: &AppHandle, event: LogEvent, initial: bool) {
    let _ = app.emit("log-event", LogPayload { event, initial });
}

fn watch_loop(app: AppHandle, path: PathBuf, stop: Arc<AtomicBool>) {
    let parser = Parser::new();

    // Dosya açılana kadar dene (oyun henüz kurulmamış/çalışmıyor olabilir).
    let mut file = loop {
        if stop.load(Ordering::Relaxed) {
            return;
        }
        match File::open(&path) {
            Ok(f) => break f,
            Err(e) => {
                emit_status(&app, false, format!("Log açılamadı: {e}"));
                thread::sleep(RETRY_INTERVAL);
            }
        }
    };

    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    send_initial_state(&app, &parser, &mut file, len);
    let mut pos = len;
    let mut pending = String::new();
    emit_status(&app, true, "Log izleniyor");

    while !stop.load(Ordering::Relaxed) {
        thread::sleep(POLL_INTERVAL);
        let len = match file.metadata() {
            Ok(m) => m.len(),
            Err(e) => {
                emit_status(&app, false, format!("Log okunamıyor: {e}"));
                continue;
            }
        };
        if len < pos {
            // Dosya kesildi/yeniden oluşturuldu: baştan oku.
            pos = 0;
            pending.clear();
        }
        if len == pos {
            continue;
        }
        let mut buf = Vec::with_capacity((len - pos) as usize);
        if file.seek(SeekFrom::Start(pos)).is_err()
            || (&mut file).take(len - pos).read_to_end(&mut buf).is_err()
        {
            continue;
        }
        pos += buf.len() as u64;
        pending.push_str(&String::from_utf8_lossy(&buf));

        // Yalnızca tamamlanmış satırları işle; yarım kalan satır bir sonraki tura.
        if let Some(last_nl) = pending.rfind('\n') {
            let complete: String = pending.drain(..=last_nl).collect();
            for line in complete.lines() {
                if let Some(ev) = parser.parse_line(line) {
                    emit_event(&app, ev, false);
                }
            }
        }
    }
}

/// Dosyanın son kısmını okuyup en son bölge/seviye bilgisini gönderir,
/// böylece rehber açılır açılmaz doğru yerde başlar.
fn send_initial_state(app: &AppHandle, parser: &Parser, file: &mut File, len: u64) {
    let start = len.saturating_sub(INITIAL_TAIL_BYTES);
    let mut buf = Vec::new();
    if file.seek(SeekFrom::Start(start)).is_err()
        || file.take(len - start).read_to_end(&mut buf).is_err()
    {
        return;
    }
    let text = String::from_utf8_lossy(&buf);
    for ev in last_state(parser, &text) {
        emit_event(app, ev, true);
    }
}

/// Metindeki son AreaGenerated, ZoneEntered ve LevelUp olaylarını sırasıyla döndürür.
pub fn last_state(parser: &Parser, text: &str) -> Vec<LogEvent> {
    let (mut area, mut zone, mut level) = (None, None, None);
    for line in text.lines() {
        match parser.parse_line(line) {
            Some(ev @ LogEvent::AreaGenerated { .. }) => area = Some(ev),
            Some(ev @ LogEvent::ZoneEntered { .. }) => zone = Some(ev),
            Some(ev @ LogEvent::LevelUp { .. }) => level = Some(ev),
            None => {}
        }
    }
    [level, area, zone].into_iter().flatten().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_area_generation() {
        let p = Parser::new();
        let line = r#"2025/06/01 12:00:00 123456 abc [DEBUG Client 4321] Generating level 13 area "1_1_9" with seed 2914"#;
        assert_eq!(
            p.parse_line(line),
            Some(LogEvent::AreaGenerated { level: 13, area_id: "1_1_9".into() })
        );
    }

    #[test]
    fn parses_zone_entered() {
        let p = Parser::new();
        let line = "2025/06/01 12:00:01 123457 abc [INFO Client 4321] : You have entered The Coast.";
        assert_eq!(
            p.parse_line(line),
            Some(LogEvent::ZoneEntered { zone: "The Coast".into() })
        );
        let line = "2025/06/01 12:00:01 123457 abc [INFO Client 4321] : You have entered Lioneye's Watch.\r";
        assert_eq!(
            p.parse_line(line),
            Some(LogEvent::ZoneEntered { zone: "Lioneye's Watch".into() })
        );
    }

    #[test]
    fn parses_level_up() {
        let p = Parser::new();
        let line = "2025/06/01 12:05:00 123999 abc [INFO Client 4321] : Exile_Kanka (Ranger) is now level 7";
        assert_eq!(
            p.parse_line(line),
            Some(LogEvent::LevelUp {
                character: "Exile_Kanka".into(),
                class: "Ranger".into(),
                level: 7
            })
        );
    }

    #[test]
    fn ignores_chat_and_noise() {
        let p = Parser::new();
        assert_eq!(p.parse_line("2025/06/01 12:00:00 1 abc [INFO Client 1] @From Someone: hi"), None);
        assert_eq!(p.parse_line(""), None);
    }

    #[test]
    fn last_state_keeps_latest_of_each() {
        let p = Parser::new();
        let text = "\
x [INFO Client 1] : A (Witch) is now level 2
x [DEBUG Client 1] Generating level 2 area \"1_1_2\" with seed 1
x [INFO Client 1] : You have entered The Coast.
x [DEBUG Client 1] Generating level 3 area \"1_1_3\" with seed 1
x [INFO Client 1] : You have entered The Mud Flats.
x [INFO Client 1] : A (Witch) is now level 4
";
        let st = last_state(&p, text);
        assert_eq!(st.len(), 3);
        assert!(matches!(&st[0], LogEvent::LevelUp { level: 4, .. }));
        assert!(matches!(&st[1], LogEvent::AreaGenerated { level: 3, .. }));
        assert!(matches!(&st[2], LogEvent::ZoneEntered { zone } if zone == "The Mud Flats"));
    }
}
