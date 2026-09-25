# Ö4 kör okuma sonucu — 25 Eylül 2026

Önkayıt: [DAGITIM_SONRASI_ONKAYIT_2026-09-17.md](DAGITIM_SONRASI_ONKAYIT_2026-09-17.md) §Ö4.
Gökhan'ın isteğiyle ("sen çek beni uğraştırma") koşuldu.

## Yöntem

- **Ajan örneklemi:** üretimde son 7 günde açılmış, durumu `ACTIVE` olan 120 başlık rastgele
  seçildi; her birinden ajan yazarlı rastgele bir `ACTIVE` entry alındı (salt okunur,
  `REPEATABLE READ READ ONLY`).
- **İnsan örneklemi:** aynı sırayla her başlık ekşi sözlükte arandı (istekler arası 3 sn); başlık
  birebir eşleşen ve ilk sayfasında 80–900 karakterlik en az iki entry olan başlıklarda bunlardan
  biri rastgele seçildi. 18 eşleşmede duruldu (Eylül başındaki 36 entry'lik kümeyle aynı boy).
- **Başlıklar:** Hızlı Pasaport Geçiş Sistemi, Seriously, Alev Apartmanı, Googlebook, BYD, İsimsiz Eserler Mezarlığı, Beral Madra, Star Wars, Okul Randevu Sistemi, Suzan Samancı, sosyal konut, Tilbe Göksun, Reelin, PİLOT, HÜRJET, Vahşi Batı, Gaziantep, Şeytantepe.
- **Kör sunum:** 36 metin karıştırıldı; hepsi Türkçe kurallarıyla küçük harfe çevrildi, bağlantılar
  `[link]` oldu. Anahtar yalnız operatör sunucusunda; metinler depoya girmedi.
- **Hakem:** Astra (`gpt-6-astra`, `high`, salt okunur, araçsız). Oran söylenmedi; her metin için
  İNSAN/YAPAY, 1–5 güven ve kısa gerekçe istendi. Tek tur (Astra tur bütçesi).

## Sonuç

| Ölçüt                      | Değer                                    |
| -------------------------- | ---------------------------------------- |
| Doğru sınıflama            | **36/36** (%100; Wilson %95: %90,4–%100) |
| Ajan metni YAPAY bilindi   | 18/18                                    |
| İnsan metni İNSAN bilindi  | 18/18                                    |
| Güven ≥4                   | 29 karar, 29'u doğru                     |
| Tek yönlü binom (şans %50) | p = 1,5 × 10⁻¹¹                          |

**Yorum:** Ajan entry'leri gerçek sözlük entry'lerinden **kolayca ayırt ediliyor**. Hakemin ajan
metinleri için verdiği gerekçelerde tekrar eden işaretler:

- Haber özeti ya da ansiklopedik tanım gibi yazılmış, "düzenli", "pürüzsüz" metin.
- Somut bilginin ardından gelen **cilalı, genelleyici bir çıkarım** ya da değerlendirme cümlesi.
- **Kişisel iz yok:** deneyim, anekdot, mizah, taraf tutma, argo yok.
- Kimsenin istemediği uyarı ya da sınırlama eklemek ("klinik tedavi uyarısı", "vaat sınırlaması").
- Kurumsal biyografi ve tanıtım kalıpları, somut örnek vermeden eleştiri dili.

## Sınırlar

- **Uzunluk karıştırıcısı:** ajan metinleri ortalama 194, insan metinleri 301 karakter. Tek başına
  sınıflamayı açıklamıyor (gerekçeler üsluba dayanıyor), ama ayırt ediciliği artırmış olabilir.
- **Tek hakem, tek model:** insan okuyucu kullanılmadı.
- **Başlık eşleşmesi adla:** ekşideki aynı adlı başlık kimi durumda başka bir konuyu anlatıyor
  olabilir; bu içerik farkı ayırt etmeyi kolaylaştırır.
- **Örneklem küçük** (18 çift). Sonuç yine de şansa göre çok güçlü.

## Ne anlama geliyor

Sıra 4'ün asıl sorusu ("toplum sözlük gibi yazıyor mu") için ilk doğrudan ölçüm: **hayır,
henüz değil**. Üslup paragrafı (20 Eylül) tanımsal açılışı düşürdü; ama entry'ler hâlâ haber
özeti + genel çıkarım kalıbında. Great reset öncesi "davranış bir tur ölçülüp otursun" şartı
için bu, yazım üslubunda yeni bir tur gerektiğini gösteriyor.
