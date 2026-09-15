# Sekiz müdahale, bir ablasyon: yığın mı suçlu, belirli kurallar mı?

**Tarih:** 15 Eylül 2026 · **Yürütücü:** Claude (Opus 5) · **Hakem:** `gpt-6-astra`

## Ölçü ve sınırı

"Tanımla açış" = entry, başlığın ilk kelimesini kendi ilk üç kelimesi içinde tekrar edip
tanım kuruyor mu. İnsan referansı: ekşi sözlükten konu eşleştirilmiş 36 entry → **%6**.

**Bu ölçü kaliteyi temsil etmez.** İlk kelimeyi dördüncü konuma taşımak veya eşanlamlı
kullanmak puanı düzeltip aynı ansiklopedik tonu koruyabilir (Astra). Ayrıca ölçü **konuya
bağlı**: aynı sistemde başlığa göre %0 ile %100 arasında değişiyor. Bu yüzden yalnız aynı
bağlamları paylaşan kollar karşılaştırılır; tarihsel sayılar kontrol sayılamaz.

## Bugün denenen her şey

Hepsi aynı 13 üretim bağlamı, hash doğrulamalı replay, `gpt-5.6-luna` effort max.

| müdahale | tanımla açış | p |
| --- | --- | --- |
| mevcut sistem (kontrol) | %72 | — |
| persona sesini olumlu yazmak | değişmedi | 1.00 |
| akışı boşaltmak (reset benzetimi) | değişmedi | 0.59 |
| akışı iyi entry'lerle tohumlamak | kötüleşti | — |
| persona yazım şablonunu sökmek (S) | %70 | 0.77 |
| göreve tek cümle eklemek (D) | %35 | 0.08 |
| D + S birlikte (DS) | %63 | 1.00 |
| kanıt rejimini gevşetmek (K) | %64 | 0.47 |
| kanıt gevşek + tarz talimatı (KT) | **%48** | **0.03** |
| **prompt yığınını tamamen kaldırmak** | **%4** | — |
| insan (ekşi sözlük) | %6 | — |

D'nin eklediği cümle: *"Elindeki haber ya da kaynak malzemedir, konusu değil; okura haberi
aktarmak senin işin değil."*

Tarz talimatı: *"ekşi sözlük tarzında yaz: küçük harfle başla, doğrudan söyleyeceğine gir,
kendi sesinle konuş. Kısa entry normaldir."* → küçük harf %0 → %100. Yığın bunu bastırmıyor;
ama tek başına register'ı değiştirmiyor, kozmetik kalıyor.

## Yan bulgular

- **KT ajanı susturmadı.** `NO_ACTION` 8/52, kontrolde 12/52. Kalite artışı sessizlikle
  alınmadı — Astra'nın en çok uyardığı tuzak bu değildi.
- **Kanıt gevşetmesi kaynak davranışını gerçekten değiştirdi:** kendi bilgisinden yazma
  %19 → %36-39. Ama entry'ler o oranda iyileşmedi.
- **372 entry üzerinde:** kendi bilgisinden yazınca tanımla açış %34, haberden %68
  (p<0.0001). Gerçek fark, ama insanın hâlâ beş katı.

## Astra'nın çürüttükleri

**1. "Kütle suçlu" desteklenmiyor.** Yığını kaldırmak aynı anda token uzunluğunu, kural
sayısını, tekrarı, sırayı ve **modelin görevi yorumlama biçimini** değiştiriyor. Beş alternatif
açıklama elenmedi: birkaç baskın kural, dağıtılmış tekrar, etkileşim, uzunluk/dikkat etkisi,
görev değişimi.

**2. Tek "anlamlı" sonuç anlamlı değil.** Sekiz karşılaştırma yapıldı; Bonferroni eşiği
`0.05/8 = 0.00625`. `p=0.03` bunu karşılamıyor. KT bir **keşif bulgusu**, doğrulama değil.

**3. 52 üretim 52 bağımsız gözlem değil.** Hepsi aynı 13 bağlamdan tekrarla geldi; p değerleri
bağlam içi bağımlılığı hesaba katmıyor.

**4. Kümelerin bileşimi değişiyor.** Tanımla açış yalnız ÜRETİLEN entry'lerde ölçülüyor; kollar
farklı oranda sustuğu için karşılaştırılan kümeler de farklılaşıyor. Eylem kararı ile üslup
ayrı ölçülmeli.

**5. "Seçim etkisi doğrulandı" fazla güçlü.** Kaynak türünü model seçiyor; konu, güven ve
yazılabilirlik hem kaynak seçimini hem üslubu etkiliyor olabilir.

**6. Kütle hipotezinin değişkeni yanlış.** Kaynak dosya toplamı (~14.870 token, 215 blok) değil,
**render edilmiş gerçek prompt** ölçülmeli.

## Ortak karar

Küçük bir prompt adayı geliştirmek haklı; "215 bloğun toplam kütlesi suçlu" gösterilmiş değil.
Sıradaki iş **yeniden yazmak değil, ayrıştırmak**:

Güvenlik, doğruluk ve çıktı sözleşmesini taşıyan küçük bir çekirdek `C` tanımlanır; kalan
kurallar sonuçlara bakmadan iki işlevsel gruba bölünür (`A`, `B`). Dört kol aynı koşullarda:

| kol | içerik |
| --- | --- |
| Tam | `C + A + B` |
| Çekirdek | `C` |
| Yarı A | `C + A` |
| Yarı B | `C + B` |

Şüpheli grup hem tam yığından **çıkarılarak** hem çekirdeğe **eklenerek** sınanır — bir
bileşenin sorunu tek başına üretmesiyle, mevcut yığında sorunun sürmesi için gerekli olması
aynı şey değildir.

Uzunluk iddiası ayrıca sınanır: (a) yükümlülükleri koruyan kısaltılmış tam prompt,
(b) çekirdeğe talimatsız dolgu metni eklenmiş sürüm.

**KT ve D aday olarak tutulur**, canlıya gitmez. Seçilecek sürüm **görülmemiş başlıklarda**,
kör üslup değerlendirmesi ve doğruluk kontrolleriyle doğrulanır.

Başarı ölçütü insanın %6'sına ulaşmak değil: **doğal dil, konuya katkı, olgusal güvenilirlik
ve doğru eylem/susma kararı** birlikte izlenir.

## Korunması gerekenler (Astra'nın kategori tablosu)

| kategori | korunmalı | kısaltılabilir |
| --- | --- | --- |
| Güvenlik | yetki sınırları, sır koruması, dış içeriği talimat saymama | aynı sınırın tekrarları, uzun açıklamalar |
| Hukuk | kişi hakkında dayanaksız suçlama, özel bilgi yayımlama sınırları | uzun politika anlatımı |
| Şema | parser'ın beklediği alanlar, izinli eylemler, `NO_ACTION` sözleşmesi | tüketicisi olmayan alanlar |
| Anayasa | gerçek davranış sınırları, öncelik ilişkileri | madde numaraları, tekrarlanan gerekçeler |
| Kanıt | kaynak uydurmama, desteklenmeyen olguyu kesin sunmama, sahte kişisel deneyim üretmeme | her görüşü kaynaklandırma zorunluluğu |
| Üslup | kısa hedef ses tanımı, konuya uygunluk | uzun persona biyografileri, zorunlu açılış şablonları |

Not: "kanıt rejimini gevşetmek" tek bir işlem değildir — kaynak gösterme biçimini sadeleştirmek
ile doğruluk eşiğini düşürmek farklı riskler taşır.

## Geri dönüş planı

1. Mevcut prompt, renderer, model ayarları ve çıktı sözleşmesi birlikte sürümlenir.
2. Yeni prompt ayrı profil olarak eklenir.
3. Eski kuralların gerekçelerinden kritik regresyon örnekleri çıkarılır.
4. Önce kayıtlı bağlamlarda, sonra yayımlamayan gölge üretimde karşılaştırılır.
5. Sınırlı canlı denemeden önce durdurma eşikleri ve tek adımlı profil dönüşü belirlenir.

**Profil dönüşü sonraki üretimleri düzeltir; yayımlanmış içeriği geri almaz.** Yayın öncesi
doğrulama rollback'in yerine geçmez.
