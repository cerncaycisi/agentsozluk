# Backlog

Tüm açık işlerin tek kuyruğu. **Bu dosya iş listesidir** — karar bekleyen şeyler
[`GOKHAN_ICIN.md`](GOKHAN_ICIN.md) dosyasında, karışmasın.

Komşu dosyalar: [`STATUS.md`](STATUS.md) milestone geçmişi, [`DECISIONS.md`](DECISIONS.md)
mimari kararlar (ADR), [`AGENT_API_BACKLOG.md`](AGENT_API_BACKLOG.md) yalnız API kapsamı.

Son güncelleme: 2026-08-20

> **Bakım kuralı — 2026-08-21'de iki kez bozulduğu için yazıldı.**
> Bir maddenin durumu, **o işi taşıyan commit'in içinde** güncellenir. Ayrı bir "tahtayı
> topla" adımı yok, çünkü o adım iki kez atlandı: iş beş dala dağılınca sonda hafızadan
> güncellemek tutmuyor.
>
> Pratikte: `git commit` öncesi ilgili satırı ✅ yap, aynı commit'e koy. Satır
> güncellenmemişse iş de commit'lenmemiş sayılır. Böyle kurulunca fail-closed olur —
> unutmak, işi durdurur; sessizce yanlış tahta üretmez.

> **Denetim kuralı — 21 Ağu'da tahta üçüncü kez bayatladığı için yazıldı.**
> Bakım kuralı ("durum işi taşıyan commit'te güncellenir") yalnız **bundan sonrası**
> için çalışıyor; kuraldan önceki commit'ler tahtayı güncellemeden geçmişti. C1, C2 ve
> C3 dün gece `fcad8d2` ile kapanmış, tahtada üçü de "açık" duruyordu — üç iş boşuna
> sıraya alınmıştı.
>
> Pratikte: bir maddeye başlamadan önce **iddiasını doğrula**. Madde dosya/satır
> gösteriyorsa oraya bak; kod zaten düzelmişse maddeyi kanıtıyla kapat, işe başlama.
> Maliyeti bir grep, alternatifi bitmiş işi yeniden yapmak.

> **Ağaç kuralı — 2026-08-21'de iki kez ihlal edildiği için yazıldı.**
> Paralel ajanlar çalışırken **`git add -A` ve `git checkout -B` YASAK.** Ajanlara ayrık
> dosya sahipliği vermek yeterli değil: dosyalar ayrı olsa da **git ağacı ortak**. Birinci
> ihlalde bir ajan `git reset` çekip diğerinin bitmiş işini sildi. İkinci ihlalde ben
> `git add -A` çalıştırıp cila ajanının beş dosyasını rollout commit'ime süpürdüm ve
> `checkout -B` ile HEAD'i altından çektim.
>
> Pratikte: ajan koşarken commit yalnız **açıkça sayılan yollarla** yapılır
> (`git add docs/BACKLOG.md src/...`). Dal değiştirmek ajanlar bitene kadar bekler.
> Ayrık ağaç gerekiyorsa `git worktree`, dal adı değil.

**Durum anahtarı:** `▶ çalışıyor` · `⏸ sırada` · `✅ bitti` · `🔒 karar bekliyor` · `⛔ kapsam dışı`

---

## Akış 1 — UI / Tasarım

Kaynak: [`DESIGN_PLAN_NEXT_2026-08-20.md`](DESIGN_PLAN_NEXT_2026-08-20.md)

### P0 — Yerleşim ve hiyerarşi

D1-D5 atomları düzeltti (yazı tipi, ağırlık, yarıçap, gölge, satır uzunluğu) ama
_düzen_ hiç ele alınmadı. Süsleme kalkınca altındaki düz yerleşim ortaya çıktı.

|      | iş                                                          | durum                | sahip olduğu dosyalar                                                   |
| ---- | ----------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| P0.1 | Başlık sayfası başlığı: 6 satır → 1 satır                   | ✅ **240px → 106px** | `app/baslik/[topic]/page.tsx` (`<header>`), `components/topics/**`      |
| P0.3 | Sol kolon: hover/aktif dili, scrollbar, yükseklik, genişlik | ✅                   | `components/layout/site-shell.tsx`                                      |
| P0.4 | Moderasyon: çift gezinme, yanlış genişlik, alakasız sidebar | ✅                   | `components/moderation/**`, `config/navigation.ts`, `app/moderasyon/**` |
| P0.5 | İki composer'ı eşitle                                       | ✅                   | `app/baslik/ac/page.tsx`, `components/entries/create-entry-form.tsx`    |
| P0.6 | Etkileşim durumları: hover/focus/active/disabled sistemi    | ✅                   | `app/globals.css` (tek sahip), `entry-actions.tsx`, `entry-preview.tsx` |

**Çakışma kuralı:** `globals.css`'in tek sahibi P0.6. Diğerleri paylaşılan sınıf
gerekirse Tailwind satır içi çözüp raporlar.

### P0.7 — Başlık açma akışı komple yanlış (yeni, Gökhan'ın bulgusu)

> _"başlık aranır yoksa açılır. ayrı bi başlık aç sayfası hiçbi sözlükte yoktur"_

**Bugünkü durum (doğrulandı):**

- `/baslik/ac` ayrı bir sayfa; ona **tek giriş hesap menüsündeki bir link**
  (`account-menu.tsx:51`). Header'da, arama sonucunda, hiçbir yerde yok.
- Aramada sonuç çıkmazsa `/ara` _"Aramanızla eşleşen sonuç bulunamadı."_ deyip duruyor
  (`ara/page.tsx:139`). **Çıkmaz sokak.**

**Benchmark — ekşi sözlük, girişli oturumda ölçüldü (2026-08-20):**

Olmayan bir başlık arandığında `/?q=<başlık>` şunu render ediyor:

```
zxqwasdf bulunmayan baslik denemesi        ← aranan metin, h1 olarak
ekşi sözlük'te böyle bir başlık yok.
[ biri bu başlığı doldursun ]              ← yayınla-başkası-yazsın
┌──────────────────────────────────────┐
│ (bkz: ) hede * -spoiler- http:// görsel│  ← composer, yerinde
│ "zxqwasdf …" hakkında bilgi verin      │
└──────────────────────────────────────┘
[ kenarda dursun ▾ ]  [ yolla ]
```

**Çıkarılan desen — bizim yaptığımızdan çok daha radikal:**

1. **Ayrı bir "başlık aç" sayfası yok.** Gezinmede de yok, hiçbir yerde yok.
2. **Ayrı bir "başlık" alanı da yok.** Arama kutusu başlık alanının kendisi. Kullanıcı
   başlığı iki kez yazmıyor.
3. **Olmayan başlık, sıfır entry'li bir başlık sayfası olarak render ediliyor.** Aynı h1
   konumu, aynı yerleşim, altta aynı composer. "Boş başlık" ayrı bir ekran değil, normal
   başlık sayfasının bir durumu.
4. **Başlık oluşturma diye bir eylem yok — ilk entry'yi yazmanın yan etkisi.**
5. Yazmak istemeyene çıkış var: _"biri bu başlığı doldursun"_.

**DÜZELTME — 2026-08-21:** "Arama çıkmaz sokak" tespiti **yarı yanlıştı.** Header
otomatik tamamlamasında akış **zaten var**: `search-autocomplete.tsx:130` eşleşme yoksa
`«X» başlığını aç` satırı sunuyor, `/baslik/ac?title=X`'e bağlıyor, `prefill-topic-title.tsx`
formu dolduruyor, ve E2E testi de var (`public.spec.ts:397`). Çıkmaz sokak olan yalnız
**`/ara` sonuç sayfası** — orada hiçbir teklif yok.

**Yapılacak:**

- Arama sonucu boşsa `/ara`'yı çıkmaz sokak olmaktan çıkar: aranan metni başlık gibi
  göster, altına composer koy.
- Başlık oluşturmayı ilk entry gönderiminin yan etkisi yap; ayrı başlık alanı olmasın.
- `/baslik/ac`'ın kalıp kalmayacağı ayrı karar — **kalsa bile birincil yol arama olmalı**
  ve hesap menüsündeki gizli link birincil yol olamaz.

**Bağımlılık:** P0.5'te ayıklanan `EntryComposerField` burada kullanılacak.

**Dikkat — yönlendirme sorunu:** bizim başlık sayfalarımız `/baslik/slug--id`, ama
yazılmamış bir başlığın id'si yok. Boş durum arama URL'inde yaşamak zorunda, ekşi'deki
gibi. Bu, `create-topic-form.tsx`'in mevcut çift alanlı (başlık + ilk entry) yapısını
ortadan kaldırır.

### Sıradakiler

|     | iş                                                                     | durum | not                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2  | Tema düğmesi: 3 durum → 2 (güneş/ay), sisteme dönüş ayarlara           | ✅    | `system` dalı korundu (unit + e2e ile kanıtlandı). Tema mantığı `src/lib/theme/preference.ts`'e ayıklandı                                                                                                                                                                                                                                                        |
| P1  | Paylaşım: sosyal kanallar (X, WhatsApp, LinkedIn, Facebook)            | ✅    | P0.1'in `⋮` yapısına bağlı. Kapsamı ben daralmıştım, geri alınıyor                                                                                                                                                                                                                                                                                               |
| P3  | Koyu temayı ayarlandı                                                  | ✅    | `page`/`surface` **1.075 → 1.118**. Birincil buton ışık payı %12,6 azaldı (17,83×→15,59×, gerçek piksel). 73 çiftlik tablo: `scratchpad/KONTRAST-TABLOSU.md`. **Tavan yapısal** — ayrı `--primary-fill` gerekiyor → P6                                                                                                                                           |
| E1  | "Bugünkü" sayaçları aslında lifetime toplamı                           | ✅    | **Doğrulandı.** Gün penceresi hiç yok; `todayPublishedEntries` monoton artıyor, sıfırlama yok. `todayDate` kolonu var ama yalnız agent oluşturulurken yazılıyor, hiç okunmuyor — rollover kodu yazılmamış. `576` yanlış bir "bugün" değil, doğru bir lifetime. İki seçenek: etiketi "Toplam" yap (tek satır, risksiz) veya rollover ekle (migration gerekebilir) |
| E2  | Worker heartbeat: "görünmüyor" ile "roster stale" ayrı durumlar olmalı | ✅    | **Doğrulandı.** Kodda üç ayrı heartbeat var; rozet (`agent-kapasite/page.tsx:113`) yalnız roster sync'e bağlı. Lease yaşları `executionSlots`'ta zaten mevcut — **saf sunum işi**, yeni sorgu gerekmiyor                                                                                                                                                         |
| S4  | **Üçüncü yazma yüzeyi**: entry düzenleme formu                         | ✅    | #33 — `EntryComposerField`'a geçti, `ENTRY_BODY_MAX_LENGTH`'in 3. kopyası silindi. Yan kazanç: düzenlerken önizleme geldi                                                                                                                                                                                                                                        |
| S5  | bkz şeridi düğmelerinin kenarlığı 3:1'in altında                       | ✅    | `writing-guidance.tsx` — açık 1,22:1, koyu 1,38:1. Önceden de eşiğin altındaydı (1,36) ama kart kalkınca açık temada düştü. Çözüm: `field-border`                                                                                                                                                                                                                |
| S6  | `baslik/[topic]/page.tsx` kardeş durumları hâlâ `surface-card`         | ✅    | #33 — üçü de `border-t` ritmine geçti                                                                                                                                                                                                                                                                                                                            |
| S7  | Yerel dev DB'sinde test verisi kaldı                                   | ✅    | #33 — iki test raporu + önbellek kayıtları silindi; seed'in 30 başlık/180 entry'si duruyor                                                                                                                                                                                                                                                                       |
| S2  | `.chip` durum göstergesi 3:1'in altındaydı                             | ✅    | **Teşhis kaydı:** durgun çipe kenarlık verilmedi (`.button-secondary` aynı ailede). Asıl açık **seçili** durumdaydı: `.chip-active` 1.715/2.262, SC 1.4.11 3:1 istiyor. Merdiven 0.7→0.85→1.0, en düşük 3.058                                                                                                                                                    |
| S3  | Zaman etiketi iki kez görünüyor                                        | ✅    | #33 — eyebrow sadeleşti; tetikleyicinin etiketi bir kontrolün durumu, eyebrow yalnız sayaç                                                                                                                                                                                                                                                                       |
| S10 | **`text-link` ölü bir sınıf**                                          | ✅    | `/kurallar` dizini → `.link-quiet` (52 maddeyi kiremite çevirmek dizini en renkli blok yapardı), `/hakkinda` CTA + anayasa `#` ve gövde içi → `.link-strong`. **Spec düzeltmesi:** `:85`'in zaten alt çizgisi vardı, ihlal `:34`'teymiş                                                                                                                          |
| S16 | **38 ölü renk sınıfı, 12 dosya**                                       | ✅    | `success`/`warning` paletle hiç yoktu; derlenmiş CSS'e karşı doğrulandı. Dört tema bloğuna da eklendi, 38 kullanım derleniyor, hepsi WCAG 1.4.1 için denetlendi (renk hiçbirinde tek ipucu değil). **Asıl düzeltme yeni `design-tokens.test.ts`** — negatif testi yapıldı, bir sınıf bir daha sessizce ölemez                                                    |
| S11 | Örtüyü geometriden ayıran bir sınıf gerek                              | ✅    | `.state-layer` — yalnız durum katmanı. `.menu-item` olduğu gibi kaldı (Radix `data-highlighted`). Son iki `hover:bg-page` taşındı, koyuda artık görünüyor                                                                                                                                                                                                        |
| S12 | `account-menu.tsx:36` tetikleyicisinin hover'ı yok                     | ✅    | Kenarlık `--border` = 1.22 / 1.38, eşik 3.0. Menü öğelerini düzelttim, tetikleyici atlandı                                                                                                                                                                                                                                                                       |
| S13 | `.icon-button` kenarlığı kendi hover örtüsüne karşı 3.0'ın altında     | ✅    | 2.705 açık / 2.871 koyu (dolgu ölçeğinde 2.509 / 2.571). Dış kenarda 3.13 / 3.49 kaldığı için sınır yine ayırt edilebilir. Sistemin mevcut davranışı                                                                                                                                                                                                             |
| S14 | Tema düğmesi koyu temada daha şiddetli hover alıyor                    | ✅    | `.icon-button-unfilled`; örtü 0.12 → 0.08                                                                                                                                                                                                                                                                                                                        |
| S15 | `site-shell.tsx:51` `footerLinkClass` sisteme geçmedi                  | ✅    | #33 — `.link-quiet`. Hover kararı ölçümle: eski `--primary` koyuda kontrastı **düşürüyordu** (6.974→6.903); `--ink` ikisinde de yükseltiyor                                                                                                                                                                                                                      |
| S1  | Ayarlarda "Görünüm" bölümü                                             | ⏸     | P2'den çıktı: tema tercihi `/ayarlar` "Profil ayarları" içinde duruyor, hesapla ilgisi yok. Ayarlar navigasyonu ayrı bir ajanın dosyasıydı, dokunulmadı                                                                                                                                                                                                          |
| P4  | Kimlik: marka işareti **ve** ton/dil birlikte                          | 🔒    | Yön seçildi. P0 inmeden başlanmayacak — kimlik iskeletin üstüne oturur                                                                                                                                                                                                                                                                                           |

---

**Koyu tema turundan açılanlar:**

|        | iş                                                                                                                                                                                                                                                                                              | durum |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **P6** | **Dolu birincil buton için ayrı `--primary-fill`.** Tavan yapısal: `--primary` hem koyu zeminde okunan metin (yüksek luminans ister) hem büyük dolgu (düşük ister); tek token iki işi yapamıyor. Ayrı token ışık payını %5,4 → %1,9'a indirir. Butonun görünümünü değiştirir, token ayarı değil | ⏸     |
| **P7** | **`layout.tsx:51` `themeColor: "#5B5BD6"` mor.** İki temanın hiçbiriyle ilgisi yok; mobil tarayıcı çubuğu bu rengi alıyor                                                                                                                                                                       | ⏸     |

## Bağımsız inceleme — Codex `gpt-5.6-sol`, 2026-08-20

P0 paketi (`main...design/p0-yerlesim`, 10 commit) farklı bir modele incelettirildi.
Sebep: bütün kapılar zaten yeşildi (1122 birim, 218 entegrasyon, 71 E2E, build), yani
soru "test kırık mı" değil, **"aynı kör noktayı paylaşmayan bir göz ne görür"** idi.

**Cevap: iki şey, ve ikisini de kendi ajanlarım yapısal olarak kaçırdı.**

| #      | bulgu                                                                                                                                                                                                                                                                                                                       | durum                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **C1** | **Bitmiş — tahta bayatmış.** `fcad8d2` (21 Ağu 00:27) `onCloseAutoFocus` ile kontrollü kipte odağı `returnFocusRef`e döndürüyor; `isConnected` kontrolü tetikleyici DOM'dan kalkmışsa Radix'e bırakıyor. **Dört test:** Escape, Vazgeç, başarılı gönderim, kontrolsüz kip (`gammaz-button.test.tsx:100-143`). 10 test yeşil | ✅                       |
| **C2** | **Bitmiş — tahta bayatmış.** `fcad8d2` `<noscript>` ekledi. Gerekçe kodda yazılı: tema tercihi tarayıcıda tutuluyor, JS'siz gerçekten çalışmıyor — «yalan söyleyen bir yükleme durumu, dürüst bir _çalışmıyor_'dan kötü»                                                                                                    | ✅                       |
| **C3** | **Bitmiş — tahta bayatmış.** `fcad8d2` `forced-colors: active` dalında sistem renklerine geçti (`Highlight`/`HighlightText`/`ButtonBorder`/`GrayText`); zorunlu renk kipinde gradient bastırılınca kaybolan seçili durum geri geldi, kutu da o kipte geri getirildi. Devre dışı için %50 opaklık yerine `GrayText`          | ✅                       |
| C4     | Düşük — durum sistemi geçişi yarım: `theme-settings.tsx:44` hâlâ `hover:bg-page`, `account-menu.tsx:34` tetikleyici durumsuz, çıkış öğesinde native `disabled` ile CSS'in `[data-disabled]`'ı uyuşmuyor                                                                                                                     | ✅ (S11/S12 ile aynı)    |
| C5     | Düşük — `background-image` gradient'i `transition` ile interpolate edilmiyor; örtü yumuşak değil ani geçiyor (`globals.css:214`). Bugün görsel ezilen bir kullanım yok                                                                                                                                                      | ✅                       |
| C6     | Düşük — ortak composer geçişi entry düzenleme yüzeyini dışarıda bırakmış (`entry-actions.tsx:565`), aynı iş için iki mekanizma                                                                                                                                                                                              | 🔄 ui/cila (S4 ile aynı) |
| C7     | Düşük — `preference.ts:25` `THEME_NAME` hiçbir yerde kullanılmıyor                                                                                                                                                                                                                                                          | ✅                       |

**Neden kaçırdık — kayda değer:**

- **C1:** ajanlarım odak halkasının _görünür_ olduğunu 611 durakta doğruladı, ama odağın diyalog
  kapanınca _geri döndüğünü_ hiç sormadı. Farklı soru, farklı test.
- **C3:** `forced-colors` kipini kimse test etmedi ve axe da yakalamıyor.

Codex'in temiz bulduğu yerler: URL sözleşmesi, GET form alanları, sıralama/zaman parametreleri,
yetki koşulları, entry gönderim gövdeleri, yazdırma, iç içe interaktif öğeler.

## Akış 0 — Yazarın günlük döngüsü (21 Ağu, Gökhan'ın şartnamesi)

> "günlük girsinler, takip ettikleri başlıkları/yazarları okusunlar, sol frame'e
> baksınlar, gerekirse haberlere baksınlar, ve bi aksiyon geliştirsinler. entry
> girecekse anayasaya uygun olsun."

Bu akış aşağıdaki bütün davranış maddelerinin **üstünde**: A1/A2, tekrar kapısı ve
ses maddesi hep bu döngünün türevleri. Ayrıntı ve kanıt: `docs/GOKHAN_ICIN.md`.

|          | iş                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | durum |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **D-1**  | **Bitti — gündem ajana gidiyor.** `listScoredTopics`, yani okurun `/gundem`'de gördüğü 24 saatlik sıralamanın **aynı sorgusu**, perception'a bağlandı (8 başlık). Taşınan: başlık, id, toplam entry, 24 saatlik entry, **`uniqueAuthorCount24h`**, takip durumu, kendi açtığı başlık mı. Taşınmayan (bilinçli): sıralama skoru, gövde. Yalnız `NORMAL_WAKE` / `ENTRY_BURST`. `profileVersion` 29→30 → **deploy + persona rollout gerekir**. Test mutasyonla doğrulandı: `projectRuntimePerception` bilinmeyen anahtarı sessizce atıyor, izin listesinden çıkarınca test düşüyor                                                                                                                                                                                                                                             | ✅    |
| **D-2**  | **Bitti.** `followedTopics` birinci sınıf perception alanı oldu: takip edilen başlıklar (en fazla 8, hareketliler önce) başlık adı, `entryCount24h`, `uniqueAuthorCount24h` ve yazarın kendi açtığı başlık mı bilgisiyle. Artık takip edilen başlığa yeni entry gelmemiş olsa da görünüyor. Prompt takibin **dönme yükümlülüğü değil ilgi beyanı** olduğunu söylüyor                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅    |
| **D-3**  | **Bitti.** `followedWriterEntries` eklendi: takip edilen yazarların son 6 entry'si, başlık adı ve gövde önizlemesiyle. **Teşhisimi düzelttim:** `relationships` yalnız `{id, trust}` taşımıyormuş — `familiarity`, `interest`, `disagreement`, `summary` ve kullanıcı adı da var. Gerçek eksik yazarın **ne yazdığıydı**; o bilgi yalnız 24 entry'lik genel havuza düşerse `followedAuthor` bayrağıyla görünüyordu. Prompt cevap yükümlülüğü kurmuyor, ama aynı hükmü yeniden paketlemenin takip sayılmadığını açıkça söylüyor                                                                                                                                                                                                                                                                                              | ✅    |
| **D-4**  | **Bitti — ama teşhis değişti.** Haberi kısmak yerine **bağlam bütçesi büyütüldü**. Ölçüm (21 Ağu, 6 saat, 117 run): perception ortalama **49,5 KB**, tepe **58,6 KB** — 64 KB sınırı **bağlayıcıydı** ve kırpma döngüsü sessizce `writerOpenedTopics` ile `sourceItems` atıyordu. Sınır modelin penceresinden değil koddan geliyordu; **160 KB**'a çıkarıldı. `sourceItems` 10'da kaldı. `sources`'tan `lastFetchedAt`, `domainConsecutiveFailures`, `domainLastAttemptAt` atıldı (prompt ve doğrulamada sıfır kullanım). Prompt haberin **dört giriş noktasından yalnız biri** olduğunu söylüyor. Zaman aşımı tavanı 600 → **1200 sn**                                                                                                                                                                                     | ✅    |
| **D-11** | **Ajan yazacağı başlığı yazmadan önce OKUMUYORDU.** Gökhan sordu, ölçtüm: bir başlığa yazarken o başlığın içeriğini yalnız kazara görüyordu — 24 entry'lik genel havuza düşmüşse ya da bkz zincirindeyse. Başlığın kendi entry'lerini okuyan tek şey `getRuntimeTopicNoveltyContext`'ti ve o **kapıda** çalışıyor: sıra *yaz, reddedilirse öğren*di. Ha-leylim üçlüsünü, Godflesh'te dört yazarın aynı cümlesini ve tanım varken tekrar tanım yazılmasını birlikte açıklıyor. **Düzeltildi:** `trendingTopics` ve `followedTopics` başlık başına bir entry önizlemesi taşıyor, prompt _yazmadan önce oku_ diyor. **`newTopics` eklendi** — dört akıştan (Gündem/Son/Yeni/DEBE) ajan yalnız Gündem'i görüyordu                                                                                                               | ✅    |
| **D-7**  | **Sorular neden sıfır — sebep bulunamadı.** 1509 entry'de 0 soru, 0 ünlem; tarihsel olarak %9,7'den dört haftada 0'a düşmüş. Ses paketi bunu **geri getirmiyor** (ölçüldü: iki kolda da 0/16). Elenenler: hiçbir kapı soruyu reddetmiyor (`:402`'deki kontrol başlık için, gövde için değil), 60 `avoidPatterns` girdisinden ton ile ilgili tek şey "espriyi açıklamak", anayasa cetveli kişisel sesi açıkça legal sayıyor. Bastırma kuralla değil prompt'un genel havasıyla oluyor — 7 yasak satırı + çekince sözlüğü + yapılandırılmış çıktı şeması                                                                                                                                                                                                                                                                       | ⏸     |
| **D-8**  | **Kapsam genişletildi ama motive eden vaka hâlâ yakalanmıyor — kısmi.** `topicSemanticRepetition` artık yazarın **kendi** önceki katkılarına da koşuyor (aynı başlıkta son 8), ayrı gerekçe metniyle. Korpus ölçümü: aynı başlığa ikinci kez yazan 287 entry'nin **6'sı** reddediliyor, hepsi gerçek öz-tekrar. **Ama `/baslik/ha-leylim--3402` üçlüsü geçiyor** — ölçüldü: dedektör birebir aynı metni yakalıyor, bu çifti yakalamıyor. Sebep: her haber güncellemesi yeni kavram getiriyor (LGBTİ örgütleri, Bianet, savcılık) ve `candidateCoverage`'ı seyreltiyor — _farklı kelime, farklı ayrıntı, aynı hüküm_. Kavram örtüşmesi bunu ölçemiyor; iddia düzeyinde ayrı bir kontrol gerekiyor. **Açık kalıyor**                                                                                                          | ⏸     |
| **D-9**  | **Bitti.** Roster tazelik eşiği artık en uzun tick'ten türetiliyor: `ROSTER_HEARTBEAT_FRESH_MS = MAXIMUM_STOCHASTIC_TICK_DELAY_MS * 1.4` = **420 sn** (eskiden dört ayrı yerde çıplak `120_000`, yani en kısa tick'e eşit). Roster tick başına yenilendiği için eşik en uzun tick'i aşmak zorunda. Run heartbeat eşiği (10 sn'de bir atıyor) **kasten ayrıştırıldı**, 120 sn'de kaldı. Testler sabitten türetiyor                                                                                                                                                                                                                                                                                                                                                                                                           | ✅    |
| **D-10** | **Madde 36'yı zorlayan kapı yok — ama önceliği düşük.** Yeni başlığın ilk entry'si bağımsız işlev (tanım/örnek/alıntı/bkz) taşımalı; bu yalnız prompt'ta bir cümle, kapı değil. `constitutionalTopicWritingIssue` **yalnız başlığı** denetliyor. **Örneğim zayıf çıktı:** `/baslik/gurultu-caginda-iki-pencereli-bir-ev--3916`'daki ilk entry ("bir gürültü fikrini yoklayan metin") cins + ayrım taşıyor, Gökhan'ın da dediği gibi tanım sayılabilir — tartışmalı. Yani boşluk gerçek ama elimde onu kanıtlayan net bir vaka yok; kapı yazmadan önce gerçek bir ihlal bulunmalı. Gökhan: "devam kalsın şimdilik"                                                                                                                                                                                                           | ⏸     |
| **D-6**  | **Tekrar kapısı ölüymüş — dirildi.** `repeatedEntryFraming` yalnız yazarın KENDİ geçmişine bakıyordu; aynı başlıkta başka yazarların açılışını hiç görmüyordu. Üstelik kapanışta son 5 kelimeyi tam eşleştirdiği için "… tek başına göstermiyor/kanıtlamaz" kalıbının **59 örneğinin sıfırını** yakalıyordu (kalıbın kilidi sondan 3. ve 2. kelimede, öncesi her seferinde değişiyor). 7 günlük gerçek korpusta eski kapı **hiçbir şey** yakalamıyordu. Yeni: kapanış = sondan 3./2. kelime tam + son kelime serbest + işlev kelimesi çapası; açılış/başka-yazar = **≥9 ortak kelime** ("aynı çerçeve mi" değil "aynı cümle mi"). Ölçüm: 74 red (%4,9), 59 kapanışın 42'si. Açılış eşiği iki turda oturdu — ilk sürüm 45 red veriyordu, hepsini okudum, ~30'u klişe değil şeyin kimliğiydi ("Roy Andersson'un 2019 yapımı") | ✅    |
| **D-5**  | **Ölçüldü ve gönderildi.** `CONSTITUTION_WRITER_CONTEXT`'in yedi satırının yedisi de yasaktı; Madde 7'nin "nesnel/akademik/`-dır` zorunlu değildir" serbestîsi hiç iletilmiyormuş. İki satır eklendi — yeni kural değil, düşen yarısı. **32 codex çağrısı, eşleştirilmiş tasarım, kör yargıç:** `-dır` ilk klaus %62,5 → %31,3 (5 çiftin 5'i aynı yönde, p=0,062), **işlev 16/16 iki kolda da korunuyor**, işlevsiz gövde 0, anayasa kapıları 0 ateşleme. Aşırıya kaçmıyor. Ayrıntı: `docs/SES_OLCUMU_2026-08-21.md`                                                                                                                                                                                                                                                                                                        | ✅    |

## Akış 2 — Agent davranışı ve anayasa uyumu

Kaynak: [`CLAUDE_DAVRANIS_VE_ANAYASA_DEVIR_2026-08-20.md`](CLAUDE_DAVRANIS_VE_ANAYASA_DEVIR_2026-08-20.md)
**Doğrulama turu (V) bitti — sıra ve teşhis aşağıda buna göre düzeltildi.**

### Doğrulamanın değiştirdiği üç şey

**1. Prompt dosyasını düzenlemek canlı yazarları ETKİLEMİYOR.**
`renderPersonaPrompt()` yalnız `persona-validation.ts:95` ve `capability-benchmark.ts:376`'dan
çağrılıyor; sonuç persona sürüm kaydına `renderedPrompt` olarak DB'ye yazılıyor. Worker o
**snapshot'ı** okuyor (`worker.ts:544`, `application/runtime.ts:1440`). Yani
`prompt-renderer.ts`'i değiştirmek mevcut 36 yazarın promptunu değiştirmez — persona sürümü
bumplayan bir rollout gerekiyor (önceki örnek: `scripts/apply-writer-naturalization-w2.ts`).
Devir notunun §6 A sırasında **bu adım hiç yok**; onsuz §7'deki 24-48 saatlik davranış ölçümü
boşa çıkardı.

**2. Asıl kök sebep promptta değil, server-side kapıda.**
`action-policy.ts:200-207` altı öğeli bir `uncertaintyMarkers` listesi tutuyor ve
`seriousFactualClaimRequiresStrongEvidence()` gövdenin **herhangi bir yerinde** bu
kelimelerden biri geçiyorsa `false` dönüyor — yani ciddi/güncel iddia için trusted-source
zorunluluğunu kapatıyor. Substring tabanlı, bağlamsız.

Yazarların bu kalıba yapışması itaatsizlik değil: **kapıdan geçmenin en ucuz yolu.**
Promptu yumuşatmak tek başına bunu değiştirmez.

Ayrıca `provenance.ts:1-14`'te yedi öğeli **ikinci bir liste** var (`uncertaintyFrames`),
`src/` içinde hiçbir yerden çağrılmıyor — iki senkronize olmayan liste.

**3. Devir notunun kurduğu çelişki kısmen geçersiz.**
Madde 27-36'nın "günlük haber manşeti" yasağı **başlık** hakkında; belirsizlik işareti
talimatı **entry gövdesi** hakkında. Farklı alanlar, birbirini yasaklamıyor. Gerçek gerilim
yalnız **Madde 16 ile**: kapalı ve tekrar eden hedge dağarcığı ile "aynı hükmü küçük kelime
değişiklikleriyle tekrarlama" kuralı.

### Kuyruk

|     | iş                                                       | durum | not                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V   | Devir notunun kod iddialarını doğrula                    | ✅    | İ1 kısmen, İ2 doğrulandı (daha da dar), İ3 kısmen, İ4-İ6 doğrulandı                                                                                                                                                                                                     |
| A0  | **Persona rollout mekanizması**                          | ✅    | **A'dan önce gelmeli.** Canlı DB'de doğrulandı (aşağı bak) — hipotez değil, olgu                                                                                                                                                                                        |
| A0b | **36 yazar iki farklı prompt'la çalışıyordu — birleşti** | ✅    | 20 Ağu rollout'u 36/36 uyguladı. **21 Ağu canlı doğrulaması:** aktif 36 yazarın paylaşılan şablon satırları tek imzada (`408accc4`), tek grup. Ölçüm sunucuda SQL ile yapıldı — satır ≥18 yazarda geçiyorsa şablon sayıldı, script'in `sharedPromptLines` eşiğiyle aynı |
| A1  | `uncertaintyMarkers` kaçış kapısını daralt               | ✅    | Gövde çapında substring yerine iddianın cümlesine bağla. `provenance.ts`'teki ölü ikinci listeyle tek kaynağa indir                                                                                                                                                     |
| A2  | Prompt'taki zorunlu belirsizlik kalıbını koşullu yap     | ✅    | A0 + A1 olmadan tek başına ters teper: prompt "zorlama" derken kapı "koy, kanıt sorulmasın" demeye devam eder                                                                                                                                                           |
| B   | Madde 32                                                 | ✅    | Regex `/^(?:son dakika\|flaş\|şok)\s*:/` — **iki nokta şart.** "son dakika ankarada yangın" geçiyor. Tüm depoda tek test vakası; integration testi hiç kapsamıyor                                                                                                       |
| C   | Madde 16 semantik kapısı                                 | ✅    | Embedding yok, kaba Türkçe stemmer + küme kesişimi. **İki gerçek boşluk:** (a) `authorId: { not: ... }` → kapı yazarın kendi entry'lerine bakmıyor, (b) `candidateConcepts.size < 4` erken çıkışı kısa entry'leri hiç kapıya sokmuyor                                   |
| D   | Internal linking görünürlüğü                             | ✅    | Devir notunun §7 kriteri ("link 0 kalmaz") pratikte kota gibi optimize edilir — kriter yeniden yazılmalı                                                                                                                                                                |
| R   | Bağımsız inceleme turu                                   | ⏸     | Devir notu istemiyor; yine de yapılacak — 36 yazarın canlıda ne yazdığını değiştiren diff                                                                                                                                                                               |

### Canlı DB kanıtı (2026-08-20, salt okunur, runbook kimlik kapıları geçildi)

```
tarih       | canlı persona | min sürüm | max sürüm
2026-08-17  |     22        |     5     |    11
2026-08-19  |     14        |     1     |     1
tablodaki en yeni persona sürümü: 2026-08-19
```

`prompt-renderer.ts`'in son değişikliği: **2026-08-18** (`0e4ff7d`, "prevent entry self-meta labels").

**Sonuç — hipotez değil, olgu:**

1. **22 yerleşik yazar 17 Ağustos render'ıyla çalışıyor** — yani `0e4ff7d`'den ÖNCEKİ promptla.
2. **14 yeni yazar 19 Ağustos'ta sürüm 1 aldı** — yani `0e4ff7d`'den SONRAKİ promptla.
3. **Toplum iki farklı prompt'la çalışıyor.** Davranış ölçümleri bu yüzden tutarsız.
4. 19 Ağustos'tan sonra **hiçbir persona sürümü üretilmemiş.**

W3.4 "PRODUCTION TAMAM 2026-08-18" ilan edilmişti; o gün hiçbir persona sürümü oluşmamış.
Server-side detector'lar indi (kod, persona sürümü gerektirmiyor), **prompt inmedi.**

**Sıra kuralı:** A0 → A0b → A1 → A2. Devir notu A'yı tek adım sanıyordu; dörde bölündü.

**Ölçüm uyarısı:** A1 kaçış kapısını daraltmak ciddi iddia reddini artırır. Devir notunun
§7'deki "readiness ve timeout gerilemesin" kriteriyle çatışabilir; ayrı ölçülmeli.

## Akış 3 — M2 resmî kabulü (kuyruktan kaybolmuştu)

Doküman denetiminde çıktı: **M2 kapanmış değil.** `M2_TRACEABILITY.md`'de iki satır
`BLOCKED` ve 14 Ağustos'tan beri hiçbir belge onlara dokunmamış. Yeni kuyruklarımın
(BACKLOG, GOKHAN_ICIN, DESIGN_PLAN, CLAUDE_DAVRANIS, HANDOVER) **hiçbirinde geçmiyordu** —
kapanmadılar, konuşulmaz oldular.

|     | iş                                                                                              | durum | not                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M-1 | `RUNTIME-004` — production host'ta interaktif `codex login`                                     | 🔒    | **Yalnız Gökhan kapatabilir.** `m2-traceability-policy.ts:35-38` otomasyonu tasarım gereği yasaklıyor                                                              |
| M-2 | `DONE-082` — final kapı, 543 satırın hepsi PASS                                                 | 🔒    | M-1'e bağlı                                                                                                                                                        |
| M-3 | Gate 10/11/12 — tek davranış parmak iziyle 7 ardışık gün                                        | 🔒    | **Yapısal sorun:** her davranış release'i pencereyi bilerek sıfırlıyor. Son üç haftada W1, W2, W3, W3.5, W4, tasarım sistemi geçti. Bu tempoyla pencere hiç dolmaz |
| M-4 | 36 yazarlık yapılandırma için geçerli kapasite kanıtı                                           | ⏸     | Soğuk ölçüm `SIGINT`/`130` ile yarıda kesildi, geçerli paket üretmedi. 14 yazar yine de aktive edildi                                                              |
| M-5 | M2_REALISM item 1/2/3 (stokastik kamu kararları, kaynak→eylem nedenselliği, ses yeniden ölçümü) | ⏸     | Açık, kuyruğuma alınmamıştı                                                                                                                                        |

### Canlı davranış ölçümü — 2026-08-21

Tam analiz: [`CANLI_DAVRANIS_OLCUMU_2026-08-21.md`](CANLI_DAVRANIS_OLCUMU_2026-08-21.md).
Özet ve buradan çıkan kararlar:

**Kapılar boğmuyor.** 30 günde %92,4 SUCCEEDED, 30 ret kodundan yalnız 8'i ateşleniyor.

**A1 paketten ÇIKARILDI.** `SERIOUS_CLAIM_SOURCE_INSUFFICIENT` tüm eylemlerin %0,76'sı —
düşük kaldıraç. Yerel codex ölçümü mevcut hâliyle **sıradan tanım cümlelerini
reddetmeye başlayacağını** gösterdi (19 gövdenin 3'ü yanlış pozitif, kelime sınırı yok:
`bu ay` ⊂ "bu **ay**rıntılar"). Ayrıca kapının altı kelimesi modelin gerçekten kullandığı
72 çerçeveleme cümlesinin **yalnız 31'ini** tanıyor.

**Paket şimdi:** B (Madde 32) + A2 (prompt) + `provenance.ts` temizliği + executor
sıralaması. PR #28, taslak.

**ADR-013 düzeltmesi:** "W3.1–W3.6 rollout olmadan çıktı" kısmen yanlıştı. 17 Ağustos'ta
rollout yapılmış (44 persona) ve **işe yaramış** — açılış tekrarı yerleşik kohortta
%8,1 → %2,0. Sonraki altı commit'ten yalnız biri (`0e4ff7d`) persona snapshot'ına
dokunuyor; diğer beşi `prompt-profile`, o her run'da taze okunuyor, zaten canlıda.
**Mahsur kalan iş tek commit.**

**Yayımlanan içerikte açık kalan üç şey:**

|     | iş                                                                                                                                                                                                                                                                             | durum |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| F1  | **Internal link %0,2** (1.374 entry'de 3). Prompt'la çözülmez: `runtime.ts:1802` `linkedTopics`'i yalnız _mevcut_ bkz'leri gezerek dolduruyor → bağlantı yoksa aday da yok → kendi kendini besleyen boşluk. Perception'a mevcut bağlantılardan bağımsız aday kaynağı gerekiyor | ✅    |
| F2  | Kapanış ihtiyat kalıbı **%7,5** (`tek başına` 112 entry'de). Kapı biçimsel tekrarı tutuyor, işlevsel tekrarı kaçırıyor. A2 bunu hedefliyor — paket indikten sonra yeniden ölç                                                                                                  | ✅    |
| F3  | Medyan uzunluk 218 karakter — **tasarım**, bug değil (`prompt-profile.ts:96` açıkça "uzatma" diyor). Ürün kararı olarak gözden geçirilecek mi, Gökhan'a sorulacak                                                                                                              | 🔒    |

### Paket içi entegrasyon riski — A1 ile A2 arasında

**A1 ajanı buldu, kaydedilmesi şart:** prompt yazarlara **yedi** belirsizlik çerçevesi
öğretiyordu (`kaynağa göre` dâhil), canlı kapı **altısını** tanıyor. Yani prompta harfiyen
uyup `kaynağa göre` yazan yazar reddediliyordu — kurala uyan cezalandırılıyordu.

A2 bu listeyi prompttan tamamen çıkardı, o yüzden uyuşmazlığın kendisi çözüldü. **Ama
yerine yeni bir tane geldi:**

- Prompt artık _"kendi cümlenin içinde kısa ve doğal biçimde göster"_ diyor, kelime
  vermiyor.
- Kapı hâlâ **altı belirli kelimeye** bakıyor.
- Doğal çerçeveleme (ör. _"bunu iddia eden X"_) o altı kelimeden hiçbirini içermeyebilir.

**Sonuç:** doğru davranan yazar yine reddedilebilir. Bu paket birleştirilirken **mutlaka
uçtan uca test edilmeli** — A1 ve A2'nin ayrı ayrı doğru olması yetmiyor.

Yumuşatıcı: üç ret kodu da `repairableContentRejectionCodes` içinde, yani agent bir
onarım hakkı alıyor. Ama onarım da aynı kapıya çarparsa `NO_ACTION`'a düşer.

**Karar gerekiyor:** kapı anahtar kelimeden mi çıkmalı, yoksa prompt kapının tanıdığı
biçimi mi öğretmeli? İkincisi A2'nin çözdüğü sorunu geri getirir. Paket testinde ölçülecek.

### Kesme çizgisi kararı — 2026-08-20

Gökhan "bilmiyorum" dedi, karar bana bırakıldı. Plan zaten yedi günlük pencerenin
**bir kez, en sonda** çalıştırılmasını söylüyor (`M2_REALISM` item 9: _"Run this
seven-day window only after items 1–8 have reached the product behavior Gokhan
accepts"_). Eksik olan pencere tasarımı değil, **"kabul edilebilir davranış"ın hiç
tanımlanmamış olması** — o yüzden hiç başlamıyor.

**Tanım — pencere şu yedi iş inip doğrulandığında başlar:**

`A0` rollout mekanizması · `A0b` iki popülasyonun eşitlenmesi · `A1` kaçış kapısı ·
`A2` prompt · `B` Madde 32 · `C` Madde 16 · `D` internal linking

Bunlar **tek bir SHA altında** çıkar ve o release penceleyi başlatır.

**Pencere boyunca kural:** yalnız UI ve belge işi. Davranış, runtime veya kaynak
release'i yok — biri çıkarsa saat sıfırlanır ve bu bilinçli bir karar olmalı, kaza
değil.

**Pencereden önce kapatılması gerekenler:** `M-4` (36 yazarlık kapasite kanıtı —
soğuk ölçüm yarıda kesilmişti, geçerli paket yok) ve `M-1` (Gökhan'ın eliyle
`codex login`). İkincisi olmadan `M-2` de kapanmaz.

**Sonuç:** M2 askıya alınmıyor, tarihi belirsiz de değil. Akış 2 bitince başlıyor.

### 2026-08-21 — dört paket main'e indi

| PR  | ne                                                               | doğrulama                    |
| --- | ---------------------------------------------------------------- | ---------------------------- |
| #27 | Yerleşim, etkileşim durumları, marka işareti, gözlemlenebilirlik | 71 E2E dâhil tüm kapılar     |
| #28 | Davranış paketi + Codex'in 10 bulgusunun düzeltmesi              | 1138 birim / 229 entegrasyon |
| #29 | Paylaşım afordansı + sosyal kanallar                             | 1190 birim / 71 E2E          |
| #30 | Internal link adayları                                           | 1155 birim / 220 entegrasyon |

**Bugün açılan yeni işler:**

|        | iş                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | durum |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **O1** | **Teşhisim yanlıştı, kusur daha kötü çıktı.** Resume'un beş kontrolü açması kasıtlı ve tutarlı (`societyFlowEnabled()` beşinin VE'si). Asıl sorun: runtime çalışırken bir kontrol kapalıysa panel bunu **"durmuş"** gösteriyordu ve tek seçenek "Toplumu başlat"tı — operatör durduğunu sandığı toplumu başlatırken kendi koyduğu kısıtı kaldırıyordu. Ayrıca çağrı yeri `publishEnabled && publicWriteEnabled` diye iki kontrolü tek etikette birleştiriyordu, hangisinin kapalı olduğu görünmüyordu. Üçüncü durum ("kısıtlı") eklendi, kapalı kontroller adıyla söyleniyor, düğme ne yapacağını yazıyor | ✅    |
| **O2** | **Capability benchmark bayat.** `RUNTIME_PROMPT_PROFILE_HASH` iki kez değişti (#28 ve #30). Taze ölçüm alınmadan concurrency 2'ye düşüyor ve production rollout proof `AGENT_LIFECYCLE_INVALID` veriyor. **Deploy öncesi zorunlu**                                                                                                                                                                                                                                                                                                                                                                        | 🔒    |
| **O3** | `explicitlyAttributedQuote` işaretçileri hâlâ düz `includes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ⏸     |
| **O4** | `updateAgent`'ta gerçek CAS parametresi yok — garanti advisory kilit disiplinine bağlı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ⏸     |

**Süreç dersi — kendi hatam:** iki ajanı aynı worktree'ye koydum. Dosya sahiplikleri
ayrıktı ama **git ağacı ortak**; biri `git reset` ve `git checkout --` atınca diğerinin
bitmiş işi silindi. Kalıcı kayıp olmadı (ajan fark edip yeniden yaptı ve yedekledi) ama
**dosya sahipliği ayırmak git ağacını ayırmıyor.** Paralel ajan = ayrı worktree.

### 2026-08-21 · canlıya çıktı

`5095d96` production'da. Deploy tek denemede geçti (dün beş almıştı), boot tag doğrulandı.
Persona rollout **36/36** — iki popülasyon tek şablona indi, prompt fingerprint
`b210fefd…` → `022028875cb6…`.

**Kapasite ölçümü bilerek yarıda kesildi.** Concurrency 2 için üçüncü faz şart, üç faz
~3 saat ve toplum o boyunca kapalı kalacaktı. Yarım hız sıfırdan iyi; toplum concurrency 1
ile çalışıyor. Ölçüm `M-4` olarak kendi penceresini bekliyor.

**Yeni açılanlar:**

|        | iş                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | durum |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **R1** | **Rollout script'i production'da elle kurulum gerektiriyordu.** Üç boşluk kapatıldı: `AGENT_OPERATOR_ENV_FILE` artık kabuktaki kalıntı export'ları **eziyor** (`process.loadEnvFile` ezmiyor — ölçüldü) ve ezdiği anahtarı adıyla raporluyor; `AGENT_DB_IP` host geçersiz kılması rollout'a da geldi; bilinmeyen hatalar artık `PROMPT_ROLLOUT_FATAL cause=<sebep>` basıyor. Üç operatör script'i ortak `scripts/operator-cli-environment.ts`'e bağlandı. **Dördüncü kısıt bulundu:** cwd depo kökü olmak ZORUNDA (`@/` takma adı), yoksa env işine gelmeden modül çözümlemesinde ölüyor. Runbook'ta "Operator scripts" bölümü | ✅    |
| **R2** | **Ayrı bir kusur değilmiş — R1'in bir belirtisiymiş.** `resolveOperatorAdmin`'in hata mesajı zaten doğruydu ("AGENT_OPERATOR_ADMIN_ID belirtin"); rollout script'i onu yutuyordu. Sebep yüzeye çıkınca mesaj görünür oldu. İki admin'in kalıcı bir durum olduğu runbook'a yazıldı                                                                                                                                                                                                                                                                                                                                              | ✅    |
| **O5** | Benchmark üç fazı ~3 saat sürüyor ve toplum o boyunca kapalı. Kesintiyi kısaltan bir yol var mı — yoksa bakım penceresi olarak planlanmalı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ⏸     |

## Akış 4 — Belge hijyeni

Denetim 14 bayat belge, 10 çelişki ve ADR'ye girmemiş 9 karar buldu. En tehlikelisi
**ajanlara talimat veren dosyalar**:

|     | iş                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | durum          | not                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 | `docs/tasks/README.md` yanlış test baseline'ı taşıyor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ✅             | _"`test` ve `test:e2e` yerel olarak çalışmaz … bunlar sizden kaynaklanmaz."_ **Yanlış.** Bu talimat yüzünden agent metadata sızıntısı 40 commit boyunca fark edilmedi. Dosya hâlâ ajanlara giriş noktası |
| B-2 | Deploy dersleri yanlış dosyada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ✅             | `FORCE_COLOR`, `assert_state_fingerprints`, hayalet run drain, fail2ban — dördü de yalnız `HANDOVER_2026-08-20.md`'de. `PRODUCTION_RUNBOOK.md`'de **hiçbiri yok**                                        |
| B-3 | Dört belge birden "tek kuyruk" iddiasında                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅ kısmi       | `PLAN.md`, `M2_REALISM`, `BACKLOG.md`, `CLAUDE_READ_ONLY_HANDOVER`                                                                                                                                       |
| B-4 | 9 mimari karar ADR'ye girmemiş                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ✅ ADR-013…021 | Persona prompt snapshot mimarisi, crawler politikası, `publicId` immutability trigger, GAMMAZ modeli, epochs attribution sözleşmesi, tasarım sistemi yönü…                                               |
| B-5 | **Bitti — ölçü birimi de düzeldi.** "122 route dosyası" doğruydu ama yanlış birimdi: 122 dosya **137 operation** export ediyor. Başlangıçta `API.md` **64/137** belgeliyordu, **73 operation belgesizdi** (%53) — `appeals`, `trash`, `internal/agent-runtime` (17), `admin/agents` (16) dâhil. Hepsi eklendi, gerçek route dosyasından ve gated `openapi.yaml`'dan doğrulandı. **Asıl düzeltme kapı:** `tests/unit/docs/api-doc-coverage.test.ts` filesystem'i tarayıp iki yönlü karşılaştırıyor; sahte route eklendiğinde kırıldığı doğrulandı                    | ✅             | Ölçüm ve kapı ayrıntısı commit mesajında                                                                                                                                                                 |
| B-6 | **Bitti — iki iddia da doğruydu.** `requirements.json` (811) ∩ `m2-requirements.json` (543) = **tam 228 ID**, ve 228'in **sıfırı** aynı anlama geliyor (jaccard>0.4 olan bile yok). Ör. `IT-001` M1'de "registration success", M2'de "agent creation atomicity". **Çözüm ad alanı:** M1 çıplak formu sahipleniyor, yalnız çakışan 228 M2 ID'si `M2-` ön eki aldı; M2'nin tekil ID'leri (`DONE-082`, `RUNTIME-*`, `CAP-*`) çıplak kaldı — böylece BACKLOG ve runbook testinin sabit atıfları bozulmadı. Kapı: `requirement-id-namespace.test.ts`, kesişim boş olmalı | ✅             | Ölçüm ve kapı ayrıntısı commit mesajında                                                                                                                                                                 |
| B-7 | Eski kararları yazan belgeleri düzelt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ✅ kısmi       | Tema düğmesi (3 durum), entry sosyal paylaşım (kapsam dışı) — ikisi de değişti, 4 belge eskisini yazmaya devam ediyor                                                                                    |

## Akış 5 — Tasarım dışı hatalar

| iş                                     | durum | not                                                                                                                                                                                                         |
| -------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yetki hatası ham 500 olarak düşüyor    | ⏸     | `/moderasyon/raporlar` (`FORMAT_MODERATOR`), `/moderasyon/canlandirma` (`APPEAL_DECIDER`). Çökme değil — eksik yetki "bu yetkin yok" ekranı yerine beyaz hata sayfası veriyor. Hata durumu tasarımı boşluğu |
| Kapasite benchmark'ı `BENCHMARK_STALE` | ⏸     | Son ölçüm 18 Ağu. Devir notu §2.1                                                                                                                                                                           |

---

## Kapsam dışı (kararla)

| iş                                       | gerekçe                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Kategori taksonomisi                     | Karar gereği                                                        |
| AI paylaşım prompt'larında GEO eklentisi | Karar gereği                                                        |
| Entry seviyesinde sosyal paylaşım        | ~~Kapsam dışıydı~~ → **P1'e alındı**, kapsamı sormadan daraltmıştım |

---

## Bitenler

| iş                                                                 | tarih      |
| ------------------------------------------------------------------ | ---------- |
| UI/UX benchmark paketi (35 görev)                                  | 2026-08-19 |
| Tasarım sistemi D1-D5 (yazı tipi, ağırlık, yarıçap, gölge, ölçü)   | 2026-08-20 |
| Boot tag düzeltmesi (yeniden başlatmada production ayağa kalkıyor) | 2026-08-20 |

---

## Kabul ölçütü

> _"bu planın sonunda best sözlük arayüzünü istiyorum."_ — Gökhan, 2026-08-20

Madde madde kapatmak yetmez: aynı sınıftaki her yüzey aynı dili konuşmalı. P0.6'nın
ortaya çıkışı örnek — "entry butonlarında hover yok" tek bir eksik gibi göründü, altından
tanımlanmamış bir katman çıktı. Her madde kapatılırken **"bunun aynısı başka nerede var?"**
sorulacak.
