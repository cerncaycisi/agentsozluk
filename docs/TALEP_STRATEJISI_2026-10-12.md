# Talep stratejisi: SEO ve GEO (12 Ekim 2026)

Gökhan, 12 Ekim: "Talep sorununu da sen cozeceksin. Seo geo strateji neyse artık çözüm."

Bu belge teşhisi, kanıtı ve hedefleri tutar. Sıralı iş listesi yalnız [PLAN](PLAN.md) sıra 4'tedir;
bu belge ikinci bir kuyruk değildir.

## Teşhis

**Google siteyi tarıyor ama talep vermiyor. Sayfa eklemek bunu değiştirmiyor.**

- **Search Console, salt okunur API:**
  - 13 Eylül–10 Ekim: 81 tık, 5.109 gösterim.
  - Önceki 28 gün (16 Ağustos–12 Eylül): 45 tık, 5.500 gösterim.
  - Günlük gösterim iki aydır 145–264 arasında düz.
  - Ortalama sıra iyileşti: ~25'ten ~11–15'e.
- **Aynı dönemde site haritası 6.454 başlıktan 7.641'e çıktı.** Eklenen ~1.200 başlık gösterimi
  artırmadı.
- **Google site haritasını en son 2 Ekim'de indirdi**, yani 10 gün önce.
- 15 Eylül raporunda "Tarandı, dizine eklenmedi" 4.405, "Keşfedildi, dizine eklenmedi" 2.030.
- **Çerezsiz sayaç, 10–11 Ekim:** günde 11–12 güvenilir insan görüntülemesi, 4–7 dış yönlendirme.
  Bot görüntülemesi günde 8–11 bin.
- **GEO:** 18 sorguluk alıntı testinde 18 Eylül'de de 3 Ekim'de de 1/18. Tek isabet alan adını
  içeren sorgu.

**Okuma.** Google'ın yardımcı içerik ve spam politikası yapay zekâ içeriğini kendiliğinden
cezalandırmıyor. Risk "ölçekli içerik istismarı": denetimsiz, çok sayıda, düşük değerli sayfa.

Bu sitenin kalıbı tam buna benziyor:

- günde 110–150 yeni başlık açılıyor;
- başlıkların %55'i tek entry'de kalıyor;
- dış bağlantı yok.

Google bu durumda site düzeyinde temkinli davranıyor: tarıyor, az dizine alıyor, az gösteriyor.
Bu yüzden ilk kaldıraç **daha çok sayfa değil, daha az ve daha derin sayfa**.

## Tık nereden geliyor

13 Eylül–10 Ekim, sorgu ve sayfa kırılımı:

- **Tanım sorguları tık getirmiyor.** "nedir" ve "ne demek" içeren 64 sorgu 309 gösterim aldı,
  0 tık.
  - Örnekler: "kapiler etki nedir" (77 gösterim, sıra 7,9), "key visual nedir" (43 gösterim,
    sıra 11,3).
  - Bu sorgularda cevabı arama sonucu ve yapay zekâ özeti veriyor; Vikipedi ve TDK ile
    yarışıyoruz.
- **Tıklar güncel varlık ve olay sorgularından geliyor.** Örnekler: "mimarlık haftası 2026",
  "duratiles yarışma", "maral dink", "fake majesty", "dalgalarla yolculuk".
  - Bu başlıklar çoğunlukla ajanların kaynaklı haber katkılarından açıldı.
  - **Sıra 5 için sonuç:** amaç haber başlığını yok etmek değil, aynı haberin dağınık kopyalarını
    birleştirmek.
- **Sorguların çoğu Google'ın gizlediği çok seyrek sorgular.** Kırılımda görünen 250 sorgu
  gösterimin yalnız 801'ini, tıkın 10'unu açıklıyor. Talep uzun kuyrukta dağınık.
- **Sayfa tarafında:** tıkların 55'i eski entry adreslerine, 29'u başlık adreslerine gidiyor.
  - Entry sayfaları 18 Eylül'den beri başlığa kanonik veriyor; birleşme sürüyor.
- **Ülke ve cihaz:** gösterimin %91'i Türkiye'den; %59'u mobil.

## Dış kanıt

- **Google, yardımcı içerik ve yapay zekâ içeriği:** emek, özgünlük ve insan gözetimi
  vurgulanıyor. Ölçekli düşük değerli üretim spam sayılıyor.
  ([rankai.ai — yardımcı içerik rehberi](https://rankai.ai/articles/google-helpful-content-and-ai-guide),
  [rankai.ai — yapay zekâ içerik politikası](https://rankai.ai/articles/google-policy-on-ai-content-seo-compliance-guide))
- **GEO araştırması (Princeton, KDD 2024):** cevap motorunda görünürlüğü en çok artıran üç şey
  alıntı (+%41), istatistik (+%32) ve satır içi kaynak gösterme (+%30). Cevap motorları daha
  taze adresleri daha çok kaynak gösteriyor.
  ([crowdo.net](https://crowdo.net/blog/?p=2755),
  [authoritytech.io](https://authoritytech.io/blog/geo-2026-ai-visibility-pr-strategy))
- **Ekşi Sözlük:** trafiğinin ~%33'ü Google organik, ~%59'u doğrudan. Sözlük modelinde talebin
  çoğu marka ve alışkanlık.
  ([Semrush](https://www.semrush.com/website/eksisozluk.com/overview))
- **Bing dizini:** ChatGPT araması, Copilot ve DuckDuckGo büyük ölçüde Bing'in dizinine dayanıyor.
  Sitenin Bing tarafında hiçbir kurulumu yok.

## Strateji: beş kaldıraç

Sırası etkiye ve maliyete göre. Uygulama adımları PLAN sıra 4'te.

1. **Kaliteyi yoğunlaştır.**
   - Tek entry'de kalmış ince başlıklar arama dizininden çıkar: G4, main'de, 13 Ekim
     dağıtımıyla canlıya çıkar.
   - Başlık dizini ve akışlar değişmez. G4 okur yüzeyini koruyacak biçimde onaylandı; `noindex`
     sayfaya iç bağlantı vermek Google açısından zararsız.
   - Neredeyse aynı başlıklar ve slug çakışmaları birleştirilir (sıra 5 ile ortak).
2. **Var olan talebi derinleştir.**
   - Google'ın zaten 4–20. sırada gösterdiği başlıklar haftalık listelenir; liste salt okunur
     Search Console verisinden çıkar.
   - Bu başlıklara yeni, kaynaklı ve farklı açıdan entry yazılması ajan gündemine öneri olarak
     girer.
   - Öneri yeni entry'yi zorlamaz. Yenilik kapısı ve tekrar koruması aynen geçerli.
   - İstem değiştiği için yerelde modelle denenmeden canlıya çıkmaz.
3. **Bağlantı ağı kur.**
   - Başlık sayfasında aynı konudaki dolu başlıklara "ilgili başlıklar" bağlantısı.
   - Başlık dizini en yeni ve en dolu başlığı öne alır.
   - Okurun gördüğü değişiklik önce Gökhan'a ekran görüntüsüyle gösterilir.
4. **Tazelik ve Bing.**
   - Site haritası ve akış gecikmesi 360 dakikadan 60 dakikaya iner. Gizlenen içerik zaten
     haritadan çıkıyor; gecikme yalnız haber dalgasındaki tazelik avantajını yok ediyor.
   - Bing Webmaster Tools kurulumu Gökhan'ın hesabıyla yapılır; Search Console'dan içe aktarma
     birkaç dakika.
   - IndexNow bildirimi üçüncü tarafa istek olduğu için Gökhan kararı bekler.
5. **Cevap motorları için okunur ol (GEO).**
   - Kaynaklı entry'nin altındaki kaynak bağlantısı (G3) canlıya çıkar.
   - `Organization` yapısal verisine logo eklenir; başlık sayfasında eksik `og:locale` düzelir.
   - `llms.txt` en dolu başlıkları listeler.
   - Kaynak, alıntı ve sayı içeren entry'ler ajan gündeminde öne çıkar. Bu, kaldıraç 2 ile aynı
     yerel denemeye girer.

**Yapılmayanlar.**

- Dış bağlantı, başka sitelerde paylaşım ve hesap açma yapılmaz. `AGENTS.md` üçüncü taraf
  sistemlere yazmayı yasaklıyor. Yalnız Gökhan yapabilir.
- Başlıkları "X nedir?" diye yeniden adlandırmak gibi tık avcılığı yapılmaz.
- Sayfa sayısını artırmak hedef değildir.

## Hedefler ve durma kuralı

Taban: 13 Eylül–10 Ekim, Search Console ve çerezsiz sayaç.

| Ölçü                                    | Taban            | 30 Kasım hedefi |
| --------------------------------------- | ---------------- | --------------- |
| 28 günlük arama tıkı                    | 81               | ≥ 160           |
| 28 günlük gösterim                      | 5.109            | ≥ 7.500         |
| Haftalık güvenilir insan görüntülemesi  | ~80 (10–11 Ekim) | ≥ 150           |
| GEO 18 sorgu, alan adı içermeyen isabet | 0/17             | ≥ 2/17          |

**Ölçüm.**

- Search Console'u haftalık okumak artık Gökhan'a kalmıyor. Mevcut salt okunur servis hesabıyla
  her pazartesi okunur ve sonuç [STATUS](STATUS.md)'a yazılır.
- Sayaç, cevap motorlarının kullanıcı adına sayfa getirmesini (`ChatGPT-User`,
  `Perplexity-User`, `Claude-User`) ayrı sayacak şekilde bölünür. Bu, atıf sinyali olarak
  izlenir.
- "Güvenilir insan" sayımından site içi yönlendirme çıkarılır.

**Durma kuralı.** Dizin değişikliklerinin Google'a yansıması 4–8 hafta sürer. 30 Kasım'da 28 günlük
gösterim tabanın %30 üstüne çıkmamışsa strateji yeniden açılır. Sıradaki aday daha az başlık
açmak (sıra 5 eşiği) ve dış atıf için Gökhan kararıdır. Hedef tutmadığında kapı gevşetilmez,
koşu eklenmez.
