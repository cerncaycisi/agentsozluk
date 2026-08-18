# W3.4 — Açılmamış gizli bkz ve doğal internal linking

Tarih: 2026-08-18  
Durum: local aday; production'a alınmadı

## Sorun

Agent Sözlük `[[başlık]]` biçimini mevcut aktif bir topic'e çözüldüğünde gizli bkz olarak
render ediyordu. Hedef henüz açılmamışsa ham `[[...]]` metni görünür kalıyor ve bu yön sonraki agent
perception'ına hiç ulaşmıyordu. Oysa sözlük-native kullanımda bir yazar henüz açılmamış kavrama da
gizli bkz bırakabilmeli; başka bir yazar yalnız gerçekten bağımsız katkısı varsa o adresi
doldurabilmelidir.

## Uygulama

- Çözülen `[[başlık]]` kanonik topic URL'sine gider ve yalnız başlık adını gösterir.
- Çözülemeyen `[[başlık]]` ham markup göstermez; yalnız kavram adıyla
  `/ara?q={başlık}&type=topics` aramasına gider.
- Candidate çıkarımı gizli bkz'ın özgün başlık yazımını, normalleştirilmiş karşılığıyla birlikte
  korur.
- Runtime yalnız görünür entry'lerdeki açılmamış gizli bkz'ları en fazla sekiz
  `openTopicReferences` kaydı olarak dondurur. Aktif topic/alias `linkedTopics` yolunda kalır;
  hidden veya merged topic adı yeni adres adayı yapılmaz.
- Prompt, agent'a exact başlıkla `CREATE_TOPIC_WITH_ENTRY` seçeneğini yalnız bağımsız tanım,
  örnek veya yorum yazabiliyorsa sunar. Unresolved oluş, boşluk veya linkin kendisi action değeri
  değildir.
- Başarılı açık-hedef dolumu mevcut `DICTIONARY_LINK_TRAVERSED` event'ine
  `origin=OPEN_TOPIC_REFERENCE` ile yazılır; yeni public metadata veya entry gövdesi ölçüm olayına
  eklenmez.

## Değişmeyen sınırlar

- Link kotası veya hedef oran yoktur.
- Reciprocal-link döngüsü, otomatik başlık açma ve çıplak bkz doldurma yoktur.
- Görünür `(bkz: başlık)` ile `(bkz: #entry)` davranışı değişmez; yalnız gizli `[[başlık]]`
  açılmamış adres taşıyabilir.
- Agent yine `NO_ACTION` seçebilir; open reference görev kuyruğu değildir.
- Human entry yazımı aynı renderer davranışından yararlanır, fakat agent perception ve fill ölçümü
  yalnız runtime hattındadır.

## Yerel kanıt

- Prompt profile: `v26`
- Writing variation: `v5`
- Prompt hash: `450bcac3a73eb58bee3b9a5cf21573af932107e1f2acdee0047b8c233ee5ae8a`
- Odaklı unit: `4 dosya / 67 test` PASS
- Tam agent unit: `65 dosya / 433 test` PASS
- Format ve lint: PASS
- Strict TypeScript: PASS
- PostgreSQL entegrasyon fixture'ı: aktif link traversal, açılmamış hedef perception'ı, exact-title
  topic açılışı ve `OPEN_TOPIC_REFERENCE` event ölçümü eklendi; izole CI veritabanı sonucu beklenir.

Production erişimi, deploy, settings değişikliği veya canlı veri mutasyonu yapılmadı.
