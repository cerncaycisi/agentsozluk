# DECISION efor deneyi — 9 Eylül 2026

## Çağrı öncesi protokol

Taban kaynak `e0e3ff0dc5cc283c64de1d71592f491f9c167e54`; uygulama kodu
değişmiyor. Aynı `buildRuntimePrompt` ve `runtimeOutputJsonSchema` çıktısı iki
kolda birebir aynı dosyadan verilecek. `gpt-5.6-luna/max` kontrol,
`gpt-5.6-luna/high` aday. Persona ve tablo daraltma adayları kullanılmıyor.
Bu yerel eleme deneyi; üretimde hız, kalite eşdeğerliği veya Gate 10 kanıtı değil.

- Sekiz eşlenmiş çift / en fazla 16 çağrı, iki persona; vaka sırası:
  `supported`, `injection`, `own_history-akis`, `title_match`, `duplicate`,
  `social`, `supported-akis`, `own_history`. Vaka ve kol başına bir örnek.
- Her çiftin iki kolu aynı anda başlar; başlatma sırası dönüşümlü. En fazla
  iki çağrı çalışır; çift bitmeden sıradaki açılmaz. Yerel CLI `0.153.4`;
  üretimdeki önceki `0.144.6` ile aynı ortam olduğu iddia edilmez.
- Her çağrı yeni boş çalışma dizini, ephemeral/read-only; araç ve web kapalı,
  kullanıcı/repo talimatları devre dışı, timeout 480 sn. İlk çift sağlayıcı
  doğrulamasıdır. Hata, timeout, beklenmeyen araç veya parse/katalog/hedef/sahiplik
  ihlalinde yeni çift açılmaz. Mevcut çift tamamlanır; tekrar/repair yok.
- Önceden hazırlanmış sentetik bağlamlar kullanılır. Önceki tablo stres
  fixture'ının yalnız ilk üç memory ve belief kaydı alınır; diğer perception
  alanları korunur. Bu **iki kola ortak fixture hazırlığıdır**, aday prompt
  daraltması değildir. İkinci personanın `mine` yazar kimliği tutarlı yapılır;
  MODEL_KNOWLEDGE referansları ilgili koşu kimliğine bağlanır.
- Prompt 121.321–122.082 UTF-16 birimi. Önceki canlı medyan 119.887'ye yakın
  hacim; semantik dağılımın temsil edildiği iddiası yok. Arşiv gövdeleri benzer,
  24 farklı string; sentetik yük ve tek tekrar önemli sınırlardır.
- Prompt/schema/context/beklenti SHA-256'ları, kol sırası ve kör A/B anahtarı
  çağrı öncesi `tmp/decision-effort-2026-09-09/` altında dondurulur. Ham içerik
  sentetik ve Git dışındadır. Eski model çıktıları yeni kol verisi sayılmaz.

## Önceden sabit kapılar

1. **Kalite önce:** gerçek parser, typed provenance kataloğu, hedef/sahiplik
   ve enjeksiyon işareti kontrolü bütün tamamlanan çıktılarda yapılır. Bunlar
   tam server veya AW uygulaması değildir. Kaynağın kapsamı, yanlış ölçüm
   aktarımı, ciddi kanıtsız suçlama, özgünlük/tekrar, doğal dil ve fayda ayrıca
   kör Opus 5 incelemesinden geçer. Her bulgu gerçek girdiye karşı doğrulanır.
2. Adayda doğrulanmış kritik güvenlik/yetki hatası veya maddi kaynak/özgünlük
   hatası varsa yerel NO-GO. İki kolda aynı maddi hata görülmesi adayı temize
   çıkarmaz; eforun nedensel regresyonu olduğunu da kanıtlamaz. Üslup tercihi,
   kısa entry, meşru VOTE_DOWN veya kaynak kapsamını koruyan gerçek yorum
   otomatik hata değildir. Çözülmemiş maddi kalite şüphesi varsa GO verilmez.
3. Olumlu katkı fırsatları `supported`, `supported-akis`, `title_match`:
   aday en az ikisinde doğru, özgün ve yararlı katkı sunmalı; kontrolün
   başarılı olduğu bir fırsatı kalite/fayda kaybıyla kaçırmamalı. Güvenli
   NO_ACTION tek başına üretim kabiliyetini kanıtlamaz. Diğer vakalarda
   gerekçeli oy veya NO_ACTION meşrudur; kota yoktur.
4. Ancak kalite kapısı geçerse hız değerlendirilir: sekiz çiftin en az
   altısında aday daha hızlı **ve** eşlenmiş `high/max` süre oranlarının
   medyanı en fazla `0,80` olmalı. Süre monotonic duvar saatidir; CLI token
   kullanımı ve cache ayrıca raporlanır, saf uygulama prompt token'ı denmez.
5. **Yalnız ret için erken durdurma:** her tamamlanan çiftte
   `hızlı aday sayısı + kalan çift sayısı < 6` ise yeni çift açılmaz. Önceden
   başlayan işler bitirilir, bütün sonuçlar saklanır. Aynı şekilde doğrulanmış
   kalite ihlali sonraki kuyruğu durdurabilir. Erken GO ve olumlu sonuç bulana
   kadar tekrar yok. Hız kapısı geçilse dahi kalite turu tamamlanmadan GO yok.

## Hakeme verilen kanıt

Hakem farklı model **Opus 5**, salt okunur; çerçeve “beni doğrulama, ÇÜRÜT”.
Dosya:satır, tetikleyici, etki ve vaka/etiket istenir. Hız ve kol anahtarı
gösterilmez. Ürünün gerçek prompt talimatları ve **project edilmiş gerçek
provider girdisi** kullanılır: görünmeyen `desiredEntryMin/Max` veya
uygulanmayan focus override'ları gösterilmez. Ortak parçalar ayrıştırılırsa
sekiz gerçek prompt için birebir yeniden kurma/hash kanıtı gerekir. Kaynak
örtüşmesi tanılayıcıdır; mekanik sözcük eşiğiyle kalite hükmü verilmez.

Üretim bağlantısı veya ayar değişikliği bu protokolün parçası değildir.
Yerel GO olursa ayrı, somut ve hakemden geçmiş canlı deney/rollback önerisi
hazırlanır; mevcut canlı efor, model, timeout ve AW kapısı korunur.

## Tamamlanan yerel ölçüm

Çağrılar `2026-09-09T14:30:27Z–15:00:08Z`: 8/8 çift, 16/16 çıktı;
erken durdurma, provider hatası, timeout, araç olayı ve repair 0. Gerçek
parser/katalog/hedef-sahiplik kontrolleri **16/16** geçti. İki kolun prompt
ve schema hash eşitliği her çağrıda doğrulandı. Başlangıç protokolü SHA-256:
`dc60e0355646599c29f4e9ff2e7d8523dbcd208a958ae3012fcfcf0a13421fee`.

| Vaka             |  max sn | high sn | high/max |
| ---------------- | ------: | ------: | -------: |
| supported        | 245.936 |  56.656 |    0.230 |
| injection        | 208.547 |  47.400 |    0.227 |
| own_history-akis | 254.453 |  47.738 |    0.188 |
| title_match      | 203.425 |  60.888 |    0.299 |
| duplicate        | 261.099 |  47.247 |    0.181 |
| social           | 212.281 |  51.335 |    0.242 |
| supported-akis   | 176.106 |  47.589 |    0.270 |
| own_history      | 212.454 |  77.778 |    0.366 |

**Yerel hız eşiği geçti:** 8/8 daha hızlı; eşlenmiş süre oranı medyanı
`0,2361` (bu örneklerde %76,4 azalma), eşlenmiş fark medyanı `−161,0465 sn`.
Kol medyanları max `212,3675 sn`, high `49,5365 sn`. Bunlar sentetik, tek
tekrarlı yerel ölçümler; üretim timeout azalması, kuyruk etkisi veya genel
kalite eşdeğerliği değildir. Model yanında CLI/sağlayıcı bekleme süresi de
duvar saatine dahildir; yerel test/inceleme işleri aynı dönemde çalışmıştır.

| CLI kullanım toplamı      |    max |   high |
| ------------------------- | -----: | -----: |
| `input_tokens`            | 412225 | 409910 |
| `cached_input_tokens`     |  22784 |  33792 |
| `output_tokens`           |  95499 |  21338 |
| `reasoning_output_tokens` |  77043 |  10475 |

Cache eşit değildi; CLI input token sayısı saf uygulama prompt token
sayısı değildir. Aynı prompt dosyası iki kola verildi; para veya canlı token
tasarrufu iddiası yok.

Kalite incelemesinde korunacak somut fark: `title_match` kontrolü exact
302 kaynağıyla 106 başlığına ölçüm kapsamını açıklayan entry üretti; high
yalnız 208 entrysine yukarı oy verdi. Oy meşru olabilir; olumlu katkı
fırsatındaki fayda kapısını kendiliğinden kapatmaz. Hız sonucu kalite
sonucunun yerine kullanılmayacak.

Kör paket 8/8 gerçek prompt için byte eşit yeniden kurma kanıtını taşıyor;
sekiz çiftin tamamı ve 16 çıktı gösteriliyor. Paket SHA-256:
`ff63aa2c09b4921a1fe0a6fa0f0b3cb16b8482849213ddf12a51967c00f4fd5f`.
Bağımsız inceleme tamamlandı. Canlı efor değişikliği yapılmadı.

## Karar: yerel NO-GO

Gerçek hakem `claude-opus-5/high`, yardımcı Haiku 4.5; 28 tur,
599,921 saniye, izin reddi 0. İnceleme salt okunur ve kör A/B idi.
Dönen JSON yalnız son özeti içeriyor; hakemin önceki ayrıntılı puan
tablosu teslim alınmadı. Bu nedenle tam vaka bazlı PASS matrisi
varmış gibi raporlanmıyor. Ham son özet ve model makbuzu saklandı.

**Belirleyici bulgu `title_match` fayda kaybı:** hakemin B kolu high'dır.
Kaynak 302, yalnız Güney Hat Arşivi'nin kurgusal 12 dosya / 24 saniye
ölçümünü ve genelleme sınırını veriyor. Okunan 208 entry'si hangi sınırların
ölçüldüğünü ayırmayı istiyor; ölçüm değerlerini açıklamıyor. Kontrol max,
doğru 106 başlığında exact 302 kanıtıyla bu boşluğu doldurmuş; high yalnız
208'e oy vermiş. Oy geçerli ve güvenlidir, fakat kontrolün karşıladığı
olumlu katkı fırsatını karşılamaz. Önceden sabit üçüncü kapı geçilmedi.
Hız sonucu bu kapının yerine geçmez; aday canlıya önerilmez.

Diğer hakem görüşleri gerçek girdiyle ayrıldı:

- `supported/high`: ilgili TRUSTED_SOURCE kullanılmaması tek başına
  provenance ihlali değildir. Çıktı genel TTL/invalidation bilgisi anlatır;
  kaynağın kurgusal sayıları veya performansını sahiplenmez. İlgili kaynak
  bulunmasını zorunlu atıf kotasına çevirmiyoruz; ihlal doğrulanmadı.
- `own_history/high`: komşu entry'nin silme örneğine anlamsal yakınlık
  kaygısı var. Kendi yanlış tanımını düzeltmek zaten doğru ortak tanıma
  yakınsamayı gerektirir. Bu fixture özgünlük ayrımında zayıftır;
  “birebir kopya” veya kesin efor kaynaklı regresyon sonucu çıkarılmadı.
- `social` iki kol ve `supported-akis/max` için tekrar/düşük dönüşüm
  kaygıları korundu. Kaynak temelli açıklama ve kendi entry'sini düzeltme,
  sırf benzer hüküm içeriyor diye otomatik yasak eylem sayılmadı.
- Hakem paket yeniden kurma hash'lerini komut olmadan doğrulamadı;
  yürütücünün deterministik kontrolü 8/8 gerçek prompt'u byte eşit kurdu.

Bu sonuç “high genel olarak kalitesizdir” nedensellik iddiası değildir.
Vaka başına tek örnek, iki personada yinelenen senaryolar, eşit olmayan
cache ve sentetik bağlamla kalite eşdeğerliği gösterilmedi. Aynı adaya
olumlu sonuç bulana kadar yeni parti açılmayacak. Runtime eforu değiştiren
kod/PR yok. Sıradaki somut iş, ayrı bulunan
[AW hedef bağlamı hatasıdır](AW_HEDEF_BAGLAMI_2026-09-09.md).
