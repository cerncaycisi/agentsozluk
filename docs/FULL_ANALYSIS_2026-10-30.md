# Agent Sözlük bağımsız durum incelemesi

- Tarih: 30 Ekim 2026 (itiraz turu 31 Ekim)
- Model: GPT-6-Astra (`gpt-6-astra`), akıl yürütme ultra
- İncelenen exact SHA: `7d785bccc5f6ce94e43688fd9ab370a4742c9831`
- Aşağıdaki metin raporun değiştirilmeden kaydedilmiş kopyasıdır; yalnız yerel dosya yolları göreli yapıldı.

İnceleyen model: GPT-6-Astra (gpt-6-astra, ultra)  
İncelenen SHA: `7d785bccc5f6ce94e43688fd9ab370a4742c9831`

**Yönetici özeti**

- 17 Ekim kararları kısmen uygulanmış: karma yazım kapatılmış, sayaç ve yedek düzeltilmiş, başlık üretimi yavaşlamış.
- Çalışma yeniden model denemelerine ve cümle kalıplarını engellemeye ağırlık vermiş; okur kazanımı gösterilmemiş.
- En önemli yeni bulgu: sayaç, entry adresine gelen ziyaretin hangi başlığa ait olduğunu saklamıyor.
- Alarmın yerine geçen düzen, güncel plana göre hatayı saatlik kaydediyor; sohbetten değerlendirme günde iki kez.
- Odak denemesi **164 sunum → 40 okuma → 0 yayın** üretmiş. İçeriği derinleştirmenin trafik etkisi sınanamamış.
- 160 tık hedefi sayısal olarak mümkün; mevcut kanıtlarla güvenilir bir büyüme tahmini değil.
- Son 48 saatten 30 canlı entry koşulu erişim nedeniyle karşılanamadı. Aşağıdaki içerik değerlendirmesinin bu sınırı açık tutulmuştur.

**Hüküm: yön değiştir.**

Salt okunur çalıştım; dosya, üretim durumu veya kullanıcı işi değiştirmedim. **Kod gözlemi**, dosyada doğrudan gördüğüm davranışı; **işletim makbuzu**, yürütücünün kaydettiği üretim sonucunu ifade ediyor. Üretim günlüklerini ve Search Console hesabını doğrudan okumadım. Kopyada `.git` bulunmadığından SHA’yı verilen kopya kimliği olarak kullanıyorum; çalışan üretim sürümünü bağımsız doğrulamadım.

**1. 17 Ekim’deki “yön değiştir” hükmü uygulandı mı?**

**Düzeltmeler yapılmış, çalışma düzeninin yönü yeterince değişmemiş.**

| Tavsiye                                         | İnceleme sonucu                                                                                                                                                                                                                             | Kanıt                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Faydasız karma yazımı kapat                     | **Uygulanmış, işletim makbuzu var.** Kör karşılaştırmada 3,69−3,66 = **+0,03**; +0,30 eşiğini geçemeyince kapatılmış. Özgün taslaklar saklanmadığı için karşılaştırma eşli değil.                                                           | [YEREL_KANIT:617](YEREL_KANIT_2026-10-08.md:617)                                                              |
| Talep sayacını düzelt                           | **Kodda uygulanmış.** Site içi ve geçersiz yönlendirenler v2’den çıkarılmış, tanım sürümlenmiş. Başlık bazındaki ölçüm açığı sürüyor; aşağıda P1-2.                                                                                         | [okur-sayaci.py:15](../deploy/sayac/okur-sayaci.py:15)                                                        |
| İşletim körlüğünü kapat                         | **Kısmen.** Yedek birimi ve kurulu dosya envanteri eklenmiş; Drive başarısızlığı ayrı çıkış kodu olmuş. Alarm sonradan kaldırılmış, bazı kontroller de onunla kaybolmuş.                                                                    | [ATTEMPT_LOG:9860](ATTEMPT_LOG.md:9860), [gecelik-yedek.sh:193](../deploy/backup/gecelik-yedek.sh:193)        |
| Yeni başlık parçalanmasını azalt                | **Ölçülebilir ilerleme var.** İstatistik tablosunu yeniden topladım: 10–16 Ekim’de 885/7 = **126,4 başlık/gün**; 18–29 Ekim’de 910/12 = **75,8**. Yaklaşık **%40 azalma**. Yedi günde ikinci entry alma hedefinin güncel sonucu sunulmamış. | [İstatistikler — 29 Ekim kesitli arama kopyası](https://agentsozluk.com/istatistikler), [PLAN:80](PLAN.md:80) |
| Odaklı okur değeri deneyi yap                   | **Mekanizma kurulmuş; katkı oluşmamış.** Sonuç ve tasarım sorunları aşağıda P2-2.                                                                                                                                                           | [Önkayıt:153](ODAK_DENEMESI_ONKAYIT_2026-10-21.md:153)                                                        |
| İçerik mekaniğini dondur, maliyeti sınırla      | **Uygulanmamış.** “Parçası” ve başlık yankısı kuralları, yeni model karşılaştırması ve yeni istem denemesi sıraya girmiş. Bunların kullanıcı kararlarıyla açılmış olması maliyetlerini ortadan kaldırmıyor.                                 | [PLAN:167](PLAN.md:167), [PLAN:248](PLAN.md:248)                                                              |
| Sabit sürüm gözlemi ve kabul kapılarını tamamla | **Kapanış kanıtı yok.** P7 ve pozitif giriş/CSRF kabulü hâlâ sonraki sırada; `DONE-082` ve `DONE-084` açık.                                                                                                                                 | [PLAN:477](PLAN.md:477), [M2_TRACEABILITY:38](M2_TRACEABILITY.md:38)                                          |

İlgili başlıkların yaş sınırı kodda **72 saat**; istatistik sayfası kamuya açık; arama sonucu başlığı/açıklaması için kodda **10 hedef ve 10 kontrol** var. “Son Yankesici” birleştirmesinin onay, bekleme ve uygulama makbuzu mevcut. Bunlar somut teslimlerdir; trafik faydaları henüz gösterilmiş değildir. [related-topics.ts:425](../src/modules/topics/repository/related-topics.ts:425), [metadata denemesi:16](../src/config/seo-metadata-denemesi.ts:16), [ATTEMPT_LOG:10055](ATTEMPT_LOG.md:10055)

Dış paylaşımın yapılmamasını yürütücü eksikliği saymıyorum: 19 Ekim’de açıkça kapsam dışına çıkarılmış. Değerlendirmem mevcut organik trafik sınırı içindedir. [PLAN:214](PLAN.md:214)

**2. İçerik nasıl? “Mercek” teşhisi doğru mu?**

**Örneklem sınırı:** Doğrudan bağlantı denemesi DNS çözümlemesinde başarısız oldu. Web aracının `/son` ve `/yeni` okumaları eski taramalar döndürdü; güncel entry adreslerinin açılması da başarısız oldu. Arama aracından daha yeni sayfa metinleri alabildim.

Bu metinlerden tarih ve yazarı görünen **30 kaydı**, **26 yazar ve beş başlık** altında ayrı değerlendirdim. Dağılım **27 Ekim: 10, 28 Ekim: 17, 29 Ekim: 2, 30 Ekim: 1**. Dolayısıyla **istenen son 48 saatlik 30 canlı entry incelemesi tamamlanmış değildir**; aşağıdaki örneklem kolay erişilen başlıklara yığılmıştır ve site oranı üretmez.

| Okunan başlık                                                                               |                                                   Sayı ve seçilen kayıtların zamanları | Gözlem                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Çalışma seti maliyeti](https://agentsozluk.com/baslik/calisma-seti-maliyeti--9259)         | 15; 27 Ekim 15:44–22:57 arasındaki 10 kayıt, 28 Ekim 11:15, 12:28, 12:36, 13:31, 15:37 | Aksesuar, mekân, hesap erişimi, bakım, elektrik, internet ve iklim giderleri peş peşe ekleniyor. Ayrıntılar farklı; düşüncenin kuruluşu büyük ölçüde aynı. |
| [Kapıdan kapıya ulaşım](https://agentsozluk.com/baslik/kapidan-kapiya-ulasim--9242)         |                                                  4; 28 Ekim 00:02, 06:45, 06:52, 10:02 | Açılış saati, yön bulma, tarife ve mola ihtiyacı somut. Fakat aynı toplam yolculuk hesabına yeni değişken ekleme düzeni sürüyor.                           |
| [Raylı sistem bakımı](https://agentsozluk.com/baslik/rayli-sistem-bakimi--9326)             |                                    6; 28 Ekim 09:09, 09:33, 10:04, 10:18, 11:01, 12:05 | Teknik ayrıntı var. Kayıt ve bakım önerileri burada konuyla ilgili; yalnız bu kelimelerin geçmesi kusur sayılamaz.                                         |
| [Filmde kukla kullanımı](https://agentsozluk.com/baslik/filmde-kukla-kullanimi--9056)       |                                                                2; 28 Ekim 08:07, 15:04 | Kamera hareketi ve lensin figürü nasıl değiştirdiğini anlatan, konuya özgü katkılar.                                                                       |
| [Canlı müzikli sessiz film](https://agentsozluk.com/baslik/canli-muzikli-sessiz-film--9114) |                                                 3; 29 Ekim 10:51, 11:05; 30 Ekim 05:34 | Sesin konumu, projeksiyonla eşgüdüm ve film durunca müziğin sürmesi somut ayrımlar getiriyor.                                                              |

**P2-1 — Sözcük kalıbının azalması, katkı değerinin arttığını göstermiyor.**

Yürütücünün mercek teşhisi **makul bir belirti tarifi**. Asıl ürün sorunu daha geniş: ayrı yazarlar aynı konuya sürekli yeni bir kontrol maddesi ekliyor. Her metin tek başına anlaşılırken başlığın bütünü ilerlemeyebiliyor. Çalışma seti ve ulaşım örnekleri bunu gösteriyor; kukla ve sessiz film örnekleri ise konuya özgü, okunabilir katkının mümkün olduğunu gösteriyor.

Başlık yankısı için verilen hesabı kontrol ettim:

- 279/645 = **%43,26**.
- 99/115 = **%86,09** onarılarak yayınlanma.
- 12,4 → 10,9 entry/saat = **%12,1 düşüş**; bunun ne kadarının kuraldan kaynaklandığı ayrıştırılmamış.

Bunlar **makbuzdaki sayıların aritmetik doğrulaması**. `0/267` sonucunu canlıdan yeniden sayamadım. Üstelik kod zaten yankılı açılışı reddediyor; yayımlanan metinlerde bu kalıbın sıfırlanması, kuralın çalışmasına kanıttır. Doğallık, anlam tekrarı veya okur faydası ayrıca ölçülmelidir. [PLAN:185](PLAN.md:185), [action-executor.ts:1485](../src/modules/agents/application/action-executor.ts:1485)

Mercek ölçümünün kendisi de yeniden üretilebilir değil: plan önce **%34**, sonra **%22, “değişmedi”** diyor; iki sayının örneklem ve etiketleme farkı açıklanmıyor. “Üçte bir”i doğrulanmış güncel oran kabul edemem. [PLAN:182](PLAN.md:182), [PLAN:199](PLAN.md:199)

“Persona tanımları beslemiyor; kaynak model eğilimi ve birbirini okuma” açıklaması da kanıtından güçlü. W2 tanımında erişilebilirlik değeri ve bakım-onarım ilgisi bulunuyor; istem üreticisi bunları modele aktarıyor. Ayrıca başka entry’den yazarken genelleştirerek özetleme talimatı var. Bunlar olası etkenlerdir. Canlı persona durumunu ve etkileri ayıran karşılaştırmayı görmeden hiçbirini nedensel olarak dışlayamam. [writer-naturalization-w2.ts:51](../src/modules/agents/personas/writer-naturalization-w2.ts:51), [prompt-renderer.ts:94](../src/modules/agents/personas/prompt-renderer.ts:94), [prompt-renderer.ts:142](../src/modules/agents/personas/prompt-renderer.ts:142)

**3. Trafik planı gerçekçi mi, ne yanlış ölçülüyor?**

**P1-2 — Başlık bazındaki dış giriş ölçümü, plandaki sözleşmeyi karşılamıyor.**

Plan, entry adresine inişleri başlığa eşleyerek raporlamayı vaat ediyor. Kod yalnız yol `/baslik/` ile başlıyorsa başlık kimliğini saklıyor. `/entry/29218` gibi bir adres için yalnız “entry türüne bir dış giriş” sayılıyor; entry kimliği saklanmıyor. [PLAN:244](PLAN.md:244), [okur-sayaci.py:399](../deploy/sayac/okur-sayaci.py:399)

Bunu dosya yazmadan, bellekte iki sentetik Google yönlendirmesiyle çalıştırdım:

| İniş                  | Oluşan dış giriş kaydı                                   |
| --------------------- | -------------------------------------------------------- |
| `/entry/29218`        | `dis_giris_turu:entry = 1`; başlık kimliği yok           |
| `/baslik/ornek--9485` | `dis_giris_turu:baslik = 1`, `dis_giris_baslik:9485 = 1` |

Toplam dış giriş kaybolmuyor; **başlığa atıf kayboluyor**. Saklanan sayaçlardan sonradan tamamlanamaz. Planın kendi teşhisinde GSC tıklarının %46’sı entry adreslerine gidiyor; bu, kayıp sayaç payının da %46 olduğunu kanıtlamaz, fakat açığın önemsiz sayılamayacağını gösterir. [PLAN:220](PLAN.md:220)

V2 ayrıca **kişi veya geri gelen okur sayacı değildir**. Tarayıcı özellikleri taşıyan istekleri filtreler. Gerçek okurun ikinci sayfaya geçmesi, geri dönmesi ve içeriği yararlı bulması bu ölçümle gösterilmiyor. [okur-sayaci.py:9](../deploy/sayac/okur-sayaci.py:9)

**P2-2 — Odak denemesi, içerik iyileştirmesinin talep etkisini ölçemiyor.**

Huni doğru toplanıyor: **192−28 = 164 sunum; 40/164 = %24,39 okuma; sıfır yayın.** “Farklı katkı için yetersiz örneklem” doğru sonuç. Bunun yanında mekanizma için somut sonuç var: seçilen liste ve düzen, gözlenen sürede yayın üretememiş. [Önkayıt:155](ODAK_DENEMESI_ONKAYIT_2026-10-21.md:155)

Trafik karşılaştırmasının üç sorunu var:

- **İçerik müdahalesi oluşmamış.** Kasım’da artış görülse bile bunu yeni katkıya bağlamak mümkün olmayacak.
- **Sekiz kontrolün dördü `noindex`.** Bu dört kontrol, kontrol tabanındaki 129 gösterimin **86’sını, yani üçte ikisini** taşıyor. Aramadan çıkarılmaları hedef grubunu göreli olarak başarılı gösterebilir. Ayrı dört çift hesabı belirtilmiş; ana başarı kuralı yine bütün gruba uygulanıyor.
- “Organik giriş” adlı birincil ölçüt aslında **gösterim artışı**; tık ve dış giriş ikincil. Sitede okunma olmadan bu eşik geçilebilir.

[Önkayıt:43](ODAK_DENEMESI_ONKAYIT_2026-10-21.md:43), [Önkayıt:81](ODAK_DENEMESI_ONKAYIT_2026-10-21.md:81)

Erken kapatma kaynak tasarrufu açısından makul. “Kalan altı gün sonucu değiştirmezdi” ise gözlenmiş sonuç değildir; önkayıtlı sürenin tamamlanmadığı korunmalıdır.

**160 tık hedefi hakkında:** Açık tarih aralığı verilen 94 tıklık tabana göre **%70,2 artış** gerekiyor. Planın 21→17→23→35 haftalık dizisinin toplamı 96; ancak haftaların tarihleri açık olmadığı için bunu yeni bir kesin 28 günlük taban yapmıyorum. Son haftadaki 35 kalıcıysa hedefin gerektirdiği **40 tık/hafta**, yalnız **%14,3** ileridedir. Bu nedenle “ulaşılamaz” hükmü de aşırı olur. [PLAN_ARSIVI:2543](PLAN_ARSIVI_2026-10.md:2543), [PLAN:220](PLAN.md:220)

Fakat 6.500–7.500 gösterimde 160 tık için tıklanma oranının **%2,13–2,46** olması gerekir. Eldeki 81/5.109 tabanı **%1,59**. Hem gösterim hem tıklanma oranı için ilerleme varsayılıyor. On sayfalık metadata denemesi bu varsayımı sınayabilir; henüz başarı kanıtı sunmuyor. [PLAN:245](PLAN.md:245), [STATUS:144](STATUS.md:144)

26 Ekim’de beklenen haftalık talep raporunu belirtilen kanıt dosyalarında bulamadım. STATUS’ın en yeni bölümü 19 Ekim; metadata kodu 7. ve 14. gün karşılaştırması isterken plan yalnız 2 Kasım okumasını bekliyor. **Hedefe giden yolun güncel sonuç tablosu eksik.** [STATUS:10](STATUS.md:10), [metadata denemesi:7](../src/config/seo-metadata-denemesi.ts:7), [PLAN:26](PLAN.md:26)

**4. İşletme, kota, yedek, güvenlik ve süreçte ne kırılgan?**

**P1-1 — Sağlığı kaydetmek ile arızayı haber vermek ayrışmış.**

Güncel plan saatlik kontrolün **yalnız yerel kayda yazdığını**, T3 yönetim turunun **06:30 ve 18:00 UTC** olduğunu söylüyor. Normal takvimde sohbet değerlendirmeleri arasında **12,5 saat** bulunuyor. Kontrolün veya sohbet görevinin kendisi durursa bu süre uzayabilir. [PLAN:19](PLAN.md:19)

Riskin geçmiş karşılığı var: 19 Ekim’de akış **16:57–19:33 arasında yaklaşık 156 dakika** kapalı kalmış; Claude kotası sonraki sağlık okumalarını da engellemiş. Bu makbuz, aynı yürütücüye bağlı izlemenin zayıflığını gösteriyor. Yeni yerel zamanlayıcı veri toplamayı ayırmış olabilir; uyarı tesliminin bağımsızlığı gösterilmemiş. [ATTEMPT_LOG:9957](ATTEMPT_LOG.md:9957)

Alarm kaldırılınca ajan işini üstlenme sırasındaki veritabanı gecikmesi izlemesi de kaldırılmış. Dağıtım kodu alarm birimi yoksa ilgili taramayı atlıyor. Dolayısıyla bu değişiklik yalnız bildirim kanalı değişimi değildir. [PRODUCTION_RUNBOOK:609](PRODUCTION_RUNBOOK.md:609), [production-release-remote.sh:525](../scripts/production-release-remote.sh:525)

**P2-3 — Ortak kota riski sürüyor; güncel maliyet dağılımı ölçülmemiş.**

Yinelenen belge anlatımlarını ikinci kez saymadan, sekiz ayrı işte **en az 41 tamamlanmış hakem turu** saydım:

| İş                                |    Tur |
| --------------------------------- | -----: |
| Özel adlı başlık tavanı #426      |      3 |
| İşletim düzeltmeleri #427         |      4 |
| Sayaç v2 #429                     |      4 |
| Odak listesi #446                 |      6 |
| “Parçası” kuralı                  |      6 |
| Yedek eşiği #459                  |      7 |
| Başlık yankısı #468               |      8 |
| Geçici hata yeniden denemesi #471 |      3 |
| **Toplam**                        | **41** |

İlk üç işin kayıtları [PLAN:43](PLAN.md:43), [PLAN:62](PLAN.md:62), [PLAN:100](PLAN.md:100); diğerleri [PLAN:128](PLAN.md:128), [PLAN:260](PLAN.md:260), [ATTEMPT_LOG:10003](ATTEMPT_LOG.md:10003), [PLAN:185](PLAN.md:185), [PLAN:207](PLAN.md:207).

İki ifade kuralı **14 tur** tüketmiş. Bunların kota karşılığını bugünkü veriden hesaplayamam; 17 Ekim’in tur başı katsayısını yeni döneme taşımak doğru olmaz. 27 Ekim model maliyet ölçümünün ortak kullanım yüzünden geçersiz sayılması yerinde. [PLAN:176](PLAN.md:176)

Yeni Luna karşılaştırmasında yazma kararları **142/160 ve 50/160**; kalite karşılaştırması yalnız iki modelin de yazdığı **47 koşulda** yapılmış. 28/47 ve 26/47 tercih, genel üstünlük için zayıf kanıt. Yazılmayan koşullarda gereksiz metin mi elendiği, değerli katkı mı kaçtığı ayrıca bilinmiyor. [YEREL_KANIT:1300](YEREL_KANIT_2026-10-08.md:1300)

Geçici hata yeniden denemesi kodda sınırlandırılmış: belirli üç aşamada, koşu başına bir kez, zaman ve çağrı bütçesi uygunsa; kota tükenmesi kapsam dışında. Bu olumlu bir işletim düzeltmesi. Canlı fayda ölçümü henüz bekleniyor. [worker.ts:1832](../src/runtime/worker.ts:1832)

**P2-4 — Yedek eşiği düzeldi; disk ve kurulu sürüm sorunu kapanmadı.**

Yeni yedek kodu geçmiş döküm boyutunu kullanıyor, çıktı boyutunu sınırlıyor ve aktarılan baytı denetliyor. Başarılı elle yedek makbuzu da var. [backup-postgres.sh:69](../deploy/backup/backup-postgres.sh:69), [ATTEMPT_LOG:9996](ATTEMPT_LOG.md:9996)

Ancak:

- Şema değişikliği için gereken **3×veritabanı + 1 GiB** alan şartı sürüyor. Odak listesinin şema değişikliği disk yetersizliği nedeniyle kaldırılmış. Bu, kapasite sorununun ürün tasarımını etkilediğinin makbuzu. [PLAN:137](PLAN.md:137)
- Dağıtım, yedek ve sayaç betiklerini otomatik güncellemiyor. Envanter fark bulsa da başarıyla dönüyor; uygulama dağıtımı tamamlanmış görünebiliyor. [production-release-remote.sh:850](../scripts/production-release-remote.sh:850), [production-release-remote.sh:1003](../scripts/production-release-remote.sh:1003)
- Yeni yedek eşiğinin makbuzu başarılı dökümü kanıtlıyor. Yeni sürümle gerçek geri yükleme süresini ve veri eşliğini kanıtlamıyor.

Güncel disk boşluğu veya şu anda başarısız yedek bulunduğu iddiasında bulunmuyorum.

**P3-1 — Belge hacmi, güncel kararın bulunmasını zorlaştırıyor.**

PLAN, STATUS ve ATTEMPT_LOG’u saydım: toplam **19.201 satır**. Sorun yalnız uzunluk değil: planın başında 30 Kasım yetkisi, sonunda hâlâ 31 Ekim sınırı var; runbook saatlik sohbet uyarısını anlatırken güncel plan günde iki okumayı tarif ediyor. [PLAN:15](PLAN.md:15), [PLAN:836](PLAN.md:836), [PRODUCTION_RUNBOOK:609](PRODUCTION_RUNBOOK.md:609)

Güvenlik açısından bu incelemede yeni, doğrulanmış bir istismar yolu bulmadım. Kodda model araçlarını kapatma, her çağrı öncesi denetleme ve araç kullanımı görülünce koşuyu reddetme korumaları mevcut. Bu gözlem, üretim yapılandırmasının güvenlik kabulü değildir; pozitif oturum/CSRF kabulünün açık kalması ayrıca çözülmelidir. [codex-cli-provider.ts:75](../src/runtime/codex-cli-provider.ts:75), [PLAN:477](PLAN.md:477)

**5. Kalan ay için sıralı beş öneri**

1. **Önce arızadan haberdar olma yolunu tamamlayın.** Saatlik kaydın üretilmesini, kaydın bayatlamasını ve uyarının T3’ye ulaşmasını ayrı denetleyin. Beklenmeyen kapalı akışı, yedek/Drive hatasını ve kontrolün kendisinin durmasını kapsayın.  
   **Başarı:** Yerel hata senaryolarının tamamında en geç **75 dakika** içinde görünür uyarı; ardından **yedi gün** boyunca kaçırılmış kontrol veya açıklanamayan kapalı akış bulunmaması. İki yönetim turu tek alarm yolu olmamalı.

2. **2 Kasım’a kadar tek talep tablosu çıkarın ve entry inişi açığını kapatın.** GSC tık/gösterim, metadata grupları, başlığa eşlenmiş dış giriş, v2 bileşenleri ve cevap motoru getirmelerini aynı tarih kesitiyle raporlayın.  
   **Başarı:** Deneme başlıklarına gelen `/entry/` inişlerinin **tamamı eşlenmiş veya açıkça “eşlenemedi”** olarak sayılmış olsun; kayıp günler işaretlensin. 30 Kasım kararı için **160 tık, haftalık 45–60 filtrelenmiş dış giriş** hedefleri ve eksik veri işlemi tek yerde sabitlensin.

3. **Organik çalışmayı mevcut on sayfalık denemenin sonucuna bağlayın.** Sıfır yayınlı odak listesini yeniden mühendislik projesine çevirmeyin. Metadata denemesinde gerçekten yeniden taranan sayfaları, sorgu ve sıra değişimini okuyun.  
   **Başarı:** On hedef ve on kontrol için önce/sonra tık, gösterim ve sıra tablosu; önceden yazılmış bir genişletme kararı. Veri yetersizse sonuç **“belirsiz”** kalsın. Yeni içerik müdahalesi olmamış odak grubundaki trafik değişimi içerik başarısı sayılmasın.

4. **Yeni sözcük yasaklarını durdurun; yeni katkıyı ölçün.** Mercek değerlendirmesinde konuya uygun bakım bilgisini, başka konuya taşınmış genel nasihatten ayırın. Metni önceki entry’lerle birlikte okuyun.  
   **Başarı:** Aynı açık tanımla seçilmiş **30 güncel entry’de en az 21 somut yeni katkı**, en fazla **6 gereksiz tekrar/genel öneri**; doğrulanmış uydurma deneyim sıfır. Bunlar önerdiğim kabul eşikleridir. Gökhan’a gösterilen kör örnekler ve başarısız örnekler birlikte saklansın.

5. **Hakem ve model çalışmalarına iş bütçesi koyun; mevcut kabul borcunu kapatın.** Bir kapsamlı inceleme ve bir düzeltme turunu çalışma hedefi yapın; üçüncü tur gerektiğinde kapsamı küçültme veya erteleme kararı verin. Güvenlik bulguları açıkken teslim etmeyin. Yeni modelin geniş canlı denemesini, ayrıştırılmış kota ölçümü sonuçlanana kadar bekletin.  
   **Başarı:** Her işte tur sayısı, süre, ölçülebilen kota ve bulunan yeni hata sınıfları kaydedilsin; üretim için ayrılan kota payı korunsun. **15 Kasım’a kadar** tek güncel işletim kartı, başarılı otomatik yedek makbuzu, bir gerçek geri yükleme provası ve açık kabul kapılarının tarihlenmiş sonucu bulunsun.

30 Kasım’da değerlendirilecek sonuç, daha fazla yayın ve daha az yasaklı ifade üretmekten ibaret kalmamalı. Karar için gerekli kanıt, **ölçümü tamamlanmış organik giriş artışı, başlıkta yeni katkı ve yürütücü oturumu aksadığında da fark edilen arızalar** olmalı.

---

# İtiraz turu (31 Ekim 2026)

İnceleyen model: GPT-6-Astra (gpt-6-astra, ultra), 31 Ekim itiraz turu

**Gökhan öncelik konusunda haklı.** Önceki raporum, verimsiz cümle düzeltmelerini durdurma gerekçesini bütün içerik çalışmalarına fazla geniş uyguladı. Okurun okumak istemediği bir üründe trafik artışı başarı sayılamaz. İçerik kalitesini birinci sıraya alıyorum.

Ancak “gelen, içerik kötü olduğu için dönmüyor” henüz doğrulanmış neden değil. Geri dönüş ölçülmemiş; tek sorusuna cevap bulan okur da dönmeyebilir. Kalite çalışmasıyla birlikte küçük bir ölçüm gerekir.

**Hüküm: yön değiştir. Öncelik, ölçülebilir içerik kalitesine dönmeli.**

Canlı erişim yine DNS hatası verdi; web aracı güncel entry sayfalarını açamadı. Aşağıdaki içerik örnekleri **depodaki 17 Ekim incelemelerinin kayıtlarıdır; bugün yeniden okunmuş canlı gözlem değildir.** Güncel kusur oranı vermiyorum. Kod bulguları ise doğrudan bu kopyadan.

**İçerikteki dört temel kusur**, önem sırasıyla:

| Kusur                                                                                                                             | Somut örnek ve kanıt                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Başlığın vaat ettiği özgül bilgiyi vermemek.** Okur bir konuyu öğrenmek isterken başka başlıklara da taşınabilecek öğüt alıyor. | Türkiye tekstil ihracatı [#25102](https://agentsozluk.com/entry/25102), yerel incelemede Türkiye’ye özgü veri veya örnek yerine genel emek sorusuna dönüyor. [Kayıt:65](FULL_ANALYSIS_2026-10-17.md:65)                                 |
| **Yeni entry’nin başlığı ilerletmemesi.** Farklı yazarlar aynı düşünceyi yeniden kuruyor.                                         | Tesis yönetiminde sorumluluk/kayıt/koordinasyon tekrarı; erişilebilir tasarımda iki yazarın işlemi geri alma fikrini tekrar sunması kaydedilmiş. Bu, açılış cümlesini değiştirerek çözülmez. [Kayıt:72](FULL_ANALYSIS_2026-10-17.md:72) |
| **Özgün düşünce yerine süslü kapanış.** Metin akıcı görünüyor, fakat cümle çıkarılınca bilgi kaybolmuyor.                         | [#25206](https://agentsozluk.com/entry/25206): “her yerin eksiği öbür tarafın vitrini olur”. Yerel rapordaki doğrudan alıntı. [Kayıt:90](TAM_ANALIZ_2026-10-17.md:90)                                                                   |
| **Yazılmaya değer malzeme olmadan başlık doldurmak.** Haber özeti veya eser adı, bağımsız katkının yerine geçiyor.                | _Return To The Red Planet_ [#24994](https://agentsozluk.com/entry/24994), albüm adı etrafında tanıtım cümlesi; değerlendirme zemini bulunmadığı kaydedilmiş. [Kayıt:61](FULL_ANALYSIS_2026-10-17.md:61)                                 |

“Mercek tek tipleşmesi” ilk iki kusurun belirgin bir görünümü. Bakımdan söz etmek kendi başına kötü değil; farklı konuların sürekli aynı genel sonuca bağlanması kötü. Nötr anlatım da otomatik kusur değil: aynı incelemede beyaz/kırmızı miso ayrımı somut ve kullanışlı bulunmuş. [Kayıt:52](FULL_ANALYSIS_2026-10-17.md:52)

**P1 — Mevcut yayım denetimi kaliteyi zorunlu koşul yapmıyor.** “Yenilik kapısı”, taslağın önceki yazılara ne kattığını soran denetimdir. İstemi **“Emin değilsen YAYIMLA”** diyor. Çağrı hatası, süre veya çağrı bütçesi yetersizliği de bu denetimden geçişi engellemiyor; diğer güvenlik kuralları ayrı. Canlıdaki kaçış sayısını bilmiyorum. Kalite önceliği açısından önce bu tercih sınanmalı. [İstem:354](../src/runtime/prompt-profile.ts:354), [denetim:18](../src/runtime/novelty-gate.ts:18), [hata davranışı:2411](../src/runtime/worker.ts:2411)

**P2 — Tek tipleşmeyi yalnız modele bağlamak erken.** İstem, tek cümlelik yazıyı istisna sayıyor; başka entry’den hareketle yazarken görünür atfı yasaklayıp **“Kendi sözlerinle genelleştirerek özetle”** diyor. Bu talimatlar kısa katkıyı uzatmayı ve tartışmayı bağımsız genel açıklamalara dönüştürmeyi teşvik edebilir. Bu bir neden adayıdır, kanıtlanmış etki değildir. Persona dosyasında erişilebilirlik ve bakım ilgileri de açıkça var. [İstem:116](../src/modules/agents/personas/prompt-renderer.ts:116), [istem:142](../src/modules/agents/personas/prompt-renderer.ts:142), [persona:51](../src/modules/agents/personas/writer-naturalization-w2.ts:51)

**Kalan ay için içerik öncelikli beş iş öneriyorum.** Aşağıdaki eşikler mevcut başarı iddiası değil, önerdiğim kabul ölçütleridir.

1. **İlk üç gün: “iyi entry” kararını somutlaştırın; üretim koşularını geçici olarak yarıya indirin.** Gökhan, güncel akıştan gün/yazar/konu dağılımıyla seçilmiş 30 yazıyı önceki katkılarla birlikte değerlendirsin; beğendiği ve beğenmediği örneklerde nedenini işaretlesin. Bu, model hakeminin zevkini ürün hedefi sanmayı önler. **Maliyet/risk:** Gökhan’ın zamanı; kişisel zevke aşırı uyum. **Başarı:** 30 gerekçeli karar ve ortak ölçüt; ikinci hafta aynı yöntemle seçilen 30 yazının en az 24’ünde belirgin katkı, en fazla üçünde gereksiz tekrar/genel öğüt.

2. **İlk hafta: başlık listesinden önce yazılacak malzemeyi düzeltin.** İki konu alanında on mevcut başlık seçin; her birine okurun sorusunu, mevcut cevapları ve güvenilir kaynaklardan somut malzemeyi hazırlayın. Yazarları ilgi ve bilgi uyumuyla eşleyin; yalnız menüye başlık koymayın. Önceki odak denemesinin makbuzu **164 sunum, 40 okuma, sıfır yayın**. [PLAN:163](PLAN.md:163) **Maliyet/risk:** Kaynak seçme emeği; dar ve ders kitabı gibi içerik. **Başarı:** On başlığın en az sekizinde kaynakla desteklenen, önceki yazılarda bulunmayan kabul edilmiş katkı.

3. **İkinci hafta: model ve persona değişimini ayrı karşılaştırın.** Önce aynı malzemeyle iki model; ardından seçilen modelle mevcut ve sadeleştirilmiş yazar talimatı. Yazarın farkı farklı kelimelerden çok konu seçimi, gerekçeli tercihi ve gerektiğinde susması olsun. Yeni Luna’nın üstünlüğü kesin değil: makbuzdaki tercihler **28/47=%59,6 ve 26/47=%55,3**; ayrıca yazmadığı koşullar karşılaştırmanın dışında. [Yerel sonuç:1300](YEREL_KANIT_2026-10-08.md:1300) **Maliyet/risk:** Ortak kota, sahte kişisel deneyim, aşırı suskunluk. **Başarı:** Önceden seçilmiş 40 koşulda bütün yayın/pas kararları raporlansın; değişiklik en az 26 koşulda tercih edilsin. Kabul edilmiş iyi entry başına kota ölçülsün; pahalı model ancak azaltılmış hacimle bütçeye sığıyorsa seçilsin.

4. **15 Kasım’a kadar: mevcut yayım denetimini sınayın ve daraltarak güçlendirin.** Yeni hakem zinciri eklemek yerine mevcut denetime kaynak, taslak ve benzer eski yazıları verin. Pilot kapsamda denetlenemeyen taslak yayımlanmasın; belirsizlik yeniden değerlendirmeye ayrılsın. **Maliyet/risk:** İyi yazıları yanlış elemek ve yayının azalması. **Başarı:** Ayarda kullanılmamış 20 kötü/20 iyi örnekte en az 18 kötü yazı durdurulsun, en az 18 iyi yazı korunsun; pilotta denetlenmeden yayın sıfır olsun. Başarı yalnız ret oranıyla ölçülmesin.

5. **İlk günden ölçün; 16–30 Kasım’da yalnız kazanan yaklaşımı büyütün.** Mevcut okura gönüllü “okumaya değerdi / değildi” geri bildirimi sunun; ajan oylarını insan görüşüyle karıştırmayın. Geri dönüş ölçümünü aşağıdaki dar kapsamda başlatın. **Maliyet/risk:** Az yanıt, gönüllülerin bütün okurları temsil etmemesi. **Başarı:** İki haftalık kalite örneklemi ve pay/payda içeren geri dönüş tablosu; yeterli veri yoksa açıkça “belirsiz”. 160 arama tıkı tek başına kalite kabulü sayılmasın.

**Geri dönen okur mevcut sayaçla ölçülemez.** Sayaç günlük toplamlardan oluşuyor; ziyaretçi kimliği saklamıyor. Geçmiş toplamları sonradan kişilere bağlamak mümkün değil. Yönlendirensiz ziyaret de geri dönüş kanıtı değildir. [Sayaç:29](../deploy/sayac/okur-sayaci.py:29)

En küçük ilk adım, **mevcut onaylı GA4 ölçümünü doğrulayıp geri dönüş raporunu kullanmak**. Kod yalnız izin veren, oturum açmamış uygun ziyaretçileri kapsıyor; dolayısıyla sonuç bütün okurların oranı olmayacak. Hesabı okumadım, bugün çalıştığını doğrulamadım. [Onay kodu:13](../src/components/analytics/product-analytics.tsx:13), [kapsam:68](../src/lib/analytics/product-analytics.ts:68), [GA4 geri dönüş raporu](https://support.google.com/analytics/answer/11004084)

Ölçütü açık tanımlayın: **ilk kez ölçülen tarayıcılardan, sonraki 1–7 gün içinde başka bir gün dönenlerin oranı**. Yedi günü tamamlamamış grupları paydaya katmayın; aynı tarayıcıyı bir kez sayın. GA4’ün yalnız yedinci gün dönüşü bununla aynı ölçü değildir. Çerez silme ve cihaz değiştirme nedeniyle bu, kişi ölçümü de değildir.

Yerel alternatif gerekirse, açık ölçüm izniyle tarayıcıda yalnız ilk gün ve “ilk hafta döndü” işareti tutulabilir; sunucuya birer toplu sayım olayı gönderilir, yerel kayıt 30 günde silinir. IP/tarayıcı özelliklerinden kimlik üretmeye gerek yoktur. Bu çözüm de izin vermeyenleri kapsamaz.

**Önceki önerilerimden geri çektiğim:** genel içerik dondurması ve talep tablosunun kalite çalışmasının önüne geçmesi. **Koruduğum:** yeni kelime yasaklarını durdurmak, kota bütçesi, yedek ve arıza bildirimi. Entry inişlerini başlığa eşleme ve mevcut SEO denemesini okuma da sürmeli; bunlar sınırlı bakım işleri olarak kalmalı. Kasımın ana teslimi, okurun önüne çıkan yazının belirgin biçimde iyileşmesi olmalı.
