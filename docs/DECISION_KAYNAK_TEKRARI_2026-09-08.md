# Kaynak sadakati ve özgünlük — eşlenmiş tekrar, 8 Eylül 2026

[PLAN.md](PLAN.md), Sıra 5 / kilitlenen sıra 1'in odaklı takip kaydıdır.
Önceki [altı vakalık taramadaki](DECISION_YEREL_KALITE_2026-09-08.md) özgünlük
FAIL korunur; bu parti onun yerine geçmez. Yeni bir aktif iş kuyruğu değildir.
Bu tur üretim erişimi, dağıtım veya runtime kodu değişikliği içermez.

## Sonuçtan önce sabitlenen tasarım

- Aday `7a945248c373831cd87fb72acf8e729b0daa673d`, eski kurucu
  `7134a04c5699b5ac59a585fff120b9ce93868eb1`. Aday runtime kodu Opus 5'in
  daha önce incelediği `c08052e` ile aynı.
- Önceki `supported` vakasının kaynak, okunan entry, runId, tarih ve yetkileri
  aynı. Seed persona 0 `katmanizci` ve 5 `akisnobeti` seçildi: yazılım mimarisi
  ve sistem mühendisliği ilgileri sonuç görülmeden seçim gerekçesi oldu.
- **2 persona × 3 tekrar × 2 kol = 12 çağrı.** Her persona içinde tekrarların
  prompt'ları bayt özdeş; runId de sabit. Model örnekleme seed'i sabitlenmedi.
  Katman İzci'nin eski prompt'u ilk taramadaki eski prompt'la da bayt özdeş.
- Gerçek eski/yeni kurucularla altı çiftin her birinde yalnız **3.991 UTF-16
  birimi / 4.391 UTF-8 bayt** çıkarıldığı, kalan metnin ve çıktı şemasının aynı
  olduğu assert ile doğrulandı. Algı alanı veya kaynak gövdesi kesilmedi.
- Eski/aday boyutları Katman İzci'de **40.979 / 36.988**, Akış Nöbeti'nde
  **40.996 / 37.005** UTF-16 birimi. Bunlar kısa sentetik bağlamlardır;
  canlıdaki büyük algı dağılımını temsil etmez.
- Aynı CLI ayarları: istek `gpt-5.6-luna/max`, 480 saniye/çağrı, en fazla iki
  eşzamanlı süreç. İlk çift sağlayıcı kontrolü; sonra sabit kuyrukta boşalan yer
  hemen doldurulur. Persona ve kol önceliği dönüşümlü; çiftin iki çağrısının
  aynı anda başlaması garanti edilmez. Süre ve önbellek yalnız betimseldir.
- Proje dışında boş çalışma dizini, read-only sandbox, kapalı shell/web/ajan
  araçları; kullanıcı config/rules alınmaz. Otomatik tekrar, onarım, model
  değiştirme, AW veya server action yok. Sağlayıcı/araç hatası yeni çağrıları
  durdurur; içerik hatası sonuç olarak tutulur.
- CLI kullanım sayaçları uygulama prompt'unun token sayısı değildir.
  JSON olayları sunucu model adını ayrıca döndürmez; raporlanan model/effort
  CLI isteğinin ayarıdır. Bu yerel ortam üretimin Linux bwrap ortamı değildir.

Dondurulmuş protokol SHA-256:
`6198351ea1fe014408f7aea6393618ca5da39101b52cad8df723fd0b8d889ac9`.
Çağrılardan önce yazılmış manifest SHA-256:
`e915df0a7d70c04af0f16c843aca2cc5777ba9370fed7304019e02e8bd68d952`.

## Değerlendirme ve karar sınırı

Kaynağa sadakat ve özgünlük ayrı PASS/CONCERN/FAIL etiketleri alır. Entry
üretilmezse NO_ENTRY yazılır; sessizlik olumlu katkı gibi sayılmaz. Kaynağın
sabit yük, kurgusallık ve ölçüm sınırları çarpıtılmamalı; ölçülmemiş hız/maliyet
üstünlüğü uydurulmamalıdır. Her rakamın tekrarı zorunlu değildir; atlama yanlış
genelleme yaratmıyorsa hata sayılmaz.

Mevcut TTL tanımına bağımsız örnek, mekanizma, karşılaştırma veya çekince eklemek
meşrudur; yeni bilimsel bilgi icat etmek gerekmez. Doğru bir özet de yeni sözlük
işlevi taşıyabilir. Kaynak cümlelerini büyük
ölçüde aynen taşıyıp yalnız giriş eklemek özgünlük sorunudur. Terim, sayı ve
özel ad örtüşmesi veya işaretlenmiş meşru alıntı tek başına hata değildir.

Türkçe harf normalizasyonuyla en uzun tam ardışık sözcük örtüşmesi ve en az
dört sözcüklük tam dizilerin kapsadığı gövde konumları iki kola aynı betikle
hesaplanır. Bunlar betimsel ölçülerdir; otomatik kalite/intihal eşiği değildir.
Tam JSON, gerçek runtime parser/katalog ve fixture hedef/sahiplik kontrolünden
geçer. Kör hakem, tam public action/body/kanıt grubunu kaynakla karşılaştırır;
günlük beyanından içerik kalitesi çıkarmaz.

A/B eşlemesi bu partinin tamamında sabittir. Gerçek kol, önceki sonuçlar,
prompt farkı/boyutu ve süreler hakeme verilmez. Hakemden global p-değeri veya
eşdeğerlik hesabı istenmez; altı çift bunu kanıtlamaz.

Parti sonunda adaya özgü FAIL tekrarlanırsa aday ilerletilmez. İki kolda benzer
kusurlar veya kararsız fark varsa etki ayrıştırılmamış sayılır, GO verilmez ve
aynı aday için kendiliğinden yeni tekrar partisi açılmaz. Adayda FAIL görülmez,
CONCERN kapanır ve olumlu katkı eski kola göre kaybolmazsa yalnız bu dar takip
bulgusu kapanabilir. Canlı ölçüm ve operatör kapıları ayrıca kalır.

## Ölçüm sonucu

Çağrılar **12:12–12:25 TSİ** arasında tamamlandı. Sağlayıcı çağrısı 12/12
başarılı; timeout 0, hata olayı 0, araç olayı 0. Gerçek runtime parse 12/12;
kanıt kimliği ve fixture hedef/sahiplik kontrollerinde hata 0. Her çağrıda
bir public entry önerildi: **12/12**, NO_ENTRY 0. AW veya yayın kabulü ölçülmedi.

| Persona / tekrar | Eski en uzun örtüşme (sözcük) | Aday en uzun örtüşme (sözcük) | Eski yerel süre (sn) | Aday yerel süre (sn) |
| ---------------- | ----------------------------: | ----------------------------: | -------------------: | -------------------: |
| katmanizci / 1   |                             4 |                             6 |              113,648 |              113,094 |
| akisnobeti / 1   |                             8 |                             3 |              134,003 |               81,470 |
| katmanizci / 2   |                             8 |                             9 |               81,501 |              139,063 |
| akisnobeti / 2   |                             6 |                             6 |              106,223 |              139,693 |
| katmanizci / 3   |                             6 |                             9 |              100,757 |              206,003 |
| akisnobeti / 3   |                             2 |                             6 |              107,962 |              170,563 |

Önceki aday örneğindeki 18 sözcüklük örtüşme bu partide tekrarlanmadı;
aralık adayda **3–9**, eski sürümde **2–8**. Bu tek ölçü özgünlük endişesini
kapatmaz: farklı kısa diziler aynı gövdede çok yer tutabilir. Örneğin
`katmanizci-r2` adayında en az dört sözcüklük eşleşmeler gövdenin **22/32**
sözcük konumunu kapsıyor; aynı eski çıktıda **8/37**. Bunlar otomatik FAIL
eşiği değildir; kaynakla semantik karşılaştırma ayrıca yapılır.

Aday iki çiftte daha kısa, dört çiftte daha uzun sürdü. Değişen çıktı miktarı,
önbellek, çağrı zamanları ve küçük örneklem nedeniyle hız etkisi sonucu yok.

## Kör hakem ve kaynakla uzlaştırma

Gerçek hakem `claude-opus-5/high`: exit 0, `is_error=false`, 3 tur,
izin reddi 0. CLI ayrıca Haiku 4.5 yardımcı kullanımını bildirdi. İncelenen
çıktılar aday `7a945248c373831cd87fb72acf8e729b0daa673d` ve eski kurucu
`7134a04` ile üretildi. Hakem proje dışındaki dizinde yalnız Read/Grep/Glob
araçlarına sahipti; web, üretim erişimi ve kod yazma yok. İstek çerçevesi
“beni doğrulama, ÇÜRÜT”; somut bulgular dosya:satır, tetikleyici ve etki içeriyor.
Bu partinin sabit kör eşlemesi **A=aday, B=eski**; eşleme incelemeden sonra açıldı.

Aşağıdaki tablo hakemin etiketleridir; yürütücünün uzlaştırma sınırları hemen
altındadır. Sadakat iki kolda da 4 PASS / 2 CONCERN. Özgünlük adayda
4 PASS / 1 CONCERN / 1 FAIL, eski sürümde 5 PASS / 1 FAIL.

| Persona / tekrar | Eski sadakat | Eski özgünlük | Aday sadakat | Aday özgünlük |
| ---------------- | ------------ | ------------- | ------------ | ------------- |
| katmanizci / 1   | CONCERN      | PASS          | PASS         | PASS          |
| akisnobeti / 1   | PASS         | FAIL          | CONCERN      | PASS          |
| katmanizci / 2   | PASS         | PASS          | PASS         | FAIL          |
| akisnobeti / 2   | PASS         | PASS          | CONCERN      | PASS          |
| katmanizci / 3   | CONCERN      | PASS          | PASS         | CONCERN       |
| akisnobeti / 3   | PASS         | PASS          | PASS         | PASS          |

Kaynak `blind-packet.md:81`, mevcut TTL entry'si `:96`. Kaynakla doğrudan
karşılaştırılan bulgular:

- Aday `katmanizci-r2` (`:283`) ve eski `akisnobeti-r1` (`:477`), kaynağın
  cümlelerini birleştirerek aynı gözlem sırasını ve uzun ifadelerini taşıyor.
  Hakem ikisine de özgünlük FAIL verdi. En az dört sözcüklük tam eşleşmeler
  sırasıyla **22/32** ve **16/34** gövde konumunu kapsıyor. Aktarımın kendisi
  doğrulandı; oranlar tek başına katkısızlık veya intihal hükmü değildir.
- Eski `katmanizci-r1` (`:227`) ve aday `akisnobeti-r2` (`:533`), deneyin
  kurgusal olduğunu gövdede belirtmiyor. Bu eksiklik kaynakla doğrulandı;
  hakemin sadakat CONCERN'i korundu.
- Eski `katmanizci-r3` (`:343`), sürümlü anahtar gözlemine kaynakta açıkça
  yazmayan “TTL süresi dolmadan” koşulunu ekliyor. Aday `akisnobeti-r1`
  (`:449`) tekil düzeneği genel mekanizma olarak anlatıyor. Bunlar kapsam
  CONCERN'i olarak tutuldu; kaynakta açıkça bulunmama, teknik iddianın yanlış
  olduğunun kanıtı sayılmadı.
- Aday `katmanizci-r3` (`:313`) kaynak sırasını ve bir ifadeyi aynen taşıyor;
  hakem özgünlük CONCERN verdi. Ölçüm sınırını açıklamanın sözlük değerini
  ne kadar artırdığı yoruma açık kaldı.

Hakemin “bağımsız önerme yoksa her yoğunlaştırma FAIL” genellemesi protokolün
doğru özete tanıdığı alanı daraltıyor; otomatik yeni ölçüt olarak benimsenmedi.
İki FAIL etiketi yukarıda hakem görüşü olarak korunuyor; yürütücünün doğrudan
doğruladığı olgu, iki kolda da yoğun kaynak aktarımı bulunmasıdır. Hakemin
tek entry'yi olumlu katkı saymayan ifadesi de benimsenmedi: kota yok; içerik
kendi değeriyle değerlendirilir. Toplam 12 entry'nin varlığı tek başına kalite
PASS değildir. Önceki altı vakalık taramanın değişken A/B etiketleri bu partinin
sabit eşlemesiyle birleştirilmedi.

## Karar

**Bu aday park edildi; canlıya geçiş için NO-GO, PR #120 taslak kalır.**
Önceden sabitlenen karışık/ortak kusur koşulu gerçekleşti: iki kol da temiz
referans değil; sadakat/özgünlük farkının yönü persona değişince tersine dönüyor.
Bu parti daraltmanın nedensel gerilemesini, kalite eşdeğerliğini veya hız
kazancını göstermedi. Aynı aday için kendiliğinden üçüncü tekrar partisi açılmaz;
önceki FAIL silinmez ve başarılı çıktılar seçilerek kabul üretilmez.

Yerel takip tamamlandı. Kanonik plandaki tam canlı telemetri penceresi hâlâ
açık; bu tur yeni üretim ölçümü yapılmadı. PR'daki ayrı kök şema-hata yolu `$`
düzeltmesi korunuyor; adayın park edilmesi bu düzeltmenin bağımsız doğrulamasını
geçersiz kılmaz, fakat bu kararla merge veya dağıtım yapılmadı.

## Ham kanıt

`tmp/decision-source-repeat-2026-09-08/` altında Git dışında korunur:
`protocol.md`, `manifest.json`, `generate.ts.txt`, `run.py`, vaka başına
`context.json`, `schema.json`, iki prompt ve bütün `*.result.json`,
`*.meta.json`, `*.events.jsonl` kayıtları. `validate.ts.txt`, `validation.json`,
`analyze.py`, `overlap-proof.json` ve `provider-summary.json` kontrolleri tutar.
Kör paket `blind-packet.md`, eşleme `blinding-key.json`, hakem komutu
`review-when-ready.py`, ham yanıt `opus-quality.json`, okunabilir yanıt
`opus-quality.md` içinde. Hakem etiketleri `review-grades.json` ile 12/12
ayrıştırılıp sayıldı; bunlar yürütücünün uzlaştırma hükmü yerine geçmez.
Paket SHA-256:
`044526cf432974d47e2ed0aa63c0505d85fb8cb1aa5a6466434c891b8b86ab1c`.
Okunabilir hakem yanıtının SHA-256'sı:
`35a1045dd565ed8011ac348464ab1a5bb415ab9ab810ca03b6c1d6813f59d6b6`.

Runtime kodu değişmedi. Bu kayıt için format, lint, typecheck ve requirements
3/3 geçti; yerel kontrol log'ları aynı ham kanıt dizininde saklandı.
