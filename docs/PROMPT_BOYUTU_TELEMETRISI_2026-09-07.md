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

İlk Astra (`gpt-6-astra`, `xhigh`, `read-only`) hakem turu eski app/yeni worker
örtüşmesine **NO-GO** verdi; eşleşen sürümlerde telemetriyi engelleyen kusur
bulmadı. Bulgu `worker.ts:1270` ve `runtime-schemas.ts:399` üzerinden yeni
alanların eski `.strict()` şemasına gitmesi. Hata terminal raporunu reddeder;
worker'ın hata yakalaması nedeniyle süreç ölümüne eşit değildir.

İkinci Astra turu: **repo merge GO; tanımlı release yolu KOŞULLU GO**. Gerçek
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
3. Bitiş kesiminden önce başlayan koşuların bitmesini bekle; devam edenleri ve
   hiç interval üretmeyenleri ayrıca say. Yalnız başarıları seçme. Faz bazında
   toplam interval, iki boyutu da bulunan interval ve eksik alan sayısını ver.
   Yeni sürümde başlayan, çağrı kaydı olan koşularda kapsama **%100** olmalı.
4. Her faz için boyut p50/p90/p95/maks; süre p50/p90/p95 ve `censored` sayısını
   ayrı raporla. Kesilmiş sürenin gerçek tamamlanma süresi olmadığı sınırı korunur;
   boyutu ise bilinir. Hatalı ve başarılı provider sonuçlarını birleştirerek
   tamamlanma gecikmesi sonucu çıkarma. Boyut-süre ilişkisi tek başına nedensellik
   kanıtı değildir.
5. Tam pencereyi ve sayımları `PLAN.md` ile bu kanıt kaydına işle. **Ancak sonra**
   DECISION daraltma deneyini tasarla ve koşu/güvenlik değişikliği için yeniden
   Astra hakem turu al. AW ürün kapısı, timeout bütçesi ve kalite ölçütleri
   deneyin değerlendirmesinde korunur.
