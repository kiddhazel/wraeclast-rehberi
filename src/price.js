// Ana penceredeki Fiyat sekmesi + oyundan kopyalanan item'ların yönlendirilmesi.
(() => {
  "use strict";
  const { el, settings, toast } = window.WR;
  const P = window.WR.priceCore;
  const UI = window.WR.priceUI;
  const hist = WR.store("price:history:v1", { items: [] });

  // Geçmiş: hem bu pencere hem popup yazar (aynı localStorage).
  function pushHistory(item, chaos) {
    const h = hist.data.items.filter((x) => !(x.name === item.name && x.base === item.base));
    h.unshift({ name: item.name, base: item.base, rarity: item.rarity, chaos, at: Date.now(), raw: item.raw });
    hist.data.items = h.slice(0, 15);
    hist.save();
    renderHistory();
  }
  async function renderHistory() {
    const box = document.getElementById("price-history");
    let items;
    try { items = JSON.parse(localStorage.getItem("wraeclast-rehberi:price:history:v1") || "{}").items || []; }
    catch { items = []; }
    box.replaceChildren();
    if (!items.length) return;
    box.appendChild(el("h3", "sub-head", "Son bakılanlar"));
    const div = await P.divineRate().catch(() => null);
    for (const h of items) {
      const row = el("button", `hist-row r-${UI.RARITY_CLS[h.rarity] || "normal"}`);
      const nm = el("span", "h-name", h.name);
      nm.lang = "en";
      row.append(nm, el("b", null, P.fmtPrice(h.chaos, div)));
      row.onclick = () => show(h.raw);
      box.appendChild(row);
    }
  }

  function show(text) {
    const item = P.parseItem(text);
    UI.render(document.getElementById("price-view"), item, {
      autoSearch: settings.data.autoSearch !== false,
      onPrice: (c) => pushHistory(item, c),
    });
  }

  function isItem(text) { return /^Item Class:/m.test(text) && /^Rarity:/m.test(text); }

  async function handleCopied(text) {
    if (!isItem(text)) return;
    if (WR.TAURI && settings.data.popup !== false) {
      try { await WR.TAURI.core.invoke("show_price_popup", { text }); return; }
      catch (e) { toast("Popup açılamadı: " + e, "err"); }
    }
    if (settings.data.autoPriceTab) WR.showTab("price");
    show(text);
  }

  WR.listen("item-copied", handleCopied);
  document.getElementById("price-paste").addEventListener("paste", (e) => {
    const text = e.clipboardData.getData("text");
    e.preventDefault();
    e.target.value = "";
    if (!isItem(text)) { toast("Bu bir PoE item metni değil", "err"); return; }
    show(text);
  });
  // Popup geçmişe yazınca burası da güncellensin
  window.addEventListener("storage", (e) => { if (e.key?.includes("price:history")) renderHistory(); });

  WR.price = { parseItem: P.parseItem, show };
  renderHistory();
})();
