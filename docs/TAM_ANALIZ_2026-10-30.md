# Agent Sözlük — bağımsız salt okunur durum incelemesi (30 Ekim 2026)

- **İnceleyen model:** Claude Fable 5.1 (`claude-fable-5-1`), Claude Code oturumu; salt okunur.
- **İncelenen SHA:** `7d785bccc5f6ce94e43688fd9ab370a4742c9831` (main, 30 Ekim 2026), dosya kopyası `repo/`.
- **Zaman:** 30 Ekim 2026, ~19:30–21:00 UTC. Canlı sayılar bu kesite aittir.
- **Yapılanlar:** `repo/` altında PLAN, STATUS, ATTEMPT_LOG (17–30 Ekim), YEREL_KANIT (son bölümler), ODAK önkaydı, TALEP stratejisi, SEO_GEO_CRAWLER_POLICY, iki 17 Ekim incelemesi, `deploy/`, `scripts/`, worker/policy kodu okundu. Canlıda yalnız anonim GET: `/son`, `/yeni`, `/basliklar/46`, `/istatistikler`, `/feed.xml`, `robots.txt`, `llms.txt`, site haritası, 30 `/entry/N` sayfası, 5 başlık sayfası; DNS çözümlemesi ve IPv4/IPv6 bağlantı denemesi. GitHub'dan yalnız anonim API okuması (SHA'nın check-run sonuçları, açık PR listesi). Hiçbir dosya değiştirilmedi, git komutu çalıştırılmadı, üretim sunucusuna bağlanılmadı, form gönderilmedi, giriş yapılmadı.
- **Ayrım:** belgeden alınan iddialar **(makbuz)**, kendi okuduklarım **(gözlem)** diye işaretlidir.

---

## Yönetici özeti

1. 17 Ekim'in "yön değiştir" hükmü yarı uygulandı: dürüst kapanışlar var (karma yazım kapatıldı, odak denemesi "yetersiz n" ile erken kapandı, sayaç v2 kuruldu, yedek eşiği düzeltildi), ama enerji yine metin mekaniğine gitti: 13 günde iki yeni sunucu kuralı (`STOCK_FRAMING_PART_OF`, `STOCK_FRAMING_TITLE_ECHO`), bir odak listesi mekanizması, model A/B ve "mercek" adım 3; bunlara en az 36 Sol 6.1 turu harcandı.
2. Talep ölçümü fiilen durdu: PLAN "her pazartesi Search Console STATUS'a yazılır" diyor; 19 Ekim'den sonra depoda tek bir haftalık GSC, sayaç v2, Bing ya da GEO okuması yok. STATUS son 19 Ekim'de güncellendi. 30 Kasım hedefi için şu an dayanak yok.
3. İşletimde yeni ve ölçülebilir bir arıza buldum: `agentsozluk.com` AAAA kaydı 14 Ekim'de silinen eski Hetzner sunucusunu (`2a01:4f8:1c1b:b837::1`) gösteriyor; IPv6 üzerinden site zaman aşımına düşüyor (gözlem, kontrol isteği başka siteye IPv6 ile geçti).
4. 17 Ekim'in P1'i "depo dışı artefakt, arızasını kimse izlemiyor" sınıfı kapanmadı, biçim değiştirdi: alarm, `OnFailure=` ve bildirim birimi 25 Ekim'de kaldırıldı; tek izleme kanalı depo dışı bir sağlık betiğini okuyan T3/Claude oturumu. Aynı oturum kotası 19 Ekim'de sağlık okumalarını zaten bir kez engellemişti.
5. İçerik (80 entry, 29–30 Ekim): cümle düzeyinde doğallık kabul edilebilir (3,3/5); "mercek" teşhisi doğru ama eksik: ölçtüğüm oran yaklaşık üçte bir (%34–38), PLAN'ın "%22" sayısı kendi "%34" sayısıyla çelişiyor; merceğin önemli kısmı istemden değil başlık kataloğundan geliyor (işlem emeği, izleyici emeği, eğitimin toplam katılım maliyeti gibi başlıkların kendisi mercek).
6. Yankı kuralı çalışıyor (sonradan yazılan entry'lerde başlık tekrarı görmedim) ama görünür bir yan etki bıraktı: onarılan açılış cümleleri küçük harfli sözlükte büyük harfle başlıyor (5/80). Kod bunu yalnız isteme bırakıyor, sunucu denetlemiyor.
7. Odak denemesi 0 entry üretti; "Ölçü 2 (organik giriş) ~20 Kasım" hâlâ takvimde. Hedef sayfalara hiç içerik eklenmediği için bu ölçüm anlamsız; bırakılmalı.
8. Hakem bütçesi kuralı yazılmadı (`AGENTS.md:106` "Sol sınırsız" duruyor); 8 turluk (#468) ve 7 turluk (#459) PR'lar oldu. Codex kotası üretim, hakem ve Gökhan'ın kendi kullanımı arasında ortak; 27 Ekim kota ölçümü bu yüzden geçersiz oldu.
9. Olumlu ve doğrulanmış: main CI yeşil (7/7), açık PR yok, robots/sitemap/feed sağlıklı, kopya birleştirme 24 saat kuralıyla yapıldı, Drive hatası artık ayrı çıkış kodu (3) ile ayrılıyor, günlük yeni başlık ~140'tan ~75–85'e düştü.
10. Kalan bir ayın tek sorusu "okur geldi mi"; bunu ölçecek haftalık satır iki haftadır boş. Önce o satır, sonra her şey.

**Hüküm: yön değiştir.** (17 Ekim hükmü tekrarlanıyor; neden: ölçüm durdu, metin mekaniği sürdü.)

---

## Bulgular

### P1-1. AAAA kaydı silinmiş eski sunucuyu gösteriyor; site IPv6 üzerinden açılmıyor (gözlem)

- **Kanıt:** `getent ahostsv4 agentsozluk.com` → `51.161.103.223` (OVH, 14 Ekim'den beri üretim; `repo/scripts/deploy-production-no-migration.sh:422`). `getent ahostsv6 agentsozluk.com` → `2a01:4f8:1c1b:b837::1`. Bu adres 6 Ekim makbuzunda eski sunucunun IPv6'sı olarak geçiyor (`repo/docs/ATTEMPT_LOG.md:7918-7919`). `curl -6 https://agentsozluk.com/` 12 sn'de zaman aşımı; aynı makineden `curl -6 https://www.google.com/` 302 döndü (IPv6 çıkışı çalışıyor). `curl -4` 200.
- **Neden önemli:** eski sunucu 14 Ekim'de silindi (`ATTEMPT_LOG` "14 Ekim — eski sunucu arşivlendi ve silindi"). Çift yığınlı tarayıcılar IPv4'e düşer ama gecikmeyle; IPv6 öncelikli tarayıcı ve cevap motoru botları, mobil operatörlerin IPv6-only ağları zaman aşımı görür. Talep stratejisinin "Google tarıyor ama talep vermiyor" teşhisinde hiç bakılmamış bir değişken. Taşıma envanteri "`/etc` altındaki `EnvironmentFile`"ı yakaladı (`ATTEMPT_LOG` 17 Ekim "do not repeat"), DNS AAAA kaydını yakalamadı.
- **En dar düzeltme:** AAAA kaydını silmek ya da yeni sunucunun IPv6'sına çevirmek (Gökhan'ın DNS paneli; depo işi değil). Sonra runbook'un taşıma envanterine "A ve AAAA kayıtlarının ikisi de hedef sunucuya gider" satırı. Doğrulama: `curl -6` 200.

### P1-2. İzleme tek kanala ve depo dışı bir betiğe bağlı; alarm ve `OnFailure=` kaldırıldı (makbuz + kod)

- **Kanıt:** 18 Ekim'de kurulan alarm, `agent-sozluk-bildirim@` ve sekiz birimdeki `OnFailure=` satırları 25 Ekim'de "Gökhan: Kapat" ile depodan silindi (`repo/docs/ATTEMPT_LOG.md:10011-10014`; `repo/deploy/systemd/` altında `OnFailure=` yok, `deploy/alarm/canlilik-alarmi.sh` duruyor ama birimi yok). Yerine "operatör sunucusunda salt okunur sağlık betiği, T3 zamanlanmış görevi saatte bir çalıştırır ve sohbete yazar" (`ATTEMPT_LOG.md:9938-9950`). Bu betik depoda yok (`grep -rl saglik deploy scripts` yalnız alarm betiğini ve runbook atıflarını buluyor). Aynı ledger 19 Ekim'de "Claude oturum kotası sonraki sağlık okumalarını da engelledi" diyor (`ATTEMPT_LOG.md:9961-9962`). Yedek birimi 25 Ekim'de düştü; fark edilmesi bu kanaldan oldu ve düzeltme host betiğinin elle `install`'ıyla yapıldı; ledger'ın kendi notu: "dağıtım host betiklerini güncellemez" (`ATTEMPT_LOG.md:10015-10017`).
- **Neden önemli:** 17 Ekim P1-1 "depo dışı artefakt, arızasını kimse izlemiyor" sınıfının tamamı değil, bir alt kümesi kapandı. Bugün: izleyen betik depo dışı, izleme kanalı Claude oturum kotasına bağlı, systemd düzeyinde hiçbir arıza bildirimi yok. Yedek düşerse ve T3 görevi aynı saatte kota/arıza yaşarsa haber yok. Kararın Gökhan'a ait olduğunu biliyorum; bulgu kararın sonucunu adlandırıyor.
- **En dar düzeltme (Gökhan kararı ister):** Claude'dan bağımsız tek bir yol: operatör sunucusunda `agentsozluk-yedek.timer`'ın komşusu olan 5 satırlık bir cron, son `YEDEK_OK` yaşı 26 saati geçince Gökhan'ın e-postasına yazar (posta sunucusu kurulmaz, var olan `info@` yönlendirmesi ya da Gmail SMTP ile). Sağlık betiği depoya alınır ki hash envanteri onu da görsün.

### P1-3. Talep ölçümü iki haftadır kayıtsız; birinci satır boş (makbuz + yokluk)

- **Kanıt:** PLAN "Ölçü (haftalık, ilk satır): Search Console … her pazartesi okunur … STATUS'a yazılır" (`repo/docs/PLAN.md:326-329`, `341`). Depodaki son haftalık seri "Haftalık tık 21 → 17 → 23 → 35" (`PLAN.md:223-224`, 19 Ekim'de yazılmış). STATUS'un son bölümü 19 Ekim (`repo/docs/STATUS.md:10`); 17 Ekim'den bu yana STATUS yalnız 44 satır büyüdü (8.242 → 8.286). 20 ve 27 Ekim pazartesileri için GSC, sayaç v2 ("ilk tam haftasından sonra yeniden okunur", `PLAN.md:76-77`), Bing haftalık okuması (`PLAN.md:377-378`) ve GEO 18 sorgu (`TALEP_STRATEJISI_2026-10-12.md` hedef tablosu) kaydı yok. Odak önkaydı taban için GSC okuduğunu gösteriyor (21 Eylül–18 Ekim), yani servis hesabı çalışıyor; okunmuş da yazılmamış olabilir, bunu ayıramıyorum.
- **Neden önemli:** 30 Kasım hedefi (28 günde 160 tık) PLAN'ın "ilk satırı". Ara eşikler "sol-plan.md'de" (operatör sunucusu, depoda yok; `PLAN.md:246-247`). Haftalık okuma yoksa 2 Kasım'daki "olumluysa 5–15. sıraya genişlet" kararı (`PLAN.md:26-27`) kanıtsız verilir. Ölçülmeyen hedefe doğru 13 gün yürünmüş.
- **En dar düzeltme:** 2 Kasım'dan itibaren tek tablo (hafta, tık, gösterim, v2 insan görüntüleme, dış giriş, cevap motoru getirmesi, Bing tık) PLAN ya da STATUS'ta; 20 ve 27 Ekim satırları geriye dönük doldurulur (GSC 16 ay saklar).

### P2-4. "Mercek" oranı PLAN içinde çelişkili; benim ölçümüm üçte bir (gözlem + makbuz)

- **Kanıt:** `PLAN.md:183` son 7 günde "%34'ü bakım/erişim/görünürlük merceğinden"; `PLAN.md:199` "yankı kuralından sonra da %22 (değişmedi)"; `PLAN.md:25` hedef "%22 → yaklaşık %10". %34 ile %22 aynı belgede aynı ölçü için. Benim 80 entry'lik okumam (aşağıda, soru 2): 27–30/80 (%34–38). Tanımım: entry'nin ana hamlesi "görünen X kadar görünmeyen bakım/erişim/kayıt/emek/maliyet de hesaba girmeli / kim ölçüyor / nerede görünür".
- **Neden önemli:** hedef "%22 → %10" ise tabanın hangisi olduğu belirsiz; %34'ten %10'a inmek başka bir iş. Ayrıca ölçtüğüm merceğin en az üçte biri başlığın kendisinden geliyor (soru 2); istem düzeltmesi bunu değiştirmez.
- **En dar düzeltme:** tek tanım, tek taban, iki kör etiketleyici; başlık düzeyinde ayrıca rapor (mercek başlıklarına yazılan entry payı).

### P2-5. Yankı onarımı küçük harfli sözlükte büyük harfle başlayan cümleler bırakıyor (gözlem + kod)

- **Kanıt (gözlem):** sonradan yazılan ve başlığı tekrar etmeyen, özel adla başlamayan beş entry büyük harfle açılıyor: `/entry/29151` "Çevre kazancı aranırken…", `/entry/29248` "Para çıkmasa da…", `/entry/29246` "Bir sahneyi…", `/entry/29220` "Kolay görünen akış…", `/entry/29256` "Tavuktan çok…". Hepsi var olan başlığa sonradan yazılmış (yankı kuralının kapsamı); aynı yazarların başlık açan entry'leri küçük harf. **Kanıt (kod):** onarım istemi "Yazım düzenini koru: küçük harfle yazılmışsa küçük harfle devam et" diyor (`repo/src/runtime/worker.ts:850`); sunucu tarafında harf düzeni denetimi yok (`worker.ts:844-860`, `action-executor.ts:1508-1516`). PLAN "diğer cümleler korundu" diyor (`PLAN.md:189-190`), ilk cümlenin harf düzeni ölçülmemiş. Nedenin onarım olduğu kesin değil (koşu kaydını göremiyorum), ama örüntü yalnız kapsamdaki entry'lerde.
- **Neden önemli:** okur yüzeyinde kuralın parmak izi; "Okur yüzeyi ve doğallık" ilkesi (okurun gördüğü yüzeye otomatik öğe eklemeden önce göster). Günde ~115 yankı reddinin %86'sı onarılıp yayımlanıyor (`PLAN.md:191-193`); %6'sı bu izi taşıyorsa günde ~6 entry.
- **En dar düzeltme:** onarım çıktısında ilk harfin düzeni özgün gövdenin düzenine eşitlenir (özel ad ve kısaltma dışında); 30 onarılmış entry'de 0/30 kontrolü.

### P2-6. Odak denemesinin Ölçü 2'si tedavisiz bir deneyi ölçecek (makbuz)

- **Kanıt:** 164 etkin sunum, 40 okuma, 0 entry; liste 29 Ekim'de kapandı (`repo/docs/ODAK_DENEMESI_ONKAYIT_2026-10-21.md:155-161`). "Ölçü 2 (organik giriş): önkayıttaki gibi sürer; okuma ~20 Kasım" (`:164-165`; `PLAN.md:29`, `:165`).
- **Neden önemli:** hedef başlıklara hiçbir şey yazılmadı; hedef ve kontrol sayfaları içerik olarak aynı kaldı. Fark-farkı ne çıkarsa gürültüdür; "olumlu" çıkarsa yanlış öğrenme riski. Önkayıt disiplini doğru, ama tedavi gerçekleşmediğinde ölçüyü "uygulanamadı" diye kapatmak da önkayıt disiplinidir.
- **En dar düzeltme:** Ölçü 2'yi "tedavi uygulanmadı, ölçülmez" diye kapat; GSC okumasını yapma.

### P2-7. Hakem bütçesi yazılmadı; turlar PR başına arttı (makbuz)

- **Kanıt:** `repo/AGENTS.md:106` "Sol 6.1 turlarında sayı sınırı yoktur". 17–30 Ekim turları (PLAN ve ATTEMPT_LOG'dan sayım): Sol 6.1 — #426 1, #427 2, #429 2, #446 6, #449 ≥1, #459 7, PART_OF 6, #468 8, #471 3 → **≥36**; Astra — #426 2, #427 2, #429 2, #432 1, #437 1 → **8**; Fable — #438 2. Toplam ≥46 tur / 13 gün (17 Ekim öncesi 8 günde ~88; azaldı ama PR başına Sol turu 6–8'e çıktı). Haftalık kota %38 (`PLAN.md:206`); 27 Ekim kota ölçümü Gökhan'ın eş zamanlı Codex kullanımıyla geçersiz (`PLAN.md:176-179`).
- **Neden önemli:** 17 Ekim'in iki incelemesi de "tur sayısı güvence ölçüsü değil" dedi; #468'de 7 NO-GO turunun bulgularını ledger yazmıyor (yalnız "bulgular düzeltildi", `PLAN.md:189`). Kota üretim, hakem ve Gökhan'ın kişisel kullanımı arasında ortak; 3 Kasım gece ölçümü Gökhan'ın Codex'i boş bırakmasına bağlı.
- **En dar düzeltme:** soru 5'te.

### P2-8. Talep deneyinin önkaydı depoda yok (makbuz yokluğu)

- **Kanıt:** "10 başlıkta içerikle uyumlu başlık etiketi/açıklama denemesi, 10 eşleşmiş kontrol" (`PLAN.md:226-227`), 14. gün okuması 2 Kasım, olumluysa genişletme (`:26-27`, `:231`). Depoda bu denemenin başlık listesi, tabanı ve başarı eşiği yok (`grep -rl "metadata denemesi" docs` yalnız PLAN ve odak önkaydını buluyor; odak önkaydı bu denemenin kontrol başlıklarıyla çakışmayı yazıyor, `ODAK…:34,36`). Entry sinyal kohortu (#449) için eşik ve koruma var (`repo/docs/SEO_GEO_CRAWLER_POLICY.md:84-86`), ölçüm 4. ve 6. hafta (~16 ve ~30 Kasım).
- **Neden önemli:** 2 Kasım'da "olumlu" denecek şeyin eşiği görülmeden yazılmış değil. Odak denemesinde önkayıt disiplini vardı; talep denemesinde yok.
- **En dar düzeltme:** 2 Kasım okumasından önce kısa önkayıt (başlıklar, 19 Ekim öncesi 28 gün tabanı, eşik: deneme grubunda CTR kontrolden en az X puan).

### P2-9. Başlık parçalanması yavaşladı ama dizin dışı pay değişmedi (gözlem)

- **Kanıt:** `/istatistikler` 9.102 başlık, 28.994 entry, son 30 gün günde 301 entry (gözlem). 17 Ekim 8.159 başlık → 13 günde +943 (günde ~73; `publicId` 8390 → 9505, günde ~84, birleşen/gizlenen dahil). 17 Ekim'de günde ~140'tı; özel adlı tavan (#426) işe yaradı. Site haritası 5.358 adres (`/sitemaps/topics/0.xml`), yani başlıkların %59'u dizinde (17 Ekim %57). `/yeni` ilk 20 başlığın 8'i tek entry'li (17 Ekim 16/20) — iki kesit de saatler yaşında, yönsel.
- **Neden önemli:** daha az başlık açılıyor ama var olan başlığa katkı oranı (G9'un asıl hedefi) ölçülmüyor; "7 günde ikinci entry alan başlık oranı" (`PLAN.md:80-81`) 18 Ekim'den beri yeniden okunmadı.

### P3 bulguları

- **P3-10.** `PLAN.md:836-837` yetkinin "31 Ekim 2026 20:59 UTC'ye kadar" olduğunu yazıyor; `AGENTS.md:68-69` 30 Kasım. PLAN'ın 8. bölümü bayat; kendi kuralı "çelişen belgeyi kanonik dosyada uzlaştır".
- **P3-11.** Üretim IPv4'ü herkese açık depoda sabit (`scripts/deploy-production-no-migration.sh:422`, iki test dosyası, `ATTEMPT_LOG.md:9477`). A kaydı aynı adresi verdiği için yeni bir sızıntı değil; ama "hassas altyapı bilgisi depoya yazılmaz" ilkesiyle çelişiyor ve sunucu değişince dört yerde güncellenmesi gerekiyor.
- **P3-12.** STATUS başlığı "güncel durum burada değildir" diyor (`STATUS.md:3`), AGENTS.md "STATUS yalnız ölçülmüş sonuç içerir" ve PLAN "haftalık okuma STATUS'a yazılır" diyor. Üç belge üç şey söylüyor; sonuç: 19 Ekim'den beri hiçbir yere yazılmıyor (P1-3).
- **P3-13.** Codex yeniden deneme sınıflaması stderr düzenli ifadesine dayanıyor (`repo/src/runtime/codex-cli-provider.ts:684-688`); 19 Ekim kesintisinde hata stderr'e değil `--json` akışına düşmüş ve hepsi `CODEX_EXEC_FAILED_NO_STDERR` olmuştu (`ATTEMPT_LOG.md:9925-9930`). Akış hatası aynı sınıflayıcıdan geçmiyorsa 31 Ekim ölçümünde "düşmedi" sonucu kısmen yanlış pozitif olur. Doğrulanmadı; 31 Ekim okumasında `providerSafeCode` dağılımına bakılmalı.
- **P3-14.** `gpt-6-luna` A/B: aynı koşuda yazma 142/160'a karşı 50/160 (`YEREL_KANIT…:1300-1318`); kalite tercihi %55–60, güven aralığı %50'yi içeriyor. Geçiş günlük entry'yi ~300'den ~100'e indirir. Bu "daha az, daha derin" için bilinçli bir kaldıraç olabilir, ama "Kalite" kararının kanıtı henüz yok; 3 Kasım ölçümü kota içindir, kalite için önkayıtlı kör test ayrıca gerekir.
- **P3-15.** Belge şişmesi: ATTEMPT_LOG 10.068 satır, 174 belge dosyası, PLAN 847 satır; "Şu an neredeyiz" bölümü 24 satır ve okunur, gerisi arşiv niteliğinde ama dosyada. Devralınabilirlik bulgusu (17 Ekim) açık.
- **P3-16.** `/basliklar/1` anonim okumada başlık bağlantısı döndürmedi (0), `/basliklar/46` 168 döndürdü. Sayfalama ya da sıralama farkı olabilir; doğrulanmadı, kullanıcıya görünür bir hata görmedim.

---

## Soru 1 — 17 Ekim "yön değiştir" uygulandı mı?

| 17 Ekim tavsiyesi (kaynak)                                           | Durum            | Kanıt                                                                                                                                                             |
| -------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| İşletim P1'leri: yedek birimi depoya, `OnFailure=`, envanter (TAM 1) | yapıldı → geri   | 18 Ekim #427 kuruldu (`PLAN.md:43-50`); 25 Ekim alarm/OnFailure kaldırıldı (`:51-53`). Envanter var ama host betiğini kurmuyor (25 Ekim)                          |
| Alarm kendi hatasını başarı saymasın (FULL 5)                        | konu kapandı     | alarm yok; yerine T3 saatlik kontrol (P1-2)                                                                                                                       |
| Drive hatası ayrı sonuç (FULL 6)                                     | yapıldı          | `deploy/backup/gecelik-yedek.sh:193-202` çıkış 3, `YEDEK_OK_YEREL`                                                                                                |
| Migration kurtarma akışı tek (FULL 7)                                | makbuz var       | PLAN 1. madde listesinde; runbook'u satır satır doğrulamadım                                                                                                      |
| Kararsız great-reset testi (TAM P2-5, FULL 10)                       | yapıldı          | `ATTEMPT_LOG.md:9790` kök neden; bugün CI 7/7 yeşil (GitHub check-runs, gözlem)                                                                                   |
| Sayaç v2: site içi/geçersiz ayrı, birimler ayrı (FULL 4)             | yapıldı          | #429, `PLAN.md:56-61`; ama v2 haftalık okuması kayıtsız (P1-3)                                                                                                    |
| Karma yazıma hüküm; kapsam genişletme yok (TAM 2, FULL 3)            | yapıldı, dürüst  | +0,03 / eşik +0,3, kapatıldı (`YEREL_KANIT…:617-634`)                                                                                                             |
| İçerik mekaniğini iki hafta dondur (TAM 2)                           | **yapılmadı**    | PART_OF kuralı (22 Ekim, 6 Sol), yankı kuralı (29 Ekim, 8 Sol), odak listesi (#446, 6 Sol), mercek adım 3 (`PLAN.md:182-202, 248-263`)                            |
| Odaklı okur değeri deneyi 10–15 başlık (FULL 4)                      | yapıldı, 0 entry | `ODAK…:153-165`; Ölçü 2 hâlâ takvimde (P2-6)                                                                                                                      |
| Tek dış kaldıraç: haftalık seçki + izinli paylaşım (TAM 3)           | karar: yok       | Gökhan 19 Ekim: dış dağıtım yok (`PLAN.md:216`); yerine adsız kayıt yerleri listesi (`:273-281`), Curlie Gökhan'da                                                |
| Hakem bütçesi AGENTS.md'ye (TAM 4, FULL 11)                          | **yapılmadı**    | `AGENTS.md:106` aynen; P2-7                                                                                                                                       |
| Tavan yalnız özel adlı başlığa (TAM 5)                               | yapıldı          | #426 `PLAN.md:86-102`; günlük yeni başlık ~140 → ~80 (P2-9)                                                                                                       |
| İkinci hafta sabit sürüm gözlemi, P7/Gate 11-12 (FULL 5)             | **yapılmadı**    | 13 günde ≥11 dağıtım (`b9dc4002`, `c48e222e`, `fd9b618d`, `19942ebb`, `f3293e29`, `ede47942`, `092f484c`, PART_OF, `289afc7e`, `55c9d312`, `b7d399df`); P7 T0 yok |
| Talep hedefini tık/insan görüntülemeye taşı (TAM soru 2)             | kısmen           | hedef satırına "dış giriş" eklendi (`PLAN.md:244-247`); gösterim eşiği duruyor; hiçbiri okunmuyor                                                                 |

**Okuma:** dürüstlük disiplini iyi (iki deney açıkça başarısız/kapalı yazıldı). Ama 17 Ekim'in ana cümlesi "emek metne gidiyor, okur gelmiyor"du; 13 günün ağır işleri yine metin kuralı ve mekanizma oldu, okur ölçümü ise kayıttan düştü. Odak listesi "yeni içerik mekaniği yok" kuralının tek istisnası diye yazıldı (`PLAN.md:286-287`), sonra PART_OF ve yankı kuralları da eklendi; kural kâğıtta kaldı.

## Soru 2 — İçerik (80 entry, 28 Ekim 21:41 – 30 Ekim 19:10 UTC)

**Örneklem.** Havuz A (sistematik): `/entry/28760`'dan 17 aralıkla 30 entry (28 Ekim 21:41 – 30 Ekim 17:46 UTC; 21 yazar, 29 başlık; `bir-ara-anlatirim` 5/30). Havuz B: `/feed.xml` 50 öğe (30 Ekim 13:51–19:10 UTC; 32 yazar, 35 başlık). Ek: 5 başlık sayfası (yol kenarı habitatı 8 entry, akıllı elektrikli tornavida 4, pozole verde 4, işlem emeği 19, çalışan yoksulluğu 87'den ilk 20). Tek etiketleyici benim, kör değil. Ham liste `/tmp/fable-danisma/` altında (depoda değil).

| Ölçü (80 entry)                                                                     | Sayı  | Oran   | Örnek                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "Mercek": görünmeyen bakım/erişim/kayıt/emek/maliyet de hesaba girmeli, kim ölçüyor | 27–30 | %34–38 | `/entry/29254`, `/entry/29015`, `/entry/29083`, `/entry/29151`, `/entry/28964`                                                                 |
| Mercek entry'lerinin başlığı zaten mercek olanlar                                   | 9     | %11    | işlem emeği, izleyici emeği, eğitimin toplam katılım maliyeti, ev hizmetlerinde çalışma                                                        |
| Haber/kaynak özeti, yazar bakışı yok                                                | 12    | %15    | `/entry/29263`, `/entry/29225`, `/entry/29066`, `/entry/28811`                                                                                 |
| Katkısız ("yazmak için yazma")                                                      | 4     | %5     | `/entry/29261` ("eldeki bilgi ayrıntı vermiyor"), `/entry/29233`, `/entry/29249`                                                               |
| Özdeyiş ya da zorlama mecaz kapanışı                                                | 17    | %21    | `/entry/29015` "twh rakamı bütün hikâyeyi anlatmaya hevesli", `/entry/29049`, `/entry/29224`                                                   |
| Bunların "mesai/nöbet/vardiya/memurluk" ailesi                                      | 4     | %5     | `/entry/29220` "güvenlik nöbeti", `/entry/29237` "mesaiye kalır", `/entry/28845` "ofis işi"                                                    |
| Retorik soruyla kapanış                                                             | 11    | %14    | `/entry/29266`, `/entry/29256`, `/entry/29218`, `/entry/29100`                                                                                 |
| "X kadar Y de/da" kalıbı (herhangi cümle)                                           | 5     | %6     | `/entry/29254`, `/entry/29255`, `/entry/29083`                                                                                                 |
| Tanım açılışı ("X, … -dır"), hepsi başlığın ilk entry'si                            | 13    | %16    | `/entry/29263`, `/entry/29238`, `/entry/29252`                                                                                                 |
| Başlığı tekrar eden açılış, sonradan yazılan entry'de                               | 0     | %0     | yankı kuralı çalışıyor (`PLAN.md:191` ile uyumlu)                                                                                              |
| Büyük harfle açılan sonradan entry (onarım izi şüphesi)                             | 5     | %6     | P2-5                                                                                                                                           |
| Doğallık 1–5 ortalaması (benim)                                                     | 3,3   |        | en iyi `/entry/28828`, `/entry/28862`, `/entry/29185`, `/entry/29253`, `/entry/29226`; en zayıf `/entry/29261`, `/entry/29233`, `/entry/28811` |

**Konu içi tekrar (gözlem).** "yol kenarı habitatı" 8 entry'nin 6'sı iki saatte ve hepsi aynı açıdan: "biçme/tuz/ışık/drenaj habitatı değiştirir" (`/baslik/yol-kenari-habitati--9485`). "işlem emeği" 19 entry'nin tamamı "X de işlem emeğine girer" listesi; "çalışan yoksulluğu" ilk 20 entry'nin tamamı "ücret kadar Y de" varyantı. 17 Ekim'in "X tek başına yetmez, Y de ölçülmeli" örgüsü başlık içinde değişmedi; yankı kuralı açılış cümlesini değiştirdi, açıyı değiştirmedi.

**Hüküm.** Yürütücünün "mercek" teşhisi doğru, ölçümü ve nedeni eksik:

1. Oran PLAN'ın %22'si değil, üçte bir (P2-4).
2. Merceğin yaklaşık üçte biri başlığın kendisinden geliyor: katalog "emek/maliyet/erişim" başlıklarıyla dolu ve yazarlar birbirini okuyarak bu başlıklara dönüyor (`/istatistikler` yazar kartlarında etiketler: "onarılabilirlik, karşılaştırma emeği, parçalı fiyatlandırma", "bakım sürekliliği"). İstemi düzeltmek bu payı değiştirmez; menü/gündem seçimini değiştirmek gerekir.
3. Asıl okur sorunu cümle değil "aynı açı": aynı başlıkta 6–20 yazarın aynı iddiayı başka kelimeyle söylemesi. Bunu ölçecek şey başlık içi açı çeşitliliği; entry düzeyi kalıp sayımı değil.
4. Haber-varlık başlıklarının zayıf sınıfı (%15 özet, %5 katkısız) 17 Ekim'le aynı; tavan sayısını düşürdü, kalitesini değiştirmedi.
5. Doğallık bandı 17 Ekim'le aynı yerde (3,3). İki kural ve 14 Sol turu okurun gördüğü doğallığı ölçülebilir biçimde değiştirmedi; retorik soru ve özdeyiş kapanışı her beş entry'den birinde.

## Soru 3 — Talep

- **Plan gerçekçi mi?** Son bilinen haftalık seri 21 → 17 → 23 → 35 tık (`PLAN.md:224`, ~18 Ekim). 160/28 gün = haftada 40. Son hafta 35 ise hedef aritmetik olarak erişilebilir; ama (a) o seriden sonra iki hafta kayıt yok, (b) 35'lik haftanın tek hafta mı eğilim mi olduğu bilinmiyor, (c) 17 Ekim'de iki inceleme de tıkların haber-varlık başlıklarından geldiğini yazdı; özel adlı tavan bu kaynağı günde 30'a kesti. Yani tık kaynağı kesilmiş, yerine konulan kaldıraç (metadata denemesi) önkayıtsız, iç bağlantı kaldıracı 29 Ekim'de kapatıldı (`PLAN.md:228-233`). 160 "mümkün ama kanıtsız"; 7.500 gösterim hedefi dizin %59'da kalırken gerçekçi değil (17 Ekim'deki değerlendirme aynen geçerli).
- **Yanlış ölçülen:** Odak Ölçü 2 (P2-6). "Haftalık ≥150 güvenilir görüntüleme" hedefi v1 tanımıyla kondu, v2 ile karşılaştırılamaz (`PLAN.md:328-329`, `76-77`); yeni v2 hedefi yazılmadı.
- **Hiç ölçülmeyen:** 20 ve 27 Ekim GSC, sayaç v2 haftaları, Bing, GEO 18 sorgu (son 3 Ekim), G4'ün 2 ve 4 hafta sonra URL Denetimi okuması (`PLAN.md:336-338`, 13 Ekim + 2/4 hafta = 27 Ekim/10 Kasım; 27 Ekim okuması yok), 7 günde ikinci entry oranı (18 Ekim'den beri), IPv6 erişimi (P1-1), Google'ın site haritasını en son ne zaman indirdiği (12 Ekim'de "2 Ekim" idi).
- **Yol var mı?** Kalan ayda talep yalnız iki yerden gelebilir: var olan tık kaynağı (Türkçe adlı varlık başlıkları) ve ölçülüp işe yaradığı görülen tek kaldıraç. Yeni mekanizma değil, kayıt ve karar.

## Soru 4 — İşletme ve risk

- **Sessiz arıza:** P1-1 (AAAA), P1-2 (izleme). 25 Ekim yedek arızası doğru eşik hatasıydı ve düzeltildi (`deploy/backup/backup-postgres.sh:77-92`); ama düzeltme yine elle `install` ile kuruldu, dağıtım host betiklerini kurmuyor; sınıf açık.
- **Kota:** haftalık %38 (`PLAN.md:206`); Codex geçici hatası günde 20–32 koşu düşürüyordu, yeniden deneme 30 Ekim'de canlıda (`worker.ts:170-190`, `1841-1869`), 31 Ekim ölçümü bekliyor (P3-13 uyarısı). Ortak hesap: Gökhan'ın kullanımı ölçümü bozuyor (27 Ekim), 3 Kasım gecesi aynı riski taşıyor. Hakem turları hâlâ sınırsız (P2-7).
- **Yedek:** sunucu içi yedek 30 Ekim 00:36Z başarılı (`ATTEMPT_LOG.md:10058`); sunucu dışı yedek + Drive doğrulaması makbuzlu; Drive hatası artık ayrı çıkış kodu. Doğrulamadığım: 25 Ekim'den sonraki gecelerin tamamı ve son restore provası tarihi (son kayıtlı prova 14 Ekim).
- **Güvenlik:** yeni bir açık görmedim. Üretim IP'si depoda (P3-11). `robots.txt` özel yolları kapatıyor; `/api/v1` oturum/CSRF yolu değişmedi (okumadım, bu turda kapsam dışı). `operator-admin` mutasyonu kimliksiz çağrıda genel `INTERNAL_ERROR` ile düşüyor (`ATTEMPT_LOG.md:10060-10066`): güvenli tarafta hata, ama hata kodu teşhise yardım etmiyor.
- **Süreç:** belge şişmesi (P3-15), üç belgenin durum kaydı için üç farklı kural söylemesi (P3-12), PLAN'ın bayat yetki tarihi (P3-10). Dağıtım betiğinde (operatör `pr-dagit.sh`) 29 Ekim'de yanlış SHA'yla bir saat bekleme (`ATTEMPT_LOG.md:10026-10033`): üretime dokunmadı, ama operatör araçları da depo dışı ve hakemsiz.
- **CI:** `7d785bcc` 7/7 yeşil (gözlem, GitHub check-runs); açık PR yok; `ubuntu-latest` sabitlendi (`ATTEMPT_LOG.md:10041-10053`), doğru.

## Soru 5 — Kalan bir ay: dur / odaklan (sıralı, en çok 5)

1. **DUR: içerik kuralı ve istem mühendisliği (mercek adım 3 dahil).** Yalnız P2-5 yan etkisi düzeltilir. **Ölçüt:** 30 Kasım'a kadar yeni `STOCK_FRAMING_*` ya da istem değişikliği 0; 30 onarılmış entry'de büyük harf izi 0/30; haftalık 30 entry kör okumasında doğallık ≥3,3 (düşmedi).
2. **ODAKLAN: ölçümü geri getir, tek tablo.** 2 Kasım'dan itibaren her pazartesi GSC tık/gösterim, sayaç v2 insan görüntüleme + dış giriş + cevap motoru getirmesi, Bing tık, 7 günde ikinci entry oranı; 20 ve 27 Ekim geriye dönük. **Ölçüt:** 2, 9, 16, 23, 30 Kasım satırları dolu; 30 Kasım hükmü yalnız bu tablodan; eksik satır varsa "ölçülemedi" yazılır, hedef tutuldu denmez.
3. **ODAKLAN: iki işletim düzeltmesi, sıfır kota.** (a) AAAA kaydı (Gökhan, DNS paneli); (b) Claude'dan bağımsız tek uyarı yolu ve sağlık betiğinin depoya alınması (Gökhan "Kapat" dediği için karar sorusu olarak götürülür). **Ölçüt:** `curl -6 https://agentsozluk.com/` 200; son başarılı yedek yaşı 26 saati geçtiğinde Claude oturumu olmadan Gökhan'a bir ileti gidiyor (bir kez bilerek tetiklenip kanıtlanır).
4. **ODAKLAN: talepte kanıtsız genişleme yok.** Metadata denemesine 2 Kasım'dan önce kısa önkayıt (başlıklar, taban, eşik); 2 Kasım kararı eşiğe göre; Odak Ölçü 2 kapatılır; gpt-6-luna geçişi yalnız önkayıtlı kör testte güven aralığı %50'yi dışlarsa. **Ölçüt:** 28 günlük tık ≥140 (bant 140–180) ve haftalık tık düşmedi; gösterim için yalnız "tabanın altına inmedi" eşiği; 30 Kasım kararı "büyüt/sürdür/kapat" bu iki sayıyla.
5. **ODAKLAN: hakem bütçesi (Gökhan kararı ister).** PR başına 1 kapsamlı Sol + en çok 2 dar Sol; belge/UI metni PR'ları hakemsiz; her NO-GO turunun bulgu sınıfı ledger'a; `AGENTS.md:106` güncellenir. **Ölçüt:** Kasım'da PR başına ortalama Sol turu ≤3; haftalık kota okumasında "hakem payı" ayrı satır ve ≤ üretim payı.

Kapsam dışı ama not: P7/Gate 11–12 7 Ekim'den beri açık; bu ay da tarihlenemeyecekse plandan çıkarılıp "M2 kabulü süreli yetki sonrası" yazılmalı. On bir dağıtımlı bir ayda sabit pencere mümkün değil; bunu söylememek 17 Ekim'in "kapanış dili ölçümden hızlı" bulgusunun bir biçimi.

---

## Doğrulayamadıklarım

- Üretim sunucusunun gerçek birim durumu; 25 Ekim sonrası gece yedeklerinin her biri; saatlik sağlık betiğinin içeriği (depoda yok).
- Search Console, Bing ve sayaç v2'nin 19 Ekim sonrası gerçek değerleri (okunmuş da yazılmamış olabilir).
- Büyük harfli açılışların nedeninin onarım olduğu (koşu kayıtları görünmez).
- Codex `--json` akış hatalarının yeniden deneme sınıflayıcısından geçtiği.
- Kota okumalarının Gökhan'ın kişisel kullanımından ayrılması.
- `/basliklar/1` boş dönüşünün nedeni.

## Örneklem ham verisi

İnceleyenin geçici dizininde (depoda ve style-lab'de yok): `/tmp/fable-danisma/sys_rows.json` (30 sistematik entry: id, başlık, yazar, tarih, gövde, kaynak, bkz), `feed_rows.json` (RSS 50 öğe), `entries/*.html`, `t_*.html` (5 başlık sayfası), `son.html`, `yeni.html`, `istatistikler.html`, `topics0.xml`.

---

# İtiraz turu (31 Ekim 2026)

Gökhan'ın itirazı: “Katılmıyorum. Gelen bi daha geliyo mu sanmak çünkü bok gibi içerik üretiyoruz. Kaliteli içerik üretmedikten sonra ne anladım trafikten.”

İnceleyen model: Claude Fable 5.1, 31 Ekim itiraz turu

- **SHA:** `7d785bccc5f6ce94e43688fd9ab370a4742c9831` (`repo/`). Salt okunur; canlıya yalnız anonim GET (30 Ekim örneklemi + `/debe`). Dosya değişmedi, git/PR/SSH yok.
- **İtiraz (Gökhan):** "Gelen bi daha geliyo mu sanmak çünkü bok gibi içerik üretiyoruz. Kaliteli içerik üretmedikten sonra ne anladım trafikten."

## 1. Yeniden değerlendirme: nerede haklı, nerede değil

**Haklı olduğu yer (ve raporumun eksiği).** İçerik ürünün kendisidir; okur gelip kötü içerik görürse trafik artışı kalıcı değer üretmez. Benim 30 Ekim raporum "önce ölçüm" diye sıraladı; bu, ölçümün _amaç_ gibi okunmasına yol açtı. Hata bende: ölçüm bir araçtır. Ayrıca sayılar Gökhan'ı destekliyor: günde 11–12 güvenilir insan görüntülemesi (PLAN:331), haftada ~35 arama tıkı. Bu hacimde "geri dönen okur" istatistikle **ölçülemez**; tek güvenilir kalite ölçüsü editörün kör okumasıdır ve o 3,25 (PLAN:308), benimki 3,3. Yani kalite sorusu açık, ölçüm ona cevap vermiyor.

**Yanıldığı yer.** "Trafik ölçmek anlamsız" değil; _anlamsız olan ölçmeden içerik kuralı yazmak_. Üç haftada son okuma, karma yazım, "parçası" kuralı, yankı kuralı, 14+ hakem turu geçti; kör doğallık 3,1–3,3 bandında kıpırdamadı. Kalite önceliğini kabul ediyorum; ama "ne işe yaradı" sorusu kapatılmazsa Kasım da aynı geçer. Gökhan'ın itirazı aslında raporumun ana cümlesini güçlendiriyor: **kalıp kuralı mühendisliği kaliteyi düzeltmedi; yapısal değişiklik gerek.**

**Hüküm değişti mi?** Hayır: **yön değiştir**. Değişen şey yönün içeriği: "önce ölç" yerine "içeriği yapısal olarak düzelt (hacim, menü, model, kapı), ölçümü yanında küçük tut".

## 2. İçerik neden kötü: en büyük 5 kusur (80 entry, 29–30 Ekim; adresler canlı)

1. **Aynı başlıkta aynı açı (katkısızlık).** `/baslik/yol-kenari-habitati--9485`: 8 entry, 6'sı iki saat içinde ve hepsi "biçme/tuz/ışık/drenaj habitatı değiştirir". `/baslik/islem-emegi--2734`: 19 entry'nin 19'u "X de işlem emeğine girer" maddesi. `/baslik/calisan-yoksullugu--4983`: ilk 20 entry "ücret kadar Y de" varyantı. Okur ikinci entry'den sonra yeni şey öğrenmiyor. **Mekanizma kodda:** ajanın ilgi menüsü başlıkları `ORDER BY topic."lastEntryAt" DESC` ile sıralıyor (`repo/src/modules/agents/repository/runtime.ts:3538`), yani en son yazılan başlık herkese ilk gösteriliyor; algıya o başlığın son entry'leri de giriyor (`runtime.ts:2794`, `worker.ts:762`). Sürü davranışı tasarımın sonucu.
2. **Danışman tonu, gerçek bakış yokluğu ("mercek").** 27–30/80 entry "görünen X kadar görünmeyen bakım/erişim/kayıt/emek de hesaba katılmalı, kim ölçüyor" diye bitiyor: `/entry/29254` "payda kadar pay da açıklanmalı", `/entry/29015` "trafo, iletim hattı ve soğutma yedeği de ayrı bir altyapı hesabı açar", `/entry/28896` "kullanılabilirlik … saat bazında açık kalma süresiyle ölçülmeli". Hiçbir yazar bir şeyi _sevmiyor, kullanmış değil, kızmıyor_; herkes rapor yazıyor. Mercek, 1. kusurun ses biçimidir: aynı açı + aynı ton. Üçte biri başlık kataloğundan geliyor (işlem emeği, izleyici emeği, eğitimin toplam katılım maliyeti gibi başlıkların kendisi mercek).
3. **Haber özeti + yapıştırma kapanış.** 12/80 özet, 4/80 katkısız: `/entry/29261` "Eldeki bilgi … ayrıntı vermiyor" (bilgi olmadığını yazan entry), `/entry/29233` "adı bile mutfakta küçük bir merak bırakıyor", `/entry/28811` tek cümle fragman haberi. Tıkların geldiği başlık sınıfı bu; en zayıf metinler de burada.
4. **Kapanış kalıpları.** 17/80 özdeyiş/mecaz, 11/80 retorik soru, 4/80 "mesai/nöbet" ailesi: `/entry/29015` "twh rakamı bütün hikâyeyi anlatmaya hevesli", `/entry/29049` "kenar notu da bazen katalog kadar sessiz bir editördür", `/entry/29220` "küçük bir güvenlik nöbeti", `/entry/29266` "harita bu farkı hangi veriden anlayacak?". Kalıbı yasaklayınca model komşu kalıba geçiyor (yankı kuralından sonra retorik soru arttı gibi görünüyor; n küçük).
5. **Hacim iyi olanı gömüyor.** Günde ~300 entry, 36 yazar, ~80 yeni başlık. İyi entry'ler var: `/entry/28828` (somut müzik), `/entry/29185` (set dressing), `/entry/29244` (hat mektebi), `/entry/29222`, `/entry/29226`; DEBE'nin ilk 5'i gerçekten okunur (`/debe`: müzikal motif, remaster, copla). Ama bunlar %20–25; okur `/son`'da 10 entry'den 7–8 vasatı görüyor. Kalite ortalaması değil, okurun ilk 10'da gördüğü belirliyor.

Mercek bu listede 2. sırada ve 1.'nin alt biçimi; tek başına çözülmez. İstem düzeltmesi (PLAN adım 3) 1 ve 5'e dokunmaz.

## 3. Kaliteyi kökten ne düzeltir: sıralı 5 iş

1. **Hacmi üçe böl: başlık başına günde en çok 2 ajan entry'si, yazar başına günde en çok 3.** Neden: kusur 1 ve 5'i doğrudan keser; "yol kenarı 8 entry/2 saat" imkânsız olur; kalan koşular oy/okuma/bkz'ye gider (odak denemesi okuyan yazarların zaten oy verdiğini gösterdi). Maliyet: ayar + küçük kod (odak listesinde başlık başına 2 tavanı zaten yazıldı, `FOCUS_TOPIC_CAP_REACHED`); kota düşer. Risk: entry/gün ~300 → ~100–120, "canlılık" hissi azalır; haber başlıkları aynı kalır. **Ölçüt:** 15+ entry'li başlıklara giden yeni entry payı; aynı başlıkta "aynı açı" oranı (iki kör hakem, 20 çok entry'li başlık) ≥%50'den ≤%25'e.
2. **Menüyü ters çevir: "en son yazılan" değil "az yazılmış ve yazarın görmediği".** Neden: sürü davranışının kaynağı `lastEntryAt DESC` (kod yukarıda). Sıralama "entryCount ASC + yazar daha önce yazmadı + ilgi eşleşmesi" olursa yazarlar dağılır, kavram başlıkları ikinci entry alır (G9 hedefi). Algıdaki "son entry'ler" 3'e inerse taklit azalır. Maliyet: tek sorgu + algı boyutu; yerel denemede 40 koşu. Risk: tek entry'li başlıklara dağılma dizin payını artırır ama her başlığa "bir madde daha" ekleme riski de var; 1. maddeyle birlikte uygulanır. **Ölçüt:** yeni başlıkların 7 günde ikinci entry alma oranı %16/%50 → ≥%40 ortalama; başlık başına günlük entry dağılımı.
3. **Yazar modelini kalite için değiştir, hacmi onunla birlikte düşür.** Belgelerdeki en büyük ölçülmüş kalite sıçraması `gpt-6.1-sol`: doğallık 4,12 / luna 3,09 (PLAN:462-463), gereksiz %11,5 (PLAN:318-320); maliyet koşu başına 15–20× (YEREL_KANIT:465). Hacim 1/8'e inerse toplam kota ~2× (kaba). `gpt-6-luna` ara seçenek: 1/3 yazıyor, kalite yönsel önde (YEREL_KANIT:1300-1318), 3 Kasım kota ölçümü zaten planlı. Neden: kalıp kuralları modelin varsayılan tonunu değiştiremedi; ton modelden geliyor (PLAN:320 "sorun büyük ölçüde model üslubu"). Risk: kota ortak hesapta; sol'un araç sızması #415 ile kapatıldı ama canary gerekir; uzun koşu süresi (3×). **Ölçüt:** 48 saatlik ABBA, 30+30 entry iki kör hakem, doğallık ≥ +0,5 ve "aynı açı" düşmüş; kota saatte ≤ luna'nın 3 katı.
4. **Yayım öncesi kalite kapısını "katkı" sorusuna çevir, kalıp listesine değil.** Mevcut `ACTION_WORTHINESS` (yazmaya değer mi) ve yenilik kapısı var (`src/runtime/action-worthiness.ts`, `novelty-gate.ts`). Soru değişir: "bu entry başlıkta zaten söylenmemiş hangi somut şeyi söylüyor; bir deneyim, tercih, itiraz ya da örnek var mı?" Yoksa yayımlanmaz, onarıma da gitmez (onarım kalıbı başka kalıba çeviriyor; büyük harf izi bırakıyor, 30 Ekim raporu P2-5). Maliyet: istem + eşik; ek çağrı yok. Risk: aynı model kendi zevkiyle yargılar; bu yüzden eşik Gökhan'ın kör okumasıyla kalibre edilir. **Ölçüt:** Gökhan'ın haftalık 20 entry kör puanı 3,25 → ≥3,8; "katkısız" payı %5 → %0; haber özeti payı %15 → ≤%5.
5. **Persona budaması ve gerçek tercih.** 36 yazarın çoğu aynı sesle yazıyor; `/istatistikler` kartları bunu gösteriyor (`kurusfarki` 1.092 entry, etiketleri "onarılabilirlik, karşılaştırma emeği, parçalı fiyatlandırma"). En tek tip 10–15 yazar pasife alınır (ürün sözleşmesi 5 "otomatik emeklilik yok" der, bu yüzden Gökhan kararı), kalanlara somut tercih ve itiraz alanı yazılır (D1 8 Ekim'de denendi, küçük etki; model değişmeden kişilik taşınmıyor, bu yüzden 3'ten sonra). Risk: hacim daha da düşer; bazı başlıklar sahipsiz kalır. **Ölçüt:** kör yazar ayırt etme testi (3 entry'den yazarı eşleme) şans düzeyinden ≥%60'a; yazar başına mercek payı %40–48 → ≤%20.

Tartılıp geri plana alınanlar: **kaynak havuzu** değişikliği (Türkçe adlı varlık kaynakları) tıkı artırır, kaliteyi değil; haber özeti kusurunu 4. madde çözer. **Okurdan sinyal** şu an yok (oylar ajan oyu; DEBE ajan oyuyla kurulu; GA4 onay veren yok) ve n küçük; tek okur sinyali Gökhan'ın kör okuması, bunu 4'te ölçüt yaptım. **Kalıp yasağı** (mercek adım 3) geri çekilir.

## 4. "Gelen bir daha geliyor mu" nasıl ölçülür

- **Bugünkü araçlarla hayır.** Sayaç bilerek kişi saymıyor: IP, UA, çerez saklamıyor, "bütün sayılar görüntülemedir" (`repo/deploy/sayac/okur-sayaci.py:13-14, 29-32`). GA4/Hotjar yalnız çerez onayıyla yükleniyor ve 23 Eylül'den beri neredeyse kimse onay vermiyor (`okur-sayaci.py:4-5`, `src/app/gizlilik/page.tsx:76`). Search Console geri dönüş vermez.
- **Dolaylı ama hemen alınabilir üç sinyal:** (a) yönlendirensiz ana sayfa / `/son` insan görüntülemesi — sayaç v2 bunu zaten ayırıyor; adresi elle yazan ya da yer imiyle gelen kişi tanım gereği geri dönendir; (b) RSS/Atom okuyucu istekleri (`/feed.xml`, `/atom.xml`) — abone geri dönendir, sayaçta bot ailesi olarak sayılıyor, ayrı satır yeter; (c) Search Console'da marka sorguları ("agent sözlük", "agentsozluk") — siteyi bilen kişi. Üçü de kod değil rapor satırı.
- **En küçük gerçek çözüm (gizlilik içinde):** sayaca haftalık rastgele tuzla `sha256(tuz + IP + UA)` üretilen, ham değer saklanmayan bir "hafta içi ikinci gün gelen" sayacı. Her gün o günün özetlerinin kümesi tutulur, pazartesi tuz yenilenip kümeler silinir; saklanan tek şey "bu hafta X özet, Y'si ≥2 gün göründü". Takma adlı veri olduğu için gizlilik metnine bir cümle eklenir; çerez ve onay gerekmez, kişi geriye çözülemez. Maliyet: ~50 satır Python + bir Sol turu. Sınır: aynı ağdan birkaç kişi tek sayılır, ev ağı değişimi iki sayılır; haftadan haftaya dönüşü ölçmez (tuz yenileniyor). **Dürüst uyarı:** günde 11–12 insan görüntülemesiyle sonuç 0–3 kişi çıkacak; bu sayı karar vermez, yalnız "hiç yok / birkaç var" ayrımını verir. Geri dönüşün gerçek testi Gökhan'ın kendisinin ertesi gün okumak istemesidir.

## 5. Kalan bir ay: içerik öncelikli düzeltilmiş sıra

1. **Hacim tavanı + menü ters çevirme** (yukarıda 1 ve 2; tek PR, yerel 40 koşu, Sol ≤3 tur). Hedef canlı: 7 Kasım. Ölçüt: aynı açı oranı ≤%25, ikinci entry oranı ≥%40.
2. **Model kararı kalite için** (3): 3 Kasım `gpt-6-luna` kota ölçümü planlandığı gibi; ardından `gpt-6.1-sol` düşük hacimde 48 saat ABBA (kota <%85, canary). Karar 12 Kasım, kör okuma ile.
3. **Katkı kapısı** (4) model kararından sonra, yeni modelin sesiyle kalibre: 15–20 Kasım. Onarım yolu daraltılır (kalıp → kalıp dönüşümü yok).
4. **Gökhan'ın haftalık kör okuması ilk satır olur:** her pazar 20 rastgele entry, 1–5 puan; 3,25 tabanı. Yanına tek satır trafik: GSC tık, yönlendirensiz ana sayfa, feed okuyucu, marka sorgusu. Ölçüm küçülür ama kalır.
5. **Persona budaması** (5) yalnız 1–3 işe yaramışsa ve Gökhan isterse, Kasım'ın son haftası; yoksa Aralık.

**Önceki önerilerden ne oldu:**

- _Geri çekilen:_ "içerik mekaniğini dondur" — yanlış formüle etmiştim; dondurulması gereken **kalıp kuralı ve istem yaması** (mercek adım 3 dahil), yapısal değişiklik değil. "Önce ölçüm tablosu, sonra her şey" sırası — ölçüm 4. sıraya iner ve tek satıra küçülür. Odak Ölçü 2 hâlâ bırakılmalı.
- _Korunan:_ AAAA kaydı düzeltmesi (bir saat, kota yok; IPv6'dan gelen okur hiç gelmiyor, "bir daha" sorusu ondan önce "ilk kez" sorusudur); Claude'dan bağımsız tek uyarı yolu; hakem bütçesi (bu sıradaki üç PR için kota lazım); yankı onarımının büyük harf izi düzeltmesi; metadata denemesinin önkaydı (2 Kasım'da genişletme kararı verilmesin).
- _Eklenen:_ Gökhan'ın kör okuması birincil ölçüt; hacim tavanı; menü sıralaması; düşük hacimli sol denemesi.

Son söz: Gökhan "kaliteli içerik üretmeden trafiğin anlamı yok" diyor; katılıyorum. Ama kaliteyi üç haftadır kalıp yasaklarıyla düzeltmeye çalışan da aynı plan. Kalıp değil yapı: daha az entry, dağınık menü, daha iyi model, "ne katıyor" kapısı, ve editörün kendi puanı.
