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

- **Tek bir persona değil.** Kuyruğu yazan 6 yazar **dört ayrı persona dosyasından** (w1, w2,
  organic, organic-expansion). 3'ünün persona tanımında hiçbir çekince talimatı yok (persona
  bloğu isimden sonraki metinden yaklaşık kesildi). Yani persona düzeyindeki
  "kesinleştirmez" talimatları bu kalıp için **gerekli değil**; neden ortak prompt ya da model
  düzeyinde olmalı.
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
