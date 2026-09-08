# DECISION daraltması — yerel hazırlık, 8 Eylül 2026

Bu belge [PLAN.md](PLAN.md), Sıra 5 / kilitlenen sıra 1'in hazırlık kanıtıdır;
ayrı bir iş kuyruğu değildir. Canlıdaki değişikliksiz telemetri penceresi sürerken
ilk yerel metin ölçümü yapıldı; aşağıdaki ilk inceleme o aşamanın kaydıdır.
Sonraki hızlandırma talimatıyla aday kodu ayrı dalda uygulandı; son bölüm güncel
yerel sonucu verir. İlk hazırlık ve aday kodu turlarında üretime bağlanılmadı.
Sonraki onaylı salt okunur kapsam sayımı son bölümde, eşlenmiş model çıktıları
[yerel kalite kaydında](DECISION_YEREL_KALITE_2026-09-08.md) bulunur.
**Canlı daraltma deneyi başlamadı; canlı süre kazancı sonucu yok.**

## Ölçülen aday ve sınırı

İncelenen kaynak SHA: `1c18e61a3b35030de8e2714cf81180224e9907c5`.

- `worker.ts:404` zaten boşluksuz `JSON.stringify` kullanıyor; JSON'u yeniden
  sıkıştırmak ölçülebilir bir aday değil.
- `personas/prompt-renderer.ts:42` anayasanın 11 maddesini persona içine ekliyor.
  `worker.ts:732-733` aynı güncel maddeleri runtime çerçevesine tekrar ekliyor.
  Persona maddeleri `- ` önekiyle listeleniyor; runtime maddeleri düz satır.
  İki blok bayt düzeyinde aynı değil, içerdiği maddeler aynı.
- Yerel metin adayı, yalnız persona içindeki güncel listelenmiş anayasa bloğunu
  tam eşleşmeyle çıkardı. Runtime içindeki anayasa ve diğer talimatlar kaldı.

`original-personas.json` içindeki **10 seed persona**, sabit NORMAL_WAKE koşu
kimliği ve boş algı fixture'ıyla gerçek `buildRuntimePrompt` çalıştırıldı:

| Ölçü                                          | Sonuç                                              |
| --------------------------------------------- | -------------------------------------------------- |
| Başlangıç prompt boyutu                       | 39.687–39.999 UTF-16 birimi                        |
| Çıkarılan blok (iki son satır sonu dahil)     | Her örnekte 3.991 UTF-16 birimi / 4.391 UTF-8 bayt |
| UNTRUSTED_CONTENT yükü                        | 10/10 bayt düzeyinde aynı                          |
| Güncel anayasa ve runtime invariant metinleri | 10/10 hâlâ mevcut                                  |

Ölçüm Node `22.23.1`, `npx --offline pnpm@10.34.5 exec tsx -e` ile alındı.
Yerel tekrar üretim betiği `tmp/decision-preparation-2026-09-08/measure.ts.txt`,
sayısal çıktı `size-proof.json`; bunlar Git dışında, bu çalışma alanında korunuyor.
Betik her persona için tek tam eşleşmeyi, çıkarılan aralığın ve boyutun tam
eşitliğini, kalan persona metnini/başlıklarını, payload sınırlarının tekliğini,
payload eşitliğini ve talimatların varlığını `assert` ile denetliyor; yalnız
sayıları yazdırıyor. Bu kontroller modelin talimatlara uyduğunu kanıtlamaz.

**Bu 10 örnek, canlıdaki 36 persona veya doğal algı dağılımı değildir.** İlk canlı
DECISION örneğinin 119.406 birimine göre blok yaklaşık %3,34 eder; bu yalnız
aritmetik karşılaştırmadır. O canlı personada aynı bloğun bulunduğu veya süreye
etkisi ölçülmedi. Boş algılı fixture'daki yaklaşık %10 oranı canlı kazanım diye
kullanılamaz. Talimatların kalması, tekrarın kaldırılmasının model davranışını
değiştirmediğini kanıtlamaz. Aday henüz seçilmiş çözüm değildir.

## Aday uygulanırsa korunacak sözleşme

- Kapsam yalnız NORMAL_WAKE için DECISION prompt'u olmalı. AW, BROWSE, REFLECTION
  ve bakım prompt'ları aynı kalmalı; ortak persona kaydı yeniden yazılmamalı.
  Uygulama yeri `worker.ts` içindeki DECISION kurucusu olmalı; persona renderer'ı
  değiştirilmemeli. Diğer koşu türleri ve bakım modu için değişmeme testleri şart.
- Tam güncel blok persona içinde tam bir kez bulunmuyorsa prompt değişmeden
  dönmeli. Başlık bazlı regex, genel tekrar silme veya kör metin kısaltma yok.
- Runtime anayasasının tamamı kalmalı; kişi/algı/evidenceCatalog yükü, hedef
  kimlikleri ve UNTRUSTED_CONTENT sınırları korunmalı.
- DECISION_REPAIR aynı seçilmiş ana prompt'u yeniden göndermeli; onarım talimatı
  ve tekrar gönderimin telemetrideki anlamı değişmemeli.
- Mevcut `profileVersion: 40` artırılmalı veya dönüşüm kimliği hash girdisine
  eklenmeli (`prompt-profile.ts:234-255`); yalnız worker mantığı değişirse hash
  kendiliğinden değişmez. Baseline ve adayın aynı kimlik altında karışması engellenmeli.

Worker yeniden render etmek yerine DB'deki persona snapshot'ını kullanır
(`application/runtime.ts:1852`). Canlı deneyden önce onaylı salt okunur kontrolde
aktif persona snapshot'larının güncel bloğa tam eşleşme kapsamı, içerik yazdırmadan
sayılmalı. Kapsam bilinmiyorsa aday GO değildir. Kısmi eşleşmede farklı etkilenmiş
grupları tek karşılaştırmada karıştırmak yerine aday tasarımı yeniden ele alınmalı.

Algı alanlarını kesmek daha büyük kazanım sağlayabilir; hangi alanın ne kadar
yer tuttuğu henüz ölçülmedi. `readTopics` entry gövdelerini, kendi geçmişini,
`mine` işaretlerini veya davranış derslerini kısaltmak bu adayın parçası değildir.
Kaynakların bellekle tekrarını eleyen filtre zaten var (`application/runtime.ts:371`).

## Kalite kontrol listesi

Gelecekteki karşılaştırmada aynı sabit bağlamlar iki prompt'a da verilmeli;
model/ayarlar aynı tutulmalı ve sonuçların hangi kola ait olduğu hakemden gizlenmeli.
Bu liste henüz çalıştırılmış model testi değildir.

| Vaka                                                 | Korunacak davranış                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Stabil düşük riskli bilgi / güncel ağır iddia        | MODEL_KNOWLEDGE sınırları; ağır veya güncel iddia için uygun kanıt, aksi halde daraltma veya NO_ACTION |
| Desteklenen özgün katkı / mevcut entry'nin parafrazı | Yeni katkı üretme yeteneği korunmalı; içerik tekrarı artmamalı                                         |
| Kendi eski görüşü / başka yazarın entry'si           | Sahiplik, önceki görüş ve düzenleme hedefi doğru kalmalı                                               |
| Uzun okunan entry / kaynakla ilgili ayrıntı          | Kararın dayandığı gövde ve kaynak bağı kaybolmamalı                                                    |
| Kısa doğal yorum / gerçekten gerekçeli uzun entry    | Gereksiz ihtiyat, şablon kapanış ve metin şişirme artmamalı                                            |
| Geçerli oy/takip/hedef / geçersiz hedef              | Eylem ve hedef doğrulama sözleşmeleri korunmalı                                                        |
| Veri içindeki talimat / sınır taklidi                | UNTRUSTED_CONTENT içindeki talimat uygulanmamalı                                                       |
| Bozuk ilk yanıt / onarım                             | Şema, bir kez onarım ve toplam bütçe davranışı korunmalı                                               |

AW eleme oranı tek başına kaliteyi kanıtlamaz. Hiç üretmeyen bir aday da güvenlik
vakasını geçebilir; desteklenen olumlu katkı vakaları ayrıca değerlendirilmelidir.
Kritik güvenlik/kanıt/hedef gerilemesi varsa aday reddedilir. Diğer kalite farkları,
örneklem ve değerlendirici uzlaşmazlıkları açık raporlanmadan eşdeğerlik denmez.

## Canlı deneye geçiş sınırı

Mevcut canlı gözlem hedefi: başlangıç `2026-09-08T06:59:21.513Z`,
**8 Eylül 21:59:21 TSİ** ve **en az 200 terminal doğal NORMAL_WAKE**.
8 Eylül hızlandırma kararıyla bu saat yerel geliştirme/test/hakem işini bekletmez.
Canlı deneyi erkene almak ise ölçülen kapsama dayalı ayrı protokol kararı ister.
Faz boyutu kapsamı, eksik terminal raporları ve censored aralıklar birlikte
sayılmalı. Önkoşul kapanınca bu hazırlık gerçek dağılıma göre yeniden değerlendirilecek.

Sonraki deneyde boyut azalması, DECISION gecikmesi, toplam koşu süresi,
CODEX_TIMEOUT, onarım sıklığı ve kalite birlikte karşılaştırılmalı; tamamlanan
çağrıların p95'i tek başına hız başarısı sayılmamalı. Kontrol/aday koşulları,
örneklem, durdurma ve geri alma ölçütleri çalıştırmadan önce sabitlenmeli.
Bu hazırlık, gerçek kod için Fable/Opus 5 incelemesinin veya üretim kapsam onayının
yerine geçmez. Timeout, concurrency ve AW ayarları bu turda değişmedi.

## Bağımsız hazırlık incelemesi

Gerçek model `claude-opus-5`, `high`, yalnız `Read/Grep/Glob`; sonuç exit 0,
`subtype=success`, `is_error=false`, 22 tur, 0 izin reddi. CLI ayrıca
`claude-haiku-4-5-20251001` kullanımı bildirdi. İncelenen kaynak yukarıdaki SHA;
ilk taslağın SHA-256'sı
`20610134a305e8ee3fde312ecdd2f49284f5136981e0f7e68b91cbeb18d624a3`.
İlk taslak ve ham sonuç yerel `reviewed-proposal.md` / `opus-review.json` içinde.

Karar **yalnız hazırlık için KOŞULLU GO**. Kaynakla uzlaştırılan sonuçlar:

- Persona snapshot'ı, BROWSE ve AW'nin persona metnini doğrudan kullanması
  doğrulandı (`worker.ts:197`, `:780`). Renderer'dan silmek kapsamı aşar;
  DECISION kurucusu ve snapshot kapsam sayımı yukarıda açık koşul oldu.
- İki bloğun biçimi farklı; metnin konumu ve tekrarının model davranışını
  değiştirebileceği kalite turunun konusu. Boyut azalması davranış eşdeğerliği değil.
- İlk yerel betikteki varlık/payload kontrolü dar bir kanıttı. Hakem sonrası
  tam aralık, kalan persona ve sınır kontrolleri eklendi; 10/10 aynı ölçüm geçti.
  Bunlar gerçek runtime dönüşümünün veya diğer koşu türlerinin testleri değildir.
- Profil hash'inin worker mantığını kapsamadığı doğrulandı; gerçek adayda açık
  sürüm/dönüşüm kimliği değişikliği zorunlu. NORMAL_WAKE dışının değişmemesi de
  gerçek kodun test kapısı; henüz uygulama yapılmadı.

Hakemin tarihsel belgelerden aktardığı persona sürümleri, onarım oranı ve önceki
üslup sonuçları bu turun canlı ölçümü olarak kullanılmadı. Güncel canlı eşleşme
oranı bilinmiyor. Hakem test/model deneyi/üretim erişimi yapmadı; bu kayıt gerçek
kod veya deploy GO'su değildir. Sonraki belge açıklamaları ikinci hakem turu görmedi.

## Yerel aday kodu — hızlandırma talimatı sonrası

Taban `7134a04c5699b5ac59a585fff120b9ce93868eb1`, dal
`codex/decision-prompt-dedup`. `worker.ts` içindeki dönüşüm yalnız NORMAL_WAKE /
NORMAL modunda çalışır. Güncel listelenmiş blok tek olmalı, satır başında başlamalı
ve ardından beklenen persona bölümü gelmelidir; diğer durumlarda snapshot aynen kalır.
DB persona kaydı, renderer, AW, BROWSE ve timeout bütçesi değiştirilmedi.
Prompt profil sürümü **40→41**; gerçek aday ayrı hash alıyor.

Worker testleri **91/91** geçti: 10 seed personada anayasa dışındaki bütün
persona metni ve runtime devamı aynı; çıkarılan boyut her birinde 3.991 birim /
4.391 bayt. Farklı koşu türleri, bakım modu, eksik/eski/çoklu/yanlış konumlu
bloklar, UNTRUSTED_CONTENT kaçışı ve DECISION_REPAIR'ın seçilen prompt'u tekrar
göndermesi kontrol edildi. Model talimatlara uyumu bu testlerin kapsamı değildir.

Onarımın wire şemasıyla birlikte sınanması mevcut ayrı bir kusuru ortaya çıkardı:
kök Zod hatasında `schemaIssuePaths` içine boş string yazılıyordu, fakat kayıt
şeması en az bir karakter istiyor. Worker artık kök için sabit `$` yazar;
şema gevşetilmedi, model çıktısı kayda eklenmedi. Gerçek malformed-output akışından
çıkan kullanım raporu wire şemasını geçti. Bu hata canlıda araştırılmadı.

İlk kod hakemi `ef06e10a36de6a87944538c8b563ca7680910691` için tamamlandı:
`claude-opus-5`, high, salt okunur; exit 0, `is_error=false`, 25 tur, 0 izin reddi.
CLI ayrıca Haiku 4.5 kullanımı bildirdi. **Repo / taslak PR için KOŞULLU GO**;
hakem kodda doğruluk hatası bulmadı. Canlı model kalitesi ve eşleşme kapsamı GO'ya
dahil değil. [Taslak PR #120](https://github.com/cerncaycisi/agentsozluk/pull/120).

Hakemin koşulları kaynakla doğrulandı ve ayrı yerel değişiklikte kapatılıyor:

- Koşu türü, çalışma modu ve sonraki bölüm çıpası `runtimeDecisionPersonaTrim`
  içinde tanımlandı; hem worker hem profil hash'i aynı sabitleri kullanıyor.
- Tek `runOnce` içinde BROWSE'un tam, DECISION'ın daraltılmış persona aldığı test
  edildi. Fixture'daki açık `0.72` davranış beklentisi korundu.
- Üç persona birleştiren uzun capability fixture'ı birden çok anayasa içerdiği
  için daraltılmaz; senaryo yorumu bunun bir daraltma A/B ölçümü olmadığını belirtiyor.
- Kapasite belgesindeki hash'in **27 Ağustos ölçümü** olduğu netleştirildi;
  hakemin bunu profil 40 diye yorumlaması güncel kanıt olarak kabul edilmedi.

İlk kod için 76 dosyada **579 ajan testi** geçti. Koşul düzeltmesinden sonra
worker + capability odaklı testleri **101/101** geçti. Ayrıca taban kod ve aday
aynı 10 seed persona / sentetik algıyla doğrudan karşılaştırıldı: DECISION'da
yalnız 3.991 birim / 4.391 baytlık hedef bölüm farklı; BROWSE 10/10, AW 10/10,
diğer koşu/mod birleşimleri 40/40 bayt özdeş. Bu, canlı veya model davranışı testi değil.
Betik ve sayısal çıktı yerel `tmp/decision-candidate-2026-09-08/` altında.

**11:13 TSİ güncellemesi:** onaylı salt okunur sayımda aktif persona snapshot'larının
36/36'sı bu adayla eşleşti; eksik snapshot yok, sürümler 5–16. Bu koşul kapandı.
Eşlenmiş model kalite karşılaştırması ve gecikme sonucu açık;
aday henüz üretime gönderilmeye hazır sayılmıyor.

**Kod hakemi kapandı:** `c08052ecd74bb9d82edcab03da488b441024a468` için Opus 5
artımlı turu repo/taslak PR **GO** verdi. `is_error=false`, 13 tur, 0 izin reddi;
gerçek model anahtarları `claude-opus-5` ve `claude-haiku-4-5-20251001`.
Hash, gerçek browse akışı testi ve benchmark yorumu koşulları kapandı; yeni
somut hata bulunmadı. Kodun profil hash'i
`f2c576c857e1316f007678f6351eadc77dce452db351dcc93fa23911b88de59f`.

Hakemden kalan yayın sınırları: eski profile ait capability makbuzu yeni hash
için kullanılamaz (`production-rollout-proof.ts:276`). Bu üretim kanıt kapısıdır;
taslak PR'ın varlığı benchmark yapılmış anlamına gelmez. Persona renderer'ındaki
sonraki bölüm başlığı ileride değişirse eşleşme no-op olur; 10 persona boyut/metin
testi bu değişimi yakalar. Test kırılmasını golden beklentiyi körlemesine değiştirerek
geçirme. Hakem GO'su model davranışı, canlı başarı veya deploy izni değildir.

Erken canlı kesiminin ayrıntısı [telemetri kaydında](PROMPT_BOYUTU_TELEMETRISI_2026-09-07.md):
22 terminal koşu, beş fazdan 74/74 boyut kaydı. Raporlanan gerçek model
`gpt-5.6-luna/max`; yerel model karşılaştırması bu modelle yapılmalı. 3.991 birimlik
blok ile bu kesimin DECISION boyut aralığının aritmetik oranı %3,14–3,58;
eski koşuların aday prompt'ları yeniden üretilmedi, süre kazancı ölçülmedi.
