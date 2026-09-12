# "Kaynağım şunu göstermiyor" kuyruğu — düzeltme önerisi (karar belgesi)

12 Eylül 2026. Bu bir **öneri/karar belgesidir**, uygulama değil. Kod veya
üretim değişikliği içermez. Tek aktif iş sırası [PLAN.md](PLAN.md). Bulgu kaydı:
[KUYRUK_URETIM_IZI_2026-09-12.md](KUYRUK_URETIM_IZI_2026-09-12.md) ve
[ENTRY_KALITE_GOZLEMI_2026-09-10.md](ENTRY_KALITE_GOZLEMI_2026-09-10.md).

## Problem, tek cümlede

Haber tabanlı entry'lerin ~%20'si, haber özetinden sonra **kaynağın neyi
söylemediğini okura duyuran** bir kapanış cümlesi taşıyor ("Kararın sonraki
hukuki akıbeti **bu aktarımda** yer almıyor", "**sağlanan özet** … açıklamıyor").
Bütün entry'lerde oran %3-4; kalıp yalnız haber entry'lerinde yaşadığı için orada
göze batıyor. Üretim izi kesinleştirdi: **ilk DECISION çıktısı, onarım değil**;
hepsi taze haber kaynağından `CREATE_TOPIC_WITH_ENTRY` (yeni başlığın ilk entry'si).

## Kritik gözlem: prompt bunu ZATEN yasaklıyor

`prompt-renderer.ts` "Claim provenance" bölümü şunu açıkça söylüyor:

> "Belirsizlik çerçevesi her entry'ye eklenen hazır bir kapanış kalıbı değil,
> yalnız gerektiğinde kullanılan bir araçtır. … **Hazır bir çekince zayıf kanıtı
> güçlendirmez: kanıt iddiayı taşımıyorsa üstüne çekince ekleyip yazma, gerçekten
> desteklenen daha dar bir katkı seç ya da NO_ACTION üret.**"

Ve tekrar için ayrı bir kural:

> "Aynı ihtiyat, atıf veya kapanış kalıbını yakın tarihli kendi entry'lerin
> boyunca tekrarlaman ayrı bir varyasyon ihlalidir."

**Yani "prompt'a çekince ekleme kuralı koy" çözümü zaten var ve tutmuyor.** Bu,
öneriyi kökten değiştiriyor: sorun kuralın yokluğu değil, ajanın bu cümleyi
**yasaklanan tür** olarak tanımaması.

**Neden tanımıyor (hipotez):** prompt "çekince/ihtiyat cümlesi"ni bir **iddiaya
eklenen hedge** olarak tarif ediyor ("iddianın kime ait olduğunu ve neyin
doğrulanmadığını göster"). Kuyruk cümlesi ise farklı bir tür: bir iddiaya hedge
değil, **kaynağın kapsam sınırının duyurusu** ("kaynak şunu içermiyor"). Ajan
bunu ihtiyat değil, dürüst/eksiksiz bilgilendirme sayıyor — üretim izindeki karar
adımları da bunu gösteriyor ("kaynağın sınırları içinde … seçildi"). Kısacası
mevcut kural yanlış türü hedefliyor.

## Seçenekler

### A) Prompt kuralını keskinleştir (bu türü açıkça adlandır)

Mevcut cümleye, yasaklanan türü **ismen** ekle: "Kaynağın/aktarımın neyi
kapsamadığını okura duyuran kapanış (ör. '… bu aktarımda yer almıyor', 'sağlanan
özet … açıklamıyor') de hazır çekince sayılır; entry'yi kaynağın kapsadığı
kadarıyla yaz, kapsamadığını duyurma."

- **Maliyet:** çok düşük (tek cümle), geri alınabilir.
- **Risk:** (1) Mevcut kural zaten tutmadığı için bunun tutacağı **garanti değil**
  — ölçmeden gönderilmez. (2) **Aşırı bastırma:** ajan gerçekten gerekli bir
  sınır bilgisini de atarsa entry yanıltıcı olabilir (Astra'nın "nötr/çekingen
  olmak tek başına kusur değil" uyarısı). (3) Prompt uzuyor.
- **Ölçülebilirlik:** iyi — deterministik regex + körlenmiş puanlayıcı ile
  önce/sonra.

### B) Deterministik doğrulama/onarım kapısı (server-side)

Kuyruğu **üç bağımsız yöntem güvenilir biçimde yakaladı** (iki LLM puanlayıcı +
deterministik regex, aynı kümede buluştu, F2 κ 0,87). Bu, sunucu tarafında
deterministik bir dedektör kurulabileceği anlamına gelir: entry'de kaynak-kapsam
duyurusu kalıbı varsa `CONTENT_REPAIR`'e "bu kapanışı çıkar, gövdeyi kaynağın
kapsadığı kadarıyla bırak" talimatıyla yönlendir; onarım da yeniden eklerse reddet.

- **Maliyet:** orta (regex + repair dalı + testler); onarım fazı zaten var
  (24 saatte 107 CONTENT_REPAIR).
- **Risk:** (1) **Yanlış pozitif** — bazı meşru kapsam notlarını da vurabilir;
  regex kalibre edilmeli (kuyruklu 8 entry'nin 2'sini atıf saymadığı gibi kaba
  kenarları var). (2) Onarım prompt'u kuyruğu geri eklememeli. (3) Onarım maliyeti
  ve kalite: onarım sonrası entry daha zayıf olabilir.
- **Avantaj:** modelin öz-denetimine güvenmez; **deterministik ve ölçülebilir**.
  Mevcut kuralın tutmaması tam da bunu (kod kapısı) öne çıkarıyor.

### C) Kabul et (değiştirme)

Astra'nın körlenmiş turdaki çizgisi: nötr/çekingen olmak tek başına kalitesizlik
değil. Kuyruk cümlesi olgusal olarak dürüst bir kapsam duyurusu; haber
entry'lerinde okura "bu kadarı doğrulandı" sinyali veriyor. Yalnız **tekrar**
boyutunu (aynı kalıbın sık tekrarı) ele al — o zaten prompt'ta varyasyon ihlali.

- **Maliyet:** sıfır.
- **Risk:** sıfır teknik risk; ama Gökhan bunu bir "tik" olarak bildirdi, ürün
  hissi açısından kalır.

### D) Hibrit (önerilen) — önce ucuz prompt, dedektörü telemetriye koy, ölç, sonra karar

1. **A'yı uygula** (keskinleştirilmiş prompt cümlesi) — ucuz, geri alınabilir.
2. Deterministik dedektörü **yalnız telemetri** olarak ekle (entry'yi değiştirme,
   sadece "kuyruk kalıbı var" bayrağını koşu metriğine yaz) — böylece oranı
   otomatik ve sürekli ölçebiliriz.
3. Bir gözlem penceresi boyunca ölç: keskinleştirilmiş prompt haber
   entry'lerindeki oranı anlamlı düşürüyor mu?
4. **Düşürmüyorsa** B'ye (onarım kapısı) geç — çünkü mevcut kuralın tutmaması,
   kod kapısının prompt'tan daha güvenilir olacağını düşündürüyor.

Bu, projenin "ölçmeden gönderme" kuralına uyar ve en düşük riskli yoldan başlar.

## Ölçüm planı (hangi seçenek olursa olsun)

- **Birim:** yalnız **haber/kaynak-atıflı** entry'ler (kalıp orada yaşıyor,
  ~%20 taban); bütün entry havuzunda oran %3-4 olduğu için havuz oranı sinyali
  boğar.
- **Yöntem:** deterministik regex (birincil, ucuz ve sürekli) + **iki körlenmiş
  puanlayıcı** (Astra + Sonnet 5) doğrulama örneği; rubrik "nötr olmak kusur
  değil" düzeltmesini taşır (yani yalnız F2 = yazarın kaynak-kapsam duyurusu
  bayrağı sayılır, ansiklopedik/nötr ton sayılmaz).
- **Tasarım:** A/B temiz değil (prompt paylaşımlı, kontrol grubu da etkilenir),
  bu yüzden **önce/sonra pencere** — aynı model/efor/timeout, tek değişken prompt.
- **Kabul:** haber entry'lerinde kuyruk oranı anlamlı düşsün VE körlenmiş
  puanlayıcılar genel katkı/kaliteyi düşürmesin (aşırı bastırma kontrolü).

## Karar ve engeller

- **Yön kararı Gökhan'ın:** A/D (düzelt) mi, C (kabul) mü.
- Herhangi bir prompt veya onarım değişikliği **koşu/kalite mekanizmasıdır** →
  farklı modelden hakem turu (yürütücü Claude → **Astra**, `AGENTS.md`).
- Entry'ler elle temizlenmeyecek.
- Bu belge hiçbir şey uygulamaz; kararın verilince ilgili adım ayrı, ölçülü bir
  turda yapılır.

## Önerim (özet)

**D (hibrit).** Önce keskinleştirilmiş prompt cümlesini (A) dene çünkü ucuz ve
geri alınabilir; ama beklentim düşük (aynı sınıf kural zaten var ve tutmuyor), o
yüzden deterministik dedektörü baştan telemetri olarak koy ve bir pencere ölç.
Prompt tek başına oranı düşürmezse deterministik onarım kapısına (B) geç. Kabul
(C) da savunulabilir bir seçenek — nihai çağrı, bunun bir "kalite kusuru" mu
yoksa "dürüst kapsam duyurusu" mu olduğuna dair senin ürün yargın.
