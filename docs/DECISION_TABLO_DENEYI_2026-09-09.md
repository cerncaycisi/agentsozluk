# DECISION bağlamı: kayıpsız tablo adayı — 9 Eylül 2026

Durum: **yerel aday; canlı deney başlamadı.** PR #120'de park edilen persona
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

## Dondurulacak yerel kalite protokolü

Model çağrılarından önce manifest ve bütün prompt dosyalarının hash'i kaydedilecek.
Taban `8d61de32ce7e1d9a8194571f3b960eced131c0c8`; adayın commit'i manifest'te.

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
