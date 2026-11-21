// Pasif ağaç: GGG'nin resmi verisiyle (skilltree-export) çizim ve node bilgisi.
window.WR.tree = (() => {
  "use strict";
  const { el } = window.WR;
  const DATA_URL = "https://raw.githubusercontent.com/grindinggear/skilltree-export/master/data.json";

  // GGG ağacında 16 ve 40 noktalı yörüngeler eşit aralıklı değildir.
  const ANGLES = {
    16: [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330],
    40: [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180,
      190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350],
  };

  let dataPromise = null;
  function load() {
    if (!dataPromise) {
      dataPromise = (async () => {
        const text = WR.TAURI
          ? await WR.TAURI.core.invoke("http_get_cached", { url: DATA_URL, maxAgeSecs: 7 * 86400 })
          : await (await fetch(DATA_URL)).text();
        return prepare(JSON.parse(text));
      })().catch((e) => { dataPromise = null; throw e; });
    }
    return dataPromise;
  }

  function prepare(d) {
    const radii = d.constants.orbitRadii;
    const per = d.constants.skillsPerOrbit;
    const nodes = new Map();
    for (const [id, n] of Object.entries(d.nodes)) {
      if (id === "root" || n.group == null) continue;
      const g = d.groups[n.group];
      if (!g) continue;
      const count = per[n.orbit] || 1;
      const deg = ANGLES[count] ? ANGLES[count][n.orbitIndex] : (360 / count) * n.orbitIndex;
      const a = (deg * Math.PI) / 180;
      const r = radii[n.orbit] || 0;
      nodes.set(Number(id), {
        ...n, id: Number(id), angle: a, gx: g.x, gy: g.y, r,
        x: g.x + r * Math.sin(a), y: g.y - r * Math.cos(a),
        asc: !!n.ascendancyName,
        kind: n.isKeystone ? "keystone" : n.isNotable ? "notable" : n.isMastery ? "mastery" : n.isJewelSocket ? "jewel" : n.classStartIndex != null ? "start" : "normal",
      });
    }
    // Kenarlar (ascendancy ve proxy düğümleri hariç)
    const edges = [];
    for (const n of nodes.values()) {
      if (n.asc || n.isProxy || n.kind === "mastery") continue;
      for (const o of n.out || []) {
        const m = nodes.get(Number(o));
        if (!m || m.asc || m.isProxy || m.kind === "mastery") continue;
        if (n.kind === "start" || m.kind === "start") continue;
        edges.push([n, m]);
      }
    }
    return { nodes, edges, version: d.tree };
  }

  // Seçili node'ların açıklamalı listeleri
  function summarize(data, ids, masteryPairs) {
    const out = { keystones: [], notables: [], masteries: [], ascendancy: [], jewels: 0, normal: 0, missing: 0 };
    for (const id of ids) {
      const n = data.nodes.get(id);
      if (!n) { out.missing++; continue; }
      if (n.asc) { if (!n.isAscendancyStart && (n.isNotable || n.stats?.length)) out.ascendancy.push(n); continue; }
      if (n.kind === "keystone") out.keystones.push(n);
      else if (n.kind === "notable") out.notables.push(n);
      else if (n.kind === "jewel") out.jewels++;
      else if (n.kind === "normal") out.normal++;
    }
    for (const [nodeId, effectId] of masteryPairs) {
      const n = data.nodes.get(nodeId);
      const eff = n?.masteryEffects?.find((e) => e.effect === effectId);
      if (n && eff) out.masteries.push({ name: n.name, stats: eff.stats });
    }
    out.ascendancy.sort((a, b) => (b.isNotable ? 1 : 0) - (a.isNotable ? 1 : 0));
    return out;
  }

  // ---------- Çizim ----------
  function view(data, allocated) {
    const wrap = el("div", "tree-wrap");
    const canvas = el("canvas", "tree-canvas");
    const tip = el("div", "tree-tip hidden");
    const help = el("div", "tree-help", "Sürükle: kaydır · Tekerlek: yakınlaştır · Çift tık: sığdır");
    wrap.append(canvas, tip, help);

    const alloc = new Set(allocated);
    const visible = [...data.nodes.values()].filter((n) => !n.asc && !n.isProxy && n.kind !== "start");
    const allocNodes = visible.filter((n) => alloc.has(n.id));

    let scale = 0.05, ox = 0, oy = 0, W = 0, H = 0;
    const dpr = window.devicePixelRatio || 1;

    function fit() {
      const pts = allocNodes.length ? allocNodes : visible;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of pts) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); }
      const pad = 600;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      scale = Math.min(W / (maxX - minX), H / (maxY - minY));
      ox = W / 2 - ((minX + maxX) / 2) * scale;
      oy = H / 2 - ((minY + maxY) / 2) * scale;
    }

    const sx = (x) => x * scale + ox;
    const sy = (y) => y * scale + oy;

    function draw() {
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0a0806";
      ctx.fillRect(0, 0, W, H);

      const edge = (a, b) => {
        // Aynı grup ve aynı yörüngede ise yay, değilse düz çizgi
        if (a.group === b.group && a.orbit === b.orbit && a.r > 0) {
          let a1 = a.angle - Math.PI / 2, a2 = b.angle - Math.PI / 2;
          let diff = a2 - a1;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          ctx.beginPath();
          ctx.arc(sx(a.gx), sy(a.gy), a.r * scale, a1, a1 + diff, diff < 0);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(sx(a.x), sy(a.y));
          ctx.lineTo(sx(b.x), sy(b.y));
          ctx.stroke();
        }
      };

      ctx.lineWidth = Math.max(0.6, 6 * scale);
      ctx.strokeStyle = "#2a2219";
      for (const [a, b] of data.edges) if (!(alloc.has(a.id) && alloc.has(b.id))) edge(a, b);
      ctx.lineWidth = Math.max(1.6, 14 * scale);
      ctx.strokeStyle = "#c8a15a";
      for (const [a, b] of data.edges) if (alloc.has(a.id) && alloc.has(b.id)) edge(a, b);

      for (const n of visible) {
        const on = alloc.has(n.id);
        let r = n.kind === "keystone" ? 46 : n.kind === "notable" ? 32 : n.kind === "mastery" ? 30 : n.kind === "jewel" ? 30 : 18;
        r = Math.max(on ? 2.2 : 1.2, r * scale);
        ctx.beginPath();
        ctx.arc(sx(n.x), sy(n.y), r, 0, Math.PI * 2);
        if (n.kind === "mastery") {
          ctx.strokeStyle = on ? "#8fd18f" : "#2c2a22"; ctx.lineWidth = 1; ctx.stroke();
          continue;
        }
        ctx.fillStyle = on
          ? (n.kind === "keystone" ? "#ff9a4a" : n.kind === "notable" ? "#ffd27a" : n.kind === "jewel" ? "#6fd1c9" : "#e6c37a")
          : (n.kind === "keystone" ? "#4a3420" : n.kind === "notable" ? "#3a3024" : "#262019");
        ctx.fill();
      }
      // Seçili keystone/notable adları (yeterince yakınsa)
      if (scale > 0.09) {
        ctx.font = `${Math.min(13, 110 * scale)}px "Crimson Text", Georgia, serif`;
        ctx.fillStyle = "#ecd096";
        ctx.textAlign = "center";
        for (const n of allocNodes) {
          if (n.kind === "keystone" || n.kind === "notable") ctx.fillText(n.name, sx(n.x), sy(n.y) - Math.max(6, 40 * scale));
        }
      }
    }

    function resize() {
      W = wrap.clientWidth || 400;
      H = Math.round(Math.min(560, Math.max(320, W * 0.85)));
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.height = H + "px";
    }

    // Etkileşim
    let drag = null;
    canvas.addEventListener("mousedown", (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; });
    window.addEventListener("mouseup", () => { drag = null; });
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (drag) { ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y); draw(); tip.classList.add("hidden"); return; }
      // En yakın node
      let best = null, bd = 14 * 14;
      for (const n of visible) {
        if (n.kind === "normal" && !alloc.has(n.id) && scale < 0.12) continue;
        const dx = sx(n.x) - mx, dy = sy(n.y) - my, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = n; }
      }
      if (!best) { tip.classList.add("hidden"); return; }
      tip.replaceChildren();
      const t = el("b", `tt-${best.kind}${alloc.has(best.id) ? " on" : ""}`, best.name);
      t.lang = "en";
      tip.appendChild(t);
      (best.stats || []).forEach((s) => { const d = el("div", null, s); d.lang = "en"; tip.appendChild(d); });
      if (best.kind === "mastery") tip.appendChild(el("div", "tt-note", "Mastery — seçilen etki aşağıdaki listede"));
      tip.classList.remove("hidden");
      const tx = Math.min(mx + 14, W - 260), ty = Math.min(my + 14, H - tip.offsetHeight - 4);
      tip.style.left = Math.max(4, tx) + "px"; tip.style.top = Math.max(4, ty) + "px";
    });
    canvas.addEventListener("mouseleave", () => tip.classList.add("hidden"));
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const k = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const ns = Math.min(1.2, Math.max(0.01, scale * k));
      ox = mx - ((mx - ox) * ns) / scale;
      oy = my - ((my - oy) * ns) / scale;
      scale = ns;
      draw();
    }, { passive: false });
    canvas.addEventListener("dblclick", () => { fit(); draw(); });

    // Yalnızca genişlik değişince yeniden çiz (yükseklik değişimi döngüye sokmasın)
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      if (!w || w === lastW) return;
      lastW = w; resize(); fit(); draw();
    });
    requestAnimationFrame(() => { resize(); fit(); draw(); ro.observe(wrap); });
    return wrap;
  }

  return { load, summarize, view };
})();
