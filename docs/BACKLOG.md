# Backlog

Tüm açık işlerin tek kuyruğu. **Bu dosya iş listesidir** — karar bekleyen şeyler
[`GOKHAN_ICIN.md`](GOKHAN_ICIN.md) dosyasında, karışmasın.

Komşu dosyalar: [`STATUS.md`](STATUS.md) milestone geçmişi, [`DECISIONS.md`](DECISIONS.md)
mimari kararlar (ADR), [`AGENT_API_BACKLOG.md`](AGENT_API_BACKLOG.md) yalnız API kapsamı.

Son güncelleme: 2026-08-20

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

|     | iş                                                                     | durum | not                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2  | Tema düğmesi: 3 durum → 2 (güneş/ay), sisteme dönüş ayarlara           | ✅    | `system` dalı korundu (unit + e2e ile kanıtlandı). Tema mantığı `src/lib/theme/preference.ts`'e ayıklandı                                                                                                                                                                                                                                                                              |
| P1  | Paylaşım: sosyal kanallar (X, WhatsApp, LinkedIn, Facebook)            | ⏸     | P0.1'in `⋮` yapısına bağlı. Kapsamı ben daralmıştım, geri alınıyor                                                                                                                                                                                                                                                                                                                     |
| P3  | Koyu temayı ayarla                                                     | ⏸     | `page`/`surface` 1.075:1; "Kayıt ol" fazla baskın; kenarlıklar ağır                                                                                                                                                                                                                                                                                                                    |
| E1  | "Bugünkü" sayaçları aslında lifetime toplamı                           | ⏸     | **Doğrulandı.** Gün penceresi hiç yok; `todayPublishedEntries` monoton artıyor, sıfırlama yok. `todayDate` kolonu var ama yalnız agent oluşturulurken yazılıyor, hiç okunmuyor — rollover kodu yazılmamış. `576` yanlış bir "bugün" değil, doğru bir lifetime. İki seçenek: etiketi "Toplam" yap (tek satır, risksiz) veya rollover ekle (migration gerekebilir)                       |
| E2  | Worker heartbeat: "görünmüyor" ile "roster stale" ayrı durumlar olmalı | ⏸     | **Doğrulandı.** Kodda üç ayrı heartbeat var; rozet (`agent-kapasite/page.tsx:113`) yalnız roster sync'e bağlı. Lease yaşları `executionSlots`'ta zaten mevcut — **saf sunum işi**, yeni sorgu gerekmiyor                                                                                                                                                                               |
| S4  | **Üçüncü yazma yüzeyi**: entry düzenleme formu                         | ⏸     | `entry-actions.tsx:567` — araç çubuğu var, önizleme yok, `ENTRY_BODY_MAX_LENGTH`'i üçüncü kez kopyalıyor. `EntryComposerField`'ın doğal üçüncü müşterisi                                                                                                                                                                                                                               |
| S5  | bkz şeridi düğmelerinin kenarlığı 3:1'in altında                       | ⏸     | `writing-guidance.tsx` — açık 1,22:1, koyu 1,38:1. Önceden de eşiğin altındaydı (1,36) ama kart kalkınca açık temada düştü. Çözüm: `field-border`                                                                                                                                                                                                                                      |
| S6  | `baslik/[topic]/page.tsx` kardeş durumları hâlâ `surface-card`         | ⏸     | Giriş CTA'sı, onay bekliyor, askıya alınmış. Composer'la aynı anda görünmüyorlar, çelişki yok ama hizalanmalı                                                                                                                                                                                                                                                                          |
| S7  | Yerel dev DB'sinde test verisi kaldı                                   | ⏸     | `paylasilan composer denemesi *` başlıkları. Görsel incelemeden önce temizle                                                                                                                                                                                                                                                                                                           |
| S2  | `.chip` durgunken 3:1 kenarlık taşımıyor                               | ⏸     | P0.1'den çıktı: `.chip` yalnız hover'da `--border-strong`'a ulaşıyor. Sistem geneli bir karar, yeni pencere tetikleyicisi ve ikon butonları da etkiliyor                                                                                                                                                                                                                               |
| S3  | Zaman etiketi iki kez görünüyor                                        | ⏸     | Eyebrow "7 entry · son 24 saat" derken tetikleyici de "son 24 saat" diyor. Görsel incelemede karar vereceğim                                                                                                                                                                                                                                                                           |
| S10 | **`text-link` ölü bir sınıf**                                          | ⏸     | Ne `tailwind.config.ts`'te ne `globals.css`'te tanımı var. 4 kullanım: `app/kurallar/page.tsx:45`, `app/hakkinda/page.tsx:44`, `content/constitution-document.tsx:34,85`. **Bu bağlantılar şu an gövde metni renginde** — yani bağlantı olduğu belli değil (WCAG 1.4.1). Doğru karşılık `.link-strong` ama /kurallar'daki ~60 madde bağlantısını birden kiremite çevirmek görsel karar |
| S11 | Örtüyü geometriden ayıran bir sınıf gerek                              | ⏸     | `.menu-item` tipografi taşıyor (`text-sm px-3 py-2 rounded-lg w-full`); `topic-list.tsx` ve `theme-settings.tsx` 17px gövde metniyle akan satırlar, uymuyor. Depoda kalan tek `hover:bg-page` bu ikisi — koyu temada görünmüyor                                                                                                                                                        |
| S12 | `account-menu.tsx:36` tetikleyicisinin hover'ı yok                     | ⏸     | Kenarlık `--border` = 1.22 / 1.38, eşik 3.0. Menü öğelerini düzelttim, tetikleyici atlandı                                                                                                                                                                                                                                                                                             |
| S13 | `.icon-button` kenarlığı kendi hover örtüsüne karşı 3.0'ın altında     | ⏸     | 2.705 açık / 2.871 koyu (dolgu ölçeğinde 2.509 / 2.571). Dış kenarda 3.13 / 3.49 kaldığı için sınır yine ayırt edilebilir. Sistemin mevcut davranışı                                                                                                                                                                                                                                   |
| S14 | Tema düğmesi koyu temada daha şiddetli hover alıyor                    | ⏸     | `aria-pressed="true"` olduğu için `.icon-button` onu "dolgulu seçili" sayıp 0.08 yerine 0.12 örtü uyguluyor. Kontrast sorunu yok, tutarsızlık var                                                                                                                                                                                                                                      |
| S15 | `site-shell.tsx:51` `footerLinkClass` sisteme geçmedi                  | ⏸     | Geçirilince `site-shell.test.tsx:542` literal sınıf araması düşüyor ve hover `--primary`'den `--ink`'e iniyor. Test + görsel karar gerekiyor                                                                                                                                                                                                                                           |
| S1  | Ayarlarda "Görünüm" bölümü                                             | ⏸     | P2'den çıktı: tema tercihi `/ayarlar` "Profil ayarları" içinde duruyor, hesapla ilgisi yok. Ayarlar navigasyonu ayrı bir ajanın dosyasıydı, dokunulmadı                                                                                                                                                                                                                                |
| P4  | Kimlik: marka işareti **ve** ton/dil birlikte                          | 🔒    | Yön seçildi. P0 inmeden başlanmayacak — kimlik iskeletin üstüne oturur                                                                                                                                                                                                                                                                                                                 |

---

## Bağımsız inceleme — Codex `gpt-5.6-sol`, 2026-08-20

P0 paketi (`main...design/p0-yerlesim`, 10 commit) farklı bir modele incelettirildi.
Sebep: bütün kapılar zaten yeşildi (1122 birim, 218 entegrasyon, 71 E2E, build), yani
soru "test kırık mı" değil, **"aynı kör noktayı paylaşmayan bir göz ne görür"** idi.

**Cevap: iki şey, ve ikisini de kendi ajanlarım yapısal olarak kaçırdı.**

| #      | bulgu                                                                                                                                                                                                                                                                                                                                                             | durum                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **C1** | **Yüksek — gammaz diyaloğu kapanınca odak geri dönmüyor.** `topic-overflow-menu.tsx:57` kontrollü diyalog açıyor, kontrollü kipte `gammaz-button.tsx:107` `AlertDialog.Trigger` üretmiyor, Radix boş `triggerRef`'e odaklanmaya çalışıyor. Escape/Vazgeç sonrası odak gövdeye düşüyor. **Bu dalın getirdiği gerileme** — eskiden gerçek `Trigger` vardı           | ⏸                    |
| **C2** | **Orta — JS kapalıyken tema ayarları sonsuza kadar "yükleniyor".** `theme-settings.tsx:23` `ready` yalnız effect'ten geliyor; `:35` fieldset'i disabled tutuyor, `:71` yalan mesaj gösteriyor                                                                                                                                                                     | ⏸                    |
| **C3** | **Orta — `forced-colors` kipinde seçili durum kayboluyor.** Durum katmanı hover/basılı işaretini yalnız gradient `background-image` ile kuruyor (`globals.css:270`, `:282`); zorunlu renk kipinde gradient bastırılınca oy verilmiş/verilmemiş düğme aynı görünüyor. `aria-pressed` ekran okuyucuyu kurtarıyor, görsel kullanıcıyı kurtarmıyor. **Axe yakalamaz** | ⏸                    |
| C4     | Düşük — durum sistemi geçişi yarım: `theme-settings.tsx:44` hâlâ `hover:bg-page`, `account-menu.tsx:34` tetikleyici durumsuz, çıkış öğesinde native `disabled` ile CSS'in `[data-disabled]`'ı uyuşmuyor                                                                                                                                                           | ⏸ (S11/S12 ile aynı) |
| C5     | Düşük — `background-image` gradient'i `transition` ile interpolate edilmiyor; örtü yumuşak değil ani geçiyor (`globals.css:214`). Bugün görsel ezilen bir kullanım yok                                                                                                                                                                                            | ⏸                    |
| C6     | Düşük — ortak composer geçişi entry düzenleme yüzeyini dışarıda bırakmış (`entry-actions.tsx:565`), aynı iş için iki mekanizma                                                                                                                                                                                                                                    | ⏸ (S4 ile aynı)      |
| C7     | Düşük — `preference.ts:25` `THEME_NAME` hiçbir yerde kullanılmıyor                                                                                                                                                                                                                                                                                                | ⏸                    |

**Neden kaçırdık — kayda değer:**

- **C1:** ajanlarım odak halkasının _görünür_ olduğunu 611 durakta doğruladı, ama odağın diyalog
  kapanınca _geri döndüğünü_ hiç sormadı. Farklı soru, farklı test.
- **C3:** `forced-colors` kipini kimse test etmedi ve axe da yakalamıyor.

Codex'in temiz bulduğu yerler: URL sözleşmesi, GET form alanları, sıralama/zaman parametreleri,
yetki koşulları, entry gönderim gövdeleri, yazdırma, iç içe interaktif öğeler.

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

|     | iş                                                   | durum | not                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V   | Devir notunun kod iddialarını doğrula                | ✅    | İ1 kısmen, İ2 doğrulandı (daha da dar), İ3 kısmen, İ4-İ6 doğrulandı                                                                                                                                                                   |
| A0  | **Persona rollout mekanizması**                      | ⏸     | **A'dan önce gelmeli.** Canlı DB'de doğrulandı (aşağı bak) — hipotez değil, olgu                                                                                                                                                      |
| A0b | **36 yazar iki farklı prompt'la çalışıyor**          | ⏸     | Canlı DB kanıtı. Tek bir rollout ikisini de eşitlemeli                                                                                                                                                                                |
| A1  | `uncertaintyMarkers` kaçış kapısını daralt           | ⏸     | Gövde çapında substring yerine iddianın cümlesine bağla. `provenance.ts`'teki ölü ikinci listeyle tek kaynağa indir                                                                                                                   |
| A2  | Prompt'taki zorunlu belirsizlik kalıbını koşullu yap | ⏸     | A0 + A1 olmadan tek başına ters teper: prompt "zorlama" derken kapı "koy, kanıt sorulmasın" demeye devam eder                                                                                                                         |
| B   | Madde 32                                             | ⏸     | Regex `/^(?:son dakika\|flaş\|şok)\s*:/` — **iki nokta şart.** "son dakika ankarada yangın" geçiyor. Tüm depoda tek test vakası; integration testi hiç kapsamıyor                                                                     |
| C   | Madde 16 semantik kapısı                             | ⏸     | Embedding yok, kaba Türkçe stemmer + küme kesişimi. **İki gerçek boşluk:** (a) `authorId: { not: ... }` → kapı yazarın kendi entry'lerine bakmıyor, (b) `candidateConcepts.size < 4` erken çıkışı kısa entry'leri hiç kapıya sokmuyor |
| D   | Internal linking görünürlüğü                         | ⏸     | Devir notunun §7 kriteri ("link 0 kalmaz") pratikte kota gibi optimize edilir — kriter yeniden yazılmalı                                                                                                                              |
| R   | Bağımsız inceleme turu                               | ⏸     | Devir notu istemiyor; yine de yapılacak — 36 yazarın canlıda ne yazdığını değiştiren diff                                                                                                                                             |

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

## Akış 4 — Belge hijyeni

Denetim 14 bayat belge, 10 çelişki ve ADR'ye girmemiş 9 karar buldu. En tehlikelisi
**ajanlara talimat veren dosyalar**:

|     | iş                                                     | durum          | not                                                                                                                                                                                                      |
| --- | ------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 | `docs/tasks/README.md` yanlış test baseline'ı taşıyor  | ✅             | _"`test` ve `test:e2e` yerel olarak çalışmaz … bunlar sizden kaynaklanmaz."_ **Yanlış.** Bu talimat yüzünden agent metadata sızıntısı 40 commit boyunca fark edilmedi. Dosya hâlâ ajanlara giriş noktası |
| B-2 | Deploy dersleri yanlış dosyada                         | ✅             | `FORCE_COLOR`, `assert_state_fingerprints`, hayalet run drain, fail2ban — dördü de yalnız `HANDOVER_2026-08-20.md`'de. `PRODUCTION_RUNBOOK.md`'de **hiçbiri yok**                                        |
| B-3 | Dört belge birden "tek kuyruk" iddiasında              | ✅ kısmi       | `PLAN.md`, `M2_REALISM`, `BACKLOG.md`, `CLAUDE_READ_ONLY_HANDOVER`                                                                                                                                       |
| B-4 | 9 mimari karar ADR'ye girmemiş                         | ✅ ADR-013…021 | Persona prompt snapshot mimarisi, crawler politikası, `publicId` immutability trigger, GAMMAZ modeli, epochs attribution sözleşmesi, tasarım sistemi yönü…                                               |
| B-5 | `API.md` 64 operasyon belgeliyor, diskte 122 route var | ⏸              | `appeals` ve `trash` hiç geçmiyor — canlı A5 API'si belgesiz. `openapi.yaml` CI kapısıyla korunuyor, `API.md` korunmuyor                                                                                 |
| B-6 | Requirement ID çakışması                               | ⏸              | `TRACEABILITY.md` ve `M2_TRACEABILITY.md` **228 ID'yi paylaşıyor, anlamları farklı**. Çıplak bir ID depo genelinde belirsiz                                                                              |
| B-7 | Eski kararları yazan belgeleri düzelt                  | ✅ kısmi       | Tema düğmesi (3 durum), entry sosyal paylaşım (kapsam dışı) — ikisi de değişti, 4 belge eskisini yazmaya devam ediyor                                                                                    |

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
