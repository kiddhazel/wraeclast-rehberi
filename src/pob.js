// PoB sekmesi — Path of Building kodlarının sade görünümü.
//
// PoB kodu = base64url( zlib( XML ) ). Çözme tamamen burada yapılır;
// pobb.in / pastebin linkleri için ham kod Rust köprüsüyle indirilir.
(() => {
  "use strict";
  const { el, store, link, toast, compact } = window.WR;

  const st = store("pob:v1", { builds: [], current: null, sel: {} });
  // builds: [{ id, name, code, added }]

  // ---------- Kod çözme ----------
  async function decodePob(code) {
    const clean = code.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = clean + "===".slice((clean.length + 3) % 4);
    const bin = atob(pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return await new Response(stream).text();
  }

  async function resolveInput(input) {
    const s = input.trim();
    let m;
    if ((m = /pobb\.in\/(?:u\/[^/]+\/)?([A-Za-z0-9_-]+)/.exec(s))) {
      return WR.httpGet(`https://pobb.in/${m[1]}/raw`);
    }
    if ((m = /pastebin\.com\/(?:raw\/)?([A-Za-z0-9]+)/.exec(s))) {
      return WR.httpGet(`https://pastebin.com/raw/${m[1]}`);
    }
    return s;
  }

  // ---------- XML ayrıştırma ----------
  const attr = (n, a, d = "") => (n && n.getAttribute(a)) ?? d;

  function parseItemText(raw) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rarityLine = lines.find((l) => l.startsWith("Rarity:")) || "Rarity: NORMAL";
    const rarity = rarityLine.slice(7).trim().toUpperCase();
    const start = lines.indexOf(rarityLine) + 1;
    const name = lines[start] || "?";
    const base = rarity === "NORMAL" || rarity === "MAGIC" ? "" : lines[start + 1] || "";

    const selVariant = (lines.find((l) => l.startsWith("Selected Variant:")) || "").split(":")[1]?.trim();
    const META = /^(Unique ID|Item Level|LevelReq|Quality|Sockets|Variant|Selected Variant|Has Alt Variant|Prefix|Suffix|Crafted|Radius|Limited to|League|Requires|Catalyst|CatalystQuality|Shaper Item|Elder Item|Crusader Item|Redeemer Item|Hunter Item|Warlord Item|Searing Exarch Item|Eater of Worlds Item|Armour|Evasion|Energy Shield|Ward|Block|ArmourBasePercentile|EvasionBasePercentile|EnergyShieldBasePercentile|Foulborn|Talisman Tier|Cluster Jewel Skill|Cluster Jewel Node Count)\b.*:/;
    let implicitCount = 0;
    const mods = [];
    const implicits = [];
    let ilvl = null, sockets = "";
    for (const l of lines.slice(start + (base ? 2 : 1))) {
      if (l.startsWith("Item Level:")) { ilvl = l.split(":")[1].trim(); continue; }
      if (l.startsWith("Sockets:")) { sockets = l.slice(8).trim(); continue; }
      if (l.startsWith("Implicits:")) { implicitCount = parseInt(l.split(":")[1], 10) || 0; continue; }
      if (META.test(l)) continue;
      // {variant:1,2}{crafted}{range:0.5} gibi önekler
      const vm = /\{variant:([\d,]+)\}/.exec(l);
      if (vm && selVariant && !vm[1].split(",").includes(selVariant)) continue;
      const crafted = l.includes("{crafted}");
      const text = l.replace(/\{[^}]*\}/g, "").trim();
      if (!text) continue;
      if (implicitCount > 0) { implicits.push(text); implicitCount--; }
      else mods.push({ text, crafted });
    }
    return { rarity, name, base, ilvl, sockets, implicits, mods };
  }

  function parsePob(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("PoB XML okunamadı");
    const root = doc.documentElement;
    const build = root.querySelector("Build");

    const stats = {};
    build?.querySelectorAll("PlayerStat").forEach((p) => {
      stats[attr(p, "stat")] = parseFloat(attr(p, "value"));
    });

    // Ağaç: birden fazla spec (ör. "Level 30", "Level 70") olabilir.
    const specs = [...root.querySelectorAll("Tree > Spec")].map((s, i) => {
      const ids = (attr(s, "nodes") || "").split(",").filter(Boolean).map(Number);
      const masteryPairs = [...attr(s, "masteryEffects").matchAll(/\{(\d+),(\d+)\}/g)].map((m) => [+m[1], +m[2]]);
      const sockets = [...s.querySelectorAll("Sockets > Socket")]
        .map((so) => ({ node: +attr(so, "nodeId"), item: attr(so, "itemId") }))
        .filter((so) => so.item && so.item !== "0");
      return {
        title: attr(s, "title") || `Ağaç ${i + 1}`,
        url: s.querySelector("URL")?.textContent.trim() || "",
        ids, masteryPairs, sockets,
        nodes: ids.length,
        masteries: masteryPairs.length,
        version: attr(s, "treeVersion"),
      };
    });
    const activeSpec = Math.max(0, (parseInt(attr(root.querySelector("Tree"), "activeSpec", "1"), 10) || 1) - 1);

    // Gem setleri (yeni PoB: SkillSet, eski PoB: doğrudan Skill)
    const skillsEl = root.querySelector("Skills");
    let skillSetEls = [...(skillsEl?.querySelectorAll(":scope > SkillSet") || [])];
    if (!skillSetEls.length && skillsEl) skillSetEls = [skillsEl];
    const skillSets = skillSetEls.map((ss, i) => ({
      title: attr(ss, "title") || (skillSetEls.length > 1 ? `Gem seti ${i + 1}` : "Gem'ler"),
      groups: [...ss.querySelectorAll(":scope > Skill")].map((sk) => ({
        label: attr(sk, "label"),
        slot: attr(sk, "slot"),
        enabled: attr(sk, "enabled", "true") !== "false",
        gems: [...sk.querySelectorAll("Gem")].map((g) => {
          const id = attr(g, "skillId") + " " + attr(g, "gemId");
          return {
            name: attr(g, "nameSpec") || attr(g, "skillId"),
            level: attr(g, "level"),
            quality: attr(g, "quality"),
            enabled: attr(g, "enabled", "true") !== "false",
            support: /Support/i.test(id),
          };
        }),
      })).filter((g) => g.gems.length),
    }));
    const activeSkillSet = Math.max(0, (parseInt(attr(skillsEl, "activeSkillSet", "1"), 10) || 1) - 1);
    const mainGroup = (parseInt(attr(build, "mainSocketGroup", "1"), 10) || 1) - 1;

    // Item'lar ve item setleri
    const itemsEl = root.querySelector("Items");
    const items = {};
    itemsEl?.querySelectorAll(":scope > Item").forEach((it) => {
      items[attr(it, "id")] = parseItemText(it.textContent);
    });
    let itemSetEls = [...(itemsEl?.querySelectorAll(":scope > ItemSet") || [])];
    if (!itemSetEls.length && itemsEl) itemSetEls = [itemsEl];
    const itemSets = itemSetEls.map((s, i) => ({
      title: attr(s, "title") || (itemSetEls.length > 1 ? `Item seti ${i + 1}` : "Ekipman"),
      slots: [...s.querySelectorAll(":scope > Slot")]
        .filter((sl) => attr(sl, "itemId") !== "0" && items[attr(sl, "itemId")])
        .map((sl) => ({ slot: attr(sl, "name"), item: items[attr(sl, "itemId")] })),
    }));
    const activeItemSet = Math.max(0, (parseInt(attr(itemsEl, "activeItemSet", "1"), 10) || 1) - 1);

    return {
      items,
      cls: attr(build, "className"),
      asc: attr(build, "ascendClassName"),
      level: attr(build, "level"),
      bandit: attr(build, "bandit"),
      pantheon: [attr(build, "pantheonMajorGod"), attr(build, "pantheonMinorGod")].filter((x) => x && x !== "None"),
      stats, specs, activeSpec, skillSets, activeSkillSet, mainGroup, itemSets, activeItemSet,
      notes: (root.querySelector("Notes")?.textContent || "").replace(/\^x[0-9A-Fa-f]{6}|\^\d/g, "").trim(),
    };
  }

  // ---------- Görünüm ----------
  // [PoB stat adı, etiket, css sınıfı, biçim]  biçim: n=sayı, p=yüzde, x=çarpan(%), s=saniye başına
  const STAT_GROUPS = [
    ["Hasar", [
      ["FullDPS", "Full DPS", "dps"], ["CombinedDPS", "Toplam DPS", "dps"], ["TotalDPS", "Hit DPS", "dps"],
      ["TotalDotDPS", "DoT DPS", "dps"], ["IgniteDPS", "Ignite DPS", "dps"], ["BleedDPS", "Bleed DPS", "dps"],
      ["PoisonDPS", "Poison DPS", "dps"], ["ImpaleDPS", "Impale DPS", "dps"], ["CullingDPS", "Culling DPS", "dps"],
      ["AverageHit", "Ortalama vuruş"], ["Speed", "Saldırı/büyü hızı", "", "s"],
      ["CritChance", "Kritik şansı", "", "p"], ["CritMultiplier", "Kritik çarpanı", "", "x"],
      ["HitChance", "İsabet şansı", "", "p"], ["ManaCost", "Mana maliyeti"], ["LifeCost", "Can maliyeti"],
    ]],
    ["Savunma", [
      ["Life", "Can", "life"], ["LifeUnreserved", "Rezervesiz can", "life"], ["EnergyShield", "Energy Shield", "es"],
      ["Ward", "Ward"], ["Mana", "Mana", "mana"], ["ManaUnreserved", "Rezervesiz mana", "mana"],
      ["TotalEHP", "Efektif can (EHP)", "life"],
      ["Armour", "Armour"], ["PhysicalDamageReduction", "Fiziksel azaltma", "", "p"], ["Evasion", "Evasion"],
      ["MeleeEvadeChance", "Kaçınma şansı", "", "p"], ["BlockChance", "Block", "", "p"], ["SpellBlockChance", "Spell block", "", "p"],
      ["SpellSuppressionChance", "Spell suppress", "", "p"],
      ["LifeRegenRecovery", "Can yenilenmesi", "life", "s"], ["NetLifeRegen", "Net can yenilenmesi", "life", "s"],
      ["EnergyShieldRegenRecovery", "ES yenilenmesi", "es", "s"], ["ManaRegenRecovery", "Mana yenilenmesi", "mana", "s"],
      ["LifeLeechGainRate", "Can leech", "life", "s"],
    ]],
    ["En büyük alınabilecek vuruş", [
      ["PhysicalMaximumHitTaken", "Fiziksel"], ["FireMaximumHitTaken", "Fire", "fire"],
      ["ColdMaximumHitTaken", "Cold", "cold"], ["LightningMaximumHitTaken", "Lightning", "light"],
      ["ChaosMaximumHitTaken", "Chaos", "chaos"],
    ]],
    ["Dirençler", [
      ["FireResist", "Fire", "fire", "res"], ["ColdResist", "Cold", "cold", "res"],
      ["LightningResist", "Lightning", "light", "res"], ["ChaosResist", "Chaos", "chaos", "res"],
    ]],
    ["Özellikler & charge'lar", [
      ["Str", "Strength"], ["Dex", "Dexterity"], ["Int", "Intelligence"],
      ["EnduranceChargesMax", "Endurance (max)"], ["FrenzyChargesMax", "Frenzy (max)"], ["PowerChargesMax", "Power (max)"],
      ["EffectiveMovementSpeedMod", "Hareket hızı", "", "ms"],
    ]],
  ];
  const DPS_KEYS = [["FullDPS", "Full DPS"], ["CombinedDPS", "Toplam DPS"], ["TotalDotDPS", "DoT DPS"], ["TotalDPS", "Hit DPS"], ["IgniteDPS", "Ignite DPS"]];

  function statValue(fmt, v) {
    if (fmt === "p" || fmt === "res") return `%${Math.round(v * 10) / 10}`;
    if (fmt === "x") return `%${Math.round(v * 100)}`;
    if (fmt === "ms") return `%${Math.round((v - 1) * 100) >= 0 ? "+" : ""}${Math.round((v - 1) * 100)}`;
    if (fmt === "s") return `${compact(v)}/sn`;
    return compact(v);
  }

  function statsSection(b) {
    const wrap = el("div", "stat-groups");
    let any = false;
    for (const [title, rows] of STAT_GROUPS) {
      const grid = el("div", "stat-grid");
      for (const [key, label, cls, fmt] of rows) {
        const v = b.stats[key];
        if (v == null || isNaN(v) || (v === 0 && fmt !== "res")) continue;
        const cell = el("div", `stat ${cls || ""}`);
        let shown = statValue(fmt, v);
        if (fmt === "res") {
          const over = b.stats[key + "OverCap"];
          if (key !== "ChaosResist" && v < 75) cell.classList.add("bad");
          if (over > 0) shown += ` (+${Math.round(over)})`;
        }
        cell.append(el("span", "stat-label", label), el("b", null, shown));
        grid.appendChild(cell);
      }
      if (grid.childElementCount) {
        any = true;
        wrap.append(el("div", "stat-head", title), grid);
      }
    }
    return any ? wrap : el("p", "note warn", "Bu kodda hesaplanmış değer yok. PoB'de build'i açıp bir kez kaydettikten sonra yeniden dışa aktar.");
  }

  // Pasif ağaç bölümü (ağaç verisi yüklenince doldurulur)
  function treeSection(b, spec, sel, rerender) {
    const body = el("div", "tree-body");
    body.appendChild(el("p", "loading", "Pasif ağaç verisi yükleniyor (ilk seferde ~6 MB)…"));
    WR.tree.load().then((data) => {
      body.replaceChildren();
      const sum = WR.tree.summarize(data, spec.ids, spec.masteryPairs);
      const kv = el("div", "tree-stats");
      const stat = (label, v) => { const s = el("span"); s.append(`${label} `, el("b", null, String(v))); kv.appendChild(s); };
      stat("Pasif nokta:", spec.ids.length - sum.ascendancy.length);
      stat("Keystone:", sum.keystones.length);
      stat("Notable:", sum.notables.length);
      stat("Mastery:", sum.masteries.length);
      if (sum.missing) stat("Eşleşmeyen:", sum.missing);
      body.appendChild(kv);
      body.appendChild(WR.tree.view(data, spec.ids));

      const nodeList = (title, list, cls) => {
        if (!list.length) return;
        body.appendChild(el("div", "stat-head", title));
        const ul = el("div", `node-list ${cls}`);
        for (const n of list) {
          const d = el("details", "node-item");
          const s = el("summary", null, n.name);
          s.lang = "en";
          d.appendChild(s);
          const st = el("div", "node-stats");
          st.lang = "en";
          (n.stats || []).forEach((x) => st.appendChild(el("div", null, x)));
          d.appendChild(st);
          ul.appendChild(d);
        }
        body.appendChild(ul);
      };
      nodeList("Ascendancy", sum.ascendancy, "asc");
      nodeList("Keystone'lar", sum.keystones, "keystone");
      nodeList("Mastery seçimleri", sum.masteries, "mastery");
      nodeList("Notable'lar", sum.notables, "notable");

      // Ağaçtaki jewel'lar
      const jewels = spec.sockets.map((so) => b.items[so.item]).filter(Boolean);
      if (jewels.length) {
        body.appendChild(el("div", "stat-head", "Ağaçtaki jewel'lar"));
        const list = el("div", "pob-items");
        jewels.forEach((it) => list.appendChild(itemRow("Jewel", it)));
        body.appendChild(list);
      }
      if (data.version && spec.version && !String(data.version).includes(spec.version.replace("_", "."))) {
        // Sürüm farkı olabilir; bilgi amaçlı
      }
    }).catch((e) => {
      body.replaceChildren(el("p", "note warn", `Ağaç verisi alınamadı: ${e.message || e}`));
    });
    return body;
  }

  function itemRow(slot, item) {
    const d = el("details", `pob-item r-${item.rarity.toLowerCase()}`);
    const sm = el("summary");
    const nm = el("span", "pi-name", item.name);
    nm.lang = "en";
    sm.append(el("span", "pi-slot", slot), nm);
    if (item.base && item.base !== item.name) { const bs = el("span", "pi-base", item.base); bs.lang = "en"; sm.append(bs); }
    d.appendChild(sm);
    const body = el("div", "pi-body");
    body.lang = "en";
    if (item.sockets) body.appendChild(el("div", "pi-sockets", `Sockets: ${item.sockets}`));
    item.implicits.forEach((t) => body.appendChild(el("div", "pi-mod implicit", t)));
    if (item.implicits.length && item.mods.length) body.appendChild(el("hr"));
    item.mods.forEach((m) => body.appendChild(el("div", `pi-mod${m.crafted ? " crafted" : ""}`, m.text)));
    d.appendChild(body);
    return d;
  }

  function selector(label, options, idx, onChange) {
    if (options.length < 2) return null;
    const wrap = el("label", "pob-select");
    wrap.append(el("span", null, label));
    const s = el("select");
    options.forEach((o, i) => { const op = el("option", null, o); op.value = i; s.appendChild(op); });
    s.value = idx;
    s.onchange = () => onChange(parseInt(s.value, 10));
    wrap.appendChild(s);
    return wrap;
  }

  function section(title, open, ...children) {
    const d = el("details", "bsection");
    d.open = open;
    d.appendChild(el("summary", null, title));
    const body = el("div", "bsection-body");
    children.filter(Boolean).forEach((c) => body.appendChild(c));
    d.appendChild(body);
    return d;
  }

  function renderBuild(b, entry) {
    const view = document.getElementById("pob-view");
    view.replaceChildren();
    const sel = st.data.sel[entry.id] || (st.data.sel[entry.id] = {
      spec: b.activeSpec, skills: b.activeSkillSet, items: b.activeItemSet,
    });
    const rerender = () => { st.save(); renderBuild(b, entry); };

    // Başlık
    const head = el("section", "build-head pob-head");
    const top = el("div", "build-top");
    top.lang = "en";
    top.append(el("span", "build-cat", b.asc || b.cls || "Build"), el("span", "build-patch", `Lv ${b.level}`));
    const name = el("h2", "build-name", entry.name);
    name.lang = "en";
    const meta = el("div", "build-by");
    const bits = [b.cls];
    const spaced = (s) => s.replace(/([a-z])([A-Z])/g, "$1 $2"); // "BrineKing" → "Brine King"
    if (b.bandit && b.bandit !== "None") bits.push(`Bandit: ${b.bandit}`);
    if (b.pantheon.length) bits.push(`Pantheon: ${b.pantheon.map(spaced).join(" / ")}`);
    meta.textContent = bits.filter(Boolean).join(" · ");
    head.append(top, name, meta);

    // DPS
    const dps = DPS_KEYS.find(([k]) => b.stats[k] > 0);
    if (dps) {
      const big = el("div", "pob-dps");
      big.append(el("span", "pob-dps-val", compact(b.stats[dps[0]])), el("span", "pob-dps-label", dps[1]));
      head.appendChild(big);
    }
    view.appendChild(head);

    // Değerler
    view.appendChild(section("Değerler", true, statsSection(b)));

    // Gem'ler
    const ss = b.skillSets[sel.skills] || b.skillSets[0];
    const gemWrap = el("div", "gem-groups");
    ss?.groups.forEach((g, gi) => {
      const card = el("div", "gem-group");
      if (!g.enabled) card.classList.add("off");
      if (gi === b.mainGroup && sel.skills === b.activeSkillSet) card.classList.add("main");
      const title = el("div", "gem-group-name", g.label || g.slot || `Grup ${gi + 1}`);
      title.lang = "en";
      if (g.slot && g.label) title.append(el("span", "gem-slot", ` · ${g.slot}`));
      card.appendChild(title);
      const sockets = el("div", "sockets");
      for (const gem of g.gems) {
        const s = el("div", `gem ${gem.support ? "support" : "skill"}`);
        if (!gem.enabled) s.classList.add("off");
        s.lang = "en";
        s.append(el("i"), el("span", null, gem.name));
        const lq = [gem.level && `${gem.level}`, gem.quality && gem.quality !== "0" && `${gem.quality}q`].filter(Boolean).join("/");
        if (lq) s.append(el("small", null, lq));
        sockets.appendChild(s);
      }
      card.appendChild(sockets);
      gemWrap.appendChild(card);
    });
    view.appendChild(section("Gem'ler", true,
      selector("Set:", b.skillSets.map((s) => s.title), sel.skills, (i) => { sel.skills = i; rerender(); }),
      gemWrap));

    // Ekipman
    const is = b.itemSets[sel.items] || b.itemSets[0];
    const list = el("div", "pob-items");
    is?.slots.forEach(({ slot, item }) => list.appendChild(itemRow(slot, item)));
    view.appendChild(section("Ekipman", false,
      selector("Set:", b.itemSets.map((s) => s.title), sel.items, (i) => { sel.items = i; rerender(); }),
      list.childElementCount ? list : el("p", "note", "Item yok.")));

    // Ağaç
    const spec = b.specs[sel.spec] || b.specs[0];
    if (spec) {
      view.appendChild(section("Pasif ağaç", true,
        selector("Ağaç:", b.specs.map((s) => s.title), sel.spec, (i) => { sel.spec = i; rerender(); }),
        treeSection(b, spec, sel, rerender),
        spec.url ? link("Ağacı resmi sitede aç ↗", spec.url) : null));
    }

    // Notlar
    if (b.notes) {
      const pre = el("div", "pob-notes", b.notes);
      view.appendChild(section("Notlar", false, pre));
    }
  }

  // ---------- Kayıtlı build'ler ----------
  function renderList() {
    const bar = document.getElementById("pob-saved");
    bar.replaceChildren();
    for (const b of st.data.builds) {
      const chip = el("button", "cat-btn", b.name);
      if (b.id === st.data.current) chip.classList.add("active");
      chip.onclick = () => { st.data.current = b.id; st.save(); show(); };
      const x = el("span", "chip-x", "✕");
      x.title = "Sil";
      x.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`"${b.name}" silinsin mi?`)) return;
        st.data.builds = st.data.builds.filter((y) => y.id !== b.id);
        delete st.data.sel[b.id];
        if (st.data.current === b.id) st.data.current = st.data.builds[0]?.id ?? null;
        st.save(); show();
      };
      chip.appendChild(x);
      bar.appendChild(chip);
    }
  }

  async function show() {
    renderList();
    const entry = st.data.builds.find((b) => b.id === st.data.current);
    const view = document.getElementById("pob-view");
    if (!entry) {
      view.replaceChildren(el("p", "empty-hint", "PoB kodunu ya da pobb.in / pastebin linkini yukarıya yapıştırıp “Ekle”ye bas."));
      return;
    }
    try {
      renderBuild(parsePob(await decodePob(entry.code)), entry);
    } catch (e) {
      view.replaceChildren(el("p", "note warn", `Build açılamadı: ${e.message || e}`));
    }
  }

  async function addFromInput() {
    const input = document.getElementById("pob-input");
    const btn = document.getElementById("pob-add");
    const val = input.value.trim();
    if (!val) return;
    btn.disabled = true;
    try {
      const code = (await resolveInput(val)).trim();
      const b = parsePob(await decodePob(code));
      const name = [b.asc || b.cls, b.level && `Lv ${b.level}`].filter(Boolean).join(" ") || "Build";
      const id = `b${Date.now()}`;
      st.data.builds.unshift({ id, name, code, added: Date.now() });
      st.data.current = id;
      st.save();
      input.value = "";
      toast("Build eklendi", "ok");
      show();
    } catch (e) {
      toast(`Eklenemedi: ${e.message || e}`, "err");
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById("pob-add").onclick = addFromInput;
  document.getElementById("pob-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addFromInput(); });

  // Test/diğer modüller için
  window.WR.pob = { decodePob, parsePob };
  show();
})();
