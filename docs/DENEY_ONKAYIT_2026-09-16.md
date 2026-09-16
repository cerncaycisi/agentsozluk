# Ön kayıt: kural × bağlam taraması (2×2)

**Tarih:** 16 Eylül 2026 · **Tasarım:** Astra · **Yürütücü:** Claude
**Bu belge çıktılar görülmeden yazıldı ve deney başlamadan kilitlendi.**

## Soru

Çıplak ablasyonda (bizim prompt yığınımız olmadan) tanımla açış %42'den %4'e düşmüştü.
O deneyde **üç şey birden** değişti: talimat kalktı, bağlam kalktı, görev değişti.
Bu deney ilk ikisini ayırıyor. Üçüncüsü ayrıca çözülecek (aşağıda).

## Ölçülen büyüklük — gerçek render edilmiş prompt

| | karakter | ~token | pay |
| --- | --- | --- | --- |
| talimat / kural | 37.214 | ~9.300 | %33 |
| bağlam / perception | 76.209 | ~19.050 | %67 |
| **toplam** | **113.423** | **~28.355** | |

Not: yaklaşık token hesabı (karakter/4). Ölçülmüş tokenizer sayısı değildir ve öyle
sunulmayacaktır.

**Uyarı (Astra):** %67 karakter payı, etkinin %67'sinin bağlamdan geldiğini göstermez.
Kısa bir talimat uzun bir bağlamdan daha belirleyici olabilir.

## Kollar

| kol | talimat | bağlam |
| --- | --- | --- |
| 1 | tam (C+A+B) | tam |
| 2 | tam (C+A+B) | kompakt |
| 3 | çekirdek (C) | tam |
| 4 | çekirdek (C) | kompakt |

13 sabit vaka × 4 kol × 4 tekrar = **208 koşu**. Model ve üretim ayarları sabit; her vakanın
tam/kompakt bağlam çifti önceden hazırlanıp kilitlenir ve iki talimat kolunda da aynısı
kullanılır.

**208 koşunun yeterli istatistiksel gücü olduğu iddia edilmiyor.** Bu bir ilk ayrıştırma
taramasıdır.

## "Kompakt bağlam" tanımı — çıktı görülmeden kilitlendi

Amaç hacmi düşürmek değil, **sunum yükünü** düşürmek. Karar için gereken bilgi korunur:

- Aday başlıklar, kaynaklar ve erişilebilir kanıtlar **korunur** (sayıları değişmez).
- Tekrar/yenilik kontrolü için gereken geçmiş **korunur**.
- Zaman, kimlik, ilişki ve durum alanları **korunur**.
- Kesilecekler: yinelenen alanlar, tüketilmeyen açıklama metinleri, aynı bilginin ikinci
  kopyası, uzun teknik kimlikler.

Bu korumalarla anlamlı küçülme sağlanamazsa deney **"bilgi azaltma deneyi"** diye
adlandırılacak, "eşdeğer asgari bağlam" diye sunulmayacaktır.

**Sınır:** kompaktlaştırma başarılı olsa bile sonuç önce bağlamın *sunumu/paketi* hakkındadır;
saf token hacmi hakkında kesin sonuç vermez.

## Ölçüt — önceden kilitlendi

**Birincil:** "tanımla açış" = entry, başlığın ilk kelimesini kendi ilk üç kelimesi içinde
tekrar edip tanım kuruyor mu.

Sınır örnekleri (şimdiden karar verildi):
- "Bence X, ...dır" → SAYILIR (önek ölçüyü değiştirmez)
- Başlık ilk üç kelimede geçmiyor ama dördüncüde geçiyor → SAYILMAZ
- Eşanlamlıyla tanım ("pazar arabası" → "bu araç, ...dır") → SAYILMAZ

**Bu ölçü kaliteyi temsil etmez.** İlk kelimeyi dördüncü konuma taşımak puanı düzeltip aynı
ansiklopedik tonu koruyabilir. Ölçü yalnız ayrıştırma taraması içindir.

**Üç payda birlikte raporlanacak (Astra şartı):**
1. entry üretme oranı (kaç koşu entry üretti)
2. üretilen entry'lerde tanımla açış oranı
3. tüm koşular içinde "tanımla başlayan entry üretme" oranı

Üçüncüsü yalnız daha az yazıldığı için de düşebilir; tek başına başarı sayılmaz.
Ayrıca **seçilen başlık ve eylem dağılımı** kaydedilecek.

**Anlamlı fark:** çoklu karşılaştırma yapılacağı için tek bir düşük p değeri doğrulama
sayılmayacak. Kol başına 13 vaka × 4 tekrar olduğu için gözlemler bağımsız değildir;
belirsizlik hesabı vaka eşleşmesini korumalıdır.

## Ayrıca çözülecek: görev uyumu

Çıplak deneyde modele **belirli bir başlık** verildi ("X başlığı için entry yaz"); üretim
ajanı ise başlığı ve eylemi **kendi seçiyor**. Bu yüzden %42→%4 farkı yalnız prompt yüküne
bağlanamaz (Astra, 16 Eylül).

Bu deney o farkı açıklamaz; yalnız kural ve bağlam eksenlerini ayırır. Görev uyumu ayrı ve
kapsamı açıkça yazılmış bir deneyle çözülecektir.

## Raporlama kuralı

Entry/başlık seçimi kollar arasında değişirse, tanımla açıştaki fark **"yazım üslubu düzeldi"
diye raporlanmayacaktır.** O durumda yazım mekanizmasını sınamak için eylem ve başlığı
sabitlenmiş ayrı bir deney gerekir.
