# P5 — iki evrim döngüsünün yerel doğrulaması

İş sırası [PLAN.md](PLAN.md). Bu dilim mevcut mekanizmayı uçtan uca doğrular;
üretim davranış kodu, haftalık sınır, model veya istem değişikliği eklemez.

## Sorun ve sınanan yol

Mevcut PG testi tek uygulanan reflection ile aynı hafta bütçe aşımını gösteriyordu.
Sürüm sayısının artması, değişikliğin sonraki uyanışa ulaştığını tek başına kanıtlamıyordu.
Yeni gerçek PostgreSQL senaryosu iki küçük çevrimi ve her birinden sonraki NORMAL_WAKE'ı
mevcut application servisleriyle yürütür:

1. Aynı tarih aralığında, aynı geçmiş çekim koşulunda iki görünür TRUSTED kaynak kurulur.
   Kontrolün güveni 0,51, öğrenilen kaynağınki 0,50; başka kaynaklar fixture'da dışlanır.
2. İlk görünür kaynak öğesine bağlı reflection güveni +0,02, warmth değerini +0,01 değiştirir.
   Persona v2 profilin güncel sürümü olur; bu DB işaretçisinden açılan normal uyanış v2
   snapshot'ını alır; kaynak seçme
   sırası 0,52 nedeniyle değişir ve `buildRuntimePrompt` güncel temperamenti içerir.
3. İkinci, ayrı kaynak öğesiyle -0,02 güven değişimi ve +0,01 warmth uygulanır. Persona v3
   v2'ye bağlıdır. Yeni uyanış kaynak sırasının geri döndüğünü ve v3 karar istemini doğrular.
4. Kimlik/username aynı kalır, dört SOURCE_STATE_CHANGED/PERSONA_CHANGED olayı doğru
   çevrimin kanıtını taşır; normal uyanışlar NO_DELTA ile tamamlanır. Yeni entry/action yoktur.
   Bu fixture'ın yazma bütçesi sıfırdır; modelin yazmama tercihi ölçülmedi. NO_DELTA yeni
   sürüm üretmez.

## Ölçülmüş sonuç

- Taban P4b exact `a571e555b4350c1d9f14417188a3486477c2942f` ile aynı ağaçlı
  main `db286952d58b3a4e76579ae00fbf79ee46e7a68f` üzerindeki çalışma ağacı.
- Yeni gerçek PG16 testi **1/1** geçti; ardından mevcut bütçe ve eksik/görülmemiş kanıt
  retleriyle odaklı regresyon **4/4** geçti (aynı dosyanın diğer 125 testi bu koşuda atlandı).
- Persona/source evolution birim paketi **17/17** geçti. Pozitif/negatif sınırlar, kaynakta mutlak/personada net
  kümülatif bütçe, İstanbul Pazartesi–Pazartesi haftası, kimlik/ontoloji ve alan korumaları dahil.
- İlk fixture denemesi `23514 agent_sources_block_check` verdi: pinned kaynak aynı anda
  blocked yapılıyordu. Testin izolasyon kurulumu `adminPinned=false` ile düzeltildi; uygulama
  veya DB kısıtı gevşetilmedi. Düzeltmeden sonraki iki yerel koşu geçti.

## İddianın sınırı ve kalan kabul

Bu iki çevrim **aynı gerçek test haftasında**, saniyeler içinde, kontrollü servis girdileriyle
çalıştı. İki doğal hafta simüle edilmiş veya yaşanmış sayılmaz. DB saatini taklit etmek için
immutable geçmiş güncellenmedi; API zamanı ile DB varsayılan createdAt'ı farklı takvimlere
zorlayıp sahte bütçe sonucu üretilmedi. Takvim sınırı ayrıca birim testinin konusudur.

Kanıtlanan davranış yolu, sunucunun kaynak sırası ve gerçek karar istemine iletimidir.
Sıra yalnız eşit çekim durumunda, 0,01 güven farkıyla değişti; gerçek sorguda çekim yeniliği
güvenden önce gelir. Scheduler devre dışıdır; yeni uyanışın otomatik oluşturulması ölçülmedi.
Yeni ve daha iyi bir model tercihi, doğal persona ayrışması, dil kalitesi veya kalıcı ikna
alışkanlığı kanıtlanmadı. Provider çağrısı yapılmadı; completion payload'ları test girdisidir.
`usageMetadata.provider=codex-cli` mevcut wire literal'ıdır, gerçek model çalışması makbuzu değildir.

A′ sonrası kısa pilot aynı model/effort ve eşleşmiş bağlamla doğal seçim farkını inceler;
özellik başına 24 çağrı/90 dakika sınırı korunur. Gerekçeli değişmeme de geçerli sonuçtur.
Test başarıları resmî 168 saatlik kabul veya P8 ebeveyn başarısı yerine kullanılamaz.

Bu dilimde migration, üretim erişimi, persona rollout veya benchmark yoktur. Exact CI ve
bağımsız kaynak incelemesi sonucu tamamlanınca makbuza eklenir.

## Opus incelemesi ve küçük kapanışlar

Gerçek `claude-opus-5`, exact `675ef85fdc31e33b2267867c3cfa80e423e8069a`: ilk karar
DÜZELTİLMELİ; A1/A2/A3 uygulanınca KOD GO koşulu verdi. Araçsız/salt okunur, izin reddi yok;
testleri kendisi çalıştırmadı. Bu SHA taban `db28695` + bu test/belge dilimidir, aynı ağaç iddiası yok.

- Sıralamanın eşit pin/çekim koşuluna bağlı olduğu ve otomatik scheduler'ı sınamadığı yukarıda
  daraltıldı. Profilin currentPersonaVersionId alanı doğrudan doğrulanır; yeni normal uyanış
  bu DB işaretçisinden açılır. warmth kontrolü altı ondalık hassasiyetle yapılır.
- Yazma bütçesinin sıfır olduğu açıklandı. Farklı run UUID'siyle zaten farklılaşacak bütün
  prompt'ları karşılaştıran zayıf assert kaldırıldı; gerçek temperament içeriği ve sürümü
  ayrı ayrı kontrol edilir. Her çevrimin yaşam olayı yalnız kendi tek kanıtını taşır.
- A5'in iki katmanı ayrıdır: persona genel haftalık bütçesi işaretli net toplamı sınırlar;
  bu alanlarda mutlak salınım tavanı iddia edilmez. Ancak source trust için application/runtime.ts
  ayrıca `assertSourceScoreWeeklyBudget` çağırır; kaynak audit'i mutlak hareketi sayar.
  +0,02/-0,02 kaynak güveni **sıfır değil 0,04** tüketir. Son kaynak audit'inin
  usedBefore=0,02, requested=0,02, usedAfter=0,04 olduğu yeni doğrudan assert ile sınanır.
  Genel persona bütçesinin semantiği bu doğrulama diliminde değiştirilmedi.

Küçük koşulların son test ve exact CI sonuçları ayrıca kaydedilir; koşulsuz yeni hakem turu
veya doğal model pilotu yapılmış gibi sunulmaz.

Hakem koşullarından sonra yeni PG senaryosu dahil dört ilgili vaka **4/4** geçti
(`reflection-regression-2.log`); profil işaretçisi, altı ondalık sıcaklık, tek çevrim kanıtı
ve mutlak kaynak bütçesi assert'leri dahil. İlk exact `675ef85` CI `37166324538` **7/7**;
son test/belge düzeltmesinin exact CI sonucu ayrıca kaydedilir. Üretim kodu değişmedi.

## Ana dal kapanışı

Son exact head `d2ac2d1c8b08b41afec0a96d0f835df04bd09848`, CI `37167331459` **7/7**.
Opus'un A1/A2/A3 koşulları yukarıdaki mekanik/test kapanışıyla karşılandı. Taze head/base,
checks/reviews ve mergeability doğrulamasından sonra #303 squash ile
`2277eb41055d19e4535f238ee75b0a1f6d2f7e3e` ana dalına alındı. Uzak SHA ve final head ile
aynı ağaç doğrulandı. Üretim erişimi/dağıtım yok; doğal pilot açık.
