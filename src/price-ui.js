// Fiyat arayüzü bileşeni: item kartı + poe.ninja fiyatı + trade filtreleri ve sonuçları.
// WR.priceUI.render(container, item, { autoSearch, onPrice })
window.WR.priceUI = (() => {
  "use strict";
  const { el, toast, nf } = window.WR;
  const P = window.WR.priceCore;

  const RARITY_CLS = { Unique: "unique", Rare: "rare", Magic: "magic", Normal: "normal", Gem: "gem", Currency: "currency", "Divination Card": "card" };
  const INF_LABEL = { shaper_item: "Shaper", elder_item: "Elder", crusader_item: "Crusader", redeemer_item: "Redeemer", hunter_item: "Hunter", warlord_item: "Warlord", searing_item: "Exarch", tangled_item: "Eater" };
  const GROUP_LABEL = { pseudo: "Toplamlar", enchant: "Enchant", implicit: "Implicit", explicit: "Explicit", crafted: "Crafted", fractured: "Fractured" };

  let renderToken = 0;

  // ---------- Küçük yardımcılar ----------
  const numInput = (value, onChange, placeholder = "") => {
    const i = el("input", "num");
    i.type = "number"; i.step = "any"; i.placeholder = placeholder;
    if (value != null) i.value = value;
    i.oninput = () => onChange(i.value === "" ? null : Number(i.value));
    return i;
  };
  const toggleChip = (label, on, onChange, cls = "") => {
    const b = el("button", `fchip ${cls}${on ? " on" : ""}`, label);
    b.type = "button";
    b.onclick = () => { const v = !b.classList.contains("on"); b.classList.toggle("on", v); onChange(v); };
    return b;
  };
  // "Etiket [min]" biçiminde açılıp kapanan sayısal filtre
  const rangeChip = (label, obj) => {
    const wrap = el("label", `frange${obj.on ? " on" : ""}`);
    const cb = el("input"); cb.type = "checkbox"; cb.checked = obj.on;
    cb.onchange = () => { obj.on = cb.checked; wrap.classList.toggle("on", cb.checked); };
    wrap.append(cb, el("span", null, label), numInput(obj.min, (v) => { obj.min = v; if (!obj.on) { obj.on = true; cb.checked = true; wrap.classList.add("on"); } }, "min"));
    return wrap;
  };

  function itemCard(item) {
    const card = el("section", `item-card r-${RARITY_CLS[item.rarity] || "normal"}`);
    const head = el("div", "ic-head");
    head.lang = "en";
    head.append(el("div", "ic-name", item.name));
    if (item.base !== item.name) head.append(el("div", "ic-base", item.base));
    card.appendChild(head);
    const meta = el("div", "ic-meta");
    const bits = [item.cls, item.ilvl && `ilvl ${item.ilvl}`, item.mapTier && `T${item.mapTier}`,
      item.links >= 2 && `${item.links}L`, item.rarity === "Gem" && item.gemLevel && `Lv ${item.gemLevel}`,
      item.quality && `${item.quality}q`, item.stack > 1 && `${item.stack} adet`,
      item.pdps && `pDPS ${item.pdps}`, item.edps && `eDPS ${item.edps}`,
      item.armour && `AR ${item.armour}`, item.evasion && `EV ${item.evasion}`, item.es && `ES ${item.es}`];
    meta.textContent = bits.filter(Boolean).join(" · ");
    card.appendChild(meta);
    const flags = el("div", "ic-flags");
    item.influences.forEach((k) => flags.appendChild(el("span", "flag inf", INF_LABEL[k] || k)));
    if (item.fractured) flags.appendChild(el("span", "flag frac", "Fractured"));
    if (item.synthesised) flags.appendChild(el("span", "flag", "Synthesised"));
    if (item.corrupted) flags.appendChild(el("span", "flag corr", "Corrupted"));
    if (item.mirrored) flags.appendChild(el("span", "flag", "Mirrored"));
    if (flags.childElementCount) card.appendChild(flags);
    return card;
  }

  // ---------- Ana çizim ----------
  async function render(container, item, opts = {}) {
    const token = ++renderToken;
    container.replaceChildren(itemCard(item));
    const out = el("div", "price-out");
    container.appendChild(out);

    if (item.unidentified && item.rarity === "Unique") {
      out.appendChild(el("p", "note", "Unidentified unique — fiyat için önce identify et."));
      return;
    }
    const div = await P.divineRate();
    await P.currencyRates(); // trade fiyatlarını chaos'a çevirmek için önceden yükle
    if (token !== renderToken) return;

    // 1) poe.ninja
    if (P.usesNinja(item)) {
      const box = el("div", "ninja-box");
      box.appendChild(el("p", "loading", "poe.ninja'ya bakılıyor…"));
      out.appendChild(box);
      try {
        const prices = await P.ninjaPrice(item);
        if (token !== renderToken) return;
        box.replaceChildren();
        if (prices.length) {
          const best = prices[0];
          const big = el("div", "price-big");
          big.append(el("span", "pb-val", P.fmtPrice(best.chaos, div)), el("span", "pb-unit", item.stack > 1 ? "/ adet" : "poe.ninja"));
          box.appendChild(big);
          const parts = [];
          if (item.stack > 1 && best.chaos != null) parts.push(`Toplam: ${P.fmtPrice(best.chaos * item.stack, div)}`);
          if (best.listings != null) parts.push(`${best.listings} ilan`);
          if (best.listings != null && best.listings < 10) parts.push("⚠ düşük güven");
          if (div) parts.push(`1 div = ${nf.format(div)} c`);
          box.appendChild(el("div", "pb-sub", parts.join(" · ")));
          if (prices.length > 1) {
            const tbl = el("div", "variants");
            prices.forEach((p) => {
              const row = el("div", `variant${p.exact ? " exact" : ""}`);
              row.lang = "en";
              row.append(el("span", null, p.label), el("b", null, P.fmtPrice(p.chaos, div)));
              tbl.appendChild(row);
            });
            box.appendChild(tbl);
          }
          opts.onPrice?.(best.chaos);
        } else {
          box.appendChild(el("p", "note", "poe.ninja'da bulunamadı — trade araması aşağıda."));
        }
      } catch (e) {
        box.replaceChildren(el("p", "note warn", `poe.ninja hatası: ${e.message || e}`));
      }
      if (["Currency", "Divination Card"].includes(item.rarity) || /Currency|Fragment|Scarab/.test(item.cls)) return;
    }

    // 2) Trade
    const trade = el("div", "trade-box");
    trade.appendChild(el("p", "loading", "Mod'lar trade veritabanıyla eşleştiriliyor…"));
    out.appendChild(trade);
    let rows;
    try { rows = await P.buildModRows(item, (WR.settings.data.spread ?? 10) / 100); }
    catch (e) { trade.replaceChildren(el("p", "note warn", `Trade verisi alınamadı: ${e.message || e}`)); return; }
    if (token !== renderToken) return;
    const f = P.defaultFilters(item);
    renderTrade(trade, item, f, rows, div, opts, token);
  }

  function renderTrade(box, item, f, rows, div, opts, token) {
    box.replaceChildren();

    // --- Genel filtreler ---
    const gen = el("div", "filters");
    if (item.rarity !== "Unique" && !["Gem", "Divination Card", "Currency"].includes(item.rarity) && item.rarity !== "Magic") {
      const baseBtn = toggleChip(f.useBase ? `Taban: ${item.base}` : `Kategori: ${item.cls}`, true, () => {
        f.useBase = !f.useBase;
        baseBtn.textContent = f.useBase ? `Taban: ${item.base}` : `Kategori: ${item.cls}`;
        baseBtn.classList.add("on");
      }, "base");
      baseBtn.lang = "en";
      baseBtn.title = "Tıkla: tam taban tipi ↔ aynı kategorideki tüm tabanlar";
      gen.appendChild(baseBtn);
    }
    gen.appendChild(toggleChip(f.online ? "Sadece online" : "Herkes", true, (v) => {}, "online"));
    gen.lastChild.onclick = (e) => { f.online = !f.online; e.target.textContent = f.online ? "Sadece online" : "Herkes"; };

    const corr = el("select", "fselect");
    [["any", "Corrupt: fark etmez"], ["true", "Corrupted"], ["false", "Corrupt değil"]].forEach(([v, l]) => {
      const o = el("option", null, l); o.value = v; corr.appendChild(o);
    });
    corr.value = f.corrupted;
    corr.onchange = () => { f.corrupted = corr.value; };
    gen.appendChild(corr);

    Object.keys(f.influences).forEach((k) => gen.appendChild(toggleChip(INF_LABEL[k] || k, true, (v) => { f.influences[k] = v; }, "inf")));
    if (item.fractured) gen.appendChild(toggleChip("Fractured", true, (v) => { f.fractured = v; }));
    if (item.synthesised) gen.appendChild(toggleChip("Synthesised", true, (v) => { f.synthesised = v; }));
    box.appendChild(gen);

    const nums = el("div", "filters");
    if (item.ilvl) nums.appendChild(rangeChip("ilvl", f.ilvl));
    if (item.quality) nums.appendChild(rangeChip("Quality", f.quality));
    if (item.links >= 2) nums.appendChild(rangeChip("Link", f.links));
    if (item.rarity === "Gem") nums.appendChild(rangeChip("Gem lv", f.gemLevel));
    if (item.mapTier) nums.appendChild(rangeChip("Tier", f.mapTier));
    if (item.pdps) nums.appendChild(rangeChip("pDPS", f.pdps));
    if (item.edps) nums.appendChild(rangeChip("eDPS", f.edps));
    if (item.armour) nums.appendChild(rangeChip("Armour", f.armour));
    if (item.evasion) nums.appendChild(rangeChip("Evasion", f.evasion));
    if (item.es) nums.appendChild(rangeChip("ES", f.es));
    if (nums.childElementCount) box.appendChild(nums);

    // --- Mod satırları ---
    if (rows.length) {
      const list = el("div", "mod-filters");
      let lastGroup = null;
      rows.forEach((r) => {
        const g = r.group === "crafted" || r.group === "fractured" ? "explicit" : r.group;
        if (g !== lastGroup) {
          const gh = el("div", "mf-group", GROUP_LABEL[g] || g);
          if (g !== "pseudo") gh.lang = "en";
          list.appendChild(gh);
          lastGroup = g;
        }
        const row = el("div", `mf${r.id ? "" : " nomatch"} g-${r.group}${r.on ? " on" : ""}`);
        const cb = el("input"); cb.type = "checkbox"; cb.checked = r.on; cb.disabled = !r.id;
        cb.onchange = () => { r.on = cb.checked; row.classList.toggle("on", r.on); };
        const txt = el("span", "mf-text", r.text);
        txt.title = r.id ? r.id : "Trade veritabanında eşleşmedi";
        if (r.group !== "pseudo") txt.lang = "en";
        txt.onclick = () => { if (!cb.disabled) { cb.checked = !cb.checked; cb.onchange(); } };
        row.append(cb, txt);
        if (r.id) {
          row.append(numInput(r.min, (v) => { r.min = v; }, "min"), numInput(r.max, (v) => { r.max = v; }, "max"));
        }
        list.appendChild(row);
      });
      box.appendChild(list);
    }

    // --- Ara ---
    const actions = el("div", "trade-actions");
    const btn = el("button", "btn gold", "Trade'de ara");
    const openBtn = el("button", "btn ghost hidden", "Sitede aç ↗");
    actions.append(btn, openBtn);
    box.appendChild(actions);
    const results = el("div", "trade-results");
    box.appendChild(results);

    let last = null;
    const run = async () => {
      btn.disabled = true;
      results.replaceChildren(el("p", "loading", "Aranıyor…"));
      try {
        const s = await P.tradeSearch(item, f, rows);
        if (token !== renderToken) return;
        last = { ...s, shown: 0, listings: [] };
        openBtn.classList.remove("hidden");
        openBtn.onclick = () => WR.openUrl(s.url);
        await loadMore();
      } catch (e) {
        results.replaceChildren(el("p", "note warn", String(e.message || e)));
      } finally {
        btn.disabled = false;
      }
    };
    const loadMore = async () => {
      const next = last.ids.slice(last.shown, last.shown + 10);
      const got = await P.tradeFetch(last.id, next);
      last.shown += next.length;
      last.listings.push(...got);
      drawResults();
    };
    const drawResults = () => {
      results.replaceChildren();
      const top = el("div", "tr-top");
      top.append(el("span", null, `${nf.format(last.total)} sonuç`));
      results.appendChild(top);
      if (!last.listings.length) {
        results.appendChild(el("p", "note", "Eşleşen ilan yok — bazı filtreleri kapatıp tekrar ara."));
        return;
      }
      const chaosList = last.listings.slice(0, 10).map((l) => P.toChaos(l, div)).filter((x) => x != null).sort((a, b) => a - b);
      if (chaosList.length) {
        const big = el("div", "price-big");
        big.append(el("span", "pb-val", P.fmtPrice(chaosList[Math.floor(chaosList.length / 2)], div)), el("span", "pb-unit", "orta fiyat"));
        results.appendChild(big);
        results.appendChild(el("div", "pb-sub", `en ucuz ${P.fmtPrice(chaosList[0], div)} · ilk ${chaosList.length} ilan`));
        opts.onPrice?.(chaosList[Math.floor(chaosList.length / 2)]);
      }
      // Aynı fiyattaki ilanları grupla
      const groups = [];
      for (const l of last.listings) {
        const key = `${l.amount}|${l.currency}`;
        const g = groups.find((x) => x.key === key);
        if (g) g.items.push(l); else groups.push({ key, items: [l] });
      }
      for (const g of groups) {
        const l = g.items[0];
        const row = el("div", "listing");
        const price = el("b", "l-price", `${l.amount ?? "?"} ${l.currency ?? ""}`);
        const cnt = g.items.length > 1 ? el("span", "l-count", `×${g.items.length}`) : null;
        const who = el("span", "l-seller");
        who.append(el("i", `dot${l.online ? " on" : ""}`), l.seller || "?");
        const when = el("small", null, l.indexed ? P.ago(l.indexed) : "");
        const wbtn = el("button", "l-whisper", "Fısılda");
        wbtn.title = "Fısıltı mesajını kopyala (oyunda Enter + Ctrl+V)";
        wbtn.onclick = async () => {
          try { await navigator.clipboard.writeText(l.whisper); toast("Fısıltı kopyalandı — oyunda Enter, Ctrl+V", "ok"); }
          catch { toast("Kopyalanamadı", "err"); }
        };
        row.append(price);
        if (cnt) row.append(cnt);
        row.append(who, when);
        if (l.whisper) row.append(wbtn);
        results.appendChild(row);
      }
      if (last.shown < last.ids.length) {
        const more = el("button", "btn ghost more", "Daha fazla");
        more.onclick = async () => { more.disabled = true; await loadMore(); };
        results.appendChild(more);
      }
    };

    btn.onclick = run;
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") run(); });
    if (opts.autoSearch && !P.usesNinja(item)) run();
  }

  return { render, itemCard, RARITY_CLS };
})();
