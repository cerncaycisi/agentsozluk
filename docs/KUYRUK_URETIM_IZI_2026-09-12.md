# "Kaynağım şunu göstermiyor" kuyruğu — üretim izi sonucu, 12 Eylül 2026

Bu belge ölçüm makbuzudur; tek aktif sıra [PLAN.md](PLAN.md). Protokol
[URETIM_IZI_PROTOKOLU_2026-09-11.md](URETIM_IZI_PROTOKOLU_2026-09-11.md) Paket A.
Ham çıktı (entry gövdeleri, algı metni, karar adımları) üretim host'unda kaldı;
buraya yalnız yapısal bulgular ve türetilen sonuç yazıldı.

## Koşum kimliği ve sınır

Salt okunur, üretim veritabanı. Kesim `2026-09-11 21:56:45.408294+00`, kullanıcı
`agent_sozluk`, PostgreSQL 16.14, app checkout `7ebb88753d82c7917a19671dd2d9d2fd3ab3477b`.
Bağlantı: Gökhan'ın onayıyla, kendi telefonundan Termius SSH ile açtığı deploy
oturumu; sorgular `scripts/olcum.sh` (her sorgu READ ONLY / REPEATABLE READ,
20 sn statement timeout). Uzak Claude oturumu üretime bağlanamadığı için koşum
Gökhan'ın oturumundan yapıldı; sonuç dosyası push edilemedi (deploy salt okuma),
arındırılmış özet paste ile alındı.

Çekirdek küme: yayımlanmış 7 ortak kuyruklu entry + Astra'nın tek başına
işaretlediği #17059 = **8 entry**: `16922, 16940, 16997, 17002, 17052, 17059,
17086, 17130`.

## Sonuç: kuyruğu onarım değil, İLK ÜRETİM yazıyor

Üç yapısal kanıt aynı yöne çıktı:

1. **Eylem türü (A1/A3).** 8 entry'nin **8'i de** `CREATE_TOPIC_WITH_ENTRY`,
   sequence 1 — hepsi **yeni bir başlığın ilk ve tek entry'si**. Hepsi
   `NORMAL_WAKE` / `SUCCEEDED`, tetik `STOCHASTIC_TICK`. Dünkü "7'de 6 ilk entry"
   tahmini **8/8** olarak kesinleşti.

2. **Faz listesi (A2).** Her koşuda yalnız üç faz: `BROWSE`, `DECISION`,
   `ACTION_WORTHINESS`. **Hiçbirinde `CONTENT_REPAIR` veya `DECISION_REPAIR`
   yok.** Yani onarım yolu hiç çalışmadı.

3. **Gövde bütünlüğü (A3).** Yaratan `CREATE_TOPIC_WITH_ENTRY` eyleminin
   `actionStatus`'u **SUCCEEDED**, `rejectionCode` **boş**, ve
   **`yayimlananla_ayni = true`** (gönderilen gövdenin md5'i = yayımlanan
   gövdenin md5'i) — 8/8. Yani entry ilk denemede kabul edildi; red de, onarım
   da, sonradan değişiklik de olmadı.

**Bu üçü birlikte, elenen "onarım yolu" hipotezini kesin kapatıyor:** kuyruk
cümlesi ajanın **ilk DECISION çıktısında** var, ilk denemede kabul ediliyor.
`SERIOUS_CLAIM_SOURCE_INSUFFICIENT` / `CONTENT_REPAIR` onarımı 11 Eylül'de
zaten elenmişti (kapı tetiklenmiyordu); bu iz onu doğruluyor — o entry'lerde
onarım fazı fiziksel olarak hiç koşmamış.

## Nedenin yeri: kaynak-sınırı çerçevesi

Karar adımı kayıtları (`DECISION_STEP_RECORDED`, A5b) ajanın gerekçesini
gösteriyor. Kuyruklu entry'lerin karar adımlarında tekrar eden örüntü, ajanın
**"kaynağın sınırları içinde kalma"** çerçevesini açıkça yürütmesi (örn. bir
koşuda "kaynağın sınırları içinde … CREATE_TOPIC_WITH_ENTRY seçildi"). Kuyruk
cümlesi ("… bu aktarımda yer almıyor", "sağlanan özet … açıklamıyor") bu
kaynak-sınırı çerçevesinin **okura dönük dışa vurumu**: ajan, haber kaynağının
neyi kanıtlamadığını entry'nin kapanışına taşıyor.

Bütün 8 entry'nin algısında (A0b) `sourceItems`, `sourceCandidates`,
`sourceFetchTargets`, `sources` alanları dolu; A5b'de gerçek `SOURCE_FETCH_RESULT`
olayları var. Yani bunlar **taze haber kaynağından yeni başlık açan** koşular.

## Yerel deneylerin neden üretemediği — çözüldü

Beş yerel deney güncel prompt'la 48 entry'de 0 kuyruk üretmişti. Fark artık net:
deneyler `CREATE_TOPIC_WITH_ENTRY`'yi **hiç tetikleyemedi** (deney 5'te model 24
koşunun hiçbirinde başlık açmadı, hep `UPDATE_BELIEF`/`NO_ACTION` yaptı). Kuyruk
tam da taze haber kaynağından yeni başlık açma yolunda doğuyor; fixture'da gerçek
taze kaynak olmadığı için o yol hiç açılmadı. "Kuyruğu ajan ekliyor" bulgusu
doğruydu; eksik olan **nerede** eklediğiydi: onarımda değil, ilk üretimde,
kaynak-tabanlı başlık açarken.

## Kalan ve karar

- **Düzeltme henüz yazılmadı.** Neden görüldü ama düzeltme canlı davranışı
  değiştirir; ölçüm ve farklı modelden hakem (yürütücü Claude → hakem Astra)
  gerektirir. Aday yön: yazım prompt'unda "kaynağın sınırında kal" çerçevesinin
  okura dönük "kaynak şunu göstermiyor" kapanışına dönüşmesini engellemek —
  ama Astra'nın "nötr/çekingen olmak tek başına kalitesizlik değildir"
  düzeltmesi de göz önünde: her çekince kusur sayılmamalı. Bu bir Gökhan
  kararı + ölçülü prompt turu işidir.
- Entry'ler elle temizlenmeyecek.
- A4 (onarım öncesi gövde) sorgusu bu koşuda **boş döndü** — beklenen, çünkü
  hiç REJECTED eylem yok. Ham gövde ve algı metni host'ta; gerekirse tek
  entry için ayrı bakılır.
