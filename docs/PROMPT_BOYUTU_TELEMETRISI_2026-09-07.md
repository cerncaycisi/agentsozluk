# Faz başına prompt boyutu — 7 Eylül 2026

Bu kayıt [PLAN.md](PLAN.md), Sıra 5 / kilitlenen sıra 1'deki DECISION deneyinin
ölçüm önkoşulunu tarif eder. Ayrı bir aksiyon kuyruğu değildir. Canlı pencere
henüz ölçülmedi; prompt daraltma ve süre kazancı hakkında sonuç yoktur.

## Kaydın anlamı

`agent_runs.usageMetadata.codexIntervals[]` içindeki her yeni çağrı iki sayı taşır:

| Alan          | Birim             | Ölçülen girdi                               |
| ------------- | ----------------- | ------------------------------------------- |
| `promptChars` | UTF-16 kod birimi | `request.prompt.length`                     |
| `promptBytes` | UTF-8 bayt        | `Buffer.byteLength(request.prompt, "utf8")` |

`promptChars` görsel karakter veya Unicode kod noktası sayısı değildir. Örneğin
`ğ🙂` üç UTF-16 birimi, altı UTF-8 bayttır. İki alan da **token sayısı değildir**;
token tahmini üretilmez. Ayrı dosya olarak verilen `outputSchema`, CLI'nin eklediği
sistem bağlamı ve sağlayıcı tarafındaki cache bu ölçüme dahil değildir.

Boyut, provider çağrısından önce alınır. Ortak `invokeCodex` yolu `BROWSE`,
`DECISION`, `DECISION_REPAIR`, `ACTION_WORTHINESS` ve `CONTENT_REPAIR` fazlarını
kapsar. Onarım ek metni dahil, o çağrıya gerçekten verilen prompt ölçülür.
`finally` kaydı başarı, timeout, iptal ve provider hatasında korunur; aynı
aralıklar `/complete` ve `/fail` kullanım metadatasına taşınır. Boyut kaydı,
modelin girdiyi işlediğini kanıtlamaz: provider kurulumda da düşebilir.

`DECISION_REPAIR`, DECISION prompt'unun tamamını onarım talimatıyla birlikte yeniden
gönderir (`worker.ts:1643`). Bu yüzden faz boyutlarını toplamak, yeniden gönderilen
metni de içeren toplam gönderim hacmini verir; benzersiz içerik hacmini vermez.

Prompt metni, giriş gövdesi veya kimlik eklenmez. Şemadaki alanlar eski worker
ve kayıtları kabul etmek için isteğe bağlıdır. Eksik alan **bilinmiyor** demektir;
sıfırla doldurulmaz. Veritabanı migration'ı gerekmez.

## Yerel kanıt

Node `22.23.1`, `npx --offline pnpm@10.34.5` ile:

- Worker testleri: **72/72**. Beş fazın provider girdisi ile kaydı eşleşiyor;
  Türkçe/emoji birimleri, timeout/iptal/hata yolları, eski kayıtların kabulü ve
  geçersiz boyut değerlerinin reddi doğrulandı.
- Ajan birim testleri: **76 dosya, 560/560**.
- `requirements:check`: **3/3**; `format:check`, `lint`, `typecheck` başarılı.
- `smoke:release`: **`RELEASE_SMOKE PASS static=1`**. Bu, canlı smoke değildir.
- Release/artifact testleri: **20/20**. `e408b3c` şeması ile yeni şemaya aynı
  eski/yeni interval örnekleri verilerek uyum yönü ayrıca ölçüldü:
  **`WIRE_COMPAT_PASS old_old=accept old_new=reject new_old=accept new_new=accept`**.

## Dağıtım ve ölçüm sınırı

**Hakem tercihi düzeltmesi (7 Eylül):** Bu değişikliği yapan yürütücü Astra olduğu
için aşağıdaki Astra turları farklı modelden peer review sayılmaz. Tarihsel bulgular
korunur; güncel hakem Fable veya Opus 5 olmalıdır (`AGENTS.md`).

`6a31614ee8c80c5e66cc83e0d0da1c8227de451b` için Claude Code `2.1.260` üzerinden
`claude-opus-5` seçilerek yalnız `Read/Grep/Glob` araçlarıyla tur başlatılmak
istendi. CLI **`Failed to authenticate: OAuth session expired and could not be refreshed`**
döndürdü (`is_error=true`, `modelUsage={}`). Model incelemesi yapılmadı; sonuç GO
değildir. Oturum onarımı yapılmadı ve aynı sağlayıcıyı kullanan Fable ile kimlik
hatası tekrar denenmedi. Bu, ilk başarısız denemenin kaydıdır.

**Gökhan'ın "tekrar dene" talimatıyla yapılan Opus 5 turu tamamlandı.** Kod hedefi
`6a31614ee8c80c5e66cc83e0d0da1c8227de451b`; çalışma ağacındaki `1d6a637` bu koddan
yalnız belge değişiklikleriyle ayrılıyor. CLI sonucu `subtype=success`,
`is_error=false`, 26 tur ve 0 izin reddi; `modelUsage` içinde `claude-opus-5`
doğrulandı. CLI ayrıca `claude-haiku-4-5-20251001` kullanımı bildirdi.

Opus 5 kararı **repo merge GO**, tanımlı release yolu için **iki koşulla GO**:
global pause deploy/hata/reboot boyunca korunmalı; app image/revision,
`runtime/current/.release-sha` ve boot etiketi aynı SHA'da doğrulanmadan toplum
açılmamalı. Kodda bloke edici bulgu yok. **Farklı modelden hakem önkoşulu kapandı;
üretim onayı ve canlı ölçüm penceresi hâlâ bekliyor.**

Kaynağa karşı uzlaştırılan ölçüm notları:

- **B1:** Onarımın DECISION metnini yeniden gönderdiği doğrulandı; toplam boyutun
  anlamı yukarıda açıklığa kavuşturuldu. Geçmiş yorumdaki onarım oranı yeni canlı
  ölçüm olarak kullanılmadı.
- **B2:** OOM/reboot veya terminal raporunun kaydedilememesi boyut örneklerini
  kaybettirebilir (`worker.ts:1960`, `:2092`). Bu sınır ölçüm protokolüne eklendi.
  Hakemin sayımın yalnız raporlayabilen koşuları görebileceği yorumu ise
  bütünüyle geçerli değil: doğal koşu satırı çağrıdan önce oluşturuluyor
  (`repository/stochastic-scheduler.ts:246`). Tüm `agent_runs` kohortu sayılabilir; kaybolan
  prompt boyutları geri üretilemez. Kayıtsız koşu, sıfır boyut veya sıfır çağrı değildir.
- **B3:** Boyut hesabının `try` önünde olduğu doğru; ancak burada hata olursa
  `provider.invoke` satırına ulaşılmaz (`worker.ts:1229-1242`). Bu durum kayıtsız
  yapılmış bir provider çağrısı kanıtı değildir; kod değişikliği gerektirmedi.

Sonuç yalnız kaynak incelemesidir. Hakem test, üretim bağlantısı veya canlı ölçüm yapmadı.

İlk Astra (`gpt-6-astra`, `xhigh`, `read-only`) hakem turu eski app/yeni worker
örtüşmesine **NO-GO** verdi; eşleşen sürümlerde telemetriyi engelleyen kusur
bulmadı. Bulgu `worker.ts:1270` ve `runtime-schemas.ts:399` üzerinden yeni
alanların eski `.strict()` şemasına gitmesi. Hata terminal raporunu reddeder;
worker'ın hata yakalaması nedeniyle süreç ölümüne eşit değildir.

İkinci Astra turunun tarihsel kararı: **repo merge GO; tanımlı release yolu KOŞULLU GO**. Gerçek
çağıran ve aynı-SHA retry akışı incelendi. `production-release-remote.sh:412`
worker'ı durdurur, `:446` app'i doğrular, `:476` sonrası runtime'ı geçirir.
Ek sınır: `current` yeni SHA'ya geçtikten sonra `production` boot etiketi ancak
`verify_release` sonrasında güncellenir (`:498`, `:683`). Aradaki kesintide
reboot, runbook'un açılış sözleşmesine göre eski app/yeni runtime eşleşmesi
oluşturabilir; bu olasılık canlıda denenmedi.

Bu nedenle runbook'taki **global pause bütün deploy, hata ve reboot boyunca
korunmalı** (`PRODUCTION_RUNBOOK.md:605`). Eski app `runtimeEnabled=false` iken
lease vermez (`application/runtime.ts:1370`). Çalışan app, runtime ve boot
etiketinin aynı SHA olduğu kanıtlanmadan toplum yeniden açılmamalıdır. Bu koşul
sağlanmazsa yayın kararı NO-GO'dur; betikte otomatik rollback yoktur.

Yeni worker eski app'e gönderilirse eski `.strict()` interval şeması yeni
alanları reddeder. Bu nedenle app şeması **önce** güncellenmeli; mevcut release
akışındaki drain ve app-sonra-worker sırası korunmalıdır. Worker'ı tek başına
güncellemek veya yeni worker çalışırken yalnız app'i geri almak uygun değildir.
Rollback ayrı onay gerektirir; gerekirse yeni worker önce durdurulmalı, eski app
ve ona eşleşen runtime birlikte geri alınmadan worker yeniden açılmamalıdır.

Üretim işlemi, tam SHA ve kapsam onayından sonra runbook üzerinden yapılır.
Her bağlantı öncesinde A kaydı `46.225.20.177`, ED25519 fingerprint
`SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI`, `deploy` kullanıcısı ve
bağlantı içindeki host/repo/Compose kimlik kapıları doğrulanır.

Canlı önkoşulun kapanması için:

1. App ve worker'ın aynı telemetri sürümüne geçtiği anı UTC ve tam SHA ile kaydet.
   İlk doğal tamamlanma ve varsa ilk hata kaydında boyut alanlarını doğrula;
   eksik örneği elle koşu başlatarak doldurma.
2. Prompt/model/bütçe/eşzamanlılık değiştirmeden en az **12 saat ve 200 terminal
   doğal `NORMAL_WAKE` koşusu** biriktir. Bu, başlangıç dağılımını gözlemek için
   seçilen operasyonel pencere; istatistiksel güç veya Gate 10 kabulü değildir.
   Nadir onarım fazları için az örnek varsa bunu ayrıca bildir.
3. Bitiş kesiminden önce başlayan tüm kohortu `agent_runs` üzerinden say; terminal
   raporu veya `usageMetadata` bulunmasını sorguya giriş koşulu yapma. Devam eden
   koşuların bitmesini bekle ve onları ayrıca say. Hiç interval kaydı bulunmayanları
   "çağrı yapmadı" veya sıfır boyut diye sınıflandırma: erken durma ile OOM/reboot/
   terminal rapor kaybı bu eksik değerden tek başına ayırt edilemez. Faz bazında
   kaydedilmiş interval, iki boyutu da bulunan interval ve eksik alan sayısını ver.
   **%100 alan kapsamı yalnız kaydedilmiş yeni interval'lar için** aranır; tüm
   gerçekleşmiş çağrıların kaydedildiğinin kanıtı değildir. Eksik koşu sayısını ve
   paydasını ayrıca raporla; boyut yüzdelikleri kaydı kalmış örnekleme koşulludur.
4. Her faz için boyut p50/p90/p95/maks; süre p50/p90/p95 ve `censored` sayısını
   ayrı raporla. Kesilmiş sürenin gerçek tamamlanma süresi olmadığı sınırı korunur;
   boyutu ise bilinir. Hatalı ve başarılı provider sonuçlarını birleştirerek
   tamamlanma gecikmesi sonucu çıkarma. Boyut-süre ilişkisi tek başına nedensellik
   kanıtı değildir.
5. Tam pencereyi ve sayımları `PLAN.md` ile bu kanıt kaydına işle. **Ancak sonra**
   DECISION daraltma deneyini tasarla ve koşu/güvenlik değişikliği için yeniden
   yürütücüden farklı modelle hakem turu al; Astra yürütüyorsa Fable veya Opus 5 kullan.
   AW ürün kapısı, timeout bütçesi ve kalite ölçütleri
   deneyin değerlendirmesinde korunur.
