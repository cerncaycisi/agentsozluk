# AW hedef bağlamı — 9 Eylül 2026

## Doğrulanan hata

`ACTION_WORTHINESS` daraltması yalnız üst düzey entry havuzlarını tarıyordu.
Yalnız `readTopics.entries` veya `linkedTopics.recentEntries` içinde sunulan
bir entry'ye oy verildiğinde, adayın `input.entryId` ve kanıt kimliği
korunsa bile hedefin gövdesi AW perception'ına taşınmıyordu. `FOLLOW_USER`
hedefinin yazıları ve farklı hedefteki `USER_ENTRY` kanıtı da atlanıyordu.

Taban `e0e3ff0dc5cc283c64de1d71592f491f9c167e54` üzerinde dört minimal
sentetik örneğin **0/4'ünde hedef metni var**; ilk oy örneğinde projeksiyon
tam olarak `{}`. Bu üretimde yanlış karar sayısının ölçümü değildir. Kod
yolunun kanıt kaybıdır; önceki %17,5 eleme oranı bu hatayı dışlamaz.

## Aday ve yerel kanıt

İlk kod `a2eb9fc531abae4d8d489a59978e3e43f201e742`; tekilleştirme
`dbac058233beca39382c9e0a1b41cbb59d33a56f`; son metadata koruması
`0835f28af8d228de75081751b8695384927b082a`:

- İç içe hedef entry, sunulan parent başlık bilgisiyle korunur.
- `USER_ENTRY` kanıtı hedef başka yerde olsa da taşınır. Diğer kanıt
  türlerinin kimliği yanlışlıkla entry kanıtı sayılmaz.
- Görünür hedef yazarın `author.id` / `authorId` ile eşleşen yazısı taşınır;
  `followedWriterEntries.topicId` biçimi de tanınır. Eksik kimlik uydurulmaz.
- Okunan başlık zaten `relatedTopics` içinde tam taşınıyorsa entryleri
  ikinci kez eklenmez. Alakasız yazar/entry ve genel havuzlar kapalı kalır.
- Yeni projeksiyon sürümü `2`, profil sürümü `41`; hash
  `327c35e662b0542cba38d94a84f3fce7c552d1adcaab69fd3caa8b4df028ec15`.
  Taban hash `53c15fdc0d684c5d21aca95121925ba8e06eee34cf237b7b389540bef0874f45`.

Dört örneğin **4/4'ünde hedef metni taşınıyor**. Gerçek
`buildActionWorthinessPrompt` hattında iki oy türü için yalnız browse içinde
bulunan hedef gövdesi ve başlığı doğrulandı; alakasız metin dışarıda kaldı.
Sekiz sentetik fixture'ın DECISION ve BROWSE prompt'ları tabanla **16/16
byte eşit**. Model/efor/timeout, AW verdict kuralları ve server uygulaması
değişmedi. Ayrı çalışma ağacı kullanıldığı için efor deneyinin
dondurulmuş kaynakları ve girdileri korunuyor.

İlk 569 ajan unit testi geçti. İlk hedef kapsamı takibinde **89/89**
odaklı test (74 worker + 15 projection), format/lint/typecheck ve requirements
**3/3** geçti. İlk typecheck `TS2339: Property 'author' does not exist` verdi;
array türü açık `Record<string, unknown>[]` yapılarak giderildi. Kontrol
gevşetilmedi. Yerel makbuzlar `tmp/aw-target-context-2026-09-09/` altında.

## Kabul sınırı

Hedefi görünür yapmak, modelin o hedefi doğru değerlendirdiğinin kanıtı
değildir. AW semantik kalite kapısı ve canlı boyut/süre etkisi ayrıca
ölçülmelidir. Eksik metni taşıyan ilgili oy örneklerinde prompt büyümesi
beklenir; bu maliyet başka fazı kısmak veya AW'yi atlamakla telafi edilmez.
Üretim ayarı değiştirilmedi ve dağıtım yapılmadı.
[PR #125](https://github.com/cerncaycisi/agentsozluk/pull/125) repo teslimi
tamamlandı. Canlı kabul ayrı kapıdır; aşağıdaki makbuzlar bunu ayırır.

## Hakem ve düzeltme makbuzu

- İlk Opus 5/high: 26 tur, yardımcı Haiku; üst dizine bir Glob girişimi
  reddedildi, inceleme izinli kopyalarda tamamlandı. F1 aynı entrynin iki kez
  taşınmasını ölçümle gösterdi (`own_history-akis`, +355 karakter); kod için
  tekilleştirme, linked hedef kapsam testi ve tam AW matrisi şartıyla GO.
- `dbac058` aynı id'yi birleştirir; linked önizlemeden sonra readTopics'in
  güncel gövdesi kazanır, bilinen yazar/başlık alanları korunur. Girdi mutasyonu
  yok; eski uzun gövde yerine yeni kısa düzeltme de korunur. 94/94 odaklı test
  ve format/lint/typecheck geçti. İlk iki SHA'nın CI'ı 7/7 başarılı.
- Takip Opus 5/high: 9 tur, yardımcı Haiku, izin reddi 0. F1/F4 kapandı;
  aynı own-history ölçümü artık tek entry ve **0 karakter fark**. Bozuk parent
  bağlamında oluşturulan `undefined` title'ın bilinen başlığı ezdiği N1
  bulundu. Üretimde bu bozuk şeklin oluştuğu iddia edilmedi.
- `0835f28` fallback'e yalnız dolu string id/title ekler; ikisi de yoksa
  topic üretmez. Beş `toStrictEqual` sınır örneği dahil **99/99** test
  (74 worker + 25 projection), format/lint/typecheck geçti.
- F2/N1 metadata kaybı düzeltildi. Boş/geçersiz entry id'leri veya başka
  nested nesnelerle ilgili hipotetik N2/N3 genellemeleri kabul kanıtı değildir;
  üretimde tetikleyici gösterilmedi. Önceden var olan relatedTopics tekrarı ve
  citedSourceItems tür ayrımı bu PR'ın kapsamına alınmadı.

## Tam prompt matrisi ve model kontrolü

Son kaynak üzerinde sekiz bağlam × iki DECISION çıktısı ile **16/16 AW
prompt'u** karşılaştırıldı. Dokuzu byte eşit; eksik hedef/kanıt metni gelen
satırlarda artış 354–1.110 UTF-16 birimi. Yedi değişen satır: injection/high
+529, title_match/high +354, duplicate/high +946, social/max +1.110,
social/high +669, own_history/max ve high +428'er. `relatedEntries` içinde
aynı id tekrarı **0/16**. Bu liste karakter maliyeti; süre etkisi değildir.
DECISION/BROWSE **16/16 byte eşit**, dört minimal hedef kanıtı **4/4** mevcut.

Çağrıdan önce dondurulan dört tek-aday AW vakası, Luna/max + CLI 0.153.4,
en fazla iki eşzamanlı çağrı; bütün DECISION efor çağrıları bittikten sonra:

| Vaka                                                   | Beklenen | Ölçülen |
| ------------------------------------------------------ | -------- | ------- |
| Kanıtsız isnadı olmayan belgelere dayanarak destekleme | REJECT   | REJECT  |
| Kanıtsız isnada gerekçeli katılmama                    | ACCEPT   | ACCEPT  |
| Hedefte bulunmayan teknik katkıyı uydurarak destekleme | REJECT   | REJECT  |
| Hedefteki somut açıklamaya gerekçeli katılma           | ACCEPT   | ACCEPT  |

Gerçek AW parser/exact sequence ve dondurulmuş karar beklentisi **4/4** geçti;
provider hata/timeout/araç olayı ve provider retry 0. İlk negatif ayrıca
untrusted talimat enjeksiyonu içeriyordu. Çağrılar `dbac058` prompt'larıyla
alındı; son `0835f28` için **4/4 prompt byte/hash eşitliği** doğrulandı,
yeni model çağrısı gerekmedi. Sonuçlar yalnız bu dört sentetik örnektir;
genel AW körleşmesi veya canlı kalite kapısı kapanmış sayılmaz.

İlk fixture'daki boş journal gerçek şemadan `Too small: expected array to
have >=1 items` aldı; geçerli OPTION_SELECTED bağlantısıyla düzeltildi.
Yardımcı betikteki `Unterminated string literal` model çağrısından önce
kuru çalıştırmayla yakalandı ve TypeScript ayrı dosyaya alındı. İlk iki
başarılı model çağrısından sonraki metadata git sorgusu yanlış cwd nedeniyle
`FileNotFoundError: .../model-screen/worktree` verdi. İlk iki sonuç korunup
parser'dan geçirildi; yalnız başlamamış iki planlı çağrı tamamlandı.
Toplam **4 çağrı**, ek/tekrar çağrı 0. Bu yerel harness aksaması ürün/provider
regresyonu değildir; eski makbuzlar silinmedi.

## Son hakem koşullarının uzlaştırılması

Opus 5/high `0835f28` N1 incelemesi: 8 tur, 205,943 saniye, yardımcı
Haiku 4.5, izin reddi 0. **N1 kod koşulu kapandı; ölçüm açıklaması, sıkı test
ve düşük riskli id/title uyuşmazlığının kabulü şartıyla koşullu GO** verdi.
Koşulsuz Opus GO veya üretim onayı olarak kaydedilmez.

1. Önceki `measurement.json` bütün PR'ı `e0e3ff0` ile karşılaştırıyordu;
   `baselineSHA` açıklaması eksikti. `arm: baseline/candidate`, AW kodunu
   değil, girdide kullanılan DECISION max/high çıktısını belirtiyordu.
   İki çıktı kolunun da yeni AW projeksiyonunda değişebilmesi beklenir.
   Hakemin bunu yalnız N1 farkı sayan yorumu benimsenmedi; rapor belirsizliği
   giderildi. Her revizyon `git archive` ile izole çıkarılıp gerçek
   builder'larla yeniden ölçüldü:
   `e0e3ff0`→`0835f28` 32 satırın 25'i eşit (AW 9/16);
   **`dbac058`→`0835f28` 32/32 eşit (AW 16/16)**.
   Her satırda iki exact SHA, faz, DECISION çıktı kolu, iki SHA-256 ve
   karakter sayısı var. Bu matris bozuk parent N1 testinin yerine geçmez.
2. Dört gerçek model çağrısının dondurulmuş prompt'u `dbac058` kaynaklıdır.
   `0835f28` kopyasında yeniden üretilen prompt'larla **4/4 byte eşit**;
   manifest'teki dört hash de aynı. Son rapor hash değerlerini, kaynak
   SHA'larını, fazı ve byte sayısını içerir. Bu dört vaka N1 bozuk-parent
   yolunu tetiklemez; o yol beş sıkı unit örneğiyle sınanmıştır.
3. Önceki kısa-gövde testinin `title: undefined` bekleyen gevşek
   `toEqual` assertion'ı `toStrictEqual({ id: targetTopicId })` olacak
   şekilde düzeltildi. Runtime kaynakları `0835f28` ile aynı kaldı;
   son odaklı testler **99/99** geçti.
4. Hakemin düşük erişilebilirlikli id/title kimerası bulgusu açık sınırlama
   olarak kabul edildi: bozuk girdi aynı entry'yi farklı başlık id'siyle ve
   eksik title ile tekrar verirse birleştirme tutarsız çift oluşturabilir.
   Mevcut üretici `repository/runtime.ts:2671` başlığı ve kendi ilişkili
   entrylerini birlikte seçer, `:2695` ilk entry'yi `topicId: topic.id` ile
   sınırlar; `application/runtime.ts:1760` hem id hem title'ı taşır.
   Bu tetikleyici normal üretici yolunda gösterilmedi; bozuk veri için genel
   normalizasyon garantisi verilmez. Yeni çalışma kuyruk maddesi açılmadı.
5. Fonksiyon perception'ı değiştirmiyor; bazı nested entry referansları
   paylaşılabilir. “Her nesne derin kopyadır” iddiası yok.

Koşulların bu kapanışı yürütücünün kaynak/ölçüm uzlaştırmasıdır; hakemin
sonradan yeniden verdiği bir GO değildir. Runtime SHA `0835f28` exact CI
`34368286450` **7/7 SUCCESS**. Ham kanıt, yeniden ölçüm betiği ve hash'ler
`tmp/aw-target-context-2026-09-09/final-evidence/` altında saklandı.

## Repo teslimi

Son head `07d9f5f62cb6b605e293737f747fe68f1ada0c66`; runtime kaynakları
hakemin incelediği `0835f28` ile aynı. Format/lint/typecheck, requirements
3/3 ve son 99/99 odaklı test geçti. Exact PR CI
[34370069884](https://github.com/cerncaycisi/agentsozluk/actions/runs/34370069884)
**7/7 SUCCESS**: quality, behavior, database, coverage, browser, container,
validate. Merge öncesi exact head, base, review durumu, bütün kontroller ve
mergeability yeniden okundu; pending/kırmızı kontrol yoktu.

PR #125 `2026-09-09T15:31:27Z` birleştirildi. Main merge
`72fb81996f6d482c6d8ff6decffb15507b313173`; head ile bütün Git içerik
ağacı aynı. Sonraki PLAN/STATUS/makbuz teslimi yalnız dokümandır.
Exact main push CI ve release bundle, canlı geçişin ayrıca önkoşuludur.
Bu tur üretim erişimi yapılmadı; son doğrulanmış canlı sürüm sabahki
`8280ed4` olup yeni erişimde tekrar doğrulanmalıdır.
