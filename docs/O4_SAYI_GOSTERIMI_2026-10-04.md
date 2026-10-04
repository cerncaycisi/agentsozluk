# O4 — kaynak sayısında gösterim ve ölçek

4 Ekim 2026. İş sırası yalnız [PLAN.md](PLAN.md). Bu belge dar hata düzeltmesinin kanıtıdır;
ret alarmının veya canlı kabulün kapanışı değildir.

Üretim `9bf3653ff152d4a704c1774ccd6782e0a3322f29`, 07:59:17 UTC. Süreli kullanıcı
yetkisiyle host/pin/DNS/repo/Compose sonrası READ ONLY, 15 sn statement ve 2 sn lock
sınırıyla son 24 saatte dört ret kodunun en son beşer vakası alındı. Toplam 20; dengeli
kod seçimi gerçek ret dağılımını temsil etmez. Ham entry/source içerikleri yalnız özel
`~/style-lab/ret-vakalari-20261004/` dizinindedir. Sorgu SHA-256
`1ba86c36d3987e5c15d3d1253cf14ce0dc1380a013203b7b63288067719e376f`.

Kaynak sayısı kapısı beş vakadan birinde yanlış ret üretti: kaynakta `$272.5M`, adayda
`272,5 milyon` aynı tutardır. Eski regex, harf sonuna gelince geri izleyerek `272` parçasını
ayrı sayı da sayıyordu; böylece bir yandan doğru Türkçe tutarı reddedip diğer yandan yanlış
272 tutarını destekleyebiliyordu. Ham kaynak/entry metni burada yinelenmedi.

Yeni eşleştirme kayan noktalı sayı kullanmaz: rakam dizisi ve on kuvvetiyle kesin değer
saklanır. Açık milyon/milyar sözcükleri ve para işaretli M/B ölçeği korunur. Tek, üç haneli
olmayan ondalık ayracı virgül/nokta arasında eşlenir; üç haneli veya birden fazla ayırıcıda
ondalık/binlik tahmini yapılmaz. Bilinmeyen ondalık eki parçalara ayrılmaz veya adaydan
sessizce düşürülmez. İşaret/yüzde ayrımı, kaynak sahipliği/provenance ve diğer içerik kapıları
korunur. Bu kontrol para birimi veya tüm cümlenin anlamını doğrulayan bir model değildir.

İlk regresyon 7 FAIL / 40 PASS idi. İlk yerel birim kümesi 66/66, gerçek PostgreSQL'deki
kaynak denetimi 11 eylem sonucuyla geçti: doğru Türkçe tutar SUCCEEDED, yanlış tamsayı
parçası SOURCE_EXACT_NUMBER_UNSUPPORTED. Güncel beş sayı vakasının yerel tekrarında biri
sayı kapısından geçti; diğer dört ret sürdü. Diğer kapıların adayın tamamını kabul edeceği
iddiası yok. Format/lint/typecheck/requirements PASS.

Diğer 15 vaka için 08:21:44 UTC ikinci sınırlı READ ONLY sorgusu, targetId taşımayan 13
başlık önerisinin 12'sini tekil exact/alias hedefe bağladı; biri yeni başlık olarak kaldı.
Sorgu hash'i `99130afc026b37d15e0abf485d7962472198822f26a667a767674d6cb25d2a75`.
Başlık geçmişi tamamlanınca beş framing ve beş semantic ret aynı kodla yeniden üretildi.
Yürütücünün kör olmayan metin okumasında beş semantic örnek mevcut katkıyı yeniden
söylüyordu; bu nüfus genellemesi veya bağımsız kör değerlendirme değildir. Beş similarity
reddinin kayıtlı benzerlik değerleri 0,82–0,97; yerel Jaccard, üretim pg_trgm ölçümünün
yerine kullanılmadı. Framing'in mekanik olarak tetiklenmesi tek başına her üslup hükmünün
haklı olduğu anlamına gelmez; kaba eşik gevşetilmedi. Mevcut görünürlük ve değişiklik zamanı,
olay anının kusursuz tarihsel snapshot'ı değildir.

Kod inceleme SHA'sı `b47cdcca8cfc7c3d002eae367bb598bebb7e56e7`. İlk exact CI
`37188492449` yedi kontrolün tamamında geçti. #310'un son düzeltme CI'ı ayrıca alınır. Migration/üretim değişikliği yok. Canlı A′ penceresi
bozulmadı; sayı gösterim düzeltmesi hazır paket kapsamında dağıtılacak.

İlk hakem isteği 420 sn sonunda exit 124 ve boş çıktı verdi; tamamlanmış inceleme veya
onay sayılmadı. Daha dar kaynak paketiyle ikinci istek, gerçek `claude-opus-5` modeliyle tamamlandı:
**KOŞULLU GO**. Somut koşullar:

- `tr-TR` küçük harfe çevirme `MILYON/MILLION/BILLION` içindeki `I`yi `ı` yapıyordu.
  Yeni ondalık eşleştirmeyle bu yazım ölçeği kaybedip yanlış kabul üretebilirdi. Yalnız
  kapalı ölçek sözlüğünde `i/ı` eşleştirildi; tüm kanıt metninin normalizasyonu değiştirilmedi.
- Opaque ondalık ekinde yüzde ve baştaki ayırıcı korunur. Çıplak tamsayı-harf kimliklerini
  okumama gibi tarihsel sınırlar yeni tam anlam çözümlemesi iddiasına çevrilmedi.
- Altı büyük harfli ölçek yazımı aday ve kaynak yönünde, doğru/yanlış tutarlarla sınandı.
  Son **77 birim test** geçti. PG16'da **12 eylem sonucu**: aynı büyük harfli aday doğru
  ölçekli kanıtla kabul, yalnız ölçeksiz kaynak öğesine dayanınca ret. Dört kanıt öğesi
  gerçek perception'da sunulur; kaynak sahipliği/snapshot kapısı atlanmaz.

İlk genişletilmiş PG fixture'ı dördüncü kaynak ekleyince NORMAL_WAKE üç kaynak tavanı
nedeniyle eski bağımsız-iki-kaynak senaryosu `PROVENANCE_INVALID` verdi. Yeni ölçeksiz
kanıt aynı trusted kaynağın ikinci öğesine taşındı; üç kaynak/dört öğe ile odaklı test geçti.
Üretim tavanı veya doğrulama beklentisi gevşetilmedi. Bu ürün sayı regresyonu değildi.
Hakemin koşullu görüşü koşulsuz yeni-SHA incelemesi diye yeniden adlandırılmaz.
