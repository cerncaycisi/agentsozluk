# Great reset — yerel sentetik yürütücü, 10 Eylül 2026

Tek aktif sıra [PLAN.md](PLAN.md), Sıra 5.3. Bu araç yalnız yerel sentetik
veritabanı kopyalarında reset mekanizmasını sınar. Üretim reset'i, gerçek üretim
yedeği/restore kabulü, kaynak tabanı ve canlı AW kalite kapıları bununla kapanmaz.

## Açık operasyon sınırı

Giriş `scripts/great-reset-local.ts`; sınıflandırma
`src/modules/maintenance/domain/great-reset.ts`, veritabanı işlemi
`src/modules/maintenance/repository/great-reset.ts` içinde. Eski
`scripts/great-reset.ts` import yolu korunur.
Yerel `.ts` çalışma ağacı ve `tsx` zorunlu çalışma önkoşuludur; derlenmiş `.js`
veya standalone uygulama paketi bu operatör aracının desteklenen girişi değildir.
Repository artık guard'ı `maintenance/domain` içinden alır. Kaynak hash'i CLI
ve uyumluluk dosyasını da kapsar.

- Yalnız `AGENT_GREAT_RESET_DATABASE_URL` okunur. Genel `DATABASE_URL` veya `.env`
  üzerinden hedef seçilmez. Argümansız çalıştırma ve `--dry-run` salt okunur
  transaction içinde aynı önizlemeyi üretir.
- Bilinen Mac hostname'i, PostgreSQL cluster kimliği, kullanıcı/sahip,
  `127.0.0.1:5432`, PostgreSQL 16 ve ayrılmış sentetik DB adı birlikte doğrulanır.
  DB yorumu `agentsozluk:great-reset:synthetic:v1` olmalıdır. Bu yorum operatörün
  fixture işaretidir; verinin sentetikliğini kendiliğinden kanıtlayan bir tarama değildir.
- URL'de query parametresi/fragment/çok parçalı yol veya başka host kabul edilmez.
  Repository girişinde de hedef kapısı yeniden uygulanır. Üretim seçeneği yoktur.
- Çalıştırma `--execute --database <tam-ad> --plan-sha256 <önizleme-hash>` ister.
  Hedef, kod, sınıflandırma, şema, satır içerikleri, sequence veya önkoşullar
  önizlemeden sonra değişirse aynı hash ile yürütülmez. Satır sayısının aynı
  kalması yeterli değildir.

## Bir transaction içindeki işlem

Bütün sınıflandırılmış tablolar ve migration ledger için `ACCESS EXCLUSIVE / NOWAIT`
kilidi alınır. Başka bağlantı, bekleyen/çalışan koşu, kalmış lease, aktif runtime state,
açık runtime/scheduler/yayın ayarı veya teslim edilmemiş outbox varsa işlem durur.
Araç worker durdurmaz, ayar kapatmaz, bağlantı öldürmez, outbox olayını işlenmiş saymaz.

**29 temizlenecek tablo** tek, açık listeli
`TRUNCATE ONLY ... CONTINUE IDENTITY RESTRICT` komutuna girer. `CASCADE` yoktur;
korunan veya bilinmeyen bir tablonun FK bağımlılığı silmeye katılmaz, işlemi düşürür.
Inheritance/partition ve public şemadaki bilinmeyen tablo reddedilir.
Bu ayrıcalıklı bakım işlemi DELETE tetikleyicilerini çalıştırmaz; tetikleyicilerin
kapatılması, yeniden yazılması veya normal uygulama silme yetkisinin genişletilmesi
söz konusu değildir. PostgreSQL bu işlemi transaction rollback ile geri alır.
[PostgreSQL 16 TRUNCATE sözleşmesi](https://www.postgresql.org/docs/16/sql-truncate.html).

**17 korunacak tablonun** satırları DB içinde SHA-256 ile karşılaştırılır. Ham
persona, kimlik bilgisi, prompt veya içerik istemciye/log'a taşınmaz. İki istisna açıktır:

1. `idempotency_records`: satırlar ve yanıt gövdeleri kalır; bütün `expiresAt`
   değerleri `1970-01-01T00:00:00Z` olur. Uygulamanın mevcut süre kontrolü eski
   başarı yanıtını yeniden kullanmaz. Değişebilen tek alan ayrıca doğrulanır.
2. `audit_logs`: eski kayıtlar aynen kalır, plan hash'i/silinen tablo sayıları ve
   yerel kapsamı içeren bir `GREAT_RESET_LOCAL_EXECUTED` kaydı eklenir.

Outbox'ın tamamı korunur; **bekleyen tek olay bile yürütmeyi engeller**. Gerçek üretim
outbox'ının nasıl tüketileceği veya arşivleneceği ayrıca çözülmeden üretim reset'i
hazır sayılamaz. Yerel testin sentetik olaylarına `processedAt` yazması gerçek olay
teslimi kanıtı değildir.

Public ID sequence'leri ilerlediği yerde kalır; eski entry/başlık numarası yeni
bir içeriğe yeniden verilmez. İçerik ve ona ait sayaç/indeks satırları boşalır.
Uygulama/cache/CDN yeniden açılışı bu yerel DB aracının doğrulama kapsamı değildir.

Silinen tablolar boş değilse, korunan içerik değişirse, sequence/şema değişirse veya
son kontrol başarısızsa TRUNCATE, idempotency güncellemesi ve yeni audit dahil
**bütün transaction geri alınır**. Başarı çıktısı commit sonrasında yazılır.

## Tekrarlanabilir yerel prova

`tests/rehearsal/great-reset-local.py`, daha önce hash'i ve geri yüklenmesi doğrulanmış
**sentetik** dump'ı alır; yalnız yeni adlandırılmış scratch DB'ler yaratır. PostgreSQL
ve Mac kimliğini komutlardan önce kontrol eder. `python3 -O` altında da kontroller
etkindir. Var olan DB'yi migrate reset ile temizlemez. Çıktı dizini yeni olmalıdır.

```sh
python3 -O tests/rehearsal/great-reset-local.py \
  tmp/reset-preparation-2026-09-10/synthetic-local.dump \
  757e29e1fa743867554e0deabf5d811b77271bd91621a182bfbef9921d972e79 \
  tmp/great-reset-executor-2026-09-10/yeni-prova
```

Bu artifact Git'e girmez; yoksa komut başlamadan durur. Sentetik dump'ın üretildiği
ve ilk geri yüklendiği kanıt [önceki makbuzdadır](RESET_ONCESI_HAZIRLIK_2026-09-10.md).
Prova; salt okunur önizleme, kimlik/koşu/lease/outbox/bağlantı kilitleri, eski önizleme,
korunan tablodan yeni FK, silme sonrası zorlanmış hata ve tam rollback, başarılı reset,
eski idempotency yanıtının uygulama tarafından yeniden kullanılmaması, immutable
korumalar ve sıfırlamadan sonra ayrı boş DB'ye gerçek geri yüklemeyi sınar.

## Ölçüm ve hakem kaydı

- Kod SHA: `00a2cd7a38441075ef7fcdf73f33674a0d483f5f`.
- Son PostgreSQL 16.14 provası `2026-09-10T11:34:18.139932Z`'de bitti:
  **18/18 senaryo**, **29 tabloda 316 satır temizlendi**; 17 korunacak
  tabloda işlem öncesi 28 satır vardı. Bir idempotency kaydı expire edildi,
  bir audit eklendi. Migration ledger ayrıca korundu.
- Dump restore'unda **47 tablo / 369 satır** başlangıçla eşit. Son geri
  yükleme, sıfırlama çalıştıktan sonra yaratılan ayrı boş DB'de yapıldı.
  İki scratch kaldırıldı, DB adları kataloğu önce/sonra aynı; cleanup hatası 0.
- Yerel ilk `41a0a26` sürümünde 1.451/1.451 unit test (221 dosya) geçti.
  Son `00a2cd7` değişikliğinde 27 odaklı reset/guard testi ve 18 PostgreSQL
  senaryosu yeniden geçti. Format/lint/typecheck ve requirements 3/3 geçti;
  son exact SHA'nın ayrıca 7/7 CI sonucu aşağıdaki teslim kaydındadır.
- Kod/plan uygulama hash'i
  `47c88ce78bc409411166c5933be087307301a8a4762a73fbfa35943a9097cd21`.
  Makbuzlar `tmp/great-reset-executor-2026-09-10/probe-04/`;
  önceki denemeler aynı dizinin `probe-01`, `probe-02` ve `probe-03` kayıtlarında durur.
  Dump SHA ve kaynakları önceki restore makbuzuyla aynıdır.
- Bağımsız `claude-opus-5/medium` kapanışı exact `00a2cd7` için **yerel GO**
  verdi. İlk geniş inceleme Opus 5/high idi. Üretim hazırlığı iddiası yoktur.

### İlk hakem ve düzeltmeler

İlk araçlı tur `error_max_turns` ile sonuç üretmedi; kabul sayılmadı.
Aynı `41a0a26` kaynak paketi araçsız **claude-opus-5/high** ile tek turda
436,539 sn incelendi; yardımcı Haiku bildirildi, araç/izin reddi 0.
**Kritik/yüksek bulgu yok, yerel kod için koşullu GO** verildi.

- Tablo sırası açık `COLLATE "C"` oldu. Gerçek yerel katalogda relname
  collation'ı zaten `C` ölçüldü; mevcut cluster'da hata kanıtı sayılmadı.
- Guard `maintenance/domain` içine taşındı; CLI ve uyumluluk dosyaları da
  kaynak hash'ine alındı. `.ts`/tsx önkoşulu açık tutuldu.
- Materialized view/view envantere katıldı; bilinmeyen görünümle önizleme
  reddi gerçek PostgreSQL üzerinde 18. senaryo olarak geçti.
- İşlem dışındaki karşılaştırma, iki açık istisna dışında bütün korunan
  tablolara genişletildi. Immutable sondalarda gerçek SQLSTATE **55000/P0001**
  eşleşmesi zorunlu oldu; yanlış sebepli nonzero exit artık yeterli değil.
- Blocker ve bayat hash ayrı senaryolardır; her blocker testini hash testi
  saymadık, hata önceliği değişmedi. Bütün DELETE trigger'lı tabloları
  reddetme önerisi uygulanmadı: bu, bilinçli cleared olan action/runEvent/
  moderation geçmişini de engellerdi. Persona/audit korunması unit testlerinde sabit.
- Hakemin 26 unit sayımı logla düzeltildi: sınıflandırma **7**, guard **20**,
  toplam **27**. Eski export, idempotency yardımcıları/okuyucuları, migration
  guard kesitleri ve tsconfig kapanış paketine eklendi. Uygulamada yanıt
  okuyan tek findUnique yolunun `executeIdempotently`'ye bağlı olduğu kaynak
  taramasıyla doğrulandı; diğer raw-query okuyucusu süre bazlı cleanup içindir.

Son `00a2cd7` SHA'sında kapsamı bu kapanışlarla sınırlı **claude-opus-5/medium**
turu **yerel kod GO** verdi: 135,413 sn, tek tur; araç kullanımı/izin reddi 0,
yardımcı Haiku bildirildi. Kritik/yüksek bulgu yok. İlk rapor
`inline-opus-review.md`, son rapor `close-opus-review.md`, girdiler ve kaynak
hash'leri `review-close-inputs.json` içinde. Üretim reset'i bu GO'nun dışındadır.

Bloklayıcı olmayan sınırlar da kayda alındı: immutable sondalar dolu fixture
tablosu gerektirir (boşsa yanlış PASS yerine hata verir); idempotency satırları
**reset transaction'ı boyunca** korunur, mevcut süre bazlı cleanup sonraki
çalışmada bunları silebilir. Eski liste sırası testi yürütücünün silme sırası
kanıtı değildir; yürütme tek TRUNCATE'tir. Başka PostgreSQL şemalarındaki kopyalar
bu `public`/Prisma kapsamına dahil değildir.

## Repo teslimi

PR [#126](https://github.com/cerncaycisi/agentsozluk/pull/126), exact head
`00a2cd7a38441075ef7fcdf73f33674a0d483f5f` üzerinde 7/7 CI (`34472034328`) ve Opus 5
kapanışı sonrasında birleşti: `9b3fc6b371c3fcc83207f5971574614961dff23e`.
Merge ağacı ile incelenen head ağacı birebir eşit. Uygulama route'ları,
worker/agents kodu, Prisma şeması/migration'ları ve bağımlılıklar değişmedi.
Dağıtım veya üretim erişimi yapılmadı. Plan/status/attempt makbuzu aynı teslimde
main'e işlendi; bir sonraki adımın üretim kapıları PLAN.md'de ayrı kaldı.
