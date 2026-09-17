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
