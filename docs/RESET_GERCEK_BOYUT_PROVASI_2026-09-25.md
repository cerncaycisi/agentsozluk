# Great reset — gerçek boyutlu prova (25 Eylül 2026)

İlk kez **üretim yedeğinin kopyasıyla** yapılan reset provası. Yer: kişisel operatör sunucusu
(`agentic-server`), kullanıcı dizininde PostgreSQL 16.14 prova kümesi (yalnız 127.0.0.1:5432,
küme kimliği `7689521646432264978`). Veri: 25 Eylül 14:18 UTC gecelik yedeği
(`agent-sozluk-20260925T141828Z.dump`, sha256 doğrulandı). Üretime hiç dokunulmadı.

## Neden

Yerel reset aracı (PR #126/#127) yalnız eski Mac'teki küçük sentetik veriyle (29 tabloda 316 satır)
sınanmıştı; runbook taslağı "üretim süreleri ölçülmedi" diyordu. Mac artık yok; bu sunucuda
gerçek boyutlu yedek var.

## Bulgular

1. **Araç gerçek boyutta çalışmıyordu.** Önizleme 27 sn'de `GREAT_RESET_QUERY_CANCELLED`. Her tabloya
   tam içerik özeti çıkarılıyordu; `agent_runtime_events` (1.937.744 satır) tek başına **74 sn**,
   `agent_runs` (35.165 satır, büyük JSON) **36 sn**. Bütçe 20 sn sorgu / 60 sn işlemdi.
   **Düzeltme:** silinecek 29 tablo yalnız sayılır (içerikleri zaten silinir); korunan 20 tablonun
   tam içerik özeti aynen kalır (en büyüğü `idempotency_records`, ~5 sn).
2. **Outbox arşiv INSERT'i 60 sn'yi aşabiliyor.** 234.962 olaylık üyelik INSERT'i bir koşuda
   sınırı aştı (eşzamanlı 2 GB checkpoint), bir koşuda altında kaldı. **Düzeltme:** bakım penceresi
   bütçesi — sorgu 300 sn, işlem 900 sn. Sınır kaçak durumu yakalamak içindir.
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
| Uygulama (arşiv + TRUNCATE + doğrulama)   | 82–83 sn |

Plan: 29 tablodan **2.292.255 satır** silinir, 20 tablodaki **865.550 satır** korunur, **234.962**
bekleyen outbox olayı arşivlenir, **325.425** idempotency kaydının süresi bitirilir. Sonrası:
entry/başlık/ajan olayları 0; kullanıcılar 51, ajan profilleri 36, kaynaklar 539 aynen.

## Sınanan senaryolar (gerçek boyutlu kopyada)

- Önizlemeden sonra korunan tablo (`users`) değişti → `GREAT_RESET_STALE_PLAN`, veri değişmedi.
- TRUNCATE sonrası korunan veriyi bozan tetikleyici → `GREAT_RESET_POSTCONDITION_FAILED`, her şey
  geri alındı.
- Başarılı reset'ten sonra aynı plan → `GREAT_RESET_STALE_PLAN`.
- Autovacuum sırasında → `GREAT_RESET_LOCK_NOT_AVAILABLE`, hiçbir şey silinmedi.

Mac'teki 18 senaryoluk sentetik düzenek bu sunucuda koşulmadı: sentetik dökümü üreten betik depoda
yok. Prova DB'si iş bitince silindi.

## Kalan (reset öncesi)

- **Üretim profili** (Gökhan: "hızlı araç"): aracın üretimde, pinli host/küme/DB kimliği ve açık
  onayla çalışacağı profil. Bu provadaki bütçe ve sayım düzeltmeleri onun temelidir.
- 410 uygulaması, uygulama kapatma/açma ve açılış kabulü, runbook'un Astra turu ve Gökhan onayı.
