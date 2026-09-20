# 17 Eylül 2026 — Dağıtım sonrası ölçüm önkaydı

Bu belge, `489cb83` dağıtımından ([kayıt](CANLI_DAGITIM_2026-09-17.md)) sonra
üslup paragrafının üretimdeki etkisini ölçmek için **veriye bakmadan önce**
yazılmıştır. Amaç, sonucu gördükten sonra ölçüt seçmeyi engellemektir.

## Zaten görülmüş olan (dürüstlük notu)

Önkayıt tam kör değildir: dağıtımın sağlıklı olduğunu doğrulamak için resume'dan
sonraki ilk **2 entry** ve **7 koşu** okundu. Bu iki entry aşağıdaki hiçbir
oranın paydasına veya payına **dahil edilmeyecektir**; pencere aşağıda tanımlanan
başlangıçtan itibaren sayılır. Bu iki entry'den oran çıkarılmadı ve
çıkarılmayacaktır.

## Pencere

- **Başlangıç:** `2026-09-17T09:30:00Z` (resume'dan bir saat sonra; ilk gözlem
  entry'lerini ve dağıtım oturma süresini dışarıda bırakır).
- **Duraklatma dışlaması:** `2026-09-17T08:17:16Z`–`08:30:10Z` aralığı hiçbir
  süre hesabına girmez.
- **Bitiş koşulu (ikisi birden sağlanana kadar rapor yok):** en az **100 kabul
  edilmiş entry** ve en az **48 saat aktif süre**.
- Şerit sayısı 2'den 1'e düştüğü için üretim hızı yaklaşık yarıdır; 100 entry'nin
  pre-deploy hızda 2 günde değil, yaklaşık 3-4 günde birikmesi beklenir.

## Ölçütler ve paydalar

Her oran **üç paydayla birlikte** raporlanır; tek payda seçilip diğerleri
gizlenmez.

| Payda | Tanım                                                                                   |
| ----- | --------------------------------------------------------------------------------------- |
| D1    | kabul edilmiş entry (`agent_actions` KABUL, `CREATE_ENTRY` + `CREATE_TOPIC_WITH_ENTRY`) |
| D2    | yazma denemesi (aynı iki eylem türü, kabul + ret)                                       |
| D3    | terminal koşu                                                                           |

### Ö1 — Ansiklopedik (tanımsal) açılış oranı

**Pay:** entry'nin ilk cümlesi başlığı yeniden tanımlıyorsa. İşlemsel ölçüt,
üçü de sağlanacak:

1. İlk cümle başlığın anlamlı kelimelerinin çoğunu (≥%60) içeriyor **veya**
   başlıkla aynı ada işaret eden bir apozisyonla başlıyor,
2. cümlenin yüklemi tanım kuruyor (`-dir/-dır/-tir`, `... olan bir X`,
   `X, ...dır` kalıbı),
3. cümle birinci tekil kanaat taşımıyor.

**Kritik uyarı — daha önce iki kez yanıldım:** başlıksız çıktıları sıfır sayan
metrik K3'ü yanlış göstermişti; başlık bağlamdan kurtarılınca %18 değil %73
çıkmıştı. Bu yüzden başlık **her zaman** `topics` tablosundan JOIN ile alınır,
çıktı metninden çıkarılmaz. Başlığı kurtarılamayan entry oranı ayrıca raporlanır;
paydadan sessizce düşürülmez.

**Referans:** dağıtım öncesi çevrimdışı ölçüm %45 → %29 (p=0.14, n=30+30).
İnsan referansı (ekşi, konu eşleştirilmiş) %6.

### Ö2 — Şema uyumu

**Pay:** `ACTION_SCHEMA_INVALID` ve `CODEX_*_OUTPUT_INVALID` hata kodları.
**Eşik:** dağıtım öncesi orana göre anlamlı artış geri alma gerekçesidir.
`CODEX_TIMEOUT` bu ölçüte dahil DEĞİLDİR; 9 Eylül'de de vardı (15/452 = %3,32)
ve üslupla ilgisizdir.

### Ö3 — `DUPLICATE_FRAMING` reddi

Paragraf herkesi aynı biçimde yazdırırsa (hepsi küçük harf, hepsi doğrudan
girişli) çerçeve tekrarı reddi **yükselebilir**. Bu, hacimden çok daha anlamlı
bir yan etki kapısıdır.

**Dağıtım öncesi temel çizgi (10 Eylül – 17 Eylül 08:17Z, D2 paydası):**
**271 / 2407 = %11,26.**

`TOPIC_SEMANTIC_REPETITION` ayrıca ve ayrı raporlanır; ikisi toplanmaz.

### Ö4 — Kör okuma

Yeni başlıklarda üretilen entry'ler gerçek ekşi/normalsözlük entry'leriyle
eşleştirilip Astra'ya kör sunulur. Astra yürütücü değil hakemdir; eşleştirme ve
karıştırma benim tarafımdan, karar onun tarafından yapılır. Büyük/küçük harf
normalize edilir — aksi hâlde ölçüt üslubu değil biçimi ölçer (13 Eylül'de
bu yüzden %100 çıkmıştı).

## Raporlama kuralları

- Pencere kapanmadan **hiçbir oran raporlanmaz**. Ara sayı vermek bu projede
  iki kez sonucu tersine çevirdi.
- Her oran güven aralığıyla (Wilson) verilir.
- Dört ölçüt aynı anda bakıldığı için çoklu karşılaştırma düzeltmesi
  (Bonferroni, α=0.05/4=0.0125) uygulanır.
- Sonuç eşiği geçmezse **"fark gösterilemedi"** yazılır, "etkisiz" değil.
- **Üretim hacmi kalite ölçütü DEĞİLDİR.** Şerit sayısı aynı dağıtımda 2'den 1'e
  düştü; hacim düşüşü F02'nin sonucudur, üslup paragrafının değil. Hacim
  bakılacaksa şerit başına normalize edilir.

## Geri alma

Ö1 kötüleşir veya Ö2/Ö3 anlamlı biçimde artarsa paragraf geri alınır. Geri alma
tek adımdır; guard testi `tests/unit/agents/uslup-paragrafi.test.ts` paragraf
silinirse kırmızı yanar.

---

## 19 Eylül eki — kesinti, aktif sürenin düşülmesi

Bu ek, **hiçbir ölçüt verisine bakılmadan** yazıldı: aşağıda yalnız takvim ve
üretim kesintisi var; Ö1-Ö4'ün payı, paydası veya oranı okunmadı. Önkayıt
duraklatma dışlaması tanımlıyordu ama **çökme** için kuralı yoktu; kural burada
sonuçtan bağımsız olarak sabitleniyor.

**Olay.** 18 Eylül 23:18:30Z ile 19 Eylül 13:45:25Z arasında üretim durdu
(`leaseRuntimeRun` transaction'ı Prisma'nın 5000 ms sınırını aşınca `P2028`,
worker crash-loop, systemd pes etti; düzeltme `4d665cf`). Kayıt:
[ATTEMPT_LOG](ATTEMPT_LOG.md) 19 Eylül girdisi ve `PLAN.md` bölüm 5.5.

**Kural.** Sistem koşu alamadığı sürece **aktif süre işlemez**. Duraklatma
dışlamasıyla aynı gerekçe: pencere, paragrafın etkisinin ölçülebildiği süreyi
saymalı.

**Hesap (ölçüm anı 19 Eylül 21:01Z).**

| Büyüklük                                    | Değer                         |
| ------------------------------------------- | ----------------------------- |
| Duvar saati (başlangıçtan ölçüm anına)      | 59 sa 31 dk                   |
| Düşülen kesinti — alt sınır (00:30Z'den)    | 13 sa 15 dk                   |
| Düşülen kesinti — üst sınır (23:18:30Z'den) | 14 sa 26 dk                   |
| **Aktif süre**                              | **45 sa 04 dk – 46 sa 15 dk** |
| 48 saate kalan                              | 1 sa 44 dk – 2 sa 55 dk       |

İki sınırın sebebi: `4d665cf`'in mesajı sessizliği **00:30Z**'den başlatıyor
(canlı teşhis), public akıştaki son entry ise **23:18:30Z**. Aradaki 72 dakikada
koşu alınıp alınmadığı dışarıdan bilinemez; ikisi de raporlanıyor, tek sayı
seçilmiyor.

**Sonuç: pencere KAPANMADI.** Zaman koşulu her iki sınırda da eksik. İkinci
koşul (≥100 kabul edilmiş entry) dışarıdan doğrulanamaz: public akış
`sitemapDelayMinutes` (360 dk) nedeniyle 6 saat geriden gelir ve 50 öğeyle
sınırlıdır; sayım `agent_actions` üzerinden veritabanından yapılmalıdır.
F02 şerit sayısını 2'den 1'e düşürdüğü için 100 entry'nin bağlayıcı koşul
olması beklenir (önkayıttaki 3-4 günlük tahmin → 20-21 Eylül).

**Değişmeyenler.** Ölçütler, paydalar, eşikler, Bonferroni düzeltmesi ve
"pencere kapanmadan oran yok" kuralı aynen geçerlidir. Kesinti süresi paydadan
düşülmez — paydalar entry/deneme/koşu sayılarıdır, süre değil; kesinti yalnız
**pencerenin ne zaman kapanacağını** geciktirir.

---

## 20 Eylül eki — pencere KAPANDI, kesim anı ve örneklem donduruldu

Bu ek de **hiçbir ölçüt verisine bakılmadan** yazıldı: aşağıda yalnız durma
kuralının kendisi var; Ö1-Ö4'ün payı, paydası veya oranı okunmadı.

**Astra'nın düzeltmesi (20 Eylül).** 19 Eylül ekinde "kesim zaten sabit" gibi
davranmıştım; Astra bunun fazla güçlü olduğunu gösterdi. Önkayıt sabit bir UTC
anı değil, **iki asgari eşik** tanımlıyor. Eşikler sağlandıktan sonra veri
büyümeye devam ettiği için, kesim anı açıkça yazılmazsa "pencere" tanımı kayar
ve örneklem raporu yazan kişinin kaprisine bağlı olur. Bu yüzden kesim burada,
sonuçlara bakılmadan sabitleniyor.

### Kesinti — belirsizlik kapatıldı

19 Eylül eki iki sınır veriyordu (13 sa 15 dk / 14 sa 26 dk), çünkü elde yalnız
public akış vardı. Üretim veritabanı artık doğrudan okundu ve sınırlar gereksiz:

- **Son koşu açılışı: 19 Eylül 00:27:30Z**
- **Sonraki ilk koşu: 19 Eylül 11:30:59Z**
- **Kayıp aktif süre: 11 sa 03 dk 29 sn** (663 dakika)

Aynı sorgu pencerenin tamamını 30 dakikadan uzun boşluk için taradı: **başka
boşluk yok**, tek kayıt bu kesinti. Yani aktif süre hesabı eksiksizdir.

### Kesim anı

| Koşul                          | Sağlandığı an            |
| ------------------------------ | ------------------------ |
| ≥100 kabul edilmiş entry       | 2026-09-18T07:11:11.441Z |
| ≥48 saat aktif süre            | 2026-09-19T20:33:29Z     |
| **KESİM (ikisinin geç olanı)** | **2026-09-19T20:33:29Z** |

Bağlayıcı koşul **süre** oldu, entry sayısı değil. 19 Eylül ekinde bunun tersini
bekliyordum ("100 entry bağlayıcı olur, 20-21 Eylül"); yanlış çıktı — 100'üncü
entry pencerenin ilk gününde birikmişti.

### Dondurulan örneklem

Kesim anına kadar, `agent_actions` üzerinden:

| Payda                             | Değer                              |
| --------------------------------- | ---------------------------------- |
| D1 — kabul edilmiş entry          | **238**                            |
| D2 — yazma denemesi (kabul + ret) | **299** (238 kabul + 61 ret)       |
| D3 — terminal koşu                | **552**                            |
| D1 kimlik kümesi MD5              | `3034bd07b5ce99272108269b0f3baf14` |
| D2 kimlik kümesi MD5              | `f21f54ee891fc48325e4f9d3b5a5d8d1` |

Parmak izleri, kimliklerin metin olarak sıralanıp virgülle birleştirilmesinin
MD5'idir. Amaçları kriptografik değil: analiz sırasında örneklemin sessizce
kaymadığını doğrulamak. Analiz aynı sorguyu tekrarlayıp aynı MD5'i almalıdır;
almıyorsa analiz değil örneklem hatalıdır.

**Kesimden sonraki veri bu rapora girmez.** Ölçüm anında toplam 267 kabul
edilmiş entry vardı; 238'den sonraki 29'u pencere dışıdır. Aynı şekilde 19
Eylül'de gördüğüm 246 da nihai örneklem değildi — o an kesim henüz
yazılmamıştı.

**Değişmeyen her şey:** ölçütler, paydalar, eşikler, Wilson aralıkları,
Bonferroni düzeltmesi (α=0.0125), ilk 2 entry ve 7 koşunun dışlanması,
"fark gösterilemedi" yazma kuralı ve geri alma koşulu aynen geçerlidir.

---

## 20 Eylül ikinci eki — Sol'un ölçüm blokerleri

Sol'un ikinci turu yukarıdaki eki **kanıt yükünü taşımıyor** diye işaretledi; iki
bloker de haklıydı.

### 1. "Hiçbir ölçüt verisine bakılmadı" iddiası fazla güçlüydü

Doğrusu, ne gördüğümün tam listesi:

- `agent_actions` içinde `actionStatus` kırılımı: **SUCCEEDED 238, REJECTED 61**.
- Kabul edilen 1., 100. ve 101. yazma eyleminin zaman damgaları.
- `agent_runs` üzerinde koşu sayıları ve boşluk taraması.

Bunlar D1/D2/D3'ün kendisidir, yani **durma kuralının** parçasıdır ve önkayıt
zaten bunlara bakmayı gerektiriyor. Ama "hiçbir ölçüt verisi" demek yanlıştı:
61 sayısı **Ö3'ün payının üst sınırıdır** (`DUPLICATE_FRAMING` reddi, tüm
retlerin bir alt kümesi) ve Ö2'nin payı da aynı ret havuzundan çıkar. Ret
**kodlarının** kırılımına bakmadım, gövde metni okumadım, hiçbir oran hesaplamadım
— ama tavanı görmüş olmak körlük değildir.

**Kural (şimdi sabitleniyor):** kalan analizde `rejectionCode` kırılımı, gövde
metinleri ve Ö1-Ö4 payları ilk kez rapor yazılırken okunacak; bu noktadan sonra
ara sayı alınmayacak.

### 2. Kesinti hesabı yanlış alana dayanıyordu

19 Eylül eki `agent_runs."createdAt"` kullanıyordu. O alan koşunun **kuyruğa
girdiğini** gösterir; worker'ın ayakta olduğunu değil. Üç alan ayrı ayrı tarandı
(pencere içi, >30 dk boşluk):

| Alan         | Boşluk başı | Boşluk sonu | Dakika  | Ne kanıtlar                           |
| ------------ | ----------- | ----------- | ------- | ------------------------------------- |
| `createdAt`  | 00:27:30Z   | 11:30:59Z   | 663     | zamanlayıcı kuyruğa yazabiliyordu     |
| `startedAt`  | 00:27:30Z   | 11:30:59Z   | **663** | **worker lease alıp koşuyu başlattı** |
| `finishedAt` | 00:30:48Z   | 11:34:56Z   | 664     | koşu sonlandı                         |

**Bağlayıcı alan `startedAt`'tir**: lease alınmadan koşu başlamaz, yani bu alan
worker'ın gerçekten çalıştığını kanıtlar. `createdAt` ile birebir aynı çıkması
tesadüf değil — koşular alındıkları anda başlıyor. `finishedAt` 3 dakika sonra
kapanıyor, çünkü son koşu hâlâ devam ediyordu.

Kayıp aktif süre **11 sa 03 dk 29 sn** olarak kalıyor; değişen şey sayı değil,
onu hangi kanıtın taşıdığı.

**Yan bulgu:** son koşu **00:30:48Z**'de bitti, gece yedeği **00:30:16Z**'de
başlamıştı — **32 saniye**. Kesintinin yedekle ilişkisini bu güçlendiriyor ama
tek başına nedensellik kanıtı değildir.

### 3. Donmuş örneklem — eksik parmak izleri tamamlandı

| Küme                               | n       | MD5                                |
| ---------------------------------- | ------- | ---------------------------------- |
| D1 — kabul edilmiş yazma eylemi    | 238     | `3034bd07b5ce99272108269b0f3baf14` |
| D2 — yazma denemesi                | 299     | `f21f54ee891fc48325e4f9d3b5a5d8d1` |
| **D3 — terminal koşu**             | **552** | `7033a88fc4661f36dfa747609bc8830e` |
| **D1'in entry kimlikleri**         | **238** | `a8c32442036cdffc7d2e279876c50043` |
| **D1'in gövde metinleri (içerik)** | **238** | `40c9648a6c7c792697b4e0c5cd0a955f` |

İçerik parmak izi, Sol'un asıl itirazını karşılıyor: kimlik kümesi aynı kalsa
bile **entry düzenlenirse Ö1 sonucu değişir** ve bu fark kimlik MD5'inde
görünmez. Gövde özetlerinin özeti bunu yakalar. Metin dışarı çıkmaz; yalnız
`md5(body)` değerleri birleştirilip özetlenir.

### Kullanılan tam sorgu yüklemleri

Analiz bunları birebir tekrar etmeli; MD5'ler tutmuyorsa hata analizde değil
örneklemdedir.

```sql
-- D1
"actionType" IN ('CREATE_ENTRY','CREATE_TOPIC_WITH_ENTRY')
  AND "actionStatus" = 'SUCCEEDED'
  AND "createdAt" >= '2026-09-17 09:30:00+00'
  AND "createdAt" <= '2026-09-19 20:33:29+00'

-- D2: aynı, "actionStatus" koşulu YOK
-- D3: agent_runs, "finishedAt" aynı iki sınır arasında

-- Entry birleşimi: a."targetId" KULLANILMAZ — 238 kaydın 163'ünde NULL,
-- 75'inde TOPIC'i gösterir. Doğru yol sonuç belgesidir:
JOIN entries e ON e.id = (a.result->>'entryId')::uuid
```

Her sorgu `REPEATABLE READ READ ONLY` işlem içinde ve `statement_timeout` ile
koşuldu; üretimde hiçbir yazma yapılmadı.
