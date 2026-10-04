# P8 kaynak bankası — 4 Ekim 2026 kapasite onarımı

Bu belge ölçüm ve uygulama makbuzudur; aktif iş sırası `PLAN.md`'dedir.

## Sorun ve değişiklik

Canlı `9bf3653` üzerinde 12:25–12:27 UTC pinli salt okunur ölçümde eski iki bankanın
22 URL'sinin13'ü mevcut beş sahip sınırındaydı: ayniyerde9/12, tersolcek4/10.
Önceki HTTP okunabilirlik kontrolü kapasite uygunluğu anlamına gelmiyordu. Hazırlık
servisinin bu kaynakları reddetmesi doğrudur; sınır yükseltilmedi, mevcut sahip silinmedi.

140 kayıtlı kaynak havuzunda47 adres sınırdaydı. Sınırın altında ve engelli/dormant
kaydı olmayan adreslerden, her adayın bakışına uygun12 kaynak seçildi. Ayniyerde'nin
paketi gündelik kültür, tasarım, tamir, dil ve yolculuk; tersolcek'in paketi haklar,
medya, tüketici ölçütleri, bilim, eğitim, çevre ve sağlık karşılaştırmaları içeriyor.
Bunlar kaynak içeriğinin doğruluğuna otomatik güven veya yazma zorunluluğu değildir.

| Taslak    | URL / origin | Katalog konu etiketi | Ölçülen sahip aralığı | Güvenli okuyucu / seçilmiş öğe |
| --------- | ------------ | -------------------- | --------------------- | ------------------------------ |
| ayniyerde | 12 / 12      | 28                   | 0–3                   | 12/12                          |
| tersolcek | 12 / 12      | 22                   | 0–4                   | 12/12                          |

Kaynak seçimi yalnız yeni doğum bankasında genişletilmiş `verifiedSourcePool` kullanır.
Mevcut şablon üreticisinin varsayılan haritası korunur. Önce/sonra karşılaştırmasında
30 şablonun kanonik hash'leri ve iki adayın kaynak/sourceTopicMappings dışındaki bütün
persona alanlarının hash'leri birebir aynıdır. Yeni aday kaynakları SEED ve unpinned;
URL'ler iki aday arasında ayrıdır. Uygulama mevcut kaynakları kendiliğinden değiştirmez.

`draftVersion=1` korunur: kaynak kapasitesi onarımı yeni semantik kimlik değildir ve
REJECTED v1'in tekrar taramaya alınmasını sağlamaz. Daha önce saklanmış aday snapshot'ı
ve kaynakları yeniden yazılmaz; hazırlanırsa kendi güncel kapasite kontrolüne tabidir.
Mevcut pending adayın eski bankasını yeni bankaymış gibi sunma yolu eklenmedi.

## Kanıt ve sınırlar

- 12:52:08–12:52:46 UTC ilk24 adres, ardından iki Türkçe alternatif mevcut
  `SafeSourceReader` ve persona seçicisiyle okundu. Son seçilen24 adresin tamamında
  en az bir seçilmiş öğe var. Bu26 adreslik tek hazırlık kontrolüdür; model çağrısı,
  DB yazımı, gerçek yazar fetch'i veya yedi günlük aktivasyon kanıtı değildir.
- Son seçimin özel makbuz hash'i:
  `6e57d45e6ead69331ef14b1444d798812d85947345dff8cb2a46906c2e58c123`.
  Ham metin/gövde/credential repoya alınmadı. Tablo kategori sayısı katalog etiketlerini
  sayar; sonradan doğrulanmış kalite kategorisi veya Gate10 kabulü değildir.
- `f9faf6c` tabanında ilk regresyon: 36 birim ve20 gerçek PG16 aday testi PASS.
  Şablon ayrışması, kaynak havuzu eşliği, altı origin/beş kategori alt sınırı ve ret
  kalıcılığı mevcut testlerle doğrulandı. Son hakem/CI ve hazırlık paketiyle birleşik
  kontrol açık; bu sonuçlar canlıya dağıtım değildir.
- Kapasite hareketlidir. Okuma zamanı uygun olan kaynak daha sonra dolabilir;
  hazırlık transaction'ı ortak kaynak kapasitesi kilidi altında sınırı yeniden okur.
  Kayan canlı kaynak başarısı ve aday dışı50/30/20 tabanı ayrıca ölçülecektir.
