# 3 Ekim 2026 — Astra–Opus bütünleşik plan incelemesi

Bu belge kanıt ve karar makbuzudur; iş sırası yalnız [PLAN.md](PLAN.md).
**Son kullanıcı kararı:** uzun takvim reddedildi; PLAN sürüm 2 iki haftalık ilk teslimdir.
Aşağıdaki ilk uzlaşma tarihçedir; güncel takvim incelemesi belgenin sonundadır.
**Yürütücü:** GPT-6-Astra (`gpt-6-astra`). **Hakem:** gerçek `claude-opus-5`.
Kod tabanı `f666d2cdc55ffe294add1f28f6f292411a721c56`. İnceleme üretime bağlanmadı,
uygulama kodu değiştirmedi ve dağıtım yetkisi vermedi. Yeni ürün davranışları tasarım aşamasındadır.

## İstek ve kapsam

Gökhan mevcut planın, kodun, çok seslilik/amaç/ödül/otomatik yeni yazar taleplerinin ve Astra'nın
önerilerinin önce Opus'a verilmesini; ardından bütünleşik planın tekrar incelenip uzlaşıyla
sunulmasını istedi. Boş/yalnız bkz ve ayrı ukte ilkesi dahil edildi. Sınırsız planlama yetkisi
üretim kapıları veya başka sistemlere erişim olarak yorumlanmadı.

## İnceleme turları

| Tur                        | Girdi / gerçek çalışma                                                                                                        | Sonuç                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| İlk araçlı tarama          | Read/Grep/Glob, MCP kapalı; 37 tur, izin reddi 0                                                                              | `error_max_turns`: 36 araç turu tavanında nihai görüş yok. Tamamlanmış hakemlik sayılmadı |
| İlk tasarım görüşü         | Aynı taban; 29 dosyanın tam veya satır numaralı ilgili kaynakları + kullanıcı talepleri + Astra hipotezleri; araçsız, bir tur | Tam bağımsız görüş alındı; mevcut alan ile davranış etkisi ayrıldı                        |
| Bütünleşik plan v1         | PLAN, tasarım sözleşmesi, eski iş eşlemesi; kaynak paketi ve ilk görüşe gerekçeli itirazlar                                   | **PLAN DÜZELTİLMELİ**; P0 yok, yedi P1; kaynakla uzlaştırılıp v2’ye işlendi               |
| Bütünleşik plan v2         | Üç aday belge + v1 bulguları ve kaynak paketi                                                                                 | Önceki yedi P1 kapalı; P7 ön uygunluk ve P2 pilot zamanlaması için iki yeni düzeltme      |
| Bütünleşik plan v3 — nihai | V2 hükmü + düzeltilmiş üç dosya + güncel F07 kaynakları; araçsız, bir tur                                                     | **PLAN GO**; açık itiraz yok; Astra aynı tasarımla uzlaştı                                |

Çağrılar sırayla çalıştı; başka kullanıcı işleri durdurulmadı. CLI kullanım kayıtlarında
`claude-opus-5` yanında yardımcı `claude-haiku-4-5-20251001` girdisi bulunuyor; esas hakemin
modeli yeniden adlandırılmadı. Yerel istek/çıktılar `~/style-lab/butunlesik-plan-20261003/` altında;
ham istemler ve entry metinleri bu belgeye alınmadı.

## Kaynakla doğrulanan ve düzeltilen görüşler

| Konu                                                        | Uzlaştırma                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Bazı persona alanları normal isteme ulaşmıyor               | Doğrulandı: schema → renderer → buildRuntimePrompt; P2'nin ilk adımı                  |
| Persona mesafesi çok sesliliği kanıtlar                     | Reddedildi: girdi mesafesi ve çıktı davranışı ayrı ölçülür                            |
| Ortak üslup kesin kök neden; kısa state kesin etkisiz       | Kanıtlanmadı; kontrollü deney hipotezi olarak yazıldı                                 |
| Ret/sonuç öğrenmesi                                         | Action kaydı ile sonraki uyanışta açık sonuç geri bildirimi ayrıldı; P3               |
| Persona render, üslup ve ret geri bildirimi tek paket olsun | Ayrıldı; tek değişiklik ve farklı kabul makbuzları                                    |
| Oy üzerinden ilk ödül                                       | İlk sürümde sayısal ödül kapalı; mevcut oy hakkı/sıralama korunuyor                   |
| Ödül için AW yayın eşiği artırılsın                         | Kabul edilmedi; yazarın seçim/öğrenme etkisi mevcut yayın yetkisini daraltmaz         |
| Amaç yalnız ölçümde kalsın                                  | Kullanıcı ihtiyacını karşılamaz; ölçümden sınırlı davranış etkisine geçiş kapısı var  |
| Her doğuma bir yazar emekli olsun                           | Kabul edilmedi; kullanıcı istemedi. Mevcut yazar silinmez, kapasite yoksa aday bekler |
| Çocuğa hafıza aktarımı                                      | Yok; kimlik, deneyim ve provenance bağı korunur                                       |
| Takip yoğunlaşması −%47 A′ kanıtıdır                        | Yanlış atıf düzeltildi; iki ayrı deney                                                |
| Dış yedek ve kaynak tabanı hâlâ kurulmamış                  | Tarihsel makbuzla çürütüldü; bakım/güncel kabul ölçümü ayrı                           |

## V1 itirazlarının karşılığı

| Opus bulgusu                              | V2 karşılığı                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Taban ölçümü sahipsiz                     | P0 kör mevcut yayın tabanı; veri yoksa EKSİK, karakter farkı zaten yüksekse P2 yeniden kapsam       |
| Açık pencere dondurma listesi yok         | PLAN §3: istem/persona/model/algı/kaynak/ajanı etkileyen UI sabit; benchmark ve kota paylaşımı açık |
| Rollout imaj temizliğinin arkasına kalmış | P2 önkoşulu doğrulanmış rollout yolu, CAS ve snapshot makbuzu; E6 yalnız kalan borç                 |
| Ölçülmedi hâli yok                        | `NOT_EVALUATED` açık ve nötr; kart yokluğu ceza değil                                               |
| Bütün eşikler P0’da dondurulamaz          | P0 taban/ortak bantlar; paket parametreleri aday çıktısı görülmeden kendi önkaydında                |
| Açık→kapalı eşlemede kanıt eksik          | Uzlaştırma §5 doğrudan kaynak dizini; bidi/logout commit atalık kontrolü ve güncel kod              |
| Somut karar/erişim kapıları görünmüyor    | PLAN §8 gerçek üretim kapıları; zaten yetkili rutin tasarıma ek izin icat edilmedi                  |

Blokaj olmayan önerilerden etki ölçümü, sunucu tarafı TTL, tüm runtime çağrılarının bütçeye
katılması, gözden geçirme tarihlerinin dağıtılması ve yeni yazar kaynak tabanı işlendi.
Tek bir model deneyinin token oranı genel maliyet hükmüne çevrilmedi. `3416827` tarihsel dal
commit’i tabanın atası değildir; F07 kapanışı tarihli makbuza dayanır. `7955fc1`, `8f3683e`,
`7aae0d2`, `d373376` tabanın atası olarak yerel Git ile doğrulandı.

Astra’nın ek düzeltmesi: M2’nin yedi günlük kabulü bütün yeni ürün özelliklerinin sonuna
ertelenmedi. P1 geçerse ilk sabit pencere P7’ye ayrılır; yeni davranış dağıtımı ve heartbeat
bu pencereyi bölmez. V2’de Opus yönü kabul etti; pencere öncesi güncel uygunluk ve P2 pilotunun
pencere dışında kalmasını istedi. V3’e iki kapı da yazıldı; P2’nin 10 Ekim kontrolü hazırlık,
pilotu 14–16 Ekim hedefidir. Sonraki paketler buna göre tarihlendi. Tabanın rejim/fingerprint
bağı ve F07 için güncel kod/test kaynağı da eklendi. Görünür UI hazırlığına ayrı izin kuyruğu
önerisi yine uygulanmadı; kullanıcı görevi ve exact dağıtım kapısı korunuyor.

## Belge ve kabul sınırı

Önceki 808 satırlık plan byte-for-byte arşivlendi; özgün SHA-256
`1d62a1537b8fcd2007905b65148b203dc7bb68d198ec3cbb2fbf5f1d4411ef97`.
Yeni planın sıra/tarihleri, uygulanmış kod veya kendiliğinden başlayan takvim işi değildir.
Açık işler eski kimlikleriyle uzlaştırma belgesinde eşlenir; kabul şartları gevşetilmez.

## Nihai kabul ve dosya kimliği

Gerçek `claude-opus-5` nihai hükmü **PLAN GO (tasarım düzeyinde)**; önceki yedi P1 ve son iki
pencere/takvim bulgusu kapalı. Astra da son tasarımla hemfikir. İnceleme bir turda tamamlandı,
CLI `is_error=false`, izin reddi 0; modelUsage asıl Opus 5 ve yardımcı Haiku girdisini içeriyor.
Hakem dosya hash’lerini kendisi hesaplamadı; aşağıdaki SHA-256 değerleri yürütücü tarafından
inceleme öncesi ve sonrası yerelde hesaplanıp karşılaştırıldı. Üç dosya incelemeden sonra değişmedi.

| Dosya                                      | Nihai incelenen SHA-256                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `docs/PLAN.md`                             | `b1576b8ed10a009192939f8609cdd24b4a4e9d192ba003e02bfdb41a646f1612` |
| `docs/YAZAR_KARAKTERI_VE_GUDU_TASARIMI.md` | `c0d794a25742a4fc58bb78212089cc48a021b9c5c6654d74109d4ec02eb6e0ce` |
| `docs/PLAN_UZLASTIRMA_2026-10-03.md`       | `6075fc79da62bd9a85605496bf74485c7393727d4238e88fc847753f03ac1b8a` |

V1/v2/v3 inceleme taslaklarının adlarıdır; PLAN başlığındaki sürüm 1, bu bütünleşik planın
ilk yayımlanan sürümüdür. Tarih 3 Ekim 2026; yeni plan ve eşleme aynı belge makbuzunda kaydedilir.

**Kalan belirsizlikler:** güncel üretim ön uygunluğu okunmadı; davranış etkileri ölçülmedi.
6–13 Ekim ilk koşullu M2 penceresidir. Mevcut rejimde yeterli veri yoksa BELİRSİZ kalır;
sonraki işlerin tarihleri bağımlılıklarla birlikte kayar. Takvim bir tamamlanma garantisi değildir.

**Yerel doğrulama:** format/lint/typecheck, gereksinim 3/3, F07 tam metin regresyonunu içeren
`public-seo.test.ts` 12/12; yeni belge bağlantıları ve byte-identical arşiv kontrolü. Bunlar
planın ürün etkisini veya Gate 10’u kanıtlamaz. Uygulama/şema/test kodu değişmedi, üretime
bağlanılmadı. Ham inceleme istemi/entry metni depoya alınmadı.

## Kullanıcı düzeltmesi — iki haftalık teslim, 3 Ekim

Gökhan uzun ölçüm takvimini reddetti; bir–iki haftalık plan istedi. PLAN sürüm 2’de hedef
3–9 Ekim çalışan ilk sürümler, 10–17 Ekim tek resmî kabul penceresidir. Özelliklerin uzun
canlı gözlemi birbirine bağımlılık olmaktan çıktı; P5 iki doğal döngü teslim kapısı değil.
P8 yerel mekanizması ilk hafta; yeterli geçmiş yoksa aday üretilmez. Yeni veri için herkese
iki hafta bekleme yok. Deney tavanı 24 runtime çağrısı/90 dakika; yedi günlük resmî kabul,
güvenlik, peer review ve exact sürüm kapıları korunur. Tüm backlog iki haftada biter denmedi.

**Kısa Opus incelemesi:** taban `d66edbb344621802b55cb55bedb6dd95753a0a0c`; gerçek
`claude-opus-5`, araçsız bir tur, `is_error=false`, izin reddi 0; yardımcı Haiku kaydı var.
Hakem takvimi kabul etti; iki cümle düzeltilirse **PLAN GO** verdi: canlı ödül etkisinin exact
sürüm/üretim onayını açıklaştırmak ve görünür otomatik öğenin önizlemesini dağıtım paketinde
sunmak. İki açıklama uygulandı; yeni tur/ölçüm/bekleme açılmadı. İkinci önerinin “mevcut kullanıcı
kuralı” atfı bu kısa pakette bağımsız doğrulanmış sayılmadı; somut dağıtım önizlemesi olarak
uygulandı, rutin ürün tasarımına yeni izin ritüeli getirilmedi.

Astra kısaltılmış tasarımı kabul ediyor. Bu sonuç koşullu hakem hükmü ve iki açık düzeltmenin
yerel doğrulanmasıdır; düzeltilmiş dosyaya yeni koşulsuz Opus turu yapılmış gibi raporlanmaz.
İnceleme girdisi `kisa-plan-hash.json`, çıktı `opus-kisa-plan.json` yerel kanıt dizinindedir.
Önceki v3 hash’leri yayımlanmış PLAN sürüm 1’in tarihsel makbuzudur; güncel dosya kimliği Git’tedir.

Format/lint/typecheck ve gereksinim 3/3 geçti; yalnız belgeler değişti. Üretime erişilmedi,
özellik uygulanmış veya Gate 10 geçmiş sayılmadı.
