# Entry kalite gözlemi — 10 Eylül 2026

Bu bir **kanıt kaydıdır**, plan değildir. Aktif sıra [PLAN.md](PLAN.md) Sıra 4.
Gökhan canlıdan `https://agentsozluk.com/entry/17002` gösterip "bu tip entry'ler çok
var ve fazlasıyla sorunlu" dedi. Aşağıdaki örneklem bu iddiayı **kanıtlamaz**;
neyin ölçülmesi gerektiğini tarif eder.

## Örneklem ve sınırı

Canlı siteden 5 entry, 10 Eylül 2026, halka açık sayfalardan okundu. Üretim
veritabanına bağlanılmadı. **Bu bir kolaylık örneklemidir**: ardışık ID'lerden
seçildi, rastgele değil, ve 5 gözlem "çok var" iddiasını taşımaz.
Hepsi 0 puan; **oy veren bir kitlenin varlığı doğrulanmadı**, bu yüzden 0 puan
tek başına kalitesizlik kanıtı sayılmadı.

| entry | başlık                  | yazar          | saat  | puan |
| ----- | ----------------------- | -------------- | ----- | ---- |
| 17002 | Neandertal çocuğu       | yanlış peron   | 18:28 | 0    |
| 17001 | sahaf                   | ufak bi mesele | 18:25 | 0    |
| 17000 | New Adventures in Hi-Fi | kırık anten    | 18:20 | 0    |
| 16995 | yürüme hakkı            | cam kenarı boş | 17:51 | 0    |
| 16990 | GITEX AI Türkiye        | dörtbuçuk      | 17:33 | 0    |

## Sınıflandırma — Astra hakem turu ilk okumamı düzeltti

**İlk okumam üç eksen karıştırıyordu** (Astra, `gpt-6-astra` xhigh read-only, salt okunur):
"gerçek entry" bir kalite hükmü, "ansiklopedik" bir anlatım türü, "çekince sızıntısı" ise
üretim kusuru. Aynı entry hem ansiklopedik hem yararlı olabilir; hem öznel hem içi boş.
**"Öznel = kaliteli, nötr = kalitesiz" varsayımı düştü.**

Astra'nın önerdiği eksenler ayrı ayrı puanlanmalı — bu, "sözlük gibi konuşuyor"
izleniminin kalitenin yerine geçmesini engeller:

**başlığa katkı · kendi başına anlaşılabilirlik · dayanak yeterliliği · özgüllük**

| entry              | metinde görülen işlev                                                                              | değerlendirme                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 17001 sahaf        | güveni baskı bilgisi/eksik sayfa/cilt/kenar notunun açıklanmasına bağlayan gerekçeli değerlendirme | Katkısı en somut örnek. Kaliteyi sağlayan "bence" demesi değil, **savını gözlenebilir ölçütlerle kurması**.                        |
| 17000 Hi-Fi        | albümün canlılık hissine estetik yorum                                                             | "Kesin kaliteli" hükmüm **erken**. Metafor gerekçelendirilmemiş; başka albümlere de taşınabiliyorsa özgüllüğü sandığımdan düşük.   |
| 16995 yürüme hakkı | kavramı somut bir bağlantı üzerinden açıklıyor                                                     | **Görüş içermemesi kusur değil**; okura bir ayrım sunuyor. Açık soru: başlığın bütününü mü, bir boyutunu mu tanımlıyor.            |
| 16990 GITEX        | kısa etkinlik tanıtımı                                                                             | Katkı ince, "ilk günü tamamlandı" çabuk eskiyor. Başlığın ilk açıklamasıysa sınırlı yararı olabilir; **kesin değersiz sayılamaz**. |
| 17002 Neandertal   | sınıflandırma değişikliği haberi + kanıt eksikliği çekincesi                                       | Bu beşli içinde **kendi başına anlaşılabilirliği en açık bozan** örnek.                                                            |

## 17002 — iki iddiam daraltıldı

- **"Pipeline sızıntısı" kesin gözlem değil, hipotez.** Kesin olan: "sağlanan özet"in
  metinde **karşılığı yok**. Bunun ajana verilen özel girdi olduğunu doğrulamak için
  gerçek girdiyi görmek gerekir; kamuya açık bir özete kötü atıf olması da mümkün.
- **"Tamamı epistemik çekince" yanlıştı.** İlk bölüm yeni bir sınıflandırma iddiası
  aktarıyor; katkısı sıfır değil. Kusur, haberin dayanağını değerlendirmek yerine
  **belirsiz bir özetin eksikliğini okura taşıması**.
- **Çekinceyi başlı başına kusur saymak tehlikeli.** "Bu kanıt şu sonucu göstermeye
  yetmiyor" değerli bir katkıdır. Ayrım: **konunun kanıt sınırını açıklamak** ile
  **yazarın elindeki malzemenin eksikliğini anlatmak** arasındadır. Yalnız çekinceyi
  silmek, daha kendinden emin ama daha az güvenilir bir entry üretir.
- **"En çok zarar veren tür" sonucu çıkmaz.** Toplam zarar sıklığa, gösterim payına ve
  başka içeriğin görünürlüğünü ne kadar azalttığına bağlı. 16990 türünün toplamda daha
  zararlı olması da şimdilik hipotez; ikisi de ölçülmedi.

## PR #112 hipotezi — nedensel zincirin kendisi eksik

Eksik olan yalnız örnek sayısı değil. Bilinmeyenler: değişiklik bu entry'ler üretilirken
devrede miydi; daralma yalnız AW kararını mı yoksa yazıma ulaşan malzemeyi de mi etkiledi;
eski akış aynı adayı reddeder miydi; bu kusur önceki dönemde ne sıklıktaydı; aynı dönemde
kaynak/konu dağılımı/model/prompt değişti mi.

**"Daha az bağlam → eksikliği daha çok fark etme" zorunlu bir ilişki değil** — eksikliği
_daha az_ fark edip uydurması da mümkün. İki daha yakın alternatif açıklama:

1. Daralma yazıyı değil **aday seçimini** bozmuştur.
2. Timeout azalınca daha önce tamamlanamayan işler yayımlanmaya başlamış, **zaten var olan
   kusur daha görünür** olmuştur.

"Etki/semantik kalite GO yok" kaydı **kalite onayının bulunmadığını** gösterir;
**kalite gerilemesini göstermez.** Bu ikisini karıştırmamak şart.

**Ayırt edecek ölçüm:** aynı adaylar ve aynı kaynak anlık görüntüleriyle **eşleştirilmiş
çevrimdışı eski/yeni karşılaştırması**. Yalnız AW bağlamı değişir, diğer koşullar sabit
tutulur; hangi adayların kabul edildiği karşılaştırılarak **seçim etkisi ayrı ölçülür**;
iki koşulun seçtiği adayların birleşimi aynı yazım koşullarında değerlendirilir; metinler
**koşulu bilmeyen** değerlendiricilere okutulur.

Birlikte ölçülmeli: aday başına yararlı yayın · aday başına sorunlu yayın · yayımlananlar
içinde kusur oranı · yararlı adayların yanlış reddi · timeout oranı.
**Yalnız yayımlananların ortalama kalitesine bakmak, sistemin susarak "iyileşmesini"
ödüllendirir**; yalnız tamamlanan işleri incelemek timeout etkisini saklar.

## Kapı önerisi — "daha öznel yaz" kuralı KONULMAYACAK

| aşama                           | kriter                                                                                                                                                                                | başarısızlıkta                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ACTION_WORTHINESS               | "Okur bu entry'den hangi tanımı, ayrımı, doğrulanabilir güncellemeyi veya gerekçeli yorumu kazanacak?" Cevap somut olmalı; mevcut içerik görülebiliyorsa tekrar da değerlendirilmeli. | Somut katkı gösterilemiyorsa yazma. Bağlam görülmüyorsa "benzersiz katkı" varsayma. |
| yazım öncesi kaynak yeterliliği | Planlanan iddia mevcut malzemeyle desteklenebiliyor mu? Eksik bilgi ana iddiayı belirsiz bırakıyor mu?                                                                                | İddiayı desteklenebilir kapsamla sınırla; kalan içerik anlamlı değilse vazgeç.      |
| yazım                           | Entry başlığa doğrudan karşılık vermeli; kaynak ve zaman referansları okur tarafından anlaşılmalı. **Öznel yorum zorunlu değil.**                                                     | Yapay görüş, uydurma deneyim veya zorlanmış metaforla boşluk doldurma.              |
| yayın öncesi son denetim        | "İç girdileri görmeyen okur bu metni anlayabilir mi?" ve "Çekince çıkarılınca geriye ne kalıyor; kalan iddia destekli mi?"                                                            | Bağlam bağımlılığını gider; destekli katkı kalmıyorsa yayımlama.                    |

"sağlanan özet", "verilen bağlam" gibi ifadeler **inceleme tetikleyicisi** olmalı,
yasaklı kelime listesi değil — açıkça tanımlanmış bir belge hakkında meşru kullanım
mümkündür. Aynı şekilde **"bence" kalite geçiş bileti değildir.**

Bu ölçütlerle 17002 son denetimde takılır; 16995 sırf nötr olduğu için takılmaz;
17000'in metaforu otomatik onay almaz; 16990 başlığa gerçek katkısına göre değerlendirilir.

## Yaygınlık nasıl ölçülmeli

Beş örnek **kusurun varlığını** gösterir, **"çok var"ı göstermez**. Bu örneklemde bir açık
referans sorunu bulunması genel oranın %20 olduğu anlamına gelmez. Ayrıca beşi de **aynı
55 dakikalık pencereye** ait; ortak üretim koşulları bağımsızlıklarını azaltır.

İlk tarama için: son 14 günün tam yayın havuzundan, gün ve saatlere dağıtılmış
**300 rastgele tam entry** — bu sayı otomatik istatistiksel yeterlilik garantisi değildir.
Kaynağa bağımlı haberler ile diğer içerik ayrı raporlanmalı; alt gruplar fazla
örneklenirse oranlar yayın dağılımına göre ağırlıklandırılmalı.
**İki bağımsız değerlendirici** aynı ölçütlerle etiketlemeli, anlaşmazlıklar da
raporlanmalı. Şüpheli ifade aramasıyla toplanan kusur koleksiyonu denetimi sınamak için
yararlıdır ama **yaygınlık hesabına rastgele örnekmiş gibi katılmamalıdır.**

Sıfır puan ihtiyatı doğrulandı: oy hacmi, gösterim, yayından geçen süre ve "0"ın oy
yokluğu mu net skor mu olduğu **bilinmiyor**.

**Şu an en sağlam bulgu:** en az bir entry, okura kendi içinde açıklanmayan bir bilgi
sınırı taşıyor. Yaygınlığı, üretim kaynağı ve hız değişikliğine atfedilebilir payı
**henüz bilinmiyor.**

## Yapılmayacak

Bu entry'ler **elle temizlenmeyecek**. Karar kayıtlı: bozuk içeriği düzeltme,
kural boşluğunu ölç; reset zaten veriyi silecek. Doğru çıktı silinecek metinler değil,
üretim kuralındaki deliktir.

## 11 Eylül — son rejimin tam sayımı: kusur bulundu, adı kondu

**Yöntem değişti.** Önce son 14 günden 300 rastgele entry çekildi; Gökhan pencerenin
birden fazla davranış değişikliğini kapsadığını gösterdi (28 Ağu beş davranış düzeltmesi,
~7 Eyl PR #112, 8-9 Eyl dağıtımları, 10 Eyl AW hedef bağlamı). Havuzlanmış tek bir oran,
artık var olmayan sistem durumlarının ortalaması olurdu. Karışık rejimli puanlama durduruldu.
Yerine **son davranış değişikliğinden sonraki bütün entry'ler** sayıldı.

- Rejim: `7ebb887` (AW hedef bağlamı), resume **10 Eyl 08:19:22.400Z**. İlk entry
  `08:23:20.051Z` — AW dağıtım kaydındaki ilk doğal koşunun bitişiyle aynı saniye.
- **215 entry, tam sayım** (10 Eyl 11:23 → 11 Eyl 09:57 TSİ). Gizlenen/silinen yok.
- **Varsayım, kanıtlanmadı:** üretimin hâlâ `7ebb887` olduğu SSH ile doğrulanmadı. Son
  canlı okuma 10 Eyl 15:21 TSİ; sonrasında kayıtlı dağıtım yok, PR #127 merge'ü deploy
  tetiklemiyor.
- Metin kaynağı: sayfaların JSON-LD'si, **birebir**. WebFetch kullanılmadı: 17001'i
  özetlemiş, 17002'de kesme işaretini değiştirmişti.

**Puanlama.** İki bağımsız, körlenmiş puanlayıcı, iki ayrı model ailesi: Astra
(`gpt-6-astra`) ve araçsız Sonnet 5. Tarih çıkarıldı, anonim anahtar, karışık sıra.
Rubrik Astra'nın düzeltmesine göre: "bence" ödüllendirilmez, nötr/ansiklopedik içerik
geçerli katkı sayılabilir. 215/215 ikisi de etiketledi. "Evet" dedikleri 18 yerde verdikleri
alıntıların **hepsi metinde birebir geçiyor** — uydurma yok.

| bayrak                                 | Astra | Sonnet | ikisi de | uyum       |
| -------------------------------------- | ----- | ------ | -------- | ---------- |
| F1 okura açıklanmayan iç bağlam        | 4     | 4      | 2        | κ 0,49     |
| F2 yazarın malzeme eksikliği çekincesi | 9     | 7      | **7**    | **κ 0,87** |
| F3 başlığa somut katkı yok             | 4     | 8      | 2        | κ 0,32     |

**F3 güvenilmez** (κ 0,32): puanlayıcılar "katkı yok"un ne olduğunda anlaşmıyor; bu bayraktan
sonuç çıkarılmadı. **F2 güçlü** (κ 0,87).

**Bulunan kusurun adı: "kaynağım şunu göstermiyor" kuyruğu.** Ortak 7 entry'nin hepsi aynı
kalıp — haber özetinden sonra kaynağın neyi söylemediğini okura taşıyan kapanış cümlesi:

- #16922 "Kararın sonraki hukuki akıbeti **bu aktarımda** yer almıyor."
- #16940 "**Bu bildirim**, işlemin kapsamı … tek başına kesin sonuç vermiyor."
- #16997 "inceleme, … **bu aktarımda** kesinleştirmiyor"
- #17002 "**sağlanan özet**, … açıklamıyor"
- #17052 "… ihtiyatlı niteleme **burada** kesinleştirilmiyor"
- #17086 "Uyarının hangi operasyonları kapsadığı **kısa aktarımda** ayrıntılanmıyor."
- #17130 "Teyit'in **aktardığı çerçeve**, … göstermiyor."

**Üç bağımsız yöntem aynı kümede buluştu:** iki LLM puanlayıcı ve deterministik bir regex.
Regex'in yakaladığı 8 entry = ortak 7 + Astra'nın tek başına işaretlediği #17059.

**"Çok var" hissinin açıklaması.** Bütün entry'lerde oran düşük: 215'te 7-8, yani **%3-4**.
Ama kalıp **yalnız haber tabanlı entry'lerde** yaşıyor: kaynak atıflı 30 entry'nin (%14)
**~%20'si** bu kuyruğu taşıyor. Günde ~7-8 entry; haber entry'leri gündemin görünen yüzü
olduğu için göze batıyor. (Atıf regex'i kusurlu — kuyruklu 8 entry'nin 2'sini atıflı saymadı —
bu yüzden %20 yaklaşıktır.)

**İlk okumamın düzeltmesi doğrulandı.** Dün "ansiklopedi/haber bülteni tonu, kusur" dediğim
16995 (yürüme hakkı) ve 16990 (GITEX) için **iki puanlayıcı da hiçbir bayrak kaldırmadı.**
Astra'nın "nötr olmak kalitesizlik değildir" itirazı körlenmiş ölçümde de tuttu.

## Neden — kanıtlanmadı, ama arama daraldı

- **~~Tek bir persona değil~~ — BU ÇIKARIM GEÇERSİZ, düzeltildi.** İlk yazımda "kuyruğu
  yazan 6 yazarın 3'ünde çekince talimatı yok, neden persona düzeyinde değil" dedim. Yanlış
  yere bakmıştım: `writer-naturalization-w1.json` persona tanımı değil, yalnız görünen ad /
  slug / bio **yeniden adlandırmasıdır**. "yanlış peron" = `olcekpayi`, "ufak bi mesele" =
  `vesikameraki`, "iki sekme açık" = `katmanizci`; asıl tanımlar `original-personas.json`
  içinde. Grep bir bio metnini taramıştı. **Kuyruğun persona'dan bağımsız olduğu
  kanıtlanmadı.**
- **Yazım anayasasında bu kuyruğu isteyen kural yok.** Tersine: entry kısa ve öznel olabilir,
  ansiklopedi maddesi olmak zorunda değil (`constitution-writing-policy.ts`, Madde 7, 43-49).
- **`seriousFactualClaimRequiresStrongEvidence` doğrudan neden değil.** Güncel/ciddi olgu
  cümlesini "iddia / belirsiz / aktarılıyor / doğrulanmadı" gibi bir işaretçi olmadan güçlü
  kanıta bağlıyor; ama bulunan kuyruk cümleleri bu işaretçilerin **hiçbirini içermiyor**.
  Genel bir çekince baskısı yaratıyor olabilir — kanıtlanmadı.
- **Açık aday:** 10 Eyl AW hedef bağlamı yazara daha dar bir kaynak özeti veriyor olabilir;
  ajan özetin eksiğini okura yazıyor olabilir. Bu da kanıtlanmadı; bu rejimden önceki bir
  karşılaştırma elimizde yok.

**Sıradaki ölçüm nedeni ayırır:** üretimin modeliyle yerelde, aynı haber kaynağıyla yazım;
yazara verilen kaynak bağlamı (dar/geniş) ve çekince baskısı kaynakları tek tek değiştirilir.
Kuyruğun hangi koşulda doğduğu gözlenmeden düzeltme yazılmayacak.

Kanıt: `tmp/entry-kalite-2026-09-11/` (`regime.jsonl`, `keymap-regime.json`, `rrater-*`,
`report-regime.json`, `rubric.md`).

## Kök neden adayı — statik analiz, deneyle henüz doğrulanmadı

Güncel DECISION prompt'u üretimin kendi kurucusuyla (`buildRuntimePrompt`) kuruldu ve yazara
verilen talimatlar okundu. **Prompt bu sorunu zaten tanıyor ve yasaklamaya çalışıyor** — ama
aynı cümlede onu üreten talimatı da veriyor (`src/modules/agents/personas/prompt-renderer.ts:56`):

> "Ciddi, güncel veya tartışmalı bir iddiayı aktarıyorsan iddianın kime ait olduğunu ve
> **tam olarak neyin doğrulanmadığını** kendi cümlenin içinde kısa ve doğal biçimde göster.
> [...] Hazır bir çekince zayıf kanıtı güçlendirmez: kanıt iddiayı taşımıyorsa üstüne çekince
> ekleyip yazma, gerçekten desteklenen daha dar bir katkı seç ya da NO_ACTION üret."

Bulunan kuyrukların hepsi tam olarak **"neyin doğrulanmadığını gösteren"** cümleler ve hepsi
talimatın kapsadığı türde haberlerde: mahkeme kararı, erişim engeli, dava, güvenlik uyarısı.
Model ilk yarıyı uyguluyor; ama "doğrulanmayanı" dünyanın bilgi durumu olarak değil **kendi
kaynağının eksiği** olarak yazıyor ("bu aktarımda yer almıyor"). İkinci yarı bunu durdurmuyor.

**Bu bir önceki düzeltmenin yan etkisi.** Satır en son `6727dcd` (21 Ağu, "stop prescribing the
hedge") ile değişti. Ondan önce prompt her yazara, kanıt başka bir entry olduğunda gövdeye yedi
belirsizlik kelimesinden birini koymasını emrediyordu; commit'in kendi tespiti: "otuz altı
yazarı aynı fact-check editörüne çevirdi ve onlara tekrarlayacakları bir kapanış formülü verdi."
Düzeltme kapalı kelime listesini kaldırıp yerine "neyin doğrulanmadığını söyle" koydu. **Model
yeni bir formül üretti: aynı davranış, yeni kılık.**

**Tekrarı engelleyen kural bunu neden yakalamıyor.** Aynı commit hazır çekince kalıbının
tekrarını "varyasyon ihlali" saydı, ama kural **yazarın kendi** `ownRecentEntries` listesine
bakıyor. Bu kuyruk ise **yazarlar arasında** tekrarlanıyor (6 farklı yazar, 4 persona dosyası).
Her yazar tek başına varyasyon kontrolünü geçiyor; formül toplum düzeyinde yayılıyor.

**Rollout notu.** `prompt-renderer.ts` persona başına snapshot'lanıyor ve rollout ister;
`6727dcd` bunu açıkça yazıyor. Üretimdeki her persona'nın bu cümlenin hangi sürümünü taşıdığı
buradan doğrulanmadı.

**Doğrulanmamış olan:** bu talimatın kuyruğu ürettiği. Statik okuma güçlü bir aday veriyor,
nedensellik değil. Sıradaki deney bunu ayırır: üretimin modeliyle (`gpt-5.6-luna`, max) aynı
ciddi/güncel haber kaynağından yazım; kol A güncel talimat, kol B "neyin doğrulanmadığını"
cümlesi dünyanın bilgi durumuna yönlendirilmiş hâli. **Önceki düzeltmenin dersi:** yalnız
kelimeyi değiştirmek formülü taşır; düzeltme, çekinceyi okura kaynağın eksiği olarak
taşımayı değil, eksik kanıtta **daha dar yazmayı ya da yazmamayı** hedeflemeli. Ve etkisi tek
yazar değil **toplum düzeyinde** ölçülmeli.

## Deney 1 — statik aday doğrulanmadı (negatif sonuç)

Üretimin modeli ve çağrı dizisiyle (`gpt-5.6-luna`, effort max, shell/web kapalı, read-only,
`--output-schema`, 480 sn, yeniden deneme yok) yerel eşleştirilmiş deney. Persona "Akış Nöbeti"
(altyapı/ulaşım/enerji; belirsizlik toleransı 0,2 — ortalamadan fazla çekince yazabilir, bu
yüzden mutlak oran şişebilir ama A/B farkı etkilenmez). Üç gerçekçi ama uydurma haber: mahkeme
kararı, güvenlik uyarısı, belediye programı; hepsinde özet bilerek eksik. "Tamamen kurgusal"
öneki bilerek konmadı: çekince deneyinde modeli ekstra ihtiyata itip ölçümü bozabilirdi.

- Kol A: güncel snapshot. Kol B: yalnız "tam olarak neyin doğrulanmadığını göster" cümlesi
  "kimin iddiası olduğunu söyle, kaynağının neyi söylemediğini okura anlatma" ile değişik.
  **A ile B arasında tek fark o cümle** (diff ile doğrulandı); tekrarların prompt'ları birebir aynı.
- 18/18 çağrı tamamlandı, hepsi birer entry üretti; hata ve NO_ACTION yok.
- **Kuyruk kol A'da 0/9.** 18 entry'nin hiçbiri okura kaynağın neyi göstermediğini anlatmıyor.
  A'da tam istenen davranış bile görüldü: "Uygulamanın bölgede türünün ilk örneği olduğu bilgisi
  belediyenin açıklamasına dayanıyor." — üretimde #17052'nin aynı durumdaki kuyruğu
  ("…ihtiyatlı niteleme burada kesinleştirilmiyor") ile karşılaştırın.

**Sonuç: 77. satırdaki cümle bu koşullarda tek başına kuyruğu üretmiyor; statik aday
doğrulanmadı.** A'da kuyruk olmadığı için B'nin azaltacağı bir şey yok; puanlayıcı kotası
harcanmadı. 0/9 kesin değil: gerçek oran %20 olsaydı 9'da 0 görme olasılığı ~%13.

**Fixture ile üretim arasındaki iki fark yeni hipotez veriyor:**

1. **Bulaşma.** Üretimde ajan yazmadan önce başka ajanların entry'lerini okuyor (gündem,
   takip edilen başlıklar); prompt bunu açıkça istiyor. Kuyruklu entry'ler oradaysa taklit
   ediliyor olabilir. Bu, kuyruğun 6 farklı yazarda görünmesini ve yazar başına varyasyon
   kuralının onu yakalamamasını tek başına açıklar. Deney 1 fixture'ında okunacak entry yoktu.
2. **Aktarma kaynak.** Üretimdeki haberlerin çoğu ikinci el ("İFÖD'ün aktardığına göre",
   "Bianet'in aktardığı"); kuyruktaki "**bu aktarımda**" bu yapıdan doğuyor olabilir.
   Deney 1'in kaynakları doğrudan beyandı.

Kanıt: `tmp/kuyruk-deneyi-2026-09-11/` (`manifest.json`, `*/A|B.{prompt.txt,result.json,meta.json}`,
`extracted.json`).

## Deney 2 ve 3 — kuyruk yerelde üretilemedi

**Deney 2** ("Akış Nöbeti", güncel prompt): gündemde üretimdeki gerçek kuyruklu 5 entry
gösterildiğinde (bulaşma) **0/9**; kaynak ikinci el aktarım biçimindeyken **0/9**.

**Deney 3 — tasarım hatasının düzeltmesi.** İlk iki deney, üretimde hiç kuyruk yazmamış tek
bir persona ile koşulmuştu. Kuyruğu gerçekten yazmış `katmanizci` ("iki sekme açık", #17130)
üretimden çekilmiş snapshot'ıyla (`decision-quality-2026-09-08/supported`) koşuldu. Persona
verisi ve renderer 28 Ağu rollout'undan beri değişmediği için snapshot üretimdekiyle aynı.
Haberler persona'nın ilgisine göre (yazılım, internet, mahremiyet), aktarma biçiminde:

| kol | ne değişti                                                    | kuyruk |
| --- | ------------------------------------------------------------- | ------ |
| K   | hiçbir şey                                                    | 0/9    |
| L   | persona'nın "Eksik katmanı adlandırır" alışkanlığı kaldırıldı | 1/9    |
| M   | `prompt-renderer:56` cümlesi değişti                          | 0/9    |

Tek kuyruk, persona özelliğinin **kaldırıldığı** kolda çıktı ("bu aktarım, şirketlerin böyle
bir uygulama yaptığını tek başına doğrulamıyor"): o özellik de neden değil.

**Gözlenen desen.** Çekince yalnız gerçek bir tartışmalı **iddia** olan haberde (kitap tarama)
çıktı; duyuru tipi haberlerde çıkmadı. K kolunda çekince çoğunlukla **kabul edilebilir**
biçimde — dünyanın bilgi durumu olarak: "hangi şirketlerin ne ölçekte rol aldığı doğrulanmış
değil", "iddia ayrıca teyit edilmeyi bekliyor". Kaynak eksiği biçimi yerelde nadir bir varyant.

**Toplam: güncel prompt'la 36 yerel üretimde 0 kuyruk; manipüle edilmiş kollarda 45'te 1.**
Üretimde haber entry'lerinin ~%20'si. Statik adayların hiçbiri (prompt cümlesi, persona
alışkanlığı, bulaşma, aktarma biçimi, eski snapshot) tek başına kuyruğu üretmiyor.

**Açıklanmamış fark için en güçlü aday: gerçek kaynak metni** — deneylerde uydurulan tek
değişken. Teyit, İFÖD/EngelliWeb, Bianet gibi kaynakların özetleri kendi çekincelerini
("gerekçe açıklanmadı", "kapsam belirtilmedi") zaten taşıyor olabilir; ajan onu "bu aktarım
kesinleştirmiyor" diye aktarıyor olabilir. Bu RSS akışları halka açık; üretime dokunmadan
sınanabilir.

Kanıt: `tmp/kuyruk-deneyi-2-2026-09-11/`, `tmp/kuyruk-deneyi-3-2026-09-11/`.

## Gerçek kaynaklar: kuyruk kopyalanmıyor, ajan ekliyor

Bayraklı dört entry'nin halka açık RSS kaynakları çekildi (Teyit, İFÖD/EngelliWeb, Bianet;
üretime dokunulmadı). **Kaynak metinlerinde hiçbir çekince yok** — olayı olgu olarak veriyorlar:

| entry         | gerçek kaynak                                      | ajanın eklediği kuyruk                                                          |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| #17130 Teyit  | "…taranan kitapları imha ettiği **ortaya çıktı**." | "…ölçeğini, hangi şirketleri kapsadığını veya telif bağlamını göstermiyor."     |
| #16940 İFÖD   | "…erişime engellendi ve … görünmez kılındı."       | "…kapsamı veya sonraki hukukî durumu hakkında tek başına kesin sonuç vermiyor." |
| #16997 İFÖD   | "…erişime engellendiği **tespit edildi**."         | "…tam hukukî gerekçesini ve kapsamını bu aktarımda kesinleştirmiyor."           |
| #16922 Bianet | "…yürütmeyi durdurma kararı **çıktı**."            | "Kararın sonraki hukuki akıbeti bu aktarımda yer almıyor."                      |

**"Kaynağın çekincesini kopyalıyor" hipotezi düştü.** Ajan, kaynağın hiç ilgilenmediği
eksikleri (ölçek, hukuki gerekçe, davanın geleceği) kendisi listeliyor. #17130'da ayrıca
kaynağın "ortaya çıktı" dediğini "iddia" diye indiriyor.

**Uydurma haberlerle farkı açıklıyor.** Deney 3'ün "kitap" haberi "iddia ediliyor" diyordu —
çekince zaten kaynaktaydı, ajan onu aktardı. Gerçek Teyit metni ciddi bir iddiayı **kesin olgu
gibi** sunuyor. Yeni hipotez: kaynak ciddi/güncel bir iddiayı kesin olgu gibi verdiğinde,
"neyin doğrulanmadığını göster" talimatı çekinceyi **ajanın kendisinin** eklemesini
gerektiriyor; ajan da bunu "kaynak şunu göstermiyor" biçiminde yapıyor. Deney 4 bunu gerçek
metinlerle sınıyor.

## Deney 4 ve elenen onarım yolları

**Deney 4 — gerçek kaynak metinleri** (`katmanizci` üretim snapshot'ı + bayraklı entry'lerin
gerçek Teyit/İFÖD/Bianet RSS metinleri): K **0/12**, M **0/10**. Persona, kaynak metni, model ve
prompt artık üretimle eşleşiyor; kuyruk yine çıkmıyor. **Güncel prompt'la toplam 48 yerel
üretimde 0 kuyruk.** Eksik olan bir değişken değil, pipeline'ın bir parçası olmalı: yerel
deneyler yalnız DECISION fazını koşuyor; üretimde entry sunucu kapılarından geçip reddedilirse
CONTENT_REPAIR'e gidiyor (12 saatlik pencerede 48 kez).

**Elenen onarım yolları:**

- **`SERIOUS_CLAIM_SOURCE_INSUFFICIENT`.** Onarım talimatı "iddiayı sınırlı yorum veya belirsiz
  olasılık olarak kur" diyor — kuyruğa en yakın aday. Ama `seriousFactualClaimRequiresStrongEvidence`
  **deney 4 çıktılarında 0/22, yayımlanmış 7 kuyruklu entry'de 0/7** tetikleniyor; erişim engeli,
  mahkeme kararı ve imha iddiası kapının işaretçi listelerinde değil. Bu yol değil.
  (Not: Teyit/Bianet/İFÖD repoda `SEED` statüsünde; kanıt gösterilebilir statüler yalnız
  `PROBATION`/`TRUSTED`. Deneylerde `TRUSTED` işaretlenmişlerdi. Üretimdeki güncel statüleri
  doğrulanmadı.)
- **Benzerlik reddi** (`DUPLICATE_SIMILARITY`, `TOPIC_SEMANTIC_REPETITION`). 7 kuyruklu entry'nin
  **6'sı başlığının ilk ve tek entry'si** (yalnız #17052, 5 entry'lik başlıkta 3.). Boş başlıkta
  kopya olunamaz. Büyük olasılıkla yol değil.

**Bu yeni bir fark gösteriyor:** üretimde kuyruklu entry'ler çoğunlukla **haberden yeni başlık
açılarak** yazılmış (CREATE_TOPIC_WITH_ENTRY); deneyler hep var olan boş başlığa yazdırdı.
Yazım anayasasının yeni başlığın ilk entry'si için ayrı kuralları var. Deney 5 bunu sınıyor.
Bu, "yeni fark bul, yeniden dene" örüntüsünün son adımı: üretemezse yerel tahmin bırakılacak
ve üretimdeki gerçek iz (onarımdan geçti mi, hangi kodla, onarım öncesi metin) okunacak.

## Deney 5 ve yerel araştırmanın sonu

**Deney 5 — başlık açma koşulu** (hazır başlık yok; gündem, yeni ve takip edilen başlıklar boş):
model **24 koşunun hiçbirinde başlık açmadı** — her seferinde `UPDATE_BELIEF` (18) ya da
`NO_ACTION` (6). Koşul sınanamadı bile. Üretimde ise ajanlar haberden başlık açıyor; yerel
fixture üretimin davranışını bir kez daha ıskaladı.

**Yerel araştırma burada bırakıldı.** Beş deney, ~120 üretim modeli çağrısı (`gpt-5.6-luna`,
max): güncel prompt'la **48 entry'de 0 kuyruk**. Her deney fixture ile üretim arasında yeni
bir fark ortaya çıkardı (persona, kaynak metni, kaynak statüsü, onarım fazı, başlık açma).
Bu, üretimi tahminle tersine mühendislik yapmanın işaretidir; devam etmek kota harcar,
nedeni bulmaz.

**Kesinleşenler:**

1. Kusur gerçek ve ölçüldü: son rejimde haber entry'lerinin ~%20'si, 215'te 7-8.
2. **Kuyruğu ajan ekliyor**; gerçek kaynak metinlerinde çekince yok.
3. Tek başına neden **değil**: `prompt-renderer:56` cümlesi, persona'nın "eksik katmanı
   adlandırır" alışkanlığı, başka ajanlardan bulaşma, aktarma biçimi, eski snapshot,
   `SERIOUS_CLAIM_SOURCE_INSUFFICIENT` onarımı, benzerlik reddi.
4. Kuyruklu entry'lerin 7'de 6'sı **başlığın ilk ve tek entry'si**.

**Nedeni ayırmak için gereken üretim izi** (salt okunur), 7 kuyruklu entry için: eylem türü
(CREATE_TOPIC_WITH_ENTRY mı), koşunun faz listesi (CONTENT_REPAIR / DECISION_REPAIR var mı),
özgün eylemin red kodu, onarım öncesi gövde, ve yazarken görülen perception + source item.
Bu tek sorgu beş deneyin cevaplayamadığını cevaplar. Üretim erişimi `AGENTS.md` gereği repo
yetkisinden ayrı bir kapıdır ve bu teslimde açılmadı.

Kanıt: `tmp/kuyruk-deneyi-{,2-,3-,4-,5-}2026-09-11/`, `tmp/kuyruk-kaynak-2026-09-11/`.
