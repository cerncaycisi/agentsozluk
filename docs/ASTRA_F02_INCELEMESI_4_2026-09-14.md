# Astra F02 dördüncü tur — GO (yalnız delta)

> `gpt-6-astra`, xhigh, read-only, araçsız; yalnız kendisine verilen diff üzerinden.
> Yürütücü: Claude (Opus 5). Kural: `AGENTS.md` hakem bloğu.

**GO — paylaşılan delta için. Bloklayıcı bulgu yok; testlerde yeşile boyama görmüyorum.**

- **`id` sıralaması:** Belirttiğin kilit sözleşmesi altında doğru. Autoincrement tek başına transaction’ların tamamlanma sırasını garanti etmez. Burada aynı ayar satırının kayıt yazılmadan önce kilitlenmesi ve transaction sonuna kadar tutulması yazımları sıraya sokuyor. Rollback, ID dizisinde boşluk bırakabilir; kalıcı kararların sırasını tersine çevirmez. Kilidin alındığı kod bu deltada görünmediğinden, bu değerlendirme tarif ettiğin mevcut sözleşmeye dayanıyor.

- **İndeks gerekçesi:** “Yalnız değişince yazıldığı için çok küçük kalır” kesin bir güvence değil. Parmak izinde `measurementId` ve `staleAt` da var; sınır değişmese bile yeni ölçümler kayıt üretebilir ve geçmiş birikir. Mevcut indeks `eventType` filtresinde kullanılabilir, fakat `id DESC` sıralamasını doğrudan karşılamaz. Buradan ölçülmüş bir performans sorunu çıkaramam; NO-GO gerekçesi yok.

- **Test 1:** Ayırt edici adım artık mevcut: **bir koşu kaldığında** bekleyen lease hâlâ `CAPACITY_FULL` alıyor. Ardından ikinci koşunun gerçek tamamlama yolundan bitmesi ve bekleyenin alınması, düşüşün kuyruğu kalıcı olarak kilitlemediğini de sınıyor. Gerçek tamamlama yolunu kullanmak testi güçlendiriyor.

- **Test 4:** Scheduler’ı fixture hazırlanırken kapatmak testi sahteleştirmiyor. Ölçülen tick sırasında scheduler açık ve kuyruk boş. Üstelik yalnız `createdRuns: 0` değil, **`skipReason: "CAPACITY_FULL"`** da aranıyor; `QUEUE_NOT_EMPTY` nedeniyle durmak testi geçiremiyor.

- **Test 6:** Elle oluşturulmuş kararlar bu testin kapsamına uygun. Test, karar hesabını değil kayıt seçimi ve tekrar yazmama davranışını sınıyor. Eski `occurredAt DESC` kullanılsaydı üçüncü çağrı ilk kararı seçip fazladan kayıt yazardı; `recorded: false` beklentisi düşerdi. Test ayırt edici; kilit yarışını ayrıca kanıtlamıyor.

Küçük bir test dayanıklılığı riski var: `NOW` modül yüklenirken sabitleniyor. Gerçek tamamlama bu andan itibaren 300 saniyelik lease süresini aşarsa test süre aşımı nedeniyle kırılabilir. Etkisi **yanlış kırmızı**, yeşile boyama değil; zamanı test başlangıcında almak bu riski daraltır.

Araç kullanmadım. Test geçişlerini ve bildirilen negatif kontrol sonuçlarını yeniden ölçmedim; paylaşılan kod, 1–4 ile 5–6 arasındaki açıklanan ayrımla tutarlı.
