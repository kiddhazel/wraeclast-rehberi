// Fiyat motoru: item metnini ayrıştırma, poe.ninja fiyatı, trade API sorguları.
// Hem ana penceredeki Fiyat sekmesi hem de popup bu dosyayı kullanır.
window.WR.priceCore = (() => {
  "use strict";
  const { nf } = window.WR;

  const NINJA = "https://poe.ninja/poe1/api/economy/stash/current";
  const TRADE = "https://www.pathofexile.com/api/trade";
  const CACHE_MS = 10 * 60 * 1000;

  // ======================================================================
  // Item ayrıştırma
  // ======================================================================
  const INFLUENCES = {
    "Shaper Item": "shaper_item", "Elder Item": "elder_item", "Crusader Item": "crusader_item",
    "Redeemer Item": "redeemer_item", "Hunter Item": "hunter_item", "Warlord Item": "warlord_item",
    "Searing Exarch Item": "searing_item", "Eater of Worlds Item": "tangled_item",
  };
  const num = (s) => (s == null ? null : parseFloat(String(s).replace(",", ".")));
  const avgRange = (s) => {
    // "12-25" veya "12-25 (augmented), 30-40 (augmented)" → ortalamaların toplamı
    let total = 0;
    for (const m of String(s).matchAll(/(\d+)-(\d+)/g)) total += (+m[1] + +m[2]) / 2;
    return total;
  };

  function parseItem(text) {
    const t = text.replace(/\r/g, "");
    const sections = t.split(/\n-{8}\n?/).map((s) => s.split("\n").map((l) => l.trim()).filter(Boolean)).filter((s) => s.length);
    const head = sections[0] || [];
    const get = (re) => (re.exec(t) || [])[1];
    const cls = (head.find((l) => l.startsWith("Item Class:")) || "").slice(11).trim();
    const rarity = (head.find((l) => l.startsWith("Rarity:")) || "").slice(7).trim();
    const names = head.filter((l) => !/^(Item Class|Rarity):/.test(l));

    const item = {
      raw: text, cls, rarity,
      name: names[0] || "?",
      base: names[1] || names[0] || "?",
      ilvl: parseInt(get(/^Item Level: (\d+)/m) || "0", 10),
      gemLevel: parseInt(get(/^Level: (\d+)/m) || "0", 10),
      quality: parseInt(get(/^Quality(?: \([^)]*\))?: \+(\d+)%/m) || "0", 10),
      stack: parseInt((get(/^Stack Size: ([\d.,\s]+)\//m) || "1").replace(/[.,\s]/g, ""), 10) || 1,
      mapTier: parseInt(get(/^Map Tier: (\d+)/m) || "0", 10),
      corrupted: /^Corrupted$/m.test(t),
      unidentified: /^Unidentified$/m.test(t),
      fractured: /^Fractured Item$/m.test(t),
      synthesised: /^Synthesised Item$/m.test(t),
      mirrored: /^Mirrored$/m.test(t),
      influences: Object.entries(INFLUENCES).filter(([k]) => new RegExp(`^${k}$`, "m").test(t)).map(([, v]) => v),
      sockets: get(/^Sockets: (.+)$/m)?.trim() || "",
      links: 0, socketCount: 0,
      armour: num(get(/^Armour: (\d+)/m)), evasion: num(get(/^Evasion Rating: (\d+)/m)),
      es: num(get(/^Energy Shield: (\d+)/m)), ward: num(get(/^Ward: (\d+)/m)),
      block: num(get(/^Chance to Block: (\d+)/m)),
      pdps: null, edps: null, aps: num(get(/^Attacks per Second: ([\d.,]+)/m)),
      implicits: [], enchants: [], mods: [],
    };
    if (item.sockets) {
      const groups = item.sockets.split(" ");
      item.links = Math.max(...groups.map((g) => g.split("-").length));
      item.socketCount = (item.sockets.match(/[RGBWAD]/g) || []).length;
    }
    if (item.aps) {
      const phys = get(/^Physical Damage: (.+)$/m);
      const ele = get(/^Elemental Damage: (.+)$/m);
      const chaos = get(/^Chaos Damage: (.+)$/m);
      if (phys) item.pdps = Math.round(avgRange(phys) * item.aps * 10) / 10;
      const e = (ele ? avgRange(ele) : 0) + (chaos ? avgRange(chaos) : 0);
      if (e) item.edps = Math.round(e * item.aps * 10) / 10;
    }
    if (item.rarity === "Magic" || (item.rarity === "Normal" && names.length === 1)) item.base = item.name;
    if (item.rarity === "Rare" && item.unidentified) { item.base = item.name; }

    // Mod bölümleri "Item Level" bölümünden sonra gelir.
    const ilvlIdx = sections.findIndex((s) => s.some((l) => l.startsWith("Item Level:")));
    const FLAG = /^(Corrupted|Unidentified|Mirrored|Split|Synthesised Item|Fractured Item|Shaper Item|Elder Item|Crusader Item|Redeemer Item|Hunter Item|Warlord Item|Searing Exarch Item|Eater of Worlds Item|Foulborn)$/;
    if (ilvlIdx >= 0) {
      for (const sec of sections.slice(ilvlIdx + 1)) {
        const lines = sec.filter((l) => !l.startsWith("{") && !FLAG.test(l)); // Ctrl+Alt+C açıklamaları, bayraklar
        if (!lines.length) continue;
        if (/^(Note|Place into|Right click|Travel to|Can be used|Unmodifiable|Item Level)/.test(lines[0])) continue;
        if (lines.every((l) => /\((enchant|rune)\)$/.test(l))) {
          item.enchants.push(...lines.map((l) => l.replace(/\s*\((enchant|rune)\)$/, "")));
          continue;
        }
        if (lines.some((l) => /\(implicit\)$/.test(l))) {
          item.implicits.push(...lines.map((l) => l.replace(/\s*\(implicit\)$/, "")));
          continue;
        }
        if (!item.mods.length && item.rarity !== "Gem" && item.rarity !== "Currency") {
          item.mods = lines.map((l) => ({
            text: l.replace(/\s*\((crafted|fractured)\)$/, "").replace(/\s*— Unscalable Value$/, ""),
            kind: /\(crafted\)$/.test(l) ? "crafted" : /\(fractured\)$/.test(l) ? "fractured" : "explicit",
          }));
          // Unique'lerde açıklama yazısı (flavour text) mod sanılmasın: sonraki bölümler atlanır.
        }
      }
    }
    return item;
  }

  // ======================================================================
  // poe.ninja
  // ======================================================================
  const cache = new Map();
  async function ninja(kind, type) {
    const league = await WR.getLeague();
    const key = `${league}|${kind}|${type}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const url = `${NINJA}/${kind}/overview?league=${encodeURIComponent(league)}&type=${type}`;
    const data = await WR.httpGetJson(url);
    cache.set(key, { at: Date.now(), data });
    return data;
  }
  async function divineRate() {
    try {
      const c = await ninja("currency", "Currency");
      return c.lines.find((l) => l.currencyTypeName === "Divine Orb")?.chaosEquivalent || null;
    } catch { return null; }
  }

  const UNIQUE_TYPES = {
    "Body Armours": ["UniqueArmour"], Helmets: ["UniqueArmour"], Gloves: ["UniqueArmour"], Boots: ["UniqueArmour"],
    Shields: ["UniqueArmour"], Quivers: ["UniqueArmour"],
    Amulets: ["UniqueAccessory"], Rings: ["UniqueAccessory"], Belts: ["UniqueAccessory"],
    Jewels: ["UniqueJewel"], "Abyss Jewels": ["UniqueJewel"],
    Maps: ["UniqueMap"], Tinctures: ["UniqueTincture"],
  };
  const ITEM_TYPES_FOR_CURRENCY = ["Essence", "Fossil", "Resonator", "Oil", "DeliriumOrb", "Omen", "Tattoo", "Artifact", "Incubator", "Scarab"];
  const eq = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();

  function usesNinja(item) {
    return ["Unique", "Gem", "Currency", "Divination Card"].includes(item.rarity) || /Fragment|Scarab|Currency/.test(item.cls);
  }

  // Döndürür: [{ label, chaos, listings, exact }]
  async function ninjaPrice(item) {
    const r = item.rarity;
    if (r === "Currency" || /Currency|Fragment|Scarab/.test(item.cls)) {
      for (const type of ["Currency", "Fragment"]) {
        const c = await ninja("currency", type);
        const l = c.lines.find((x) => eq(x.currencyTypeName, item.name));
        if (l) return [{ label: l.currencyTypeName, chaos: l.chaosEquivalent, listings: l.receive?.listing_count, exact: true }];
      }
      for (const type of ITEM_TYPES_FOR_CURRENCY) {
        const c = await ninja("item", type);
        const l = c.lines.find((x) => eq(x.name, item.name));
        if (l) return [{ label: l.name, chaos: l.chaosValue, listings: l.listingCount, exact: true }];
      }
      return [];
    }
    if (r === "Divination Card") {
      const c = await ninja("item", "DivinationCard");
      const l = c.lines.find((x) => eq(x.name, item.name));
      return l ? [{ label: l.name, chaos: l.chaosValue, listings: l.listingCount, exact: true }] : [];
    }
    if (r === "Gem") {
      const c = await ninja("item", "SkillGem");
      const lines = c.lines.filter((x) => eq(x.name, item.name));
      const score = (x) => Math.abs((x.gemLevel || 1) - item.gemLevel) * 2 + Math.abs((x.gemQuality || 0) - item.quality) / 5 + ((!!x.corrupted) !== item.corrupted ? 3 : 0);
      return lines.sort((a, b) => score(a) - score(b)).slice(0, 4).map((x, i) => ({
        label: `Lv ${x.gemLevel || "?"} / ${x.gemQuality || 0}q${x.corrupted ? " · corrupted" : ""}`,
        chaos: x.chaosValue, listings: x.listingCount, exact: i === 0 && score(x) === 0,
      }));
    }
    if (r === "Unique") {
      let types = UNIQUE_TYPES[item.cls];
      if (!types) types = /Flask/.test(item.cls) ? ["UniqueFlask"] : ["UniqueWeapon", "UniqueArmour", "UniqueAccessory", "UniqueJewel", "UniqueFlask"];
      for (const type of types) {
        const c = await ninja("item", type);
        let lines = c.lines.filter((x) => eq(x.name, item.name));
        if (!lines.length) continue;
        const exact = lines.filter((x) => (item.links >= 5 ? x.links === item.links : !x.links));
        lines = [...exact, ...lines.filter((x) => !exact.includes(x))];
        return lines.slice(0, 5).map((x) => ({
          label: [x.name, x.links ? `${x.links}L` : "", x.variant || ""].filter(Boolean).join(" · "),
          chaos: x.chaosValue, listings: x.listingCount, exact: exact.includes(x),
        }));
      }
    }
    return [];
  }

  // ======================================================================
  // Trade API
  // ======================================================================
  let statIndex = null;
  async function stats() {
    if (statIndex) return statIndex;
    const url = `${TRADE}/data/stats`;
    const text = WR.TAURI
      ? await WR.TAURI.core.invoke("http_get_cached", { url, maxAgeSecs: 86400 })
      : await WR.httpGet(url);
    statIndex = new Map();
    for (const group of JSON.parse(text).result) {
      for (const e of group.entries) {
        const k = `${e.type}|${e.text.toLowerCase()}`;
        if (!statIndex.has(k)) statIndex.set(k, e.id);
      }
    }
    return statIndex;
  }

  const NUM = /[+-]?\d+(?:\.\d+)?/g;
  const LOCAL_CLASSES = /Body Armours|Helmets|Gloves|Boots|Shields|Bows|Claws|Daggers|Wands|Swords|Axes|Maces|Sceptres|Staves|Quivers|Warstaves|Flails|Spears/;

  function matchStat(idx, text, type, local) {
    const nums = (text.match(NUM) || []).map(Number);
    const tpl = text.replace(NUM, (m) => (m.startsWith("+") ? "+#" : m.startsWith("-") ? "-#" : "#"));
    const tries = [];
    const variants = [tpl, tpl.replace(/^\+#/, "#")];
    for (const v of variants) {
      if (local) tries.push(`${v} (Local)`);
      tries.push(v);
    }
    const types = type === "explicit" ? ["explicit", "crafted", "fractured"] : [type, "explicit"];
    for (const ty of types) for (const tr of tries) {
      const id = idx.get(`${ty}|${tr.toLowerCase()}`);
      if (id) return { id, nums, negate: false };
    }
    // "reduced" → trade'de "increased" ve negatif değer
    if (/reduced|less/.test(tpl)) {
      const flipped = tpl.replace("reduced", "increased").replace(/\bless\b/, "more");
      for (const ty of types) {
        const id = idx.get(`${ty}|${flipped.toLowerCase()}`) || (local && idx.get(`${ty}|${(flipped + " (Local)").toLowerCase()}`));
        if (id) return { id, nums, negate: true };
      }
    }
    return { id: null, nums, negate: false };
  }

  // Filtre satırları: { id, text, min, max, on, group }
  async function buildModRows(item, spread = 0.1) {
    const idx = await stats();
    const rows = [];
    const local = LOCAL_CLASSES.test(item.cls);
    const isUnique = item.rarity === "Unique";

    // Pseudo toplamlar (APT gibi)
    let life = 0, ele = 0, chaos = 0, es = 0, attr = 0;
    for (const m of [...item.implicits, ...item.mods.map((x) => x.text)]) {
      let x;
      if ((x = /^\+(\d+) to maximum Life$/.exec(m))) life += +x[1];
      if ((x = /^\+(\d+) to Strength$/.exec(m))) life += Math.floor(+x[1] / 2);
      if ((x = /^\+(\d+) to Strength and (Dexterity|Intelligence)$/.exec(m))) life += Math.floor(+x[1] / 2);
      if ((x = /^\+(\d+) to all Attributes$/.exec(m))) { life += Math.floor(+x[1] / 2); attr += 3 * +x[1]; }
      if ((x = /^\+(\d+)% to (Fire|Cold|Lightning) Resistance$/.exec(m))) ele += +x[1];
      if ((x = /^\+(\d+)% to (Fire|Cold|Lightning) and (Fire|Cold|Lightning) Resistances$/.exec(m))) ele += 2 * +x[1];
      if ((x = /^\+(\d+)% to all Elemental Resistances$/.exec(m))) ele += 3 * +x[1];
      if ((x = /^\+(\d+)% to Chaos Resistance$/.exec(m))) chaos += +x[1];
      if ((x = /^\+(\d+)% to (Fire|Cold|Lightning) and Chaos Resistances$/.exec(m))) { ele += +x[1]; chaos += +x[1]; }
      if (!local && (x = /^\+(\d+) to maximum Energy Shield$/.exec(m))) es += +x[1];
    }
    const lo = (v) => Math.floor(v * (1 - spread));
    if (!isUnique) {
      if (life) rows.push({ id: "pseudo.pseudo_total_life", text: `+${life} toplam can (str dahil)`, min: lo(life), max: null, on: true, group: "pseudo" });
      if (ele) rows.push({ id: "pseudo.pseudo_total_elemental_resistance", text: `+%${ele} toplam elemental res`, min: lo(ele), max: null, on: true, group: "pseudo" });
      if (chaos) rows.push({ id: "pseudo.pseudo_total_chaos_resistance", text: `+%${chaos} toplam chaos res`, min: lo(chaos), max: null, on: true, group: "pseudo" });
      if (es) rows.push({ id: "pseudo.pseudo_total_energy_shield", text: `+${es} toplam energy shield`, min: lo(es), max: null, on: false, group: "pseudo" });
    }
    const covered = (t) => rows.length && /to maximum Life$|Resistances?$|to Strength/.test(t);

    const add = (text, type, group, defaultOn) => {
      const m = matchStat(idx, text, type, local);
      let value = m.nums.length ? m.nums.reduce((a, b) => a + b, 0) / m.nums.length : null;
      if (value != null && m.negate) value = -value;
      const min = value == null ? null : value >= 0 ? Math.floor(value * (1 - spread) * 10) / 10 : null;
      const max = value != null && value < 0 ? Math.ceil(value * (1 - spread)) : null;
      rows.push({ id: m.id, text, min: min != null ? Math.floor(min) : null, max, on: !!m.id && defaultOn && !covered(text), group });
    };
    item.enchants.forEach((t) => add(t, "enchant", "enchant", false));
    item.implicits.forEach((t) => add(t, "implicit", "implicit", !isUnique));
    item.mods.forEach((x) => add(x.text, x.kind === "crafted" ? "crafted" : x.kind === "fractured" ? "fractured" : "explicit", x.kind, !isUnique && x.kind !== "crafted"));
    return rows;
  }

  // Trade kategori kimlikleri (taban tipi yerine "herhangi bir X" araması için)
  const CATEGORY = {
    "Body Armours": "armour.chest", Helmets: "armour.helmet", Gloves: "armour.gloves", Boots: "armour.boots",
    Shields: "armour.shield", Quivers: "armour.quiver", Amulets: "accessory.amulet", Rings: "accessory.ring",
    Belts: "accessory.belt", Jewels: "jewel.base", "Abyss Jewels": "jewel.abyss", "Cluster Jewels": "jewel.cluster",
    Bows: "weapon.bow", Claws: "weapon.claw", Daggers: "weapon.dagger", "Rune Daggers": "weapon.runedagger",
    "One Hand Axes": "weapon.oneaxe", "One Hand Maces": "weapon.onemace", "One Hand Swords": "weapon.onesword",
    "Thrusting One Hand Swords": "weapon.onesword", Sceptres: "weapon.sceptre", Staves: "weapon.staff",
    Warstaves: "weapon.warstaff", "Two Hand Axes": "weapon.twoaxe", "Two Hand Maces": "weapon.twomace",
    "Two Hand Swords": "weapon.twosword", Wands: "weapon.wand", Flasks: "flask", Maps: "map",
  };

  // Varsayılan filtre durumu (arayüz bunu değiştirir)
  function defaultFilters(item) {
    const isUnique = item.rarity === "Unique";
    return {
      online: true,
      useBase: item.rarity !== "Magic" || isUnique,
      category: CATEGORY[item.cls] || (/Flask/.test(item.cls) ? "flask" : null),
      ilvl: { on: false, min: item.ilvl || null },
      quality: { on: false, min: item.quality || null },
      links: { on: item.links >= 5, min: item.links || null },
      corrupted: item.corrupted ? "true" : "any",
      influences: Object.fromEntries(item.influences.map((k) => [k, true])),
      fractured: item.fractured, synthesised: item.synthesised,
      pdps: { on: false, min: item.pdps ? Math.floor(item.pdps * 0.9) : null },
      edps: { on: false, min: item.edps ? Math.floor(item.edps * 0.9) : null },
      armour: { on: false, min: item.armour ? Math.floor(item.armour * 0.9) : null },
      evasion: { on: false, min: item.evasion ? Math.floor(item.evasion * 0.9) : null },
      es: { on: false, min: item.es ? Math.floor(item.es * 0.9) : null },
      mapTier: { on: !!item.mapTier, min: item.mapTier || null },
      gemLevel: { on: item.rarity === "Gem", min: item.gemLevel || null },
    };
  }

  function buildQuery(item, f, rows) {
    const q = { status: { option: f.online ? "online" : "any" }, stats: [{ type: "and", filters: [] }], filters: {} };
    const mf = {}, sf = {}, af = {}, wf = {}, mapf = {}, tf = {};
    if (item.rarity === "Unique") { q.name = item.name; q.type = item.base; }
    else if (item.rarity === "Gem" || item.rarity === "Divination Card" || item.rarity === "Currency") q.type = item.name;
    else if (f.useBase && item.rarity !== "Magic") q.type = item.base;
    else if (f.category) tf.category = { option: f.category };
    if (item.rarity === "Rare" && !f.useBase) tf.rarity = { option: "nonunique" };

    const range = (o) => { const r = {}; if (o.min != null && o.min !== "") r.min = Number(o.min); if (o.max != null && o.max !== "") r.max = Number(o.max); return r; };
    if (f.ilvl.on) mf.ilvl = range(f.ilvl);
    if (f.quality.on) mf.quality = range(f.quality);
    if (f.gemLevel.on) mf.gem_level = range(f.gemLevel);
    if (f.corrupted !== "any") mf.corrupted = { option: f.corrupted };
    for (const [k, on] of Object.entries(f.influences)) if (on) mf[k] = { option: "true" };
    if (f.fractured) mf.fractured_item = { option: "true" };
    if (f.synthesised) mf.synthesised_item = { option: "true" };
    if (f.links.on) sf.links = range(f.links);
    if (f.pdps.on) wf.pdps = range(f.pdps);
    if (f.edps.on) wf.edps = range(f.edps);
    if (f.armour.on) af.ar = range(f.armour);
    if (f.evasion.on) af.ev = range(f.evasion);
    if (f.es.on) af.es = range(f.es);
    if (f.mapTier.on) mapf.map_tier = range(f.mapTier);

    if (Object.keys(mf).length) q.filters.misc_filters = { filters: mf };
    if (Object.keys(sf).length) q.filters.socket_filters = { filters: sf };
    if (Object.keys(wf).length) q.filters.weapon_filters = { filters: wf };
    if (Object.keys(af).length) q.filters.armour_filters = { filters: af };
    if (Object.keys(mapf).length) q.filters.map_filters = { filters: mapf };
    if (Object.keys(tf).length) q.filters.type_filters = { filters: tf };

    q.stats[0].filters = rows.filter((r) => r.on && r.id).map((r) => ({ id: r.id, value: range(r) }));
    return { query: q, sort: { price: "asc" } };
  }

  async function tradeSearch(item, f, rows) {
    const league = await WR.getLeague();
    const body = buildQuery(item, f, rows);
    const res = await WR.httpPostJson(`${TRADE}/search/${encodeURIComponent(league)}`, body);
    const url = `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${res.id}`;
    return { id: res.id, url, total: res.total || 0, ids: res.result || [] };
  }

  async function tradeFetch(searchId, ids) {
    if (!ids.length) return [];
    const f = await WR.httpGetJson(`${TRADE}/fetch/${ids.join(",")}?query=${searchId}`);
    return f.result.filter(Boolean).map((r) => ({
      amount: r.listing.price?.amount, currency: r.listing.price?.currency,
      indexed: r.listing.indexed, seller: r.listing.account?.name,
      online: !!r.listing.account?.online, whisper: r.listing.whisper,
      ilvl: r.item?.ilvl, corrupted: !!r.item?.corrupted,
    }));
  }

  // ======================================================================
  // Biçimlendirme
  // ======================================================================
  function fmtPrice(chaos, div) {
    if (chaos == null) return "—";
    if (div && chaos >= div * 0.8) return `${nf.format(chaos / div)} div`;
    return `${nf.format(chaos)} c`;
  }
  // Trade API para birimi kimlikleri → poe.ninja adları
  const CURRENCY_NAMES = {
    alch: "Orb of Alchemy", fusing: "Orb of Fusing", exalted: "Exalted Orb", chance: "Orb of Chance",
    alt: "Orb of Alteration", jewellers: "Jeweller's Orb", chrome: "Chromatic Orb", regal: "Regal Orb",
    vaal: "Vaal Orb", gcp: "Gemcutter's Prism", scour: "Orb of Scouring", annul: "Orb of Annulment",
    mirror: "Mirror of Kalandra", blessed: "Blessed Orb", chisel: "Cartographer's Chisel", regret: "Orb of Regret",
  };
  let rates = { chaos: 1 };
  async function currencyRates() {
    try {
      const c = await ninja("currency", "Currency");
      const byName = new Map(c.lines.map((l) => [l.currencyTypeName, l.chaosEquivalent]));
      rates = { chaos: 1, divine: byName.get("Divine Orb") };
      for (const [id, name] of Object.entries(CURRENCY_NAMES)) if (byName.has(name)) rates[id] = byName.get(name);
    } catch { /* yalnızca chaos/divine ile devam */ }
    return rates;
  }
  function toChaos(l, div) {
    if (l.amount == null) return null;
    if (l.currency === "divine" && div) return l.amount * div;
    const r = rates[l.currency];
    return r != null ? l.amount * r : null;
  }
  function ago(iso) {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${m} dk`;
    if (m < 1440) return `${Math.round(m / 60)} sa`;
    return `${Math.round(m / 1440)} gün`;
  }

  return {
    parseItem, usesNinja, ninjaPrice, divineRate, buildModRows, defaultFilters,
    buildQuery, tradeSearch, tradeFetch, fmtPrice, toChaos, currencyRates, ago, CATEGORY,
  };
})();
