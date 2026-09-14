# Astra F02 üçüncü tur — NO-GO

> `gpt-6-astra`, xhigh, read-only, araçsız; yalnız kendisine verilen diff üzerinden.
> Yürütücü: Claude (Opus 5). Kural: `AGENTS.md` hakem bloğu.

**NO-GO.** Paylaştığın diff üzerinden üç P2 bulgum var. Araç kullanmadım; test sonuçlarını çalıştırarak doğrulamadım.

1. **P2 — “Son uygulanan karar” yanlış seçilebilir.**  
   `src/modules/agents/repository/control-plane.ts:709`, `src/modules/agents/application/runtime-concurrency.ts:239`

   **Tetikleyici:** Çağrılar kilide, taşıdıkları `now` değerlerinin sırasından farklı sırada girer. Örneğin önce tamamlanan transaction `2` kararını daha yeni zamanla; ardından tamamlanan transaction `1` kararını daha eski zamanla kaydeder. İstek başında alınmış zamanla kilide geç ulaşmak bunu mümkün kılar.

   **Etki:** `occurredAt DESC` sorgusu eski uygulanmış kararı seçer. Operatör ekranı uygulanmış `1` yerine `2` gösterebilir; sonraki değerlendirme zaten uygulanmış kararı tekrar kaydedebilir. Ayar satırı kilidi transaction’ları sıraya koysa bile verilen zamanları monoton yapmaz.

   **Düzeltme:** Son kararı uygulama sırasını temsil eden monoton kimlikle seçin; ters zaman sırasıyla kaydedilen iki karar için test ekleyin.

2. **P2 — “Negatif kontrolde dördü de düşüyor” iddiası gösterilen testle uyuşmuyor.**  
   `docs/F02_DAGITIM_2026-09-14.md:80`, `tests/integration/agent-runtime-concurrency-evidence.test.ts:299`

   **Tetikleyici:** Yalnız lease ve scheduler’daki yeni bloklar eski eşzamanlılık satırlarına döndürülür.

   **Etki:** Dördüncü test bu çağrı noktalarını sınamıyor; `resolveEffectiveRuntimeConcurrency` ve `recordEffectiveConcurrencyDecision` fonksiyonlarını doğrudan çağırıyor. Tarif edilen geri alma, bu testin assertion’larını bozmaz. Dört başarısızlık görüldüyse başka bir değişiklik veya kurulum hatası da açıklanmalıdır.

   Bu test kayıt yardımcısının transaction rollback davranışına kanıt sağlar. Lease/scheduler mutasyonunu yakaladığına kanıt sağlamaz. Negatif kontrolün tam değişikliğiyle test bazındaki hata nedenlerini eşleştirip belgeyi düzeltin.

3. **P2 — Uçuş sırasında düşüş testi kritik admission farkını sınamıyor.**  
   `tests/integration/agent-runtime-concurrency-evidence.test.ts:220`, `:234`; `finishRun` yardımcısı `:143`

   **Tetikleyici:** Kanıt eskidiğinde iki koşu çalışıyor; bekleyen lease reddediliyor. Sonra iki koşu birden bitirilip bekleyen lease kabul ediliyor.

   **Etki:** Bu admission sonuçlarını eski `2` sınırı da üretir: iki dolu şeritte reddeder, ikisi boşalınca kabul eder. Testteki karar metadata’sı doğru kalırken uygulanan sınır yanlışlıkla `2` olsa bu senaryo bunu yakalamaz. Ayrıca `finishRun` doğrudan veritabanını güncelliyor; gerçek tamamlama yolunun çalıştığını kanıtlamıyor.

   Önce **yalnız bir koşuyu bitirip**, kalan bir koşu varken bekleyenin hâlâ `CAPACITY_FULL` aldığını sınayın. Sonra gerçek tamamlama yoluyla ikinciyi bitirip tüketimi doğrulayın. Scheduler için de **bir çalışan, sıfır bekleyen koşu ve eskimiş kanıt** durumunda yeni koşu üretmediğini sınayın; mevcut yeni test scheduler’ı yalnız taze kanıtla çağırıyor.

Diğer maddelerde değerlendirmem:

- **Yanlış sınıflandırma düzeltilmiş.** Gösterilen dallanma ve ayrı assertion’larda yeni bulgum yok.
- **Ortak fixture testleri zayıflatmıyor.** Görünen assertion’lar korunuyor; iki şerit senaryosunun eksik kapasite/fingerprint önkoşulu kuruluyor. Bu, sentetik verilerle gerçek veritabanı entegrasyonudur; gerçek benchmark sonucu değildir.
- **Kapsam daraltması dürüst.** Devralınan sürüm zayıflığı açıkça yazılmış ve testle görünür tutulmuş. Dar F02 kapsamını bu nedenle yeniden bloke etmiyorum.
- **`callPath` parmak izinin dışında kalabilir.** Scheduler önce kaydettiğinde, lease aynı kararı uygulasa da kaydın scheduler kalması değişim günlüğü için tutarlı. Görünümde anlamını **“Değişimi ilk kaydeden yol”** olarak belirtin; son uygulayan yolu göstermiyor.
- **Kilit gerekçesi koşullu olarak doğru.** İki çağıran aynı ayar satırını aynı transaction boyunca kilitliyorsa seri erişim dayanağı vardır. Kilit çağrıları ve uygulaması bu diff’te görünmediğinden bunu doğrulanmış sayamam.
- **Dağıtım sırası uygun.** Ayar `1` iken benchmark’ın iki gerçek yürütmeyi nasıl örtüştüreceği hâlâ çözülmesi gereken operasyon önkoşulu; belgede bunun inceleneceğinin yazılması, kapının geçildiği anlamına gelmez.
  tokens used
  27,683
  **NO-GO.** Paylaştığın diff üzerinden üç P2 bulgum var. Araç kullanmadım; test sonuçlarını çalıştırarak doğrulamadım.

1. **P2 — “Son uygulanan karar” yanlış seçilebilir.**  
   `src/modules/agents/repository/control-plane.ts:709`, `src/modules/agents/application/runtime-concurrency.ts:239`

   **Tetikleyici:** Çağrılar kilide, taşıdıkları `now` değerlerinin sırasından farklı sırada girer. Örneğin önce tamamlanan transaction `2` kararını daha yeni zamanla; ardından tamamlanan transaction `1` kararını daha eski zamanla kaydeder. İstek başında alınmış zamanla kilide geç ulaşmak bunu mümkün kılar.

   **Etki:** `occurredAt DESC` sorgusu eski uygulanmış kararı seçer. Operatör ekranı uygulanmış `1` yerine `2` gösterebilir; sonraki değerlendirme zaten uygulanmış kararı tekrar kaydedebilir. Ayar satırı kilidi transaction’ları sıraya koysa bile verilen zamanları monoton yapmaz.

   **Düzeltme:** Son kararı uygulama sırasını temsil eden monoton kimlikle seçin; ters zaman sırasıyla kaydedilen iki karar için test ekleyin.

2. **P2 — “Negatif kontrolde dördü de düşüyor” iddiası gösterilen testle uyuşmuyor.**  
   `docs/F02_DAGITIM_2026-09-14.md:80`, `tests/integration/agent-runtime-concurrency-evidence.test.ts:299`

   **Tetikleyici:** Yalnız lease ve scheduler’daki yeni bloklar eski eşzamanlılık satırlarına döndürülür.

   **Etki:** Dördüncü test bu çağrı noktalarını sınamıyor; `resolveEffectiveRuntimeConcurrency` ve `recordEffectiveConcurrencyDecision` fonksiyonlarını doğrudan çağırıyor. Tarif edilen geri alma, bu testin assertion’larını bozmaz. Dört başarısızlık görüldüyse başka bir değişiklik veya kurulum hatası da açıklanmalıdır.

   Bu test kayıt yardımcısının transaction rollback davranışına kanıt sağlar. Lease/scheduler mutasyonunu yakaladığına kanıt sağlamaz. Negatif kontrolün tam değişikliğiyle test bazındaki hata nedenlerini eşleştirip belgeyi düzeltin.

3. **P2 — Uçuş sırasında düşüş testi kritik admission farkını sınamıyor.**  
   `tests/integration/agent-runtime-concurrency-evidence.test.ts:220`, `:234`; `finishRun` yardımcısı `:143`

   **Tetikleyici:** Kanıt eskidiğinde iki koşu çalışıyor; bekleyen lease reddediliyor. Sonra iki koşu birden bitirilip bekleyen lease kabul ediliyor.

   **Etki:** Bu admission sonuçlarını eski `2` sınırı da üretir: iki dolu şeritte reddeder, ikisi boşalınca kabul eder. Testteki karar metadata’sı doğru kalırken uygulanan sınır yanlışlıkla `2` olsa bu senaryo bunu yakalamaz. Ayrıca `finishRun` doğrudan veritabanını güncelliyor; gerçek tamamlama yolunun çalıştığını kanıtlamıyor.

   Önce **yalnız bir koşuyu bitirip**, kalan bir koşu varken bekleyenin hâlâ `CAPACITY_FULL` aldığını sınayın. Sonra gerçek tamamlama yoluyla ikinciyi bitirip tüketimi doğrulayın. Scheduler için de **bir çalışan, sıfır bekleyen koşu ve eskimiş kanıt** durumunda yeni koşu üretmediğini sınayın; mevcut yeni test scheduler’ı yalnız taze kanıtla çağırıyor.

Diğer maddelerde değerlendirmem:

- **Yanlış sınıflandırma düzeltilmiş.** Gösterilen dallanma ve ayrı assertion’larda yeni bulgum yok.
- **Ortak fixture testleri zayıflatmıyor.** Görünen assertion’lar korunuyor; iki şerit senaryosunun eksik kapasite/fingerprint önkoşulu kuruluyor. Bu, sentetik verilerle gerçek veritabanı entegrasyonudur; gerçek benchmark sonucu değildir.
- **Kapsam daraltması dürüst.** Devralınan sürüm zayıflığı açıkça yazılmış ve testle görünür tutulmuş. Dar F02 kapsamını bu nedenle yeniden bloke etmiyorum.
- **`callPath` parmak izinin dışında kalabilir.** Scheduler önce kaydettiğinde, lease aynı kararı uygulasa da kaydın scheduler kalması değişim günlüğü için tutarlı. Görünümde anlamını **“Değişimi ilk kaydeden yol”** olarak belirtin; son uygulayan yolu göstermiyor.
- **Kilit gerekçesi koşullu olarak doğru.** İki çağıran aynı ayar satırını aynı transaction boyunca kilitliyorsa seri erişim dayanağı vardır. Kilit çağrıları ve uygulaması bu diff’te görünmediğinden bunu doğrulanmış sayamam.
- **Dağıtım sırası uygun.** Ayar `1` iken benchmark’ın iki gerçek yürütmeyi nasıl örtüştüreceği hâlâ çözülmesi gereken operasyon önkoşulu; belgede bunun inceleneceğinin yazılması, kapının geçildiği anlamına gelmez.
