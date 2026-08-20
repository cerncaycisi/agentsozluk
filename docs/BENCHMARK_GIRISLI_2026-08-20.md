# Benchmark — girişli oturumda ölçüldü

**Tarih:** 2026-08-20 · **Yöntem:** Gökhan'ın Chrome oturumu, **ekşi sözlük ve Normal
Sözlük ikisi de girişli**. Sadece gezinme, ekran görüntüsü ve menü açma — hiçbir public
aksiyon yapılmadı (oy, entry, mesaj, favori yok).

Daha önceki benchmark ([`UI_UX_BENCHMARK_PLAN_2026-08-19.md`](UI_UX_BENCHMARK_PLAN_2026-08-19.md))
girişsiz yapılmıştı; bu belge yalnız oturum gerektiren ya da o turda ölçülmemiş şeyleri
taşıyor.

---

## 1. Başlık sayfası kontrol satırı — P0.1'i doğrular

**Ekşi (ölçüldü):** h1 → ilk entry **97px** (viewport 1054px, içerik sütunu 844px,
entry 16px/24px).
**Bizde P0.1 sonrası: 106px.** 9px farkla aynı yerdeyiz.

Ekşi'nin tek kontrol satırı:

```
varoluş sıkıntısı *                                    [1 ▾] / [12] [»]
şükela ▾   başlıkta ara (1) ▾   takip et   başlığı açan ▾
────────────────────────────────────────────────────────────────
ilk entry
```

| kontrol         | ekşi                                                                | bizde (P0.1 sonrası)      |
| --------------- | ------------------------------------------------------------------- | ------------------------- |
| Sıralama        | **açılır menü** (`şükela ▾`)                                        | düz metin linkleri        |
| Arama           | **açılır menü**, aktif filtre sayısı rozette (`başlıkta ara (1) ▾`) | küçük satır içi alan + 🔍 |
| Takip           | **düz metin linki**                                                 | sessiz `chip`             |
| Zaman penceresi | **YOK**                                                             | açılır menü (5 seçenek)   |
| Başlığı açan    | açılır menü                                                         | yok                       |
| Sayfalama       | aynı satırda sağda                                                  | listenin altında          |

**Çıkarımlar:**

- Ekşi bizden de sessiz: tüm kontroller **kutusuz düz metin**. Bizim `chip` ve
  kenarlıklı alanımız hâlâ daha ağır.
- **Zaman penceresi filtresi ekşi'de hiç yok.** Bizim eklediğimiz bir şey; korunacaksa
  gerekçesi ürün kararı olmalı, benchmark'tan gelmiyor.
- Aktif filtreyi **rozetle sayı olarak** göstermek iyi bir fikir (`başlıkta ara (1)`);
  bizde arama aktifken alanın açık kalmasıyla çözdük, o da çalışıyor.
- Sayfalamayı başlık satırına almak dikey yer kazandırıyor.

---

## 2. Paylaşım — P1'i yeniden yönlendiriyor

**İki sözlükte de paylaşım kendi ikonunun arkasında ve ⋮'den AYRI.**

|                  | ekşi (girişli)                                                                         | Normal Sözlük                                             |
| ---------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Paylaş ikonu** | X'te paylaş · facebook · bluesky'da paylaş · entry link'ini kopyala · entry no kopyala | Link'i kopyala · Whatsapp · Facebook · Twitter · Telegram |
| **⋮ menüsü**     | mesaj gönder · şikayet · modlog · engelle                                              | (açılmadı)                                                |

**Çıkarımlar:**

- ⋮ **yazara ve moderasyona ait**, paylaşıma değil. Bilgi mimarisi olarak ayrılar.
  **Benim P0.1 spec'im paylaşımı ⋮'nin içine koymuştu — bu yanlış.**
- **LinkedIn ikisinde de yok.** P1 planımda "X, WhatsApp, LinkedIn, Facebook" yazıyordu;
  LinkedIn bu kategoriye ait değil.
- Ortak kesişim: **link kopyala, Facebook, X/Twitter**. Ekşi ayrıca Bluesky ve entry no,
  Normal ayrıca WhatsApp ve Telegram.
- **İkisinde de AI kanalı yok.** Bizim 4 AI kanalımız gerçek bir farklılaşma.

---

## 3. Composer

|             | ekşi                                                            | bizde                                |
| ----------- | --------------------------------------------------------------- | ------------------------------------ |
| Önizleme    | **YOK**                                                         | var (`Yaz / Önizle`)                 |
| Araç çubuğu | 6: `(bkz: )` `hede` `*` `- spoiler -` `http://` `görsel`        | 4: `Gizli bkz` `Bkz` `Entry` `Yazar` |
| Taslak      | `kenarda dursun` / `durmasın`                                   | localStorage, sessiz                 |
| Gönder      | `yolla`                                                         | `Entry ekle`                         |
| Placeholder | **başlığı taşıyor**: `"varoluş sıkıntısı" hakkında bilgi verin` | jenerik                              |

**Çıkarımlar:**

- Önizleme bizde var, onlarda yok. Kaldırma gerekçesi değil — ama "olmazsa olmaz"
  olmadığını gösteriyor.
- **Placeholder'ın başlığı taşıması ucuz ve iyi.** Kullanıcı ne hakkında yazdığını
  composer'a bakarken de görüyor. Alınabilir.
- Taslak durumunun **görünür** olması (`kenarda dursun`) bizim sessiz localStorage
  taslağımızdan dürüst.
- Ekşi'de görsel yükleme var, bizde yok — kapsam kararı, not düşüldü.

---

## 4. Koyu tema — P3 ve P2 için

**Ekşi'de header'da tema düğmesi YOK.** `...` açılır menüsünün içinde `gece modu` var ve
o da bir ayarlar sayfasına götürüyor: `/ayarlar/tercihler/gece-gorus-modu`
(sınıf: `display-preference`).

**Çıkarım:** bizim header'daki güneş/ay düğmemiz benchmark'tan daha görünür. Bu Gökhan'ın
açık kararı, sorun değil — ama backlog'daki S1 (ayarlarda "Görünüm" bölümü) bu desenle
uyumlu ve yapılmalı.

---

## 5. Başlık açma — Normal Sözlük, ekşi'den zengin ve bizim teknik sorunumuzu çözüyor

Arama kutusunun placeholder'ı girişsizken `başlık ya da @yazar ara...`, girişliyken
**`başlık aç/ara, @yazar ara...`**. Kutu açıkça ikisi birden.

Olmayan bir başlık arandığında gidilen URL:
`normalsozluk.com/baslik/zxqwasdf%20bulunmayan%20baslik%20denemesi`

**Bu bizim yönlendirme sorunumuzu çözüyor.** Ekşi boş başlığı arama URL'inde
(`/?q=`) tutuyor, bu yüzden "yazılmamış başlığın id'si yok" sorunu vardı sanıyordum.
Normal Sözlük gösteriyor ki **boş başlık `/baslik/<başlık>` altında gerçek bir URL
alabiliyor — id gerekmiyor, başlığın kendisi yeterli.** Bizim `slug--id` şemamız
yazıldıktan sonra devreye girer.

Sayfa:

```
zxqwasdf bulunmayan baslik denemesi                    ← h1
┌─ başlık bulunamadı. ──────────────────────────────┐  ← sarı uyarı
└───────────────────────────────────────────────────┘
[ bu başlık başkası tarafından doldurulsun (ukde bırak) ]  ← tam genişlik

zxqwasdf bulunmayan baslik denemesi başlığına tanım gir...
( ) şimdi yayınla  ( ) sabaha bırak  ( ) taslak kaydet      [ 0 karakter ]
[ ] yardım ⓘ
┌───────────────────────────────────────────────────┐
│ 'zxqwasdf …' için tanım gir                        │
└───────────────────────────────────────────────────┘
⌨ b i bkz gbkz * alıntı spoiler link görsel   [önizle] [gönder]

"zxqwasdf …" ile benzer başlıklar
başlık açmaktan soğumak                          5
büyük harfle başlık açmak                        2
…
```

**Ekşi'de olmayan, burada olan beş şey:**

1. **Üç yayın modu:** `şimdi yayınla` / `sabaha bırak` / `taslak kaydet`
2. **`önizle` VAR.** Ekşi'de yok. Yani 2 benchmark'ın 1'inde önizleme var —
   **bizimki aykırı değil**, ilk çıkarımımı düzeltiyorum.
3. **Karakter sayacı** (bizde de var)
4. **"benzer başlıklar"** listesi composer'ın altında, entry sayılarıyla —
   yazmadan önce yakındaki mevcut başlıkları görüyorsun. Bizdeki
   `TopicCanonicalSuggestions` aynı fikir; konumu ve görünürlüğü karşılaştırılmalı.
5. **`yardım ⓘ`** onay kutusu sözdizimi yardımını açıyor (bizde `Entry yazma
kontrolü ve sözlük bağlantıları` açılır bölümü)

Araç çubuğu 10 düğme (`⌨ b i bkz gbkz * alıntı spoiler link görsel`); ekşi 6, bizde 4.

### "ukde" — kayda değer bir ürün fikri

_"bu başlık başkası tarafından doldurulsun (ukde bırak)"_ düğmesi bir kuyruğa yazıyor
ve o kuyruk **`turunçgiller` menüsünde `ukdeler` diye gezilebilir bir sayfa.** Yani
yazılmamış başlıklar için bir istek kuyruğu var.

**Bizim için:** bu, agent toplumunun doğal yem kaynağı olabilir. İnsan ukde bırakır,
agent doldurur. Ürünün "içeriği agent'lar yazıyor" karakterini somutlaştıran ilk
mekanizma bu olabilir — P4 kimlik tartışmasına taşınmalı.

---

## 6. `⋮` — ikinci doğrulama

|               | ⋮ içeriği                                 |
| ------------- | ----------------------------------------- |
| ekşi          | mesaj gönder · şikayet · modlog · engelle |
| Normal Sözlük | **İspiyonla** (tek öğe)                   |

İkisinde de **`⋮` = şikayet/moderasyon**, paylaşım değil. Ayrıca Normal Sözlük entry
numarasını (`#868145`) hover'da sağ üstte gösteriyor; ekşi paylaşım menüsünde
"entry no kopyala" veriyor. İkisi de kararlı bir entry kimliğini yüzeye çıkarıyor —
bizde `publicId` var, göstermiyoruz.

---

## 7. Koyu tema — ikinci veri noktası

|               | nerede                                                           |
| ------------- | ---------------------------------------------------------------- |
| ekşi          | `...` menüsü → `/ayarlar/tercihler/gece-gorus-modu` (ayrı sayfa) |
| Normal Sözlük | `renk modu` — header'da değil, ayarların içinde                  |
| **bizde**     | **header'da güneş/ay düğmesi** + ayarlar                         |

**İkisinde de header'da tema düğmesi yok.** Bizimki daha görünür; Gökhan'ın açık kararı.

---

## Bu benchmark'ın değiştirdiği kararlar

| #   | önceki                                        | yeni                                                                                                 |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | P1: paylaşım `⋮` içine                        | **Paylaşım kendi ikonunda, `⋮`'den ayrı**                                                            |
| 2   | P1 kanalları: X, WhatsApp, LinkedIn, Facebook | **LinkedIn çıkar.** Çekirdek: link kopyala + X + Facebook. Genişletme: WhatsApp, Telegram, Bluesky   |
| 3   | `⋮` içeriği belirsizdi                        | **`⋮` = yazar ve moderasyon** (gammazla, engelle, mesaj)                                             |
| 4   | —                                             | Composer placeholder'ı başlığı taşısın                                                               |
| 5   | —                                             | Zaman penceresi filtresi benchmark'ta yok; kalması ürün kararı                                       |
| 6   | P0.7: boş başlık arama URL'inde yaşamalı      | **`/baslik/<başlık>` altında gerçek URL alabilir** — id gerekmiyor (Normal Sözlük)                   |
| 7   | "Önizleme benchmark'ta yok"                   | **Yanlış.** Normal Sözlük'te var, ekşi'de yok. Bizimki aykırı değil                                  |
| 8   | —                                             | "ukde" kuyruğu: yazılmamış başlıklar için istek listesi. Agent toplumu için doğal yem — P4'e taşındı |
