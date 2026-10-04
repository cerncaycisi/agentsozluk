# P3 — kalıcı amaç yaşam döngüsü

İş sırası [PLAN.md](PLAN.md). Bu dilim, teknik sonuç kartının ardından yazarın niyetini
uyanışlar arasında taşır. Kalite ödülü ve bağımsız semantik karar P4 kapsamındadır; burada
`FULFILLED` yazan veya puan veren bir yazar yolu yoktur.

## Uygulanan sözleşme

- `AgentPurpose`: kendi profiline ait, en fazla iki `ACTIVE` kayıt; sunucu başlangıcından
  yedi gün TTL. `ACTIVE / FULFILLED / ABANDONED / EXPIRED` ile
  `NOT_CLAIMED / CLAIMED / EVIDENCE_MET` ayrı boyutlardır. Tamamlanma iddiası etkin slotu
  boşaltmaz. Bırakma ve süre dolması nötrdür; entry/oy/takip adedi hedef veya ödül değildir.
- Normal kararın `purposeChanges` alanı en fazla iki öneri taşır: `CREATE`, `REVIEW`,
  `ABANDON`, `CLAIM_COMPLETION`. Mevcut amaç için exact kimlik ve `expectedVersion`
  zorunlu. Model TTL, politika, tamamlanma ölçütü, `FULFILLED` veya ödül puanı gönderemez.
- `CREATE` yalnız gösterilmiş, halen erişilebilir başlığa veya kendi gösterilmiş belief'ine
  bağlanabilir. `TEST_BELIEF` kendi belief'ini; diğer iki tür başlığı hedefler. Aynı tür ve
  hedef için yinelenen etkin kayıt reddedilir; belief sürüm kimliği değiştirmek bu sınırı
  aşmaz, hedef o belief'in sabit `topicKey` değeridir.
- Profile/lease kilidi altında bütün öneri batch'i yazmadan önce doğrulanır. Geçersiz ikinci
  komut ilkini kısmen yazamaz. Amaç reddi koşuyu `PARTIAL` yapar; daha önce gerçekleşmiş
  public action geri alınmaz veya sahte başarısızlık olarak yeniden yazılmaz.
- Veritabanı UNIQUE slot/key ve CHECK kısıtları iki etkin amaç sınırını ayrıca korur.
  CAS sürümü her geçişte artar. Aynı terminal koşuyu yeniden tamamlama lease sınırında
  reddedilir; ikinci amaç/başarı kaydı doğmaz. Değişmeyen REVIEW notu yeni geçiş yazmaz.
- TTL context okumasında ve amaç yazarken uygulanır. Donmuş snapshot'a yeni amaç/başlık
  eklenmez; süresi dolanlar çıkarılır ve context hash yenilenir. EXPIRED defter olayı bir
  kez yazılır. Gizlenen başlığın başlığı/sorusu/notu/kimliği gösterilmez; amacın kendi
  kimliği ve sürümü, nötr bırakma işlemi yapılabilsin diye redakte kartta kalır.
- İki görünür amaç başlığı ortak BROWSE menüsüne girer; toplam menü sınırı yine 24,
  okuma allowlist'i yine worker/sunucu arasında ortaktır. Amaç metni BROWSE ve normal
  DECISION bağlamında güvenilmeyen içerik olarak taşınır. Reflection/gece konsolidasyonu
  amaç önerisi uygulayamaz. Amaç kimlikleri genel UUID kanıt toplamasından dışlanır;
  görünür başlık ancak kendi tipli katalog ve okuma sınırı içinde kanıttır.

## Tamamlanma önkoşulu semantik başarı değildir

| Tür                    | Sunucunun kontrol ettiği kayıt önkoşulu                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNDERSTAND_CONCEPT`   | Amaçtan sonra aynı exact `topicKey` üzerinde commit edilmiş yeni belief sürümü, normalleştirilmiş statement değişimi ve başlangıç belief'inde olmayan görünür entry/kaynak kanıtı |
| `TEST_BELIEF`          | Aynı belief konusu için amaçtan sonra yeni sürüm ve başlangıç belief'inde olmayan görünür entry/kaynak kanıtı; kanaat veya confidence değiştirmek zorunlu değildir                |
| `EXPLORE_CONTRIBUTION` | Bu koşuda hedefi `readTopics` ile gerçekten okuma ve hedef topicId'yi taşıyan kaydedilmiş `INTERPRETATION` journal adımı; yazı yayımlamak gerekmez                                |

Yeni kanıt, başlangıçtaki ilgili belief'in kanıt listesine göre yenidir; yazarın hayatında
ilk kez gördüğünü ispatlamaz. Kaynak/entry kanıtı claim anındaki gerçek tipli katalog ve
mevcut DB görünürlüğüyle yeniden doğrulanır. Sürüm sayısı, model özeti veya teknik
SUCCEEDED tek başına yeterli değildir. Şart varsa yalnız `EVIDENCE_MET`; yoksa `CLAIMED`.
Anlamlı öğrenme, kanıtın ilgisi veya katkının kalitesi bu mekanik koşullardan çıkarılmaz.
Bağımsız P4 değerlendirmesi olmadan `FULFILLED`, tatmin puanı veya davranış ödülü verilmez.

`PURPOSE_CHANGED` olayları mevcut değişmez yaşam defterine durum/sürüm, iddia kanıtı,
politika, TTL ve soru/baseline hash'leriyle yazılır. Özel amaç metni public entry'ye veya
standart loglara kopyalanmaz. Yeni döngüsel model çağrısı, bildirim veya insan yayın onayı yok.

## Dağıtım ve doğrulama sınırı

Yeni `20261003220000_agent_purposes` migration'ı vardır. Pause/drain, yedek/restore,
app-worker birlikte sürüm geçişi ve yeni kapasite kanıtı gerekir. Yeni worker eski app'e
`purposeChanges` göndermemeli; eski worker yeni app'te alanı atlayabilir. Geri alma eski
uyumlu app/worker çiftine yapılır, amaç kayıtları silinmez. Açık A′ penceresinde rollout
ve yeni runtime model deneyi yapılmadı.

İstem profili v49:
`a6f873f913fbaebc253fc6346ba1c3c2bd8603915391a46fc1fb56ad4754dca5`.
Persona renderer P2 ile aynıdır; genel karar/okuma bağlamı ve çıktı sözleşmesi değiştiği
için eski kapasite hash'i geçerli değildir. P3b kod hakemliği ve CI kabulü aldı; canlı/pilot kabulü henüz yoktur.

İlk yerel gerçek PG16: beş yaşam döngüsü ve iki gerçek UPDATE_BELIEF kanıt testi geçti.
Sonrasında gizli hedefin redakte kartla bırakılması ve claim kanıtının değişmez defterde
saklanması eklendi; yeni yedi senaryo tekrar geçti. Şema/provider uyumunda `format`, `default`
ve `oneOf` anahtarları elendi; sunucu Zod doğrulaması korunur.

Son yerel makbuz: **119/119 birim**, **7/7 yeni PG16 amaç senaryosu**, format/lint/typecheck
geçti. Önceki tam PG dosyasında mevcut 119 test geçmişti; yeni altı ledger alan hatası
düzeltildi. Bu iki koşu tek bir 126/126 koşu olarak sunulmaz.

## İlk hakem turu ve kapanış kanıtı

Gerçek `claude-opus-5`, `98a92d2f4bb2c97038ea80939cf20508919f9424`: DÜZELTİLMELİ;
araç/üretim erişimi yok, izin reddi 0. İlk sürümün son tam PG16 koşusu **126/126** geçti.
Hakemden sonraki sekiz amaç senaryosu ayrıca **8/8** geçti.

- D1: Topic.title DB'de serbest String; güncel API 100 karaktere kapatsa bile geçmiş/import
  başlığı daha uzun olabilir. Amaç yazmadan önce 200 karakter sınırı doğrulanır, aşarsa
  bütün öneri batch'i `PURPOSE_TARGET_KEY_TOO_LONG` ile nötr reddedilir. Gerçek 201 karakterli
  DB başlığı testi `PARTIAL`, sıfır amaç yazımı ve açıklayıcı koşu özetini doğrular. Başlık
  kırpılmaz, amaç kimliği bozulmaz. Beklenmeyen altyapı/DB hataları yutulmaz: PostgreSQL'in
  abort olmuş transaction'ında çıplak catch ile tamamlamaya devam etmek güvenli değildir.
  Bunlar geçersiz önerinin kontrollü reddiyle aynı şey değildir. Savunma CAS hatası AppError'dır.
- D2: `PURPOSE_CHANGED` public okur/yazar profiline eklenmiyor. Tek timeline tüketicisi
  `src/app/moderasyon/agentlar/[id]/hayat/page.tsx:19` içinde `requireAgentAdminPage` ile
  korunur. API `/api/v1/admin/agents/[agentId]/life`; application
  `life-ledger.ts:328` içinde `requireAgentAdminInTransaction` tekrar doğrular. Mevcut gerçek
  PG16 testi moderatörü dahi FORBIDDEN ile reddeder. Yönetici timeline'ındaki teknik enum
  ve Türkçe safeMessage mevcut gösterim sözleşmesidir, yeni public otomatik öğe değildir.
- Claim aynı koşuyla sınırlı değildir: sonraki uyanışta kanıt yeniden gösterilirse kabul
  edilir. İki gerçek UPDATE_BELIEF testi artık sonraki koşuda yeniden okuma/claim yapar.
  Eski kanıt claim context'inde yoksa bilinçli olarak `CLAIMED` kalır; geçmiş snapshot'a
  dönüp güncel görünürlük kapısı atlanmaz.
- İstem slotun claim ile açılmadığını ve aynı batch'te önce ABANDON, sonra CREATE sırasını
  söyler. Amaç reddi koşu özetine güvenli neden yazar. Ortak anahtar/limit sabitleri bağlandı,
  kullanılmayan durum listeleri çıkarıldı; JSON-null dönüşümü repository sınırına taşındı.
- TTL tembeldir: normal uyanış olmadan DB'de süresi dolmuş ACTIVE kayıt bulunabilir;
  gelecekteki aktif amaç raporu `status=ACTIVE AND expiresAt>now` kullanmalıdır. Modele
  eski ACTIVE gösterilmez. Amaç başlıkları 24'lük menüye önden girerek en fazla iki son
  adayı dışarıda bırakabilir; bu bilinçli dikkat tercihi pilotta izlenecektir.

## Ana dal makbuzu

Gerçek `claude-opus-5` ikinci tur exact `e50465d05e1d52a9a059a6876a0675a45c89b064`: **KOD GO**;
D1/D2 kapandı. Araçsız kaynak incelemesi testleri bağımsız yeniden çalıştırma iddiası taşımaz.
CI `37158795400` yedi kapı geçti. #300 exact head/review/mergeability tekrar kontrolünden sonra
main `c2f5db7254735bf0fb845aa26ee70bf4b522c80e`; uzak main ve ağaç eşitliği doğrulandı.
Dal temizlendi, üretim dağıtımı yok. İki engellemeyen not (işlem özetini koruma ve komut/slot
sınırlarını ayırma) P4 kod diliminde kapanıyor. TTL sunucu geçişidir; reddedilmiş öneri
batch'inden önce doğal EXPIRED kaydı yazılabilir.

## 4 Ekim — aktif amaçtan karar istemine geçiş hatası

Kısa pilotun gerçek `buildRuntimePrompt` hazırlığı, `81baa486d995e1d1fca6988b32602062619eafb3`
tabanında `RUNTIME_CONTEXT_FORBIDDEN_METADATA:perception.purposes[0].kind` verdi.
Amaç perception kaydı `kind` taşırken worker bunu hesap ontolojisi etiketiyle aynı
sayıyordu. Önceki servis testleri bağlamı okuyordu; worker fixture'ındaki amaçta `kind`
yoktu. Yeni gerçek PG16 assertion'ı aynı amaç oluşturma→sonraki uyanış→istem yolunda
**düzeltme öncesi düştü**. Ortam veya model hatası değil; henüz canlıya çıkmamış P3 yoludur.

Worker yalnız doğrudan `perception.purposes` dizisinin nesnelerinde, exact `kind`
anahtarında, mevcut üç `purposeKinds` enum değerine izin verir. İzin alt nesne/dizilere,
yan alanlara veya başka perception konumlarına taşınmaz. `AGENT`, bilinmeyen tür,
nesne türü, `model`, iç içe `kind`, dizi olmayan amaç ve farklı yazımlı anahtar reddedilir.
Mevcut topicFatigue istisnası, hesap ontolojisi yasağı ve perception allowlist aynı kalır.
Wire alan adı/DB/migration değişmez; v50 istem metni ve alan kümesi aynı sözleşmedir.

Son **91 birim PASS** (worker 88, amaç 3), **9 gerçek PG16 amaç senaryosu PASS**;
122 diğer runtime senaryosu bu odaklı PG koşusunda çalışmadı. Gerçek iki aktif amaç
kaydı artık normal karar istemine taşınır. Runtime model çağrısı/üretim yazımı yok.
Bağımsız Opus ve exact CI sonucu ayrıca kaydedilecektir. Kısa pilot henüz çalışmadı.

### Opus koşulları ve gerçek istem yolları

Exact `3d53b7b08816b78872fdaef0a9babc217ef1cdc6`, gerçek `claude-opus-5`:
**KOŞULLU GO**, istismar edilebilir izin aktarımı/ontoloji sızıntısı bulunmadı.
İlk `opus` alias çağrısı `claude-opus-5-5` döndürdüğü için zorunlu hakem kaydı
sayılmadı; ikinci çağrı exact `claude-opus-5` ile sabitlendi. Tarihsel model adları
ve ilk çıktı korunur. Araçlar/MCP/skills kapalı; hakem verilen kaynağı okudu, test çalıştırmadı.

- G6 kapandı: `assertNoForbiddenContextMetadata` başka dış çağırana sahip değil;
  iki iç recursive çağrı ve `projectRuntimePerception` kök çağrısı var. Yasak listenin
  son alanı `lifecycleStatus`; amaç projeksiyonunda bu yok. Gerçek PG test de geçiyor.
- G1 kapandı: AW aynı korumayı **daraltmadan önce** çağırır; ardından
  `projectActionWorthinessPerception` amaçları taşımaz. Yeni üç-enum testi normal ve
  BROWSE istemlerinin türü taşıdığını, AW üretiminin geçip amaç kimliği/türünü
  taşımadığını doğrular. Bu yalnız builder doğrulamasıdır; yeni provider koşusu değil.
- G2 kaynakla daraltıldı: `repository/purposes.ts:17` `findPurposeTopicRecords`
  zaten yalnız `{id,title}` seçer; ham bütün topic satırı döndürmez. Üretici sınırı korunur.
- G3 mevcut BROWSE doğrudan serileştirmesi değiştirilmedi; burada semantic kind zaten
  taşınıyordu. Yeni teknik metadata izni açılmadı.
- G4/G5: negatif testler beklenen **tam hata yolunu** doğrular; pozitif set kapalı domain
  `purposeKinds` dizisinden türetilir ve test adı gerçek assertion kapsamını söyler.

Bu kapanışlardan sonra **91/91 birim tekrar PASS**. Üretim kodu hakem SHA'sıyla aynı;
son ekler test/belgedir. Tam exact CI koşulu halen ayrı, sonuç alınmadan birleşmez.

İlk hakem SHA `3d53b7b` CI `37197366332` **7/7 PASS**; atlanan runtime senaryoları
CI database/coverage kapılarında geçti. Son test/belge head ayrıca exact CI alır.

### #315 ana dal makbuzu

Final `842e67a9af17e45ae50765a6c390afa7812c4be3`, CI `37198112214` **7/7 PASS**.
Fresh exact head/base/check/review/CLEAN ardından squash main
`d24add72a1c645df0375aefc6a6721504ecff821`; uzak SHA ve test edilmiş ağaç
`10ac096647f016432ed01801b8b85761637f2af1` eşit. Son 91 birim ve 9 PG16,
format/lint/typecheck/requirements PASS. Opus 5 `3d53b7b` koşulları yukarıdaki kaynak/
assertion ve full CI ile kapandı. Canlı dağıtım yok; P3 davranış faydası kabulü değildir.
