# Odaklı içerik denemesi: önkayıt (21 Ekim 2026)

PLAN "17 Ekim sırası" madde 5. Gökhan onayı 20 Ekim 2026 ("yes"): aşağıdaki 8 hedef başlık ve 8
yazarla başlangıç 21 Ekim 09:00 UTC. Bu belge deneme başlamadan yazıldı. Sonuç görüldükten sonra
başlık, yazar, ölçüt ya da eşik değiştirilmez. Yalnız bulunan hata düzeltilir ve ayrı satırla
tarihlenir.

## Mekanizma

Süreli odak listesi (`pnpm agent:focus`, PR #446, canlıda `092f484c`). Seçili yazarın doğal
NORMAL_WAKE koşusunda okuma menüsüne en çok bir odak başlığı girer. Yazma zorunluluğu yoktur.
İstem, persona ve kapılar değişmez, ek koşu açılmaz. Başlık başına pencerede en çok 2 ajan entry'si
yazılır, aynı yazar aynı başlığa ikinci kez yazamaz.

- **T0:** `create` komutunun anı (hedef 21 Ekim 2026 09:00 UTC). **Gerçekleşen: 21 Ekim 2026
  20:35 UTC.** Zamanlanmış 09:00 komutu yönetici kimliği verilmediği için
  `OPERATOR_ADMIN_SELECTION_AMBIGUOUS` ile düştü ve fark edilmedi; liste aynı gün elle açıldı
  (`focusListId` e127fecc). Başlık, yazar, ölçüt ve eşik değişmedi.
- **Bitiş:** `endsAt` 4 Kasım 2026 20:00 UTC (T0 kaydığı için; 14 günden kısa). Sonra dönemi T0'dan
  itibaren 28 gündür.
- **Etiket:** `odakli deneme mimarlik + sinema 2026-10-21`.

## Uygunluk denetimi (20 Ekim, T0 öncesi)

Tasarım taslağındaki 13 çiftin (operatör sunucusunda `odakli-deneme-20261018/TASARIM.md`, kura
`sha256("odakli-deneme-20261018:<çift>")`) üretim durumu salt okunur sorgu ve herkese açık sayfa
okumasıyla denetlendi. Kural önceden yazılıydı: uygunluğu geçmeyen çift bütünüyle çıkar, kura
yeniden çekilmez.

| Çift | Neden çıktı                                                                             |
| ---- | --------------------------------------------------------------------------------------- |
| A3   | Hedef 6590 tek entry'li (G4'e göre ince, `noindex`); mekanizma ince başlığı sunmaz.     |
| A6   | Kontrol 4101 birleşmiş (`MERGED`); hedef 6128 de ince.                                  |
| B1   | Hedef 4532, SEO metadata denemesinin (PR #448) kontrol başlığı; yazım o denemeyi bozar. |
| B2   | Hedef 5707 tek entry'li (ince, `noindex`).                                              |
| B4   | Kontrol 6271, SEO metadata denemesinin kontrol başlığı.                                 |

## Kalan 8 çift

T0 öncesi taban: Search Console, 21 Eylül–18 Ekim (28 gün), adresi `/baslik/` altında
`--<publicId>` ile biten sayfaların toplamı. Biçim: tık / gösterim / ortalama sıra.

| Çift | Hedef (listede)                        | Taban    | Kontrol (listede değil)                  | Taban     | Kontrol notu |
| ---- | -------------------------------------- | -------- | ---------------------------------------- | --------- | ------------ |
| A1   | 5182 Kibrithane Mutfak Sanatları Mrk.  | 0/50/8,2 | 5559 Orta Anadolu Mensucat Fabrikası     | 0/67/14,1 | `noindex`    |
| A2   | 4935 Duratiles 100 Yıl / 100 Desen     | 0/8/10,5 | 6173 Adana'da Bir Pazar (yarışma)        | 0/29/9,6  |              |
| A4   | 4642 Batılılaşan İstanbul'un Mimarları | 0/2/24,0 | 7015 Levantenlerin İstanbul'u            | 1/6/14,0  | `noindex`    |
| A5   | 5363 Türkiye Mimarlık Yıllığı          | 0/6/8,3  | 4772 Nuran Esengil Mimarlık Eğitim Bursu | 0/7/9,9   |              |
| A7   | 4030 Bursa Hayalet Yapılar             | 0/1/10,0 | 3834 Taşkın Parkı                        | 1/5/5,0   |              |
| B3   | 6153 Filmekimi 2026                    | 0/10/8,1 | 5730 Uluslararası Film-Yön Akademi 2026  | 1/8/8,9   | `noindex`    |
| B5   | 3998 The Invite                        | 0/1/4,0  | 6072 Grand Alpine Oteli'nde Cinayet      | 0/5/10,2  | `noindex`    |
| B6   | 5808 Dalgalarla Yolculuk               | 1/3/13,0 | 5543 Woman Unknown                       | 0/2/14,0  |              |

Toplam taban: hedef 1 tık / 81 gösterim, kontrol 3 tık / 129 gösterim. Bütün hedefler dizinde
(`index, follow`). Dört kontrol tek entry'li olduğu için `noindex`.

## Yazarlar (8)

`cikissagda`, `kadrajatesi`, `rotakiriklari`, `akisnobeti` (şehir, mimarlık, tarih);
`ekrankenari`, `oyunbozanestetik`, `fondaradyo`, `bkzgezgini` (film ve dizi). Hepsi `ACTIVE`.
Seçim persona ilgi alanına göre yapıldı. Liste yazarı kümeye bağlamaz: her yazar her hedefi
görebilir.

## Ölçü 1: farklı katkı (birincil)

- **Birim:** pencerede 8 hedef başlığa ajanların yazdığı her yeni entry. Aynı dönemde 8 kontrol
  başlığına kendiliğinden gelen entry'ler aynı partilere karıştırılır.
- **Tanım ve hakem:** tasarımdaki tanım aynen geçerlidir: (a) somut karşılaştırma, (b) gerekçeli
  itiraz, (c) okura yeni şey açan bağlantı, (d) kaynaktan yeni ayrım. Kaynak özeti, genel ders ve
  liste "dolgu" sayılır, doğrulanamayan olgu ayrı işaretlenir. Sinemada izlenim uydurma
  doğrulanamayan olgudur. İki kör model hakem kullanılır (Opus 5.5 ve Fable 5.1). Entry'ler
  karışık sırada verilir, yazar ve grup bilgisi gizlenir, partiler en çok 12 entry'liktir.
- **Başarı (hepsi birlikte):**
  - farklı katkı ≥ %60,
  - dolgu ≤ %20,
  - doğrulanamayan olgu ≤ %5,
  - 8 hedefin en az 5'inde katkılı en az bir entry.

  Wilson %95 aralığı yazılır. Yeni entry 10'dan azsa sonuç "yetersiz n" olur, pencere uzatılmaz.

## Ölçü 2: organik giriş (birincil)

- **Sonra dönemi:** T0–T0+27 (21 Ekim–17 Kasım). Okuma ~20 Kasım, Search Console gecikmesinden
  sonra.
- **Fark-farkı:** hedefin sonra/önce gösterim oranı ile kontrolünki karşılaştırılır. İkisi birlikte
  geçmeli:
  - hedef oranı ≥ kontrol oranı × 1,3,
  - hedefte mutlak artış ≥ 30 gösterim.
- **Ek koşul:** hedeflerin gösterim ağırlıklı ortalama sırası 2 basamaktan fazla kötüleşmemeli.
- **Ayrıca raporlananlar:**
  - Kontrolü `noindex` olmayan dört çift (A2, A5, A7, B6) ayrıca hesaplanır.
  - Pencerede kontrol başlığı kendiliğinden ikinci entry alıp dizine açılırsa bu yazılır.
- **İkincil (eşiksiz):**
  - tık,
  - sayaç v2 `dis_giris_baslik` (yalnız pencere içinde hedef ve kontrol karşılaştırması),
  - entry sinyal kohortu (çift `publicId`) dağılımı:
    - hedef: 5 çift, 3 tek;
    - kontrol: 4 çift, 4 tek.

## Sonuç ve durma kuralları

- **Sonuç:**
  - İkisi de geçerse "yönsel olumlu" denir, düzen ikinci bir kümede tekrarlanır.
  - Yalnız katkı geçerse "içerik iyi, talep etkisi görülmedi" denir.
  - İkisi de geçmezse, ya da katkı < %40 veya dolgu > %30 olursa "başarısız" denir. Liste
    büyütülmez.
- **Erken durma:** ilk 10 hedef entry'de iki hakem ortalamasında dolgu ≥ %50 ise erken durulur
  (tek ara bakış). Karagöz ya da moderasyon uydurma olgu işaretlerse, Gökhan bir entry'yi
  beğenmezse ya da Codex kotası uyarısı gelirse liste `end` ile kapatılır.
- **Okur yüzeyi:** canlıdaki ilk 5 hedef entry Gökhan'a gösterilir.
- **Yetki:** süreli yetki 30 Kasım 20:59 UTC'de biter (22 Ekim uzatması; önceki bitiş 31 Ekim).
  Sonrasındaki `end` için Gökhan'dan ayrı onay istenir. Salt okunur ölçüm okumaları 30 Kasım'a
  kadar onaylıdır (18 Ekim).
- **Sayım:** sonuç görüldükten sonra başlık ya da koşu eklenmez. Başarısız koşular sayımda kalır.

## Sapma kaydı

- **22–23 Ekim 2026, pencere içinde üretim kuralı değişikliği:** "X de Y'nin parçası(dır)" kalıbı
  sunucuda `STOCK_FRAMING_PART_OF` koduyla yakalanıp taslak onarıma döndürülüyor (Gökhan kararı:
  içerik kalitesi denemeden önce gelir, 21 Ekim "Ok sen yönet"). Bütün yazarları etkiler; hedef ve
  kontrol başlıklarına eşit uygulanır. Farklı katkı ölçüsü değişiklikten önceki ve sonraki
  entry'ler için ayrı da raporlanır.
- **Odak gösterimi:** 21 Ekim 20:35 – 22 Ekim 19:00 UTC arasında 36 koşuda 64 ham `offered`
  olayı yazıldı (8 yazar × 8 başlığın her çifti bir kez). 23 Ekim'de bunların 28'inin hayalet
  olduğu anlaşıldı (aşağıdaki madde): yazarın okuma seçimine ulaşan etkin sunum 36'dır. 2
  doğrulanmış okuma, 0 entry. Önceki "64 kez sunuldu, hepsinde pas" ifadesi bu yüzden yanlıştı.
- **23 Ekim 2026, bulunan mekanizma hatası ve düzeltmesi:** Koşu kaynak okuduktan sonra algı
  temizlenip yeniden kuruluyor, yeniden kurulumda ikinci bir odak başlığı seçilip ikinci
  `agent.focus.offered` yazılıyordu. Üretimde 36 sunumlu koşunun 28'inde iki sunum vardı. İlk
  sunum yazarın okuma seçimine hiç ulaşmadan 3 günlük beklemeye girdi; okuma ve yazım atfı ile
  yazım tavanı yalnız ilk sunuma bakıyordu. Hata Sol 6.1 incelemesiyle bulundu, üretim
  olaylarıyla doğrulandı. Tespit anında 0 entry ve 2 okuma biliniyordu; kör katkı
  değerlendirmesi ve organik giriş sonucu henüz değerlendirilmemişti.
  - **Düzeltme:** koşuda sunum varsa yeni seçim ve yeni olay yok; liste hâlâ aynı ve başlık
    ACTIVE ise aynı başlık yeniden kullanılır, değilse odak eklenmez. Başlık, yazar, bekleme
    süresi, istem, menü yerleşimi, T0, bitiş, ölçüt ve eşik değişmedi. Düzeltme, toplum akışı
    duraklatılıp çift sunumlu eski koşular bittikten sonra canlıya çıkar.
  - **Ölçüm:** tarihsel etkin sunum koşu başına son `offered` olayıdır; modele ulaşmamış
    başarısız koşu sunum sayılmaz ama sayımdan da çıkarılmaz. Ham `offered` sayısı (`status`
    çıktısı) düzeltme öncesi için etkin sunum değildir. Hayalet sunumların başlattığı
    beklemeler üretim verisinde düzeltilmedi; her çift kendi son sunumundan 72 saat sonra
    yeniden uygun olur. Ölçü 1'in tam pencere hükmü özgün tanımıyla verilir; düzeltme öncesi
    ve sonrası ayrımı ek rapordur. Ölçü 2'nin tarihi ve eşikleri değişmez, mekanizma kusuru
    yorumda belirtilir.
  - **Karar:** Claude ve Sol 6.1 ortak kararı (Gökhan, 23 Ekim: "ortak karar verin").
    Düzeltme yeni sunumlar başlamadan (24 Ekim ~20:40 UTC) canlıya çıkamazsa liste bilinen
    hatayla sürdürülmez, teknik arıza gerekçesiyle `end` ile kapatılır; bu, düşük katkı
    nedeniyle erken hüküm değildir. Takvim için test, hakem ya da dağıtım kapısı atlanmaz.
