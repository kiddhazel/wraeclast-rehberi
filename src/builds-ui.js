// Wraeclast Rehberi — Build sekmesi
(() => {
  "use strict";

  const BUILDS = window.BUILDS || [];
  const STORE_KEY = "wraeclast-rehberi:builds:v1";
  const defaults = { selected: BUILDS[0]?.id ?? null, checks: {}, open: {} };

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch { return { ...defaults }; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* yok say */ }
  }

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // Harici linkler: Tauri'de sistem tarayıcısında, önizlemede yeni sekmede.
  function openUrl(url) {
    const opener = window.__TAURI__?.opener;
    if (opener?.openUrl) opener.openUrl(url).catch(() => window.open(url, "_blank"));
    else window.open(url, "_blank", "noopener");
  }
  function link(label, url, cls = "ext-link") {
    const a = el("a", cls, label);
    a.href = url;
    a.onclick = (e) => { e.preventDefault(); openUrl(url); };
    return a;
  }

  // ---------- Kategoriler ----------
  function renderCats() {
    const nav = $("build-cats");
    nav.replaceChildren();
    const cats = [...new Set(BUILDS.map((b) => b.category))];
    for (const c of cats) {
      const group = el("div", "cat-group");
      const cl = el("span", "cat-label", c);
      cl.lang = "en";
      group.appendChild(cl);
      for (const b of BUILDS.filter((x) => x.category === c)) {
        const btn = el("button", "cat-btn", `${b.name} · ${b.author}`);
        if (b.id === state.selected) btn.classList.add("active");
        btn.onclick = () => { state.selected = b.id; save(); render(); };
        group.appendChild(btn);
      }
      nav.appendChild(group);
    }
  }

  // ---------- Bloklar ----------
  const blockRenderers = {
    kv(b) {
      const dl = el("dl", "kv");
      for (const [k, v] of b.rows) dl.append(el("dt", null, k), el("dd", null, v));
      return dl;
    },
    list(b) {
      const ul = el("ul", "blist");
      for (const it of b.items) ul.appendChild(el("li", null, it));
      return ul;
    },
    note(b) {
      return el("p", `note ${b.tone || ""}`, b.text);
    },
    links(b) {
      const wrap = el("div", "links");
      for (const [label, url] of b.items) wrap.appendChild(link(label + " ↗", url));
      return wrap;
    },
    check(b) {
      const ol = el("ol", "checklist");
      b.items.forEach((it, i) => {
        const id = `${b.id}:${i}`;
        const li = el("li");
        const label = el("label");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = !!state.checks[id];
        cb.onchange = () => {
          if (cb.checked) state.checks[id] = true; else delete state.checks[id];
          li.classList.toggle("done", cb.checked);
          save();
        };
        li.classList.toggle("done", cb.checked);
        label.append(cb, el("span", null, it));
        li.appendChild(label);
        ol.appendChild(li);
      });
      return ol;
    },
    gems(b) {
      const wrap = el("div", "gem-groups");
      for (const g of b.groups) {
        const card = el("div", "gem-group");
        const gn = el("div", "gem-group-name", g.name);
        gn.lang = "en";
        card.appendChild(gn);
        if (g.note) card.appendChild(el("div", "gem-note", g.note));
        const sockets = el("div", "sockets");
        for (const [name, kind] of g.gems) {
          const s = el("div", `gem ${kind}`);
          s.append(el("i"), el("span", null, name));
          s.lang = "en";
          sockets.appendChild(s);
        }
        card.appendChild(sockets);
        wrap.appendChild(card);
      }
      return wrap;
    },
    craft(b) {
      const card = el("details", "craft");
      const key = `craft:${b.id}`;
      card.open = !!state.open[key];
      card.ontoggle = () => { state.open[key] = card.open; save(); };

      const sum = el("summary");
      sum.append(el("span", "craft-title", b.title));
      if (b.updated) sum.append(el("span", "craft-date", b.updated));
      card.appendChild(sum);

      const body = el("div", "craft-body");
      const base = el("p", "craft-base");
      base.append(el("b", null, "Taban: "), b.base);
      body.appendChild(base);

      const tgt = el("div", "craft-targets");
      for (const t of b.target) tgt.appendChild(el("span", "chip item", t));
      body.appendChild(tgt);

      const ol = el("ol", "craft-steps checklist");
      b.steps.forEach((st, i) => {
        const id = `${b.id}:step:${i}`;
        const li = el("li");
        const label = el("label");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = !!state.checks[id];
        li.classList.toggle("done", cb.checked);
        cb.onchange = () => {
          if (cb.checked) state.checks[id] = true; else delete state.checks[id];
          li.classList.toggle("done", cb.checked);
          save();
        };
        label.append(cb, el("span", null, st));
        li.appendChild(label);
        ol.appendChild(li);
      });
      body.appendChild(ol);
      body.appendChild(link("Kaynakta aç ↗", b.url));
      card.appendChild(body);
      return card;
    },
  };

  // ---------- Build görünümü ----------
  function render() {
    renderCats();
    const view = $("build-view");
    view.replaceChildren();
    const b = BUILDS.find((x) => x.id === state.selected) || BUILDS[0];
    if (!b) {
      view.appendChild(el("p", "note", "Henüz build eklenmedi."));
      return;
    }

    // Başlık kartı
    const head = el("section", "build-head");
    const top = el("div", "build-top");
    top.lang = "en";
    top.append(el("span", "build-cat", b.category), el("span", "build-patch", b.patch));
    const title = el("h2", "build-name", b.name);
    title.lang = "en";
    const by = el("div", "build-by");
    by.append(`${b.author} · güncelleme ${b.updated} · `, link("kaynak ↗", b.source));
    head.append(top, title, by, el("p", "build-summary", b.summary));
    view.appendChild(head);

    // Bölümler
    for (const s of b.sections) {
      const key = `${b.id}:${s.id}`;
      const det = el("details", "bsection");
      det.open = state.open[key] ?? (s.id === "overview" || s.id === "gems");
      det.ontoggle = () => { state.open[key] = det.open; save(); };
      const sm = el("summary", null, s.title);
      if (s.lang) sm.lang = s.lang; // İngilizce başlıklar "LEVELİNG" olmasın
      det.appendChild(sm);
      const body = el("div", "bsection-body");
      for (const blk of s.blocks) {
        const r = blockRenderers[blk.type];
        if (r) body.appendChild(r(blk));
      }
      det.appendChild(body);
      view.appendChild(det);
    }
  }

  render();
})();
