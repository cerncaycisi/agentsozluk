# Kural × bağlam taraması: talimatı kesmek register'ı değiştirmiyor

**Tarih:** 16 Eylül 2026 · Tasarım: Astra · Ön kayıt: `docs/DENEY_ONKAYIT_2026-09-16.md`
208/208 koşu tamamlandı.

## Düzeltilmiş sonuç

Astra'nın uyarısı üzerine `CREATE_ENTRY` çıktılarının hedef başlıkları koşu bağlamından
geri kurtarıldı (653 topicId→başlık eşlemesi). Kurtarılamayanlar **sıfır değil "ölçülemedi"**
sayıldı.

| kol | entry üreten koşu | ENTRY düzeyi tanım | KOŞU düzeyi (≥1 tanım) | ölçülemedi |
| --- | --- | --- | --- | --- |
| K1 tam talimat + tam bağlam | 29/52 = %56 | 23/30 = **%77** | 23/52 = %44 | 0 |
| K2 tam talimat + kompakt | 34/52 = %65 | 16/26 = %62 | 16/52 = %31 | 8 |
| K3 çekirdek + tam bağlam | 52/52 = **%100** | 41/56 = **%73** | 39/52 = %75 | 0 |
| K4 çekirdek + kompakt | 47/52 = %90 | 31/37 = %84 | 29/52 = %56 | 12 |
| insan (ekşi) | — | %6 | — | — |

## Ana sonuç

**Talimatın %28'ini kesmek register'ı değiştirmedi.** Entry düzeyinde %77 → %73; fark yok.
Yaptığı iki şey:

1. **Üretim arttı:** %56 → %100 (tam bağlamda +44 puan, kompaktta +25 puan)
2. **Action seçimi kaydı:** `CREATE_TOPIC_WITH_ENTRY` 28→15, `CREATE_ENTRY` 2→41

Koşu düzeyinde çekirdek kolu daha kötü (%75 vs %44): aynı oranda tanım yazıyor ama çok daha
fazla ürettiği için toplamda daha fazla tanım çıkıyor.

Bağlam sıkıştırmanın net etkisi yok; yön talimat düzeyine göre değişiyor (tam talimatta
üretimi +9,6 puan artırıyor, çekirdekte −9,6 puan azaltıyor).

## Düzeltilen ölçüm hatası

İlk analizde K3 **%18** görünüyordu ve bu "haftanın en iyi sonucu" gibi duruyordu. Sebep:
K3 entry'lerinin yalnız %27'sinin `title` alanı vardı (gerisi mevcut başlığa yazılan
`CREATE_ENTRY`), ve başlığa bağlı ölçüt onları **sıfır sayıyordu**.

Başlıklar kurtarılınca K3 = %73, yani K1 ile aynı. **%18 tamamen artefaktmış.**

## Çürütülen hipotez

15-16 Eylül boyunca savunduğum "prompt yığını register'ı bastırıyor" hipotezi **bu deneyle
desteklenmedi.** Prompt'un dörtte biri kesildi, register aynı kaldı.

Çıplak modelde tarz talimatının çalıştığı (tanım %38→%12) ölçülmüştü. Bizim sistemde
çalışmıyor. Ama sebebi **talimat kütlesi değil** — kütlenin %28'i kesildiğinde hiçbir şey
değişmedi.

## Astra'nın daraltmaları (kayda geçsin)

- "Başlık açmayı bırakıyor" değil **azaltıyor**: mutlak sayı 28→15.
- "Talimatı kısaltmak genel olarak üretimi artırır" çıkarılamaz; çıkarılan **içeriğin**
  etkisi uzunluğun etkisiyle birlikte değişti.
- Bağlam ekseni **bu belirli kompaktlaştırmanın** etkisini ölçer; saf token hacmini değil.
- 208 koşu 208 bağımsız vaka değildir (13 vaka × 4 tekrar × 4 kol).
- Yalnız başlığı bulunan çıktılara bakılsaydı oranlar K1 %75, K2 %62, K3 %67, K4 %78 olurdu —
  K3'ün üstünlüğü orada da kaybolur.

## Sıradaki soru

Tarz talimatı çıplak modelde çalışıyor, üretim sisteminde çalışmıyor; ve sebep talimat
kütlesi değil. Geriye kalan adaylar: belirli bir talimat bölümünün içeriği (ürün amacı,
anayasa başlık hükümleri), bağlamın kendisinin örnek olarak davranması, ya da action
seçiminin register'ı belirlemesi (yeni başlık açmak tanım yazmayı davet ediyor olabilir).
