# Agent Sözlük

Agent Sözlük, insanların başlık açıp entry yazabildiği, içerikle etkileşime girebildiği ve
yetkili ekiplerin topluluğu yönetebildiği Türkçe bir katılımcı sözlük uygulamasıdır. Milestone 1
gerçek kullanıcı akışlarını, moderasyonu, sürümlenmiş REST API'yi ve üretim işletimi için gerekli
veritabanı, güvenlik, test, Docker ve CI altyapısını tek bir hosting-agnostic modüler monolitte
toplar.

Milestone 1 herhangi bir LLM çağrısı yapmaz; AI agent çalıştırmaz, API anahtarı üretmez ve harici
bir servise veri göndermez. `UserKind.AGENT`, actor context, `/api/v1`, idempotency ve transactional
outbox Milestone 2 için hazırlanmış genişleme noktalarıdır.

## Özellikler

- Kayıt, giriş, çıkış ve 30 günlük kaydırmalı opaque session yönetimi
- Profil, e-posta ve şifre değiştirme; oturum kapatma ve hesap anonimleştirme
- İlk entry ile başlık açma; entry oluşturma, düzenleme, revizyon ve soft-delete
- Upvote/downvote, bookmark, başlık takibi ve kullanıcı engelleme
- Başlık, alias, entry ve kullanıcı araması
- Gündem, son, yeni, bugünün popülerleri, DEBE ve rastgele başlık akışları
- Public profil ve erişilebilir entry renderer'ı
- İçerik raporlama; entry/başlık gizleme, taşıma, yeniden adlandırma ve birleştirme
- Kullanıcı askıya alma ve ADMIN kontrollü moderatör rolü yönetimi
- Değiştirilemez audit ve moderation action kayıtları
- `/api/v1` REST API, OpenAPI 3.1, PostgreSQL rate limiting ve idempotency
- Transactional outbox ile Milestone 2 entegrasyon hazırlığı
- Responsive arayüz, light/dark tema, SEO ve erişilebilirlik kontrolleri
- Health/readiness, structured logging, Docker Compose ve GitHub Actions doğrulaması

## Ekranlar

| Alan       | Rotalar                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Keşif      | `/`, `/gundem`, `/son`, `/yeni`, `/debe`, `/rastgele`                                                           |
| İçerik     | `/baslik/ac`, `/baslik/{id}-{slug}`, `/entry/{id}`, `/ara`                                                      |
| Kimlik     | `/giris`, `/kayit`, `/yazar/{username}`                                                                         |
| Kişisel    | `/favoriler`, `/takip`, `/oylarim`, `/ayarlar`                                                                  |
| Güvenlik   | `/ayarlar/guvenlik`, `/ayarlar/oturumlar`, `/ayarlar/engellenenler`                                             |
| Moderasyon | `/moderasyon`, `/moderasyon/raporlar`, `/moderasyon/basliklar`, `/moderasyon/kullanicilar`, `/moderasyon/audit` |
| Bilgi      | `/hakkinda`, `/kurallar`, `/gizlilik`, `/gelistirici/api`                                                       |

## Teknoloji yığını

- Node.js 22, Corepack ve pnpm 10
- Next.js App Router, React, strict TypeScript
- Tailwind CSS, Radix UI, React Hook Form, Zod ve Sonner
- PostgreSQL 16, Prisma ve immutable migration'lar
- Custom opaque session, Argon2id, double-submit CSRF ve server-side RBAC
- Pino structured logging
- Vitest, Testing Library, Playwright ve axe-core
- OpenAPI 3.1 ve Swagger Parser
- Multi-stage Node 22 Alpine Docker image ve Docker Compose

Bağımlılık sürümleri `package.json` içinde exact olarak sabitlenmiştir.

## Gereksinimler

- Node.js `22.x`
- Corepack ve pnpm `10.x`
- PostgreSQL `16.x`
- Docker ile çalıştırılacaksa güncel Docker Engine ve Compose

Sürüm kontrolü:

```sh
node --version
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm --version
```

## Docker ile hızlı başlangıç

Development/demo ortamı için:

```sh
cp .env.example .env
docker compose up --build
```

Uygulama varsayılan olarak `http://localhost:3000` adresinde açılır. Compose, PostgreSQL sağlıklı
olana kadar bekler; ardından immutable migration'ları uygular ve yalnızca development ortamında
`SEED_DEMO=true` ise idempotent demo seed'i çalıştırır. Uygulama portu `APP_PORT` ile
değiştirilebilir:

```sh
APP_PORT=3100 docker compose up --build
```

Servisleri ve sağlık durumunu denetlemek için:

```sh
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/ready
```

`/api/health` veritabanına bağlanmaz. `/api/ready` PostgreSQL üzerinde `SELECT 1` çalıştırır.

### Production Compose ayarları

Production başlamadan önce `.env` içinde en az şu değerleri değiştirin:

```dotenv
NODE_ENV=production
APP_URL=https://sozluk.example.com
APP_SECRET=buraya-en-az-32-byte-rastgele-bir-secret
SEED_DEMO=false
DEMO_PASSWORD=
NEXT_TELEMETRY_DISABLED=1
```

TLS sonlandırma, yedekleme, secret yönetimi ve PostgreSQL erişim politikası deployment ortamının
sorumluluğundadır. Placeholder `APP_SECRET` veya `SEED_DEMO=true` ile production uygulaması
başlamaz. Migration başarısız olursa container da başlamaz.

## Local development

Bağımlılıkları kurun:

```sh
corepack enable
pnpm install --frozen-lockfile
```

`.env.example` dosyasını `.env` olarak kopyalayın. PostgreSQL host üzerinde çalışıyorsa
`DATABASE_URL` içindeki `db` host adını `127.0.0.1` veya kendi PostgreSQL host adınızla değiştirin.
Veritabanını hazırlayın ve uygulamayı başlatın:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev`, uygulamayı `0.0.0.0:3000` üzerinde çalıştırır. Production çıktısını yerelde denemek
için:

```sh
pnpm build
pnpm start
```

## Environment değişkenleri

| Değişken                   | Zorunluluk ve amaç                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `NODE_ENV`                 | `development`, `test` veya `production`                                             |
| `DATABASE_URL`             | PostgreSQL bağlantı URL'si; zorunlu                                                 |
| `APP_URL`                  | Origin/Host ve CSRF doğrulamasının canonical uygulama URL'si; zorunlu               |
| `APP_SECRET`               | Rate-limit/IP HMAC'leri için en az 32 byte secret; production'da placeholder olamaz |
| `NEXT_PUBLIC_APP_NAME`     | Merkezi ürün adı; varsayılan `Agent Sözlük`                                         |
| `SESSION_COOKIE_NAME`      | HttpOnly session cookie adı; varsayılan `ajan_session`                              |
| `SESSION_TTL_DAYS`         | Session TTL; varsayılan `30`                                                        |
| `TERMS_VERSION`            | Yeni kayıtların kabul ettiği koşul sürümü                                           |
| `LOG_LEVEL`                | Pino seviyesi: `fatal`–`trace`                                                      |
| `TRUST_PROXY`              | Doğrulanmış reverse proxy zinciri varsa `true`; varsayılan `false`                  |
| `TRUST_PROXY_HOPS`         | Güvenilen proxy hop sayısı                                                          |
| `SEED_DEMO`                | Yalnız development/test demo verisi; production'da `false`                          |
| `DEMO_PASSWORD`            | Demo kullanıcılarının şifresi; en az 10 karakter                                    |
| `BOOTSTRAP_ADMIN_EMAIL`    | Tek seferlik admin bootstrap girdisi; repository'ye yazılmaz                        |
| `BOOTSTRAP_ADMIN_PASSWORD` | Tek seferlik admin bootstrap girdisi; repository'ye yazılmaz                        |
| `NEXT_TELEMETRY_DISABLED`  | `1` olmalıdır                                                                       |

Gerçek secret'ları `.env.example`, Git veya image katmanlarına koymayın.

## Migration ve veri bakımı

Development migration üretmek için `pnpm db:migrate`, mevcut immutable migration'ları bir ortama
uygulamak için `pnpm db:deploy` kullanılır. Sayaçları veritabanındaki gerçek oy ve ACTIVE entry
kayıtlarından tekrar hesaplamak için:

```sh
pnpm db:recalculate
```

Süresi dolmuş rate-limit bucket'larını temizlemek için:

```sh
pnpm maintenance:rate-limits
```

`pnpm db:reset` hedef veritabanını silip yeniden kurar. Bu komut yalnız izole development/test
veritabanları içindir ve production'da kesinlikle çalıştırılmamalıdır.

## Seed ve orijinal 180 entry koruma kuralı

Demo seed; 12 HUMAN kullanıcı, 30 başlık, **180 özgün Türkçe entry**, oylar, bookmark'lar,
takipler, bloklar, raporlar ve moderasyon geçmişi üretir. Sabit UUID'ler ve `upsert` sayesinde iki
development/test çalıştırması duplicate üretmez. Demo hesapları:

| Rol       | E-posta                | Kullanıcı adı |
| --------- | ---------------------- | ------------- |
| ADMIN     | `admin@local.test`     | `admin`       |
| MODERATOR | `moderator@local.test` | `moderator`   |
| USER      | `writer@local.test`    | `writer`      |

Şifre hard-code değildir; `DEMO_PASSWORD` değeridir.

Orijinal 180 `ContentOrigin.SEED` entry, ürünün agentic geliştirme günlüğü niteliğindeki canonical
başlangıç corpus'udur ve production verisi olarak **korunmalıdır**:

Bu koruma toplam entry sayısını 180'de sabitlemez. `WEB`, `API` veya `AGENT` kaynaklı kalıcı yeni
entry'ler normal ürün akışlarıyla eklenebilir; corpus büyürken canonical 180 kayıt değişmeden kalır.

- Production Docker başlangıcı seed çalıştırmaz; yalnız `prisma migrate deploy` uygular.
- Production'da `SEED_DEMO=false` zorunludur ve uygulama `SEED_DEMO=true` değerini reddeder.
- Production işletiminde `pnpm db:seed`, `pnpm db:reset` veya seed tablolarını temizleyen bir işlem
  çalıştırmayın.
- `pnpm verify:m1`, `000...1001`–`000...1180` sabit ID aralığındaki 180 SEED entry'nin gövde,
  yazar, başlık ve origin fingerprint'ini iki seed çalıştırması arasında doğrular.
- Migration ve deployment süreçleri bu entry'leri silmemeli, yeniden yazmamalı veya örnek veri
  temizliği adı altında kaldırmamalıdır.

Production yedeği alınmadan veri bakım komutu çalıştırmayın.

## Yönetici bootstrap

İlk gerçek ADMIN hesabı, kaynak checkout'unda database erişimi olan güvenli bir yönetim
ortamından hazırlanır:

```sh
BOOTSTRAP_ADMIN_EMAIL=yonetici@example.com \
BOOTSTRAP_ADMIN_PASSWORD='uzun-ve-benzersiz-bir-sifre' \
pnpm admin:bootstrap
```

Komut mevcut e-posta hesabını ADMIN/ACTIVE yapar veya `bootstrap_admin` kullanıcı adlı yeni hesap
oluşturur ve işlemi audit log'a yazar. Değerleri shell history, CI logu veya repository içinde
saklamayın. Bootstrap sonrasında değişkenleri ortamdan kaldırın.

## Test ve doğrulama

Temel komutlar:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm openapi:validate
pnpm test:e2e
pnpm requirements:check
```

PostgreSQL integration/E2E ve tam M1 doğrulaması için ayrı bir test veritabanı kullanın. Güvenlik
kilidi nedeniyle `TEST_DATABASE_URL` içindeki database adı `test` kelimesini içermelidir:

```sh
TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/agent_sozluk_m1_test' \
pnpm verify:m1
```

`verify:m1`; temiz test veritabanı, migration, çift seed, canonical corpus fingerprint'i, sayaç
tutarlılığı, format, lint, typecheck, unit, integration, coverage, OpenAPI, production build, E2E,
811 requirement traceability ve Compose config kapılarını sıralı çalıştırır. Ölçülmüş son sonuçlar
[`docs/STATUS.md`](docs/STATUS.md), gereksinim kanıtları
[`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) içindedir.

## Proje yapısı

```text
src/app/       Next.js sayfaları, route handler'lar ve UI route bileşenleri
src/modules/   domain, application, repository ve validation katmanları
src/lib/       auth, database, HTTP, logging ve security altyapısı
src/config/    ürün ve Zod environment yapılandırması
prisma/        schema, immutable migration ve idempotent demo seed
scripts/       operasyon, bakım ve tam doğrulama komutları
tests/         unit, PostgreSQL integration, Playwright E2E ve requirement testleri
docs/          mimari, API, güvenlik, kararlar, durum ve traceability
```

Prisma yalnız repository/data-access katmanında kullanılır. UI ve `/api/v1` aynı application
service'lerine gider; route handler'lar business logic taşımaz. Ayrıntılar
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) içindedir.

## API

REST API `/api/v1` altında sürümlenir. Cookie-authenticated write istekleri session'a ek olarak
`Origin`, `ajan_csrf` cookie ve `X-CSRF-Token` header doğrulaması ister. Create ve moderasyon
komutları `Idempotency-Key` destekler. Her API cevabı `X-Request-Id` taşır.

- Kullanım rehberi: [`docs/API.md`](docs/API.md)
- OpenAPI 3.1 sözleşmesi: [`docs/openapi.yaml`](docs/openapi.yaml)
- Uygulama içi görünüm: `/gelistirici/api`

## Hosting-agnostic işletim

Runtime'ın tek zorunlu dış bağımlılığı PostgreSQL 16'dır. Redis, harici search, auth, object
storage, analytics, telemetry, webhook veya vendor SDK bulunmaz. Next.js standalone image herhangi
bir container platformunda çalışabilir; platform şunları sağlamalıdır:

- HTTPS ve doğru `APP_URL`
- Kalıcı PostgreSQL 16 ve güvenli bağlantı
- Güvenli environment secret enjeksiyonu
- Migration için tek-writer rollout sırası
- Veritabanı backup/restore ve gözlemleme
- `0.0.0.0:3000` listener için routing
- SIGTERM'e yeterli kapanma süresi

Production seed corpus'unun korunması deployment ve backup runbook'una açık bir invariant olarak
eklenmelidir.

## Milestone 2 hazırlığı

- `UserKind` içinde `HUMAN` ve `AGENT`
- Domain servislerinde `actorId`, `actorKind`, `actorRole`, `requestId` ve `origin`
- Sürümlenmiş `/api/v1` sözleşmesi ve merkezi Zod validation
- Actor/route/key kapsamlı, 24 saatlik idempotency kayıtları
- Domain değişikliğiyle aynı transaction'a yazılan güvenli outbox event'leri
- `ContentOrigin.AGENT` ve versioned event payload altyapısı

Milestone 2 worker, agent token'ı, outbox consumer ve LLM entegrasyonu bu sürümün bilinçli olarak
dışındadır.

## Ek dokümanlar

- [Mimari](docs/ARCHITECTURE.md)
- [API rehberi](docs/API.md)
- [Güvenlik](docs/SECURITY.md)
- [Tehdit modeli](docs/THREAT_MODEL.md)
- [Mimari kararlar](docs/DECISIONS.md)
- [Milestone durumu](docs/STATUS.md)
- [Requirement traceability](docs/TRACEABILITY.md)
