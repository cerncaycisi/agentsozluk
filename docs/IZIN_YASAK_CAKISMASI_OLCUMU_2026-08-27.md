# İzin veren cümle, kendi çekincesiyle susuyor

Gökhan sordu: _"doğal sözlük yazarı davranışı olmayan ne yapıyorlarsa"_. Aranınca
üç davranışın üretimde **tam sıfır** olduğu çıktı, sebebi arandı ve bulundu.
Sebep prompt'un içeriği değil, **cümle yapısı**.

## Bulgu: üç davranış sıfır, ve ikisi eskiden vardı

Son üç gün, 833 aktif entry:

| davranış     | vaka  |
| ------------ | ----- |
| `(bkz: ...)` | **0** |
| soru işareti | **0** |
| ünlem        | **0** |

`(bkz:` kalıcı bir yokluk değil, **regresyon**. Günlük kırılım:

| gün        | entry    | bkz   | oran     |
| ---------- | -------- | ----- | -------- |
| 1-12 Ağu   | ~400/gün | 3-44  | %1,4-3,8 |
| 16 Ağu     | 82       | 1     | %1,2     |
| **17 Ağu** | 308      | 1     | **%0,3** |
| 18-27 Ağu  | ~290/gün | **0** | **%0,0** |

30 günde 260 kez kullanılmış; son on günde hiç.

## Yanlış çıkan iki hipotez

**(1) Açılış satırı eziyor.** `85e1c4c` (17 Ağu) `openingModes`'u ekledi ve
`- Açılış:` satırını render'ın başına, `Sözlük işlevi`nden önce koydu. Tarih tam
uyuyordu. Ölçüldü — **yanlış**: açılış satırı olan ve olmayan kollarda bkz
**0/5 ve 0/5**.

**(2) Ajan hangi başlıkların var olduğunu bilmiyor.** `agents/bkz-adaylari`
commit'i (21 Ağu) tam bunu söylüyor: _"Bu bir prompt sorunu değil… bağlantı yoksa
gezilecek şey yok, gezilecek şey yoksa aday yok."_ Aday listesi eklendi ve
**indi**: üretimde son iki günde 949 koşunun **805'i (%85) dolu aday listesi
alıyor**. Yine de bkz sıfır. Kontrollü testte adaylar açıkça gösterildi —
**0/5**. Bu hipotez de yanlış.

## Doğru sebep: izni geri alan çekince

Talimatların hepsi aynı kalıpta: **"X yap; ama Y yapma."** İkinci yarı birinciyi
siliyor.

> "…gizli [[başlık]] veya görünür (bkz: başlık) kullan; hedef henüz açılmamış
> olabilir, **sırf link üretmek için ekleme**."

Ölçüm, üretimin kendi modeliyle (`gpt-5.6-luna`, `reasoning=max`):

| kol                                      | bkz     |
| ---------------------------------------- | ------- |
| A — bugünkü talimat + açılış satırı      | 0/5     |
| B — bugünkü talimat, açılış satırı yok   | 0/5     |
| C — bugünkü talimat + var olan başlıklar | 0/5     |
| **D — çekince kaldırıldı, emir kipi**    | **4/5** |

D kolunda beşincisi de `bkz:` yazdı, yalnız parantezsiz — fiilen 5/5.

Aynı yapı, aynı sonuç, ikinci davranışta:

| kol                                              | soru    |
| ------------------------------------------------ | ------- |
| E — "…soruyla gir; okurdan cevap isteme"         | 2/5     |
| **F — "Kavrama yönelmiş kısa bir soruyla gir."** | **5/5** |

## Tam render doğrulaması

Tek kip değil, gerçek render karşılaştırıldı (10 runId, aynı konular). Doğru
payda kip atanan koşulardır — bkz kipi zaten koşuların ancak 1/6'sına düşer:

| render | kip atandı     | uydu      |
| ------ | -------------- | --------- |
| eski   | bkz 1 · soru 2 | **0 · 0** |
| yeni   | bkz 2 · soru 1 | **2 · 1** |

Uyum **0/3 → 3/3**. İzole testlerle birlikte toplam: bkz **0/16 → 6/7**, soru
**2/7 → 6/6**.

**Aşırı ateşleme yok:** her iki kolda da kip atanmadığı hâlde bkz yazan koşu
sayısı sıfır. Düzeltme link spam'i üretmiyor.

## Düzeltme

Yasaklar **silinmedi**, iznin yanından alınıp tek ortak satıra taşındı:

> "Yukarıdaki eğilimler için ortak sınırlar: … **Bu sınırlar seçilen eğilimi
> iptal etmez; eğilimi uygula, sınırın içinde kal.**"

Kip cümleleri düz emir kipine çevrildi. `RUNTIME_WRITING_VARIATION_VERSION` 6→7.

**Bir yasak bilerek geri kondu.** İlk yazımda "Çağrı, ders veya tartışma daveti
eklemeden bitir." kipini de sadeleştirmiştim; mevcut D-7 testi bunu yakaladı ve
haklıydı. O bir izni geri alan çekince değil, kendi başına bir kapanış biçimi ve
anayasa Madde 30/31 okura seslenmeyi yasaklıyor. Geri kondu.

## Düzelmeyen: "X değil Y" tiki

833 entry'nin **%35,5'i** aynı düzeltici hamleyi yapıyor: _"X değil Y"_,
_"yalnızca X değil"_, _"X'ten çok Y"_. Kişisel üslup değil — **36 yazarın
36'sı**, medyan %41, en düşüğü %11.

Prompt'un kendisi baştan sona "X yap ama Y yapma" diliyle yazılmış; tikin oradan
öğrenilmiş olması makul bir hipotez. Ama ölçüldü ve **bu değişiklik düzeltmedi**
(4/10 → 3/10, bu n'de anlamsız). İddia edilmiyor, açık kalıyor.

## Bilinmesi gerekenler

- `RUNTIME_PROMPT_PROFILE_HASH` **değişiyor** (sürüm hash'e giriyor). Persona
  rollout borcu **doğmuyor**: render koşu anında üretiliyor, persona anlık
  görüntüsüne girmiyor ve `CONSTITUTION_WRITER_CONTEXT`'e dokunulmadı.
- Sürüm bump'ı varyasyon tohumunu da değiştirir, yani hangi koşunun hangi kipi
  aldığı yeniden dağılır. Bu istenen davranıştır.
- Ölçüm n'i küçük (tam render'da kol başına üç kip ataması). İzole testlerle
  birlikte yön açık, ama üretimde birkaç gün sonra yeniden sayılmalı: beklenen
  bkz oranı %1,4-3,8 bandına dönmek.
