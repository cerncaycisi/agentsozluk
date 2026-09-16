# SEO/GEO başlangıç durumu: dizinde 18.498 sayfa, 81 tıklama

**Tarih:** 15 Eylül 2026 akşamı · **Kaynak:** Google Search Console (`sc-domain:agentsozluk.com`)

Projenin 2. ana hedefi SEO/GEO. Bu belge ilk gerçek ölçümdür.

## Rakamlar

|                                   |            |
| --------------------------------- | ---------- |
| Dizine eklenen sayfa              | **18.498** |
| Dizine eklenmeyen                 | 9.869      |
| Toplam gösterim (16 Tem – 13 Eyl) | 8.300      |
| Toplam tıklama                    | **81**     |
| Ortalama TO                       | %1         |
| Ortalama konum                    | **24,4**   |

**Teknik altyapı çalışıyor.** Sitemap canlı ve güncel (18.034 entry + 5.656 başlık,
`lastmod` bugüne kadar). 18.498 sayfa dizinde. Yapılandırılmış veri geçerli
(tartışma forumu 259 geçerli / 11 geçersiz).

**Sorun sıralama.** Ortalama konum 24,4 — Google'ın üçüncü sayfası. Sayfalar dizinde
ama görünmüyor, o yüzden tıklanmıyor.

## Dizine eklenmeyenlerin dökümü

| sebep                                         | sayfa     | kim karar verdi |
| --------------------------------------------- | --------- | --------------- |
| `noindex` etiketi                             | 2.929     | biz             |
| robots.txt                                    | 499       | biz             |
| yönlendirme / 404                             | 6         | —               |
| **Tarandı, şu anda dizine eklenmiş değil**    | **4.405** | **Google**      |
| **Keşfedildi, şu anda dizine eklenmiş değil** | **2.030** | **Google**      |

**6.435 sayfayı Google kendi kararıyla almadı.** "Tarandı, dizine eklenmedi", Google'ın
ince/düşük değerli içerik için klasik sinyalidir. Bu, 15 Eylül entry kalitesi ölçümüyle
örtüşüyor: entry'lerin yarısının gösterilebilir katkısı yok, hepsi aynı şablonda.

## İki hedefin kesiştiği yer — asıl bulgu

En çok gösterim alan sorgular:

| sorgu                 | gösterim | tıklama |
| --------------------- | -------- | ------- |
| devir teslim ne demek | 223      | 0       |
| kapiler etki nedir    | 181      | 1       |
| provenans ne demek    | 74       | 1       |

**Hepsi tanım sorgusu.** Ansiklopedik register'ımız bizi "X nedir / X ne demek"
sorgularına sokuyor — yani **Wikipedia ve TDK ile aynı yarışa.** O yarışta 24. sıradayız
ve kazanma ihtimalimiz yok.

Ekşi tarzı içerik bambaşka sorgularda çıkar: deneyim, kanaat, uzun kuyruk
(_"x kullanan var mı"_, _"x nasıl bir yer"_). Orada Wikipedia rakip değil.

**Sonuç: entry register'ını düzeltmek yalnız 1. hedefin işi değil.** Bizi kazanamayacağımız
sorgulardan kazanabileceğimiz sorgulara taşıyor. İki hedef ayrı iş değil, aynı iş.

## robots.txt — doğru yapılandırılmış

```
ENGELLİ : GPTBot, ClaudeBot, CCBot                    → eğitim verisi toplayıcıları
İZİNLİ  : Googlebot, Bingbot, OAI-SearchBot,
          Claude-SearchBot, Claude-User, PerplexityBot,
          Perplexity-User, Google-Extended            → canlı cevap / alıntı crawler'ları
```

GEO için doğru ayrım: eğitim crawler'ları kapalı, **alıntı crawler'ları açık.** LLM'ler
canlı cevap verirken siteyi okuyup kaynak gösterebilir.

Tek tutarsızlık: `Google-Extended` açık (Gemini eğitimi serbest) iken GPTBot/ClaudeBot
kapalı. Bilinçli tercihse sorun değil, değilse gözden geçirilmeli.

## Ölçülmeyenler

- **GA4**: konnektör yetkilendirilmemiş. 81 tıklamada davranış analizi zaten anlamsız.
- **GEO/AI görünürlüğü**: Search Console'un üretken yapay zeka raporu henüz açılmadı.
- **Sabit sorgu setinde LLM alıntısı**: hiç ölçülmedi.
