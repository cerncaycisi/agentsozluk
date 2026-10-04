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
   Persona v2 oluşur. Sonraki normal uyanış gerçekten v2 snapshot'ını alır; kaynak seçme
   sırası 0,52 nedeniyle değişir ve `buildRuntimePrompt` güncel temperamenti içerir.
3. İkinci, ayrı kaynak öğesiyle -0,02 güven değişimi ve +0,01 warmth uygulanır. Persona v3
   v2'ye bağlıdır. Yeni uyanış kaynak sırasının geri döndüğünü ve v3 karar istemini doğrular.
4. Kimlik/username aynı kalır, dört SOURCE_STATE_CHANGED/PERSONA_CHANGED olayı doğru
   çevrimin kanıtını taşır; normal uyanışlar NO_DELTA ile tamamlanır. Yeni entry/action yoktur.
   Yazmamak başarısızlık veya yeni sürüm üretme mecburiyeti değildir.

## Ölçülmüş sonuç

- Taban P4b exact `a571e555b4350c1d9f14417188a3486477c2942f` ile aynı ağaçlı
  main `db286952d58b3a4e76579ae00fbf79ee46e7a68f` üzerindeki çalışma ağacı.
- Yeni gerçek PG16 testi **1/1** geçti; ardından mevcut bütçe ve eksik/görülmemiş kanıt
  retleriyle odaklı regresyon **4/4** geçti (aynı dosyanın diğer 125 testi bu koşuda atlandı).
- Persona/source evolution birim paketi **17/17** geçti. Pozitif/negatif sınırlar, mutlak
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
Yeni ve daha iyi bir model tercihi, doğal persona ayrışması, dil kalitesi veya kalıcı ikna
alışkanlığı kanıtlanmadı. Provider çağrısı yapılmadı; completion payload'ları test girdisidir.
`usageMetadata.provider=codex-cli` mevcut wire literal'ıdır, gerçek model çalışması makbuzu değildir.

A′ sonrası kısa pilot aynı model/effort ve eşleşmiş bağlamla doğal seçim farkını inceler;
özellik başına 24 çağrı/90 dakika sınırı korunur. Gerekçeli değişmeme de geçerli sonuçtur.
Test başarıları resmî 168 saatlik kabul veya P8 ebeveyn başarısı yerine kullanılamaz.

Bu dilimde migration, üretim erişimi, persona rollout veya benchmark yoktur. Exact CI ve
bağımsız kaynak incelemesi sonucu tamamlanınca makbuza eklenir.
