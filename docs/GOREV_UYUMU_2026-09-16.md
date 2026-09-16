# Görev uyumu: çıplak/üretim farkını görev değil tarz talimatı açıklıyor

**Tarih:** 16 Eylül 2026 · Astra'nın 16 Eylül itirazına cevap

## İtiraz

Astra: _"Çıplak model belirlenmiş başlığa yazarken normal ajan başlık/eylem seçiyorsa,
%42→%4 farkı yalnız prompt yüküne bağlanamaz."_

Haklıydı: çıplak ablasyonda modele başlık VERİLMİŞTİ, üretim ajanı ise başlığı ve eylemi
kendi seçiyor. Bu deney o farkı kapatır.

## Tasarım

Üç kol, `gpt-5.6-luna` max, 8'er tekrar. Üretim ajanının gördüğü haber maddelerinin aynısı
malzeme olarak verildi.

| kol | görev                                 | tarz talimatı |
| --- | ------------------------------------- | ------------- |
| G1  | başlık **verildi** (eski çıplak test) | var           |
| G2  | başlığı **kendi seçiyor**             | var           |
| G3  | başlığı **kendi seçiyor**             | **yok**       |

## Sonuç

Başlıktan bağımsız ölçütle (ilk cümle bir kavramı tanımlıyor mu + büyük harfle açılış):

| kol                      | tanım kuruyor | büyük harfle açılış |
| ------------------------ | ------------- | ------------------- |
| G1 başlık verildi + tarz | %0            | %0                  |
| G2 kendi seçti + tarz    | %12           | %12                 |
| G3 kendi seçti, tarz YOK | **%38**       | **%88**             |

**Görev farkı açıklamıyor.** G1→G2 farkı küçük; model kendi başlığını seçtiğinde de doğal
yazıyor.

**Asıl işi tarz talimatı yapıyor.** G2 ile G3 arasındaki tek fark odur ve sonuç ikiye katlanır.

## Çürütülen hipotez: "haber bağımlılığı register'ı bozuyor"

15 Eylül'de kendi bilgisinden yazınca kalite %95, haberden %32 ölçülmüştü ve bunu nedensel
okumuştum. Bu deney onu çürütüyor: **aynı haber malzemesinden doğal entry yazılabiliyor.**

Aynı malzeme, iki kol:

> **G2 (tarz talimatlı):** "çalışırken maaş yetmiyor, emekli olunca maaşın yüzde 69,1'ini
> alıyorsun. oecd ortalaması yüzde 52 olduğuna göre istatistiksel olarak emeklilikte daha
> zenginiz. keşke bu oran market kasasında da geçerli olsa."

> **G3 (tarz talimatı yok):** "Çalışırken kazanılan gelirin emeklilikte ne kadarının
> korunabildiğini gösteren oran. Türkiye'de ortalama gelirli bir çalışan için yüzde 69,1
> olarak açıklanması, OECD ortalaması olan yüzde 52'nin üzerinde umut verici bir tablo
> çiziyor."

Eksik olan haber değil, tarz talimatı.

## Ölçüt notu — eski ölçüt burada başarısız oldu

Birincil ölçütümüz ("entry, başlığın ilk kelimesini ilk üç kelimesinde tekrar ediyor mu")
bu deneyde **G2 ve G3 için de %0** verdi, hâlbuki G3 entry'leri açıkça tanım kuruyor.
Sebep: model kendi seçtiği başlıklar uzun ("türkiye'de emeklilikte gelir ikame oranı") ve
entry o kelimeyle başlamıyor.

**Ölçüt başlığa bağımlı ve uzun başlıklarda çalışmıyor.** Bu deneyde başlıktan bağımsız
ikinci bir ölçüt kullanıldı. Ön kayıttaki birincil ölçüt yalnız kısa başlıklı kollar için
geçerli sayılmalıdır.

## Sınırlar

- Kol başına **n=8**. Küçük; yön gösterir, kesinlik vermez.
- Çıplak model koşuldu: bizim şema, anayasa, kanıt aparatı ve perception yok. Sonuç üretim
  sistemine doğrudan taşınamaz.
- Tek malzeme seti kullanıldı (emeklilik, havacılık, satın alma, mimari yarışma). Konu
  çeşitliliği dar.

## Açık kalan soru

Aynı tarz talimatı **üretim sisteminin içinde** register'ı değiştirmiyor: küçük harfi %0→%100
yaptı ama tanımla açış %25-48'de kaldı. Neden çalışmadığı, koşmakta olan kural × bağlam
taramasının (`docs/DENEY_ONKAYIT_2026-09-16.md`) sorusudur.
