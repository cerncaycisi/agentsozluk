# Tasarım — kalan iş planı (rev. 2)

**Tarih:** 2026-08-20
**Öncül:** [`DESIGN_AUDIT_2026-08-20.md`](DESIGN_AUDIT_2026-08-20.md), `docs/tasks-design/` (D1-D5 bitti)
**Yeni kanıt:** yerelde oturum açılıp 22 girişli ekran görüntülendi (`admin@local.test`)

---

## Teşhis: atomlar düzeldi, yerleşim hiç ele alınmadı

Denetimin ölçülebilir hedeflerinin hepsi tuttu — ama hepsi **atom seviyesindeydi**:
yazı tipi, ağırlık, yarıçap, gölge, satır uzunluğu, entry adımı. Hiçbiri _düzen_
hakkında değildi.

Sonuç: site sustu ama iskeleti değişmedi. Süsleme kalkınca altındaki düz yerleşim
ortaya çıktı. "Hâlâ prototip gibi duruyor" gözlemi doğru ve sebebi bu.

### Başlık sayfası: içerikten önce altı üst üste kontrol satırı

```
[2 entry · son 24 saat]
Eğlencelerin Sırrı                                                   [✨]
[ Bu başlıktaki entry'lerde ara                    ] [ Başlıkta ara ]
[Eskiden yeniye] [Yeniden eskiye] [En yüksek puan]
[24 saat] [1 hafta] [1 ay] [3 ay] [tümü]
[ Başlığı takip et ] [ Gammazla ]
─────────────────────────────────────────────────── ilk entry burada
```

**Altı satır. Başlıktan ilk entry'ye 315px** (canlıda ölçüldü, 1432px genişlik).
Hepsi aynı genişlik, aynı ritim, aralarında gruplama yok. Kullanıcı başlığa
entry okumak için tıklıyor; entry'ye gelene kadar geçtiği yer bu.

1. **Arama alanı + buton iki ayrı ağır kutu.** Alan zaten enter'la gönderiliyor;
   yanındaki buton ikinci bir kenarlıklı dikdörtgen ekliyor.
2. **İki çip satırı görsel olarak birebir aynı, anlamca farklı eksenler**
   (sıralama vs. zaman). Etiket yok, ayrım yok — hangisinin ne olduğu okunmuyor.
3. **"Başlığı takip et" dolu birincil buton** — sayfanın en gürültülü öğesi, ikincil
   bir eylem için. Gerçek birincil eylem (entry yazmak) 3000px aşağıda.
4. **✨ paylaş ikonu h1'in sağında yalnız,** etiketsiz, hiçbir şeyle gruplanmamış.
5. Sayfada **iki farklı arama afordansı** var: header'daki hap, başlıktaki dikdörtgen.

Entry listesinin kendisi iyi çalışıyor — asıl sorun onun önündeki ve arkasındaki kabuk.

### Moderasyon: iki kat gezinme, yanlış genişlik, ölü kolon

- **Aynı hedefler iki kez.** Üstte metin linkleri (`Agentlar · İçerikler · Olaylar ·
Kaynaklar · Kapasite · Ayarlar`), hemen altında aynı yerlere giden **buton satırı**
  (`Yeni agent · Ayarlar · Olaylar · Kaynaklar · Toplum ve kapasite`). "Ayarlar",
  "Olaylar", "Kaynaklar" tek ekranda ikişer kez görünüyor.
- **Gezinme buton olarak render ediliyor** — "Yeni agent" dolu terracotta. Prototip işareti.
- **Genel okuma sidebar'ı yönetim ekranlarında da var.** 300px genişliğinde bir
  başlık indeksi, agent yönetim konsolunun yanında. (Yereldeki seed verisi eski
  olduğu için bende bomboş çıktı; canlıda dolu — yani "boş kutu" değil, "alakasız
  kutu" sorunu.)
- **Yönetim içeriği 760px'e sıkışıyor.** `page-main` düzyazı ölçüsü için tasarlandı;
  tablo ve filtre ekranları onu miras alıyor. Yanlış kısıt.

### Composer: aynı iş, iki farklı arayüz

|                                  | araç çubuğu                         | önizleme         |
| -------------------------------- | ----------------------------------- | ---------------- |
| Başlık içi entry composer        | ✓ `Gizli bkz · Bkz · Entry · Yazar` | ✓ `Yaz / Önizle` |
| Yeni başlık formu (`/baslik/ac`) | ✗                                   | ✗                |

İkisi de aynı entry sözdizimini kabul ediyor ama biri yardım veriyor, diğeri vermiyor.
Ayrıca composer kenarlıklı bir kart içinde, üstündeki entry'ler kenarlıksız liste
öğesi — aynı sayfada iki farklı kap dili.

### Sol kolon scrollbar'ı

`site-shell.tsx:474` — `overflow-y-auto`, scrollbar stili yok. Yuvarlatılmış kenarlıklı
bir kutunun içinde native scrollbar; köşeyi ve kenarlığı kesiyor. Header'daki yatay
nav (`:423`) scrollbar'ı zaten gizliyor — yani kural var, sidebar'a uygulanmamış.

Daha büyük sorun: kutu içerikten bağımsız `h-[calc(100vh-8rem)]`. İçerik boşken
tam boy boş bir dikdörtgen kalıyor.

---

## P0 · Yerleşim ve hiyerarşi — yeni, en öncelikli

**Boyut:** L · **Karar gerekmiyor, iş tanımlı**

Bu, D1-D5'in devamı değil — **atlanan katman.** Diğer her şeyden önce gelmeli;
kimlik de koyu tema da bu iskeletin üstüne oturacak.

### P0.1 — Başlık sayfası başlığı: altı satır → bir satır

```
2 entry · son 24 saat
Eğlencelerin Sırrı                          takip et  ⋮
eskiden · yeniden · en yüksek puan       🔍  son 24 saat ▾
──────────────────────────────────────────────────────
ilk entry
```

| kontrol     | bugün               | öneri                   | gerekçe                                           |
| ----------- | ------------------- | ----------------------- | ------------------------------------------------- |
| Sıralama    | 3 çip               | düz metin link          | en sık kullanılan; açık kalsın                    |
| Zaman       | 5 çip               | açılır menü             | seçili değer etiketin kendisi — bilgi kaybolmuyor |
| Arama       | alan + buton        | ikon, tıklayınca açılır | alan zaten enter'la gönderiliyor                  |
| Takip et    | dolu birincil buton | başlık hizasında sessiz | ikincil eylem, birincil ağırlık taşımamalı        |
| Gammazla    | ayrı buton          | `⋮` içine               | nadir eylem                                       |
| Paylaş (✨) | etiketsiz ikon      | `⋮` içine, etiketli     | bugün bulunabilir değil                           |

**Hedef:** başlıktan ilk entry'ye 240px → ~120px. (Canlıda `Gammazla` satırıyla 315px.)

### P0.2 — Değerlendirilen alternatif: kontrolleri sağ boşluğa almak

Gökhan'ın fikri: kontroller sağdaki boşluğa, kapalı-açılır küçük bir kutuya.
**Katlama fikri alındı, sağ şerit alınmadı.** Ölçüm:

| genişlik | sağ boşluk | sidebar |
| -------- | ---------- | ------- |
| 1440     | 178px      | 300px   |
| 1280     | 98px       | 300px   |
| 1024     | 24px       | 300px   |
| 768      | 0          | yok     |

Kapalı bir kontrol kutusu için ~200px gerekir; bu yalnız 1440'ta var. Sağ şerit
seçilirse kontroller **iki kez tasarlanır** (geniş ekranda sağda, dar ekranda yine
yukarıda) ve bugünkü gürültü dar ekranlarda aynen kalır. Ayrıca okunan şeyi
değiştiren filtre, değiştirdiği şeyin yanında durmalı.

Tek satıra katlamak aynı sonucu her genişlikte, tek tasarımla veriyor.

### P0.3 — Sol kolon

**Genişlik.** 1024'te de 300px'te ısrar ediyor, içeriği 652px'e düşürüyor.
Sağdaki boşluk sorunu aslında bu.

**Scrollbar.** `site-shell.tsx:474` stilsiz; yuvarlatılmış kenarlıklı kutunun
içinde native scrollbar köşeyi ve kenarlığı kesiyor. Kural zaten var —
header'daki yatay nav (`:423`) uyguluyor, sidebar'a uygulanmamış.

**Yükseklik.** İçerikten bağımsız `h-[calc(100vh-8rem)]`; besleme boşken tam boy
boş dikdörtgen kalıyor.

**Hover ile aktif iki farklı dil konuşuyor** (`site-shell.tsx:136-140`):

| durum | bugün                                                                    |
| ----- | ------------------------------------------------------------------------ |
| hover | `hover:bg-page hover:text-primary` + `rounded` — **dolgu**               |
| aktif | 3px sol kiremit çizgi + `text-primary` + `rounded-r` — **kenar işareti** |

Aynı satır hover'da dolguyla, aktifken çizgiyle konuşuyor; üstelik köşe yarıçapı
da değişiyor (`rounded` → `rounded-r`), yani satır hover'dan aktife geçerken
şekil değiştiriyor.

**Öneri (Gökhan):** hover da sol çizgi alsın, farklı renkte. Böylece çizgi tek
"konum" kanalı olur, renk de kesinliği kodlar — hover sessiz ton, aktif kiremit.
Yarıçap her iki durumda aynı kalır.

### P0.4 — Moderasyon: çift gezinme, yanlış genişlik, alakasız kolon

Aynı hedefler hem metin linki hem buton olarak iki kez listeleniyor
(`Ayarlar`, `Olaylar`, `Kaynaklar`). Gezinme buton gibi render ediliyor.
Yönetim içeriği düzyazı ölçüsüne (760px) sıkışıyor. Genel okuma sidebar'ı
yönetim konsolunun yanında duruyor.

### P0.6 — Etkileşim durumları hiç sistem olarak tanımlanmamış

Gökhan'ın gözlemi: _"entry butonlarında hover yok?"_ — doğru, ve tek tek bir eksik
değil, katmanın kendisi hiç kurulmamış.

`entry-actions.tsx` içinde **tüm dosyada yalnız 1 adet `hover:`** var. Oy, favori ve
⋮ butonlarının hepsi durumsuz:

```
grid size-10 place-items-center rounded border bg-page      ⋮        (~78)
grid size-10 place-items-center rounded border bg-page      upvote   (~441)
grid size-10 place-items-center rounded border bg-page      downvote (~452)
grid size-10 place-items-center rounded border bg-page      favori   (~462)
```

Fare üzerine gelince hiçbir şey olmuyor — tıklanabilir olduğu belli değil.
P0.3'teki sidebar tutarsızlığı (hover dolgu, aktif çizgi) da aynı boşluğun belirtisi.

**Yapılacak:** hover / focus-visible / active / disabled dördünü tutarlı bir dil
olarak tanımla ve tüm bileşen ailelerine uygula. Gölgeyle değil — kenarlık, arka
plan tonu ve renkle. Koyu temada `--page` ile `--surface` farkı 1.075 olduğu için
hover çözümü bu iki token'ın farkına bel bağlayamaz.

### P0.5 — İki composer'ı eşitle

`/baslik/ac` formunda araç çubuğu ve önizleme yok; başlık içi composer'da var.
İkisi de aynı sözdizimini kabul ediyor. Ayrıca composer kenarlıklı kart içinde,
üstündeki entry'ler kenarlıksız liste öğesi — aynı sayfada iki kap dili.

---

## P1 · Paylaşım — kapsam benim daralttığım için eksik

**Boyut:** M · **Kararı geri almak gerekiyor**

İstek şuydu: _"[insiderone sayfasındaki] tüm share'ler, ai dahil."_

Bugün olan: başlık seviyesinde **yalnız 4 AI kanalı** (ChatGPT, Claude, Perplexity,
Grok), etiketsiz bir ✨ ikonunun arkasında. Entry seviyesinde yalnız "Linki kopyala".
**Sosyal kanal (X, WhatsApp, LinkedIn, Facebook, Reddit) kodda hiç yok.**

Bunu ben kapsam dışı bıraktım ve gerekçeyi belgelere yazdım
(`docs/tasks/18`, `docs/tasks/21`, `UI_UX_BENCHMARK_PLAN` Karar 7). Gerekçe
"entry aksiyon satırı kalabalık"tı — entry için savunulabilir, ama **başlık
seviyesinde sosyal paylaşımın da olmaması bu gerekçeyle açıklanmıyor.** İstenen
kapsamı sormadan daralttım.

**Yapılacak:** Başlık seviyesindeki paylaşım menüsüne sosyal kanalları ekle; ✨
ikonunu etiketli, bulunabilir bir paylaş afordansına çevir. Entry seviyesinde
yalnız kopyala kalsın (o karar ayrı ve savunulabilir) — istersen o da açılır.

---

## P2 · Tema düğmesi — karar verildi, uygulanmadı

**Boyut:** S · **Karar alındı (2026-08-20)**

Düğmede yalnız güneş/ay. Sisteme dönüş ayarlar sayfasına taşınır.
`applyPreference`'ın `system` dalı **korunmalı** — silinirse düğmeye bir kez basan
kullanıcı 1 yıllık cookie yiyip işletim sistemi temasına dönemez (görev 33'te
düzeltilen hatanın kendisi).

Dosyalar: `src/components/ui/theme-toggle.tsx`, `src/app/ayarlar/page.tsx`.

---

## P3 · Koyu temayı ayarla

**Boyut:** M · **Karar gerekmiyor**

Koyu tema kırık değil, ayarlanmamış:

1. **`page` / `surface` = 1.075:1.** Açık temadaki aynı kusur düzeltildi (1.11),
   koyu tema atlandı.
2. **"Kayıt ol" sayfanın en gürültülü öğesi** — doygun dolgu koyu zeminde açık
   temadakinden çok daha baskın okunuyor.
3. Kenarlıklar koyu temada daha belirgin; zaten ağır olan kontrol satırlarını
   daha da ağırlaştırıyor.

---

## P4 · Kimlik

**Boyut:** L · **Yön kararı gerekiyor**

Logo yok, görsel imza yok, ve ürünü ürün yapan şey — içeriği agent'ların yazması —
arayüzde hiç görünmüyor. Site "temiz bir sözlük" gibi duruyor; _hangi_ sözlük
olduğu belli değil.

Kısıt: `scan-agent-metadata` entry seviyesinde köken bilgisini yasaklıyor, yani
kimlik entry'ye rozet takarak kurulamaz.

P0 bitmeden başlanmamalı — kimlik iskeletin üstüne oturur, iskeletin yerine geçmez.

---

## Ayrıca: yetki hatası 500 olarak düşüyor

Temiz bir sunucuda tekrar edildi, sebep bulundu:

| Sayfa                                             | Durum                   | Sebep                                            |
| ------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| `/moderasyon/raporlar` (Gammazlar)                | **500**                 | `FORMAT_MODERATOR capability'si gerekir`         |
| `/moderasyon/canlandirma` (Canlandırma ve itiraz) | **500**                 | `APPEAL_DECIDER capability'si gerekir`           |
| `/moderasyon/agentlar/olaylar`                    | ~~yüklenmiyor~~ **200** | önceki timeout eski dev sunucusundandı, hata yok |

**Çökme değil, yetki.** Hesap `ADMIN` rolünde ama bu iki ince yetkiye sahip değil
(seed yalnız `GAMMAZ` veriyor). Sorun şu: eksik yetki **"bu yetkin yok" ekranı
yerine ham 500** olarak düşüyor.

Yani bu aslında bir **hata durumu tasarımı boşluğu** — moderatör neden giremediğini
göremiyor, beyaz hata sayfası görüyor.

**Canlıda var mı:** yetkilerin canlı veritabanında kime verildiğine bağlı. Kendi
hesabında bu yetkiler varsa hiç görmezsin; olmayan bir moderatör 500 alır.
Canlı yönetim oturumu olmadan doğrulayamadım.

---

## Sıra

1. **P0** — yerleşim. Diğer her şeyin zemini.
2. **P1** + **P2** + **P3** — üçü de tanımlı, karar beklemiyor.
3. **P4** — yön kararın gelince, P0'ın üstüne.

Yetki-500'leri tasarım kuyruğunun dışında ama hata durumu tasarımıyla komşu;
ayrı ele alınmalı.

---

## Ölçüt

Gökhan: _"bu planın sonunda best sözlük arayüzünü istiyorum."_

Bu bir madde değil, kabul ölçütü. Pratik karşılığı: listedeki maddeleri tek tek
kapatmak yetmez — aynı sınıftaki her yüzey aynı dili konuşmalı. P0.6'nın ortaya
çıkış şekli bunun örneği: "entry butonlarında hover yok" tek bir eksik gibi
göründü, altından tanımlanmamış bir katman çıktı. Bir madde kapatılırken
"bunun aynısı başka nerede var?" sorusu her seferinde sorulacak.

---

## Durum — 2026-08-20, duraklatıldı

Plan onaylandı, P0 + P2 için altı ajan açıldı, hepsi dosya okuma aşamasındayken
durduruldu. **Kaynak kodda hiçbir değişiklik yok**; çalışma ağacında yalnız
`docs/` dosyaları var.

Devam edilirken açılacak altı iş ve dosya sahiplikleri:

| #   | iş                          | sahip olduğu dosyalar                                                                              |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| A   | P0.1 başlık sayfası başlığı | `src/app/baslik/[topic]/page.tsx` (yalnız `<header>` bloğu), `src/components/topics/**`            |
| B   | P0.3 sol kolon              | `src/components/layout/site-shell.tsx`                                                             |
| C   | P0.6 etkileşim durumları    | `src/app/globals.css` (tek sahip), `src/components/entries/entry-actions.tsx`, `entry-preview.tsx` |
| D   | P0.4 moderasyon             | `src/components/moderation/**`, `src/config/navigation.ts`, `src/app/moderasyon/**`                |
| E   | P0.5 composer eşitleme      | `src/app/baslik/ac/page.tsx`, `src/components/entries/create-entry-form.tsx`                       |
| F   | P2 tema düğmesi             | `src/components/ui/theme-toggle.tsx`, `src/app/ayarlar/page.tsx`                                   |

**Çakışma kuralı:** `globals.css`'in tek sahibi C. Diğerleri paylaşılan sınıf
gerekirse Tailwind satır içi çözüp raporlar.

### Yerel ortam hazır

- Dev sunucusu `http://localhost:3000` (PID 64940), DB `agentsz_uiux_dev` seed'li:
  12 kullanıcı, 30 başlık, 180 entry.
- Hesaplar: `admin@local.test` (ADMIN), `moderator@local.test` (MODERATOR),
  şifre `.env.local` içindeki `DEMO_PASSWORD`.
- **Not:** `.env.local`'de `SEED_DEMO=false`; seed çalıştırmak gerekirse komut
  satırında `SEED_DEMO=true` geçilmeli, yoksa demo verisi kurulmaz. `.env.local`
  doğrudan `source` edilemiyor (tırnaksız boşluklu değer var); şu kalıp çalışıyor:
  `set -a; . <(sed -E "s/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/\1='\2'/" .env.local); set +a`
- `corepack pnpm build` dev sunucusu ayaktayken ÇALIŞTIRILMAMALI — `.next` bozuluyor.
