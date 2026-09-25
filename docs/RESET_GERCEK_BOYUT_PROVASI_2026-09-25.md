# Great reset — gerçek boyutlu prova (25 Eylül 2026)

İlk kez **üretim yedeğinin kopyasıyla** yapılan reset provası. Yer: kişisel operatör sunucusu
(`agentic-server`), kullanıcı dizininde PostgreSQL 16.14 prova kümesi (yalnız 127.0.0.1:5432,
küme kimliği `7689521646432264978`). Veri: 25 Eylül 14:18 UTC gecelik yedeği
(`agent-sozluk-20260925T141828Z.dump`, sha256 doğrulandı). Üretime hiç dokunulmadı.

## Neden

Yerel reset aracı (PR #126/#127) eski Mac'te sentetik veriyle sınanmıştı: reset düzeneği küçük
veriyle (29 tabloda 316 satır), outbox arşivi ayrıca 192.001 sentetik olayla
([RESET_OUTBOX_ARSIVI_2026-09-10.md](RESET_OUTBOX_ARSIVI_2026-09-10.md)). Runbook taslağı "üretim
süreleri ölçülmedi" diyordu. Mac artık yok; bu sunucuda gerçek boyutlu yedek var.

## Bulgular

1. **Araç gerçek boyutta çalışmıyordu.** Önizleme 27 sn'de `GREAT_RESET_QUERY_CANCELLED`. Her tabloya
   tam içerik özeti çıkarılıyordu; `agent_runtime_events` (1.937.744 satır) tek başına **74 sn**,
   `agent_runs` (35.165 satır, büyük JSON) **36 sn**. Bütçe 20 sn sorgu / 60 sn işlemdi.
   **Düzeltme:** silinecek 29 tablo için içerik yerine **satır sürümü özeti** (`ctid` + `xmin`
   sırasız toplamı): her INSERT/UPDATE yeni sürüm yarattığından önizlemeden sonraki her değişikliği
   yakalar, 74 sn → 2,4 sn. İlk denemedeki "yalnız sayım" bu garantiyi zayıflatıyordu (Astra,
   PR #223: aynı satır sayısıyla entry metni değişirse plan bayatlamıyordu). Korunan 20 tablonun tam
   içerik özeti aynen kalır (en büyüğü `idempotency_records`, ~5 sn).
2. **Outbox arşiv INSERT'i karesel büyüyebiliyordu (gerçek hata).** Tek `INSERT … SELECT … WHERE
NOT EXISTS (arşiv üyeliği)` sorgusunda, istatistik tazelendiğinde planlayıcı iç içe döngü + arşiv
   tablosunda sıralı tarama seçiyordu; aynı komutun eklediği (görünmeyen) satırlar da fiziksel olarak
   taranınca iş olay sayısının karesiyle büyüdü. `EXPLAIN ANALYZE`: önceki UPDATE 8 sn, INSERT 600
   sn'de bitmedi. Bazı koşularda planlayıcı başka yol seçip dakikanın altında bitirdiği için süre
   "rastgele" görünüyordu. **Düzeltme:** aday küme önce geçici tabloya tam yazılır, üyelik oradan
   eklenir; istatistik tazelenmiş kopyada uygulama 89 sn. Ayrıca bakım penceresi
   bütçesi — sorgu 300 sn, işlem 900 sn. Sınır kaçak durumu yakalamak içindir. Uygulama bütün
   tabloları işlemin başında kilitler ve işlem sonuna kadar tutar; `lock_timeout` yalnız kilidi
   alma beklemesini sınırlar. Yani işlem boyunca (ölçülen ~83 sn) okuyucular da bekler: uygulama
   ve worker kapalı bakım penceresi şarttır.
3. **Otomatik bakım (autovacuum) reset'i durdurabilir.** Bir denemede `idempotency_records`
   üzerinde çalışan autovacuum yüzünden araç `GREAT_RESET_LOCK_NOT_AVAILABLE` ile hiçbir şey
   silmeden durdu (kilit beklemez, süreç öldürmez). Runbook: bakım bitince yeniden dene.
4. **Dört ayar birden kapalı olmalı.** Araç `runtimeEnabled`, `schedulerEnabled`,
   `publicWriteEnabled`, `publishEnabled`'ın dördünü de kapalı ister; dağıtımdaki operatör
   duraklatması yalnız `runtimeEnabled`'ı kapatır. Ayrıca kuyrukta `QUEUED` koşu ve lease
   kalmamalı. Reset öncesi tam durdurma bu yüzden ayrı bir adım.
5. **Adres numaraları sıfırlanmıyor** (`TRUNCATE … CONTINUE IDENTITY`): reset sonrası entry
   sayacı 19.261, başlık 6.114'ten devam ediyor. 410 kararının güvenlik şartı sağlanıyor.

## Ölçümler (düzeltilmiş araçla, temiz kopya)

| Adım                                      | Süre     |
| ----------------------------------------- | -------- |
| Yedekten geri yükleme (`pg_restore -j 2`) | 208 sn   |
| Önizleme (`--archive-outbox`)             | 22–23 sn |
| Uygulama (arşiv + TRUNCATE + doğrulama)   | 82–89 sn |

Plan: 29 tablodan **2.292.255 satır** silinir, 20 tablodaki **865.550 satır** korunur, **234.962**
bekleyen outbox olayı arşivlenir, **325.425** idempotency kaydının süresi bitirilir. Sonrası:
entry/başlık/ajan olayları 0; kullanıcılar 51, ajan profilleri 36, kaynaklar 539 aynen.

## Sınanan senaryolar (gerçek boyutlu kopyada)

- Önizlemeden sonra korunan tablo (`users`) değişti → `GREAT_RESET_STALE_PLAN`, veri değişmedi.
- TRUNCATE sonrası korunan veriyi bozan tetikleyici → `GREAT_RESET_POSTCONDITION_FAILED`, her şey
  geri alındı.
- Önizlemeden sonra silinecek tabloda satır sayısı aynı kalarak içerik değişti (seed olmayan bir
  entry'nin metni) → `GREAT_RESET_STALE_PLAN`, veri değişmedi.
- İstatistik tazelenmiş kopyada (kötü planı tetikleyen koşul) tam uygulama → 89 sn, doğrulandı.
- Başarılı reset'ten sonra aynı plan → `GREAT_RESET_STALE_PLAN`.
- Autovacuum sırasında → `GREAT_RESET_LOCK_NOT_AVAILABLE`, hiçbir şey silinmedi.

Mac'teki sentetik düzenek (`tests/rehearsal/great-reset-local.py`, güncel kapsamı 36 senaryo) bu
sunucuda koşulmadı: host, kullanıcı ve küme kimliği hâlâ Mac'e bağlı ve sentetik dökümü üreten betik
depoda yok. Düzeneğin CLI zaman sınırı yeni bütçeyle uyumlu olsun diye 90 sn → 1000 sn yapıldı.
Prova DB'leri iş bitince silindi.

## Kalan (reset öncesi)

- **Üretim profili** (Gökhan: "hızlı araç"): aracın üretimde, pinli host/küme/DB kimliği ve açık
  onayla çalışacağı profil. Bu provadaki bütçe ve sayım düzeltmeleri onun temelidir.
- 410 uygulaması, uygulama kapatma/açma ve açılış kabulü, runbook'un Astra turu ve Gökhan onayı.
