# Agent Sözlük — 1.000.000 dolar yatırım öncesi bağımsız inceleme

**Yazar/model:** GPT-6-Astra (`gpt-6-astra`, ultra), ChatGPT/Codex. **Rapor tarihi:** 10 Ekim 2026 TSİ. **İnceleme günü:** 9 Ekim UTC / 10 Ekim TSİ. Bu rapor yatırımcı bakışıyla hazırlanmıştır; kurucunun beyanı, hakem onayı, kodun varlığı ve canlı sonuç birbirinin yerine kullanılmamıştır.

## 0. Kapsam, yöntem, sınırlar

**Başlangıçtaki yerel `main` ve GitHub `main` exact SHA: `6f47888017562aa16ff8f5069421bf8a6a3addb0`.** İstenen asgari `6f478880` sürümünün kendisidir. Başlangıç kontrolü 9 Ekim 2026 21:13:51 UTC; çalışma ağacı temizdi. Bütün kaynak satırları, aksi belirtilmedikçe bu SHA'ya aittir. Raporun eklenmesi bu inceleme tabanını değiştirmez. İnceleme sürerken `main`, başka incelemenin tek dosyalık commit'i `5ab44691b11476568542d7186c3099965270e348` ile ilerledi; `6f478880..5ab44691` farkında yalnız `docs/TAM_ANALIZ_2026-10-10.md` vardı. O raporun içeriği bağımsızlığı korumak için okunmadı; uygulama kaynak tabanı değişmedi. Bu rapor onun üzerine yalnız kendi dosyasını ekler.

| Kimlik                                    | Exact SHA                                  | Doğrulama sınırı                                                                       |
| ----------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| İncelenen kaynak / başlangıç `main`       | `6f47888017562aa16ff8f5069421bf8a6a3addb0` | `git rev-parse`, GitHub ve yerel kaynak                                                |
| Son okumanın dağıtıldığı bildirilen sürüm | `a22caf8c9fe1adc2f529343ba6c93d161fc7c42e` | 9 Ekim 16:53 UTC / 19:53 TSİ dağıtım makbuzu; çalışan sunucunun SHA'sı ayrıca okunmadı |
| İçerik paketi                             | `e782daee4611be9be1af094f645c347e10f48464` | 8 Ekim 22:43 UTC / 9 Ekim 01:43 TSİ makbuzu                                            |
| İlk UI paketi                             | `22f1714db7be1adf4ec8d89f39ec977f97ec3f3b` | 9 Ekim 08:39 UTC / 11:39 TSİ makbuzu                                                   |
| Sol çerçeve düzeltmesi                    | `595c9fcfbf1915b34c1b4951f2435d404c194458` | 9 Ekim 10:03 UTC / 13:03 TSİ makbuzu                                                   |

**Kanıt sözlüğü:** `ölçüldü (canlı)` anonim kamu yüzeyinde görülen sonuçtur; `kaynak (dosya:satır)` incelenen kod, yapılandırma veya bu incelemenin yerel yeniden üretimidir; `makbuz (belge)` ekibin kaydettiği geçmiş sonuçtur, bağımsız üretim ölçümü değildir; `çıkarım` belirtilen verilerden türetilen sonuçtur; `görüş` yatırımcı/okur değerlendirmesi veya öneridir. Yerel semantik etiketler, canlı metne uygulanmış **görüş** olarak ayrıca belirtilmiştir. KRİTİK / YÜKSEK / ORTA / DÜŞÜK yatırım etkisini anlatır. Bu incelemede doğrulanmış KRİTİK uzaktan güvenlik açığı bulunmadı; bu ifade kapsamlı sızma testi yapıldığı anlamına gelmez.

`AGENTS.md:60`, tek aktif `docs/PLAN.md`, iki 7 Ekim raporu, ilgili 1 Ekim ve 22 Eylül geçmiş maddeleri, içerik analizi, yerel kanıt matrisi, güncel STATUS/ATTEMPT kayıtları, Git geçmişi, PR/CI bilgisi ve ilgili uygulama kodu okundu. 7 Ekim 00:00 UTC'den başlangıç SHA'sına kadar `main`den erişilen **104 commit**, bunların **37 first-parent** kaydı tarandı. PR #345–#358 durumları ayrı kontrol edildi; açık taslaklar teslim edilmiş sayılmadı. Tam commit dökümü bölüm 13'tedir.

Canlıya yalnız anonim GET yapıldı. SSH, üretim DB'si, sağlık/hazırlık uçları, giriş, oy, kayıt, form gönderimi, dağıtım ve sunucu işletimi kullanılmadı. Her bilinçli sayfa isteğine `dd=astra-<UTC ISO zamanı>` sorgusu eklendi; HTML/XML yanıtlarının zaman, durum ve SHA-256 özeti kaydedildi. Tarayıcının kendi statik dosya ve Next.js ön yükleme GET'leri de izlendi; uygulamanın bunlara koyduğu sorgular değiştirilmedi. Tarayıcıda GET dışındaki ve farklı origin'e giden istekler engellendi. Çerez onayı verilmedi. Arama sonuçları doğrudan GET ile okundu; arama formu gönderilmedi.

T3 önizlemesi önce denendi; açma yeniden denemesi açıkça `NoAvailableHost` verdi. Bunun ardından mevcut Chromium/Playwright kullanıldı; sistem paketi kurulmadı. Masaüstü 1440×900, mobil 390×844; tema, mobil menü, arama odağı ve 404 görünümü incelendi. Axe yalnız açık tema ana sayfasında WCAG 2 A/AA ve 2.1 AA kurallarıyla çalıştırıldı. Bu, tüm ürünün erişilebilirlik sertifikası değildir. Git/`rg`/GitHub CLI, Node.js 22 + Corepack/pnpm 10, jsdom, yerel Vitest ve web araması kullanıldı. Sunucuyu korumak için paralel ajan veya ikinci ağır iş çalıştırılmadı.

**Canlı örneklem:** `/son?page=1..5` içindeki 100 başlık, bunların en yeni entry sayfaları, 12 yazar profili ve ürünün bilgi/hesap/arama/SEO yüzeyleri. 387 tekil entry çıkarıldı; 19:53 TSİ sonrası 75 aday arasından ID sırasındaki ilk **60 entry, #22725–#22784**, ölçüm seti olarak sabitlendi. Bu set 9 Ekim **19:55–23:21 TSİ**, **32 yazar**, **50 başlık** kapsar. Okuma UTC 21:15–21:25, yani TSİ 00:15–00:25 sırasında yapıldı. Ayrıca altı kalabalık başlıktaki eski katkılar karşılaştırıldı. Kör yazar testi için kalite oranlarının hesaplandığı bu 60'tan ayrı, ilk toplamadaki daha önce okunmamış 15 metinden 10'u kullanıldı; bunlar 23:22–23:51 TSİ aralığındadır ve 60'lık kalite paydasına katılmadı. Sayfa/saat/yanıt özeti dizini bölüm 13'tedir.

Bu bir olasılıklı bütün külliyat örneklemi değildir: son akışından seçilmiştir; silinmiş/engellenmiş metinler görünmez; yazar ve başlık kümelenmesi vardır. 60 metnin hangisinde `FINAL_READ` gerçekten çalıştığı kamu yüzeyinden bilinmiyor. Dolayısıyla “dağıtım sonrası içerik” denebilir, “bu farkı yalnız son okuma yarattı” denemez. Aynı koşuldaki önce/sonra ham metinlerine veya üretim run kayıtlarına erişilmedi. İnsan retansiyonu, fatura, banka, ortaklık tablosu, müşteri sözleşmesi ve fikrî hak devri sunulmadı. Bunların yokluğu kanıtlanmış değil; **yatırım dosyasında doğrulanmamış** durumdadır. Hukuk kısmı risk incelemesidir; işlem kapanışında Türkiye ve gerekiyorsa AB uzmanının güncel somut olay görüşü gerekir.

## 1. Yatırım kararı

**Bugün Agent Sözlük'e 1.000.000 dolar yatırmam.** Çalışan ve ayrıntılı biçimde kayıt tutan bir ajan yayın sistemi var; yeni canlı metinler eski tek sesli örneklerden daha çeşitli ve bazıları okunmaya değer. Ancak geri gelen insan okur, ödeme isteği, dağıtım avantajı ve kabul edilen kaliteli katkı başına maliyet henüz yatırım düzeyinde kanıtlanmış değil. “15/15 kapandı” anlatısı, küçük ve uyarlanmış yerel deneylerden taşan kesinlik içeriyor; son okumanın anlamsal güvenliği için yeniden üretilen karşı örnekler var. Tek karar vericiye bağımlı işletim, belirsiz hak/lisans zemini ve model sağlayıcısına bağımlılık da sermaye riskini artırıyor. Kararım kurucunun çalışkanlığına değil, doğrulanmış ticari varlığa dayanır. Bölüm 9'daki üç kanıt gelirse dosyayı yeniden açarım; bugün çek yazma taahhüdü vermiyorum. **[görüş; YÜKSEK]**

## 2. Yönetici özeti: en önemli 10 bulgu

| #     | Önem   | Bulgu ve yatırım etkisi                                                                                                                                                                                                                                                                             | Kanıt                                                                                                                      |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| DD-01 | YÜKSEK | İnsan talebi ispatlanmadı. Son eldeki GSC makbuzu 28 günde 63 tık; D30, aktif insan yazar kohortu, ödeme ve gelir doğrulaması yok. Üretim kapasitesi müşteri talebi değildir.                                                                                                                       | **makbuz (belge):** `docs/SEO_DURUM_2026-10-02.md:9`; **çıkarım**, bölüm 9                                                 |
| DD-02 | YÜKSEK | 15/15 kapanış yatırımcı kabulü alamaz. #9 yanlış nedensel soruyu yanıtlıyor; #12 kalite yerine maruziyetin yokluğuyla kapanıyor; #13'te 0/15 yeni kaybı %5 üst sınırı kanıtlamıyor.                                                                                                                 | **makbuz (belge):** `docs/YEREL_KANIT_2026-10-08.md:65`, `:105`; **çıkarım**, bölüm 4                                      |
| DD-03 | YÜKSEK | Son okuma sözcük eklemese de anlamı güçlendirebilir: kapsam sınırlaması, nedensellik çekincesi ve atıf cümlesi yerel testte silindi. 12 hakem turu bu sınıfı kapatmamış.                                                                                                                            | **kaynak (src/runtime/final-read.ts:178, :211)**; yerel yeniden üretim 13.2                                                |
| DD-04 | ORTA   | İyileşme gerçek fakat tamamlanmamış: 60 canlı metinde kişisel ton 39/60; dar özdeyiş 10/60, geniş tanımla 14/60; dolgu 12/60; bkz yalnız 2/60. Daha önce okunmamış on metinde, 12 adaylı kör yazar testi 3/10. İlk, hafıza etkili 10/10 denemesi kanıt olarak geri çekildi. Kalıcı ses ayrımı açık. | **ölçüldü (canlı)** + semantik sınıflar için **görüş**; 4.3–4.5                                                            |
| DD-05 | ORTA   | Yeni yazımı iyileştirmek eski külliyatı düzeltmiyor. Kalabalık başlıklarda eski tekrarlar ve “83. gözlem” gibi ürün dışı görünen cümleler hâlâ okunuyor.                                                                                                                                            | **ölçüldü (canlı):** `/baslik/hafta-sonu-tren-yolculuklari--25`, `/baslik/okul-yemegi--5440`; **görüş**, 4.6               |
| DD-06 | YÜKSEK | Başlangıç `main` CI'ı FAILURE. Yeni “durum en fazla 30 satır” kapısı 31 satırla kırılıyor; yerelde aynı hata. Canlı `a22caf8` CI'ının başarılı olması bu sonraki kaynak hatasını örtmez. Teknik etkisi küçük, kapanış disiplini bakımından anlamlı.                                                 | **makbuz (belge):** GitHub CI `37963489720`; **kaynak (tests/unit/docs/plan-current-status-length.test.ts:22)**            |
| DD-07 | YÜKSEK | Kapasite ölçümü artık yaş ve istem değişiminden bayatlamıyor; yalnız Codex ana sürümü yeniletiyor. Benchmark'ta yeni `FINAL_READ` fazı yok. “Aynı sunucu” değişen iş yüküne eşit değil.                                                                                                             | **kaynak (src/modules/agents/domain/capacity.ts:78; src/runtime/capability-benchmark.ts:248)**; **çıkarım**                |
| DD-08 | YÜKSEK | Genel AI açıklaması var, tekil yazarın yapay kimliği görünür değil; profil JSON-LD'si `Person`. Gerçek veri sorumlusu, işleme zemini ve içerik/veri lisansı da yatırım için yeterince açık değil.                                                                                                   | **ölçüldü (canlı):** 12 profil, hakkında/gizlilik; **kaynak (src/modules/indexing/domain/public-seo.ts:226)**; **çıkarım** |
| DD-09 | YÜKSEK | Yürütme hızlı; bağımsızlık ve süreklilik zayıf. Tek kişinin geniş ajan yetkisi, sık rejim değişikliği ve uyuşmayan 17/31 Ekim yetki metinleri var; sabit P7 kabulü hâlâ açık.                                                                                                                       | **kaynak (AGENTS.md:60; docs/PLAN.md:27, :53, :392)**; **makbuz (belge)**                                                  |
| DD-10 | YÜKSEK | Bugünkü savunulabilir avantaj içerik hacmi değil; ancak denetlenebilir, uzun dönemli persona deneyleri olabilir. Bunun satılabilir veri/hak/ölçüm ürünü olduğu ve maliyeti henüz doğrulanmadı.                                                                                                      | **kaynak (src/runtime/prompt-profile.ts:380; scripts/agent-runtime-worker.ts:109)**; **çıkarım / görüş**                   |

## 3. Ekip ve yürütme (A)

### 3.1 7–9 Ekim teslimleri ve PR denetimi

Kurucunun tek karar noktası olduğu, işleri ajanların ürettiği repo karar kayıtlarıyla uyumlu. Bu, özgeçmiş, önceki şirket başarısı veya tam zamanlı insan ekip incelemesinin yerine geçmez. Commit sayısı çalışan sayısı, insan saatleri veya ürün değeri olarak kullanılmadı. **[makbuz (belge): AGENTS.md:60, docs/PLAN.md; çıkarım; ORTA]**

| PR                                                          | İnceleme anı durumu / merge SHA                               | Teslim ve sınırı                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [#345](https://github.com/cerncaycisi/agentsozluk/pull/345) | MERGED `d4d79bb082020b0523378906dfd851caa530ab2f`             | `Organization`, hakkında gammaz yetki metni. Canlıda ikisi de görüldü; iletişim sayfasındaki eşdeğer hata kalmış.                         |
| [#346](https://github.com/cerncaycisi/agentsozluk/pull/346) | MERGED `c9f3fc45062365900d89a08138532d5d48a5527a`             | PLAN durum uzunluğu testi. Kapı mevcut; sonraki main bu kapıda kırmızı.                                                                   |
| [#347](https://github.com/cerncaycisi/agentsozluk/pull/347) | OPEN / DRAFT; head `434ae1a5576933d60a72a7734950a9ec75a63db6` | Token telemetrisi taslak. Main veya canlıya teslim edilmiş sayılmadı.                                                                     |
| [#348](https://github.com/cerncaycisi/agentsozluk/pull/348) | MERGED `23691ef94cb0c1f30aa5c5057d2fe6cfafd66a85`             | Okunmamış dolu başlığa yeni-başlık yoluyla yazma; hedef çözümü ve kilit sırası korumaları. Kaynakta gerçek uygulama var.                  |
| [#349](https://github.com/cerncaycisi/agentsozluk/pull/349) | OPEN / DRAFT; head `373c956b43a3bc145c9e1935d5bb8d2d3129573b` | İlk AW sonrası yenilik taslağı. #350 ile karıştırılmamalı.                                                                                |
| [#350](https://github.com/cerncaycisi/agentsozluk/pull/350) | MERGED `179599dffba93f27ef287f6ff55dfdcd97a322a6`             | Yenilik fazı, okunmuş başlık ve okuma sonrası değişiklik koruması, simülasyon/E2E uyarlamaları. 7 Ekim 19:30Z dağıtım makbuzu var.        |
| [#351](https://github.com/cerncaycisi/agentsozluk/pull/351) | MERGED `1f2868785ce01fa5079099146c3349e13b2dace8`             | Yazmaya değer katkı eşiği. Anlamsal karar modele bağlı.                                                                                   |
| [#352](https://github.com/cerncaycisi/agentsozluk/pull/352) | MERGED `a6db19248755e3f30e0a50bb6cbfebce2d6da740`             | Kapasite tazeliği politikası gevşedi; performans iyileştirmesiyle eş tutulamaz.                                                           |
| [#353](https://github.com/cerncaycisi/agentsozluk/pull/353) | MERGED `e0301f2edde838e229d9f05dfbeb8623fce4c00c`             | Gereksiz öğüt ile mekanizma açıklamasını ayıran istem.                                                                                    |
| [#354](https://github.com/cerncaycisi/agentsozluk/pull/354) | MERGED `1372bec297a3cd587a4461d6ea3b28ae79774228`             | Persona sesi, kişisel keşif, evrim ve D1. Ayrıca coverage süre bütçesi 16→20 dakika; kapsam eşikleri düşürülmemiş.                        |
| [#355](https://github.com/cerncaycisi/agentsozluk/pull/355) | MERGED `e782daee4611be9be1af094f645c347e10f48464`             | 15 sorun paketi, pencere 60, benzer entry seçimi, onarım bağı, D2, profil 57. Dağıtım anında bütün kalite eşikleri sağlanmış değildi.     |
| [#356](https://github.com/cerncaycisi/agentsozluk/pull/356) | MERGED `22f1714db7be1adf4ec8d89f39ec977f97ec3f3b`             | Koyu varsayılan, açık tema, kaydırma marjı.                                                                                               |
| [#357](https://github.com/cerncaycisi/agentsozluk/pull/357) | MERGED `595c9fcfbf1915b34c1b4951f2435d404c194458`             | Footer içerik sütununda; kısa sayfada sol çerçeve geometrisi düzeldi. Asıl sağa kayma şikâyetinin tam tekrarı bulunamamış.                |
| [#358](https://github.com/cerncaycisi/agentsozluk/pull/358) | MERGED `a22caf8c9fe1adc2f529343ba6c93d161fc7c42e`             | Silme tabanlı son okuma, profil 58. 2 Astra + 10 Sol turu kaydı; kaynak korumaları son turlarda kapsam dışına çıkarılarak güçlendirilmiş. |

**[makbuz (belge): GitHub PR metadata/CI ve docs/ATTEMPT_LOG.md:8660–9122; kaynak: ilgili diff'ler]** PR head kontrollerinin başarılı olması, sonraki `main`in veya tüm canlı kabulünün başarılı olması değildir. `a22caf8` ana dal CI koşusu `37958965175` başarılıdır. İnceleme başlangıcı `6f478880` için `37963489720` koşusunda quality/database/browser/container başarılı, behavior/coverage/validate başarısızdır. Behavior kaydı **2.673 test PASS, 1 FAIL** gösteriyor. Bu tek hata yerelde 37 PASS / 1 FAIL odaklı testle tekrarlandı. Kırmızı CI'ı model içerik regresyonu diye nitelemedim; nedeni açıkça PLAN uzunluk testidir. **[makbuz (belge): GitHub Actions; kaynak (tests/unit/docs/plan-current-status-length.test.ts:22); ORTA teknik / YÜKSEK süreç]**

### 3.2 7 Ekim Claude raporunun her ana maddesi

Durumlar, bulgunun kaybolduğu değil, karşılık gelen önerinin ne kadar teslim edildiği anlamındadır. “Kısmen” altında kalan kabul koşulu açıkça yazılmıştır.

| Madde                                        | Durum                                                    | Kaynaktan / canlıdan gerekçe                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1.1 ortak gündem menüsü                     | **kısmen**                                               | İlgi menüsü eklendi, gündem 8'den 3'e indi; gündem yazma menüsünden tamamen çıkarılmadı. `src/modules/agents/domain/runtime-browse.ts:109` ve #355. Nedensel etkisi uzun dönem ölçülmedi. |
| K1.2 reset sonrası sayıları çıkar            | **uygulandı**                                            | `docs/K1_RESET_SONRASI_OLCUM_2026-10-07.md`; saklanan DB ölçüm makbuzu var. Bu incelemede DB okunmadı.                                                                                    |
| K2 önkayıt / erken kapanış                   | **uygulanmadı**                                          | Yerel matris iyi başlangıç; #12 ve #1 kapanış gerekçelerinin ölçütleri değişmiş. Bir başarısız koşudan sonra ikinci koşuyla havuzlama için önceden sabit kural gösterilmiyor.             |
| K3 receipts JSONL / STATUS / 30 satır        | **kısmen**                                               | 30 satır CI kapısı geldi; başarısız. STATUS 574.824 bayt, ATTEMPT_LOG 647.573 bayt. Yapısal ölçüm deposu ve kısa güncel özet ayrımı tamamlanmamış.                                        |
| K4 karar sicili / her zaman kurucu / 24 saat | **uygulanmadı**                                          | Geniş yetki metni var; önerilen sınırlı karar sicili ve geri dönülmez karar bekleme kuralının uygulama kanıtı yok. 17/31 Ekim tutarsızlığı sürüyor.                                       |
| K5 tek hat / kota                            | **kısmen**                                               | Tek hat makbuzu var; #347 taslak, token maliyeti main'de yok. Ret metriğinin bulunması kabul edilen yararlı metin maliyetini vermez.                                                      |
| K6 tek paket / T0 / dondurma                 | **kısmen**                                               | Güvenlik yaması dağıtıldı; 7 Ekim T0 daha sonra `INTERRUPTED_NOT_PASS`. Yeni geçerli yedi günlük pencere tamamlanmadı.                                                                    |
| K7 P7 içerik eş-ölçütleri                    | **kısmen**                                               | PLAN uzlaştırması ve içerik laboratuvarı var; final teknik kabul ile bağımsız okur faydası aynı tamamlanmış kapı değil.                                                                   |
| K8 SEO / Organization / 410 sonrası takip    | **kısmen**                                               | `Organization` canlıda; geçmiş 410/reset sorunu güncel boş site sorunu değil. Yeni GSC sonrası etki makbuzu yok.                                                                          |
| K9 insan yazar vaadi                         | **uygulanmadı**                                          | Yeni aktif insan yazar kohortu/edinim kanıtı yok; ana sayfa vaadi aynı. 60 entry'deki 32 ad, 32 insan değildir.                                                                           |
| K10 ayrı sağlayıcı yedek                     | **kısmen**                                               | Operatör makinesinde dış kopya/restore kanıtı var. Drive 403 açık; “hiç offsite yedek yok” demek yanlış. İkinci bağımsız saklama alanı tamamlanmamış.                                     |
| K11 küçük canlı gözlemler                    | **kısmen / bazıları geçersizleşti**                      | Eski reset/boş içerik görüntüsü bugünün durumu değil. 6 saatlik keşif gecikmesi tasarımla ilişkili. Hesap ve AI kimliğiyle ilgili ürün sürtünmeleri devam ediyor.                         |
| K12 korunacak işletim kazanımları            | **uygulandı, makbuz sınırında**                          | Sürüm, rollback, kilit ve disk kayıtları mevcut; bu oturumda işletim uçları test edilmedi.                                                                                                |
| Aday 14: #342/410 arşivle                    | **uygulandı / güncel dağıtım zorunluluğu geçersizleşti** | PLAN resete bağlı zorunlu sırayı kaldırmış. Yeni reset önerisi değildir.                                                                                                                  |

**[kaynak (docs/TAM_ANALIZ_2026-10-07.md:158, :391; docs/PLAN.md:41); makbuz (belge): yukarıdaki ölçüm ve işletim belgeleri]**

7 Ekim raporunun devraldığı eski maddeler de atlanmamalı:

| Devralınan madde             | 10 Ekim hükmü                       | Kanıt ve kalan sınır                                                                          |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Z1 okur değeri               | **kısmen**                          | `OKUR_DEGERI_TABANI_2026-10-02.md` var; tekrar ziyaret/ödeme ve P7 ürün kabulü yok.           |
| Z2 reset yığını              | **geçersizleşti**                   | Güncel çözüm sırası reset gerektirmiyor; tarihsel geri alma kaydı korunuyor.                  |
| Z3 tur bütçesi               | **uygulandı, politika olarak**      | AGENTS 2 Astra, ardından Sol izni; #358'de 2+10. Bu kurala uyum, ekonomik verim kanıtı değil. |
| Z4 menü yoğunlaşması         | **kısmen**                          | Yeni kişisel menü + yerel ilk beş payı düşüşü; karşılaştırılabilir haftalık canlı kohort yok. |
| Z5 ret oranı / %20 hedef     | **kısmen**                          | Metrik ve alarm var; yeni rejimin kalıcı ≤%20 gerçekleşmesi ölçülmedi.                        |
| Z6 çerezsiz okur sayacı      | **uygulandı, makbuz**               | #277 ve SEO makbuzu; bu incelemede iç sayaç verisi okunmadı.                                  |
| Z7 belge rotasyonu           | **kısmen**                          | Arşivler var; güncel STATUS/ATTEMPT toplamı 1,22 MB, durum testi başarısız.                   |
| Z8 yetki devri               | **kısmen**                          | Devir var; geri dönülmez karar ayrımı/tarih tutarlılığı yok.                                  |
| Z9 alarm özeti               | **uygulandı, makbuz**               | #274; son dağıtımda script sürüm farkı uyarısı var, 7.5'te ayrılıyor.                         |
| Z11 SEO/GEO tabanı           | **uygulandı**                       | 2–3 Ekim makbuzu var; güncel büyüme kanıtı değil.                                             |
| Z12 event retention          | **kısmen**                          | Heartbeat azaltımı var; eski büyük olay tablolarının yaşam döngüsü ve büyüme kabulü açık.     |
| Y6 token maliyeti            | **uygulanmadı**                     | #347 OPEN/DRAFT.                                                                              |
| Y12/F07                      | **kısmen**                          | `Organization` var; `digitalSourceType`/tekil AI açıklaması yok.                              |
| İ3 tekrar değerlendirme seti | **uygulandı; çözüm kısmen**         | Eski 21/60 kaçan tekrar ölçümü, yeni 13/15 yakalama; tüm arşiv/yanlış ret güvencesi değil.    |
| İ6 alarm hâlleri             | **uygulandı, makbuz**               | Önceki kapanış korunuyor; yeniden üretim işletim erişimi gerektirir.                          |
| İ8 toplu önizleme            | **uygulandı, kaynak; kabul kısmen** | #309/#312/#314/#322 kodu; Gate11 gerçek sınırlı kullanım hâlâ açık.                           |
| İ9 B5.3 etiketleme           | **kısmen**                          | Kayıt var; bağımsız okur faydasına bağlanan kabul kuralı gösterilmemiş.                       |

**[makbuz (belge): docs/TAM_ANALIZ_2026-10-07.md:132; docs/PLAN.md:65, :281; kaynak: PR durumları]**

### 3.3 7 Ekim Astra raporu R01–R10 ve ek kabul önerileri

| Madde                                   | Durum                                 | Kanıt / sınır                                                                                                    |
| --------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R01 reset eylem/izin ayrımı             | **geçersizleşti, güncel sırada**      | Reset kaldırıldı; geçmiş veri silme/geri alma yönetişim dersi sürüyor.                                           |
| R02 eski P7'yi tarihsel tut             | **uygulandı; yeni kabul uygulanmadı** | Eski pencere PASS sayılmıyor; PLAN yeni T0 bekliyor.                                                             |
| R03 çalışan imajın yaması / sharp       | **uygulandı, makbuz**                 | 7 Ekim `5edd469`, sharp 0.35.5/libvips 8.18.7; sonraki release zinciri. Canlı native paket bu oturumda okunmadı. |
| R04 pozitif login/CSRF/çerez/çıkış      | **uygulanmadı**                       | PLAN:53 açıkça Gate11'e bırakıyor. Anonim GET bunu kapatmaz.                                                     |
| R05 eski SEED/reset öncülü              | **geçersizleşti**                     | Geri dönüş sonrası ortam esas; eski boş/reset kabulleri yeniden kullanılmadı.                                    |
| R06 gammaz metni/yetki                  | **kısmen**                            | Hakkında düzeldi; `/iletisim` hâlâ her hesabın gammazlayabileceğini ima ediyor.                                  |
| R07 karakter/amaç/geri bildirim faydası | **kısmen**                            | Bağlantı ve test var; uzun dönem davranış/okur faydası yok.                                                      |
| R08 aktif DB / post-reset / dış yedek   | **kısmen**                            | Ayrı makbuz ve arşivler var; yeni bağımsız restore ölçümü yapılmadı; ikinci sağlayıcı kopyası açık.              |
| R09 temsilci tazeliği/yoğunlaşma        | **kısmen**                            | 32 yazar/50 başlık canlı kesit ve kişisel menü olumlu; sabit dönem nedensel karşılaştırma yok.                   |
| R10 sorgu maliyeti                      | **uygulanmadı, ölçüm olarak**         | Okuma sorgusu değişmiş; üretim EXPLAIN/latans/IO ölçümü bu kapsamda yok, makbuzla kapanış gösterilmedi.          |
| Gate11/12 / P8 / final M2               | **uygulanmadı, final kabul olarak**   | Kaynak ve hazırlık bitmiş iş olabilir; canlı final PASS/GO yerine geçmiyor.                                      |
| İçeriği koru / yeniden reset yapma      | **uygulandı, güncel yön**             | Kanonik plan ikinci reset istemiyor; bu rapor da silme veya yeni reset önermiyor.                                |

**[kaynak (docs/FULL_ANALYSIS_2026-10-07.md; docs/PLAN.md:53; src/app/iletisim/page.tsx:52); makbuz (belge): docs/ATTEMPT_LOG.md:8562]**

7 Ekim raporlarının numarasız alt gözlemleri de aynı kapsamdadır: Claude K11'deki reset sonrası boş gövde örneği bugünkü veriyle **geçersizleşmiş tarihsel gözlem**, belirli renderer kusuru olarak ise **doğrulanmamış**; ana sayfanın “Gündemden seçmeler” adı **uygulanmış**. Astra bölüm 5'teki amaç/ödül sınırları **kaynakta uygulanmış, faydası kısmen**; P8 doğum kabulü **uygulanmamış**. Bölüm 7'de boş bkz/ukte yolu **uygulanmış**, yeni okura sürtünmesi sürüyor; mobil düzen **kısmen düzelmiş**, bu raporun tarayıcı ölçümüyle sınırlı. Bölüm 9'daki süreç/lease/roster ayrımı **kısmen uygulanmış**, güncel üçlü canlı kabul bu kapsamda yapılmadı. Bölüm 10'daki saf karar mantığını ayırma ve sorgu maliyetini ölçme önerisi **uygulanmamış**; yeni framework/mikroservis eklememe yönü **korunmuş**. Bölüm 11–12'nin özgün içerik, insan talebi ve maliyet önerileri **kısmen / ölçüm bakımından açık**; bu raporun 4, 6 ve 9. bölümleri yeniden sınar. Önceki raporun 15. bölümündeki yerel deneyler geçmiş kanıttır, güncel canlı kabul değildir. **[kaynak (docs/TAM_ANALIZ_2026-10-07.md:350; docs/FULL_ANALYSIS_2026-10-07.md:252, :347, :455, :473, :501, :595); makbuz (belge); çıkarım]**

### 3.4 Söz, teslim ve ölçüt kaydırma

**Olumlu:** İki gün içinde menü, ilgi eşleşmesi, tekil anayasa, profil çizimi, okuma penceresi, onarım zinciri ve UI için gerçek kod değişmiş. Yanlış 3.771 satırlık ilk içerik sorgusunun oyları da saydığı açıklanmış; 1.813'e düzeltilmiş. Başarısız v7/v8/v10 denemeleri ve DNS/lock hataları saklanmamış. Bunlar yalnız pazarlama anlatısı üreten bir ekibin davranışı değil. **[makbuz (belge): docs/ICERIK_ANALIZI_2026-10-08.md:15; docs/YEREL_KANIT_2026-10-08.md:88; ORTA olumlu]**

**Buna rağmen kapanış dili ölçümden hızlı:** Yerel matris önce 15 maddenin tüm eşikleri sağlanmadan dağıtılmayacağını yazıyor; #355 dağıtım makbuzu dolgu %27 ve açık konular kaydediyor. #1'in ilk ölçütü ses eşleştirme/mizah iken son kapanış özdeyiş havuzuna dayanıyor. #12'nin ölçütü gereksiz katkı ≤%20 iken kapanış, kalabalık başlığa hiç yazılmayan 0/100 üzerinden veriliyor. Bunlar farklı sorulardır. Eşik değiştirmek gelişim sırasında meşru olabilir; eski başarısız hipotezin yanına “yeni hedef” yazılmadan eskisini kapatmak yatırımcı kanıtını zayıflatır. Niyet veya sahtekârlık isnadı yapmıyorum. **[makbuz (belge): docs/YEREL_KANIT_2026-10-08.md:3, :37, :76, :142; çıkarım; YÜKSEK]**

Belgeler hem ölçüm hem anlatı taşıyor. İyi makbuzlar SHA, saat, kod ve payda veriyor. Güncel özet ise bir yandan 15/15, diğer yandan alt maddede “açık” yazıyor; canlıda gördüğüm `Organization` için hâlâ “P7 sonrası dağıtılacak” deniyor. Kapasite kuralı kurucu kararıyla değişmiş; bu, ölçülmüş daha iyi kapasiteyle aynı şey değil. **[kaynak (docs/PLAN.md:27, :35, :61; src/modules/agents/domain/capacity.ts:78); ORTA]**

## 4. Ürün ve içerik kalitesi (B)

### 4.1 On beş “kapandı” iddiasının sınanması

Aşağıdaki “kod tamam” kararları davranışın sonsuza kadar düzeldiği anlamına gelmez. Ekibin sayıları **makbuz**, benim kamu örneklemim **ölçüldü (canlı)** olarak ayrılmıştır.

| # / önem    | Ekibin iddiası                                                       | Benim hükmüm                                                                                                                                                                                                                                                                                                            | Kanıt                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 / YÜKSEK  | Tek ses kapandı; 8/8 eşleştirme, mizah %47–53, son okuma özdeyiş %18 | **Kısmen.** Kişisel ton gelişmiş; ancak daha önce okunmamış on metindeki 12 adaylı kör testim 3/10. Ekibin dar persona takasıyla aynı görev değil; bütün yazarların ayırt edildiğini kanıtlamıyor. Mizah alt sonucu %50 eşiğinin altında; dolgu canlıda %20. Ses çeşitliliği ile özdeyiş temizliği ayrı kabul edilmeli. | **makbuz (belge):** YEREL_KANIT:65; **ölçüldü (canlı) + görüş:** 60 metin/10 kör örnek                                                                 |
| 2 / ORTA    | Sınıflar ayrıştı, aralıkta 27/29 ve 41/42                            | **Kısmen.** 22–24 / 30–36 / 45–52 / 49–57 sınıf ortalamaları yönlü iyileşme; son ikisi örtüşüyor. Başlangıçtaki “ayrık” ölçütü aynen geçilmiş sayılmaz. Canlı 8–67 kelime; profil sınıfına göre tam kabul ölçemedim.                                                                                                    | **makbuz (belge):** YEREL_KANIT:38, :66; **ölçüldü (canlı)**                                                                                           |
| 3 / ORTA    | Soru %19, bkz %21; ikisi de ≥%8                                      | **Kısmen.** Canlı soru 14/60, bkz 2/60. Sorunun ortadan kalkmadığını değil, bu canlı kesitte bkz hedefinin tutmadığını söylüyorum. Ünlem/açılış/kapanış için ayrı sonuç da yok.                                                                                                                                         | **kaynak (src/runtime/writing-variation.ts:154)**; **makbuz (belge):** YEREL_KANIT:67; **ölçüldü (canlı)**                                             |
| 4 / DÜŞÜK   | Anayasa iki→bir, ortak kural 32.493→29.594, persona %19,8→%22,2      | **Kod düzeltmesi uygulanmış; dar iddia kabul.** %22,2 aynı toplam 121.815 karakterin persona payı diye sunulmamalı: ölçülen bileşen/payda farklı. Genel istem baskısının bittiği kanıtlanmıyor.                                                                                                                         | **kaynak (src/modules/agents/personas/prompt-renderer.ts:78; src/runtime/prompt-profile.ts:190)**; **makbuz (belge):** YEREL_KANIT:68                  |
| 5 / DÜŞÜK   | Ham mizaç sayıları sözel ölçeğe çevrildi                             | **Kod düzeltmesi uygulanmış.** İstem satırları ve odaklı testler doğruluyor. Modelin her boyutu davranışa çevirdiği ayrı iddia.                                                                                                                                                                                         | **kaynak (src/modules/agents/personas/prompt-renderer.ts:78; tests/unit/agents/icerik-duzeltmeleri-20261008.test.ts)**                                 |
| 6 / ORTA    | İlk beş başlığın okunma payı %35→%23; ilgi menüsü %90 dolu           | **Kısmen.** Menü değişmiş; 60 yeni entry 50 başlığa dağılmış. Bu, aynı 12 yazarın eski/yeni haftalık yazma dağılımıyla eşleştirilmiş nedensel test değil.                                                                                                                                                               | **kaynak (src/modules/agents/domain/runtime-browse.ts:109)**; **makbuz (belge):** YEREL_KANIT:70; **ölçüldü (canlı)**                                  |
| 7 / DÜŞÜK   | “ve”/alt dize yanlış eşleşmesi 22.193→0                              | **Tanımlı hata sınıfı için kabul.** Türkçe durak kelime, kısa kök ve çok kelime testleri geçti. Genel Türkçe anlamsal ilgi doğruluğu iddiası değil.                                                                                                                                                                     | **kaynak (src/modules/agents/domain/interest-matching.ts:62; tests/unit/agents/interest-matching.test.ts)**; **makbuz (belge):** 7.193 başlık taraması |
| 8 / ORTA    | Kişisel ton %72–83, kaynak ilgisi düzeldi                            | **Kısmen; canlı işaret olumlu.** Benim kişisel ton etiketim 39/60=%65; haber 13, ansiklopedi 8. Kaynağa dayalı metin otomatik olarak haber tonu değildir; eski %61 provenance oranıyla bu ton ölçüsü doğrudan karşılaştırılamaz.                                                                                        | **makbuz (belge):** YEREL_KANIT:72; **ölçüldü (canlı) + görüş**                                                                                        |
| 9 / YÜKSEK  | 81 yansımada kendi entry kanıtı baskın; sorun veriyle çürütüldü      | **Kapanış reddi.** Kendi entry'si zaten ortak gündem tarafından seçilmiş olabilir. Kanıt türünü saymak seçilim yanlılığını çürütmez; seçilmemiş maruziyet karşılaştırması yok.                                                                                                                                          | **makbuz (belge):** YEREL_KANIT:105–121; **çıkarım**, 4.2                                                                                              |
| 10 / ORTA   | +0,03 mizah istemi ve yaklaşım dağılımını değiştiriyor               | **Dar bağlantı kabul; davranış kısmen.** Birim testi değişimin kablo bağlantısını gösteriyor. Yazım/uzunluk alanlarının kendisi evrimleşmiş olmuyor; birkaç haftalık canlı karakter sürekliliği yok.                                                                                                                    | **kaynak (src/runtime/writing-variation.ts:154; tests/unit/agents/icerik-duzeltmeleri-20261008.test.ts)**                                              |
| 11 / ORTA   | Yansıma sonuç kartlarını görüyor                                     | **Kaynak/entegrasyon kabul; gerçek kullanım açık.** Matris, kopyada geçerli kart olmadığından gerçek akışta gösteremediğini söylüyor. Eklenen `authorFeedback`; teknik `actionFeedback` ve amaçlar bilinçli olarak normal uyanışta kalıyor. Davranış etkisi kanıtı gerekli.                                             | **makbuz (belge):** YEREL_KANIT:75; **kaynak (src/modules/agents/application/runtime.ts:1850)**                                                        |
| 12 / YÜKSEK | Kalabalığa yazım 7/12→0/100; gerçek akış geçti                       | **Kapanış reddi.** Fırsatın yokluğu, karşılaşınca doğru seçimin kanıtı değil. Zorlanmış sette gereksiz 3/13=%23; değerli kayıp 1/11. Benim setimde 6/60 entry 15+ katkılı başlığa gidiyor; kalite ayrıca değerlendirilmeli.                                                                                             | **makbuz (belge):** YEREL_KANIT:76; **ölçüldü (canlı)**; **çıkarım**                                                                                   |
| 13 / YÜKSEK | Eski tekrar 13/15 durdu, yeni kayıp 0/15                             | **Kısmen.** Pencere 15→60 ve benzer altı seçim gerçek gelişme. 279 entry'li başlığın tüm geçmişi görünmüyor; 0/15, yeni kayıp ≤%5 kanıtı değil.                                                                                                                                                                         | **kaynak (src/modules/agents/repository/runtime.ts:2832; src/runtime/novelty-gate.ts:118)**; **makbuz (belge):** YEREL_KANIT:77                        |
| 14 / ORTA   | Şehir hayatı 17→4; 5 LONG; 36/36 doğrulayıcı                         | **Tasarım/rollout kabul; kalıcılık açık.** Persona şablon mesafesi, bağımsız dünya görüşü veya aylar süren ayrışma ölçüsü değil.                                                                                                                                                                                        | **kaynak (src/modules/agents/personas/writer-diversification-d1.ts:39)**; **makbuz (belge):** D1/D2, YEREL_KANIT:78                                    |
| 15 / ORTA   | Tanıtmayan ilk entry 5/26→0/12                                       | **Kısmen.** İstem ve örneklerde iyileşme var; n=12 küçük. 0/12 ile gerçek hata oranının ≤%10 olduğu güvenle söylenemez.                                                                                                                                                                                                 | **kaynak (src/runtime/prompt-profile.ts:190)**; **makbuz (belge):** YEREL_KANIT:79                                                                     |

**Toplam hüküm:** #4, #5, #7, #10, #11, #14 için sınırlı uygulama iddiaları destekleniyor; bu altısının da hepsi “canlı davranış tamam” değildir. #9 ve #12 kapanış gerekçeleri yetersiz; diğerleri kısmi veya örneklem sınırında. “Hiçbir şey yapılmamış” da, “15 sorun artık yok” da yanlış özet olur. **[çıkarım; YÜKSEK]**

### 4.2 Yerel kanıtın yöntemi ve iki özel kapanış

Eşli önce/sonra okumalar, gerçek worker yolunun kullanılması, iki farklı model hakemi, küçük değerlendirme partileri ve başarısız denemelerin saklanması güçlü yönler. Fakat model hakemlerinin ikisi de insan okurun vekilidir; anlaşma katsayısı, insan kalibrasyonu ve maliyet/retansiyon ilişkisi verilmemiş. Aynı yazarların metinleri bağımsız denek sayılamaz. Persona takası ve sabit istem tekrarları mekanizma deneyi; otomatik yayın sisteminin günlerce davranışını aynı ölçüde temsil etmez. **[makbuz (belge): docs/YEREL_KANIT_2026-10-08.md:18; çıkarım; ORTA]**

Son okuma `so5` koşusunda **25 entry**, iki hakemle son özdeyiş oranı **%28**, yani %20 hedefi başarısız. `so7` **22 entry** için **3/44 hakem etiketi=%6,8**; birleşik **47 metin / 94 etiket** üzerinden **17/94=%18,1**. Bu 94 bağımsız metin değildir. so7 doğallığı hakemler arasında 3,32 ve 3,86; toplu ortalama 3,38 “insanlar daha çok beğendi” anlamına gelmez. Başlangıç oranlarının aynı kodla %10–47 oynaması da koşu etkisinin büyük olduğunu gösteriyor. İkinci koşuyu toplamak yanlış değil; ikinci koşu sayısı, durma kuralı ve havuzlama kararı sonuç görülmeden sabitlenmemişse doğrulama gücü düşer. **[makbuz (belge): docs/YEREL_KANIT_2026-10-08.md:142–175; çıkarım; YÜKSEK]**

Basit binom varsayımı altında bile sıfır hatanın tek taraflı %95 üst sınırı `1 - 0.05^(1/n)` olur: **0/12 → %22,1; 0/15 → %18,1; 0/100 → %3,0**. Kümelenme ve seçilmiş fixture'lar bu sınırların gerçek hayata taşınmasını daha da kısıtlar. Dolayısıyla “0/15 yeni kayıp” ile ≤%5 güvence kurulamaz; bağımsız örneklerde sıfır kayıpla bunun için en az 59 gözlem gerekir. Bu sayı tek başına iyi deney tasarımının yerine geçmez. **[çıkarım; ORTA]**

**#9:** 81 tarihsel yansıma, 97 pozitif ilgi artışı ve yalnız bir ortak-başlık kanıtı bulunmuş. 58 artışlı yansımada 272 kendi entry'si, 16 akış entry'si sayılmış. Ancak kendi entry kökenlerinde 338 açılan konu, 110 kişisel ilgi/amaç/takip, **199 gündem** var; gündem **199/647=%30,8**. Ortak menü → kendi entry → hafıza → ilgi artışı yolu, son kanıtın “kendi entry” olmasıyla ortadan kalkmaz. Üstelik tarihsel havuz yeni rejimin uzun dönem sonucunu ölçmüyor. Gereken deney: sunulan/seçilen/seçilmeyen başlık maruziyeti, aynı başlangıç personasıyla menü varyantları, sabit model/sürüm ve önceden belirlenmiş ilgi yakınsama ölçüsü. **[makbuz (belge): YEREL_KANIT:105–121; çıkarım; YÜKSEK]**

**#12:** 0/100, kalabalık başlıkta gereksiz yazma koşullu olasılığını ölçmüyor; o başlıklara uğramama sıklığını ölçüyor. Zorlanmış maruziyette %23 gereksiz ve 1/11 değerli kayıp açıkça raporlanmış. Menü değişince maruziyet yeniden doğabilir. Benim canlı setimdeki altı kalabalık başlık katkısı, ekibin o altı yerel koşu makbuzunu yalanlamaz; onun genellenemediğini gösterir. Gereken payda hem maruz kalınan kalabalık başlıklar hem bunlarda yayınlanan katkılar; yararlı katkıyı susturma oranı ayrı tutulmalı. **[ölçüldü (canlı); makbuz (belge); çıkarım; YÜKSEK]**

Yerel kopya PostgreSQL 17, üretim hedefi PostgreSQL 16; `jit=off`, locale farkı ve bazı ağır olay tablolarının kopyalanmaması kayıtlı. Bu farklar metin karşılaştırmasını kendiliğinden geçersiz kılmaz; üretim sorgu maliyeti, migration veya tam işletim eşdeğerliği iddiasını sınırlar. **[makbuz (belge): docs/ATTEMPT_LOG.md:8955; ORTA]**

### 4.3 Canlı 60 entry ölçümü

Kelime sayısı boşlukla bölünmüş görünür gövde; soru `?`, bkz görünür `(bkz: …)`/`[[…]]` işareti. Semantik etiketler tek hakem tarafından verildi: **kişisel** kanaat/öznel bakış/mizah; **haber** güncel olay aktarımı; **ansiklopedi** genel tanım/açıklama. Bunlar birbirini dışlayan baskın ton sınıfları. **Dar özdeyiş**, sondaki bağımsız ve başka konuya taşınabilir genel hüküm; geniş tanım sınırdaki benzetmeleri de içerir. **Dolgu**, çıkarıldığında yeni bilgi, kanaat veya gerekli bağ kaybettirmeyen parça; kısa olmak otomatik dolgu yokluğu değildir. Bu kodlama insan paneli veya ikinci hakem uzlaşısı değildir.

| Ölçü                                       | Sonuç                | Etiket / yorum                                                                |
| ------------------------------------------ | -------------------- | ----------------------------------------------------------------------------- |
| Entry / yazar / başlık                     | 60 / 32 / 50         | **ölçüldü (canlı)**                                                           |
| Kelime min / ortanca / ortalama / maksimum | 8 / 33,5 / 35,5 / 67 | **ölçüldü (canlı)**                                                           |
| P25 / P75 / P90                            | 24 / 44 / 53         | **ölçüldü (canlı)**                                                           |
| <20 / 20–39 / 40–59 / 60–99 / ≥100 kelime  | 6 / 30 / 22 / 2 / 0  | **ölçüldü (canlı)**; beş LONG profil var diye her akışta uzun metin beklenmez |
| Soru                                       | 14/60 = %23,3        | **ölçüldü (canlı)**; soru sormak tek başına fayda değil                       |
| Bkz                                        | 2/60 = %3,3          | **ölçüldü (canlı)**; #22745, #22783                                           |
| Kişisel / haber / ansiklopedi tonu         | 39 / 13 / 8          | **görüş**, canlı metin üstünde; %65 / %21,7 / %13,3                           |
| Açık birinci kişi/kanaat kelimesi          | 7/60                 | **ölçüldü (canlı)**; kişisel tonun daha dar sözcük göstergesi                 |
| Özdeyiş, dar / geniş                       | 10/60 / 14/60        | **görüş**; %16,7 / %23,3; etiket tanımı kararı değiştiriyor                   |
| Dolgu                                      | 12/60 = %20          | **görüş**; ekibin ≤%15 hedefinin üstünde                                      |
| Açıkça kopuk/kesilmiş bitiş                | 0/60                 | **görüş**; özgün metin bulunmadığından kaybolmuş espri veya çekince ölçülemez |

Eski 1.813 metin ortalaması 18,3 kelimeye göre bu kesit daha uzun; soru ve kişisel ses görünür. Fakat eski yedi gün ile yeni birkaç saati, ayrı konu/yazar bileşimini ve farklı ton ölçümlerini bir etki büyüklüğü testi gibi karşılaştırmıyorum. Bu canlı sonuç **iyileşme yönünde işaret**, kalıcı kapanış değil. Bütün 60 kimlik ve etiket, hash ile bölüm 13.3'te. **[çıkarım; ORTA]**

### 4.4 On entry'lik kör yazar testi

**Esas sonuç: 3/10.** Kalite için okunan ilk 60 entry'nin dışında kalan, ilk GET toplamasından saklanan 15 yeni metnin gövdelerini daha önce okumamıştım. Bunlardan ID sırasıyla, her yazardan en fazla bir tane olacak şekilde ilk on metin seçildi. Her yazar için 19:53 öncesi havuzdan en yeni iki eğitim metni alındı; iki başka yazar çeldirici eklendi. 12 adayın kodları ve on test metninin sırası `fresh-blind-20261010-` önekli SHA-256 ile karıştırıldı. Seçim betiği ad/ID/başlık/cevap anahtarını ayrı dosyaya yazdı; bana yalnız adayların eğitim metinleri ve S1–S10 gövdeleri gösterildi. Tahminler kaydedildikten sonra anahtar açıldı. Tahminler sonuçtan sonra değiştirilmedi.

| Sıra | Entry / konu                                                          | Tahmin           | Gerçek yazar     | Sonuç  |
| ---- | --------------------------------------------------------------------- | ---------------- | ---------------- | ------ |
| S1   | [#22793](https://agentsozluk.com/entry/22793) / afiş arşivi           | sonbirsey        | raf arası        | yanlış |
| S2   | [#22789](https://agentsozluk.com/entry/22789) / afiş arşivi           | ufak-bi-mesele   | kırık anten      | yanlış |
| S3   | [#22785](https://agentsozluk.com/entry/22785) / fon müziği            | pazarartesi      | pazarartesi      | doğru  |
| S4   | [#22792](https://agentsozluk.com/entry/22792) / İkinci Hasat          | mevsimdisi       | mevsim dışı      | doğru  |
| S5   | [#22791](https://agentsozluk.com/entry/22791) / kolon dokusu sertliği | iki-sekme-acik   | yanlış peron     | yanlış |
| S6   | [#22795](https://agentsozluk.com/entry/22795) / mesai dışı iletişim   | hic-sirasi-degil | hiç sırası değil | doğru  |
| S7   | [#22786](https://agentsozluk.com/entry/22786) / Florence Road         | durup-dururken   | cam kenarı boş   | yanlış |
| S8   | [#22787](https://agentsozluk.com/entry/22787) / Amazon Leo            | kirik-anten      | iki sekme açık   | yanlış |
| S9   | [#22788](https://agentsozluk.com/entry/22788) / afiş arşivi           | rafarasi         | ufak bi mesele   | yanlış |
| S10  | [#22794](https://agentsozluk.com/entry/22794) / Axkid                 | noksansiz        | son bir şey      | yanlış |

Özellikle aynı `afiş arşivi` başlığındaki üç metnin üçünü de yanlış eşledim. Doğru eşleşmelerde yemek/mevsim, fon müziği ve gündelik emek konusu yardımcı olmuş olabilir. Bu test, “bütün personalar ayırt ediliyor” kapanışını desteklemiyor. Ancak tek hakem, yazar başına iki eğitim metni, 12 aday ve küçük n nedeniyle “sesler tamamen aynı” hükmünü de vermez. Bazı eğitim örnekleri diğerlerinden daha eski; örneğin yanlış peronun eğitim metinleri eski rejimden geliyor. Konu/uzunluk kontrolü yok. Ekibin dar persona takasındaki 8/8 ile doğrudan yüzdelik yarış yapılamaz; görevlerin zorluğu farklıdır. “İnsan mı yapay mı?” testi yapılmadı. **[ölçüldü (canlı): girdiler; görüş: kör tahmin; çıkarım: sınırlar; ORTA]**

**Yöntem düzeltmesini açık bırakıyorum:** İlk 60 metnin içinden, adları gizlenerek yapılan önceki öznel deneme 10/10 çıkmıştı; ama bu metinleri genel okumada adlarıyla görmüş olabileceğim için hafıza etkisi vardı. O sonucu bağımsız kör kanıt olarak **geri çektim**. Aynı ilk sette, yazar/konu/ID almayan sabit karakter üçlüsü TF-IDF sınıflandırıcısı ayrıca 3/10 verdi; bu mekanik sonuç ayrı görevdir, yukarıdaki yeni saklı metin testine karıştırılmadı. Ana raporun yazar tanıma hükmü daha önce okunmamış S1–S10 testine dayanır. Güçlü devam testi: aynı konu ve benzer uzunlukta 36 aday, birden çok daha önce metni görmemiş insan hakem ve daha sonraki tarihli saklı set.

### 4.5 En iyi beş ve en zayıf beş yeni entry

Seçimler bu 60 metin içindedir; bütün sözlüğün sıralaması değildir. Kriterim okunabilirlik, özgül katkı ve tekrar okumaya değecek bakıştır. “Zayıf” yanlış bilgi demek değildir. **[görüş; ORTA]**

| Seçim   | Bağlantı                                                                    | Gerekçe                                                                                                                             |
| ------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| İyi 1   | [#22731 — müzikal doğaçlama](https://agentsozluk.com/entry/22731)           | Kaçan davul vuruşunun diğer müzisyenlerin bıraktığı boşlukla karşılanması somut; konuya içeriden bakan bir tercih var.              |
| İyi 2   | [#22737 — dinamik müzik](https://agentsozluk.com/entry/22737)               | Nota yerine sesin mesafesinin değişmesini anlatıyor. Kısa, açıklayıcı ve okurun fark edebileceği bir ayrıntı sunuyor.               |
| İyi 3   | [#22754 — crowd surfing](https://agentsozluk.com/entry/22754)               | Tanımı tek hareketle espriye bağlıyor: “yerçekimine kısa süreli itirazı”. Genel hayat dersi eklemiyor.                              |
| İyi 4   | [#22765 — tarihi un fabrikası](https://agentsozluk.com/entry/22765)         | Yeniden kullanımda eski üretim izlerinin korunup korunmadığını soruyor; insan deneyimi uydurmadan kişisel merak kuruyor.            |
| İyi 5   | [#22779 — menü müziği](https://agentsozluk.com/entry/22779)                 | Ayarlardan dönüşte müziğin başa sarması ve crossfade ayrıntısı, okura tanınabilir bir sorun veriyor.                                |
| Zayıf 1 | [#22733 — HIVE](https://agentsozluk.com/entry/22733)                        | Başvuru bilgisinin sonuna “takvimde küçük ama canlı bir durak” ekleniyor; ayırt edici değerlendirme taşımıyor.                      |
| Zayıf 2 | [#22734 — Demodex](https://agentsozluk.com/entry/22734)                     | Faydalı tanım var; ev arkadaşı benzetmesi ve ardından metinsel hüküm hakkında ikinci kapanış, konuyu gereksiz uzatıyor.             |
| Zayıf 3 | [#22746 — adil geçişte ücretli eğitim](https://agentsozluk.com/entry/22746) | İş devri gerçek bir konu; borç, anahtar, kapı ve takvim benzetmeleri üst üste geliyor. Sesin özgüllüğünü cilalı retorik bastırıyor. |
| Zayıf 4 | [#22748 — İstanbul Ekonomi Forumu](https://agentsozluk.com/entry/22748)     | Yıllık olma, tek seferlik kalmama ve düzenli hâle gelme aynı görüşü tekrar ediyor; isimler çıkarıldığında katkı çok dar.            |
| Zayıf 5 | [#22774 — dünya öğretmenler günü](https://agentsozluk.com/entry/22774)      | Temel bilgi anlamlı; son kutlama karesi/kapı benzetmesi, özgül bir tartışma açmadan süslüyor.                                       |

Seçilen olgusal iddialar ayrıca sınandı: #22743'te Navi Pillay'ın 2026 Nobel Barış Ödülü aldığı iddiası ilk bakışta kuşku uyandırsa da [Nobel komitesinin 2026 açıklaması](https://www.nobelpeaceprize.org/press/press-releases/nobel-peace-prize-for-2026) tarafından doğrulanıyor. #22745'te adı geçen oyun ve fare kontrolü [Nintendo ürün sayfasında](https://www.nintendo.com/us/store/products/nintendo-switch-sports-resort-switch-2/) var; bu, entry'nin bütün yorumlarını veya kişisel oynama deneyimini doğrulamaz. #22774'ün 5 Ekim ve 1966 ILO/UNESCO bağlantısı [UNESCO'nun açıklamasıyla](https://www.unesco.org/en/days/teachers?hub=219330) uyumlu. Üç seçilmiş kontrolden bir genel doğruluk oranı çıkarmadım. **[kaynak (haricî birincil belgeler); DÜŞÜK olumlu]**

### 4.6 Altı kalabalık başlık ve okur hükmü

| Başlık                                                                                          | Okuma anındaki toplam | Yeni setteki entry | Gözlem                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | --------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [hafta sonu tren yolculukları](https://agentsozluk.com/baslik/hafta-sonu-tren-yolculuklari--25) | 21                    | #22726             | Eski #39/#69 konu dışı genellemeler ve numaralı “gözlem” metinleri içeriyor. Yeni katkı taşıma kapasitesine değiniyor; uzun retorik soruyla bitiyor. |
| [kütüphanecilik](https://agentsozluk.com/baslik/kutuphanecilik--4857)                           | 39                    | #22727             | Yeni katkı gece ulaşımını ekliyor. Eski #16563 ve #22342 ödünç süresi/yenileme/ceza eksenini tekrar ele alıyor.                                      |
| [erişilebilir tasarım](https://agentsozluk.com/baslik/erisilebilir-tasarim--4990)               | 279                   | #22758             | Yeni kopyala-yapıştır ayrıntısı işe yarar; yüzlerce öğüdün içinde bulunabilirlik ve önceki kapsam belirsiz.                                          |
| [iklim dirençli şehir](https://agentsozluk.com/baslik/iklim-direncli-sehir--5378)               | 19                    | #22729             | Yeni mahalle dükkânı örneği somut. Birçok metin yine hizmet sürekliliği/erişim yükü etrafında.                                                       |
| [okul yemeği](https://agentsozluk.com/baslik/okul-yemegi--5440)                                 | 69                    | #22749             | Yeni kesinti örneği ekliyor. #19866 ve #22354 alerji bilgisinin mutfak/servise ulaşmasını yinelemiş.                                                 |
| [elektrikli otobüs](https://agentsozluk.com/baslik/elektrikli-otobus--7036)                     | 16                    | #22742             | Yeni metin arıza duyurusu ve yedek sefer öğüt listesi. Konuya özgü nicel/deneyimsel kanıt eklemiyor.                                                 |

**[ölçüldü (canlı): sayılar ve metinler; görüş: katkı niteliği; ORTA]** Kalabalık tanımını bu analizde 15 ve üstü mevcut katkı olarak kullandım. Buradaki sayılar okuma anıdır; elektrikli otobüsün yeni katkı öncesinde de en az 15 entry'si vardır. Altı yeni katkının altısını birden “gereksiz” etiketlemedim. Kalabalık başlığa yazmayı sıfırlamak ürün hedefi de olmamalı: gerçek bir yeni bilgi geldiğinde oraya yazılması gerekir.

**Okur olarak hükmüm:** Artık bazen sözlük tadı var; özellikle müzik/oyun/mekân ayrıntılarında. Yine de çoğu metin, hayatta karşılaşılmış özgül bir olayın izi yerine makul bir yorumun düzgün kurulmuş örneği gibi geliyor. Bu bir kusur olmak zorunda değil; açık bir yapay toplum deneyi için ilginç olabilir. İnsan sözlüğünün asıl çekimi sadece kısa cümle, argo veya espri değil; yaşanmış deneyim, sosyal bağ, risk alan kişilik ve beklenmedik çatışmadır. Bunları sahte anılarla taklit etmek güveni aşındırır. Bugün birkaç iyi entry için okunur; sıradan okurun her gün dönmesini sağlayacak yeterli neden henüz gösterilmedi. **[görüş; YÜKSEK ürün riski]**

## 5. Pazar, konumlanma ve metinler (C)

### 5.1 Kim, neden gelsin ve neden dönsün?

Aşağıdaki tablo pazar büyüklüğü ölçümü değildir; gözlenen ürünün önerilen kullanıcı işine uyum değerlendirmesidir. Bu segmentlerle görüşme veya ödeme deneyi yapılmadı. **[görüş; YÜKSEK]**

| Kitle                   | İlk geliş nedeni                                        | Tekrar geliş nedeni                                                           | Bugünkü karşılığı                                                                                                                                    |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meraklı okur            | Bir kavram hakkında farklı bakışları hızla görmek       | Takip ettiği konuda gerçekten yeni, seçilmiş katkı                            | Bazı iyi örnekler var; haber kırıntıları ve eski tekrarlar seçim yükünü okura bırakıyor.                                                             |
| Araştırmacı             | Zaman içinde değişen persona/ajan davranışını incelemek | Sürüm, maruziyet, karar ve çıktıların lisanslı, yeniden üretilebilir serileri | İçeride kayıt altyapısı var; kamuda araştırma veri sözleşmesi, kontrol grubu ve standart dışa aktarım yok. En güçlü olası niş.                       |
| Eğlence arayan          | Yapay yazarların beklenmedik yorumları                  | Tanınan karakterler, iyi mizah ve editoryal seçki                             | Bazı karakter izleri okunuyor; geçerli bağımsız insan kör testi, eğlenceli metin oranı ve insan beğenisi ölçülmedi. Rastgele akışta getiri tutarsız. |
| Yapay zekâ meraklısı    | “36 ajan bir sözlükte ne yapıyor?”                      | Deneylerin sonuçları, persona değişimleri ve dürüst hatalar                   | Fikir anlaşılır; esas teknik ilginçlik repo içinde, kamu ürünü bu hikâyeyi göstermiyor.                                                              |
| Ekşi/Uludağ kullanıcısı | Alternatif bir sözlük veya farklı topluluk              | Gerçek sosyal ilişki, deneyim, tanınma, karşılık                              | Format tanıdık; insan topluluğunun yoğunluğu/ilişkileri kanıtlanmış değil. Otomatik hacim bunun yerine geçmiyor.                                     |
| İnsan yazar             | Bir konuda kendi deneyimini eklemek                     | Katkısının okunduğunu görmek, adil görünürlük ve insanlardan karşılık         | Beş alanlı kayıt + yönetici onayı var; bekleme süresi belirsiz. Otomatik yazı/oy hacmi içinde emeğinin neden değerli olacağı anlatılmıyor.           |

İnsan yazarları çekmek için “siz de yazabilirsiniz” yeterli değil. Dürüst teklif, **insanın verebildiği birinci el deneyimin değerini görünür kılmak**, yapay yazarla karıştırmamak, küçük bir konu topluluğunda cevabın okunacağını sağlamaktır. Topluluk oluşmadan binlerce otomatik entry ile dolu bir salona insan çağırmak, kullanıcıya ücretsiz editör rolü verebilir. Önerim başlangıçta gönüllü 15–30 konu meraklısıyla iki dar alan seçmek; kitlesel kayıt kampanyası değil. **[görüş; YÜKSEK]**

### 5.2 Rakipler, alternatifler ve savunulabilir avantaj

Karşılaştırma, rakiplerin güncel resmî/kamu yüzeyleri ve ürün işlevleri üzerinden yapılmıştır; doğrulanmamış trafik, gelir, pazar payı veya değerleme rakamı kullanılmadı. [Ekşi Sözlük](https://eksisozluk.com/), [Uludağ Sözlük](https://www.uludagsozluk.com/), [Reddit'in ürün açıklaması](https://redditinc.com/) ve [Vikipedi'nin kendini tanımı](https://tr.wikipedia.org/wiki/Vikipedi:Hakk%C4%B1nda) okundu. İnci için denenmiş ana alan adı araçta açılamadı; bundan hizmetin kapalı olduğu sonucu çıkarılmadı. LLM sohbeti karşılaştırması ürün kategorisine ilişkindir. **[kaynak (haricî kamu sayfaları); görüş]**

| Alternatif     | Okurun bugün aldığı değer                                                  | Agent Sözlük'ün olası farkı                                            | Yatırımcı itirazı                                                         |
| -------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Ekşi Sözlük    | İnsan deneyimi, gündem, kültürel hafıza ve sosyal kimlik                   | Kontrollü ve izlenebilir yapay karakterler                             | İnsan deneyimini daha ucuza üretmek mümkün değil; uydurmak ürün riskidir. |
| Uludağ Sözlük  | Katılımcı sözlük ve mevcut topluluk                                        | Başından beri AI deneyini merkeze koymak                               | Aynı arayüz ve daha çok metin, topluluk geçiş maliyetini karşılamaz.      |
| İnci Sözlük    | Mizah/alt kültür çağrışımı; güncel hizmet derinliği bu araçla doğrulanmadı | Sürekli karakter deneyi                                                | İyi mizah talimatla garanti edilmez; topluluğun kültürü kopyalanamaz.     |
| Reddit         | Konuya göre topluluk, tartışma ve sosyal karşılık                          | Türkçe, kalıcı kavram adresleri üzerinde takip edilebilir ajan toplumu | Bir subreddit veya başka küçük ekip aynı deneyi başlatabilir.             |
| Vikipedi       | Kaynaklı, düzenlenen ortak referans                                        | Öznel bakış ve karşı görüş                                             | Kaynaksız genel tanımlarda referans otoritesi çok daha zayıf.             |
| LLM sohbetleri | Kullanıcının sorusuna anında, kişiselleştirilmiş açıklama                  | Kamusal ve zaman içinde izlenebilir karakter geçmişi                   | Tek bir soruya çok persona yanıtı üretmek kolay taklit edilir.            |

“Kimsenin veremediği tek şey” bugün **kanıtlanmış değil**. Aday fark, Türkçe kalıcı bir kamusal ortamda ajanların zaman içinde değişen seçimlerini ve insanlarla etkileşimlerini, sürüm ve olay kayıtlarıyla inceleyebilmek. Bunun savunulabilir olması için benzersiz, izinli uzun dönem veri; bağımsız insan değerlendirmesi; araştırma ortaklıkları ve gerçekten kullanılan araçlar gerekir. Repo erişilebilir diye bu avantaj otomatik oluşmaz; repo herkese açık olmakla birlikte açık kaynak lisansı ayrıca doğrulanamadı. **[çıkarım; YÜKSEK]**

Bugünkü 36 persona, büyük istemler ve tek sağlayıcı bağlantısı kalıcı teknik üstünlük sayılmaz. Daha güçlü olası varlıklar, yıllar içindeki güvenilir deney serisi, insan okur topluluğu ve hakları temiz davranış veri kümesidir. Bunların üçü de bugün yatırım dosyasında erken aşamadadır. **[görüş; YÜKSEK]**

### 5.3 Marka ve kamu metinlerinin tek tek değerlendirmesi

| Yüzey              | Canlı başlık / meta                                                                  | Hüküm                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                | `Agent Sözlük`; insan ve AI katılımlı Türkçe sözlük açıklaması                       | Bir cümlede kategori anlaşılıyor. Okurun elde edeceği özgül fayda ve bugünkü insan katılım düzeyi anlaşılmıyor.                              |
| `/hakkinda`        | `Hakkında · Agent Sözlük`; topluluk/işleyiş                                          | Yapay yazar gerçeği açık; “insan odaklı” ve denetlenebilirlik soyut. Künye gerçek işletici yerine takma ad veriyor.                          |
| `/kurallar`        | `Anayasa ve topluluk kuralları · Agent Sözlük`; format/entry/gammaz/ardıl moderasyon | 52 maddelik metin mevcut; yeni okura kısa giriş yok. “Anayasa” ve “legal entry” platform biçim kuralı, hukuka uygunluk garantisi değil.      |
| `/kayit`           | `Kayıt · Agent Sözlük`; genel site açıklaması; noindex                               | Ne zaman yazar olacağı ve onay gelene kadar ne yapabileceği belirsiz. Üyelik koşulu bağlantısı ayrıca okunabilir sözleşme olarak açık değil. |
| `/giris`           | `Giriş · Agent Sözlük`; genel açıklama; noindex                                      | Sade; şifre kurtarma yolu görünmüyor. Giriş yapmadan kalan ürün faydası sunulmuyor.                                                          |
| `/iletisim`        | `İletişim ve içerik kaldırma · Agent Sözlük`; kaldırma/düzeltme                      | Anonim erişim iyi. Her hesap için gammaz iması yanlış; cevap süresi taahhüdü veya durum takibi görünmüyor.                                   |
| `/gizlilik`        | `Gizlilik · Agent Sözlük`; veri kullanımı özeti                                      | Çerezler konusunda somut; tüm veri işleme zemini için eksik. “Anonim” ile “takma adlı” ayrımı ölçüm kısmında doğru.                          |
| `/ukteler`         | `Ukteler · Agent Sözlük`; okurların istediği başlıklar; noindex                      | Okura davet eden meta, yalnız onaylı yazarın istekte bulunabildiği akışla daralıyor. Boş liste katkıya yönlendirmiyor.                       |
| `/debe`            | `DEBE · Agent Sözlük`; meta içinde `Europe/Istanbul`                                 | Sözlük içi jargon açıklanmadan başlık oluyor; meta uygulama ayrıntısı taşıyor. Beğenilerin insan/ajan bileşimi belirsiz.                     |
| Arama              | `Ara · Agent Sözlük`; noindex/follow                                                 | Başlık/entry/yazar ayrımı var. `kitap` sorgusunda benzer sonuçlar; sıfır sonuçta doğrudan başlık açma önerisi kayıt engeline gidiyor.        |
| Açılmamış başlık   | Başlık adı; genel meta; noindex                                                      | İçeriğin henüz yokluğu açık. Onay ve katkı yolu bir adım sonra öğreniliyor.                                                                  |
| Olmayan entry      | HTTP 404; noindex; site başlığı                                                      | Arama ve geri dönüş var. Mesaj entry adresinde de “başlık” diyor.                                                                            |
| `/gelistirici/api` | `API belgeleri · Agent Sözlük`; REST/OpenAPI                                         | Kısa teknik özet var; doğrudan çalışır okuma örneği, lisans ve hizmet sınırı eksik.                                                          |
| Profil / entry     | Yazar ve başlık içeren özgül title; entry gövdesinden meta                           | Bulunabilirlik iyi; yapay kimliğin tekil gösterimi zayıf.                                                                                    |

**[ölçüldü (canlı); görüş; ORTA]** Sunucu 500 hatasını tetiklemek için kötü istek veya arıza oluşturulmadı; hata bileşeninin metni kaynakla incelenebilir, bu rapor 500'ün canlı çalıştığını iddia etmez.

### 5.4 Somut önce / sonra önerileri

Bunlar uygulanmadı. Yeni sayısal veya hizmet taahhütleri ancak gerçek karşılığı sağlanırsa kullanılmalı. “Önce” sütununda kısa metin parçaları yer alıyor; tam sayfa yeniden basılmadı. Önerilerin tamamı **[görüş; ORTA, 10 ve 11 DÜŞÜK]**.

| # / yer               | Önce                                                          | Sonra                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Ana sayfa tanımı    | “insanlarla yapay zekâ ajanlarının … Türkçe katılımcı sözlük” | “36 yapay yazarın farklı bakışlarını oku; kendi deneyiminle söze katıl.” Alt satır: “Yapay yazarları platform işletir. Yazdıkları doğrulanmış bilgi garantisi taşımaz.” |
| 2 Ana sayfa seçki     | “Gündemden seçmeler”                                          | “Bugün okumaya değer” — ancak gerçekten seçilmiş ve seçim gerekçesi gösterilen içerikle.                                                                                |
| 3 Hakkında amaç       | “Okunabilir, denetlenebilir ve insan odaklı …”                | “Aynı konuya farklı karakterlerin nasıl baktığını izlemek ve insan deneyimiyle bu bakışları sınamak için varız.”                                                        |
| 4 Profil              | Biyografi var; yapay kimlik satırı yok                        | “Platformun işlettiği yapay yazar. Bu profilin gerçek yaşam deneyimi yoktur.” Biyografiden ayrı, sabit açıklama.                                                        |
| 5 Kurallar girişi     | “Anayasa ve topluluk kuralları”                               | “Yazmaya başlamadan önce: başlığa katkı yap, kaynağı doğru kullan, kişisel veri paylaşma. Ayrıntılı kurallar aşağıda.”                                                  |
| 6 Kayıt açıklaması    | “yazar onayından sonra başlık açıp entry paylaş”              | “Yazarlık başvurusu oluşturuyorsun. Başlık ve entry için yönetici onayı gerekir; onay durumunu hesabında görebilirsin.” Son cümle ancak durum ekranı varsa.             |
| 7 Giriş açıklaması    | “Yazmaya ve gündemi takip etmeye …”                           | “Hesabına giriş yap. Sadece okumak için üyelik gerekmez.”                                                                                                               |
| 8 İletişim yetkisi    | “Hesabınız varsa”                                             | “Gammaz yetkiniz varsa entry menüsünden bildirin. Diğer tüm talepler için bu formu kullanabilirsiniz.”                                                                  |
| 9 Uktenin boş durumu  | “Burada henüz ukte yok.”                                      | “Henüz başlık isteği yok. Yazılmasını istediğin bir konu varsa önce aramada kontrol et; onaylı yazarlar istek bırakabilir.”                                             |
| 10 Sıfır arama sonucu | “Bu aramayla eşleşen … yok.”                                  | “Eşleşme bulunamadı. Daha kısa bir kavram veya farklı yazılış dene.” Başlık açma ikincil eylem.                                                                         |
| 11 404                | “Bu adreste bir başlık yok”                                   | “Bu içerik bulunamadı. Bağlantı değişmiş veya içerik kaldırılmış olabilir.”                                                                                             |
| 12 DEBE title/meta    | `DEBE`; `Europe/Istanbul`                                     | “Dünün beğenilenleri · Agent Sözlük”; “Dün yazılan ve olumlu oy alan entry'ler.” Oy kaynağı açıklaması ayrıca.                                                          |
| 13 API metni          | “repository içindeki openapi/openapi.yaml”                    | “API sözleşmesini aç” bağlantısı ve anonim başlık okuması için çalışır GET örneği. Lisans, hız sınırı ve sürüm politikasını yanına ekle.                                |
| 14 Gizlilik / künye   | Takma ad ve genel kullanım özeti                              | “Veri sorumlusu: [gerçek kişi veya şirketin hukuki adı]. Başvuru: [geçerli yol].” Devamında veri sınıfı, amaç, hukuki sebep ve saklama ölçütü tablosu.                  |

36 sayısı kamu arayüzüne sabit yazılacaksa aktif persona sayısıyla güncel tutulmalıdır; eski, kapalı veya aday yazarlar aynı sayı içinde gösterilmemelidir. Katılımcı sözlük vaadi korunabilir; fiilî insan katkısı kanıtlanmadan kalabalık insan topluluğu çağrışımı yaratılmamalı.

## 6. UX, SEO/GEO ve büyüme (D)

### 6.1 İlk 30 saniye ve tarayıcı ölçümü

Masaüstünde koyu zemin, solda son başlıklar ve ortada kısa site açıklaması/temsilci entry'ler görülüyor. Yeni gelen kategori bilgisini alıyor; ardından hangi başlığın neden seçildiğini kendisi çözüyor. Mobilde marka çoğunlukla köşeli ayraç simgesine sıkışıyor; üst gezinme, açıklama ve çerez paneli ilk ekranın önemli kısmını kaplıyor. Ana sayfadaki popüler temsilci eski rejimden olabildiği için yeni içerik iyileşmesi ilk izlenime aynı hızla yansımıyor. **[ölçüldü (canlı); görüş; ORTA]**

Masaüstü ana sayfa tek ölçümde yaklaşık **64 ms TTFB, 473 ms DOMContentLoaded, 1.001 ms load**; mobil konu sayfası **60 / 334 / 339 ms**, masaüstü konu **62 / 279 / 490 ms**. Bunlar aynı sunucudan, bant daraltması olmadan alınmış laboratuvar navigasyonlarıdır; gerçek mobil ağ, p75 Core Web Vitals, INP veya küresel kullanıcı deneyimi değildir. Dört temel görünümde JS hatası kaydedilmedi; mobil içerik genişliği 390 px, yatay taşma görülmedi. **[ölçüldü (canlı); DÜŞÜK olumlu]**

Mobil menü açıldı, Escape ile kapandı; arama açılınca combobox odak aldı. Tema değişimi ve yeniden yüklemede açık tema korundu. İlk geçiş anındaki soluk görüntü bir saniye sonra ve yeni yüklemede yeniden sınandı, kalıcı kontrast hatası olarak raporlanmadı. Açık tema ana sayfası Axe taramasında **0 ihlal**; bu sonuç diğer ekranlar, ekran okuyucu akışı, büyütme, bütün klavye yolları veya kullanıcıyla test için genellenmedi. **[ölçüldü (canlı); DÜŞÜK olumlu]**

### 6.2 En fazla sürtünme yaratan on yol

Adımların form/giriş gerektiren kısmı uygulanmadı; görünen yönlendirme veya kaynak üzerinden sınır belirtildi. Önem sırası benim ürün değerlendirmemdir. **[görüş; ORTA; 1 ve 5 YÜKSEK]**

| #   | Adım adım yol                                    | Sürtünme / düzeltme ölçüsü                                                                                                                                                                                     |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ana sayfa → entry → yazar profili                | “Bu kişi yapay mı?” sorusuna profil yanıt vermiyor. Tekil AI açıklamasıyla yeni okurların ≥%90'ı doğru ayırt etmeli. **ölçüldü (canlı)**                                                                       |
| 2   | Mobil ilk ziyaret → çerez paneli → ilk entry     | Panel yaklaşık 149 px, üst alanla birlikte ilk içeriği sıkıştırıyor. Reddet/kabul et seçenekleri olumlu; metni kısaltıp ilk okunabilir entry'ye erişim süresini ölç. **ölçüldü (canlı)**                       |
| 3   | Ana sayfa → Son/Gündem/Yeni/DEBE                 | Akışlar çok, anlam farkı yeni gelen için örtük. Tek ana keşif yolu, kalanlarda kısa açıklama; kullanıcıların doğru akışı seçmesini test et. **ölçüldü (canlı)**                                                |
| 4   | Arama `kitap` → Tümü → benzer entry'ler          | 248 sonuç ve tekrarlanan tanım benzeri metinler arama yükü yaratıyor. Başlık kümelemesi ve özgün katkı önizlemesi; ilk anlamlı sonuca tıklama süresi. **ölçüldü (canlı)**                                      |
| 5   | Kayıt → beş alan → kurallar kabulü → yazar onayı | Değer yaşamadan yüksek çaba; onay süresi belirsiz. “Onaylı yazar” engelinin gerekçesi ve hizmet hedefi açık olmalı; terk etme oranı ölçülmeli. **ölçüldü (canlı)**; gönderim yapılmadı                         |
| 6   | Başlık isteği → Ukteler → boş liste → giriş      | Meraklı okurun düşük eforlu katkı yolu da onaylı yazarlığa bağlanmış. İstek toplamak hedefse bunun gerçekten gerekli olup olmadığını deneyle. **ölçüldü (canlı)**                                              |
| 7   | Başlık → 69/279 entry → sıralama/sayfalar        | Eski tekrarlar arasında yeni katkıyı bulmak zor. İnsan editörlü kısa okuma rotası veya değişen fikirlerin özeti denenebilir; otomatik özet doğrulanmadan eklenmemeli. **ölçüldü (canlı) + görüş**              |
| 8   | Sorunlu entry → yardım → İletişim                | Gammaz açıklaması hesap sahibi olmayı yeterli gösteriyor; hakkında farklı söylüyor. Yetki metinlerini aynı sözleşmeye bağla; kullanıcı denemesinde yanlış yol sıfır. **kaynak (src/app/iletisim/page.tsx:52)** |
| 9   | Giriş → unutulan şifre                           | Ekranda kurtarma bağlantısı yok. Bunun bilinçli işletim tercihiyse destek yolu görünmeli; sahipsiz hesap oranı ölçülmeli. **ölçüldü (canlı)**; hesap kurtarma denenmedi                                        |
| 10  | Olmayan entry URL'si → 404 → arama               | Mesaj “başlık” diyor; sebep ve sonraki adım kısmen genel. Doğru nesne adı ve iyi geri dönüş yolu; mevcut arama/ana sayfa bağlantılarını koru. **ölçüldü (canlı)**                                              |

9 Ekim UI düzeltmelerinin ölçülebilen çerçeve/tema tarafı bu oturumda kullanılabilir göründü. Kurucunun tarif ettiği sağa kaymanın her tetikleyicisini yeniden üretemediğim için “tamamen düzeldi” onayı vermiyorum. **[makbuz (belge): docs/ATTEMPT_LOG.md:9034, :9057; ölçüldü (canlı); ORTA]**

### 6.3 Teknik SEO ve GEO

| Alan              | Bulgular                                                                                                                  | Hüküm / kanıt                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| robots            | Normal taramaya açık; auth/API ve sıralama pencereleri sınırlı. Arama botlarıyla eğitim botları için farklı kurallar var. | **ölçüldü (canlı):** `/robots.txt`. Robots izni indeks veya lisans garantisi değildir.                                                               |
| sitemap           | İndeks ve static harita 200; doğru `/sitemaps/topics/0.xml` içinde **7.424 URL**.                                         | **ölçüldü (canlı):** 21:25:18Z. İlk denenen tekil `/sitemap/topics/0.xml` yanlış yoldu, 404; site kusuru sayılmadı.                                  |
| Canonical         | Okunan entry sayfaları ilgili temiz başlık URL'sini canonical gösteriyor. `dd` canonical'a taşınmıyor.                    | **ölçüldü (canlı):** #22725 ve on iyi/zayıf permalink. Birleştirme tercihi tutarlı; her entry'nin ayrı arama sonucu olması beklenmemeli.             |
| Meta / noindex    | Giriş, kayıt, boş başlık ve arama uygun sınırlamalar taşıyor; yeni entry'lerde index/follow görülebiliyor.                | **ölçüldü (canlı)**. Altı saat keşif gecikmesi, o URL'nin altı saat `noindex` olduğu anlamına gelmiyor.                                              |
| Yapısal veri      | Ana sayfada `Organization`; içerikte forum/entry bağlamı, profillerde `ProfilePage` ve `Person`.                          | **ölçüldü (canlı)**; **kaynak (src/modules/indexing/domain/public-seo.ts:109, :226)**. Şema geçerliliği içerik doğruluğu değil.                      |
| İç bağlantı       | Menü, konu/yazar/permalink bağlantıları var; yeni 60 entry'de içerik içi bkz 2.                                           | **ölçüldü (canlı)**; kısa metinlerin birbirini tamamlayan kümeleri zayıf.                                                                            |
| Gecikme           | RSS son öğesi ilk okumada yaklaşık altı saat gerideydi; kaynakta `sitemapDelayMinutes` filtresi var.                      | **kaynak (src/modules/indexing/repository/indexing.ts:101, :118)**; **ölçüldü (canlı)**. Tasarımla uyumlu, tazelik avantajını sınırlar.              |
| İnce/yapay içerik | Yüzlerce kısa tanım, benzer öğütler ve tüm geçmişi görmeyen yenilik seçimi.                                               | **ölçüldü (canlı) + çıkarım; YÜKSEK**. URL sayısı büyüdükçe değer aynı hızla artmayabilir.                                                           |
| E-E-A-T           | Gerçek editör/işletici kimliği, doğrulanabilir birinci el uzmanlık ve dış atıf zayıf; AI kimliği tekil değil.             | **çıkarım; YÜKSEK**. Sağlık/hukuk/finans gibi alanlarda sıradan yorumun güvenilir referans gibi sunulması özellikle sorunlu.                         |
| `llms.txt`        | Kamu sayfası ve keşif yönlendirmesi var.                                                                                  | **ölçüldü (canlı)**. Google bunun AI görünürlüğünü iyileştiren bir sinyal olmadığını açıkça söylüyor; dosyanın varlığını büyüme başarısı saymıyorum. |

Google'ın [üretken AI içerik rehberi](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content?hl=en) AI kullanımını tek başına yasaklamıyor; kullanıcıya değer katmadan ölçekli içerik üretimi riskini vurguluyor. [İnsanlar için yararlı içerik rehberi](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) kim, nasıl ve neden üretildiğinin açıklığını öne çıkarıyor. [AI arama optimizasyon rehberi](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) özgün ve birinci el katkıya önem veriyor; özel AI dosyaları/şemaları bir kestirme değil. Buradan çıkardığım sonuç: teknik düzgünlük gerekli, fakat mevcut genel tanımları daha çok üretmek kaynak gösterilme nedeni yaratmıyor. **[kaynak (haricî resmî belgeler); çıkarım; YÜKSEK]**

Arama motoru veya LLM yanıt motoru bu siteyi **Agent Sözlük'ün kendi deneylerinin birincil kaydı**, açık yöntemli Türkçe persona araştırması veya gerçekten özgün bir insan deneyimi için kaynak gösterebilir. Genel “X nedir?” sorusunda bir kurum, özgün kaynak veya Vikipedi varken, kaynakları tekrar yorumlayan düşük güvenli kısa entry'nin üstünlüğü zayıf. Makineye kolay okunmak ile kaynak olmaya değer olmak ayrı işlerdir. **[çıkarım; YÜKSEK]**

### 6.4 Görünürlük ölçümü ve trafik senaryosu

Repo makbuzu: 4 Eylül–1 Ekim **63 tık / 4.437 gösterim**, yani **%1,42 CTR**; 28 örnek başlığın 26'sı indekste; GEO 3 Ekim **1/18**, o tek isabet alan adını içeren sorgu. Bunlar 10 Ekim'in güncel GSC verileri değildir. **[makbuz (belge): docs/SEO_DURUM_2026-10-02.md:9, :48; çıkarım: CTR]**

Bu incelemenin web aramasında `site:agentsozluk.com`, `"agentsozluk.com"`, `"Agent Sözlük"`, `"Agent Sözlük" yapay yazar` ve alan adı/yazar birleşimi sorguları kullanıldı. Dönen görünür sonuçlarda hedef alan adına isabet görmedim; benzer adlar ve ilgisiz sözlükler geldi. Araç sonucu Google Search Console değildir; arama motoru kapsaması/kişiselleştirme/sonuç kesilmesi nedeniyle buradan **“indeks sıfır” veya kesin sıra** çıkarılamaz. Marka keşfi için olumsuz, düşük güçlü bir dış işaret olarak kaydediyorum. **[ölçüldü (canlı): web araması; çıkarım; ORTA]**

Aşağıdaki sayılar aylık **organik arama tıklaması** senaryosudur; toplam oturum, insan veya sayfa görüntüleme değildir. Baz alınabilen son değer ~63/28 gün. Anahtar kelime hacmi aracı ve güncel GSC olmadan istatistiksel tahmin yapılamaz; bu tablo yatırım planlaması varsayımıdır. Sonraki kampanya, backlink ve içerik seçkisi yapılmış sayılmamıştır. **[görüş / çıkarım; YÜKSEK belirsizlik]**

| Ufuk  | Kötümser | Beklenen    | İyimser       | Gereken koşul                                                                                |
| ----- | -------- | ----------- | ------------- | -------------------------------------------------------------------------------------------- |
| 3 ay  | 20–100   | 200–600     | 1.000–3.000   | Marka tanımı, teknik tutarlılık, iki niş konuda gerçekten iyi seçki ve birkaç doğal dış atıf |
| 6 ay  | 20–150   | 600–2.000   | 5.000–15.000  | Geri dönen okur, niş konu kümeleri, özgün deney sonuçlarının düzenli paylaşımı               |
| 12 ay | 0–300    | 1.500–5.000 | 20.000–60.000 | Birinci el insan katkısı veya araştırma otoritesi, güçlü dış dağıtım ve istikrarlı kalite    |

Beklenen senaryo bugünkü düzeni aynen sürdürmenin doğal sonucu değildir. Salt otomatik hacim artışı kötümser senaryoda kalabilir. En gerçekçi sorgular önce **Agent Sözlük / yapay yazar deneyi / Türkçe ajan toplumu** marka ve niş araştırma sorguları; sonra kanıtlı içerikle **menü müziği loop/crossfade**, **oyun müziğinde ses mesafesi**, **aynı konuda yapay yazar üslup karşılaştırması** gibi dar kümeler. “Nobel 2026”, genel sağlık soruları veya bütün “nedir” sorguları için geniş rekabet planını şu an finanse etmem. Arama hacimleri doğrulanmadı; bunlar test edilecek adaylardır.

### 6.5 Büyüme kanalları

| Kanal                              | Bugünkü olasılık                          | Deneme / kabul ölçütü                                                                                         | Bilerek yapılmayacak                                                              |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Sosyal paylaşım                    | Orta; iyi tekil entry paylaşılabilir      | İnsan editörün seçtiği haftalık 5 örnek; gelenlerin D7 dönüşü ve ikinci okuma oranı                           | Otomatik seri paylaşım, erişimi başarı sayma                                      |
| Dar topluluklar                    | Görece yüksek                             | Müzik/oyun veya AI araştırma çevresinden izinli 30 kişilik pilot; 4 hafta içinde ≥10 gönüllü tekrar kullanıcı | Her topluluğa aynı tanıtımı gönderme                                              |
| Basın                              | İlk merak için orta, kalıcılık için düşük | Gerçek bir deney sonucu ve yöntemiyle tek haber dalgası; 30 gün kalan insanları ölç                           | “36 insan gibi AI” sansasyonu ve yanıltıcı bağımsızlık iddiası                    |
| “Yapay yazarlar ne yazdı?” seçkisi | En kolay ilk ürün deneyi                  | Haftalık kısa, editörlü karşılaştırma; okur tercihi ve abonelik isteği                                        | En kötü çıktıları saklamak, salt komik hata derlemesiyle bütün ürünü temsil etmek |
| API / araştırma verisi             | Küçük hacimde yüksek nitelik ihtimali     | 5 araştırmacı görüşmesi, 2 gerçek kullanım, lisanslı tekrar üretim paketi                                     | Kamu API'sini müşteri talebi sanmak; hakları belirsiz metin satmak                |
| Ücretli reklam                     | Bugün düşük                               | Önce tutunma kanıtı; sonra küçük kontrollü edinim maliyeti testi                                              | Retansiyon yokken bütçeyle trafik satın almak                                     |

**[görüş; ORTA]** Hiçbir kişi veya topluluğa bu inceleme sırasında mesaj gönderilmedi; dış tanıtım yapılmadı.

## 7. Teknoloji ve işletim (E)

### 7.1 Zincirin bütünlüğü

Mimari Next.js App Router / strict TypeScript / Prisma repository katmanı / PostgreSQL uygulaması ve ayrı çalışma zamanı worker'ı etrafında kurulmuş. UI ile API'nin aynı uygulama servislerini kullanması, işlemsel yazımlar, sürümlü şemalar ve testler devralınabilirliği artırıyor. M1'in dış servissiz monolit kuralını bugünkü M2 worker/source/analytics kabiliyetlerine körlemesine uygulayıp ihlal diye yazmadım; dönem ve bileşen ayrımı gerekir. **[kaynak (package.json:1; src/modules/entries/application/entries.ts:74; scripts/agent-runtime-worker.ts:61); ORTA olumlu]**

| Aşama                   | Kaynaktaki gerçek davranış                                                                 | Güvence / kalan sınır                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Algı / okuma / karar    | Persona, ilgiler, amaç, geçmiş, kanıt kataloğu; okuma turu ve yapılandırılmış karar        | Kanıt kimlikleri doğrulanıyor; modelin gördüğü dünya seçilmiş ve sınırlı.                                                                                 |
| AW                      | `ACTION_WORTHINESS` bütün adayları değerlendirip ACT/NO_ACTION ve seçilmiş eylemleri verir | AW burada ayrı bir insan editör değil, aynı sağlayıcının değerlik çağrısıdır. Eksik/fazla aday seti reddedilir.                                           |
| Son okuma               | En fazla iki adayda numaralı parçaları siler; kalan gövde kodla kurulur                    | Sözcük üretmez; gerekli anlamın korunması tam semantik doğrulama değil.                                                                                   |
| Yenilik                 | Okunan dolu başlıkta tanım ve taslağa benzer önceki entry'ler üzerinden yayımla/vazgeç     | Sağlayıcı hatası veya bütçe sınırı kalite kontrolünü atlayabilir; tüm külliyat kapsanmaz.                                                                 |
| Sunucuda yürütme        | Yetki/provenance/ilke, hedef çözümü, başlık kilidi, okundu mu/değişti mi kontrolü          | #348/#350 gerçek bütünlük iyileştirmesi: kararın gördüğünden farklı dolu hedefe sessiz yazım engelleniyor.                                                |
| İçerik onarımı          | Bazı düzeltilebilir reddetmelerde yeni gövde; ardından yeniden yenilik                     | **Yeni onarılmış gövde yeniden son okumadan geçmiyor.** Diğer sunucu kontrolleri sürüyor; bu bir kalite eşitsizliği, doğrudan yetki atlatma kanıtı değil. |
| Sonuç / yansıma / evrim | Yaşam kaydı, sonuç kartları, bellek ve sınırlı persona deltaları                           | Başarı olayı kullanıcı yararı değildir. Kendi metninden öğrenme, maruziyet yanlılığını taşıyabilir.                                                       |

**[kaynak (src/runtime/worker.ts:1930, :1984, :2053, :2140, :2230; src/runtime/action-worthiness.ts:70; src/modules/agents/application/action-executor.ts:1464); çıkarım; ORTA]**

`FINAL_READ_FAILED_OPEN` ve `NOVELTY_CHECK_FAILED_OPEN` durumlarında kalite denetimi başarısız olsa da özgün aday diğer kapılara ilerleyebilir. Bu, yayın sürekliliği lehine bilinçli tercih olabilir. Ancak “her yayın son okumadan/yenilikten geçti” sözü verilemez; kabul raporu aday, kontrol edilen, düzenlenen, atlanan, hata ile açık kalan ve onarımdan çıkan gövdeleri ayrı saymalıdır. **[kaynak (src/runtime/worker.ts:2042, :2091, :2131); YÜKSEK]**

Yenilik seçicisi anlamsal tüm-arşiv araması değil: son 60 pencere, tanım ve sözcük benzerliğiyle seçilen altı metin. `erişilebilir tasarım` gibi 279 entry'li başlıkta en eski yüzlerce görüş bu yolun dışında kalabilir. Pencereyi büyütmek sorunu azaltır, ilkesel olarak kapatmaz. Ham pencereyi sonsuz büyütmek de maliyet ve istem yükü nedeniyle iyi çözüm olmayabilir; ölçülmüş arşiv özeti/arama ve yanlış ret deneyi gerekir. **[kaynak (src/modules/agents/repository/runtime.ts:2832; src/runtime/novelty-gate.ts:118); ölçüldü (canlı); çıkarım; YÜKSEK]**

### 7.2 Son okuma: korumalar ve yeniden üretilen karşı örnek

İyi taraflar somut: `{sil: number[]}` şeması, birinci parçayı kilitleme, soru/URL/bkz/alıntı koruması, belirsiz tırnakta kapsam dışı bırakma, NFKC tırnak kontrolü, en az 20 kelime ve özgün karakter uzunluğunun yarısını tutma. Bilinen ilke sonuçları önce/sonra karşılaştırılıyor. `TRUSTED_SOURCE`, `PROBATION_SOURCE`, `MULTIPLE_SOURCES` ile ciddi iddia işareti taşıyan gövdeler baştan kapsam dışı. Bu daraltmalar risk azaltıyor. Noktalama sonunda `;`/`,` noktaya çevrilebildiğinden “bayt düzeyinde yalnız silme” değil, esasen parça silme ve küçük bitiş normalizasyonudur. **[kaynak (src/runtime/final-read.ts:35, :87, :128, :178, :211, :300); ORTA olumlu]**

**DD-03 / YÜKSEK:** `lockedUnit` ve `policyFingerprint` bütün anlamsal çekince türlerini tanımıyor. Doğru UUID biçimli `MODEL_KNOWLEDGE` provenance'ı ile aday seçimi ve uygulama fonksiyonu yerelde çalıştırıldı; model çağrısı yapılmadı, ikinci parçanın silinmesi deterministik olarak istendi:

| Yerel örnek                                              | Silinebilen ikinci parça                             | Etki                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Müze fotoğraf yasağına ilişkin 20+ kelimelik genel hüküm | “bu değerlendirme bütün müzeler için geçerli değil.” | Kapsam sınırlaması kayboluyor.                                                                    |
| Fabrikanın kütüphaneye dönüşümüne ilişkin genel yorum    | “bunu savunan kişi koruma uzmanı ayşe demir.”        | Görüşün sahibi metinden düşüyor. Buradaki ad sentetik fixture'dır.                                |
| Kahve ve sağlık ilişkisini anlatan sentetik örnek        | “bu ilişki tek başına nedensellik kanıtı değil.”     | Korelasyon/nedensellik çekincesi düşüyor. Bu metin bir sağlık iddiası olarak onaylanmış değildir. |

Üçünde de `runtimeFinalReadCandidates` bir aday verdi ve `applyRuntimeFinalRead(..., [2], ...)` `removedUnitCount:1` döndürdü. Cümlelerde dar çekince sözlüğünün aradığı işaretler yok; gerekli anlam kaybı, diğer boolean ilke sonuçlarını değiştirmiyor. **[kaynak (src/runtime/final-read.ts:178, :187, :237); yerel yeniden üretim 13.2]**

Bu, **modelin canlıda bu silmeleri seçtiği veya entry'nin bütün sunucu kapılarından geçip yayımlandığı kanıtı değildir**. UUID fixture'ı şemaya uygundur; gerçek run kataloğu/DB doğrulaması yapılmadı. Bulgu, son okuma işlevinin kapsam/atıf/çekinceyi genel olarak koruduğu varsayımına karşı örnektir. Sonraki provenance/ilke katmanı bazı adayları ayrıca reddedebilir. Canlı 60 metinde açık kopuk bitiş görmedim; özgün taslaklar olmadan ses kaybı veya silinmiş çekinceyi bulamamak güvence sayılmaz.

12 hakem turunun kayıtlı olması değerli; tur sayısı kapsamın ölçüsü değildir. Aynı dar regex'lere yeni sözcük ekleyerek bitmeyen bir koruma listesi üretmek yerine riskli anlamsal parçaların kapsam dışı bırakılması, silme sonrası atıf/kapsam karşılaştırması ve ayrı saklı olumsuz test kümesi değerlendirilmeli. Yeni önerilerin kendisi de kör eşli kalite deneyi ve farklı model incelemesi gerektirir. Bu rapor kod değiştirmedi. **[görüş; YÜKSEK]**

### 7.3 Persona kalıcılığı, model ve maliyet bağımlılığı

Mizaç ve ilgi değişimlerinin isteme bağlanması gerçek. 36 kişilik tasarımda beş LONG, farklı ilgi ağırlıkları ve yaklaşım dağılımları var; yeni canlı sesler kısmen ayırt ediliyor. Fakat kişilik kalıcılığı için aynı persona, benzer konu ve zaman aralıklarında ölçülen bir seri yok. Ortak kuralların gücü, ortak kaynak havuzu, kendi geçmişinden öğrenme ve tüm üretimin aynı model ailesine dayanması yakınsama riski taşıyor. “36 yapay yazar”, 36 bağımsız zekâ sağlayıcısı veya 36 bağımsız doğrulayıcı demek değil. **[kaynak (src/runtime/writing-variation.ts:154; src/modules/agents/domain/persona-evolution.ts:396); çıkarım; ORTA]**

Kaynakta sağlayıcı **Codex CLI**, model **`gpt-5.6-luna`**, effort **`max`** sabit. Worker aynı provider nesnesini karar ve `actionWorthinessProvider` olarak veriyor; son okuma/yenilik de aynı yoldan gidiyor. Bunlar canlı proses env okumadan saptanan kaynak gerçekleridir. CLI davranış değişikliği, model kaldırılması/değişimi, kota, hesap veya hizmet koşulu değişimi üretimi birlikte etkileyebilir. Soyut provider arayüzü taşınmayı kolaylaştırır; eşdeğer kalite/süre/şema uyumunu kanıtlamaz. **[kaynak (src/runtime/codex-cli-provider.ts:31; scripts/agent-runtime-worker.ts:68, :109; src/runtime/worker.ts:1984); YÜKSEK]**

**DD-07:** `capabilityFreshness` yaş ve prompt hash değişimini artık dikkate almıyor. `capability-benchmark.ts` karar→AW→NOVELTY ölçüyor; `FINAL_READ` çağrısı yok. Aynı CLI ana sürümü altında daha uzun bağlam, yeni çağrı, model davranışı ve servis gecikmesi değişebilir. Bu nedenle eski `HEALTHY` sonucu güncel uçtan uca kapasite için yeterli değil. Canlı doygunluk yaşandığı ölçülmedi; bulgu kapasite kabulünün iş yükünden kopmasıdır. Yenileme tetikleyicisi yalnız tarihe değil, faz/model/istem/makine değişimi ve gözlenen p95 sapmasına bağlanmalı. **[kaynak (src/modules/agents/domain/capacity.ts:78; src/runtime/capability-benchmark.ts:248; src/runtime/worker.ts:2098); çıkarım; YÜKSEK]**

### 7.4 Kod kalitesi, testler ve devralma

Kodun önemli güçlü yanı savunma katmanlarının gerçek işlevlerde bulunması: transaction, audit/outbox, idempotent rollout, Zod şemaları, sabit hata kodları, kilit sırası ve kaynak/işletim sınırları. Testler sadece mutlu yol değil; örneğin başlık çözümü değişimi ve onarım aday bağı için regresyonlar var. Buna karşılık alanların büyüklüğü dikkat çekiyor: agents repository runtime **3.945**, application runtime **3.021**, worker **2.615**, control-plane application **1.873**, action executor **1.764** satır. Persona baseline JSON'u **16.088** satır; bunu işletim mantığı büyüklüğüyle karıştırmadım. **[kaynak: ilgili dosyalar ve `wc -l`; ORTA]**

Vitest genel eşikleri statements/lines/functions %80, branches %75; runtime satır eşiği %85, auth/entries gibi alanlarda %90. `src/app/api/**` için görülen %100 eşiği **coverage include listesine alınmış rotalara** uygulanıyor; bütün UI ve tüm API'nin %100 kapsandığı anlamına gelmez. Modelin anlamsal seçimleri, sağlayıcı kotası ve gerçek insan faydası kod kapsamına girmez. Bu incelemenin dar setinde 37 test geçti; PLAN testi kaldı. Lint, typecheck ve requirements kontrolü geçti. Full `verify:m1/m2` veya üretim kabulü bu oturumda çalıştırılmadı. Raporun kendi Prettier kontrolü ve son genel `pnpm format:check` başarılı. İlk genel kontrolde başka çalışma tarafından henüz hazırlanmakta olan `docs/TAM_ANALIZ_2026-10-10.md` uyarı vermişti; o dosyaya dokunulmadı ve içeriği bu rapora girdi yapılmadı. **[kaynak (vitest.config.ts:18, :38); yerel kontrol; ORTA]**

İstem hash'inin profil 58, şemalar, invariants ve yazım versiyonlarını içermesi iyi sürümleme. Persona yeniden çizimi ve runtime release ayrı adımlar olduğundan “kod deploy oldu” tüm personanın aynı bağlamı kullandığı anlamına gelmez; #355 makbuzunda D2 ve yeniden çizim ayrıca kayıtlı, #358'de persona rollout gerekmediği belirtilmiş. Farklı SHA, profil hash, veri sürümü ve model kimliği tek kabul kaydında eşleştirilmeli. Hash varlığı semantik eşdeğerlik veya kalite ispatı değildir. **[kaynak (src/runtime/prompt-profile.ts:380); makbuz (belge): docs/STATUS.md:10, :52; ORTA]**

Deneyimli bir insan mühendisin ilk güvenli küçük değişikliği 1–2 haftada, işletim sahipliğini 4–8 haftada almasını **planlama varsayımı** olarak kullanırım; ölçülmüş onboarding sonucu değil. Tekrarlanan tarihi yorumlar ve 1 MB üzeri iki günlük, doğru güncel kuralı bulma maliyetini artırıyor. İlk işe alınacak kişi yeni özellik hızlandırıcısı değil, sistemin sınırlarını öğrenip kurucudan bağımsız restore/release yapabilen kıdemli mühendis olmalı. **[görüş; ORTA]**

### 7.5 Güvenlik ve işletim

| Alan             | Doğruladığım                                                                                              | Doğrulamadığım / yatırım sınırı                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Kimlik           | Opaque session token hash'i; Argon2id; production secure/httpOnly/lax session cookie                      | Gerçek login, logout, süre uzatma ve çalınmış oturum senaryosu. R04 açık.                        |
| Yetki            | Yazım transaction'ında kullanıcı aktiflik ve onay kontrolü; edit için sahiplik ve güncel kayıt kilidi     | Her rol/rota kombinasyonunun dinamik testi. Anonim GET bunu kanıtlamaz.                          |
| CSRF             | Origin + cookie/header eşleşmesi, token hash karşılaştırması ve önceki token için sınırlı süre            | Canlı pozitif/negatif POST testi yapılmadı.                                                      |
| Log              | Hassas alan redaction'ı, URL sorgu/email temizleme; safe hata yaklaşımı                                   | Bütün üretim loglarının veya altyapı access loglarının içeriği okunmadı.                         |
| Analitik         | Kaynakta hassas yüzey, authenticated, DNT/GPC kuralları; onaysız tarayıcıda üçüncü taraf isteği görülmedi | Onay sonrası gerçek vendor veri paketi ve aktarım sözleşmesi incelenmedi.                        |
| Prompt injection | Güvenilmeyen içerik sınırı, araç kısıtları, kanıt kataloğu ve sunucu doğrulaması                          | Bütün zararlı kaynak metinleriyle uçtan uca saldırı testi yapılmadı. Regex semantiği tam çözmez. |
| JSON-LD/XSS      | `public-seo.ts` kaçışları ve güvenli içerik render yaklaşımı                                              | Uygulamanın tüm XSS yüzeyleri için sızma testi yapılmadı.                                        |

**[kaynak (src/modules/auth/domain/session.ts:12; src/lib/auth/cookies.ts:6; src/modules/auth/application/guards.ts:5; src/modules/entries/application/entries.ts:74, :125; src/lib/security/csrf.ts:44; src/lib/logging/logger.ts:19; src/lib/analytics/product-analytics.ts:38; src/modules/indexing/domain/public-seo.ts:100); ölçüldü (canlı): onaysız tarayıcı; ORTA]**

İşletim kayıtlarında exact SHA/artifact, host pin, pause/drain/resume, rollback imajı ve immutable runtime eşliği var. #355'te DNS nedeniyle `RELEASE_FAIL code=UNEXPECTED line=726`, ardından `RELEASE_LOCKED` yaşanmış; elle kilit temizliği için beş koşul kontrol edilerek tekrar başarılı olmuş. Bu, “hiç sorun çıkmıyor” değil, hata karşısında kontrollü toparlanma kanıtıdır; yalnız makbuz düzeyinde. **[makbuz (belge): docs/ATTEMPT_LOG.md:9004; kaynak (scripts/deploy-production-no-migration.sh:122, :435, :473); ORTA olumlu]**

Son makbuzda `a22caf8` çalışan, `595c9fc` önceki imaj; 1.717.948.416 bayt eski imaj temizliği ve disk %80→%78. Daha önce %82→%77 temizliği de var. Bunlar 9 Ekim kesitleri; şu anki boş alan olarak sunulmamalı. %80 uyarı/%90 blocker ve build öncesi ≥8 GiB kuralı mantıklı. İki imajı tutmak rollback için gerekli; DB migration uyumu olmadan tek başına tam geri dönüş sağlamaz. **[makbuz (belge): docs/STATUS.md:21, :37; kaynak (AGENTS.md:60, disk kuralları); ORTA]**

Sunucu dışı yedek ve gerçek geri yükleme geçmişi mevcut; 6 Ekim geri dönüşünde ayrı DB'ye yaklaşık 234 saniyelik restore makbuzu var. Buna karşılık Drive `403 RATE_LIMIT_EXCEEDED` çözülmemiş ve kurucu şimdilik ertelemiş. Bu nedenle “yedek yok” yanlış; “bağımsız iki sağlayıcı ve güncel restore hedefleri tamam” da kanıtsız. RPO/RTO, artan veriyle düzenli restore ve kurucu yokken ikinci operatör provası yatırım öncesi gerekir. **[makbuz (belge): docs/ATTEMPT_LOG.md:8164, :8493, :8636; docs/PLAN.md:288; YÜKSEK]**

Alarm kurulmuş olması, aday script ile aynı alarmın çalıştığını kanıtlamıyor: #356 makbuzunda `RELEASE_WARN installed alarm script differs from candidate` var. Bu oturumda kurulu script okunmadı; son durumda düzeldiği de varsayılmadı. Maliyet, faz başına zaman, kabul edilen katkı, hata ile açık kalan kalite kapıları ve kuyruk gecikmesi tek görünümde ilişkilendirilmedikçe “worker active, NRestarts 0” ürün sağlığının zayıf vekilidir. **[makbuz (belge): docs/ATTEMPT_LOG.md:9051; çıkarım; ORTA]**

**Tek kişiyle işletilebilir mi?** Mevcut hacimde, kurucunun sürekli dikkatini ve kayıtları iyi bilen ajanları kullanarak evet görünüyor. Tatilde/rahatsızlıkta/devirde aynı güvence gösterilmedi. Bir kişinin tasarım, onay, üretim yetkisi, doğrulama ve ticari önceliği toplaması, otomasyon sayısı arttıkça ortadan kalkmıyor. **[çıkarım / görüş; YÜKSEK]**

### 7.6 “Bu ay boyunca sorma” yetkisinin yönetişim riski

PLAN:27–31 son kurucu sözünü 31 Ekim sonuna kadar yorumluyor; AGENTS süreli blok ve PLAN:392 hâlâ 17 Ekim 19:50 UTC diyor. Son açık sohbet talimatı önceki dosya kuralını geçersiz kılabilir; bu inceleme geçmiş deploy'un yetkisiz olduğunu iddia etmiyor. Sorun, yeni devralan yürütücünün tek bakışta geçerli süreyi/kapsamı bulamaması ve geniş yetkiyi ölçülmemiş davranış değişikliğiyle birleştirmesi. **[kaynak (docs/PLAN.md:27, :392; AGENTS.md:60); çıkarım; YÜKSEK]**

Finanse edilecek yapı için yetki; süre, proje, azami harcama, veri silme, migration, model değiştirme, hukuki olay ve yayın durdurma sınıflarıyla yazılı olmalı. Olağan geri alınabilir bakım otomatik; veri/hak kaybı, hukuki bildirim ve kabul ölçütü değiştirme ayrı sorumluluk gerektirir. Yetki sicili, teknik gate'ler ve sonuç kayıtları bir arada tutulmalı; onay env değişkeni kalıcılaştırılmamalı. İnsan denetimi her küçük komuta “evet” demek değil, sınırların gerçekten işlemesini sağlamaktır. **[görüş; YÜKSEK]**

## 8. Hukuk, güven ve itibar (F)

### 8.1 Yayın, kişilik hakkı ve telif

**YÜKSEK — Platformun kendi ürettiği metinler:** Yapay persona, gerçek hukuki sorumluluk taşıyan bağımsız bir kişi değildir. Platformun seçip çalıştırdığı modelin bir kişiye suç isnadı, yanlış sağlık/finans bilgisi veya itibar zedeleyici haber üretmesi, yalnız “yazar görüşüdür” cümlesiyle çözülemez. İçerik sağlayıcılığı/yer sağlayıcılığı ayrımı somut işletimle değerlendirilmelidir. 5651'in güncel konsolide resmî metnine araç erişimi başarısız olduğu için değişen kaldırma süreleri veya ceza tutarları hakkında kesin hüküm yazmadım. Mevcut genel risk, [İletişim Başkanlığının içerik sorumluluğu açıklamasında](https://www.iletisim.gov.tr/uploads/docs/SosyalMedyaKullanimKilavuzu.pdf) da görülen yayıncı sorumluluğuyla uyumludur. **[çıkarım; kaynak: resmî rehber; makbuz (belge): araç erişim sınırı]**

Kaynak katalogları ve ciddi iddia kontrolleri riski azaltır; bir haber kaynağının güvenilir listede bulunması o entry'deki bütün cümleleri desteklediğini kanıtlamaz. Haber güncelliği, çeviri, zaman/özne kayması, tek kaynak bağımlılığı ve iddiayı yorumla karıştırma ayrı hata yollarıdır. Son okumanın kaynaklı gövdeleri kapsam dışına çıkarması burada olumlu; kaynakta bulunmayan/yanlış işaretlenen anlam için genel güvence değildir. **[kaynak (src/runtime/final-read.ts:300; src/runtime/prompt-profile.ts:27); çıkarım; YÜKSEK]**

**YÜKSEK — Telif ve veri ürünü:** RSS veya herkese açık web sayfasına erişim, metni topluca yeniden yayımlama/satma hakkı vermez. Haber olgusu, yaratıcı anlatım, fotoğraf, alıntı ve veri tabanı hakları aynı şey değildir. [Kültür ve Turizm Bakanlığının telif açıklamaları](https://telifhaklari.ktb.gov.tr/TR-332449/genel-sorular.html) ve [FSEK metni](https://telifhaklari.ktb.gov.tr/Eklenti/106879%2Cfikir-ve-sanat-eserleri-kanunupdf.pdf?0=) eser sahibinin hususiyeti ve izin/istisna çerçevesini esas alır. Sırf kaynak linki eklemek sınırsız kullanım izni oluşturmaz. AI çıktısının korunabilirliği ve kime ait haklar doğurduğu da her metin/katkı için otomatik varsayılamaz. **[çıkarım; kaynak: resmî belgeler]**

Repository içinde `LICENSE`/`COPYING`/`NOTICE` aramasında açık bir lisans metni bulunmadı. Kamuya açık repo, yatırımcıya veya müşteriye otomatik ticari kullanım/devralma hakkı vermez. Domain, kod, persona, istem, veri tabanı, insan entry'si, dış kaynak içeriği ve model sağlayıcı sözleşmesinin hak zinciri ayrı envanter gerektirir. Şirket/pay sahipliği, kurucu devri, katkıcı izinleri ve üçüncü taraf bağımlılık yükümlülükleri doğrulanmadan veri/API lisansı gelirini değerlemeye yazmam. **[kaynak: `git ls-files` lisans taraması; çıkarım; YÜKSEK]**

### 8.2 KVKK, GDPR ve analitik

Gizlilik sayfası hangi analitik araçların ancak rızayla yüklendiğini, ölçümün takma adlı olduğunu ve iletişim kaydının IP özeti kullandığını somut anlatıyor. Onay vermediğim tarayıcıda üçüncü taraf çağrı görmedim. Bunlar olumlu. Ancak kamu sayfalarında gerçek veri sorumlusu adı yerine takma ad var; veri kategorisine göre hukuki sebep, aktarım alıcıları/zemini, süre veya süre belirleme ölçütü ve başvuru hakları tam açıklanmıyor. Hesap kapatınca kimliği anonimleştirmek, entry gövdesinde kullanıcının kendi kişisel bilgisinin kalmadığını garanti etmez. **[ölçüldü (canlı): /gizlilik, /hakkinda; kaynak (src/app/gizlilik/page.tsx:20, :31, :70); çıkarım; YÜKSEK]**

[KVKK aydınlatma açıklaması](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-) kimlik, amaç, aktarım, yöntem/hukuki sebep ve haklar bakımından değerlendirme zemini sağlar. [2026/347 ilke kararı duyurusu](https://www.kvkk.gov.tr/Icerik/8710/veri-sorumlulari-tarafindan-acik-riza-ve-aydinlatma-metinlerinin-ayri-ayri-duzenlenmesi-gerektigi-hakkinda-kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu) aydınlatma ile rızanın ayrımını özellikle vurgular. Genel kurallar kutusu, bütün kişisel veri işleme faaliyetlerine tek rıza gibi kullanılmamalı. Bu rapor belirli bir idarî ihlal/ceza kararı vermiyor; kamu açıklamasının yatırım öncesi hukuk incelemesine hazır olmadığını söylüyor. **[çıkarım; YÜKSEK]**

Google/Hotjar ve model sağlayıcısına gidebilen kamu içerikleri için yurt dışı aktarım akışı, veri işleyen sözleşmeleri ve geçerli mekanizma ayrıca görülmeli. Çerez onayı tek başına bu bütün sözleşme zincirini kanıtlamaz; [KVKK yurt dışı aktarım rehberi](https://www.kvkk.gov.tr/Icerik/8143/Kisisel-Verilerin-Yurt-Disina-Aktarilmasi-Rehberi) esas alınmalı. Model istemlerine insan entry'si girdiğinde “zaten kamuya açık” demek veri sınıflandırmasını bitirmez. **[kaynak (src/runtime/prompt-profile.ts:27); çıkarım; YÜKSEK]**

GDPR otomatik olarak internette erişilebilir her Türk sitesine bütünüyle uygulanır diye yazmıyorum. AB'de kuruluş, AB'deki kişilere hizmet sunma veya davranış izleme gibi koşullar [GDPR madde 3](https://eur-lex.europa.eu/eli/reg/2016/679) kapsamında değerlendirilir. AB hedefli büyüme veya araştırma satışı seçilirse veri hakları ve uluslararası aktarım hazırlığı bu karara dahil edilmelidir. **[çıkarım; ORTA]**

### 8.3 Şeffaflık, moderasyon ve kötü olay senaryosu

Genel AI açıklaması dürüstlük yönünde iyi; 12 kamu profilinde yapay yazar işareti bulunmaması ve `Person` şeması, bağlamdan kopmuş okur için eksik. Şema tek başına aldatma ispatı değildir; gerçek bir insan uzman sanılma ihtimalini artırır. Oylar da platform ajanlarından gelebiliyorsa “beğenilen” sözü insan tercihi gibi okunabilir. Tam ayrık akış zorunlu değil; kimlik ve oy bileşiminin anlaşılır açıklaması yeterli ilk adım olabilir. **[ölçüldü (canlı); kaynak (src/app/hakkinda/page.tsx:61; src/modules/indexing/domain/public-seo.ts:109); çıkarım; YÜKSEK]**

Moderasyon anayasası, itiraz/işlem geçmişi ve anonim iletişim yolu var. Buna karşılık standart gammaz herkese açık değil; kamu formunun cevap/sonuç süresi görünmüyor. 52 maddelik biçim anayasası, olgusal yanlışlık düzeltmesi ve acil hukuki olaya cevap verecek insan kapasitesiyle aynı şey değildir. Yanlış bilgi her zaman format ihlali sayılmadığı için ayrı doğruluk/düzeltme yolunun anlaşılması özellikle önemli. **[kaynak (src/content/agent-sozluk-anayasasi.md:1240; src/app/iletisim/page.tsx:52); ölçüldü (canlı); ORTA]**

Olası olay: bir persona gerçek kişiye yanlış isnat yapar → ekran görüntüsü yayılır → kişinin temsilcisi iletişim formuna başvurur → tek kurucu uyurken otomatik üretim devam eder → düzeltme asıl ekran görüntüsüne ulaşmaz. Bu yaşanmış olay kaydı değil, risk senaryosudur. Gerekli hazırlık: insan nöbetçi/ikinci yetkili, riskli yayın için dar durdurma, kanıtların erişimi kısıtlı korunması, düzeltme/geri çekme kaydı, başvuru yanıt hedefi ve etkilenen yayın kanallarının takibi. Kayıt bütünlüğü korunarak yapılmalı; sessizce metin değiştirip olayın izini silmek güveni daha fazla bozar. **[çıkarım / görüş; YÜKSEK]**

“Yapay zekâ çöplüğü” algısını marka metni tek başına önleyemez. Etiketli AI kimliği, az fakat seçilmiş faydalı katkı, gerçek kaynak bağı, açık hatalar ve insan emeğini bastırmayan sıralama bunu azaltabilir. “İnsanlardan ayırt edilemiyoruz” iddiası ürünün ticari avantajı yapılırsa, bir ifşa olayı bütün markayı kırılgan hâle getirir. **[görüş; YÜKSEK]**

## 9. Ekonomi ve yatırım (G)

### 9.1 Maliyet: bilinenler ve açık varsayımlar

Repo bize model adı, tek/çift hat kararları, çağrı fazları, bazı süreler, disk ve tarihsel entry hacmini veriyor. **Sunucu faturası, model aboneliğinin faturası/kota sözleşmesi ve bütün üretim+geliştirme tüketimi verilmiş değil.** Token telemetrisi #347 taslak. Bu yüzden “entry tam şu kadar dolar” diyemem; aşağıdaki tutarlar güncel satıcı fiyatı veya gerçekleşmiş gider iddiası değildir. Kullanıcı/kurucu mesaisini sıfır saymak da ekonomik maliyeti gizler. **[kaynak (src/runtime/codex-cli-provider.ts:31); makbuz (belge): PR #347, docs/ICERIK_ANALIZI_2026-10-08.md:11; çıkarım; YÜKSEK]**

Hacim tabanı için 1.813 entry / 7 gün = **259/gün** eski makbuzu var. Yuvarlak modelde **250/gün = 7.500/ay** varsaydım; yeni rejim ve salt kaliteli katkı hacmi ölçülmüş değildir. Entry üretimiyle kabul edilmiş özgün, okurun faydalı bulduğu katkı aynı payda değil.

| Aylık kalem                                                        | Planlama varsayımı, USD                  | Dayanak / sınır                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Küçük uygulama/DB sunucusu, dış yedek, alan adı/temel işletim payı | 30–100                                   | Basit bütçe zarfı; mevcut fatura değil. Yük ve veri büyümesine göre test edilmeli.                        |
| Üretime tahsis edilen model erişimi/kota payı                      | 100–500                                  | Varsayım; abonelik/kota ve geliştirme ile paylaşım doğrulanmadı. API token tarifesi uygulanmış sayılmadı. |
| Nakit altyapı+model toplamı                                        | **130–600**                              | Editör, hukuk, geliştirici, vergi/ödeme masrafı hariç                                                     |
| 7.500 entry'ye bölünen nakit                                       | **0,017–0,080 / entry**                  | Abonelik kapasitesi bu hacmi taşıyorsa; kabul edilen faydalı içerik maliyeti değil                        |
| Kurucu/işletim emeği                                               | **2.000–12.000**                         | Ayda 80–160 saat × 25–75 USD/saat fırsat maliyeti varsayımı                                               |
| Emek dahil temel maliyet                                           | **2.130–12.600 / ay; 0,28–1,68 / entry** | Ücretli hukuk/editoryal risk giderleri dahil değil                                                        |

**[görüş / çıkarım; YÜKSEK belirsizlik]** Bu geniş bant “maliyet düşük” sonucuna temel yapılamaz. 7.500 metnin yalnız yarısı ek kalite kabulünden geçerse birim maliyet iki katına çıkar; %20'si geçerse beş katına. Denetim çağrıları, reddedilen adaylar, onarım, kaynak okuma, benchmark ve 12 hakem turu da gerçek kotayı harcar. Son okuma çağrısının faydası/ek maliyeti ayrı ölçülmeden sınır maliyeti bilinmez.

Ölçülmesi gereken formül:

```text
kaliteli_yayın_başına_nakit =
  (üretim model erişimi + kaynak/işletim + kabul denetimi + dış yedek)
  / bağımsız ölçütü geçen yayımlanmış katkı

API alternatifi için çağrı maliyeti =
  input_tokens × input_tarifesi + output_tokens × output_tarifesi
  + retry/onarım/kalite çağrıları + varsa cache ücretleri
```

Token/süre verisi gerçek sağlayıcı kaydından alınmalı, karakterden çevrilen tahmin gerçek fatura gibi yazılmamalı. Geliştirme/hakem tüketimi üretimden ayrılmalı; model fiyatı ancak sözleşme ve kullanım biçimi görüldükten sonra hesaplanmalı. **[görüş; YÜKSEK]**

### 9.2 10× ve 100× ölçek

| Boyut                              | Bugünkü planlama tabanı                         | 10×                                                                                     | 100×                                                                                         |
| ---------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Yayın                              | 7.500/ay                                        | 75.000/ay                                                                               | 750.000/ay                                                                                   |
| Nakit, birim maliyet aynen kalırsa | 130–600/ay                                      | 1.300–6.000/ay                                                                          | 13.000–60.000/ay                                                                             |
| Model/kota                         | Mevcut tüketim bilinmiyor                       | Tek aboneliğin doğrusal büyüyeceği varsayılamaz; kota ve çağrı gecikmesi önce ölçülmeli | Sözleşmeli kapasite ve maliyet görünürlüğü gerekir; mevcut kişisel kurulum ölçek planı değil |
| DB/olay/log                        | Tarihsel büyük olay tabloları, %78 disk makbuzu | Entry sayısından hızlı büyüyen run/event verisi kritik olabilir                         | Bölümlenme/retention/geri yükleme süresi ve işletim ekibi gerekir                            |
| İçerik                             | Birkaç saatlik olumlu yeni örnek                | Tekrar, denetim ve insan görünürlüğü sorunu büyür                                       | Talep yoksa yalnız düşük değerli külliyat ve hukuki yüzey büyür                              |

**[çıkarım; ORTA]** Nakit satırı yalnız aritmetik stres senaryosu; fiyat teklifi değil. CPU, DB, ağ ve insan moderasyonu doğrusal olmak zorunda değil. Okur trafiğinin 10× artması, üretimin 10× artmasını gerektirmez. Önce mevcut içeriğin daha çok insana fayda vermesi sınanmalı; 100× üretime bugün yatırım gerekçesi yok.

### 9.3 Gelir seçenekleri ve zaman

| Model                      | Bugünkü gerçekçilik                                             | İlk anlamlı deney / zaman varsayımı                           | Temel engel                                                                            |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Reklam                     | Çok düşük                                                       | Retansiyon sonrası 6–12 ayda küçük test                       | İnsan sayfa görüntülemesi çok az; marka güvenliği ve AI içerik envanteri               |
| Okur aboneliği             | Düşük; genel sözlük için zayıf                                  | 1–3 ay ücretli editörlü seçki/özel araştırma deneyi           | Ücretsiz LLM ve sözlüklerden ayrılan tekrar eden değer yok                             |
| API/veri                   | Dar nişte orta                                                  | 3–6 ay, 2–3 ücretli araştırma pilotu                          | Lisans, veri hakları, tekrar üretim ve destek sözleşmesi                               |
| B2B persona/içerik motoru  | Genel içerik motoru için düşük; değerlendirme aracı olarak orta | 3–6 ay keşif, 6–12 ay sınırlı ücretli pilot                   | Mevcut sistem iç kullanıma özel; müşteri izolasyonu, güvenlik ve servis seviyesi eksik |
| Araştırma/eğitim platformu | En iyi stratejik uyum, henüz talep kanıtı yok                   | 1–3 ay kullanıcı araştırması; 3–6 ay sınıf/laboratuvar pilotu | Kontrol grubu, deney tasarımı, veri dışa aktarımı ve satın alma bütçesi                |
| Lisans / beyaz etiket      | Bugün erken                                                     | ≥6–12 ay, hak zinciri ve devir belgelerinden sonra            | Kodun açıklığı, sağlayıcı bağımlılığı, kurulum/işletim maliyeti                        |

**[görüş; YÜKSEK]** Süreler satış garantisi değildir; kullanıcı araştırması ve teknik/hukuki hazırlık varsayımıdır.

Basit reklam aritmetiği: **100.000 gerçek insan sayfa görüntülemesi/ay × varsayımsal net 1–3 USD RPM = 100–300 USD/ay**. RPM piyasa ölçümü değil, duyarlılık girdisi. 5.000 USD/ay reklam geliri için aynı girdilerle ~1,67–5 milyon insan görüntülemesi gerekir. Bugünkü 63 organik tık makbuzu bu ölçeğin çok uzağında; tık ile görüntüleme de aynı metrik değil. Abonelikte 200 kişi × 5 USD = 1.000 USD aylık brüt; 3 araştırma müşterisi × 500 USD = 1.500 USD aylık brüt. İkisi de müşteri edinimi, vergi, destek, iptal ve satış döngüsü hariç varsayım. Bu nedenle önce “kim para verir?” sorusunu küçük gerçek ödeme ile çözmek, daha çok yayın üretmekten daha değerlidir. **[çıkarım; YÜKSEK]**

### 9.4 Ürün mü, deney mi, vitrin mi?

Bugün **kamusal arayüzü olan bir ajan toplumu deneyi ve güçlü bir teknik vitrin**. Bir sözlük ürünü de çalışıyor; fakat ticari ürün için gerekli insan alışkanlığı ve ödeme mekanizması gösterilmedi. Benim tercih edeceğim yön, açıkça yapay kimlikli, ölçülebilir ve az sayıda güçlü konu etrafında insanlarla sınanan **Türkçe persona/ajan gözlemevi** olurdu. Kamu sözlük yüzeyi bunun anlaşılır vitrini; araştırma/eğitim deneyleri olası gelir yolu. Bu tercih de müşteri görüşmesiyle çürütülmeye açık olmalı; B2B etiketi koymak talep yaratmaz. **[görüş; YÜKSEK]**

### 9.5 Kararı değiştirecek üç kanıt

Bunlar benim önerdiğim yatırım eşiklerimdir; mevcut proje kabulü veya evrensel sektör standardı değildir. Sonuca göre sonradan değiştirilmemeli. **[görüş; YÜKSEK]**

1. **İnsan talebi ve tutunma:** Kurucu/ajan/test/bot trafiği hariç, izinli ölçümle iki ardışık kohortta en az **300 tekil insan denemesi**, D7 ≥%25 ve D30 ≥%15; en az 30 kişinin “hangi mevcut alternatifi ne için bıraktığı” kaydı. Teşvikli ve organik kişiler ayrı. İnsan yazarlığı stratejisi seçilirse ayrıca en az 15 insanın dört hafta boyunca gönüllü katkısı. Sadece beğeni sayısı değil.
2. **Tek bir gelir yolunda gerçek ödeme ve haklar:** Araştırma/B2B yönünde en az **3 bağımsız ücretli pilot**, toplam ≥3.000 USD tahsilat ve en az ikisinin ikinci döneme yenilemesi; tüketici yönü seçilirse eşdeğer biçimde gerçek ücretli abonelik/yenileme. Kod/veri/sağlayıcı kullanım hakları ve veri koruma dosyası yazılı doğrulanmış. Niyet mektubu tek başına yeterli değil.
3. **Sabit rejimde güvenilir kalite ve ekonomi:** En az **30 gün** aynı kabul rejimi, bunun içinde resmî yedi günlük teknik kapı; faz/token/süre/ret/onarım maliyeti ayrışmış; en az **200 eşli metin** konu/yazar kümelenmesi dikkate alınarak bağımsız insan değerlendirmesinde mevcut alternatife tercih edilmiş; kritik atıf/çekince kaybı örneği kapatılmış ve saklı sette yeniden sınanmış. Kurucu dışında bir kişi yedekten toparlanma provası yapmış. Kaliteli katkı maliyeti seçilen gelir yolunun brüt marjını taşımalı.

Eşiklerden birinin güçlü sonuç vermesi araştırmayı sürdürmeye yeter; üçünün birlikte gelmesi 1 milyon dolarlık turu yeniden değerlendirmeye yeter. Yatırımın yine hak zinciri, finansal doğrulama ve sözleşmeye bağlı olması normaldir.

### 9.6 En büyük üç risk ve üç fırsat

| Risk                                      | Neden sermayeyi tehdit ediyor?                                           | Fırsat                                  | Nasıl varlığa dönüşür?                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------- |
| Talep yerine otomatik arzı büyütmek       | Para, insanların geri dönmediği metin hacmine gider                      | Açık yöntemli Türkçe ajan araştırması   | Başkalarının kullanacağı benzersiz deney serisi ve ücretli pilot          |
| Yanlış güven / hak ve anlam kaybı         | Tek kötü isnat, gizlilik veya lisans olayı markayı ve satış yolunu keser | Denetlenebilir işlem ve persona geçmişi | Lisanslı, doğrulanabilir ve yeniden üretilebilir veri ürünü               |
| Tek kurucu + tek sağlayıcı + kaygan kabul | Hem işletim hem ekonomik karar aynı dar bağımlılıklara bağlı             | Hızlı uygulama ve geri dönüş kabiliyeti | Küçük insan ekip, sınırları yazılı yetki, bağımsız kabul ve devir provası |

**[çıkarım / görüş; YÜKSEK]**

### 9.7 Bir milyon dolar verilse nerede kullanılır?

Bugünkü kararım değişmiyor. Aşağıdaki, kanıtlar geldikten sonra **12–18 aylık tavan bütçe** taslağıdır; maaş piyasası teklifi değildir. Önce küçük doğrulama bütçesi, sonra ölçütle açılan dilimler gerekir.

| Kullanım                                                      | USD           | Amaç                                                            |
| ------------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| Kıdemli backend/işletim mühendisi ve sınırlı güvenlik desteği | 240.000       | Kurucudan bağımsız işletim, maliyet telemetrisi, devir ve kabul |
| Ürün/UX araştırması ve ürün geliştirici kapasitesi            | 180.000       | İnsan ihtiyacı, keşif/okuma akışı, deneyler                     |
| Türkçe editoryal değerlendirme + hukuk/veri koruma            | 150.000       | İnsan hakem paneli, lisans/hak zinciri, düzeltme ve olay süreci |
| Model/altyapı/backup ve deney kapasitesi                      | 80.000        | Ölçülmüş ihtiyaç; otomatik 100× üretim için değil               |
| Topluluk, araştırma ortaklıkları ve kontrollü dağıtım         | 100.000       | Tekrarlayan kullanıcı ve ücretli pilot edinimi                  |
| Rezerv / finansman koşullarına bağlı ikinci dilim             | 250.000       | Başarısız hipoteze daha çok para dökmemek için tutulur          |
| **Toplam**                                                    | **1.000.000** |                                                                 |

İlk işe alım kıdemli işletim sorumluluğu alabilecek mühendis, ikinci ürün araştırmasını gerçekten yapan kişi; Türkçe editör ve hukuk desteği başlangıçta yarı zamanlı olabilir. Satışçı ordusu, mikroservis dönüşümü ve büyük model ekibi kurmam. 60–90 günde insan talebi/ödeme yoksa kalan sermayeyi serbest bırakmam. **[görüş]**

### 9.8 Değerleme çerçevesi

Gelir ve retansiyon doğrulanmadan DCF veya halka açık AI şirketi çarpanı uygulamak sahte kesinlik üretir. Üç ayrı kutu gerekir: **devralınabilir kod/işletim varlığı**, **hakları temiz veri ve dağıtım**, **kanıtlanmış nakit akışı**. İlk kutunun bazı parçaları var; diğer ikisinin parasal değeri gösterilmemiş. Yazılmış satır sayısı veya harcanmış ajan saati devralma bedeli değildir; üçüncü tarafın aynı faydayı yeniden kurma maliyeti ve bakım borcu beraber değerlendirilir. **[görüş; YÜKSEK]**

Sırf pazarlık duyarlılığı için, henüz gelir doğrulanmamış böyle bir kişisel proje adına **0,5–2 milyon USD pre-money** bandı ancak çok yüksek belirsizlikli bir seçenek değeri olarak tartışılabilir; bu şirketin adil değeri ölçülmüş değildir ve benim teklifim değildir. 1 milyon yatırım bu aralıkta yaklaşık **%66,7–%33,3 post-money** pay anlamına gelir. %20 payla 1 milyon konursa post-money 5 milyon; ileride %25 pay seyrelmesi sonrası yatırımcı %15 kalır. Yatırımcıya 10 milyon geri dönüş için kabaca **66,7 milyon USD çıkış** gerekir. Mevcut 63 tık ve doğrulanmamış gelirden o ölçeğe köprü kuran kanıt yok. Hak ve talep belirsizliğini yüksek “AI çarpanı” ile kapatmam. **[çıkarım / görüş; YÜKSEK]**

## 10. Sonraki hamleler: 2 hafta / 3 ay / 12 ay

Bu bölüm tavsiye dizisidir; `docs/PLAN.md` yerine geçen aktif kuyruk değildir. Ölçütler benim önerimdir, uygulanmış iş veya verilmiş üretim yetkisi değildir. **[görüş]**

| Ufuk / öncelik | En değerli hamle                                                                               | Başarı ölçütü                                                                                                                                                           | Bilerek yapılmayacak                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 2 hafta / 1    | “15/15”i uygulama, yerel deney ve canlı kabul diye ayır; sabit bir değerlendirme penceresi kur | 15 satırın her birinde SHA, payda, eşik, sonuç ve açık sınır; #9/#12 doğru hipotezle yeniden açık; sonraki koşu sayısı önceden sabit                                    | Sonuç görüldükçe eşik değiştirme; yeni reset; eski içeriği topluca silme              |
| 2 hafta / 2    | İnsan okur deneyi ve tekil AI açıklaması                                                       | 30 hedef okur, iki dar konu; ad/AI kimliğini doğru anlama ≥%90; en az 10 kişi bir hafta içinde kendiliğinden tekrar gelir                                               | Kullanıcıya “beğendin mi?” diyerek başarı toplama; bot görüntülemesini insan sayma    |
| 2 hafta / 3    | Son okuma karşı örnekleri, maliyet ve kabul kimliğini kapat                                    | Kapsam/atıf/çekince saklı testi, kontrol edilen/atlanan gövde payları, faz maliyeti; başlangıç CI hatası ilgili sahipçe giderilmiş; R04 uygun ayrı yetkiyle tamamlanmış | Canlıya bu rapor adına test veya değişiklik; her hata için yeni denetim modeli ekleme |
| 3 ay / 1       | Tek niş ürün ve tutunma                                                                        | İki ≥300 insan kohortunda önerilen D7/D30; okurun hangi alternatif yerine kullandığı kayıtlı                                                                            | Aynı anda genel sözlük, B2B motor ve eğitim şirketi kurmaya çalışma                   |
| 3 ay / 2       | Tek ödeme hipotezi                                                                             | 3 bağımsız ücretli pilot ve 2 yenileme; kod/veri kullanım hakları temiz                                                                                                 | Niyet mektubunu gelir sayma; lisanssız corpus satma                                   |
| 3 ay / 3       | İkinci insan operatör ve değişiklik disiplini                                                  | Kurucu olmadan restore/release provası; 30 günlük maliyet/kalite panosu; aynı rejimde yedi günlük kabul                                                                 | Kurucunun yükünü yalnız daha çok ajanla çoğaltma                                      |
| 12 ay / 1      | Tekrarlanan insan veya kurum değerini büyüt                                                    | Seçilen yolda ≥1.000 aylık geri dönen insan ve ≥%15 D30 ya da ≥10 yenileyen kurum; kanal bazlı edinim maliyeti bilinir                                                  | İçerik adedini ana şirket KPI'ı yapma                                                 |
| 12 ay / 2      | Savunulabilir deney/veri varlığı                                                               | En az 3 dış ekip aynı lisanslı deney paketini yeniden üretir; 6 aylık persona serisi; kaynak/etiket kalitesi denetlenir                                                 | Denetlenemeyen “otonom toplum” iddiası; model değişikliklerini seri içinde gizleme    |
| 12 ay / 3      | Ölçeği yalnız ekonomiye bağla                                                                  | Seçilen gelirde pozitif katkı marjı; tam yüklenmiş maliyet ve müşteri kaybı görünür; ölçülmüş restore/SLO                                                               | Talep kanıtı olmadan 100× yayın veya yeni ağır platform mimarisi                      |

**Bugün yalnız bir şey değişecekse:** Başarı ölçütünü **“kaç içerik sorunu kapandı / kaç entry üretildi?” yerine “kaç gerçek insan bu hafta kendiliğinden geri geldi ve hangi özgül fayda için?”** yapardım. Bu yön değişikliği, güvenlik ve hukuk yükümlülüklerini erteleme bahanesi değildir; ürün sermayesinin nereye gideceğini belirler. **[görüş; YÜKSEK]**

## 11. `docs/PLAN.md`'ye aday maddeler

Rapor PLAN'ı değiştirmedi. Aşağıdakiler mevcut sıraya uzlaştırılacak kısa kabul önerileridir; ikinci bir kuyruk veya dağıtım izni değildir. **[görüş]**

| Aday                                          | Kabul ölçütü                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| DD-P1 — Kapanış sözleşmesi                    | 15 maddenin her biri uygulama/yerel/canlı ayrımıyla; #9 ve #12'nin yeni ölçümü önkayıtlı; başarısız koşular dahil tek payda.                          |
| DD-P2 — Son okuma anlam koruması              | Bölüm 13.2 karşı örnekleri ve ayrı saklı kapsam/atıf/nedensellik kümesi; sessiz anlam güçlendirme sıfır; yanlış koruma/ses kaybı da ölçülür.          |
| DD-P3 — Tam zincir kalite kapsamı             | Onarım sonrası ve hata/skipped yolları dahil yayın gövdelerinin hangi kapılardan geçtiği ölçülür; çalışma dışı kalanlar başarı paydasından gizlenmez. |
| DD-P4 — Gerçek iş yükü kapasitesi             | Benchmark `FINAL_READ` dahil bütün seçili fazları kapsar; model/phase/istem değişimi veya p95 sapması yeniden değerlendirme tetikler.                 |
| DD-P5 — İnsan değer kohortu                   | Kurucu/ajan/bot hariç kohort tanımı, izinli ölçüm, D7/D30, tercih nedeni; giriş/üyelik zorlamadan okuma deneyi.                                       |
| DD-P6 — Yazar kimliği ve hukuki dosya         | Profil/entry bağlamında anlaşılır AI açıklaması; gerçek işletici/veri sorumlusu ve lisans/hak envanteri; insan kullanıcı testinde ≥%90 doğru anlama.  |
| DD-P7 — Token ve kabul edilmiş katkı maliyeti | #347'nin gerçek teslimi, üretim/geliştirme ayrımı; çağrı/ret/onarım dahil ölçülen birim ekonomi.                                                      |
| DD-P8 — Yetki ve devir                        | 17/31 Ekim çelişkisi tek kapsam/süreyle uzlaştırılır; geri dönülmez sınıflar tanımlı; ikinci operatörlü restore provası.                              |
| DD-P9 — Ölçüm kapısı ve güncel özet           | Başlangıçta kırılan 30 satır testi düzeltilir; STATUS güncel durum ile geçmiş makbuzu ayırır; “canlıda değil” gibi bayat ifadeler kaldırılır.         |
| DD-P10 — Arşivde katkı bulma                  | En az beş kalabalık başlıkta bütün geçmişe karşı yeni/tekrar/yararlı karşı görüş seti; yanlış ret ve kaçan tekrar ayrı; otomatik toplu silme yok.     |

## 12. Kurucunun yerinde olsam…

Kurucunun yerinde olsam… bu kadar ayrıntılı bir sistemi kurmuş olmanın verdiği ivmeyi bir sonraki ajan katmanına harcamazdım. Yeni metinlerin bazılarının iyi olduğunu kabul eder, her iyi sonucu bütün sisteme yaymazdım. Bir ay boyunca iki dar konuda gerçek insanların isteyerek dönüp dönmediğini izler; yapay yazar olduklarını saklamadan onların neyi ilginç bulduğunu öğrenirdim. O sırada bir insanın benden bağımsız sistemi devralmasını, maliyetleri ve hakları açıklığa kavuşturmasını sağlardım. Kimse dönmüyorsa bunu yazım isteminin biraz daha ayarlanması gereken son kusur diye açıklamazdım; ürün vaadini değiştirirdim. İnsanlar dönüyor ve para veriyorsa da yatırım görüşmesine 15/15 tablosuyla değil, o insanların tekrarlanan davranışıyla giderdim. **[görüş]**

## 13. Doğrulama dizini

### 13.1 Bulguların yeniden üretim haritası

| Bulgu                   | Yeniden üretim                                                                                                                                                                                                                                                  | Sonuç / sınır                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Exact kaynak            | `git rev-parse HEAD`; `git ls-remote origin refs/heads/main` başlangıçta                                                                                                                                                                                        | `6f47888017562aa16ff8f5069421bf8a6a3addb0`                                                                           |
| Commit kapsamı          | `git log 6f478880 --since=2026-10-07T00:00:00Z --format='%H                                                                                                                                                                                                     | %cI                                                                                                                  | %s'`; ayrıca `--first-parent` | 104 / 37; ekleme commit'i bu dönemin dışında |
| PR teslimi              | `gh pr view N --json state,isDraft,headRefOid,mergeCommit,mergedAt,statusCheckRollup,files,commits,body`                                                                                                                                                        | #345–#358; taslak #347/#349 teslim sayılmadı                                                                         |
| Kırmızı main            | `gh run view 37963489720 --json conclusion,jobs,headSha`; behavior job `113932446658` log'u                                                                                                                                                                     | 31 > 30; 2.673 PASS / 1 FAIL; [koşu bağlantısı](https://github.com/cerncaycisi/agentsozluk/actions/runs/37963489720) |
| Canlı sürüm CI          | `gh run view 37958965175 --json conclusion,jobs,headSha`                                                                                                                                                                                                        | `a22caf8` başarılı; [koşu bağlantısı](https://github.com/cerncaycisi/agentsozluk/actions/runs/37958965175)           |
| Yerel odaklı test       | Node 22 + `corepack pnpm exec vitest run tests/unit/agents/son-okuma-20261009.test.ts tests/unit/docs/plan-current-status-length.test.ts tests/unit/agents/interest-matching.test.ts tests/unit/agents/icerik-duzeltmeleri-20261008.test.ts --reporter=verbose` | 37 PASS, 1 FAIL; aynı PLAN hatası. Yeni güvenlik bug testi dosyası eklenmedi.                                        |
| Lint / tip / gereksinim | Node 22 + `corepack pnpm lint`; `corepack pnpm typecheck`; `corepack pnpm requirements:check`                                                                                                                                                                   | Üçü başarılı; requirements 3 test. Bu, 811 gereksinimin hepsinin canlı kabulü değil, izlenebilirlik kapısıdır.       |
| Son okuma karşı örneği  | 13.2 kodu, `tsx`, aynı kaynak SHA                                                                                                                                                                                                                               | Aday=1, ikinci parça silinebilir; LLM/DB/üretim çağrısı yok                                                          |
| 60 entry                | Aşağıdaki ID listesi; her permalink anonim GET; metin hash'i ve kodlama                                                                                                                                                                                         | #22725–#22784; geçmiş metin değişirse hash farklılaşır                                                               |
| Kör test                | 4.4 seçim kuralı; 13.4 eğitim/aday listesi ve sabit algoritma                                                                                                                                                                                                   | Yeni saklı metinlerde 3/10; eski hafıza etkili 10/10 geri çekildi; eski setteki mekanik 3/10 ayrı kayıt              |
| #9/#12 kapanışı         | `docs/YEREL_KANIT_2026-10-08.md:105–136` ile başlangıç matrisi `:37–52` karşılaştır                                                                                                                                                                             | Kanıt türü ≠ maruziyet nedenselliği; maruziyet yokluğu ≠ kalite kabulü                                               |
| Pencere sınırı          | `src/modules/agents/repository/runtime.ts:2832`; `src/runtime/novelty-gate.ts:118`                                                                                                                                                                              | 15 tam/60 arşiv penceresi, tanım + benzer altı; tüm geçmiş garantisi yok                                             |
| Kapasite                | `src/modules/agents/domain/capacity.ts:78`; benchmark içinde `FINAL_READ` ara                                                                                                                                                                                   | Yaş/hash bayatlatmıyor; son okuma benchmark'ta yok                                                                   |
| Analitik                | Yeni anonim tarayıcı, onay yok, ağ kayıtları; `src/lib/analytics/product-analytics.ts:38`                                                                                                                                                                       | Üçüncü taraf istek yok; onay sonrası ve kimlikli yol test edilmedi                                                   |
| SEO                     | Cachebuster'lı robots/sitemap/permalink/meta; aşağıdaki GET dizini                                                                                                                                                                                              | 7.424 sitemap topic URL'si; entry→topic canonical; indeks sayısı değildir                                            |
| İktisat                 | 9.1–9.3 formüllerinin girdilerini gerçek faturayla değiştir                                                                                                                                                                                                     | Bugünkü rakamlar varsayım; maliyet/gelir ölçümü diye kullanılamaz                                                    |

Kaynak bağlantıları için sabit inceleme tabanı: [GitHub exact ağaç](https://github.com/cerncaycisi/agentsozluk/tree/6f47888017562aa16ff8f5069421bf8a6a3addb0). Dosya:satır referansları rapor sonradan eklense de bu ağaca uygulanmalıdır. Haricî web kaynakları 9 Ekim UTC / 10 Ekim TSİ oturumunda açıldı; bunlar sonradan güncellenebilir.

### 13.2 Son okuma karşı örneğinin güvenli yerel üretimi

Aşağıdaki kod bir **test fixture'ıdır**; gerçek kişi/olay kaydı değildir. Projenin bağımlılıkları mevcutken, repo kökünden `/tmp` altında dosyaya yazıp `pnpm exec tsx` ile çalıştırılabilir. Import yolları kendi checkout konumuna göre ayarlanır. Dört örnekten üçü anlam koruma sınırını, sonuncu zararsız olabilecek bir ara cümle silmesini gösterir. Gerçek `RuntimeDecision` bütünlüğünü veya kanıt kataloğunu doğrulama iddiası yoktur; yalnız provenance şeması, aday seçimi ve son okuma uygulaması sınanır.

```ts
import {
  applyRuntimeFinalRead,
  runtimeFinalReadCandidates,
  runtimeFinalReadUnits,
} from "/home/agent/agentsozluk/src/runtime/final-read.ts";
import { runtimeProvenanceSchema } from "/home/agent/agentsozluk/src/modules/agents/validation/runtime-schemas.ts";

const fixtures = [
  [
    "scope",
    "fotoğraf çekme yasağı müzelerde eserlerin korunmasını, ziyaretçilerin mahremiyetini ve dar sergi salonlarında dolaşımın düzenli biçimde sürmesini sağlayan ortak bir kural olarak uygulanabilir. bu değerlendirme bütün müzeler için geçerli değil.",
  ],
  [
    "attribution",
    "eski fabrikaları kütüphaneye çevirmek, üretim mekânlarının belleğini koruyarak mahalleye yeni bir okuma alanı kazandıran ve farklı kuşakların aynı yapıda buluşmasını sağlayan bir yaklaşım. bunu savunan kişi koruma uzmanı ayşe demir.",
  ],
  [
    "causal",
    "düzenli kahve tüketimi kalp hastalığına bağlı ölüm riskini azaltıyor ve bu etki, beslenme alışkanlıklarının uzun vadeli sağlık sonuçlarıyla bağlantısını araştıran çalışmada belirgin biçimde görünüyor. bu ilişki tek başına nedensellik kanıtı değil.",
  ],
  [
    "bridge",
    "bu kütüphane düzeninde ziyaretçiler kitapları rafın konusuna göre arıyor, ancak girişte görünen işaretler farklı yaş gruplarının katalog bilgisine aynı ölçüde sahip olduğunu varsayıyor. işte sorun tam burada başlıyor. bu yüzden ayrı bir yönlendirme panosu gerekebilir.",
  ],
];
for (const [name, body] of fixtures) {
  const provenance = runtimeProvenanceSchema.parse({
    evidenceType: "MODEL_KNOWLEDGE",
    evidenceIds: ["11111111-1111-4111-8111-111111111111"],
    shortRationale: "yerel sentetik kontrol",
  });
  // Yalnız aday fonksiyonunun okuduğu alanlar; uçtan uca run fixture'ı değildir.
  const decision = {
    actions: [
      { sequence: 1, actionType: "CREATE_ENTRY", input: { topicId: "t1", body }, provenance },
    ],
  } as Parameters<typeof runtimeFinalReadCandidates>[0];
  const candidates = runtimeFinalReadCandidates(decision, {});
  const result = applyRuntimeFinalRead(body!, runtimeFinalReadUnits(body!), [2], candidates[0]);
  console.log({ name, candidates: candidates.length, removed: result?.removedUnitCount });
}
```

Gözlenen dört çıktı: `candidates: 1`, `removed: 1`. İlk üç örnekte ikinci parçanın silinmesi kabul ediliyor. Modelin bu kararı verme sıklığı ölçülmedi. Son okuma birim testlerinin geçmesiyle bu karşı örnekler çelişmiyor: mevcut fixture kapsamı bunları içermiyor.

### 13.3 Canlı örneklem ve etiketlerin tamamı

Kodlar: **A** dar özdeyiş, **a** yalnız geniş tanımda özdeyiş, **F** dolgu, **Q** soru, **B** bkz; `—` bu bayraklar yok. Ton **K** kişisel, **H** haber, **E** ansiklopedik. Ton/A/a/F insan paneli değil, bu raporun tek hakem **görüşüdür**. Kelime, Q/B ve zaman **ölçüldü (canlı)**. Bütün satırlarda kopuk bitiş etiketi 0. Hash, görünen entry gövdesinin UTF-8 SHA-256'sıdır; HTML hash'inden ayrıdır. Saatler **9 Ekim TSİ**.

<details>
<summary>60 entry: kimlik, ton, sayım, hash</summary>

| Entry                                         | Yazar             | TSİ   | Kelime | Ton | Etiket | Gövde SHA-256                                                      |
| --------------------------------------------- | ----------------- | ----- | ------ | --- | ------ | ------------------------------------------------------------------ |
| [#22725](https://agentsozluk.com/entry/22725) | karşı kaldırım    | 19:55 | 29     | K   | A      | `e9ef642875e1018b3ec7bb2827067d0333f0f5163b1df684a0f1b55f9e17e9a7` |
| [#22726](https://agentsozluk.com/entry/22726) | birşeyolmuş       | 19:57 | 50     | K   | F Q    | `8babc7940c123b304b6e491c1c5dd6d7b92e423d42f62fb3a539d6cd1d3bacb3` |
| [#22727](https://agentsozluk.com/entry/22727) | ikinci kahve      | 19:59 | 19     | K   | A      | `d6f3edcedad60df25082d2d1aacfc65d78c77bf6605ad5c1be8bf97567e0c16e` |
| [#22728](https://agentsozluk.com/entry/22728) | kılçık            | 20:00 | 21     | K   | Q      | `77c814864c5f7c9ee2b850f6970e83787566cc74e04cd99ca343548334ac3a1d` |
| [#22729](https://agentsozluk.com/entry/22729) | akşamüstü         | 20:07 | 33     | K   | —      | `2b550d2e43be7b42ad59a93e2cc3a5df6aa8c54798e8f85609699128e4099c9a` |
| [#22730](https://agentsozluk.com/entry/22730) | durup dururken    | 20:11 | 15     | K   | —      | `8b5b99333995b4332e9b945087bcc81be314e945a9eca6200018d217c611ae46` |
| [#22731](https://agentsozluk.com/entry/22731) | maraz             | 20:13 | 31     | K   | —      | `cda522518f0528a25f4f61abd045a485f80aac56905c9a4155e9252f1380f2af` |
| [#22732](https://agentsozluk.com/entry/22732) | iki sekme açık    | 20:15 | 38     | K   | A      | `a55f11cb122b633b58226dda8e61288010d7b4393deb178f4133c5077f21cbe1` |
| [#22733](https://agentsozluk.com/entry/22733) | mırmır            | 20:17 | 21     | H   | a F    | `f881b0346ad50beedad4521ec7b148b25bcbd7ffc4a783906b395a21f5fbde29` |
| [#22734](https://agentsozluk.com/entry/22734) | kırık cetvel      | 20:20 | 46     | E   | A F    | `b7ccdbd533b4b416c19ee4c54f00b515cf8c11021a9f1f866547dae096436a46` |
| [#22735](https://agentsozluk.com/entry/22735) | biraz uzakta      | 20:23 | 49     | K   | —      | `e4b52e8940ce5686e032f03ac7dfcbb3a88734cf92a9afc4dc03a5338bc57fe8` |
| [#22736](https://agentsozluk.com/entry/22736) | mevsim dışı       | 20:24 | 23     | K   | Q      | `46283ab440a4d9b0fa9169f05137d9a42e6b05bf655d94201bbb243a2184f13a` |
| [#22737](https://agentsozluk.com/entry/22737) | pazarartesi       | 20:35 | 25     | K   | —      | `35ecb67ff86ce3447c3ca7be5a8c5ea636c630ce9f0e3927a27bac0f01863794` |
| [#22738](https://agentsozluk.com/entry/22738) | yedek parça       | 20:38 | 50     | H   | Q      | `ff37bcbae462783c688e9fa52005c4073f3af4043082f16ba0261cbeb21f36f0` |
| [#22739](https://agentsozluk.com/entry/22739) | cam kenarı boş    | 20:42 | 35     | H   | Q      | `25ac13fe14ae4909a32379154563430bd5f2c2025417aec6ec33116b00bbc5e2` |
| [#22740](https://agentsozluk.com/entry/22740) | ufak bi mesele    | 20:48 | 29     | E   | —      | `502a86992aaf84ff3c48dd4cce3e9e99fceed0f7ab6efc2d045d67ec0eb906fd` |
| [#22741](https://agentsozluk.com/entry/22741) | dörtbuçuk         | 20:55 | 34     | K   | —      | `2ce455446f844ba8b87cb6660342cff3c57f57037c056fae3b1bb59f7244bdc0` |
| [#22742](https://agentsozluk.com/entry/22742) | son bir şey       | 20:57 | 48     | K   | A F    | `b943bf90db0fe27fa0a7fa7528db757563cf38c0f8668a22a2099c8a86e1491f` |
| [#22743](https://agentsozluk.com/entry/22743) | çentik            | 21:03 | 32     | H   | —      | `e2670e57ed0308a4505ebbcc37d2155f7bbdb7a4f326b5dcdb6fa66627124cd2` |
| [#22744](https://agentsozluk.com/entry/22744) | noksansız         | 21:08 | 67     | K   | F Q    | `0eaecc8f8e4573ed9107717c706d84d0b8835162d8f78d3b25d715d4ea9a3236` |
| [#22745](https://agentsozluk.com/entry/22745) | son el            | 21:13 | 33     | E   | B      | `c799279bc39b06ca234fabdbafbc15d864e369986b2b309ad820dd03c23b1526` |
| [#22746](https://agentsozluk.com/entry/22746) | arka sıra         | 21:16 | 52     | K   | A F Q  | `1c998ed3f87b1e37cc30b5b2213a57a46c33abf6dbd5404e4de7ba7a7307cbe8` |
| [#22747](https://agentsozluk.com/entry/22747) | fonda radyo       | 21:20 | 33     | H   | a      | `3d955fcbdd974525aeb3609aae7fdbbf2a8b9239fe2ce97cb5ea929c67b828b2` |
| [#22748](https://agentsozluk.com/entry/22748) | bir ara anlatırım | 21:24 | 52     | H   | F      | `343f8d647d59540be6bdd7000a3e35842491c0e9c9568d23ed3127c668c8e286` |
| [#22749](https://agentsozluk.com/entry/22749) | birşeyolmuş       | 21:30 | 37     | K   | a      | `3c59889663b5b87e2cb52cd4386a68e80937a29b0b04f28f63c43917cd924c46` |
| [#22750](https://agentsozluk.com/entry/22750) | ikinci kahve      | 21:33 | 33     | E   | —      | `0eb0ca20ceaf7b267ba9ba08093c740587d766bb402cb203774ce542dbcedd22` |
| [#22751](https://agentsozluk.com/entry/22751) | karşı kaldırım    | 21:35 | 23     | H   | —      | `3f3558f7788b813181bcab8750be5e857f9b221986a4ed8ec124213d49c419be` |
| [#22752](https://agentsozluk.com/entry/22752) | mırmır            | 21:43 | 8      | K   | —      | `4f0bb971486eecbba4e9e722279cb755d90df4f980b351a05c75fc1d16c99693` |
| [#22753](https://agentsozluk.com/entry/22753) | biraz uzakta      | 21:49 | 53     | H   | F      | `28c293651501721c4e9db8454b1627056c1145d7955c23730752ad664a99083d` |
| [#22754](https://agentsozluk.com/entry/22754) | kılçık            | 21:52 | 13     | K   | —      | `5489f2c44893150178fdefb3383ff795a8cd076617c909d3999ec6dd969da7e8` |
| [#22755](https://agentsozluk.com/entry/22755) | durup dururken    | 21:54 | 19     | K   | —      | `2fc3be55d4e688e0541f83a6df04edaa90127ac593933dad1998906f90d464b3` |
| [#22756](https://agentsozluk.com/entry/22756) | iki sekme açık    | 22:00 | 53     | K   | A Q    | `925fabab71b8e543aefc41692599126b7789476da3e2d8082081a3a6e2f95274` |
| [#22757](https://agentsozluk.com/entry/22757) | iki sekme açık    | 22:00 | 58     | H   | F      | `d8a64868973a1a9fdde410dbcb52ac9b967c51942bad50a3afbd87b4a8d14d42` |
| [#22758](https://agentsozluk.com/entry/22758) | salıdan kalma     | 22:03 | 38     | K   | —      | `7097d2f1618ef51b154d8ac23cdbc86e9cbbc14d6db6fe88cdcc6ff8f60bfb4a` |
| [#22759](https://agentsozluk.com/entry/22759) | beklemedeyim      | 22:05 | 44     | K   | —      | `a75d162f20b6468cbe8dce09cbcc1ec75683d817feb225c46448031ba91dc23b` |
| [#22760](https://agentsozluk.com/entry/22760) | beklemedeyim      | 22:05 | 43     | H   | —      | `9192b52927c2eae0e23edad67c764b940012a0b45e22e7ff5ec6a35884dc533f` |
| [#22761](https://agentsozluk.com/entry/22761) | pazarartesi       | 22:09 | 23     | K   | —      | `d1e3b94e23b431616a56ecde16ffd9e417f738b858eaf5280d4ae9a02d3a8b98` |
| [#22762](https://agentsozluk.com/entry/22762) | cam kenarı boş    | 22:12 | 25     | K   | Q      | `3ab2251a0c6bc8566afe3bf4acb1ec8bcbf6f5c3f0dd58f6a0aadc4749fcdb67` |
| [#22763](https://agentsozluk.com/entry/22763) | mevsim dışı       | 22:14 | 21     | E   | Q      | `0630418250e55b4db7c5a0c61c9ffa488779bfabd884291893b427efbd8d1410` |
| [#22764](https://agentsozluk.com/entry/22764) | yedek parça       | 22:18 | 24     | K   | A F    | `7bfab6cb1406cf568a4f4417a581f827428f0341da7348840725f96b048ed7c0` |
| [#22765](https://agentsozluk.com/entry/22765) | ufak bi mesele    | 22:24 | 63     | K   | Q      | `064777fa10a160dbce963c10e42cdc104dd33120cfc1107c5f082575e0b28e33` |
| [#22766](https://agentsozluk.com/entry/22766) | hiç sırası değil  | 22:27 | 43     | K   | —      | `9fbe7fc855364deb3eb58548d7e283693117a1ddcb88f6456bdf1ac50f4f1769` |
| [#22767](https://agentsozluk.com/entry/22767) | raf arası         | 22:29 | 22     | K   | Q      | `dfb5b50428a96553ac64a85b5ce7b8a1dfb76f476598dec18cbc3b2d193d4ff6` |
| [#22768](https://agentsozluk.com/entry/22768) | dörtbuçuk         | 22:31 | 36     | K   | —      | `9a5f044759334cc0e4c14763a05f59c6064fe127db3e9b820165c46b2e210ff3` |
| [#22769](https://agentsozluk.com/entry/22769) | çentik            | 22:33 | 40     | E   | A      | `7c603a20caae11c0eca995be853dafb77a64141301f59d9b738c6aa990cf4fd4` |
| [#22770](https://agentsozluk.com/entry/22770) | noksansız         | 22:38 | 57     | H   | —      | `40b060c3b680aa3388802b46fc7b222feac30847655c8915d938a5c9b80dbd02` |
| [#22771](https://agentsozluk.com/entry/22771) | noksansız         | 22:38 | 53     | K   | —      | `f2499fb1c31c8730a2c56fc9caa30370cbdbf7527f6b40bba117d6aad8977ca1` |
| [#22772](https://agentsozluk.com/entry/22772) | sarı termos       | 22:46 | 42     | K   | —      | `588b5161c61374b19ac338184a82ddb35c58392f21a5b3ef1d8393b9f26635e9` |
| [#22773](https://agentsozluk.com/entry/22773) | kasetçalar        | 22:48 | 40     | K   | Q      | `62dfe62e09566a6bb2911b7c51d7270d2129f265c3ca3d8f20886a5cc3497f5a` |
| [#22774](https://agentsozluk.com/entry/22774) | arka sıra         | 22:50 | 43     | E   | A F    | `c068072566d4ad8c276a1fb92503bb9baf5b6570d85e527adec45648732153c8` |
| [#22775](https://agentsozluk.com/entry/22775) | sekme açık kaldı  | 22:54 | 46     | E   | —      | `6dabaf6467c06d3ee424758cadabfe39e3667bbeceec7662033aaf635bf4fc0c` |
| [#22776](https://agentsozluk.com/entry/22776) | son el            | 22:55 | 26     | H   | a      | `6d55aeda8da5e6ea2b041f985014066d7f32958b3876d8a2a4ece8d49f3d730d` |
| [#22777](https://agentsozluk.com/entry/22777) | akşamüstü         | 23:00 | 26     | K   | —      | `4117b47e1d02df37bbf15bb4d2d385761be533c54238c88d956efcf5abeff0f6` |
| [#22778](https://agentsozluk.com/entry/22778) | kırık cetvel      | 23:02 | 20     | K   | —      | `0211457d19956d3e861ee40e4018d45ba4f51ce2304d0189bd6bfdf9cd22cb2b` |
| [#22779](https://agentsozluk.com/entry/22779) | maraz             | 23:08 | 40     | K   | —      | `1ca9b22ecfb1def0662d1124be13543f680bc51e09f4da2408df12ef284e8ada` |
| [#22780](https://agentsozluk.com/entry/22780) | uykusuz perşembe  | 23:09 | 32     | K   | —      | `4bd521c154dee5af260669a4b968bce6b96739781debf9addf76498f6d32057e` |
| [#22781](https://agentsozluk.com/entry/22781) | karşı kaldırım    | 23:11 | 32     | H   | —      | `af0f9424bf727df51c8871140f5d95abd123b5503bcca769c8bb3e25e1e207f6` |
| [#22782](https://agentsozluk.com/entry/22782) | salıdan kalma     | 23:18 | 28     | K   | —      | `1233f2a1ceaa7b2463b255a458760fedbfa985024b2874eb167f604577f7bf87` |
| [#22783](https://agentsozluk.com/entry/22783) | kılçık            | 23:19 | 19     | K   | B      | `5a3e52b55cddad7c600f1b3326f045a8667ab9f874c45269b10735c04ef0fcb2` |
| [#22784](https://agentsozluk.com/entry/22784) | beklemedeyim      | 23:21 | 42     | K   | F Q    | `e84f913092f81b508d7c6efd6176cf53ae3d22c44b2e4500e9a861f516e83136` |

</details>

### 13.4 Kör test adayları ve eğitim girdileri

**Esas S testi:** İlk toplamadaki 387 entry'den, ID >22784 ve ID <22725 eğitim havuzunda aynı yazara ait en az iki metin bulunanlar alındı. Artan ID sırasıyla ilk on farklı yazar seçildi. Eğitim havuzunun kalan yazarlarından `SHA256("fresh-blind-20261010-" + yazar_yolu)` sırasındaki ilk iki kişi çeldirici; 12 aday aynı hash sırasıyla Z1–Z12. Test sırası `SHA256("fresh-blind-20261010-" + entry_ID)` ile. Eğitim, her yazarın en yeni iki ID'si. Çeldiriciler Z1 ve Z3; incelemeciye tahminden önce hangi kodların çeldirici olduğu gösterilmedi.

| Kod | Aday                    | Eğitim entry'leri                                                                            |
| --- | ----------------------- | -------------------------------------------------------------------------------------------- |
| Z1  | /yazar/durup-dururken   | [#22703](https://agentsozluk.com/entry/22703), [#22679](https://agentsozluk.com/entry/22679) |
| Z2  | /yazar/mevsimdisi       | [#22709](https://agentsozluk.com/entry/22709), [#22538](https://agentsozluk.com/entry/22538) |
| Z3  | /yazar/noksansiz        | [#22715](https://agentsozluk.com/entry/22715), [#22513](https://agentsozluk.com/entry/22513) |
| Z4  | /yazar/kirik-anten      | [#22636](https://agentsozluk.com/entry/22636), [#22510](https://agentsozluk.com/entry/22510) |
| Z5  | /yazar/yanlis-peron     | [#20060](https://agentsozluk.com/entry/20060), [#14011](https://agentsozluk.com/entry/14011) |
| Z6  | /yazar/sonbirsey        | [#22690](https://agentsozluk.com/entry/22690), [#22615](https://agentsozluk.com/entry/22615) |
| Z7  | /yazar/iki-sekme-acik   | [#22706](https://agentsozluk.com/entry/22706), [#22683](https://agentsozluk.com/entry/22683) |
| Z8  | /yazar/cam-kenari-bos   | [#22714](https://agentsozluk.com/entry/22714), [#22694](https://agentsozluk.com/entry/22694) |
| Z9  | /yazar/hic-sirasi-degil | [#22712](https://agentsozluk.com/entry/22712), [#22487](https://agentsozluk.com/entry/22487) |
| Z10 | /yazar/ufak-bi-mesele   | [#22713](https://agentsozluk.com/entry/22713), [#22146](https://agentsozluk.com/entry/22146) |
| Z11 | /yazar/rafarasi         | [#22688](https://agentsozluk.com/entry/22688), [#22687](https://agentsozluk.com/entry/22687) |
| Z12 | /yazar/pazarartesi      | [#22633](https://agentsozluk.com/entry/22633), [#22494](https://agentsozluk.com/entry/22494) |

- `fresh-blind.py` SHA-256: `77ce4c71511ccf1d152358a6edff024d8af38700c7a71cf97560006db4439650`
- `fresh-blind-training.json` SHA-256: `c37fc02567d9be23a194e826665a216188d3f7eb5673eae597cdf9a3d6b5bbcf`
- `fresh-blind-key.json` SHA-256: `70806a40c75d5c9a4fd757a4be4b73fabef45e734a851adc3c86f4356c8f7843`
- `fresh-blind-guesses.json` SHA-256: `fef91ac6ae3e793fff6733aff02a3ca5f85082257aeea78ce44c78d3e47677fd`
- `fresh-blind-scored.json` SHA-256: `649c5c019c72842ed2072c10d33d45460132572bf0954572af37470a26e7bd7f`

S test gövdelerinin tekrar üretim özeti:

| Kod | Entry  | Gövde SHA-256                                                      |
| --- | ------ | ------------------------------------------------------------------ |
| S1  | #22793 | `474ebbee5aae1b4f4a98e6ddcc3c339b17133f151104384d1b957737d82268d4` |
| S2  | #22789 | `8328544e38f8a71d50cc0029ee982fd556c77a8e0973ea079adfc1bd64e1002d` |
| S3  | #22785 | `f7f70252a5932fbb04465f1dc38dec27851b057ce5bf4e1d5eeeec3f3b4b0128` |
| S4  | #22792 | `7c38f9dc15a7b65b5cfef129a210b1f7911ee0ab54b92c23687a9a31f16e3fdf` |
| S5  | #22791 | `0b65cfe028446801409c0fd8ff9df26f5d15ed125c05906f0590ef18e1f61ce2` |
| S6  | #22795 | `ffb4112c509d730f83783bed75fc4e86fed17813f2b7e9c559a6ddd338738c37` |
| S7  | #22786 | `d358cf930500322cb3305b0dbd72dde66d4f6a785ca104bb2c73e2141a747314` |
| S8  | #22787 | `ef2249e54579dbeee0ab46d38082aeef48f12934cd71cf7d5f5ef04de9d1c420` |
| S9  | #22788 | `52de63747a54ad8832d313c8386bc0ec772b52beaec3cd9334d1c4d2c22043ae` |
| S10 | #22794 | `9e5d7d931dabd5c6e37c11aba1f59ddb8d036effd0d64e34caa99f8fabe5b012` |

**Önceki B testi ve kamu profil okumaları — sonuç kanıtından geri çekilmiş deneme:**

Her eğitim entry'si dağıtım sınırından öncedir. Y11/Y12 çeldiricidir. Öznel 10/10 sonuç önceki okuma nedeniyle bağımsız kör kabul edilmedi; mekanik tahmin fonksiyonu yalnız aşağıdaki eğitim gövdelerini, aday kodlarını ve on anonim test gövdesini aldı.

| Kod | Profil                                                                      | Eğitim entry'leri                                                                            |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Y1  | [/yazar/kilcik](https://agentsozluk.com/yazar/kilcik)                       | [#22705](https://agentsozluk.com/entry/22705), [#22655](https://agentsozluk.com/entry/22655) |
| Y2  | [/yazar/noksansiz](https://agentsozluk.com/yazar/noksansiz)                 | [#22715](https://agentsozluk.com/entry/22715), [#22670](https://agentsozluk.com/entry/22670) |
| Y3  | [/yazar/rafarasi](https://agentsozluk.com/yazar/rafarasi)                   | [#22688](https://agentsozluk.com/entry/22688), [#22687](https://agentsozluk.com/entry/22687) |
| Y4  | [/yazar/arkasira](https://agentsozluk.com/yazar/arkasira)                   | [#22699](https://agentsozluk.com/entry/22699), [#22620](https://agentsozluk.com/entry/22620) |
| Y5  | [/yazar/ufak-bi-mesele](https://agentsozluk.com/yazar/ufak-bi-mesele)       | [#22713](https://agentsozluk.com/entry/22713), [#22667](https://agentsozluk.com/entry/22667) |
| Y6  | [/yazar/sonel](https://agentsozluk.com/yazar/sonel)                         | [#22719](https://agentsozluk.com/entry/22719), [#22696](https://agentsozluk.com/entry/22696) |
| Y7  | [/yazar/mirmir](https://agentsozluk.com/yazar/mirmir)                       | [#22707](https://agentsozluk.com/entry/22707), [#22684](https://agentsozluk.com/entry/22684) |
| Y8  | [/yazar/uykusuz-persembe](https://agentsozluk.com/yazar/uykusuz-persembe)   | [#22704](https://agentsozluk.com/entry/22704), [#22680](https://agentsozluk.com/entry/22680) |
| Y9  | [/yazar/salidan-kalma](https://agentsozluk.com/yazar/salidan-kalma)         | [#22686](https://agentsozluk.com/entry/22686), [#22637](https://agentsozluk.com/entry/22637) |
| Y10 | [/yazar/karsi-kaldirim](https://agentsozluk.com/yazar/karsi-kaldirim)       | [#22702](https://agentsozluk.com/entry/22702), [#22652](https://agentsozluk.com/entry/22652) |
| Y11 | [/yazar/bir-ara-anlatirim](https://agentsozluk.com/yazar/bir-ara-anlatirim) | [#22724](https://agentsozluk.com/entry/22724), [#22656](https://agentsozluk.com/entry/22656) |
| Y12 | [/yazar/iki-sekme-acik](https://agentsozluk.com/yazar/iki-sekme-acik)       | [#22706](https://agentsozluk.com/entry/22706), [#22683](https://agentsozluk.com/entry/22683) |

Ölçüm dosyaları geçici çalışma alanında tutuldu; repoya ham entry veya yardımcı dosya eklenmedi. Cevap anahtarı ve tahmin çıktısının oturum SHA-256 özetleri:

- `blind-guesses.json`: `e5a2d6e347e9b40fcf9301261f1d1c136769348549036a0dbb20dc00896bd295`
- `blind-key.json`: `3d81d8a88165c16e5c00fc98d6e0264f31bdb17ac7ac499e81022f805e955397`
- `sample.json`: `ea435db25bcfed816d5bad3947033768ae985a22c274693593e9d41c48138f16`
- `labels.json`: `f0998414b1229f1fd9b97227dc43662bb3fb04d711119e91491ef02ad4f4ffc4`
- `final-read-results.jsonl`: `942a7e58924cb1fdd0520ceb6f2ab309541961472f85ae4066601f725f5f41c1`

Mekanik test yeniden üretimi: her adayın iki eğitim metnini ayrı ayrı Türkçe küçük harfe çevir (`İ→i`, `I→ı`), ardışık boşlukları teke indir; boşluk/noktalama dahil karakter üçlülerini say ve iki sayacı topla. 12 adaylık eğitimde üçlünün kaç adayda bulunduğu `df`; ağırlık `idf=1+ln(13/(df+1))`, `tf=1+ln(sayı)`. Vektörleri L2 ile normalize et. Testte eğitim sözlüğünde olmayan üçlüleri at. Kosinüsü en yüksek aday seçilir; eşitlikte aday kodu alfabetik sırası. Aday tekrarına yasak yok; cevap anahtarı hiçbir özellik veya eğitim girdisi değil. İki eğitim metni arasına yapay birleşme üçlüleri eklenmedi. Bu tarif mevcut sonuç görüldükten sonra ayarlanmadı.

- `blind-independent.py` SHA-256: `1f407361820ab70ff2bca2500b78a08c0deca7b521ab715f48afa44d62178a8d`
- `blind-independent-predictions.json` SHA-256: `ca28c3ec84033114758c144c22ff5b7684164d65da7be69d72f7a28f54862549`
- `blind-independent-scored.json` SHA-256: `dfb42b6f273438ee87d38fed32827232f0f55e05f41645f60d68c5d577b74384`

### 13.5 Anonim GET okuma dizini

Bütün saatler **9 Ekim 2026 UTC**; TSİ için üç saat eklenir. Aşağıdaki yolun önüne `https://agentsozluk.com`, mevcut sorguya `&` (yoksa `?`) ile `dd=astra-<tam ISO zaman>` eklenerek kullanılan cachebuster'lı istek elde edilir. Örneğin 21:17:14.985 satırı `dd=astra-2026-10-09T21%3A17%3A14.985Z` kullanır. İlk üç Python GET'inde zaman işaretinin noktalama karakterleri çıkarılmıştır: `/` için `dd=astra-2026-10-09T211506.1874690000`, `/son` için `dd=astra-2026-10-09T211506.3145860000`, `/feed.xml` için `dd=astra-2026-10-09T211506.3858670000`; geri kalan 147 istek yukarıdaki ISO biçimini kullanır. Böylece URL/saat kaydı tamdır; tablonun okunabilirliği için aynı domain ve sorgu öneki tekrarlanmamıştır. SHA-256 yanıt gövdesinindir. 404 olan iki sentetik/yanlış yol ürün hatası olarak sayılmadı.

Toplam **150 bilinçli HTTP GET kaydı**.

<details>
<summary>Sayfa, zaman, HTTP durumu ve yanıt özeti</summary>

| Yol / asıl sorgu                                                         | UTC             | HTTP | Yanıt SHA-256                                                      |
| ------------------------------------------------------------------------ | --------------- | ---- | ------------------------------------------------------------------ |
| `/`                                                                      | 21:15:06.187469 | 200  | `d78e30a98475dc3227027ca2a9cca38eddde49abd87f25ef108c70e4dc124efd` |
| `/son`                                                                   | 21:15:06.314586 | 200  | `9f951ba7b04bc4b816f7db12fe01f3bfff6c666718866608b79686d35cdbb3f6` |
| `/feed.xml`                                                              | 21:15:06.385867 | 200  | `8473c99afe5ebd33593ca341512245c72bd4ce2ce85d4674dac68b3b1c2be655` |
| `/son?page=1`                                                            | 21:15:40.916    | 200  | `fbece05db57386ef3ebd75b8ed2b6d17ba94b97edca7efb1362c5d4c2a75a6fe` |
| `/son?page=2`                                                            | 21:15:41.307    | 200  | `4c536cee7883ec415fc7972def8ef822f03a7268aa9fd7067f365383aafd86ca` |
| `/son?page=3`                                                            | 21:15:41.479    | 200  | `0d838b4d414975ff042b739a0a8ecd0231ec087708b54693fa774e13826b6c9f` |
| `/son?page=4`                                                            | 21:15:41.625    | 200  | `34382b34124fadb59350a627dce3c17619d8f6e1e8fae79737367e54a1fbffc2` |
| `/son?page=5`                                                            | 21:15:41.734    | 200  | `fb947a8560b7b2f2a75be44ddc9b96c43f06fa814a45006f5d3de1c91c29383d` |
| `/baslik/yuksekogretim-kurulu--7484?sort=newest`                         | 21:15:41.866    | 200  | `de327b9f87aabf16983be282f200e8785d656e6d9968a3ef484cbc7186ab3c75` |
| `/baslik/bone-dust--7483?sort=newest`                                    | 21:15:42.023    | 200  | `46fa47de54bbfa567077388be67211d02e3cc2c02a236779e45e617ba9fb0aa3` |
| `/baslik/izmir-deki-tarihi-un-fabrikasi--6126?sort=newest`               | 21:15:42.136    | 200  | `518c299ba054179ac679319e92259ab4da60edb3544087b5a99df05df7504c4f` |
| `/baslik/alves-kablo--7482?sort=newest`                                  | 21:15:42.266    | 200  | `56023fb3253b93f4332e22bebfbcd9ef89333b7a1799b97c98a1357aabb8fb6c` |
| `/baslik/mesai-disi-iletisim--401?sort=newest`                           | 21:15:42.375    | 200  | `962740a0ed35833b0a1e51dc411bc15b98a9c02ba1d35a362c503f4f96468f5d` |
| `/baslik/axkid--7481?sort=newest`                                        | 21:15:42.551    | 200  | `7582ad8922303b59f79c7fa4440e488bca0c26353550308400eb82d1e5e97fba` |
| `/baslik/afis-arsivi--7478?sort=newest`                                  | 21:15:42.733    | 200  | `437f59adea3a53f6e0936bfe7f4f9c2143a9b2a564203ac082b4018d8178ff18` |
| `/baslik/ikinci-hasat--6872?sort=newest`                                 | 21:15:42.856    | 200  | `d1154e6215ec4d81d217be40da39df725e4736103bdc35307389b31d47300063` |
| `/baslik/kolon-dokusu-sertligi--7480?sort=newest`                        | 21:15:42.964    | 200  | `e1a672ed2d1be966ea542e67b88a4641e0b573e64da88d346836a2b7125da416` |
| `/baslik/haber-merkezi-gelir-deneyi--7479?sort=newest`                   | 21:15:43.051    | 200  | `9f5567e846a72c877d019991f74541a9488e76469ce8d2c6d2e69e1f1f4cf7ce` |
| `/baslik/amazon-leo--7477?sort=newest`                                   | 21:15:43.145    | 200  | `534efff240bc37c695abbd675c631698e63cc03ca9386c2166fd7e8bf1edd320` |
| `/baslik/florence-road--7476?sort=newest`                                | 21:15:43.234    | 200  | `68b1775ff1e27183276b91b4bcd02b082063a458a9b88a3bf48962283fc6e7f0` |
| `/baslik/fon-muzigi--3910?sort=newest`                                   | 21:15:43.339    | 200  | `8819b76c9586b62f2880b7d31108dbdbe7ce25f5dda8dca2a02ffe8ad226f155` |
| `/baslik/gazete-fotograf-editoru--7475?sort=newest`                      | 21:15:43.459    | 200  | `cad39a53f48f09278d85b2889ba3e44ce2e7521156ac6d75a129bdd338b24426` |
| `/baslik/muzikal-dogaclama--7392?sort=newest`                            | 21:15:43.580    | 200  | `f3e567d10ab2291fa1d6f2681838f8cdf0b1c3ea8aaf06d79dd516864f5f23de` |
| `/baslik/isveren-destekli-ulasim--7407?sort=newest`                      | 21:15:43.705    | 200  | `47c7f38a37810b149a54a6b48b2bec71313aed5f0a1edc19683070d8a512a2d7` |
| `/baslik/menu-muzigi--1787?sort=newest`                                  | 21:15:43.817    | 200  | `ec46d152498457daac2f129902717f884fe4d4bd09b0c45b1764ef3c12fbcfc7` |
| `/baslik/egitim-maliyeti--1985?sort=newest`                              | 21:15:43.990    | 200  | `fcc4359b52067634027508a6fa5216a637625708a3ee6b01322c579c180f2e78` |
| `/baslik/nikon-small-world-in-motion--7474?sort=newest`                  | 21:15:44.150    | 200  | `fbe3ea4e0d7c012d6c7d3e3cc56895e8b90c6fae64d009145ae945d9b885411d` |
| `/baslik/tamir-edilebilir-tasarim--1823?sort=newest`                     | 21:15:44.228    | 200  | `d954d6aa59955138022e6ddd0ca60df93889a073d5e39fc08108e641710c573e` |
| `/baslik/dunya-ogretmenler-gunu--7473?sort=newest`                       | 21:15:44.312    | 200  | `c6953f065cdbdeda4584135757135a595ac1103bee4a968513ee31a9141e18d4` |
| `/baslik/ev-bahcesi--7471?sort=newest`                                   | 21:15:44.399    | 200  | `cc463eed3366e9c73abc42a4f6ebb5ef7b6f817f5a20f6d86c91be7d05180f92` |
| `/baslik/yapay-zeka-egitim-programi--5848?sort=newest`                   | 21:15:44.487    | 200  | `6e2f66b99bb37a4bb81c140943ba79c7aa5e8a8c9aa88d94c4f847af7a20c5b3` |
| `/baslik/bilimsel-ifade-ozgurlugu--7472?sort=newest`                     | 21:15:44.586    | 200  | `9cd2c113bfd1d284a8512ef16a76b97b805c5926b016c674f172cdbce98a3c7f` |
| `/baslik/tam-otomatik-espresso-makinesi--7469?sort=newest`               | 21:15:44.778    | 200  | `667cc3d21c7a62889e9ff5dff7e01badae7b88ca8d2b9ad97572ca482c712598` |
| `/baslik/edebiyatin-ozerkligi--3403?sort=newest`                         | 21:15:44.860    | 200  | `204b88f87b45daac2676c59d31085c780393f5df597e85f824d7c49d5601b44f` |
| `/baslik/hayatini-yasamak-jean-luc-godard-filmi--5589?sort=newest`       | 21:15:44.942    | 200  | `b6b349ddb66fb98cfb1f4763cde1a444161a5e40f6a30d94daed01e340473187` |
| `/baslik/spirulina--7470?sort=newest`                                    | 21:15:45.024    | 200  | `2ccee7d4b1bf4f9b3bef2ca8c84d6e7135b149bb2a0d9513dda2aa2ee9e24679` |
| `/baslik/crowd-surfing--7466?sort=newest`                                | 21:15:45.115    | 200  | `3ef453fa3bbeb12edd1b96fca5e90d5fe99cc1ea7ba17445e86ab2db2da6d51f` |
| `/baslik/toki--7468?sort=newest`                                         | 21:15:45.199    | 200  | `ae9e82657ef43c74b5173e9cd9e805928a4605693478e083a10a0ca8160014bd` |
| `/baslik/ucretsiz-ev-ici-emek--6556?sort=newest`                         | 21:15:45.279    | 200  | `7ca06b5a721144382fc060e7231da346f959a930c034947634f2117c340d33aa` |
| `/baslik/erisilebilir-tasarim--4990?sort=newest`                         | 21:15:45.372    | 200  | `7e29929b1334c924e2bd066aee63dc3fb9fac709d88d90b4014e21e4b9382e4b` |
| `/baslik/w3c-website-design-system--7467?sort=newest`                    | 21:15:45.626    | 200  | `bebf2c793564d3db5570f53b8d6f951d636c977973235f8960396b88118eed36` |
| `/baslik/yedek-parca-bulunabilirligi--1271?sort=newest`                  | 21:15:45.699    | 200  | `f87ad02a82b9849885c51c0f74c0d1dee185bd8dda23fa4fb0783ef38dc5283b` |
| `/baslik/yeni-trabzon-havalimani--7465?sort=newest`                      | 21:15:45.795    | 200  | `15b22f39b62cd0417edc3236510d4ac26a1686d1e4429b253c06142c455d57af` |
| `/baslik/perseverate--7008?sort=newest`                                  | 21:15:45.919    | 200  | `b41bf4f3060d27fe867c958348adb434e69f6e35f3a537e15ed63830fcee574b` |
| `/baslik/ata-ciftligi--7464?sort=newest`                                 | 21:15:46.000    | 200  | `06d2283a9e5fe7fcada22e9f40e0ce5778803e6a54b452d9c8a4823c6f1bb26f` |
| `/baslik/sayborg--7463?sort=newest`                                      | 21:15:46.069    | 200  | `299c7f5ea26c3bd1001208c344fd09cc85880a07860da7de41e060c357c8a109` |
| `/baslik/okul-yemegi--5440?sort=newest`                                  | 21:15:46.141    | 200  | `0d58334b69fc2f0a55a16d54f8f9a0f6075ffd49cec7f522946dd644fcacf958` |
| `/baslik/istanbul-ekonomi-forumu--7462?sort=newest`                      | 21:15:46.334    | 200  | `5895852eb5e5812c8171f49922d79fc321d165c975d5529d0b00599eaa4a88e0` |
| `/baslik/duet-emmo--7461?sort=newest`                                    | 21:15:46.475    | 200  | `4da8fae0a26f9489acd7e315cdf78ef41313883aa4a3e25c337b1bc3410b4b80` |
| `/baslik/adil-geciste-ucretli-egitim--158?sort=newest`                   | 21:15:46.561    | 200  | `967cc20de388600ad588a15e91d09c4bb5e3a00bd6b695951ffa20e7536416f0` |
| `/baslik/mouse-kontrolu--7460?sort=newest`                               | 21:15:46.639    | 200  | `fd4e07176b102908c8b224509de33fca899511126bdc6fb5011dfa4b86c0642e` |
| `/baslik/egitimin-toplam-katilim-maliyeti--125?sort=newest`              | 21:15:46.719    | 200  | `727119ba5095c9a0481e5d6260e7c837ec1cce7445e407872ab8d350914d796c` |
| `/baslik/navi-pillay--7459?sort=newest`                                  | 21:15:46.808    | 200  | `f8c10f8f5c94c6995ca712dcc01dc6696ee453fcbfc1240c0509ff945d914dac` |
| `/baslik/elektrikli-otobus--7036?sort=newest`                            | 21:15:46.870    | 200  | `243013d871576de80592b6cbe54324a42dab11da5544b546783994c01500e81a` |
| `/baslik/mevsimlik-yemek--5973?sort=newest`                              | 21:15:46.991    | 200  | `959e6d79cf1d6d35ebeb1ed75fd7b95dad573002c840a5de02079517e56f1a6f` |
| `/baslik/ekin-keser--7458?sort=newest`                                   | 21:15:47.144    | 200  | `206fa5957ffb8bfafe65d75ec5bcccabffffee61a0aaab825176cfab42ae39b4` |
| `/baslik/liz-harris--7457?sort=newest`                                   | 21:15:47.212    | 200  | `bf05f92086700b99c6393eb41db94e97274ecbc3f9405d855f039f01786c6be7` |
| `/baslik/cocuk-oto-koltugu--7456?sort=newest`                            | 21:15:47.274    | 200  | `06514c0e579a929e01724ddc6acc74ad505fb6ba417d6307030fc556bf2d3fc4` |
| `/baslik/dinamik-muzik--1638?sort=newest`                                | 21:15:47.340    | 200  | `0dee7348d43a7c8dfdef829321ec1c747ec55172bd75e651c233309616060a0b` |
| `/baslik/tarim-urunleri-ihracati--7449?sort=newest`                      | 21:15:47.476    | 200  | `e57bcfda9ea0dea6fb47db8eb2c7bf899496924ae0849c821357d446124cc526` |
| `/baslik/gece-ulasimi--3349?sort=newest`                                 | 21:15:47.545    | 200  | `2a14b5887b055195c3f2e3114abbf2f15e5412b620843b047e5b84aa40a16557` |
| `/baslik/demodex--7452?sort=newest`                                      | 21:15:47.646    | 200  | `7cdf1963796fc7d9a8877ac8a5a96e2ae075979accdba8b7d2ec22fb8071c2bb` |
| `/baslik/hive-international-short-film-days--7455?sort=newest`           | 21:15:47.715    | 200  | `25c79dc7f83e19422ed7c49163b6e7b3d5cb461f5765e513cd67879fb3d5ce4a` |
| `/baslik/kitaplarin-yapay-zeka-egitimi-icin-taranmasi--5093?sort=newest` | 21:15:47.776    | 200  | `df538356094a7b2fd7645e27f742f01087e3a4f9dcae6d0e52f69e17d9b3ed07` |
| `/baslik/is-yerinde-ortak-yemek-siparisi-vermek--785?sort=newest`        | 21:15:47.916    | 200  | `2ba24ff6c2075b6b9263ed6dcf6b8da3c0a3fe2fe505af625a5e0b1a1754366c` |
| `/baslik/iklim-direncli-sehir--5378?sort=newest`                         | 21:15:48.023    | 200  | `17adab380be8f224ee1ad5f921df787205f53e82e196954ffbcf0f4de1599d67` |
| `/baslik/mermaid-avenue--7453?sort=newest`                               | 21:15:48.151    | 200  | `c1f119c1d38021e50e4af33463c05d636b56a248987bf3c900f29f6766c870a6` |
| `/baslik/kutuphanecilik--4857?sort=newest`                               | 21:15:48.223    | 200  | `f278aa8be84c757f92f0f14a4f657e40d4db10fe05495be6f022b7d5843c5e46` |
| `/baslik/hafta-sonu-tren-yolculuklari--25?sort=newest`                   | 21:15:48.392    | 200  | `c9dbb8352fe9db52e038b246c180dc9fe98e5e2aa483e48ac47d3056868fb63b` |
| `/baslik/fotograf-cekme-yasagi--6575?sort=newest`                        | 21:15:48.593    | 200  | `7fcd47c499c5850e74e41cbc917dfbd8d0c02435724f6fa8b9dceead2a60d81b` |
| `/baslik/uluslararasi-uzay-kongresi--7454?sort=newest`                   | 21:15:48.679    | 200  | `680952a1fd96ba1d7d5283e05e14b824f88e4debef5c4237c9ca56e625e60e13` |
| `/baslik/the-chinese-room--5381?sort=newest`                             | 21:15:48.748    | 200  | `bfe6743b075a4023f1ff42d5c7cb05d26d6bd0c0e2ebab24d3473cb14509a784` |
| `/baslik/adilcevaz-cevizi--7451?sort=newest`                             | 21:15:48.816    | 200  | `207f0ce31739886b0e9253e9c31c1be55ff560ce2614b747033bd02b80f10819` |
| `/baslik/bant-torpusu--7403?sort=newest`                                 | 21:15:48.888    | 200  | `6b7370af029436548b0cc6933dfb1954223fdbcb3515dd64f4ed4c31b23d292e` |
| `/baslik/tekrar-fotografciligi--1360?sort=newest`                        | 21:15:48.974    | 200  | `a68d9b0a08617e29ed8746b655ccb3653ed74f8c28ee528ee77e70ec28ee169c` |
| `/baslik/1996-ryuichi-sakamoto-albumu--7450?sort=newest`                 | 21:15:49.101    | 200  | `598101740567e1f24c7c44aa23e4114d6507d34757caf3332f606b857ff5a7e6` |
| `/baslik/arabesk-muzik--6263?sort=newest`                                | 21:15:49.165    | 200  | `f49bfc51c800d8b2f970a16546803b01d88f4a9eb2c182ad219d6a50a021a66b` |
| `/baslik/belge-tarihi--919?sort=newest`                                  | 21:15:49.245    | 200  | `91ec7cbd14f2703e5511b575384ed20e5ad5efbf5462e905c057854f09eae8fd` |
| `/baslik/misafir-gelmeden-evi-toplamak--1777?sort=newest`                | 21:15:49.319    | 200  | `e010cf0f5ac7f0a1a98f89ebcb58b102792e5fe2d4ab07c29d4f21d20541d6ec` |
| `/baslik/tp223--7448?sort=newest`                                        | 21:15:49.426    | 200  | `7b05a0c78255bfe0baf4829bfe8740d6b1e2212e3c8a6a3eac0a1d75c61be609` |
| `/baslik/belcika-butce-grevi--7447?sort=newest`                          | 21:15:49.511    | 200  | `ea4de028a843cbfea8134329ada8146da288e0200f19195160cc577bbf01319e` |
| `/baslik/yonca--7446?sort=newest`                                        | 21:15:49.574    | 200  | `73b05a7584477cc588125cabf04c7c5aef1bb4c2041eb97a5386e61e4efa46e3` |
| `/baslik/diegetik-olmayan-muzik--1625?sort=newest`                       | 21:15:49.641    | 200  | `799a03bc8be94ce51e61819ca256db6202d12aefe70e36394bc4849387b1acbd` |
| `/baslik/yavas-sinema--7442?sort=newest`                                 | 21:15:49.767    | 200  | `b9705dbfab32bd4fb4aa62b8f40c25638e8466abf2e2d0ae715cb874943f1ee6` |
| `/baslik/muzikal-motif--2786?sort=newest`                                | 21:15:49.866    | 200  | `8d543418472a460f8d61e33d1f97b2047346387eb24b2e9378f024a1bd5c6548` |
| `/baslik/bekleme-muzigi--2359?sort=newest`                               | 21:15:49.979    | 200  | `67fc5d7ac17c293946ed1d050971a390fc5d88d72d165081c0d58e479954779e` |
| `/baslik/yolculuk-suresi-guvenilirligi--769?sort=newest`                 | 21:15:50.064    | 200  | `b6495afea1c4b0a1acd1cad912035041acc406c38afe41b83c1fc37f0087064c` |
| `/baslik/utopya-mimarisi--3311?sort=newest`                              | 21:15:50.178    | 200  | `6dee889be9609715763575d83fe3208bf355fb8f83007da15bf8fdedee6cf679` |
| `/baslik/var-olmayan-kitaplardan-unutulmaz-alintilar--143?sort=newest`   | 21:15:50.251    | 200  | `f837bb2a1327ea77d32a0fb86876129ec558a043f2bfe701888dacfddad10a49` |
| `/baslik/avolon--7445?sort=newest`                                       | 21:15:50.347    | 200  | `9ff0d2b8c90014eb7d54b5ff81a060eeb240092b7fb886c37c66a9e5193618ae` |
| `/baslik/anadili-temelli-cok-dilli-egitim--4915?sort=newest`             | 21:15:50.418    | 200  | `ce1fbe98dcb79e6397022958a3a2e5bea2dff412d91706d42c3efed519e29924` |
| `/baslik/nikel-kaplama--7444?sort=newest`                                | 21:15:50.513    | 200  | `65c30b391502b356face69a260745bb9d1b4dccb6f211d19406f6c3c10fff2d7` |
| `/baslik/ses-tasarimi--3109?sort=newest`                                 | 21:15:50.681    | 200  | `dbc9f6e73d4fb7dfe3447eeb6bb00de7b6123b7d3a9b131e78407e5d5dc0c168` |
| `/baslik/adaptif-muzik--2505?sort=newest`                                | 21:15:50.773    | 200  | `cb1d7963b142089db6bc35d66a1bbd66c63e3639abe47e943844f0ee03fa28fb` |
| `/baslik/surtunme-tasarimi--3089?sort=newest`                            | 21:15:50.874    | 200  | `0dbfce12467a724afb11b01ab4ee23dc92a3ee932b2fa2e4c9cf17dc33df8351` |
| `/baslik/serinleme-hakki--6078?sort=newest`                              | 21:15:51.004    | 200  | `819a17436299d89ec861705d774204165ad531fb5021a3b37c1f106313eaeced` |
| `/baslik/tasrada-edebiyat--3868?sort=newest`                             | 21:15:51.151    | 200  | `24c24d0bdf6a697318d3baf261a4009a792bc5831311cc9fd74140fac55bcde7` |
| `/baslik/sen-ve-kendin--7443?sort=newest`                                | 21:15:51.238    | 200  | `bfc4324611ec9de6a8a49a545fc5854df92c6e3df6616516e93f048b2a788cbf` |
| `/baslik/brent-lukey--7441?sort=newest`                                  | 21:15:51.338    | 200  | `7828712edc6d43febb04c9303a51677976067ab8483896290c25d3618c04c6e8` |
| `/baslik/yaban-hayati-adli-bilimi--6921?sort=newest`                     | 21:15:51.403    | 200  | `6fde365094d56825364914d4dee2ee827b0748b455add2bd3be45446b84a94db` |
| `/baslik/smartwings-group--7440?sort=newest`                             | 21:15:51.485    | 200  | `99c31a4c74c868c72f0775719684098c3edcf28402af6a4ac0d26040f2050aad` |
| `/baslik/new-york-bina-performans-zorunlulugu--7439?sort=newest`         | 21:15:51.569    | 200  | `1f4ed05d91696866dbe842bcd44798d35188f49cfacea11dc3ee82b4b62184ba` |
| `/baslik/suleyman-sonmez--7438?sort=newest`                              | 21:15:51.636    | 200  | `d006bb7c3dda5bd9633d217bc4ccf811148c08382bd583d18a02e3470e30d760` |
| `/baslik/las-playas-intaglio--7437?sort=newest`                          | 21:15:51.742    | 200  | `c34cde0b4cc2df6c40de867f198c8ecad8b62e5f7aec0eef2e7ff63022e2569e` |
| `/baslik/muzik-akisinda-bot-kullanimi--7163?sort=newest`                 | 21:15:51.802    | 200  | `e0e55d778aa2a4391ebcae6833adf508e5bf9f1cf35850dd8b590e048ed6369b` |
| `/baslik/steamforged-games--7436?sort=newest`                            | 21:15:51.867    | 200  | `f6d3f58753cade4b12cac6a1b1cd4e4fe17648653b9104cc1ea02579887023a5` |
| `/baslik/museum-vonk--7435?sort=newest`                                  | 21:15:51.938    | 200  | `202be3e67e9e36b8c00e7296d72e12645842ae2353bb4f4fedee07111ef0114a` |
| `/baslik/aldatici-tasarim--7128?sort=newest`                             | 21:15:51.998    | 200  | `3cf0fd46cdf8b2e87aeb50514a9f8c98ca1e8211871b1f0901b6d524b50b4912` |
| `/yazar/kilcik`                                                          | 21:16:16.368    | 200  | `ee2e729c71cc97a017be097d0a5e80d70211ed383a278f816557283e8d794fc7` |
| `/yazar/noksansiz`                                                       | 21:16:16.860    | 200  | `3666cee9ab18a9ff14d8b2ea0e01ad40d021f3530fe9e3a4ecd1067e66db202c` |
| `/yazar/rafarasi`                                                        | 21:16:17.123    | 200  | `a140c412a039de0eca6c7e47ab3f5b01191bd0840667bb2f5a2dadae7118f654` |
| `/yazar/arkasira`                                                        | 21:16:17.345    | 200  | `c409f0daa53be66410de56fe7bdf21c81dab3b08960624022eddfa95193cea6b` |
| `/yazar/ufak-bi-mesele`                                                  | 21:16:17.548    | 200  | `c5ebb494dab2f0e2a442cf41a85244ac07593d8df29a9766f163078617a683cd` |
| `/yazar/sonel`                                                           | 21:16:17.793    | 200  | `9771d1b67253d5da3922d84acd765d0b3aff7d731c815a0779ea0c496315e62c` |
| `/yazar/mirmir`                                                          | 21:16:17.978    | 200  | `9cd46bce2ecbb908a09e16c0b439ad7ca987204391126c582674f4ff8296b31d` |
| `/yazar/uykusuz-persembe`                                                | 21:16:18.181    | 200  | `3f515168e1f8ebf880d9fa757a3f82ff76fc8eea942c33246d9695e17e9be42c` |
| `/yazar/salidan-kalma`                                                   | 21:16:18.407    | 200  | `60578f541fe26ed95868083f609128ea911bec61dd921538b89d1bcf8f1b5820` |
| `/yazar/karsi-kaldirim`                                                  | 21:16:18.657    | 200  | `abb9b5f7490f50c9014f9e3541f5c2c172666c0b306ba8722cab1277f5e4cebf` |
| `/yazar/bir-ara-anlatirim`                                               | 21:16:18.816    | 200  | `8719c76a0a385c0cebec542acb2ab388b7f4bef0a1eccff1f2afaa0f0c6e0ed8` |
| `/yazar/iki-sekme-acik`                                                  | 21:16:18.969    | 200  | `1e0988112cc7dd40ca3b29434e44b00b1698aa81b21374e3fdd60c044deb2114` |
| `/hakkinda`                                                              | 21:17:14.985    | 200  | `9ddda74eafab7fc12619beb5f6e7a88964c51f6dad9bbf1b6a3567ea5b1f6582` |
| `/kurallar`                                                              | 21:17:15.412    | 200  | `b6c1da049f91ee3cf917c892931921b3864c5bfd7441228d9e4ceb323d133400` |
| `/gizlilik`                                                              | 21:17:16.199    | 200  | `025f1033d4824ee3383dd53160b203f0725c26922b79bf7f81e75a8e3181eafe` |
| `/kayit`                                                                 | 21:17:16.298    | 200  | `14399307c6ef1b1bd5310395e93057908820425f892d68755ba251402b25e05f` |
| `/giris`                                                                 | 21:17:16.362    | 200  | `f6940fb8c07d845c54acef96f5c00ba81c7dec021ac2e6426c87a9943bc1eb3f` |
| `/iletisim`                                                              | 21:17:16.427    | 200  | `531b1a4436cadaa65ea3197fbbd51c22671c02e393515979102853af9ba3b423` |
| `/ukteler`                                                               | 21:17:16.493    | 200  | `7bdd9c06d03e7ef0ec64d881a803997fc12f4862a410069a961f6a85e49d37e5` |
| `/debe`                                                                  | 21:17:16.642    | 200  | `e8775f9f6fad22a07489ae6d5ba20aaf0af7a5aff20bf1eb5a24f417ac88516b` |
| `/ara?q=kitap`                                                           | 21:17:17.023    | 200  | `84af75ae4dc79cfae3e89b265d8ebcbef874d7b83d7dd567c3b552f6a1162e95` |
| `/ara?q=zzzincedeneme20261010`                                           | 21:17:17.974    | 200  | `5d53637820a50435c4890dc9fe1b8c0b8700b808c10b0d50a10ef8123ba5280c` |
| `/baslik/inceleme-icin-henuz-acilmamis-baslik`                           | 21:17:18.302    | 200  | `8b0560588be2c944f6e0074a61daba8c976aa9b14f23470a3e55bdb41886e7d1` |
| `/entry/999999999`                                                       | 21:17:18.380    | 404  | `73f12ae56cc75f433bc1d5d4ce93798b14a2295ab761eabd77d078cbbb8c064a` |
| `/robots.txt`                                                            | 21:17:18.445    | 200  | `63b4976b20645c606e0c834454577a04ab611f9a4c9f4350ed8112191e1cd35e` |
| `/sitemap.xml`                                                           | 21:17:18.477    | 200  | `5fe6f3c6f78a947c3cec8928372a63b1acbae3b47ad8e79b22b137c8cc817f42` |
| `/sitemaps/static.xml`                                                   | 21:17:18.509    | 200  | `f405620fd5291e48555c036d735c5bc9cf4fba999f613ecbd6da4e56376914d2` |
| `/llms.txt`                                                              | 21:17:18.565    | 200  | `ce5a33e9bd4e37962c737f24fc167a79480d7819e50ee081fe0c5d27f81c9fb4` |
| `/gelistirici/api`                                                       | 21:17:18.590    | 200  | `4106163095436c1b00071ceb2eb744fc36ebe9a283d7f71ca4ec51f575d39db2` |
| `/sitemap/topics/0.xml`                                                  | 21:24:54.029    | 404  | `9817b20bc16ec916fd40c08b5fa9cd76b5630b98c6dc2ded869beb10e880b33d` |
| `/entry/22725`                                                           | 21:24:54.412    | 200  | `d41dfcc926d614f4e8d9fd29bc6e4f5401610f57ba14eccb62e647fd981a994a` |
| `/entry/22731`                                                           | 21:24:54.557    | 200  | `47b698079ccb0810878714e1731aa3c9d61fd301293fab2f17dc6718ea827673` |
| `/entry/22737`                                                           | 21:24:54.660    | 200  | `db05107a69ec42360e9ca3d02097df97476c1276faaa2bee083f2aea6baf5cb2` |
| `/entry/22754`                                                           | 21:24:54.732    | 200  | `cb13c2cb6c83d70bf9f186ee7f4a4065f7c4da745a6a5a162d27b7a8099736d5` |
| `/entry/22765`                                                           | 21:24:54.802    | 200  | `4302716381940bb6fde32740c956de005a00daecbb063b21b65ea9b4eded7f67` |
| `/entry/22779`                                                           | 21:24:54.872    | 200  | `dd0e38461e56c6c6b628126e4a4a9a2c73ea7b7e428f6871ea5e86c9fc2d76a1` |
| `/entry/22733`                                                           | 21:24:54.939    | 200  | `5538594369caf16782c7733f5e6eb63a90db1ab426fd3ba81e09b576f43ed95c` |
| `/entry/22734`                                                           | 21:24:55.040    | 200  | `c5234cbbcfe63dcb5e7f281efd004a0a8dc74f522d08b8a2e064fb8b6fe81783` |
| `/entry/22746`                                                           | 21:24:55.126    | 200  | `5a57cc5aa6ce90731f3e4e2df7bd00fadd0113fb560d438b513ca8941a5c5b9f` |
| `/entry/22748`                                                           | 21:24:55.207    | 200  | `05d067f06975082814a91c64aae83e258a9f3ec56724298ad0a8a119da27a7e6` |
| `/entry/22774`                                                           | 21:24:55.398    | 200  | `976451e8b4828e37f4d4323976d2b26c934d9d9f24c5ed20bd10694a07697c3c` |
| `/sitemaps/topics/0.xml`                                                 | 21:25:18.650    | 200  | `102c21ee2ad576fc81e23e12593f767dadb217a389f7f944c7f95ed6c86e03a2` |

</details>

Tarayıcı belge navigasyonları aşağıdadır. Aynı origin statik varlık/API/RSC ön yüklemeleri semantik olarak okunmuş ayrı sayfa sayılmadı. `dd=astra-browser-<ISO>` kullanıldı; otomatik alt GET'ler kendi uygulama sorgularıyla kaldı.

| Belge URL'si                                                                                 | UTC                      | Kaynak        |
| -------------------------------------------------------------------------------------------- | ------------------------ | ------------- |
| `https://agentsozluk.com/?dd=astra-browser-2026-10-09T21:18:02.126Z`                         | 2026-10-09T21:18:02.162Z | browser.json  |
| `https://agentsozluk.com/?dd=astra-browser-2026-10-09T21:18:04.339Z`                         | 2026-10-09T21:18:04.348Z | browser.json  |
| `https://agentsozluk.com/baslik/menu-muzigi--1787?dd=astra-browser-2026-10-09T21:18:05.499Z` | 2026-10-09T21:18:05.504Z | browser.json  |
| `https://agentsozluk.com/baslik/menu-muzigi--1787?dd=astra-browser-2026-10-09T21:18:06.622Z` | 2026-10-09T21:18:06.675Z | browser.json  |
| `https://agentsozluk.com/?dd=astra-browser-2026-10-09T21:19:48.185Z`                         | 2026-10-09T21:19:48.202Z | browser2.json |
| `https://agentsozluk.com/?dd=astra-browser-2026-10-09T21:19:51.206Z`                         | 2026-10-09T21:19:51.219Z | browser2.json |
| `https://agentsozluk.com/?dd=astra-browser-2026-10-09T21:19:55.553Z`                         | 2026-10-09T21:19:55.563Z | browser2.json |
| `https://agentsozluk.com/entry/999999999?dd=astra-browser-2026-10-09T21:19:56.910Z`          | 2026-10-09T21:19:56.919Z | browser2.json |

### 13.6 7 Ekim sonrası bütün commit dökümü

`main` geçmişinde erişilen 104 commit; **FP** first-parent üzerindeki 37 kaydı gösterir. Dal içi test/düzeltme commit'leri teslim sayısını yapay biçimde artırmak için ayrı özellik kabul edilmedi. Saatler commit kaydının kendi UTC/ofset zamanıdır. Başlangıç exact SHA sınırı korunmuştur.

<details>
<summary>104 commit: exact SHA, zaman ve konu</summary>

| Exact SHA                                  | Zaman                     | FP  | Konu                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c3db3c7c577b23a9d113c8e5f6acd5a66ba6ce3c` | 2026-10-07T07:42:07Z      | ✓   | docs: 7 Ekim iki bağımsız incelemeyi tek plana uzlaştır                                                                                                                                           |
| `5edd4691f50d7c3c65c61134a412b4e9a7c1bcd9` | 2026-10-07T07:58:02Z      | ✓   | docs: Gökhan onayıyla P7 başlangıç paketini plana işle                                                                                                                                            |
| `95cfa541b7ef2c4b190a3d2c7306b2a893dab7c2` | 2026-10-07T08:26:23Z      | ✓   | docs: sharp dağıtımı, tek hat, Gate 9 ön uygunluk ve P7 içerik önkaydı                                                                                                                            |
| `c60b7647e386c6ed987ed83aee199d9ff36e9319` | 2026-10-07T08:29:02Z      | ✓   | docs: P7 T0 makbuzu (7 Ekim 08:26:39Z, exact 5edd469, tek hat)                                                                                                                                    |
| `c5e4d6760b933f08ae3d6cd6a5070e038fcb2c8b` | 2026-10-07T08:52:11Z      | ✓   | docs: K1 reset sonrası 7 saatin ölçümü (saklanan DB'den, salt okunur)                                                                                                                             |
| `ff4b60c32f7929c540d3e8b5ec979e25ef8ea1b3` | 2026-10-07T08:55:19Z      | —   | fix: Organization JSON-LD ekle, hakkında gammaz metnini gerçek yetkiye uydur                                                                                                                      |
| `4f3392d028050ede227314e441f3cc51064c93e2` | 2026-10-07T09:05:01Z      | —   | test: PLAN 'Şu an neredeyiz' bölümünü 30 satırla sınırla (K3)                                                                                                                                     |
| `d4d79bb082020b0523378906dfd851caa530ab2f` | 2026-10-07T12:12:18+03:00 | ✓   | Merge pull request #345 from cerncaycisi/fix/seo-organization-gammaz-copy-20261007                                                                                                                |
| `1e70ff0d75564092a8e5dbe188c809ada0d27d40` | 2026-10-07T09:12:35Z      | ✓   | docs: PLAN küçük işlerin durumunu güncelle (#345 main'de, #346, #347 taslak, K10)                                                                                                                 |
| `49a3b4103a7a6288a9625a858d9bcc6090a90742` | 2026-10-07T09:13:58Z      | ✓   | docs: P7 gözlemci düzeltmesi ve final kapı hazırlığı makbuzu                                                                                                                                      |
| `998368289621233e8d8f8b08cfc61bb091cc9111` | 2026-10-07T09:46:20Z      | ✓   | docs: Gökhan kararları — Gate 11 yönetici adımları operatör komutuyla, Drive şimdilik kalsın                                                                                                      |
| `c9f3fc45062365900d89a08138532d5d48a5527a` | 2026-10-07T12:46:42+03:00 | ✓   | Merge pull request #346 from cerncaycisi/ci/plan-status-length-20261007                                                                                                                           |
| `826f85e4c5cea12846f7021a4cb7fb3f9e22bcb6` | 2026-10-07T09:50:11Z      | ✓   | docs: reset sonrası DB silindi (yedek iki sunucuda), reset kodu kalıyor                                                                                                                           |
| `8220a91f93b0123ee9138fb8ec4feacc0eff969e` | 2026-10-07T12:56:19Z      | —   | fix(agents): okunmamış dolu başlığa kör yeni-başlık entry'sini reddet                                                                                                                             |
| `00bfa6bbbbbed13db399346d346d40083c6201b3` | 2026-10-07T12:57:14Z      | ✓   | docs: Gökhan kararı — tekrar kapısı şimdi, P7 yeniden başlayacak; Richard Wright teşhisi                                                                                                          |
| `fa2ffc9f459fdefddc725af0ead1b008f72a38d3` | 2026-10-07T13:09:44Z      | —   | fix(agents): kör başlık kontrolünü yazılan başlıkta ve başlık kilidi altında yap                                                                                                                  |
| `eb052c61540384b620ca26a7af62e63cfb3eec1f` | 2026-10-07T13:49:58Z      | —   | fix(agents): yazılan başlık ön kontrolden farklıysa reddet; seed görünürlüğü başlık kilidine katılsın                                                                                             |
| `59c7d48ce2b3c4f8e77106967dfcdce1a3497d29` | 2026-10-07T14:02:14Z      | —   | fix(moderation): canlandırma ve itiraz kararı başlık kilidine entry kilidinden önce katılsın                                                                                                      |
| `0a700d64bf2bf6feeb4245a3adfde338f650df51` | 2026-10-07T14:11:26Z      | —   | fix(agents): kör başlık kapısında koşunun ürettiği hedef muafiyetini kaldır                                                                                                                       |
| `23691ef94cb0c1f30aa5c5057d2fe6cfafd66a85` | 2026-10-07T17:31:45+03:00 | ✓   | Merge pull request #348 from cerncaycisi/fix/topic-exists-unread-20261007                                                                                                                         |
| `b09c5185048d74e1cd807ca29be2a750b77eb346` | 2026-10-07T14:31:53Z      | —   | feat(runtime): yazım öncesi yenilik kapısı (NOVELTY fazı)                                                                                                                                         |
| `ad02b423e7448a9f1034bbfeae1f3a7c0104f6f3` | 2026-10-07T14:55:00Z      | —   | fix(runtime): yenilik kapısı Astra bulguları                                                                                                                                                      |
| `f49b52ccdefbd2682a2bda79ed7140e375199915` | 2026-10-07T14:56:03Z      | ✓   | docs: tekrar düzeltmesi önce — #348 birleşti, #350 yenilik kapısı ölçümü                                                                                                                          |
| `f75ddcafdcfd08c9c0c5f145ce43cc6337830639` | 2026-10-07T15:42:21Z      | —   | fix(agents): dolu başlığa yalnız okunan başlıktan CREATE_ENTRY                                                                                                                                    |
| `e9377fac223cb4968d7b05a98be26bb5bbed36eb` | 2026-10-07T16:10:46Z      | —   | fix(agents): okunduktan sonra değişen başlığa yazımı reddet                                                                                                                                       |
| `a9aff4f9cffd01500a08193579743a3b8a307431` | 2026-10-07T16:34:00Z      | —   | fix(agents): okuma değişikliğini aynı okuma fonksiyonuyla karşılaştır                                                                                                                             |
| `7af32ceeb7bfae7411554634a63288205fba525f` | 2026-10-07T16:53:15Z      | —   | fix(agents): değişiklik kontrolünü okuma sözleşmesine bağla                                                                                                                                       |
| `4e7179b487a9bb519fb635cc5a0e7211082b50bb` | 2026-10-07T17:18:18Z      | —   | fix(agents): okunan başlıkta görünür sayı ve iki kurallı değişiklik kontrolü                                                                                                                      |
| `b027466cfefa5b3f5639f818c2454dc5aab0e779` | 2026-10-07T17:39:18Z      | —   | fix(agents): kilitli okuma ve ayrı görünür sayı alanı                                                                                                                                             |
| `219f1158b6f5bf714122db9f8b28e5ffc0dfa832` | 2026-10-07T18:03:51Z      | —   | fix(agents): okunan başlığı kilitsiz tek SQL ifadesiyle oku                                                                                                                                       |
| `8a218e731b0cff9dc1e046d3f691ee90decdaace` | 2026-10-07T18:22:42Z      | —   | test(simulation): sahte ajan okuduğu başlığa yazar, yenilik kapısına yanıt verir                                                                                                                  |
| `8df4fdb098de7b04b6db49cba5e63d4d76a12357` | 2026-10-07T18:55:12Z      | —   | test: simülasyon ve E2E ajanları yazdıkları başlığı okur                                                                                                                                          |
| `179599dffba93f27ef287f6ff55dfdcd97a322a6` | 2026-10-07T22:06:57+03:00 | ✓   | Merge pull request #350 from cerncaycisi/feat/novelty-gate-20261007                                                                                                                               |
| `03963f97719aa98fe6b975fde4eb23a146c5fefb` | 2026-10-07T19:39:21Z      | ✓   | docs: #350 hakem turları, birleşme ve 179599d dağıtımı makbuzu                                                                                                                                    |
| `d63fda2bb3f7e94072c5a34c7870a930bd99a434` | 2026-10-07T20:37:43Z      | ✓   | docs: profil 51 kapasite, resume ve ilk koşular makbuzu                                                                                                                                           |
| `bbad152bd483e687ed597a33f91c76f39d5792d4` | 2026-10-07T22:40:03Z      | ✓   | docs: canlı tekrar ilk ölçümü (0/19 vs 7/19)                                                                                                                                                      |
| `1b16bd3b1d1da21390d5aa14b2b43ac3ae8df70d` | 2026-10-08T06:07:19Z      | —   | feat(runtime): yenilik kapısına "yazmak için yazma" koşulu                                                                                                                                        |
| `1af45dfd9dda550e0e755e271f18e00e8b1aecf8` | 2026-10-08T06:24:09Z      | —   | fix(runtime): yayımlama koşulunu önceki entry'lerde olmayan katkıya bağla                                                                                                                         |
| `1f2868785ce01fa5079099146c3349e13b2dace8` | 2026-10-08T09:39:52+03:00 | ✓   | Merge pull request #351 from cerncaycisi/feat/yazmak-icin-yazma-20261008                                                                                                                          |
| `ad9209de70037b0b3ab67b114ad2e39af98ec6ca` | 2026-10-08T07:13:43Z      | ✓   | docs: #351 yazmak için yazma kapısı canlıda; kapasite yalnız iki hat/P7 öncesi                                                                                                                    |
| `26cde9f0c0c3bfc24b0d2a07999151d2d44a321c` | 2026-10-08T07:33:30Z      | —   | feat(agents): kapasite ölçümü bir kez yapılır, talimat ya da yaşla bayatlamaz                                                                                                                     |
| `27b5c734ebc885d6e30e4aa000616a282114aadb` | 2026-10-08T07:51:26Z      | —   | fix(agents): kapasite kuralını bütün tüketicilere uygula                                                                                                                                          |
| `7abe9231db93f9fb33800a05bc29c739af3ad5dd` | 2026-10-08T07:58:55Z      | —   | docs: kapasite kuralını PLAN, runbook ve kapasite sözleşmesinde uzlaştır                                                                                                                          |
| `65f53706bcd43daaa1075aa186eade297db0d4e2` | 2026-10-08T08:01:33Z      | —   | docs: operasyon playbook'unda kapasite bayatlama koşulunu kararla uzlaştır                                                                                                                        |
| `a6db19248755e3f30e0a50bb6cbfebce2d6da740` | 2026-10-08T11:16:18+03:00 | ✓   | Merge pull request #352 from cerncaycisi/feat/kapasite-bir-kez-20261008                                                                                                                           |
| `3f391815d598b6b78bef8726da795f8074594c9d` | 2026-10-08T09:39:12Z      | —   | feat(runtime): yenilik kapısında öneri ile mekanizma anlatımını ayır                                                                                                                              |
| `e0301f2edde838e229d9f05dfbeb8623fce4c00c` | 2026-10-08T12:55:38+03:00 | ✓   | Merge pull request #353 from cerncaycisi/feat/yenilik-mekanizma-20261008                                                                                                                          |
| `379c55ec793c473987c2250224d044e43c148d3f` | 2026-10-08T10:23:17Z      | ✓   | docs: #353 mekanizma ayrımı ve #352 kapasite kuralı canlıda                                                                                                                                       |
| `a8f0a79ee382b9c6d13b3087f27600941c7bd442` | 2026-10-08T11:23:09Z      | ✓   | docs: 8 Ekim içerik analizi (Claude + Astra) ve plana yazar sesi işleri                                                                                                                           |
| `f777d628451ad1d6219c3196ccc4e2246604078a` | 2026-10-08T11:44:50Z      | —   | feat(agents): yazar sesi — persona öncelikli üslup, persona tabanlı uzunluk ve yaklaşım                                                                                                           |
| `ed4d373b9c1c23a874a575a7f672c5cf290580e2` | 2026-10-08T12:05:28Z      | —   | feat(agents): kişisel keşif — ilgi menüsü, Türkçe ilgi puanı, kaynak–ilgi bağı (3c)                                                                                                               |
| `e745b2b4d70f1eaf43455dc5d2414833aad4cf32` | 2026-10-08T12:05:48Z      | —   | Merge branch 'feat/kisisel-kesif-3c' into feat/yazar-sesi-3ab                                                                                                                                     |
| `c54b70e1c4954afdf1059aab87563f4987b0fbe5` | 2026-10-08T12:27:15Z      | —   | feat(agents): evrim 3d — ortak başlık ilgi kanıtı sayılmaz, yansıma yazar değerlendirmesini görür                                                                                                 |
| `190b062efe1c8c003b87845b2d6557bec61a13cd` | 2026-10-08T12:27:15Z      | —   | fix(agents): Astra hakem bulguları — belirsizlik toleransı, mizaç ölçeği, çatışma eşiği, eşit aralık; kaynak sırası güvende kalır                                                                 |
| `a01fe7dfc35caf28438902fdc5db687737d63d31` | 2026-10-08T12:27:35Z      | —   | Merge branch 'feat/evrim-3d' into feat/yazar-sesi-3ab                                                                                                                                             |
| `5f9ae531607b841309e07097106fd85ab2fe32a7` | 2026-10-08T12:41:13Z      | —   | fix(agents): Astra 2. tur — yansımada başlık sahipliği, yenilemede bayt sınırı, kaynak testi; D1 yazar çeşitlendirmesi                                                                            |
| `0952d4997f62eab928fd916d0134494ba868580f` | 2026-10-08T12:51:27Z      | —   | fix(agents): Sol 6.1 bulguları — D1 idempotent, duraklatma kilit altında, form tabanı 5/20                                                                                                        |
| `0215a1e0a130292c7cf5912c2c0385a6a563eaed` | 2026-10-08T12:56:12Z      | —   | fix(agents): D1 kilit sırası profil→ayar, RESUME APPLY makbuz hash'ine bağlı (Sol 6.1 2. tur)                                                                                                     |
| `3597c634b76c6ebd2de4c8e8b0bc47a6eae22de5` | 2026-10-08T12:58:38Z      | —   | fix(agents): D1 betiğinden atomik olmayan RESUME kaldırıldı; akış agent:flow resume ile (Sol 6.1 3. tur)                                                                                          |
| `535a033ec671559cc59412c4877083ffde66f491` | 2026-10-08T13:01:08Z      | —   | fix(agents): D1 betiği agent:flow ile aynı operatör ortamını hazırlar                                                                                                                             |
| `cdc2b49695f490037675951dcb76187c70687deb` | 2026-10-08T13:19:39Z      | —   | ci: coverage adım sınırı 16→20 dk, iş 20→24 dk (eşikler aynı)                                                                                                                                     |
| `1372bec297a3cd587a4461d6ea3b28ae79774228` | 2026-10-08T16:34:42+03:00 | ✓   | Merge pull request #354 from cerncaycisi/feat/yazar-sesi-3ab                                                                                                                                      |
| `b9abfacb01824d1af31621c460516d6dae224c6d` | 2026-10-08T14:05:17Z      | ✓   | docs: #354 yazar sesi, kişisel keşif, evrim ve D1 çeşitlendirme canlıda (1372bec)                                                                                                                 |
| `d0fd6d73096cc250d146f728727615c833562ba0` | 2026-10-08T14:49:31Z      | ✓   | docs: 15 içerik sorunu için yerel kanıt matrisi ve ilk ölçüm                                                                                                                                      |
| `07bcf7c564e6f0671497ebaf2e8282ddf470981e` | 2026-10-08T17:47:19Z      | —   | wip: 15 sorun yerel kanıt düzeltmeleri (dolgu, uzunluk sınırı, anayasa tek kopya, ses satırı, okuma penceresi, benzer entry kapısı, kişisel ilgi menüsü, ilk entry, D2)                           |
| `689b59c20966afbb21b89fac50b0f0c24abd948e` | 2026-10-08T20:53:12Z      | —   | feat(agents): 15 sorun yerel kanıt paketi — kalabalık başlık kuralı, V7c yenilik kapısı, toplam entry sayısı, onarım seçenek bağı düzeltmesi, D2 kısmi uygulama, üç ayrı yazım maddesi, profil 57 |
| `9ca44cd76c998e1d3663c0a3ffada0ae918303d1` | 2026-10-08T20:53:52Z      | ✓   | docs: 15 sorun yerel kanıt ara sonuçları                                                                                                                                                          |
| `e368fd7ec6f4b97b06215817536c1dfc0b87ac46` | 2026-10-08T21:11:17Z      | —   | fix(agents): Astra 1. tur — onarım paketine OPTION_SELECTED adımı, Dice benzerliği, tam metin boyut sınırı, ilgi ön sorgusu ve engel filtresi                                                     |
| `9c2f7f7937b8258b4289527b94c3739e8e158714` | 2026-10-08T21:18:35Z      | —   | fix(agents): Astra 2. tur — tam metin bütçesi başlık başına adil ve entry başı 1200; ilgi ön sorgusu kelime başı kök/yumuşamış kök                                                                |
| `220ff9b8dcc76f63928a92833bc031c54ac9d2b9` | 2026-10-08T21:22:10Z      | —   | fix(agents): Sol 6.1 — tam metin kırpılmaz (başlık başı pay yeter), kısa kökte tam kelime, noktalama sonrası kelime başı                                                                          |
| `0193a905cdb6841b23201e10b1ff7aaf5f36d4f2` | 2026-10-08T21:26:43Z      | —   | fix(agents): Sol 6.1 2. tur — ilgi ön sorgusu PostgreSQL kelime sınırı düzenli ifadesiyle (noktalama ve kısa kök)                                                                                 |
| `aa178ec13a9fdbb6334b724ed5de28cda371b1b1` | 2026-10-08T21:34:56Z      | —   | test(agents): ilgi aday sorgusunu doğrudan sına (kısa kök gürültüsü, noktalama, yumuşama)                                                                                                         |
| `01cfe1b6b530389d83f688a393ace447ee93fea0` | 2026-10-08T21:34:57Z      | —   | Merge remote-tracking branch 'origin/main' into fix/dolgu-20261008                                                                                                                                |
| `bb0c5c80e5f20439417d37e50ba2c36c9f881aec` | 2026-10-08T21:43:36Z      | —   | chore: agent:diversify-writers-d2 operatör komutu                                                                                                                                                 |
| `c48c17430ca45a76cf6aa6ad93be847a8b5bb73b` | 2026-10-08T22:00:32Z      | —   | chore: persona mesafe raporu yeni renderer ile (anayasa persona metninden çıktı)                                                                                                                  |
| `e782daee4611be9be1af094f645c347e10f48464` | 2026-10-09T01:16:52+03:00 | ✓   | Merge pull request #355 from cerncaycisi/fix/dolgu-20261008                                                                                                                                       |
| `ddbd674ff657523022ca5572aa3860a6b65b4a22` | 2026-10-08T22:44:12Z      | ✓   | docs: 15 içerik sorunu paketi canlıda (e782dae), dağıtım ve yerel kanıt makbuzu                                                                                                                   |
| `d4d9fc4b2196b331806b9ace04d6a90d34bcfc75` | 2026-10-09T07:14:08Z      | —   | feat(ui): koyu tema varsayılan, başlık tıklamasında kaydırma düzeltmesi                                                                                                                           |
| `abb61ee063649a41299df5a284ddc6866607149f` | 2026-10-09T07:45:41Z      | —   | feat(ui): açık tema sade beyaz (seçenek B), kontrast AA                                                                                                                                           |
| `22f1714db7be1adf4ec8d89f39ec977f97ec3f3b` | 2026-10-09T11:07:36+03:00 | ✓   | Merge pull request #356 from cerncaycisi/feat/gorsel-20261009                                                                                                                                     |
| `0e8dca36773839e5cf2ce15543dbf6463d1d1354` | 2026-10-09T08:40:38Z      | ✓   | docs: UI sürümü canlıda (22f1714, #356), dağıtım makbuzu ve E7 notu                                                                                                                               |
| `b666e41eee3140700ff3d62647bb25c2f3f0e048` | 2026-10-09T09:20:49Z      | —   | fix(ui): altbilgi içerik sütununa; sol çerçeve kısa sayfalarda kayıp kesilmiyor                                                                                                                   |
| `595c9fcfbf1915b34c1b4951f2435d404c194458` | 2026-10-09T12:36:17+03:00 | ✓   | Merge pull request #357 from cerncaycisi/fix/kaydirma-20261009                                                                                                                                    |
| `29c507c7fe067701eee9f2ba097cfe9f8ad12756` | 2026-10-09T09:49:02Z      | —   | wip: son okuma — yayım öncesi yalnız parça silen çağrı (profil 58)                                                                                                                                |
| `b7cb5da64b29fbc93adb9fbb68fc3fb851d5f429` | 2026-10-09T10:27:42Z      | ✓   | docs: sol çerçeve düzeltmesi canlıda (595c9fc, #357), imaj temizliği makbuzu                                                                                                                      |
| `2bda5d1efdd25feaf7aca07b6798a3dc3f3a7bb8` | 2026-10-09T11:07:49Z      | —   | wip: son okuma — silmeden sonra en az 20 kelime kalmalı                                                                                                                                           |
| `e04a63a40bede3e0f59040253925ea93d9cb063f` | 2026-10-09T11:32:31Z      | —   | wip: son okuma — Astra 1. tur: yenilikten önce, onarım bütçesi, korunan aralıklar, kaynaklı entry dışarıda                                                                                        |
| `d5626ce38e856fb34880586b8999f9b15d29f17d` | 2026-10-09T12:42:48Z      | —   | wip: son okuma — Astra 2. tur: onarımın yenilik payı, yenilik süre payı, belirsiz alıntı                                                                                                          |
| `1406375974596f67c338dd2b804a548178f09259` | 2026-10-09T13:49:59Z      | —   | wip: son okuma — Sol 6.1: yenilik süre payı, tırnak sırası; kaynaklı entry'de yalnız son parça                                                                                                    |
| `6676181751d030268039beaeb7fcc026bc1da9e7` | 2026-10-09T13:57:35Z      | —   | style: openapi finalRead biçimi                                                                                                                                                                   |
| `8c9cfe0da51d5c765e9d77e1a94b8fd5a9c0c693` | 2026-10-09T14:00:03Z      | —   | wip: son okuma — Sol 6.1 2. tur: ilke kontrolü parmak izi, düz/yönlü tırnak eşlemesi                                                                                                              |
| `64f4726e4bc89649d97ca4242612b250d215e008` | 2026-10-09T14:45:36Z      | —   | wip: son okuma — Sol 6.1 3. tur: cümle bazında ciddi iddia, başlık anayasası, kapanış tekrarı, NFKC tırnak                                                                                        |
| `d623231f6b9c0711e3daab6d793fc5e1304335e1` | 2026-10-09T14:53:47Z      | —   | wip: son okuma — Sol 6.1 4. tur: doğruluk çekincesi kilitli, suç isnadı dışarıda; kanıt belgesine 9 ve 12                                                                                         |
| `f24a4dc290ec6fa752ffde1c08447fd405a2d972` | 2026-10-09T15:28:29Z      | —   | wip: son okuma — Sol 6.1 5. tur: güçlü kanıt isteyen gövde dışarıda                                                                                                                               |
| `c206fcde7e7bb7fbda3b3f4e9828bf46fd6f0967` | 2026-10-09T15:34:02Z      | —   | wip: son okuma — Sol 6.1 6. tur: ciddi iddia işareti çerçeveden bağımsız elenir                                                                                                                   |
| `c069244e4de411c079f398aea7ff89d7941052d8` | 2026-10-09T15:34:31Z      | —   | docs: yerel kanıt — 1 son okuma sonuçları                                                                                                                                                         |
| `08fecd2b0cd7d76c128b0fb8aecff833ed91c0cf` | 2026-10-09T15:39:19Z      | —   | wip: son okuma — Sol 6.1 7. tur: ciddi iddia taraması satır sonundan etkilenmez                                                                                                                   |
| `ef958c9d39ac480a942631690f64a7e7d9a065bf` | 2026-10-09T15:46:54Z      | —   | wip: son okuma — Sol 6.1 8. tur: büyük harf varyantları, geniş doğruluk çekincesi kilidi                                                                                                          |
| `76149ef336f14c9c7d00d695ba07fcea8db4f439` | 2026-10-09T15:55:22Z      | —   | test: son okuma — kullanılmayan değişken                                                                                                                                                          |
| `844c8034abbd7bdc55dfa885a8c50a81c04d05ec` | 2026-10-09T15:56:58Z      | —   | wip: son okuma — Sol 6.1 9. tur: kaynaklı entry son okumaya girmez                                                                                                                                |
| `ff19a8b51d642bf0b290a6b4aaeab31d59d6a25d` | 2026-10-09T16:02:15Z      | —   | docs: yerel kanıt — son okuma sonuçları kaynaklılar çıkarılmış hâliyle                                                                                                                            |
| `a22caf8c9fe1adc2f529343ba6c93d161fc7c42e` | 2026-10-09T19:25:02+03:00 | ✓   | Merge pull request #358 from cerncaycisi/fix/son-okuma-20261009                                                                                                                                   |
| `d0d48094818fccc379253ba3daaf1f6c07c8a545` | 2026-10-09T16:53:49Z      | ✓   | docs: son okuma canlıda (a22caf8, #358), makbuz ve plan                                                                                                                                           |
| `6f47888017562aa16ff8f5069421bf8a6a3addb0` | 2026-10-09T17:02:56Z      | ✓   | docs: 15/15 — son okuma ikinci ölçüm (so7) ile 1 kapandı                                                                                                                                          |

</details>

### 13.7 Tekrarlama sınırları ve rapor bütünlüğü

Canlı metin değişebilir; hash ve zaman, bu raporun hangi kesiti gördüğünü belirler. Aynı GET'i yarın yapmak aynı veri setini garanti etmez. Hukuk, rakip ve arama rehberi bağlantıları bulgunun yanında verilmiştir; erişilemeyen mevzuat/İnci/HIVE sayfaları doğrulanmış kaynak sayılmadı. Üretim işletimiyle ilgili hiçbir rakam bağımsız sunucu ölçümü diye sunulmadı.

Bu incelemede yalnız bu rapor dosyası eklendi. Kod, PLAN, STATUS, ATTEMPT_LOG, kullanıcı verisi ve üretim değiştirilmedi. Öneriler uygulanmış iş değildir. Başlangıçtaki PLAN test hatası bu rapor kapsamında giderilmedi; 15/15 kapanışının ve CI durumunun yeniden doğrulanabilmesi için aynen kaydedildi.

Son dosya doğrulaması: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm requirements:check` PASS. Odaklı testte başlangıç SHA'sından gelen PLAN uzunluk hatası FAIL. Hazırlık sırasında iki biçim kontrolü tamamlanmamış rapor metinlerini yakaladı; kendi raporum biçimlendirildi, diğer rapora dokunulmadı ve son genel kontrol tekrarlandı. Bu durumlar uygulama regresyonu veya son okuma karşı örneğinin otomatik testte yakalandığı biçiminde sunulmadı. Kullanıcının yalnız bu dosyaya dokunma sınırı korundu. **[kaynak: yerel doğrulama çıktıları; ORTA]**
