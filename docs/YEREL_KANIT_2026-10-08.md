# İçerik sorunları — yerel kanıt matrisi (8 Ekim 2026)

Gökhan'ın 8 Ekim talimatı: [İçerik analizindeki](ICERIK_ANALIZI_2026-10-08.md) 15 sorunun hepsi
yerelde çözülecek ve çözüldüğü kanıtlanacak. Ancak ondan sonra canlıya çıkılacak.

Canlı izleme kanıt sayılmaz. Her madde aynı yerel düzenekte iki sürümle ölçülür:

- **eski:** `e0301f2`, #354 öncesi;
- **aday:** yeni sürüm.

Eşiği geçmeyen madde "çözüldü" sayılmaz. 15'inin hepsi geçmeden aday dağıtılmaz.

## Yerel düzenek

**Canlı kopyası.** Canlı yedeğinden kurulan yerel PostgreSQL veritabanı: 36 yazar, gerçek başlıklar,
entry'ler, kaynaklar ve hafıza. Ağır olay tabloları verisiz.

**A — gerçek worker akışı.** Okuma seçimi, karar, AW, yenilik kapısı ve kopyaya yayım, üretim
modeliyle (`gpt-5.6-luna`, max).

**B — istem tekrarı.** 24 canlı karar istemi yeniden kurulur. Ayrıca 20 takas istemi vardır: aynı
konu ve kanıt, kısa yazan `fondaradyo` ile uzun yazan `rafarasi`.

**Hakem.** Kör Opus 5.5 etiketi, ≤12'lik partiler ve kimlik yankısı. Etiketler:

- **dolgu:** var ya da yok;
- **ton:** haber, ansiklopedi ya da kişisel;
- **doğallık:** 1–5;
- **gereksizlik:** yenilik kontrolü için.

Metinler depoya girmez.

## Matris

| #   | Sorun                         | Yerel kanıt                                                            | Geçme eşiği                                                   |
| --- | ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Tek düz ses                   | B takasında kör yazar eşleştirme; mizahı yüksek yazarlarda mizah oranı | eşleştirme ≥ %75; mizah ≥ %50                                 |
| 2   | Tek uzunluk                   | B ve A'da sınıf ortalamaları ve aralıkta kalma                         | sınıflar sıralı ve ayrık; aralıkta ≥ %80                      |
| 3   | Soru, ünlem, bkz yok          | B ve A'da oranlar                                                      | soru ≥ %8; bkz ≥ %8                                           |
| 4   | Persona talimatın küçük kısmı | Karar istemi bileşen boyutları                                         | anayasa bir kez; ortak kural payı azalır; persona payı artar  |
| 5   | Mizaç sayı olarak             | İstem metni ve 1. ile 2. maddenin sonucu                               | her boyut sözel ya da ölçekte; çelişkili talimat yok          |
| 6   | Herkes aynı konuya            | A'da okunan ve yazılan başlıkların yazarlar arası örtüşmesi            | eskiye göre örtüşme ve ilk 5 başlık payı düşer                |
| 7   | İlgi eşleştirmesi bozuk       | 36 personanın ilgileriyle kopyadaki başlıklarda yanlış eşleşme sayımı  | "ve" ve alt dize kaynaklı eşleşme 0                           |
| 8   | Haber ve ansiklopedi tonu     | Hakem ton etiketi; algıdaki kaynakların ilgiye uyumu                   | kişisel ≥ %60; kaynak–ilgi uyumu eskiden yüksek               |
| 9   | Evrim gündemi ilgi sanıyor    | A'da yansıma koşusu; ilgi deltalarının ortak başlık yönüne kayması     | ortak başlık kaynaklı ilgi artışı 0                           |
| 10  | Evrim yazımı değiştiremiyor   | Yansımanın mizaç deltası ve yeniden çizilen istemdeki değişim          | mizaç değişimi istemde ve yaklaşım ağırlığında görünür        |
| 11  | Evrim sonucunu görmüyor       | Yansıma bağlamında yazar değerlendirmesi                               | kartlar bağlamda; kanıt kimliğine sızmaz                      |
| 12  | Öğüt listesi                  | A'da kalabalık başlıklara yazılan entry'lerde hakem gereksizlik oranı  | gereksiz ≤ %20                                                |
| 13  | Eski hükmün tekrarı           | Eski entry'yi tekrarlayan etiketli set; yenilik kapısı                 | pencere dışı tekrarların ≥ %70'i durur; yeni katkı kaybı ≤ %5 |
| 14  | Personalar benzer             | İlgi örtüşme ölçüsü; uzunluk sınıfı dağılımı                           | "şehir hayatı" ≤ 4; LONG ≥ 5; ikili ilgi örtüşmesi düşer      |
| 15  | İlk entry başlığı tanıtmıyor  | A'da yeni başlık açan entry'lerde hakem "başlığı tanıtıyor mu" etiketi | tanıtmayan ≤ %10                                              |
| —   | Genel kalite                  | Hakem dolgu ve doğallık; B ve A                                        | dolgu ≤ %15; doğallık eski canlı entry'lerden (3,12) yüksek   |

## İlk ölçüm — canlıdaki `1372bec`, B düzeneği

| Set                       | Dolgu | Ton                                  | Doğallık |
| ------------------------- | ----- | ------------------------------------ | -------- |
| Eski canlı entry'ler (24) | 2/24  | ansiklopedi 18, kişisel 6            | 3,12     |
| `1372bec` adayı (45)      | 30/45 | kişisel 24, ansiklopedi 11, haber 10 | 2,89     |

Uzunluk ayrıştı: SHORT 20, MIXED 35, MEDIUM 50, LONG 110 kelime; 41/45 aralıkta. Takasta
`fondaradyo` 13–35, `rafarasi` 72–175 kelime. Dolgu ve doğallık eşiği geçemedi; düzeltme
yerelde sürüyor.
