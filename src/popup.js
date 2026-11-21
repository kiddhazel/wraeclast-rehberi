// Fiyat popup penceresi.
(() => {
  "use strict";
  const { TAURI, settings } = window.WR;
  const P = window.WR.priceCore;
  const UI = window.WR.priceUI;
  const view = document.getElementById("popup-view");
  const win = TAURI?.window.getCurrentWindow();

  const hist = WR.store("price:history:v1", { items: [] });
  function pushHistory(item, chaos) {
    // Diğer pencerenin yazdığı en güncel listeyi oku, sonra ekle.
    try { hist.data.items = JSON.parse(localStorage.getItem("wraeclast-rehberi:price:history:v1") || "{}").items || []; } catch { /* yok say */ }
    const h = hist.data.items.filter((x) => !(x.name === item.name && x.base === item.base));
    h.unshift({ name: item.name, base: item.base, rarity: item.rarity, chaos, at: Date.now(), raw: item.raw });
    hist.data.items = h.slice(0, 15);
    hist.save();
  }

  function show(text) {
    const item = P.parseItem(text);
    view.scrollTop = 0;
    UI.render(view, item, {
      autoSearch: settings.data.autoSearch !== false,
      onPrice: (c) => pushHistory(item, c),
    });
  }

  // Sabitle: açıkken odak kaybında kapanmaz
  let pinned = !!settings.data.popupPinned;
  const pinBtn = document.getElementById("popup-pin");
  const applyPin = () => pinBtn.classList.toggle("on", pinned);
  applyPin();
  pinBtn.onclick = () => { pinned = !pinned; settings.data.popupPinned = pinned; settings.save(); applyPin(); };

  const hide = () => win?.hide();
  document.getElementById("popup-close").onclick = hide;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  // Oyuna geri tıklayınca kapan (sabitlenmediyse)
  window.addEventListener("blur", () => { if (!pinned) setTimeout(() => { if (!document.hasFocus()) hide(); }, 150); });

  WR.getLeague().then((l) => { document.getElementById("popup-league").textContent = l; });

  if (TAURI) {
    TAURI.event.listen("popup-item", (e) => show(e.payload));
    TAURI.core.invoke("take_popup_item").then((t) => { if (t) show(t); });
  }
})();
