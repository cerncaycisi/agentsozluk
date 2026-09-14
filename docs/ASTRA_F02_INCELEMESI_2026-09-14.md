# F02 hakem turu — Astra, 14 Eylül 2026: NO-GO

Bu bir inceleme makbuzudur; tek aktif sıra [PLAN.md](PLAN.md). Kod bu dalda **yok**:
F02 commit'i (`24409bb`) bu dalda geri alındı, `claude/nerde-kalmisiz-ugoh1y` dalında duruyor.
İncelenen diff o commit'in kendisidir. Hakem: Astra (`gpt-6-astra`, xhigh, read-only),
yürütücü Claude (Opus 5) — `AGENTS.md` hakem kuralı. Astra araç kullanmadı; kaynak
incelemesidir, çalıştırılmış doğrulama değildir ve `supportsDualConcurrency`, repository
gövdeleri ile set-kapısı pakete girmemişti.

## Karar: NO-GO

### P1 — "Kayıt yoksa ayarı koru" iddiayı çürütüyor

F02'nin amacı eşzamanlılığı **güncel kapasite kanıtına** bağlamak. Fakat
`runtime-concurrency.ts` kapasite kaydı **yokken** ayarı koruyor: `configuredConcurrency=2`
ve kayıt `null` ise etkin sınır **2** oluyor — yani kanıtsız. Yazarın gerekçesi set-kapısının
(`assertDualConcurrencySupported`) kanıtsız 2 yazılmasını engellemesi; Astra'nın itirazı:
set-kapısı **yazma anını** korur, ayarın ömrü boyunca kanıtın **kalacağını** garanti etmez
(silme, temizlik, migration, seed, restore, alternatif yazma yolları). Paylaşılan kaynakta
böyle bir yolun var olduğu da, "oluşamaz" iddiasının kanıtı da yok.

**Öneri:** eksik kayıtta etkin sınır **1** ve görünür `BENCHMARK_MISSING` nedeni. Mevcut
birim testi bu tartışmalı tercihi "beklenen sonuç" diye sabitliyor; invariantı ispatlamıyor.

### P2 — Düşüş operatöre görünmüyor

Kanıt reddedilince resolver 1 döndürüyor ama ayar 2 kalıyor; scheduler bunu genel
`CAPACITY_FULL`/`QUEUE_NOT_EMPTY` sonucuna gömüyor. Operatör en azından **istenen sınır,
etkin sınır, karar nedeni, kullanılan ölçüm kimliği ve `staleAt`** değerlerini aynı görünümde
görebilmeli; durum değişiminde kayıt/uyarı üretilmeli (her poll'da değil).

### Sürüm kimliği zayıf (devralınan)

`capacity.ts` `codexVersion` yokken `model` alanını sürüm yerine koyuyor ve `majorVersion`
ilk sayıyı çekiyor: `gpt-5` → major 5. Bu, Codex CLI major sürümünü kanıtlamaz. Ayrıca
resolver sürümü repository kaydının `usageMetadata`'sından alıyor; "en son gözlenen sürüm"
ile "şimdi çalıştıracak worker'ın sürümü" aynı şey değil.

### Sıcak yol ve yarış

Ek okuma sayısı sabit değil: ayar 2 değilse 0, kayıt yoksa 1, kayıt varsa 2 çağrı.
Deadlock/serileştirme iddiası için sorgu planı ve yük altında ölçüm gerekir. Scheduler ile
lease'in farklı anlarda farklı sonuç okuması tek başına sınır aşımı değildir; asıl güvence
lease'in aktif koşu sayımı ile atamayı birlikte koruması.

## Prompt profili hash'i etkileşimi — doğrulandı, ama ifadem düzeltildi

Etkileşim gerçek: çalışan kod yeni profil hash'ini (`e8c4…0183`) kullanırken kapasite kaydı
eski hash'te (`327c…ec15`) kalırsa etkin tavan 2 → 1 olur. **Düzeltme:** "koşu hacmi yarılanır"
demiştim; yarılanan **tavandır**, gerçek hacim doygunluk, süreler ve dispatch olasılığına
bağlıdır. AW/Gate 10 sayısal etkisi buradan hesaplanamaz.

**Dağıtım sırası sandığımdan zor.** Repository tek global son kaydı seçiyorsa, yeni hash'li
bir kayıt **eski kodu da** 1'e düşürebilir; "önce benchmark, sonra kod" yetmez. Astra'nın
savunulabilir sırası: hedef birleşik sürümü sabitle → yeni dispatch'i durdur, aktif koşuları
tamamlat → hedef sürümü kontrollü 1 ile aç → **hedef profil, gerçek binary ve hedef ortamla**
çift eşzamanlılık benchmark'ını tamamla → etkin 2 doğrulandıktan sonra normal akış ve yeni
ölçüm penceresi. Ayrıca **benchmark'ın kendisi F02 tarafından 1'e sınırlanıyorsa** çift
eşzamanlılığı ölçmenin yolu kapanabilir; bu ayrıca incelenmeli.

**Geri dönüş:** eski prompt kodu tek başına yetmez; eski hash'le eşleşen ve hâlâ geçerli
ölçümün de seçilmesi gerekir. Kaydı silerek 2 açmak P1'deki açığı kullanmak olur.

## Merge ve üretim için koşullar

- Eksik-kayıt davranışı düzeltilsin **veya** iddia edilen invariant uçtan uca kanıtlansın.
- Worker sürümünün kaynağı netleşsin; görünürlük eklensin.
- Gerçek lease/scheduler eşzamanlılık testleri yazılsın (yarış, geçiş sırasında 2 → 1,
  iki aktif koşunun tamamlanması, repository hatası, eksik kayıt).
- Tam kaynak ve sabit SHA üzerinden yeniden hakem turu.
- Üretim ayrıca: yetkili durum kontrolü, hedef hash için geçerli kanıt **veya** kabul edilmiş
  1 geçişi, ölçülmüş sıcak yol maliyeti, eşleşen kod+kanıt geri dönüşü, AW/Gate 10
  pencerelerinin geçişte nasıl ayrılacağı.
