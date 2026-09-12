# AW 24 saatlik tam pencere + kaynak tabanı — üretim izi, 12 Eylül 2026

Ölçüm makbuzu; tek aktif sıra [PLAN.md](PLAN.md). Protokol
[URETIM_IZI_PROTOKOLU_2026-09-11.md](URETIM_IZI_PROTOKOLU_2026-09-11.md) Paket B ve C.
Salt okunur üretim; kesim `2026-09-11 21:56:45Z`, app `7ebb887`, `scripts/olcum.sh`
(READ ONLY / REPEATABLE READ, 20 sn timeout). Koşum Gökhan'ın Termius SSH deploy
oturumundan; arındırılmış özet paste ile alındı.

## Paket B — AW düzeltmesinin tam 24 saatlik penceresi

Pencere `2026-09-10T08:19:22.400Z → 2026-09-11T08:19:22.400Z` (TSİ 11:19→11:19),
`NORMAL_WAKE`. Bütün koşular yeni AW profili
`327c35e662b0542cba38d94a84f3fce7c552d1adcaab69fd3caa8b4df028ec15`,
`gpt-5.6-luna/max`, `codex-cli 0.144.6` (473; 2 kayıtta model metadata eksik).

**Koşu sayıları:** oluşan 476, terminal 474 — SUCCEEDED 346, PARTIAL 121,
FAILED 9, CANCELLED 0, TIMED_OUT(status) 0.

**İki oran ayrı:**

- Operasyonel timeout (`CODEX_TIMEOUT`, PARTIAL statüsünde): **12/474 = %2,53**.
- Gate 10 madde 4 metriği (yalnız doğal FAILED + TIMED_OUT statüsü):
  **9/474 = %1,90**, %5 eşiğinin altında. Wilson %95 aralığı yaklaşık %1,0–%3,6;
  nokta tahmininden kalıcı "%5 altı" hükmü çıkmaz.

**FAILED dökümü (9):** `CODEX_DECISION_PROVENANCE_INVALID` 4,
`CODEX_DECISION_FAILED` 3, `CODEX_ACTION_WORTHINESS_FAILED` 1,
`CONTROL_PLANE_RUN_COMPLETION_FAILED` 1.

**Telemetri bütünlüğü:** terminal interval raporu eksik **0**; toplam 1547 interval,
**1547'sinde de** pozitif `promptChars` + `promptBytes`; 13 censored. Tam kapsama.

**AW telemetrisi:** 455 rapor, 1205 aday, 944 seçim → **eleme %21,66**;
verdict **449 ACT / 6 NO_ACTION**. Eleme oranı 15:21 ara okumasıyla (%22,17)
tutarlı. Bu, kapının eleme yaptığını gösterir; **semantik körleşmeyi tek başına
dışlamaz** — o ayrı bir körlenmiş değerlendirme işidir (hakem Astra).

**Faz süreleri (censored hariç, sn / p50_chars UTF-16):**

| faz               | n   | p50   | p90   | p95   | maks  | p50_chars |
| ----------------- | --- | ----- | ----- | ----- | ----- | --------- |
| DECISION          | 476 | 196,9 | 279,3 | 302,2 | 402,2 | 117.945   |
| ACTION_WORTHINESS | 456 | 28,6  | 97,7  | 119,5 | 203,2 | 15.605    |
| BROWSE            | 475 | 9,6   | 12,8  | 14,0  | 18,9  | 11.757    |
| DECISION_REPAIR   | 20  | 144,5 | 226,4 | 237,1 | 286,9 | 117.027   |
| CONTENT_REPAIR    | 107 | 2,1   | 2,6   | 3,2   | 5,6   | 1.839     |

AW p50 28,6 sn (#112 daraltmasından sonra 7 Eyl'de 35,7 idi; daha da düşük).
DECISION p50 196,9 sn (dokunulmadı, ~193–199 bandında). Timeout alan 12 koşunun
son fazı: **10 ACTION_WORTHINESS, 2 DECISION_REPAIR** — kesilmeler hâlâ ağırlıkla
AW'de ama oran düşük.

**Sonuç.** AW düzeltmesi (#112 daraltma + #125 hedef/kanıt) tam 24 saatte sağlıklı:
eleme ~%22 (körelmemiş), operasyonel timeout %2,5, Gate-metriği %1,9. **Bu tek
başına Gate 10 PASS değildir:** gate ayrıca yedi günlük doğal pencere, diğer
maddeler ve ayrı semantik kalite kapısını da ister. Onarım fazları üretimde
mevcut (CONTENT_REPAIR 107, DECISION_REPAIR 20) ama kuyruklu 8 entry'nin hiçbiri
onları kullanmadı (bkz [KUYRUK_URETIM_IZI_2026-09-12.md](KUYRUK_URETIM_IZI_2026-09-12.md)).

## Paket C — kaynak tabanı: blokaj tek ölü kaynakta

`aksamustu`, `cikissagda`, `mevsimdisi` — üçü de **10 kayıtlı TRUSTED** kaynak
taşıyor ama her birinde **`manifold.press` ölü**, dolayısıyla **taze faydalı = 9**:

| profil     | kayıtlı | manifold ardışık hata | manifold son faydalı | taze faydalı |
| ---------- | ------: | --------------------: | -------------------- | -----------: |
| aksamustu  |      10 |                    20 | 2026-09-02           |            9 |
| cikissagda |      10 |                    17 | 2026-08-20           |            9 |
| mevsimdisi |      10 |                    32 | 2026-08-21           |            9 |

Diğer 9 kaynağın hepsi 11 Eylül'de taze çekilmiş (`lastUsefulAt` 09-11).
**Doğal edinme çalışmış:** havuz büyümüş, üç profile eski listede olmayan canlı
kaynaklar gelmiş (bantmag.com, fayn.press, vesaire.press, www.arkitera.com,
www.itdp.org, www.strongtowns.org, www.smartcitiesdive.com, www.dunya.com,
www.ekonomim.com, www.iklimhaber.org, yesilgazete.org, www.sosyalbilimler.org …).
Ama her profil tam da tek ölü kaynak yüzünden 9'da kalıyor.

`manifold.press` kalıcı olarak başarısız (üyelik duvarı / `SOURCE_AUTH_REQUIRED`;
10 Eylül yerel provada aynı adres okunmuştu ama üretimin fetch'i 401/403 alıyor).
Bu geçici bir dalgalanma değil: son faydalı fetch 2–3 hafta öncesinde, ardışık
hata sayaçları 17–32.

**Remedy (üretim mutasyonu — Gökhan onayı ve kendi ölçümü gerekir):** üç profilde
ölü `manifold.press`'i kaldır/engelle (admin block) ki aday mekanizması havuzdan
kanıtlanmış canlı bir 10. kaynağı backfill etsin; ya da doğrudan canlı bir Türkçe
yayınla değiştir. Kaynak yazımı bu izde **yapılmadı**.

C0/C1 (manifold fetch metadata eğilimi) sorguları **0 satır** döndü: sorgu
`SOURCE_FETCH_RESULT.metadata` içinde düz `manifold.press` dizesi arıyordu; olay
metadata'sı domaini o biçimde taşımıyor. C2 tablosu zaten kesin resmi veriyor,
bu eksik kritik değil; ileride gerekirse metadata şekli `sourceId` üzerinden
çözülür.

## 12 Eylül — uygulanan düzeltme (Gökhan onayı + telefonundan koşuldu)

`scripts/kaynak-duzelt.sh` önizlemesi gerçek bir kısıtı yakaladı: manifold.press
üç profilde de **`adminPinned=true`** (persona init'te sabitlenmiş), dolayısıyla
`adminBlocked=true` `CHECK (NOT (adminPinned AND adminBlocked))` kuralını ihlal
ediyordu. Engelleme gereksizdi: yalnız **yeni bir kaynak eklemek** tabanı 10'a
çıkarır, ölü manifold 11. kayıt olarak kalır ama taze sayımını etkilemez.

Script INSERT-only'e indirgendi ve `execute` ile uygulandı: üç profile de
`https://www.log.com.tr/feed/` (başka profilde 7 gün içinde taze çekilmiş,
kanıtlanmış canlı Türkçe tasarım/kültür kaynağı) `PROBATION` statüsüyle,
`addedByOrigin='OPERATOR_MANIFOLD_BACKFILL'` etiketiyle eklendi (3 satır).
manifold'a dokunulmadı. Geri alma: `DELETE FROM agent_sources WHERE
"addedByOrigin"='OPERATOR_MANIFOLD_BACKFILL'`.

**Henüz taze faydalı DEĞİL:** eklenen kaynak `lastUsefulAt=NULL`; ilk başarılı
fetch'ten (sonraki günlük yenileme/uyanış) sonra taze sayılır. **Ertesi gün
yeniden sayılacak** — o zaman üç profil de 10'a çıkarsa reset kapısının 2. adımı
kapanır. Kaynak fetch başarısız olursa (log.com.tr bu profillerde de 401/403
verirse) başka donor denenir.

## Reset kapısı durumu

Sıra 5 kilitli sırasında **2. adım (kaynak tabanı)**: düzeltme uygulandı (yukarıda),
taze faydalı sayımının 10'a çıkması **ilk fetch döngüsüne** bağlı — ertesi gün
doğrulanacak. Doğrulanana kadar adım açık sayılır. Reset bu adım kapanmadan
başlamaz; atıf verisi (`agent_actions`) silinmeden taban 36/36'ya çıkmalı.
