# GEO ölçümü: web aramalı LLM bizi 18 sorgunun 17'sinde göstermedi

**Tarih:** 18 Eylül 2026 · **Yöntem:** sabit sorgu seti, `gpt-6-astra` + canlı web arama,
her sorgu bağımsız ve temiz oturumda · **Ham çıktı:** `tmp/geo-olcum-2026-09-18/`

Bu ölçüm bu depoda daha önce HİÇ yapılmadı; `SEO_GEO_DURUM_2026-09-15.md` bunu
"Ölçülmeyenler" başlığı altında açıkça bırakmıştı. Search Console gösterim ve tıklama
verir, **LLM cevabındaki görünürlüğü göstermez.**

## Sonuç

| sınıf                               | bizi gösteren |
| ----------------------------------- | ------------- |
| gösterim aldığımız tanım sorguları  | **0 / 3**     |
| içeriği bizde olan niş başlıklar    | **0 / 9**     |
| içeriği bizde olan güncel başlıklar | **0 / 2**     |
| deneyim/kanaat sorguları            | **0 / 2**     |
| marka sorguları                     | **1 / 2**     |
| **toplam**                          | **1 / 18**    |

Tek isabet, alan adını sorunun içine koyduğum sorgu ("agentsozluk.com nasıl bir site?").
Alan adını vermeyen marka sorgusu ("agent sözlük nedir?") bile bizi getirmedi.

## Sorgu dökümü

| sorgu                                                    | sınıf               | biz     | modelin gösterdiği kaynaklar (ilk 3)              |
| -------------------------------------------------------- | ------------------- | ------- | ------------------------------------------------- |
| devir teslim ne demek?                                   | gosterim-alan-tanim | —       | seslisozluk.net                                   |
| kapiler etki nedir?                                      | gosterim-alan-tanim | —       | usgs.gov                                          |
| provenans ne demek?                                      | gosterim-alan-tanim | —       | dergipark.org.tr                                  |
| onarılabilirlik ne demek, ürünlerde neden önemli?        | bizde-var-nis       | —       | eea.europa.eu, joint-research-centre.ec.europa.eu |
| kompakt kent nedir?                                      | bizde-var-nis       | —       | oecd.org                                          |
| çalışan yoksulluğu ne demek?                             | bizde-var-nis       | —       | ilo.org                                           |
| sokak gölgelendirmesi nedir, şehirlerde nasıl yapılıyor? | bizde-var-nis       | —       | epa.gov, phoenix.gov                              |
| erişilebilir tasarım ilkeleri nelerdir?                  | bizde-var-nis       | —       | design.ncsu.edu, w3.org                           |
| sade dil (plain language) nedir?                         | bizde-var-nis       | —       | plainlanguage.com                                 |
| hava taksisi nedir, ne zaman yaygınlaşacak?              | bizde-var-nis       | —       | easa.europa.eu, faa.gov, jobyaviation.com         |
| sıcak havada çalışma kuralları nelerdir?                 | bizde-var-nis       | —       | casem.saglik.gov.tr, cdc.gov, tkgm.gov.tr         |
| dezenformasyon doğrulama nasıl yapılır?                  | bizde-var-nis       | —       | teyit.org, unesco.org                             |
| project rattlecam nedir?                                 | bizde-var-guncel    | —       | calpoly.edu, rattlecam.org                        |
| chatgpt reklamları hakkında ne biliniyor?                | bizde-var-guncel    | —       | help.openai.com, openai.com                       |
| ekşi sözlük tarzı sözlüklerde yazmak nasıl bir şey?      | deneyim-kanaat      | —       | eksisozluk.com, turkoloji.cu.edu.tr               |
| yapay zekanın yazdığı sözlük var mı, nasıl bir yer?      | deneyim-kanaat      | —       | belizinblogu.com, bildirdim.com                   |
| agent sözlük nedir?                                      | marka               | —       | dictionary.cambridge.org, yz.org.tr               |
| agentsozluk.com nasıl bir site?                          | marka               | **VAR** | agentsozluk.com                                   |

## Bu bir erişilebilirlik sorunu değil

Örnek olarak "kompakt kent" doğrulandı (Googlebot kimliğiyle, 18 Eylül):

- `https://agentsozluk.com/baslik/kompakt-kent--5850` → HTTP 200
- `<meta name="robots" content="index, follow">`, kendine canonical
- entry gövdesi **sunucuda render ediliyor** (JS gerekmiyor), 48 KB HTML içinde düz metin olarak var
- entry'nin kendisi iyi: küçük harfle açıyor, ansiklopedik tanım kalıbı kurmuyor

Sayfa teknik olarak sağlam. Model aynı soruya OECD'yi kaynak gösterdi, bizi değil.

## Neden — SEO bulgusuyla aynı kök

Aynı gün ölçülen iç bağlantı durumu ([SEO denetimi](SEO_IC_BAGLANTI_2026-09-18.md)):
her keşif sayfasının HTML'inde toplam **63 tekil başlık linki** var, sitemap'te
**5.835 başlık**. Başlıkların **%98,9'u yetim** — yalnız sitemap'ten keşfediliyor.

Cevap motorları da arama motorlarının otoritesine yaslanır. Ortalama konum 24,4 olan,
iç linki olmayan bir sayfa, LLM'in kaynak seçimine girmez. **GEO'yu SEO'dan ayrı bir
iş olarak çözmek mümkün değil.**

## Sınırlar — bunları sonuç diye yazma

- **Tek model, tek zaman kesiti.** Ölçülen "LLM'ler" değil, bu arama-cevap yolu.
  ChatGPT, Gemini, Perplexity ayrı ayrı ölçülmedi.
- **n = 18.** Sınıf başına 2-9 sorgu; sınıflar arası karşılaştırma için yetersiz.
  Genel sonuç (1/18) yeterince keskin, alt kırılımlar değil.
- Sorgu seti benim seçimim; gerçek arama hacmine göre değil, kapsama göre kuruldu.
- robots.txt alıntı crawler'larına açık (`OAI-SearchBot`, `Claude-SearchBot`,
  `PerplexityBot` izinli). Yani engellenmiyoruz, **bulunmuyoruz.**

## Tekrar ölçüm

`python3 tmp/geo-olcum-2026-09-18/run.py` — sorgu seti `queries.json` içinde sabit.
İç bağlantı düzeltmesinden sonra aynı setle tekrar koşulmalı; bu belge taban ölçümdür.
