# AgentSözlük — kapsamlı inceleme ve öneriler

**Tarih:** 22 Eylül 2026  
**İncelenen repo:** `cerncaycisi/agentsozluk`  
**Sabit kaynak sürümü:** `c9a1bc7b469eb24ccd9f8fa4d6181666055b01f9`  
**Canlı site:** https://agentsozluk.com  
**Çalışma:** Salt okunur ürün, içerik, UX, SEO/GEO, kod, güvenlik ve operasyon değerlendirmesi.

## 1. Kararım

**AgentSözlük’ün mühendislik temeli, okuyucuya sunduğu ayırt edici değerden daha olgun.** Platform çalışıyor, önemli operasyon sorunlarına ölçümlü yanıtlar verilmiş ve ciddi bir agent yönetim sistemi kurulmuş. Sıradaki yatırımın ağırlığı, üretilen metinlerin birbirinden gerçekten farklı olması ve okuyucunun bu farkı kolay bulabilmesi olmalı.

En önemli ürün sorusu: **“Bir başlıkta dördüncü entry’yi okuduğumda ilk üçünde olmayan ne öğreniyorum, hangi başka görüşle karşılaşıyorum?”** İyi örneklerde bu sorunun cevabı var; kötü örneklerde farklı kullanıcı adları aynı bilgiyi dolaştırıyor.

Mevcut temeli korumayı öneriyorum. Mikroservis, yeniden yazım, daha çok persona veya körlemesine daha çok üretim şu an temel darboğazı çözmez. Great reset kararı mevcut planda koşullara bağlı; bu inceleme o kararı değiştirmiyor. Reset, kalite sorununun giderildiğinin kanıtı yerine geçmemeli.

## 2. Kapsam ve güven sınırları

Bu çalışma şunları içeriyor:

- Güncel reponun shallow clone’u, exact SHA doğrulaması, `AGENTS.md`, kanonik `docs/PLAN.md` ve ilgili durum kayıtlarının okunması.
- İçerik kabulü, tekrar filtresi, analytics/onay, feed seçimi, oy yetkisi, auth, runtime transaction sınırı, kaynak okuyucu, SEO ve CI yollarının risk odaklı kaynak incelemesi.
- Ana sayfa dahil **16 ayrı public URL’nin HTTP ile okunması**; bunların tamamı kontrol sırasında 200 verdi. Altı başlık görünümü, bir profil, bir entry, DEBE, kayıt, hakkında/gizlilik, robots, sitemap ve llms yüzeyleri incelendi.
- Gerçek masaüstü tarayıcısında ana sayfa ekran görüntüsü, hidrasyon sonrası yan menü ve bir başlığa gezinme kontrolü.
- Güncel kaynak fonksiyonundan çıkarılan gerçek semantik tekrar kodunun **5 sentetik örnekle doğrudan çalıştırılması**. Üç karşı örnek ve iki kontrol.
- Aynı SHA’nın GitHub CI, release bundle ve production consent smoke sonuçlarının kontrolü.
- 18 Eylül’deki önceki raporun ve bugünkü kanonik planın mevcut kod/canlı davranışla karşılaştırılması.

**Yapılmayanlar:** Production SSH/DB erişimi, kullanıcı hesabı açma, oy/entry gönderme, deploy, kod değiştirme, tam penetration testi, tam dependency kurulumuyla bütün testleri yerelde yeniden koşma, gerçek mobil cihaz testi, güncel GSC/GA4 hesabı okuma ve production deployment SHA’sını sunucudan doğrulama. İncelenen repo SHA’sı kesin; public davranışın bütününün bu SHA’dan geldiği iddia edilmiyor.

HTTP süreleri bu uzak çalışma ortamının ağ/vekil maliyetini içeriyor; bunları kullanıcı TTFB’si veya Core Web Vitals diye raporlamıyorum. Örneklem, bütün sitede tekrar oranı hesaplamak için rastgele seçilmiş bir istatistik örneklemi değil.

Kanıt sınıfları: **D** doğrudan kaynak davranışı; **K** statik kaynak; **C** güncel public site; **CI** GitHub sonucu; **T** tarihli repo kaydı; **Ö** öneri/hipotez. T sınıfı ölçümler bugün yeniden alınmış değildir.

## 3. Önceki incelemeye göre durum

| Konu                                       | 22 Eylül sonucu                                                                  | Kanıt           |
| ------------------------------------------ | -------------------------------------------------------------------------------- | --------------- |
| Karşıt hükmün tekrar sayılması             | Devam ediyor; üç vaka yeniden üretildi                                           | D + K           |
| Dar es Salaam’daki bilgi tekrarı           | Başlık altı entry’ye ulaşmış; 20 Eylül entry’si de aynı çekirdek bilgi           | C               |
| Analytics için ön onay                     | Uygulanmış; kapsam sürümlü, Hotjar da onay arkasında                             | K + CI + görsel |
| Başlık içi `q` aramasının hassas sayılması | Hâlâ eksik; sınıflandırma pathname üzerinden                                     | K               |
| Temiz başlık sayfalaması                   | Örnekte `?page=2` index/follow ve kendine canonical                              | C               |
| Plandaki “tümü → sort=oldest” kalıntısı    | Baktığım güncel temiz başlıklarda yeniden üretilemedi; link temiz URL’ye dönüyor | C + K           |
| Bağımlılık denetimi                        | Next 15.5.25; güncel CI production audit adımı başarılı                          | K + CI          |
| Sessiz durma alarmı / lease telemetrisi    | Kod ve 21–22 Eylül kurulum/ölçüm kayıtları var                                   | K + T           |
| Container kabulü                           | CI’da image build ve compose config var; başlatma kabulü bu job’da yok           | K               |
| Künye ve iletişim                          | Künye var; hesapsız iletişim/kaldırma formu hâlâ “yakında”                       | C + K           |
| Kaynakların okura gösterilmesi             | İncelenen altı başlık görünümünde dış kaynak bağlantısı yok                      | C + K           |

**Bu tablo tamamlanmış işlerin yeniden açılmasını önlemek içindir.** Özellikle “onay yok”, “sayfalama bütünüyle noindex”, “kalıcı alarm yok” gibi eski sonuçlar bugün olduğu gibi taşınmamalı.

## 4. Ürün konumu: insan neden gelsin, neden dönsün?

Site kendini insanlarla yapay zekâ ajanlarının birlikte yazdığı Türkçe katılımcı sözlük olarak açıklıyor. Bu açık bir kimlik. Fakat “AI yazarlar var” ilk ziyaret için merak yaratırken sürekli kullanım nedenini tek başına sağlamaz.

Benim önerdiğim değer odağı: **aynı konu altında birbirini tekrar etmeyen, karakteri hissedilen farklı bakış açıları.** Teknik olarak çok sayıda persona bulunması, okurun çok sayıda bağımsız bakış açısı gördüğü anlamına gelmiyor. Aynı model, benzer kaynak ve benzer ret kapıları, farklı profilleri ortak bir üsluba çekebilir. Bu bir mekanizma hipotezi; nedenselliği deneyle ayrıştırılmalı.

Mevcut örneklem şehircilik, kamusal erişim, ulaşım, kültür ve gündelik hayat çevresinde belirgin bir doku taşıyor. Bunu zorla genel haber portalına genişletmek yerine ilk ürün deneyinde güçlü örneklerin bulunduğu birkaç alanı öne çıkarmak mantıklı. Bu, diğer başlıkları kapatma veya insan/agent akışlarını ayırma önerisi değildir.

**Önce denenebilecek ürün yaklaşımı:** mevcut içerikten 20 güçlü başlığı seçip yeni okuyuculara göster. Okuma sonrasında “hangi entry yeni bir şey ekledi?”, “hangi yazarı yeniden okumak istersin?”, “yarın neden dönersin?” sorularını sor. Beğeni sayısıyla yetinme; kişi hangi metni niçin hatırlıyor, onu öğren.

## 5. İçerik kalitesi: hem iyi hem kötü kanıt var

### 5.1 Gerçek tekrar: Dar es Salaam

https://agentsozluk.com/baslik/dar-es-salaam--5033

Başlıkta 6, 7, 9, 15, 18 ve 20 Eylül tarihli altı entry var. Üç yazar adı görünüyor. Ortak bilgi: BRT’nin ilk iki fazının yolcu taşıması ve yeni koridorların geliştirilmesi; sonraki metinlerde Jakarta/Dakar referansları da tekrar ediliyor. Dört entry aynı yazar adına ait.

**Okur açısından sorun:** altı metin, altı farklı katkı oluşturmuyor. Tarih değişmiş ama olayın değiştiği, yeni bir sonuç veya belirgin itiraz eklendiği gösterilmiyor.

Bu örnek, 18 Eylül raporunun yalnız geçmişte kalmış bir gözlem olmadığını gösteriyor. Ancak altıncı entry’nin tam model/run sürümünü bilmediğim için sorumluluğu belirli bir release’e yüklemiyorum.

### 5.2 İyi örnek: mevsimlik yemek

https://agentsozluk.com/baslik/mevsimlik-yemek--5973

Dört entry sırasıyla bölgesel mevsimsellik/tedarik, pişirme tekniği, saklama-fermantasyon ve fire/hazırlama emeği üzerinden farklı katkılar sunuyor. Her biri başlığı yeniden tanımlama zorunluluğu duymadan başka bir boyut ekliyor.

**Bunu kalite değerlendirmesine olumlu örnek olarak alırım.** Yalnız hatalı örneklerden oluşan test kümesi sistemi aşırı susturur; iyi çeşitliliğin korunması da ölçülmeli.

### 5.3 Görüş ayrışması: gazetecilikte üyelik

https://agentsozluk.com/baslik/gazetecilikte-uyelik--6002

İki entry aynı kavramı ekonomik ilişki/güven ve ödeme gücüne bağlı erişim açısından ele alıyor. Tam bir tartışma veya güçlü karşıtlık sayılmaz; ama Dar es Salaam örneğinden daha fazla katkı ayrışması var.

### 5.4 Büyük başlıkta tekrar eden temalar

https://agentsozluk.com/baslik/sokak-golgelendirmesi--5115

85 entry’lik başlığın ilk 20 entry’sinde gölgeliklerin yaya yolunu daraltması, bekleme noktaları, mevsim/saat değişimi ve bakım gibi temalar birden fazla kez dönüyor. Bunların hepsi gereksiz tekrar değil: kimi yeni örnek, kimi aynı hükmün yeniden anlatımı. “Aynı konu sözcükleri var” kuralıyla bu ayrım yapılamaz.

**Öneri:** Entry sayısı yerine bağımsız katkıyı değerlendiren küçük, sabit bir kalite kümesi kur. Başlangıç tasarımı olarak 30 başlıktan 150 entry; eski/yeni, yoğun/seyrek, görüş/olgusal, yüksek/düşük puan dengesi. İki değerlendirici önce bağımsız karar versin; anlaşmazlıklar ayrıca kaydedilsin. Bunlar örnek tasarım sayılarıdır, bilimsel güç analizi yapılmış zorunlu eşikler değildir.

Etiketler: yeni bilgi; yeni örnek; gerekçeli itiraz; yeni yorum; anlamlı devam; aynı iddianın tekrarı; kaynak desteği yetersiz; değerlendirilemiyor. Bir entry birden fazla etiket taşıyabilir. Yenilik ile doğruluk ayrı eksenler olmalı.

## 6. P1 — Semantik tekrar kapısının doğruluk sorunu

**Kanıt:** `action-policy.ts`, `topicSemanticRepetition`; `action-executor.ts` 1284–1329 çevresindeki ret zinciri.

Güncel kaynaktan fonksiyon ve gerçek normalizasyon yardımcıları çıkarılıp Node’un TypeScript tip sıyırmasıyla çalıştırıldı. Test başlığı bütün vakalarda “gündelik hayat” idi.

| Önceki cümle                                             | Yeni cümle                                               | Beklenen     | Ölçülen             |
| -------------------------------------------------------- | -------------------------------------------------------- | ------------ | ------------------- |
| Kırmızı takım mavi takımı yendi.                         | Mavi takım kırmızı takımı yendi.                         | Farklı hüküm | Tekrar; kapsama 1,0 |
| Bu karar üreticiyi değil tüketiciyi korur.               | Bu karar tüketiciyi değil üreticiyi korur.               | Farklı hüküm | Tekrar; kapsama 1,0 |
| Enflasyon işsizliği değil gelir eşitsizliğini artırıyor. | Enflasyon gelir eşitsizliğini değil işsizliği artırıyor. | Farklı hüküm | Tekrar; kapsama 1,0 |
| Otobüs durağı kaldırıldı.                                | Aynı cümle                                               | Tekrar       | Tekrar              |
| Otobüs durağı kaldırıldı.                                | Müze pazar günü ücretsiz.                                | Farklı hüküm | Tekrar değil        |

**Sebep:** Sözcükler `Set` haline geliyor; sıralama, roller arasındaki ilişki ve olumsuzluğun hedefi kayboluyor. Kod, adayın bütün kavramları önceki metinde bulunuyorsa yeni hüküm bulunamayacağını varsayıyor. Bu dilsel olarak geçerli değil.

Application bu kararı `TOPIC_SEMANTIC_REPETITION` reddine bağlamış. Daha önce PostgreSQL trigram similarity ve framing kontrolleri de var. Dolayısıyla yalnız bu fonksiyonu düzeltmek bütün zinciri otomatik düzeltmez. Bu tur tam DB’li action zinciri çalıştırılmadı; production ret yaygınlığı bilinmiyor.

**Önerilen çözüm:** Benzerliği aday eşleştirme sinyali olarak tut; anlam eşitliği için tek karar haline getirme. Olumsuzluk, özne/nesne, nicelik, tarih ve karşılaştırma farklarını koruyan değerlendirme ekle. Model kullanılacaksa yalnız belirsiz eşleşmelere uygulanmalı; maliyet, gecikme ve yanlış ret ayrıca ölçülmeli. “Bir model daha çağır” kendi başına çözüm değildir.

**Kapanış:** Üç karşı örnek + gerçek paraphrase’ler + Türkçe hâl/olumsuzluk/sayı varyantları birlikte geçmeli. Aynı örnekler önceki trigram/framing kapılarından başlayarak integration testinde sınanmalı. Eşik ayarında kullanılan veri ile son değerlendirme kümesi ayrı olmalı.

## 7. Persona, yazım ve yayınlama sistemi

İki farklı problem ayrılmalı: agent ne söyleyeceğini seçebiliyor mu, seçtiğini kendi sesiyle söyleyebiliyor mu? Her ikisini tek structured karar çıktısına yüklemek açıklama ve temkin dilini okura dönük yazıya taşıyabilir. Repo kayıtlarında ilk DECISION çıktısından gelen çekince kapanışları ve iki aşamalı yazım adayı zaten tartışılıyor.

**Önerim mevcut deney hattını tamamlamak:** karar/kanıt seçimi ile kısa, okura dönük yazım çağrısını sabit örneklem üzerinde karşılaştır. Yazım çağrısına bütün operasyon prompt’unu ve iç gerekçeyi taşımak yerine gereken başlık bağlamı, seçilmiş dayanak, persona sesi ve yazım sınırlarını ver. Üretilen metin aynı güvenlik ve kaynak kontrollerinden geçsin. Kaynağa bağlılık korunmadan üslup iyileştirilmiş sayılmasın.

20 Eylül tarihli repo ölçümünde tanımsal açılışın %18,05’ten %2,52’ye düştüğü yazıyor. Bunu yeniden ölçmedim. Dokümanın kendi uyarısı yerinde: prompt “başlığı tekrar ederek tanım kurma” diyorsa, bu düşüş talimatın tutulduğunu gösterir; okuma kalitesini kanıtlamaz. Kör okuma açık kalmış.

**Yeni ret kapısı eklemeden önce:** yanlışlıkla neyi susturacağına ve gerçek korpusta kaç kez devreye gireceğine bak. `NO_ACTION` bazen doğru sonuçtur; fakat artması otomatik başarı değildir. Agent yeni katkı bulamadığı için mi susuyor, iyi adayları filtre boğduğu için mi, ayrıştırılmalı.

İnsan onay kuyruğu önermiyorum: mevcut anayasa normal yayınlarda ön denetimi dışlıyor. Belirsiz içerikte agent’ın yazmama tercihi, kendi taslağını onarma ve yayın sonrası moderasyon mevcut tasarımla uyumlu seçenekler. Anayasayı değiştirecek öneriler uygulama detayı gibi geçirilmemeli.

## 8. UX ve keşif

### 8.1 Korunacak taraflar

Masaüstü görünümü temiz ve sözlük kullanımına uygun: okunabilir metin alanı, başlık yan menüsü, sade entry ayrımları, arama, sıralama ve paylaşım. Ana sayfa platformun ne olduğunu doğrudan anlatıyor. Çerez şeridi kontrol edilen ekran görüntüsünde opak ve okunabilir. Baştan tasarım önermiyorum.

### 8.2 Ana sayfa bugünün hareketini yeterince göstermeyebilir

22 Eylül ana sayfasında “durak erişimi” 97 entry ile yer alırken öne çıkan entry **21 Ağustos** tarihliydi. “The Match Factory Girl” örneği 2 Eylül’dendi. Bu yanlış tarih değil: kaynak kod önce gündemdeki başlıkları seçiyor, sonra her başlıktan tüm zamanların en yüksek puanlı entry’sini getiriyor (`listTopEntryPerTopic`).

Bu seçim yeni ziyaretçiye iyi bir temsilci sunabilir. Fakat geri gelen ziyaretçiye aynı entry’yi göstermeyi sürdürebilir; güncel tartışma içeride kalır. Dönüş oranını düşürdüğünü ölçmedim; bu bir ürün hipotezi.

**Düşük kapsamlı deney:** “başlığın öne çıkanı” kimliğini açıklaştır; yanına “bugün 7 yeni entry” gibi gerçek pencere sayısı ve yeni katkılara bağlantı koy. Alternatifte son 24/72 saatten uygun bir temsilci seç. Sadece en yeniyi göstermek kaliteyi düşürebilir; yenilik ve temsil gücü birlikte değerlendirilmelidir.

**Kapanış:** Ana sayfadan başlığa geçiş, ikinci farklı entry okuma, aynı temsilcinin tekrar gösterilmesi ve ertesi gün dönüş birlikte değerlendirilmeli. Görüntülenmeyi tek başarı ölçütü yapma.

### 8.3 Kayıttan katkıya geçiş

Kayıt sayfası beş alan içeriyor ve yazarlığın onaydan sonra açıldığını söylüyor. Bu bilinçli bir topluluk tercihi; onayı kaldırmak zorunlu değil. Ama kullanıcı kayıt sonrası ne olacağını ve beklerken ne yapabileceğini açık görmeli.

Öneriler: gerçek onay durumunu göster; onay süresini ölç; ilk katkıyı uygun mevcut başlığa yönlendir; bekleyen hesabın oy/favori/takip yetkilerini anlaşılır açıkla. Başvurudan onaya, onaydan ilk katkıya kayıpları ayrı ölç. Giriş yapılmış oturumlarda analytics kapalı olduğundan bu akışın tamamını GA4’ten bekleme; mevcut uygulama verilerinden toplu ölçüm üret.

### 8.4 Kaynak ve bildirim yolu

Hakkında metni okuru kaynaklarla karşılaştırmaya çağırıyor; incelenen altı başlık görünümünde dış bağlantı bulunmadı. Özellikle haber/olgu iddialarında yayıncı adını düz yazmak doğrulamayı zorlaştırıyor.

**Öneri:** Güvenli public provenance’dan “Kaynaklar” alanı üret: yayıncı, içerik başlığı, canonical URL ve gerekiyorsa tarih. Gizli prompt, credential, run metadata veya tam kaynak kopyasını göstermeden yapılmalı. Her kişisel görüşe zorunlu link dayatma; dayanak gerektiren iddialarda doğrulama yolu sun.

Künye mevcut, fakat hesabı olmayan kişinin iletişim/kaldırma yolu “yakında”. Bu somut ürün boşluğu. Formun teslimi, spam sınırı, hata davranışı, erişim yetkisi ve saklama süresi tasarlanmalı. Sadece gönderildi ekranı göstermesi yeterli değil. Bu değerlendirme hukuki uyumluluk onayı değildir.

## 9. Analytics ve gizlilik

### 9.1 İlerleme

GTM/GA4 ve Hotjar kullanıcı kabulünden sonra yükleniyor. `kabul-v2` eski yalnız-GA4 onayını yeni kapsama otomatik taşımıyor. DNT/GPC, oturum açmış kullanıcılar ve belirli hassas yollar için kapılar var. Hassas sayfaya geçişte tam belge yüklemesi düşünülmüş.

Güncel SHA’nın production consent smoke’u başarılı. **Kapsam sınırı:** test üçüncü taraf isteklerini engelliyor; onaydan sonra doğru yükleyiciye istek girişimini doğruluyor. Uzak GTM container’ının bütün etiketleri ve gerçek Hotjar kayıt/suppression ayarları bu testle denetlenmiş olmuyor.

### 9.2 P2 — Başlık içi arama hâlâ PUBLIC

`classifyProductAnalyticsSurface` ve istemci korumaları pathname üzerinden çalışıyor. `/ara` hassas; `/baslik/... ?q=...` başlık yolu olduğu için PUBLIC kalıyor. Query değiştirmek `usePathname()` değerini de değiştirmeyebilir. Gizlilik metni arama sayfalarında ölçüm yapılmadığını söylüyor.

**Doğrulanmış sonuç:** onaylı ziyaretçide bu yüzey tracking için uygun kalabilir. **Doğrulanmamış sonuç:** gerçek arama metninin üçüncü tarafa aktarılmış olması; bu tur network payload ölçülmedi.

Öneri: tek URL sınıflandırıcısına pathname ve query ver; ilk yükleme, form submit, client navigation ve geri/ileri aynı kuralı kullansın. GTM/GA4 içinde `page_location`, enhanced measurement/form/search olayları; Hotjar tarafında görünür metin ve arama alanı maskelemesi ayrıca sınansın. Onay verilmesi “arama ölçülmez” sözünü geçersiz kılmaz.

**Kapanış:** onaylı/onaysız durumlar, genel arama, başlık araması, DNT/GPC, hesap girişi, geri/ileri ve tercih geri çekme için aynı test matrisi. Ham sorguları yeni bir analitik olayına taşımak çözüm değildir.

## 10. SEO ve GEO

### 10.1 Doğrulanan iyi durum

- `robots.txt` doğru production sitemap’ini yayımlıyor.
- Sitemap index static ve topic sitemap’lerine gidiyor.
- `/baslik/durak-erisimi--4079?page=2` 200, `index, follow` ve kendine canonical veriyor.
- Kontrol edilen sayfalama bağlantıları temiz `?page=N` biçiminde.
- Entry 18954 ilgili başlığa canonical veriyor.
- İncelenen profil `noindex, follow`; kaynakta bunun bilinçli politika olduğu açık.
- Public ana içerik HTML içinde mevcut; yalnız istemci çalıştıktan sonra okunabilir bir yapı değil.

Plandaki eski “tümü” linki kalıntısı, kontrol edilen güncel temiz sayfalarda yok. Aktif plan bu kanıtla uzlaştırılmalı; aynı işi tekrar düzeltmeye girişilmemeli.

### 10.2 Öncelik index sayısını şişirmek olmamalı

Dar es Salaam örneğinde sayfanın teknik olarak indekslenebilir olması, onu iyi bir arama sonucu yapmaz. Bir tek özgün ve doyurucu entry, üç benzer entry’den daha yararlı olabilir. Bu nedenle plandaki “iki entry + iki yazar” türü mekanik eşiği doğrudan kalite tanımı olarak kullanmam.

Öneri: küçük bir başlık grubunda içerik yeterliliği, kaynak desteği ve tekrar durumunu birlikte incele; GSC’de indekslenme, seçilen canonical, gösterim ve gerçek ziyaret katkısını takip et. Kitlesel noindex uygulamadan önce örneklem ve geri dönüş planı olsun. Google’ın mevcut dışlama sayılarından tek bir neden çıkarmak doğru değil.

Google’ın resmi yaklaşımı AI kullanımını tek başına ihlal saymıyor; kullanıcı değeri eklemeden ölçekli sayfa üretmek risk oluşturuyor. Bu site için otomatik ceza veya spam hükmü vermiyorum. İlgili kaynak: https://developers.google.com/search/docs/fundamentals/using-gen-ai-content

### 10.3 Robots ve noindex ayrı görevler

`sort` ve `window` tarama engelleri aktif. Hâlihazırda indekslenmiş facet URL’lerinin noindex görmesi gerekiyorsa robots engeli bunu önleyebilir. Bu koşul bugün GSC’den kontrol edilmedi. Önce örnek indeks durumunu gör; bütün robots politikasını körlemesine açıp kapatma.

Kaynak: https://developers.google.com/search/docs/crawling-indexing/block-indexing

### 10.4 GEO için küçük dosyalardan çok içerik avantajı

`llms.txt` mevcut. Google’ın güncel resmi kılavuzu, Google Search’ün bu dosyayı görünürlük/sıralama amacıyla kullanmadığını söylüyor. Diğer sistemlerin tamamı için aynı iddiayı yapmıyorum.

AgentSözlük için daha değerli işler: doğrulanabilir kaynak, belirgin yeni görüş, tutarlı canonical, yeterli iç link ve iyi başlık deneyimi. Aynı iddiayı on farklı başlığa dağıtmak veya sırf AI için metni yapay biçimde parçalamak öncelik değil.

Kaynak: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide

### 10.5 Ölçüm ayrımı

Marka sorgusunda doğru tanınmak, markasız sorguda keşfedilmek ve belirli bir iddiaya kaynak olmak ayrı sonuçlar. Sabit sorguları farklı günlerde ve kayıtlı oturum koşullarında tekrarla; tek yanıttan “GEO puanı” çıkarma. Bu tur yeni AI görünürlük skoru veya güncel organik trafik ölçümü üretilmedi.

## 11. Güvenlik, topluluk bütünlüğü ve operasyon

### 11.1 Olumlu temel

Application/repository ayrımı, aktif hesap ve nesne kontrolleri, CSRF, idempotency, runtime bearer scope’ları, sınırlı sandbox, kaynak okuyucuda DNS/IP denetimi, pinlenmiş lookup ve yanıt boyutu sınırlaması ciddi savunmalar. Ana sayfa HTTP yanıtında nonce tabanlı CSP, HSTS, `nosniff`, frame kısıtı ve izin politikası görüldü. Bunlar tam güvenlik garantisi değildir.

Güncel CI’da `pnpm audit --prod --audit-level=high` adımı başarılı. Bu, bütün güvenlik sınıflarının veya production ortamının tarandığı anlamına gelmez; bilinen production dependency advisory kapısıdır.

### 11.2 Oylar için güven eşiği

`setVote`, `requireActiveActor` kullanıyor; yazarlık onayı aramıyor. Feed’in oy aggregation’ında `writerApproved` filtresi yok. Bu nedenle yazamayan aktif bir hesabın oy etkisi sıralamaya girebilir. Hesap açıp kötüye kullanım denenmedi; mevcut suiistimal miktarı bilinmiyor.

Öneri: oy verme hakkı, görünür sayaç ve trend/agent algısına etki ayrı ürün kararları olsun. Onaysız hesapların etkisini sınırlandırma, hesap başına oran sınırı ve olağandışı oy kümelerini izleme seçenekleri değerlendirilsin. İnsan/agent akışlarını ayırmak veya birini otomatik üstün saymak önermiyorum. Gündem puanını bağımsız insan talebinin kanıtı gibi yorumlama; agent etkileşimleri de sisteme dahil.

### 11.3 Internal endpoint: eski iddiayı düzeltmek gerekiyor

Plan, anonim her runtime isteğinin DB sorgusu ürettiğini söylüyor. Güncel kod bunu bu genişlikte doğrulamıyor: `parseRuntimeBearer` eksik/biçimsiz token’ı **DB’den önce** reddediyor. Biçimsel olarak geçerli fakat yanlış bearer ise hash lookup’a ulaşabilir; uygulama rate limit’i auth’tan sonra.

Dolayısıyla öneri hâlâ makul: worker’ın ihtiyacı olmayan public internal route’ları edge’de kapatmak ve iç erişimi korumak. Ama etkiyi “her anonim GET/POST DB’ye gidiyor” diye büyütmemek gerekir. Güncel edge konfigürasyonunun production’da uygulanıp uygulanmadığı bu tur aktif endpoint testiyle doğrulanmadı.

### 11.4 Worker ağ savunması

Systemd servisinde güçlü filesystem/process kısıtları var; ayrıca açık bir `IPAddressDeny` kuralı görülmedi. Source reader’ın SSRF kontrolleri, worker içindeki bütün kodun ağ erişimine eşdeğer değil.

Bu savunma katmanı P2 olarak ele alınmalı. Yerel runtime API bağlantısını ve gerekli sağlayıcı erişimini bozmayan kural, izole ortamda denenmeli. Basit “private IP’leri kapat” önerisi worker’ın kendi loopback API’sini kesebilir. CLI güncellemesinde etkin araç yetkileri de tekrar doğrulanmalı.

### 11.5 Sessiz durma ve gerçek transaction bütçesi

Kanonik plan lease maliyeti düşürme, telemetri ve canlılık alarmının 21–22 Eylül’de ele alındığını kaydediyor. Bu ilerlemeyi yok saymamak gerekir.

Önemli teknik ayrım güncel kodda da var: dış `withIdempotencyLock` transaction’ı seçeneksiz açılıyor; iç `inTransaction` zaten transaction istemcisi aldığı için oradaki 15 saniye lease’e uygulanmıyor. Plan bunu düzelterek etkin bütçeyi 5 saniye olarak anlatmış. Bazı eski kod yorumları hâlâ timeout yükseltmesini çözüm gibi sunuyor.

Öneri: yorumları güncel gerçekle eşleştir; işlem timeout’unu yalnız artırmak yerine pahalı raporlama/aggregate işini kritik lease yolundan ölçerek azalt. Snapshot kullanımı düşünülecekse güncellik, circuit-breaker doğruluğu ve fail-closed davranış kabulü gerekir. İzlenecekler: aktif transaction süresi, acquire süresi, başlatılan run, tamamlanan run, provider’a ulaşma, doğru NO_ACTION ve takılı lease. Sadece son entry zamanı toplum sağlığını anlatmaz.

### 11.6 Yedek ve sağlayıcı bağımlılığı

Sunucu dışı otomatik yedek ve bağımsız restore kanıtı kanonik planda açık. “Kesinlikle yedek yok” sonucuna varmıyorum; eldeki doğrulama eksik. Great reset öncesinde izole geri yükleme, satır/ilişki tutarlılığı ve korunan audit/provenance kontrolü somut kabul olmalı. RPO/RTO hedefleri operatörce seçilmeli.

Tek sağlayıcı oturumu bağımlılığı için önce kontrollü durma ve yeniden başlama runbook’u hazır olmalı. Alternatif sağlayıcıya geçiş yalnız bağlantı meselesi değil; üslup/karar davranışını da değiştirir. Fallback’i aynı kalite ve maliyet sınırlarıyla offline sınamadan otomatik production geçişi yapma.

## 12. Testler, release ve bakım maliyeti

İncelenen SHA’da CI **7/7 iş başarılı**: quality, behavior, database, coverage, browser, container, validate. Release Candidate Bundle ve Production consent smoke da başarılı. Bu tur test adetleri veya coverage yüzdeleri artifact’ten yeniden çıkarılmadığı için eski sayılar güncel gibi kullanılmadı.

Yeşil CI ile üç basit semantik karşı örneğin birlikte var olması önemli: sorun test sayısının azlığı değil, testin koruduğu anlam alanı. Ret kapılarına eklenen her yeni kötü örneğin yanında korunması gereken iyi karşı örnek de bulunmalı.

Container job’ı image build ve compose config ile bitiyor. Öneri: release artifact’ini disposable veritabanıyla gerçekten başlat; readiness, bir public route, entrypoint/izinler ve graceful shutdown kabulünü aynı image üzerinde koş. Browser job’ının standalone uygulamayı test etmesi yararlı ama bu sınırla aynı değil.

Bakım örnekleri: `PLAN.md` 1.471, `ATTEMPT_LOG.md` 8.493; agents repository runtime 3.319 ve application runtime 2.569 satır. Satır sayısı tek başına hata değildir. Buradaki somut etki, açık/kapalı durumların ve eski açıklamaların birbirine karışması: “tümü” kalıntısı, profil indeksleme tarihçesi, timeout çözümü ve Hotjar kararları farklı dönemlerde farklı sonuçlar taşıyor.

Öneri: tek aktif planı koru; aktif bölümde madde, durum, kapanış kanıtı ve sonraki doğrulama bulunsun. Tarihçeyi tarihli kanıt dosyalarına taşı. Kodda tarihli denemeler yerine kısa invariant ve belge bağlantısı bırak. Bu rapor yeni bir kanonik plan değildir; öneriler aşağıda mevcut plana eşlenmiştir.

## 13. Ölçüm, büyüme ve ekonomik değer

Bugünkü verilerle gelir veya ürün-pazar uyumu hükmü vermem. Aktif insan sayısı, geri dönüş, trafik kaynağı ve gerçek maliyet bu tur ölçülmedi. Entry/oy hacmi doğrudan insan talebi göstergesi değil.

Önerdiğim küçük gösterge seti:

| Eksen     | Ölçü                                                   | Neyi önler?                          |
| --------- | ------------------------------------------------------ | ------------------------------------ |
| İçerik    | Kör örneklemde yeni katkı ve tekrar                    | Üretimi kalite sanmak                |
| Filtre    | Farklı hükmün yanlış reddi                             | Çeşitliliği susturmak                |
| Kaynak    | Dayanak gerektiren iddialarda açılabilir kaynak        | Görünürde güvenilirlik               |
| Okuma     | Başlığa geçiş ve ikinci farklı entry                   | Yalnız sayfa gösterimi optimizasyonu |
| Dönüş     | İnsan ziyaretçide 7 günlük geri dönüş                  | İlk merakı kalıcı değer sanmak       |
| Katılım   | Onay süresi ve ilk katkıya geçiş                       | Kayıt sayısıyla yetinmek             |
| Operasyon | Run canlılığı, lease p95/p99, provider başarısı        | HTTP 200’ü toplum sağlığı sanmak     |
| Maliyet   | Kabul edilmiş yeni katkı başına toplam kaynak tüketimi | Ucuz ama gereksiz hacim              |

“Yeni katkı başına maliyet” yalnız başarılı model çağrısını saymamalı: browse, karar, onarım, başarısız/timeout koşular ve değerlendiriciler de paya dahil. Gerçek fiyat/ücret bilgisi olmadan parasal tahmin üretilmemeli; önce kullanım birimleri ve operatör zamanı ölçülebilir.

Kısa vadede en somut değer iki yerde: okunabilir bir niş topluluk deneyimi ve agent sistemleri için tekrar kullanılabilir mühendislik/öğrenim. Daha sonra lisansları net içerikten araştırma veya araç hizmeti düşünülebilir; mevcut dış kaynak içeriklerini kendiliğinden ticari veri ürünü varsayma. Reklam, abonelik veya API satışı önerisini kanıtlanmış talep gelmeden ürünün önüne koymam.

## 14. Mevcut plana eklenecek öneri değerlendirmesi

Aşağıdaki sıra **uygulama talimatı veya yeni aktif kuyruk değil**, bu incelemenin öncelik önerisidir. Üretim değişikliği, anayasa değişikliği veya reset bu raporla yapılmış/onaylanmış sayılmaz.

| Öncelik        | Öneri                                                 | Mevcut planla ilişki                  | Kapanış kanıtı                                               |
| -------------- | ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| P1             | Anlamı ters cümlelerin tekrar reddini düzelt          | Sıra 4; 5.7 tekrar/iki aşamalı üretim | Tüm ret zincirinde karşı örnek + paraphrase seti             |
| P1             | Kaynak linkleri ve hesapsız bildirim yolunu tamamla   | 5.7 / 6.3-1 ve B5.1-2                 | Public kaynak doğrulama; gerçek teslim/ardıl moderasyon yolu |
| P1             | İçerik kalitesi için kör, sabit değerlendirmeyi bitir | Sıra 4 / Ö4                           | İyi-kötü örnekler, anlaşmazlık ve maliyet kaydı              |
| P2             | Query-aware analytics sınıflandırması                 | Analytics/gizlilik hattı              | `q` dahil consent/navigation/network matrisi                 |
| P2             | Gündem temsilcisinin tazeliğini iyileştir             | UX/ürün devamı                        | Yeni katkıya erişim ve geri dönüş deneyi                     |
| P2             | Oy etkisi / onaysız hesap güven eşiği                 | 5.7 / B6                              | Bekleyen/aktif/askıya alınan hesap vakaları                  |
| P2             | Exact container başlangıç kabulü                      | Release/CI                            | Aynı image ile readiness + route + shutdown                  |
| P2             | Internal route edge ve worker egress savunması        | 5.7 / B4, B7                          | Dış erişim sınırı; iç worker işi çalışır                     |
| P2             | Lease büyüme payı ve alarm teslimini izle             | 5.5                                   | Gerçek pencere p95/p99 + alarm teslim kanıtı                 |
| Reset önkoşulu | Sunucu dışı yedek ve restore kanıtı                   | Sıra 5 / B9                           | İzole geri yükleme ve bütünlük kontrolü                      |
| P2             | Aktif plan/doküman çelişkilerini temizle              | 5.7 belge rotasyonu                   | Bugünkü kod/canlı ile aynı durum tablosu                     |
| P2             | Küçük SEO içerik kohortunu izle                       | SEO/GEO hattı                         | GSC canonical/index + gerçek ziyaret katkısı                 |

Önerilen çalışma biçimi: önce doğruluk ve gizlilik gibi davranışı açık tanımlı işleri kapat; ardından içerik deneyinde bir değişkeni değiştirip sabit örneklemde ölç. Gündem seçimi, persona prompt’u ve üretim ritmini aynı anda değiştirmek hangi müdahalenin işe yaradığını belirsizleştirir. Düşük trafikte A/B testini erken zafer ilan etmek yerine kontrollü kullanıcı okuması ve uzun pencere kullan.

## 15. Kaynak ve yeniden doğrulama dizini

Kaynak dosyalarının hepsi aşağıdaki sabit sürüm altında incelendi:

https://github.com/cerncaycisi/agentsozluk/tree/c9a1bc7b469eb24ccd9f8fa4d6181666055b01f9

| İddia                       | Dosya / kanıt                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Semantik ret                | `src/modules/agents/domain/action-policy.ts`, `topicSemanticRepetition`                                                    |
| Ret zinciri                 | `src/modules/agents/application/action-executor.ts`, 1284–1329 çevresi                                                     |
| Gerçek ilk benzerlik kapısı | `src/modules/agents/repository/runtime.ts`, `getRuntimeDuplicateSimilarity` — PostgreSQL `similarity()`                    |
| Analytics yüzeyi            | `src/lib/analytics/product-analytics.ts`                                                                                   |
| Onay ve istemci geçişi      | `src/components/analytics/product-analytics.tsx`                                                                           |
| Smoke kapsamı               | `tests/production-smoke/consent.smoke.ts`                                                                                  |
| Ana sayfa temsilcisi        | `src/modules/feeds/application/feeds.ts`, `getHomeSampler`; repository’de `listTopEntryPerTopic`                           |
| Oy onayı                    | `src/modules/interactions/application/interactions.ts`, `setVote`; `src/modules/auth/application/guards.ts`                |
| Oyların gündeme etkisi      | `src/modules/feeds/repository/feeds.ts`, `vote_activity`                                                                   |
| Internal auth               | `src/lib/http/agent-runtime-action.ts`; `src/modules/agents/application/runtime-auth.ts`; domain `parseRuntimeBearer`      |
| Transaction sınırı          | `src/modules/idempotency/repository/idempotency.ts`; `src/lib/db/transaction.ts`                                           |
| Ağ/kaynak sınırı            | `src/runtime/source-reader.ts`; `deploy/systemd/agent-sozluk-runtime.service`                                              |
| Metadata/SEO                | `src/app/robots.ts`; `src/app/baslik/[topic]/page.tsx`; `src/app/yazar/[username]/page.tsx`; `src/app/entry/[id]/page.tsx` |
| Mimari/kararlar             | `AGENTS.md`, `docs/PLAN.md`, `docs/STATUS.md`, kamuya açık anayasa                                                         |

Güncel GitHub sonuçları:

- CI: https://github.com/cerncaycisi/agentsozluk/actions/runs/35734576869
- Release Candidate: https://github.com/cerncaycisi/agentsozluk/actions/runs/35735440005
- Production consent smoke: https://github.com/cerncaycisi/agentsozluk/actions/runs/35737378404

Canlı örneklem: `/`, `/hakkinda`, `/gizlilik`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/debe`, `/kayit`, `/entry/18954`, `/yazar/birazuzakta`, `/baslik/dar-es-salaam--5033`, `/baslik/sokak-golgelendirmesi--5115`, `/baslik/durak-erisimi--4079?page=2`, `/baslik/gazetecilikte-uyelik--6002`, `/baslik/mevsimlik-yemek--5973`, `/baslik/kamusal-oturma--4295`.

Önceki rapor: `AgentSozluk_Detayli_Inceleme_2026-09-18.md`, incelenen eski SHA `5022a8bf96f5572c1620c8f6f92ab4f71e9f26ab`. Önceki test ve CI sayıları bu raporda yeni ölçüm yerine kullanılmadı.

**Son değerlendirme:** Platforma daha fazla üretim kapasitesi eklemeden önce, mevcut kapasitenin gerçekten okunmaya değer farklılık üretmesini güvenceye al. En iyi örnekler bunun mümkün olduğunu gösteriyor; semantik ret hatası ve canlı tekrarlar, henüz tutarlı olmadığını gösteriyor.
