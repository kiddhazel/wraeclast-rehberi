// Ortak yardımcılar: DOM, kalıcı ayarlar, HTTP köprüsü, bildirimler.
window.WR = (() => {
  "use strict";

  const TAURI = window.__TAURI__;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- Kalıcı depolama ----------
  function store(key, defaults) {
    const full = `wraeclast-rehberi:${key}`;
    let data;
    try {
      const raw = localStorage.getItem(full);
      data = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch { data = { ...defaults }; }
    return {
      data,
      save() { try { localStorage.setItem(full, JSON.stringify(data)); } catch { /* yok say */ } },
    };
  }

  const settings = store("settings:v1", {
    league: "",
    autoPriceTab: true,
    pinned: false,
  });

  // ---------- HTTP (Tauri'de Rust üzerinden, önizlemede fetch) ----------
  async function httpGet(url) {
    if (TAURI) return TAURI.core.invoke("http_get", { url });
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }
  async function httpGetJson(url) { return JSON.parse(await httpGet(url)); }
  async function httpPostJson(url, body) {
    const text = TAURI
      ? await TAURI.core.invoke("http_post_json", { url, body: JSON.stringify(body) })
      : await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
          .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });
    return JSON.parse(text);
  }

  // ---------- Lig ----------
  async function getLeague() {
    if (settings.data.league) return settings.data.league;
    try {
      const j = await httpGetJson("https://www.pathofexile.com/api/trade/data/leagues");
      const pc = j.result.filter((l) => l.realm === "pc");
      // İlk softcore, ruthless olmayan geçici lig (yoksa Standard).
      const temp = pc.find((l) => !/standard|hardcore|ruthless|^hc /i.test(l.id));
      settings.data.league = (temp || pc[0] || { id: "Standard" }).id;
      settings.save();
    } catch {
      return "Standard";
    }
    return settings.data.league;
  }
  async function listLeagues() {
    const j = await httpGetJson("https://www.pathofexile.com/api/trade/data/leagues");
    return j.result.filter((l) => l.realm === "pc").map((l) => l.id);
  }

  // ---------- Harici link ----------
  function openUrl(url) {
    const opener = TAURI?.opener;
    if (opener?.openUrl) opener.openUrl(url).catch(() => window.open(url, "_blank"));
    else window.open(url, "_blank", "noopener");
  }
  function link(label, url, cls = "ext-link") {
    const a = el("a", cls, label);
    a.href = url;
    a.onclick = (e) => { e.preventDefault(); openUrl(url); };
    return a;
  }

  // ---------- Bildirim ----------
  function toast(msg, kind = "") {
    let box = document.getElementById("toasts");
    if (!box) { box = el("div", "toasts"); box.id = "toasts"; document.body.appendChild(box); }
    const t = el("div", `toast ${kind}`, msg);
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3000);
  }

  // ---------- Sayı biçimleri ----------
  const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
  function compact(n) {
    if (n == null || isNaN(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e6) return nf.format(n / 1e6) + "M";
    if (a >= 1e4) return nf.format(n / 1e3) + "k";
    return nf.format(n);
  }

  // ---------- Sekmeler ----------
  const tabListeners = [];
  function showTab(name) {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${name}`));
    tabListeners.forEach((f) => f(name));
  }
  function onTab(f) { tabListeners.push(f); }

  function listen(event, cb) {
    if (TAURI) TAURI.event.listen(event, (e) => cb(e.payload));
  }

  return {
    TAURI, el, store, settings, httpGet, httpGetJson, httpPostJson,
    getLeague, listLeagues, openUrl, link, toast, compact, nf, showTab, onTab, listen,
  };
})();
