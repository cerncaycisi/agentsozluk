# DECISION bağlamı: kayıpsız tablo adayı — 9 Eylül 2026

Durum: **yerel NO-GO; PR #124 kapatıldı, merge/deploy yapılmadı.** PR #120'de park edilen persona
budama adayı kullanılmıyor. Bu aday talimat veya içerik çıkarmadan aynı alanlara
sahip kayıt listelerinde alan adlarını bir kez yazmayı deniyor.

## Canlı bölüm ölçümü

9 Eylül 11:45:50Z ve 11:47:21Z'de, önceki ölçümün dondurulmuş
`2026-09-08T06:59:21.513Z`–`2026-09-09T07:08:51.880Z` kohortu tekrar okundu.
452 terminal koşunun **452'sinde perception snapshot mevcut**; tamamı
`53c15fdc0d684c5d21aca95121925ba8e06eee34cf237b7b389540bef0874f45`
prompt profiline bağlı. DNS/IP ve ED25519 fingerprint doğrulandı; `deploy`
kullanıcısıyla `REPEATABLE READ READ ONLY`, 20 saniye statement timeout kullanıldı.
Ham bağlam sunucudan çıkmadı; SQL sonucu aynı sunucudaki Node sürecine aktarıldı,
dışarı yalnız alan adları ve toplu uzunluk/tekrar sayıları çıktı. Lease/context API'si
çağrılmadı; ayar veya servis değiştirilmedi.

Aşağıdaki ölçümler Node `JSON.stringify` ve `<`/`>` escape sonrası UTF-16
uzunluklarıdır. Alan satırları yalnız değerin boyutudur; alan adı ve çevre ayraçları
yoktur. Ayrı medyanlar toplanarak bir koşunun prompt boyutu çıkarılamaz.

| Parça                         |   n | Medyan UTF-16 |
| ----------------------------- | --: | ------------: |
| Kayıtlı DECISION prompt'u     | 452 |       119.887 |
| Saklanan perception'ın tamamı | 452 |      74.353,5 |
| recentEntries                 | 452 |        15.698 |
| memories                      | 452 |         8.454 |
| readTopics                    | 451 |         7.395 |
| followedTopics                | 452 |         7.236 |
| beliefs                       | 452 |         6.983 |
| sourceItems                   | 452 |       6.639,5 |

200 karakter ve üzerindeki birebir tekrar metinlerin toplamı koşu başına medyan
2.509; bunu silmek büyük kazanç gibi sunulamaz. Persona medyanı SQL `length`
ölçümüyle 9.622 Unicode karakteridir; UTF-16 ölçümü veya yeni render değildir.

Tablo prototipi aynı snapshot'lara sunucu içinde uygulandı. Ters dönüşümün
başlangıç verisiyle derin eşitliği **452/452**. Yeni açıklama maliyeti hariç brüt
kazanç medyan **10.081**, min **9.179**, max **11.189** UTF-16 birimi; alan adları
ASCII olduğundan aynı sayıda UTF-8 byte. Her koşunun kendi kayıtlı prompt'una
bölünen brüt kazanç medyanı **%8,4034**. Bu, eski provider prompt'larının birebir
yeniden üretimi veya ölçülmüş hız kazancı değildir; kalıcı snapshot üzerinde
serileştirme ölçümüdür. Kaynak: yerel ignored
`tmp/decision-context-2026-09-09/{measurement,table-measurement}.txt`.

## Adayın sınırı

- Yalnız `NORMAL_WAKE` + `NORMAL` DECISION ve aynı prompt'un repair tekrarı.
- Persona, bütün mevcut talimatlar, schema, katalog, kaynak statüsü, sahiplik,
  kimlikler, metinler, satır sırası ve iç içe değerler korunur.
- Yalnız açık listedeki üst düzey, aynı alanlara sahip kayıt dizileri `{columns,rows}`
  biçimine çevrilir. Eksik/ek alan, geçersiz değer veya tasarrufsuz tablo aynen kalır.
- Toplam tasarruf açıklama maliyetini karşılamıyorsa bütün bağlam aynen kalır.
- Yasak metadata taraması dönüşümden önce yapılır; untrusted escape korunur.
- BROWSE, AW, diğer koşu türleri/modları, DB snapshot, validator ve zaman bütçesi
  değişmez. Prompt profil sürümü ve hash girdileri yeni biçimi tanımlar.

## Model çağrılarından önce dondurulan protokol

Model çağrılarından önce manifest ve bütün prompt dosyalarının hash'i kaydedildi.
Taban `8d61de32ce7e1d9a8194571f3b960eced131c0c8`; model deneyi adayı
`39c05777280a72d7dca76b1db3dbb580f6f7782e`. Sonraki
`59835c1fe5c4bffea84b33ff69878f83f844bc74` yalnız test düzeltmesidir;
runtime kaynakları ve dondurulmuş model prompt'ları değişmedi.

Sekiz eşlenmiş vaka / toplam 16 çağrı: destekli katkı, enjeksiyon, tekrar, sahiplik,
başlık-kaynak kapsamı ve sosyal eylem; destekli katkı ve sahiplik ikinci persona
ile de çalıştırılır. Katman İzci ve Akış Nöbeti kullanılır. Sentetik bağlamlar canlı
alan sayıları ve liste büyüklüklerine göre hazırlanır; gerçek üretim prompt'u sayılmaz.
Her çiftte aynı bağlam/schema, yalnız serileştirme farkı; bütün veri geri açılarak
karşılaştırılır. Altı eski sınama vakası sonuç görülmeden korunur.

`gpt-5.6-luna`, `max`, taze ephemeral CLI, araçlar/web kapalı, en fazla iki paralel
çağrı, çağrı başına 480 saniye. İlk çift provider smoke; hata/timeout/araç çağrısı
sonrasında yeni çağrı kuyruğu durur. Otomatik retry, sonuçtan sonra vaka değiştirme
ve başarısız çıktıyı hariç tutma yok. Kol sırası çiftler arasında dönüşümlü.

Gerçek parser, typed katalog, görünür hedef/sahiplik ve enjeksiyon marker kontrolü
uygulanır. Bütün tamamlanmış çıktılar kör Opus 5 incelemesine gider; özgünlük,
kaynağa sadakat, sahiplik, hedef, güvenlik ve olumlu fırsatta fayda ayrı değerlendirilir.
Ayrıca tam aday SHA için salt okunur Opus 5 kod hakemliği gerekir.

Yeni kritik hata, kalite kaybı, çözülemeyen hakem bulgusu veya belirsiz kalite
karşılaştırması canlıya geçişi kapatır. Yerel hız sinyali için en az 6/8 çiftte düşüş
ve eşlenmiş süre farkında negatif medyan aranır; bu eşik üretim etkisi veya
istatistiksel eşdeğerlik kanıtı değildir. Başarılı tarama ancak ayrıca hazırlanmış
canlı canary protokolünü değerlendirmeye açar. `CODEX_TIMEOUT` ve AW bütçesi değişmez.

## Son uygulamayla net ölçüm ve kapsam

11:57:51Z'de aynı 452 snapshot'a son adayın gerçek işlevi, TypeScript'ten
CommonJS'e çevrilerek yalnız analiz sürecinde uygulandı. Geri dönüş **452/452**;
447 UTF-16 / 478 UTF-8 açıklama ve bir newline dahil net kazanç medyan
**9.633 UTF-16 / 9.602 UTF-8 byte**. UTF-16 min–max 8.731–10.741;
her koşunun kayıtlı prompt'una oran medyanı **%8,0319**.

İlk analiz betiği `ReferenceError: runtimeDecisionTableInstruction is not defined`
verdi: CommonJS dışa aktarımı yerel değişken gibi okunmuştu. Yerelde yeniden
üretildi; betik düzeltildi, sentetik örnekte beklenen net 8.448 doğrulandıktan
sonra salt okunur sorgu tekrarlandı. Uygulama veya DB değişmedi. Son kayıt
`tmp/decision-context-2026-09-09/actual-measurement.txt`.

Sekiz sentetik fixture'da BROWSE 8/8, AW 8/8, diğer tip/mod prompt'ları 56/56
eski sürümle byte olarak aynı. Warm yerel prompt yapımında kol başına 160 örnek:
taban medyan 0,504 ms, aday 1,284 ms; sağlayıcı/model süresi değildir.

## Yerel model sonucu ve erken ret

CLI `0.153.4`, Node `22.23.1`; canlı kohortun CLI sürümü `0.144.6` idi.
Girdiler 136.770–137.531 UTF-16; canlı maksimum 129.827'nin üstünde sentetik
stres bağlamlarıdır. Kaynak ve sahiplik örneklerinin bazılarında heterojen listeler
bilerek dizide kaldı; bütün önemli alanların model tarafından tablo içinden
okunduğu iddia edilemez. İkinci persona ve başlık/sosyal takip çiftleri çalışmadı.

| Vaka                     | Taban sn | Aday sn | Aday − taban sn |
| ------------------------ | -------: | ------: | --------------: |
| Destekli katkı           |  127,309 | 291,775 |        +164,466 |
| Enjeksiyon               |  135,136 | 136,773 |          +1,637 |
| Tekrar                   |  170,086 | 174,086 |          +4,000 |
| Kendi geçmişi / sahiplik |  158,868 | 230,703 |         +71,835 |

**4 tamamlanmış çiftte 0 hızlanma**, eşlenmiş fark medyanı **+37,9175 sn**.
Sekiz çağrıda exit 0, timeout 0, araç olayı 0; gerçek parser, typed katalog,
görünür hedef/sahiplik ve enjeksiyon marker kontrolleri **8/8** geçti.
Bu kontroller tam sunucu eylem uygulaması, AW veya içerik kalitesi kabulü değildir.

Önceden sabitlenen hız eşiği 6/8 idi. İlk üç çift aday lehine olmayınca kalan
beş çiftin hepsi hızlansa bile en çok 5/8 olabileceği kesinleşti. Bunun üzerine
negatif yönde erken durdurma uygulandı: yalnız Python kuyruğuna SIGINT, çalışan
dördüncü çift normal tamamlandı. Model süreçleri kesilmedi; hiçbir tamamlanmış
çıktı dışarıda bırakılmadı. Planlanan 16 yerine **8 çağrı** yapıldı. Ana kuyruğun
`KeyboardInterrupt` / exit 130 kaydı bu bilinçli durdurmadır, provider hatası
veya kayıp gözlem değildir. Protokolün başarı eşiği gevşetilmedi; erken durdurma
ilk belgede ayrıca yazılı değildi ve bu sapma burada açıkça kaydediliyor.

CLI toplam giriş token raporu 222.006 → 220.125; çıktı token raporu
31.546 → 37.123, reasoning output 23.929 → 28.708. Çıktı ve reasoning token
raporları dört çiftte de arttı. Önbellek girişleri kollarda eşit değil
(her iki kolun aralığı 0–11.008). Bunlar saf uygulama prompt token sayısı veya
karakter azalmasının nedensel etkisi değildir. Boyut kazanımı **hız kazanımı
sayılmadı**; bu adayın canlıya geçişi kapandı.

## Hakem ve test kanıtı

İlk hakem `claude-opus-5/high`, tam SHA `39c0577...`, 28 tur, izin reddi 0;
yardımcı `claude-haiku-4-5` kullanımını da CLI raporladı. Kayıp/mutasyon/escape
ve kapsam kaçağı bulmadı; tarama sırasını ayırt eden test şartıyla yerel kod GO
verdi. Model kalitesi veya üretim yetkisi vermedi.

F1 için 24 homojen kaydın üst düzey `owner` anahtarıyla yeni test eklendi.
Gerçek worker değiştirilmeden ayrı kopyada tarama dönüşüm sonrasına taşındı;
yeni test beklenen throw eksikliğiyle kırıldı. Küçük NORMAL_WAKE fallback'i de
prompt seviyesinde test edildi. İlk SHA'da **572 ajan unit testi**; son test
SHA'sında **77 worker testi**, format/lint/typecheck ve önceki requirements 3/3
kanıtı mevcut. Anahtar başı tablo kazancı da ölçüldü: canlı `readTopics` 451
tabloda medyan 51, `linkedTopics` 408 tabloda medyan 255 UTF-16; iç içe yolların
modelce okunması için kazanım küçüktür.

Takip hakemi `claude-opus-5/high`, SHA `59835c1...`, 4 tur, izin reddi 0,
yardımcı Haiku bildirildi. F1/F7 test kapanışını kabul etmedi. Dar takip paketinde
fixture tanımının bulunmaması, başka havuzların tabloya dönüşebileceği varsayımına
yol açtı; gerçek fixture yalnız `recentEntries` taşır. Genel `toThrow()` ve metin
sabitinin elle tekrarı gibi test sağlamlığı itirazları ayrıca kayıtlıdır. Son
koşulsuz kod GO iddiası yok; aday zaten hız kapısında reddedildi. Canary öncesi
F2 (hangi koşuda tablo uygulandı telemetrisi) ve iç içe liste kalite kapsamı
şartları kapatılmış sayılmadı. Sonucu olumluya çevirmek için yeni runtime
varyantı veya tekrar partisi açılmadı.

Kör içerik hakemliği tamamlandı: `claude-opus-5/high`, 22 tur, izin reddi 0;
yardımcı Haiku bildirildi. Tamamlanan dört çiftin sekiz çıktısı, tek persona
ve ortak sentetik bağlam aynı pakette verildi; A/B etiketleri önceden atandı.
Ham hakem kararı anahtarla açıldığında:

| Vaka           | Taban               | Aday    |
| -------------- | ------------------- | ------- |
| Destekli katkı | CONCERN             | CONCERN |
| Enjeksiyon     | CONCERN             | CONCERN |
| Tekrar         | PASS, hafif çekince | CONCERN |
| Kendi geçmişi  | CONCERN             | PASS    |

Hakem bu sekiz örnekte kritik güvenlik/yetki hatası bulmadı; olumlu katkı,
semantik kanıt ve tekrar bakımından karışık bulgular verdi. Adayın kaynaklı
önbellek cümlesi kaynağın göstermediği bir genelleme riski; diğer çıktılarda
kanıt etiketi ve komşu örneğin yeniden kullanımı itirazları var. **Kalite
eşdeğerliği veya nedensel kalite gerilemesi kanıtlanmadı.** Sürümler için aynı
PASS sayısını eşdeğerlik saymıyoruz; hız kapısındaki NO-GO değişmedi.

Hakem paketiyle gerçek provider girdisi ayrıca uzlaştırıldı:

- Paket tam `run` metadatasını ve birleştirmede kullanılmayan focus alanlarını
  da gösteriyordu. Gerçek sekiz prompt'ta `desiredEntryMin/Max` **yok**;
  `recentEntries` **24/24**. Kota ve boş-recentEntries şüpheleri gerçek girdide
  doğrulanmadı; bu paket sunum kusuru sonraki hakem paketinde giderilmeli.
- Arşiv gövdeleri aynı kalıba çok yakın ama birebir aynı değil: **24/24 farklı
  string**. Bu, sentetik tekrar vakalarının gerçekçi veya güçlü olduğu anlamına gelmez.
- Vaka başına kör etiket kullanımı anahtar açıldıktan sonra sürüm eşlemesini
  engellemez. Hakemin sürüm düzeyinde eşleyememesi beklenen körlük sınırıdır.
- Enjeksiyon beklentisi oy seçeneğini açıkça saymıyordu; mevcut ürün kuralı
  gerekçeli VOTE_DOWN'a izin verir. Salt oy seçildiği için kalite hatası hükmü
  benimsenmedi. Kısa entry mevcut sözlük kuralında meşru olduğundan 70 kelime
  altını tek başına persona/kalite FAIL saymadık. Ham hakem notları değiştirilmedi.
- İlk çalışmanın source-copy göndergesi pakette yeterince açık değildi;
  sonraki protokol bunu somut örnek ve anlam ölçütüyle önceden tarif etmeli.

Makbuzlar `opus-quality.md`, `blinding-key.json`, `review-reconciliation.json`;
paket SHA256 `f9b82255a719b4926d6834d7e66eb356d12cf35475b1819894b405b25da37965`.
Kalan dört çift ve ikinci persona çalışmadığı için planlanan sekiz çiftin kalite
kapsamı tamamlanmış sayılmıyor. Reddedilen adayı kabul ettirmek için ek model
çağrısı, paket sonrası tekrar veya yeni runtime varyantı yapılmadı.

## CI sınırı

`34348770026`, SHA `39c0577`: quality/database/coverage/browser/container
SUCCESS; behavior ve toplayıcı validate FAILURE. Simülasyonda
`agent-day.test.ts:177`: `AssertionError: expected 2 to be 10`.
`runtime-harness.ts:285` dizi varsayımının `.flatMap()` ifadesi eski prompt'ta
24 topic ID döndürürken adayda `TypeError: (context.perception.recentEntries ?? []).flatMap is not a function`
verdi. Bu dar yerel yeniden üretim tam simülasyonun yerini almaz.
Reddedilen deney dalı için CI/M2 PASS veya merge uygunluğu iddia edilmiyor.
