// Wraeclast Rehberi — arayüz mantığı
// Tauri içinde çalışırken Rust tarafından gelen log olaylarını dinler;
// normal tarayıcıda açılırsa "önizleme modu"nda manuel çalışır.
(() => {
  "use strict";

  const ACTS = window.ACTS;
  const TAURI = window.__TAURI__;
  const STORE_KEY = "wraeclast-rehberi:v1";

  const TAG_LABELS = {
    pasif: "+Pasif", respec: "Respec", trial: "Trial", lab: "Labirent",
    gem: "Gem", boss: "Boss", wp: "Waypoint", ops: "Opsiyonel",
    uyari: "Dikkat", item: "Item",
  };
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const TOTAL_PTS = ACTS.reduce((s, a) => s + a.steps.reduce((t, st) => t + (st.pts || 0), 0), 0);
  const TOTAL_TRIALS = ACTS.reduce((s, a) => s + a.steps.filter((st) => st.tags.includes("trial")).length, 0);

  // ---------- Durum ----------
  const defaults = {
    act: 0,            // 0 tabanlı act indeksi
    step: 0,           // act içindeki adım indeksi
    done: {},          // "a-i": true
    logPath: "",
    auto: true,
    hideDone: false,
    char: null,        // { name, cls, level }
  };
  let state = load();
  let areaLevel = null;  // son oluşturulan bölgenin seviyesi
  let actHint = null;    // log'daki area id'den çıkarılan act (0 tabanlı)
  let activeTab = "campaign";

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch { return { ...defaults }; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* yok say */ }
  }

  const key = (a, i) => `${a}-${i}`;
  const isDone = (a, i) => !!state.done[key(a, i)];
  const setDone = (a, i, v) => { if (v) state.done[key(a, i)] = true; else delete state.done[key(a, i)]; };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function chips(tags, pts) {
    const wrap = el("div", "chips");
    for (const t of tags) {
      let label = TAG_LABELS[t] || t;
      if (t === "pasif" && pts) label = `+${pts} Pasif`;
      wrap.appendChild(el("span", `chip ${t}`, label));
    }
    return wrap;
  }

  // ---------- Çizim ----------
  function render() {
    renderActStrip();
    renderHero();
    renderSummary();
    renderSteps();
    renderTotals();
    renderChar();
    renderStrip();
  }

  // Diğer sekmelerde altta görünen "şu anki adım" şeridi
  function renderStrip() {
    const a = ACTS[state.act];
    const s = a.steps[state.step];
    const strip = $("step-strip");
    strip.replaceChildren();
    const z = el("b", null, s.z);
    z.lang = "en";
    strip.append(el("span", "ss-act", `Act ${a.act}`), z, el("span", "ss-text", s.t));
  }

  function renderActStrip() {
    const strip = $("act-strip");
    strip.replaceChildren();
    ACTS.forEach((a, ai) => {
      const total = a.steps.filter((s) => !s.tags.includes("ops")).length;
      const done = a.steps.filter((s, i) => !s.tags.includes("ops") && isDone(ai, i)).length;
      const b = el("button", "act-btn", ROMAN[ai]);
      b.title = `Act ${a.act} — ${done}/${total}`;
      if (ai === state.act) b.classList.add("active");
      if (done === total) b.classList.add("complete");
      const bar = el("span", "bar");
      bar.style.width = `${(done / total) * 100}%`;
      b.appendChild(bar);
      b.onclick = () => { goTo(ai, firstOpenStep(ai)); };
      strip.appendChild(b);
    });
  }

  function renderHero() {
    const a = ACTS[state.act];
    const s = a.steps[state.step];
    $("hero-act").textContent = `Act ${a.act} · ${a.town}`;
    $("hero-act").lang = "en";
    $("hero-count").textContent = `Adım ${state.step + 1}/${a.steps.length}`;
    $("hero-zone").textContent = s.z;
    $("hero-text").textContent = s.t;
    $("hero-chips").replaceChildren(...chips(s.tags, s.pts).childNodes);

    const next = nextPos(state.act, state.step);
    const nx = $("hero-next");
    nx.replaceChildren();
    if (next) {
      const ns = ACTS[next.a].steps[next.i];
      nx.append("Sonraki: ", el("b", null, ns.z), next.a !== state.act ? ` (Act ${ACTS[next.a].act})` : "");
    } else {
      nx.textContent = "Kampanyanın sonu — tebrikler, exile!";
    }
    $("btn-done").textContent = isDone(state.act, state.step) ? "İleri ›" : "Tamamlandı ›";
  }

  function renderSummary() {
    const a = ACTS[state.act];
    const pts = a.steps.reduce((t, s) => t + (s.pts || 0), 0);
    const trials = a.steps.filter((s) => s.tags.includes("trial")).length;
    const respec = a.steps.filter((s) => s.tags.includes("respec")).length;
    const box = $("act-summary");
    box.replaceChildren(el("h3", null, `Act ${a.act}`));
    const add = (label, val) => {
      const span = el("span");
      span.append(`${label} `, el("strong", null, String(val)));
      box.appendChild(span);
    };
    add("Pasif:", `+${pts}`);
    if (trials) add("Trial:", trials);
    if (respec) add("Respec ödülü:", respec);
    add("Act sonu ~Lv", a.endLevel);
  }

  function renderSteps() {
    const list = $("steps");
    list.classList.toggle("hide-done", state.hideDone);
    list.replaceChildren();
    const a = ACTS[state.act];
    a.steps.forEach((s, i) => {
      const li = el("li", "step");
      if (i === state.step) li.classList.add("current");
      if (isDone(state.act, i)) li.classList.add("done");
      if (s.tags.includes("ops")) li.classList.add("optional");

      const tick = el("button", "tick");
      tick.setAttribute("aria-label", "Tamamlandı olarak işaretle");
      tick.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
      tick.onclick = (e) => {
        e.stopPropagation();
        setDone(state.act, i, !isDone(state.act, i));
        save(); render();
      };

      const body = el("div");
      const zoneEl = el("div", "step-zone", s.z);
      zoneEl.lang = "en"; // Türkçe büyük harf kuralı "Twİlight" yapmasın
      body.append(zoneEl, el("div", "step-text", s.t));
      if (s.tags.length) body.appendChild(chips(s.tags, s.pts));

      li.append(tick, body);
      li.onclick = () => goTo(state.act, i);
      list.appendChild(li);
    });
    const cur = list.querySelector(".step.current");
    if (cur) cur.scrollIntoView({ block: "nearest" });
  }

  function renderTotals() {
    let pts = 0, trials = 0;
    ACTS.forEach((a, ai) => a.steps.forEach((s, i) => {
      if (!isDone(ai, i)) return;
      pts += s.pts || 0;
      if (s.tags.includes("trial")) trials++;
    }));
    const t = $("totals");
    t.replaceChildren();
    const item = (label, val, cls) => {
      const s = el("span", cls);
      s.append(`${label} `, el("b", null, val));
      t.appendChild(s);
    };
    item("Pasif puan:", `${pts}/${TOTAL_PTS}`);
    item("Labirent trial:", `${trials}/${TOTAL_TRIALS}`, "lab");
  }

  function renderChar() {
    const c = state.char;
    $("char-info").textContent = c ? `${c.name} · ${c.cls} · Lv ${c.level}` : "—";
    $("area-info").textContent = areaLevel != null ? `Lv ${areaLevel}` : "—";

    // PoE 1 XP cezası: güvenli aralık = 3 + floor(seviye / 16)
    const hint = $("xp-hint");
    hint.className = "xp-hint";
    hint.textContent = "";
    if (!c || areaLevel == null) return;
    const safe = 3 + Math.floor(c.level / 16);
    const diff = c.level - areaLevel;
    if (diff < -safe) { hint.textContent = "Bölge senden güçlü — dikkat"; hint.classList.add("warn"); }
    else if (diff > safe) { hint.textContent = "Seviyen yüksek — XP cezası"; hint.classList.add("slow"); }
    else { hint.textContent = "XP aralığı iyi"; hint.classList.add("good"); }
  }

  // ---------- Gezinme ----------
  function nextPos(a, i) {
    if (i + 1 < ACTS[a].steps.length) return { a, i: i + 1 };
    if (a + 1 < ACTS.length) return { a: a + 1, i: 0 };
    return null;
  }
  function prevPos(a, i) {
    if (i > 0) return { a, i: i - 1 };
    if (a > 0) return { a: a - 1, i: ACTS[a - 1].steps.length - 1 };
    return null;
  }
  function firstOpenStep(a) {
    const idx = ACTS[a].steps.findIndex((s, i) => !isDone(a, i) && !s.tags.includes("ops"));
    return idx === -1 ? 0 : idx;
  }
  function goTo(a, i) {
    state.act = a; state.step = i;
    save(); render();
  }
  function completeAndAdvance() {
    setDone(state.act, state.step, true);
    const n = nextPos(state.act, state.step);
    if (n) { state.act = n.a; state.step = n.i; }
    save(); render();
  }
  function back() {
    const p = prevPos(state.act, state.step);
    if (p) goTo(p.a, p.i);
  }

  // ---------- Log olayları ----------
  // Area id biçimi: "1_1_2" → bölüm_act_bölge. Act 6–10 için "2_6_1" gibi.
  function actFromAreaId(id) {
    const m = /^\d+_(\d+)_/.exec(id);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 10 ? n - 1 : null;
  }

  const norm = (s) => s.toLowerCase().replace(/^the /, "").trim();
  const isTownOrHideout = (zone, a) =>
    /hideout/i.test(zone) || ACTS.some((x) => norm(x.town) === norm(zone)) || (a != null && norm(ACTS[a].town) === norm(zone));
  let lastZone = null;   // bir önceki bölge (adımı "bitirip çıktın mı" kontrolü için)

  // Bir bölgeden başka bir (kasaba/hideout olmayan) bölgeye geçildiyse,
  // o bölgeye ait şu anki adım ve isteğe bağlı adımlar tamamlanmış sayılır.
  // Kasaba adımı da kasabadan çıkınca tamamlanır.
  function tickLeftZone(prev, next) {
    if (!prev || norm(prev) === norm(next)) return;
    const a = state.act;
    const steps = ACTS[a].steps;
    const cur = steps[state.step];
    const leavingTown = norm(prev) === norm(ACTS[a].town);
    if (!leavingTown && isTownOrHideout(next, a)) return; // kasabaya uğramak = bitirmek değil
    if (cur && norm(cur.z) === norm(prev)) setDone(a, state.step, true);
    steps.forEach((s, i) => {
      if (s.tags.includes("ops") && norm(s.z) === norm(prev) && i >= state.step - 1) setDone(a, i, true);
    });
  }

  function onZoneEntered(zone, initial = false) {
    if (!state.auto) return;
    if (!initial) tickLeftZone(lastZone, zone);
    lastZone = zone;
    const target = norm(zone);
    const matches = (a) => ACTS[a].steps
      .map((s, i) => (norm(s.z) === target ? i : -1))
      .filter((i) => i !== -1);

    // Önce log'un söylediği act'e, yoksa şu anki act'e bak.
    const searchActs = [];
    if (actHint != null) searchActs.push(actHint);
    else {
      searchActs.push(state.act);
      if (state.act + 1 < ACTS.length) searchActs.push(state.act + 1);
    }

    for (const a of searchActs) {
      if (a < state.act) return; // geri sarma yok (eski act'e gidip gelmek ilerlemeyi bozmasın)
      const hits = matches(a);
      if (!hits.length) continue;
      let target;
      if (a === state.act) {
        // Aynı act'te yalnızca ileri git (kasabaya dönüş rehberi geri sarmasın).
        // Kasaba sık ziyaret edilir: kasaba adımına ancak arada bitmemiş
        // zorunlu adım kalmadıysa geç.
        const isTown = (i) => ACTS[a].steps[i].z === ACTS[a].town;
        const clearUntil = (i) => {
          for (let k = state.step + 1; k < i; k++) {
            if (!isDone(a, k) && !ACTS[a].steps[k].tags.includes("ops")) return false;
          }
          return true;
        };
        target = hits.find((i) => i > state.step && (!isTown(i) || clearUntil(i)));
        if (target == null) { save(); render(); return; }
      } else {
        target = hits.find((i) => !isDone(a, i)) ?? hits[0];
      }
      advanceTo(a, target);
      return;
    }
    save(); render();
  }

  // Aradaki (zorunlu) adımları tamamlanmış say ve hedefe git.
  // Birkaç act birden atlanırsa (ör. rehberi Act 6'da ilk kez açtın) aradaki
  // act'lerin hepsi işaretlenir.
  function advanceTo(a, i) {
    const tickRange = (act, from, to) => {
      for (let k = from; k < to; k++) {
        if (!ACTS[act].steps[k].tags.includes("ops")) setDone(act, k, true);
      }
    };
    if (a === state.act) {
      tickRange(a, state.step, i);
    } else if (a > state.act) {
      tickRange(state.act, state.step, ACTS[state.act].steps.length);
      for (let m = state.act + 1; m < a; m++) tickRange(m, 0, ACTS[m].steps.length);
      tickRange(a, 0, i);
    }
    state.act = a; state.step = i;
    save(); render();
  }

  function handleLogEvent(p) {
    switch (p.kind) {
      case "area_generated":
        areaLevel = p.level;
        actHint = actFromAreaId(p.area_id);
        renderChar();
        break;
      case "zone_entered":
        // Açılışta log'daki son bölgeye "yetiş": yalnızca ileri gider, geri sarmaz.
        onZoneEntered(p.zone, !!p.initial);
        break;
      case "level_up":
        state.char = { name: p.character, cls: p.class, level: p.level };
        save(); renderChar();
        break;
    }
  }

  // ---------- Durum göstergesi ----------
  function setStatus(kind, text) {
    const s = $("status");
    s.className = `status ${kind}`;
    s.querySelector("span").textContent = text;
  }

  // ---------- Tauri bağlantısı ----------
  async function connect(path) {
    const msg = $("settings-msg");
    if (!TAURI) return;
    if (!path) {
      setStatus("err", "Log yolu yok");
      msg.className = "hint err";
      msg.textContent = "Client.txt yolunu gir veya 'Otomatik bul'a bas.";
      return;
    }
    try {
      await TAURI.core.invoke("start_watching", { path });
      state.logPath = path; save();
      msg.className = "hint ok";
      msg.textContent = "Bağlandı.";
    } catch (e) {
      setStatus("err", "Hata");
      msg.className = "hint err";
      msg.textContent = String(e);
    }
  }

  async function detect() {
    const msg = $("settings-msg");
    if (!TAURI) return null;
    const p = await TAURI.core.invoke("detect_log_path");
    if (p) {
      $("log-path").value = p;
      msg.className = "hint ok";
      msg.textContent = "Bulundu: " + p;
    } else {
      msg.className = "hint err";
      msg.textContent = "Bulunamadı. Oyun klasöründeki logs\\Client.txt yolunu elle gir.";
    }
    return p;
  }

  async function initTauri() {
    await TAURI.event.listen("log-event", (e) => handleLogEvent(e.payload));
    await TAURI.event.listen("watcher-status", (e) => {
      const { connected, message } = e.payload;
      setStatus(connected ? "on" : "err", connected ? "Log bağlı" : "Log yok");
      $("status").title = message;
    });
    // Her açılışta en güncel Client.txt'yi ara; kayıtlı yol eskiyse onu değiştir.
    let path = state.logPath;
    const found = await detect();
    if (found && found !== path) path = found;
    if (path) {
      $("log-path").value = path;
      await connect(path);
    } else {
      setStatus("err", "Log yok");
      openSettings();
    }
  }

  // ---------- Ayarlar ----------
  function openSettings() { $("drawer").classList.remove("hidden"); }
  function closeSettings() { $("drawer").classList.add("hidden"); }

  function bindUI() {
    $("btn-done").onclick = completeAndAdvance;
    $("btn-prev").onclick = back;
    $("btn-settings").onclick = openSettings;
    $("btn-close-settings").onclick = closeSettings;
    $("drawer").onclick = (e) => { if (e.target.id === "drawer") closeSettings(); };
    $("btn-detect").onclick = async () => { const p = await detect(); if (p) connect(p); };
    $("btn-browse").onclick = async () => {
      if (!TAURI?.dialog) return;
      const p = await TAURI.dialog.open({
        title: "Client.txt dosyasını seç (Path of Exile\\logs)",
        multiple: false, directory: false,
        filters: [{ name: "Client.txt", extensions: ["txt"] }],
      });
      if (p) { $("log-path").value = p; connect(p); }
    };
    $("btn-connect").onclick = () => connect($("log-path").value.trim());

    $("opt-auto").checked = state.auto;
    $("opt-auto").onchange = (e) => { state.auto = e.target.checked; save(); };
    $("opt-hide-done").checked = state.hideDone;
    $("opt-hide-done").onchange = (e) => { state.hideDone = e.target.checked; save(); renderSteps(); };

    $("btn-reset").onclick = () => {
      if (!confirm("Tüm kampanya ilerlemesi sıfırlansın mı?")) return;
      state = { ...defaults, logPath: state.logPath, auto: state.auto, hideDone: state.hideDone };
      save(); render(); closeSettings();
    };

    $("sim-zone").onkeydown = (e) => {
      if (e.key !== "Enter") return;
      onZoneEntered(e.target.value.trim());
      e.target.value = "";
    };

    // Sekmeler: kampanyada alt sayaçlar, diğerlerinde "şu anki adım" şeridi
    document.querySelectorAll(".tab").forEach((t) => { t.onclick = () => WR.showTab(t.dataset.tab); });
    WR.onTab((name) => {
      activeTab = name;
      $("totals").classList.toggle("hidden", name !== "campaign");
      $("step-strip").classList.toggle("hidden", name === "campaign");
      window.scrollTo(0, 0);
    });
    $("step-strip").onclick = () => WR.showTab("campaign");

    // Her zaman üstte
    const pin = $("btn-pin");
    const applyPin = async (on) => {
      pin.classList.toggle("on", on);
      pin.setAttribute("aria-pressed", String(on));
      if (TAURI) {
        try { await TAURI.window.getCurrentWindow().setAlwaysOnTop(on); }
        catch (e) { WR.toast("Üstte tutulamadı: " + e, "err"); }
      }
    };
    applyPin(WR.settings.data.pinned);
    pin.onclick = () => {
      WR.settings.data.pinned = !WR.settings.data.pinned;
      WR.settings.save();
      applyPin(WR.settings.data.pinned);
      WR.toast(WR.settings.data.pinned ? "Pencere her zaman üstte" : "Üstte tutma kapalı");
    };

    // Fiyat ayarları
    const bindOpt = (id, key, def) => {
      $(id).checked = WR.settings.data[key] ?? def;
      $(id).onchange = (e) => { WR.settings.data[key] = e.target.checked; WR.settings.save(); };
    };
    bindOpt("opt-price-tab", "autoPriceTab", true);
    bindOpt("opt-popup", "popup", true);
    bindOpt("opt-autosearch", "autoSearch", true);
    $("opt-spread").value = WR.settings.data.spread ?? 10;
    $("opt-spread").onchange = (e) => { WR.settings.data.spread = Math.max(0, Math.min(50, Number(e.target.value) || 0)); WR.settings.save(); };
    const leagueSel = $("opt-league");
    let leaguesLoaded = false;
    const loadLeagues = async () => {
      if (leaguesLoaded) return;
      leaguesLoaded = true;
      try {
        for (const l of await WR.listLeagues()) {
          const o = document.createElement("option");
          o.value = l; o.textContent = l;
          leagueSel.appendChild(o);
        }
        leagueSel.value = WR.settings.data.league || "";
      } catch { leaguesLoaded = false; }
    };
    $("btn-settings").addEventListener("click", loadLeagues);
    leagueSel.onchange = () => { WR.settings.data.league = leagueSel.value; WR.settings.save(); };

    document.addEventListener("keydown", (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "Escape") { closeSettings(); return; }
      if (activeTab !== "campaign") return;
      if (e.key === "ArrowRight") completeAndAdvance();
      else if (e.key === "ArrowLeft") back();
    });
  }

  // ---------- Başlat ----------
  // Kayıtlı konum veri değiştiyse geçersiz olabilir.
  if (!ACTS[state.act] || !ACTS[state.act].steps[state.step]) { state.act = 0; state.step = 0; }
  bindUI();
  render();
  if (TAURI) {
    initTauri().catch((e) => setStatus("err", String(e)));
  } else {
    setStatus("", "Önizleme modu");
    $("sim-box").classList.remove("hidden");
  }
})();
