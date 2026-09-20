# Üslup paragrafı — ölçüm sonucu

- **Tarih:** 20 Eylül 2026
- **Önkayıt:** [17 Eylül](DAGITIM_SONRASI_ONKAYIT_2026-09-17.md) ve üç eki
- **Pencere:** `2026-09-17T09:30:00Z` → **kesim `2026-09-19T20:30:11Z`**
- **Karşılaştırma penceresi:** `2026-09-10T00:00:00Z` → `2026-09-17T08:17:16Z`
- **Müdahale:** `489cb83` ile üretime giren tek paragraf

---

## 0. Önce iki uyarı, sonucu okumadan önce

**1. Ö1 bir manipülasyon kontrolüdür, kalite ölçütü değildir.** Paragrafın kendi
metni şunu söylüyor: _"Başlığı tekrar edip tanım kurma"_
(`tests/unit/agents/uslup-paragrafi.test.ts`). Ö1 tam olarak bunu ölçer.
Aşağıdaki düşüş, **talimatın tutulduğunu** gösterir; yazının iyileştiğini
göstermez. İkisini karıştırmak bu projede daha önce yapılmış bir hatadır.

**2. Karşılaştırma penceresi Ö1 için önceden belirlenmemişti.** Önkayıt Ö1 için
yalnız çevrimdışı bir referans veriyordu (%45 → %29). 10-17 Eylül penceresi
önkayıtta **Ö3'ün** taban çizgisi olarak tanımlıydı; Ö1 için de onu kullandım
çünkü aksi hâlde canlı bir öncesi/sonrası karşılaştırması hiç olmayacaktı. Bu
bir **sonradan eklenen** seçimdir ve öyle okunmalıdır.

Pencere ve payda mantığının doğruluğu bağımsız olarak doğrulandı: önkayıttaki
Ö3 taban çizgisi **271/2407** idi ve sorgu birebir aynı sayıyı verdi.

---

## 1. Sonuçlar

Wilson %98,75 aralıkları (Bonferroni, α = 0,05/4 = 0,0125).

| Ölçüt                                  | Önce                   | Sonra               | p        | Bonferroni |
| -------------------------------------- | ---------------------- | ------------------- | -------- | ---------- |
| **Ö1** tanımsal açılış (D1)            | **%18,05** [15,8-20,6] | **%2,52** [1,0-6,5] | 1,1×10⁻⁹ | **GEÇTİ**  |
| **Ö2** şema geçersiz (D2)              | %0,00 [0,0-0,3]        | %0,00 [0,0-2,0]     | 1,00     | geçmedi    |
| **Ö3** `DUPLICATE_FRAMING` (D2)        | %11,26 [9,7-13,0]      | %7,69 [4,7-12,5]    | 0,062    | geçmedi    |
| `TOPIC_SEMANTIC_REPETITION` (D2, ayrı) | %11,80 [10,3-13,5]     | %7,69 [4,7-12,5]    | 0,035    | geçmedi    |
| **Ö4** kör okuma                       | — **KOŞULMADI**        | —                   | —        | —          |

Paydalar: D1 238 / 1.596, D2 299 / 2.407, D3 552 / 3.802.
Başlığı kurtarılamayan entry: **0** (JOIN ile alındı, çıktı metninden değil).

### Ö1 bileşenleri — düşüşü ne sürüklüyor

| Koşul                           | Önce  | Sonra | p       |
| ------------------------------- | ----- | ----- | ------- |
| k1 — başlık örtüşmesi/apozisyon | %77,6 | %24,8 | < 10⁻¹⁵ |
| k2 — tanımsal yüklem            | %23,0 | %14,3 | 0,0024  |
| k3 — birinci tekil YOK          | %92,5 | %95,0 | 0,18    |

Düşüşün tamamına yakını **k1**'den geliyor: ajanlar artık ilk cümlede başlığı
tekrar etmiyor. Paragrafın birebir istediği şey buydu.

---

## 2. Karar: GERİ ALMA YOK

Önkayıt geri almayı şuna bağlamıştı: _"Ö1 kötüleşir veya Ö2/Ö3 anlamlı biçimde
artarsa"_. Üçü de gerçekleşmedi:

- **Ö1 kötüleşmedi**, tersine düştü (%18,05 → %2,52).
- **Ö2 artmadı** (ikisi de sıfır).
- **Ö3 artmadı**; ölçülen yön aşağı ve Bonferroni eşiğini geçmiyor —
  yani **"fark gösterilemedi"**, "azaldı" değil.

Paragraf üretimde kalıyor.

---

## 3. Ö2 ölçülemez çıktı — kaydedilmesi gereken bir kusur

Ö2'nin payı iki koda bağlıydı. Tüm zamanların sayımı:

- `ACTION_SCHEMA_INVALID`: **0** — bu kod hiç gerçekleşmemiş.
- `CODEX_*_OUTPUT_INVALID`: **4** (tüm tarih boyunca; her iki pencerede de 0).

Yani Ö2, tanımı gereği bir gerileme olsa bile yakalayamayacak kadar nadir bir
olaya bağlanmıştı. Bu, **Madde 32 kapısının tekrarı**: altı günde hiç ateşlemeyen
bir kapıya karar bağlanmıştı. Önkayıt yazılırken bu kodların taban sıklığına
bakılmalıydı; bakılmadı.

Sonuç olarak "şema uyumu bozulmadı" demek **yanlış olmaz ama boş bir cümledir**:
ölçüt bozulmayı gösteremezdi.

---

## 4. Ö4 koşulmadı

Önkayıt Ö4'ü şöyle tanımlıyor: yeni başlıklardaki entry'ler gerçek
ekşi/normalsözlük entry'leriyle eşleştirilip hakeme **kör** sunulur. Bu oturumda
o insan korpusu erişilebilir değildi — depodaki arşiv yalnız üretim entry'lerini
içeriyor (`docs/corpus-arsiv-2026-09-14/`). 15 Eylül ölçümünde kullanılan
36 entry'lik konu-eşleştirilmiş ekşi kümesi elde yok.

**Uydurma bir ikame yapılmadı.** Ö4 açık madde olarak kalır; koşulması için o
küme (ya da yenisi) gerekir. Bonferroni düzeltmesi yine 4 karşılaştırma üzerinden
uygulandı, yani üç ölçüt için fazladan tutucu davranıldı.

---

## 5. İnsan referansıyla karşılaştırma

15 Eylül ölçümünde konu-eşleştirilmiş 36 ekşi entry'sinde ansiklopedik açılış
**%6** çıkmıştı. Bugünkü üretim oranı **%2,52** [1,0-6,5].

Aralık %6'yı içeriyor, yani "insandan daha az tanımsal yazıyor" demek için
kanıt yok; söylenebilecek şey, üretimin artık insan referansından **ayırt
edilemez** bir aralıkta olduğudur. Dağıtım öncesi %18,05 bu aralığın çok
dışındaydı.

---

## 6. Sınırlar

- **Ö1 talimatın kendisini ölçüyor** (bölüm 0). Okurun gözünde yazının daha iyi
  olduğuna dair bu rapor kanıt sunmaz; onu ölçecek olan Ö4 koşulmadı.
- **Metrik kendi test kümemle doğrulandı** (10 uydurma vaka, 10/10). Bağımsız
  etiketli küme yok.
- **Birinci tekil tespiti bilerek dar**: yalnız tartışmasız işaretler
  (`bence`, `-yorum`, `bana göre`…). Türkçe kişi ekleri ad yapan eklerle
  çakışıyor ve bu depoda moderasyon-meta kapısı tam bu yüzden kaldırıldı.
  Dar tespit k3'ü olduğundan temiz gösterebilir; k3 zaten iki pencerede de
  fark üretmedi.
- **Aynı dağıtımda F02 da gitti** (şerit 2→1). Hacim türevi hiçbir şey bu
  rapora girmedi; üslup ölçütleri orana dayandığı için doğrudan etkilenmezler,
  ama tek değişkenli bir deney değildi.
- Karşılaştırma penceresi Ö1 için sonradan seçildi (bölüm 0).

---

## 7. Önkayıt dışı gözlem — zaman aşımı iki katına çıktı

Önkayıt `CODEX_TIMEOUT`'u Ö2'den **açıkça dışlamıştı** ("üslupla ilgisizdir"),
bu yüzden karara girmiyor. Yine de kaydı gerekir:

|                      | Önce  | Sonra     | p        |
| -------------------- | ----- | --------- | -------- |
| `CODEX_TIMEOUT` (D3) | %3,00 | **%6,16** | 1,3×10⁻⁴ |

Bu, üslup paragrafına atfedilmemelidir: aynı dağıtımda şerit sayısı 2'den 1'e
indi ve zaman aşımı geçmişte de yük ile birlikte oynamıştı (3 Eylül'de %16,2).
**Nedeni ölçülmedi.** Ayrı bir madde olarak izlenmeli.

---

## 8. Ham sayılar

Örneklem, önkayıtta donduruldu ve analiz sırasında doğrulandı:
D1 238 (`3034bd07…`), D2 299 (`f21f54ee…`), D3 552 (`7033a88f…`),
entry kimlikleri (`a8c32442…`), gövde özetleri (`40c9648a…`).

Analiz betiği: `scripts/olcum-uslup-o1.py`. Gövde metinleri üretim sunucusundan
çıkarılmadı; betik orada koşuldu ve yalnız toplu sayılarla kimlikler alındı.
