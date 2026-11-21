// Build rehberleri.
//
// Her build bir "category" altında listelenir. Bölümler (sections) şu blok
// türlerinden oluşur:
//   { type: "kv",    rows: [["Etiket", "Değer"], ...] }
//   { type: "list",  items: ["...", ...] }
//   { type: "check", id, items: ["...", ...] }      → işaretlenebilir, kaydedilir
//   { type: "gems",  groups: [{ name, note?, gems: [["Gem", "skill"|"support"|"aura"]] }] }
//   { type: "craft", id, title, url, updated, base, target: [...], steps: [...] }
//   { type: "links", items: [["Etiket", "https://..."], ...] }
//   { type: "note",  text, tone?: "warn" }
//
// İçerik kaynak sitelerden kendi cümlelerimizle özetlenmiştir; ayrıntı ve
// güncel PoB için her zaman kaynağa bakılmalı.

window.BUILDS = [
  {
    id: "pohx-rf",
    category: "Righteous Fire",
    name: "RF Chieftain",
    author: "Pohx",
    patch: "3.30 · Covens of the Umbra",
    updated: "13.11.2026",
    source: "https://pohx.net/",
    summary:
      "Kendini yakarak etrafındaki her şeyi yakan, can yenilenmesiyle ayakta kalan dayanıklı bir mapper. Lig başı için ucuz, Uber'lere kadar ölçeklenir.",
    sections: [
      {
        id: "overview",
        title: "Genel bakış",
        blocks: [
          {
            type: "kv",
            rows: [
              ["Ascendancy", "Chieftain (önerilen)"],
              ["Alternatifler", "Juggernaut, Inquisitor, Elementalist, Hierophant, Scion, Trickster"],
              ["Güçlü olduğu", "Harvest, Breach, Expedition, Shrine, Abyss, Delve, Blight"],
              ["Zayıf olduğu", "Sanctum, Uber bosslara tek hedef hasarı (SRI totem varyantı yardımcı olur)"],
              ["Savunma", "Block (Shaper kalkanı, block'ta % can), Consecrated Ground, endurance charge"],
            ],
          },
          {
            type: "note",
            text: "Ascendancy sırası ve pasif ağaç adımları sitede yazılı değil; PoB dosyasında ve Act videolarında. Güncel PoB için pohx.net'teki 'Suggested Build' bağlantısını kullan.",
          },
        ],
      },
      {
        id: "leveling",
        title: "Leveling",
        lang: "en",
        blocks: [
          {
            type: "list",
            items: [
              "Act 1–10 için Chieftain, Juggernaut ve Inquisitor video rehberleri var (aşağıdaki bağlantılar).",
              "Gem'ler için 'mule': bir Witch'i lvl 4'e kadar oynayıp gem'leri al. Inquisitor ile mule olmadan da hızlı gidilir.",
              "RF'e geçiş seviyeye değil resiste bağlı: Fire Mastery ile birlikte yaklaşık %120+ fire res hedefle.",
              "Fire Multi'yi erken seviyele, ekipman oturunca +gem'li parçalara geç.",
              "Faydalı leveling unique'leri: Pyre (yüzük), Kikazaru, Replica Atziri's Foible, Death's Rush, Berek's Respite.",
            ],
          },
          {
            type: "links",
            items: [["Act videoları ve rehber (pohx.net)", "https://pohx.net/"]],
          },
        ],
      },
      {
        id: "gems",
        title: "Gem kurulumları",
        blocks: [
          {
            type: "gems",
            groups: [
              {
                name: "Righteous Fire — 6L (göğüs zırhı)",
                gems: [
                  ["Righteous Fire", "skill"],
                  ["Burning Damage", "support"],
                  ["Elemental Focus", "support"],
                  ["Increased Area of Effect / Efficacy", "support"],
                  ["Lifetap", "support"],
                  ["Swift Affliction", "support"],
                ],
              },
              {
                name: "RF kaskta ise",
                note: "Burning Damage ve AoE kaskın kendi mod'larından gelirse:",
                gems: [
                  ["Righteous Fire", "skill"],
                  ["Empower (lvl 4)", "support"],
                  ["Efficacy", "support"],
                ],
              },
              {
                name: "Fire Trap",
                note: "Lvl 20 gem'e Vaal Orb atıp 21 yapmak ciddi fark eder.",
                gems: [
                  ["Fire Trap", "skill"],
                  ["Lifetap", "support"],
                  ["Swift Affliction", "support"],
                  ["Controlled Destruction", "support"],
                ],
              },
            ],
          },
          {
            type: "note",
            text: "Takaslar lige göre değişebiliyor; son hâli her zaman sitedeki PoB'de.",
          },
        ],
      },
      {
        id: "gear",
        title: "Ekipman sırası",
        blocks: [
          {
            type: "check",
            id: "pohx-rf-gear",
            items: [
              "Dawnbreaker ya da (erken) Rise of the Phoenix",
              "Immortal Flesh (kemer)",
              "Eldivende ignite yayılma (Embers) mod'u",
              "5/6-link RF göğüs — tercihen Cloak of Flame",
              "Elder RF kaskı (craft aşağıda)",
              "Shaper kalkanı, block'ta % can",
              "Nebulis — 8% roll'lu olanı ara",
            ],
          },
        ],
      },
      {
        id: "targets",
        title: "Hedef değerler",
        blocks: [
          {
            type: "kv",
            rows: [
              ["Max elemental res", "%90"],
              ["Fire res (Uber Lab sonrası)", "130+"],
              ["Chaos res", "%50 üstü"],
              ["Kritik hasar azaltma", "%30"],
              ["Can", "~7.000+"],
              ["Can yenilenmesi (Chief)", "~800–1.400 / sn"],
              ["Armour (Chief)", "10–20 bin"],
            ],
          },
        ],
      },
      {
        id: "crafts",
        title: "Craftlar",
        blocks: [
          {
            type: "note",
            tone: "warn",
            text: "3.30'da recombinator ciddi şekilde zayıflatıldı; recomb craftları sitede de 'test edilmedi' olarak işaretli.",
          },
          {
            type: "craft",
            id: "starter-body",
            title: "Başlangıç göğüs zırhı",
            url: "https://pohx.net/crafts/starter-body-armor/",
            updated: "11.11.2026",
            base: "Yüksek armour'lu hibrit taban (Elegant Ringmail, Saint's Hauberk)",
            target: ["1.000+ armour", "Fire / chaos res"],
            steps: [
              "15+ Primitive Chaotic Resonator + Dense Fossil ile savunma rolle (chaos için Screaming Essence of Envy).",
              "Bench: +armour, % armour, fire/chaos res.",
              "%20 quality'ye çıkar.",
            ],
          },
          {
            type: "craft",
            id: "elder-helm",
            title: "Elder RF kaskı",
            url: "https://pohx.net/crafts/elder-rf-helmet/",
            updated: "12.11.2026",
            base: "ilvl 82+ Elder, saf armour kask",
            target: ["Burning Damage (herhangi bir tier)", "Socketed gems +%30 elemental damage", "+70 can ve üstü", "İsteğe bağlı: Concentrated Effect"],
            steps: [
              "Burning Damage gelene kadar Essence of Horror; araya bench prefix ve Exalt koy.",
              "Suffix'ler eksikse Farric Lynx Alpha ile doldur.",
              "Wild Bristle Matron ile 'Suffixes Cannot Be Changed' zorla, sonra Harvest Reforge Life.",
              ">70 can gelince dur — her denemede ~%3,3 bozma riski var.",
              "AoE eşiği için bench'ten +1 AoE gem craftla.",
            ],
          },
          {
            type: "craft",
            id: "rings",
            title: "Yüzükler",
            url: "https://pohx.net/crafts/rings/",
            updated: "11.11.2026",
            base: "Fracture'lı Vermillion / Ruby / Two-Stone / Amethyst",
            target: ["İyi fracture: 40+ dex, 80+ can, %38+ fire res, %20+ chaos res"],
            steps: [
              "Screaming Essence of Anger (30+) ya da Yellow Lifeforce ile Reforge Chaos.",
              "Bench: can, fire/chaos res, increased damage, minimum frenzy.",
              "İsteğe bağlı (pahalı): catalyst veya Essence of Delirium ile DoT multi.",
            ],
          },
          {
            type: "craft",
            id: "recomb-amulet",
            title: "Endgame recomb kolye",
            url: "https://pohx.net/crafts/endgame-recomb-amulet/",
            updated: "12.11.2026",
            base: "ilvl 82+ Jade / Turquoise / Citrine / Marble",
            target: ["+1 fire gem", "%20+ DoT multi"],
            steps: [
              "Bir kolyede +1 fire gem, diğerinde T1–T2 DoT multi izole et (gerekirse Annulment).",
              "İkisini recombinator'da birleştir.",
              "Regal → Farric Wolf Alpha ile suffix sil → gerekirse mana → Bestiary craft.",
              "Bench: can, fire/chaos res, minimum frenzy, dex.",
              "Bütçe: ~1.000–1.500 Alteration, 5–10 Annulment.",
            ],
          },
          {
            type: "craft",
            id: "recomb-sceptre",
            title: "Recomb asa (sceptre)",
            url: "https://pohx.net/crafts/recomb-sceptre/",
            updated: "",
            base: "ilvl 84 Void Sceptre",
            target: ["%20+ DoT multi", "+fire DoT multi", "Ignite şanslı increased fire damage"],
            steps: [
              "Alteration ile magic rolle, regex ile Augmentation ekle.",
              "İsteğe bağlı: Craicic Croaker ile imprint, kötü mod'u Annul et.",
              "Harvest ile uygun mod'ları fire versiyonlarına çevir.",
              "Ucuz alternatif: normal Void Sceptre + toplam %40+ quality fire gem'leri vendor'a → +1 fire spell.",
            ],
          },
          {
            type: "links",
            items: [["Tüm craft sayfaları (eldiven, bot, kalkan, kemer, jewel…)", "https://pohx.net/crafts"]],
          },
        ],
      },
      {
        id: "flasks",
        title: "Flask & Pantheon",
        blocks: [
          {
            type: "list",
            items: [
              "Ruby (90% max res'e ulaşınca Quartz ya da Sulphur'a geç), Quicksilver, Granite. Son ikisi esnek; chaos res iyileşene kadar biri Amethyst.",
              "'Gain charges on hit' flask: Alteration + bench'te Instilling Orb ile 'Use when full charges'. Charge sayısı ilvl'e bağlı: 29 → 1, 63 → 2, 80 → 3.",
              "Maven ışınları için burn/ignite kaldıran flask taşı — yanlışlıkla basarsan RF'i de kapatır.",
              "Pantheon: Brine King (erken freeze bağışıklığı) veya Arakaali; minor'da Ralakesh (bleed) ya da Lunaris.",
            ],
          },
        ],
      },
      {
        id: "budget",
        title: "Bütçe kademeleri",
        blocks: [
          {
            type: "kv",
            rows: [
              ["İlk 2 voidstone", "< 1 divine (basit rare'ler)"],
              ["Uber Elder & Maven", "< 10 divine"],
              ["Simulacrum / T17", "30+ divine"],
              ["Uber bosslar", "50+ divine"],
              ["Mageblood / Adorned", "~300+ divine"],
            ],
          },
        ],
      },
      {
        id: "mapping",
        title: "Harita & Atlas",
        blocks: [
          {
            type: "list",
            items: [
              "Kaçın: No Regeneration, Reduced effect of non-Curse Auras, Less Recovery (white map'te sorun değil).",
              "Riskli: Max Elemental Resistance azaltan, %70 ailment kaçınma, ek chaos hasarı, endurance charge çalan canavarlar.",
              "Guardian'larda Consecrated Ground ve life-as-ES mod'ları tolere edilir.",
              "Erken atlas: shrine ve magic canavar odaklı. Geç oyun: Expedition, Mausoleum / Dunes.",
            ],
          },
          {
            type: "links",
            items: [
              ["Atlas ağaçları (pohx.net/atlas)", "https://pohx.net/atlas"],
              ["SSS / FAQ", "https://pohx.net/faq"],
              ["Path of Building Community", "https://pathofbuilding.community/"],
            ],
          },
        ],
      },
    ],
  },
];
