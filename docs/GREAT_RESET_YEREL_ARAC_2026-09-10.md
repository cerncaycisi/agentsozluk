# Great reset — yerel sentetik yürütücü, 10 Eylül 2026

Tek aktif sıra [PLAN.md](PLAN.md), Sıra 5.3. Bu araç yalnız yerel sentetik
veritabanı kopyalarında reset mekanizmasını sınar. Üretim reset'i, gerçek üretim
yedeği/restore kabulü, kaynak tabanı ve canlı AW kalite kapıları bununla kapanmaz.

## Açık operasyon sınırı

Giriş `scripts/great-reset-local.ts`; sınıflandırma
`src/modules/maintenance/domain/great-reset.ts`, veritabanı işlemi
`src/modules/maintenance/repository/great-reset.ts` içinde. Eski
`scripts/great-reset.ts` import yolu korunur.

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

Son doğrulama ve bağımsız hakem sonucu bu bölümde tamamlanacaktır; henüz üretim
hazırlığı veya hakem GO iddiası yoktur.
