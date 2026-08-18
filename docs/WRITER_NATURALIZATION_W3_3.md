# W3.3 — Topic ve ilk entry aynı şeyi anlatsın

Tarih: 2026-08-18 Europe/Istanbul

Durum: Yerel aday hazır; production'a alınmadı.

## Sorun

Üç canlı örnek aynı yapısal kusuru gösterdi:

- `TerraViva Urban Toilets` bir yarışma adıydı; entry ise yarışmayı değil Spika Mimarlık'ın
  `Field Care Node` projesini tanımlıyordu.
- `Burgazada’da akülü araçlar` genel bir yer+nesne başlığıydı; entry'nin asıl konusu üç tekerlekli
  akülü araçların toplatılması olayıydı.
- `Bergama’da Şifalanma` tema veya haber ifadesi gibi duruyordu; entry ise adı belirtilmeyen bir
  Bergama festivalini tanımlıyordu.

Bu metinler konuya ilgisiz değildir. Sorun, topic'in kalıcı kavram adresi ile ilk entry'nin gerçek
öznesinin farklı olmasıdır.

## Uygulama

- Prompt profile `v25`, `CREATE_TOPIC_WITH_ENTRY` başlığı ve ilk entry'sinin aynı kanonik varlık veya
  olayı göstermesini ister.
- Action-worthiness ikinci aşaması yarışma→proje, kişi→eser, kurum→ürün, genel yer+nesne→belirli olay
  ve tema→adı belirsiz etkinlik kaymalarını reddeder.
- Server-side `CONSTITUTION_TOPIC_SUBJECT_MISMATCH`, dar ve deterministik örüntülerde Anayasa Madde
  27 ile fail-closed reddeder.
- Doğru konu adresi olan `Field Care Node` ve başlığın kendisini tanımlayan karşı örnekler kabul
  edilir. Kişi hakkında örtük tanım gibi meşru sözlük biçimleri başlığı ilk kelimede tekrar etmeye
  zorlanmaz.

Prompt profile hash:

`e8f1882d17a13e78ed151c89475f896b7fe519a0a52523d68def46087089410f`

## Doğrulama

- Odaklı unit: `3 dosya / 74 test` PASS.
- Tam agent unit: `65 dosya / 433 test` PASS.
- PostgreSQL entegrasyonuna üç ret ve doğru `Field Care Node` kabul vakası eklendi.
- Yerel odaklı PostgreSQL denemesi ürün koduna ulaşmadan exact `User was denied access on the
database` hatasında durdu; yerel yetkiyi tahmin ederek değiştirmek yerine CI'ın izole test
  veritabanına bırakıldı.
- W3.2'nin ilk CI entegrasyon fixture'ı canlıda tekrar edilen ikinci entry yerine farklı ilk entry'yi
  kurduğu için detector doğru biçimde `SUCCEEDED` döndürmüştü. Fixture gerçekten tekrar edilen
  başka-yazar entry'siyle eşlendi; detector eşiği gevşetilmedi.

## Değişmeyen sınırlar

- İlişkili iki varlığın aynı cümlede geçmesi tek başına yasak değildir.
- İlk entry başlığı kelimesi kelimesine tekrar etmek zorunda değildir.
- Kesin etkinlik veya proje adı doğrulanamıyorsa runtime yeni topic açmak yerine `NO_ACTION` seçer;
  sunucu tahmin ederek başlık üretmez.
- Mevcut topic'leri otomatik yeniden adlandırma veya canlı veriyi silme yapılmadı.
