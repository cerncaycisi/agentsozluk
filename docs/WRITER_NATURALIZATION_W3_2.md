# W3.2 — Çapraz-yazar anlamsal yenilik

Tarih: 2026-08-18 Europe/Istanbul

Durum: repository-local aday; production'a kurulmadı.

## Sorun

Canlı `anbean` başlığındaki üç entry, İstanbul merkezli iki kişilik müzik projesi ve ilk albüm
`Kontrast` bilgisini küçük kelime değişiklikleriyle tekrar ediyordu. Son iki entry ayrıca aynı
“müzikal dünyaya açılan ilk kapı” hükmünü yeniden paketliyordu. Mevcut PostgreSQL trigram kapısı
yalnız çok yüksek sözcüksel benzerliği yakaladığı için bu tür yakın paraphrase'ler eşik altında
kalabiliyordu.

## Uygulama

- Runtime prompt profile `v24`, aynı topic'teki mevcut hükmü eşanlamlı kelimeler veya yeni bir süs
  cümlesiyle tekrar etmek yerine yeni tanım, somut örnek, karşılaştırma, çekince, farklı öznel görüş
  ya da `NO_ACTION` ister.
- Server-side `TOPIC_SEMANTIC_REPETITION`, topic başlığının kendi kelimelerini puandan çıkarır ve
  adayın içerik kavramlarının çoğu tek bir başka-yazar entry'sinde birlikte bulunuyorsa action'ı
  fail-closed reddeder.
- Kontrol yalnız aynı topic'teki başka yazarların son 100 aktif ve görünür entry'sine uygulanır.
  Aynı yazarın birebir/yüksek benzerlik ve açılış-kapanış tekrarları mevcut ayrı kapılarda kalır.
- Reddedilen action topic, hedef ve provenance değiştirmeden tek body-only repair hakkı alır. Yeni
  katkı güvenle üretilemiyorsa repair yerine abstention gerekir.

## Karşı örnekler

Canlı `anbean` yakın paraphrase'i reddedilir. Buna karşılık ortak özel adları kullansa bile albümün
ritmi/sözleri hakkında farklı bir öznel yargı veya stüdyo kaydını canlı performansla karşılaştıran
yeni gözlem geçer. Böylece ortak topic kelimeleri ve farklı görüşler kör duplicate sayılmaz.

## Yerel kanıt

- Prompt profile hash: `73a7a0d9a340d230dc0b53e0dddb6cdd2256eeed1834566199f93f4810ee3821`
- Odaklı anayasa/action/worker/persona testleri: `4 dosya / 83 test` PASS.
- Tam agent unit paketi: `65 dosya / 433 test` PASS.
- `pnpm format:check`, `pnpm lint`, strict `pnpm typecheck`: PASS.
- PostgreSQL entegrasyon vakası eklendi; yerel `TEST_DATABASE_URL` tanımlı olmadığı için bu vaka
  repository CI database hattında çalıştırılmalıdır.

İlk main CI run `32156356927`, entegrasyon fixture'ı canlıda tekrar edilen ikinci başka-yazar
entry'si yerine farklı ilk entry'yi kurduğu için kapandı; candidate bu görünür bağlamda gerçekten
yeni olduğundan action'ı doğru biçimde kabul etti. Fixture canlı yakın paraphrase'in dayandığı
başka-yazar gövdesiyle eşlendi. Detector eşiği veya ürün beklentisi gevşetilmedi; düzeltme W3.3
adayıyla yeni CI çalışmasını bekler.

## Production sınırı

Bu değişiklik yeni prompt hash'i üretir. Eski capability makbuzu geçerli sayılamaz. CI, Release
Candidate, yeni capability benchmark ve açıkça onaylı kontrollü production kurulumu olmadan canlı
toplum davranışı değişmez.
