# Milestone 1 requirements

This manifest contains all 811 unique requirement IDs extracted from the owner-supplied goal.

| Requirement  | Source line | Summary                                                                     |
| ------------ | ----------: | --------------------------------------------------------------------------- |
| AI-READY-001 |        2501 | UserKind AGENT enum değeri vardır.                                          |
| AI-READY-002 |        2503 | Milestone 1 public UI/API AGENT oluşturmaz.                                 |
| AI-READY-003 |        2505 | Domain service actor context:                                               |
| AI-READY-004 |        2513 | API versioned `/api/v1`.                                                    |
| AI-READY-005 |        2515 | Merkezi Zod schemas.                                                        |
| AI-READY-006 |        2517 | OpenAPI eşleşmesi.                                                          |
| AI-READY-007 |        2519 | Create commands idempotency.                                                |
| AI-READY-008 |        2521 | Transactional outbox.                                                       |
| AI-READY-009 |        2523 | Agent worker, API token, LLM call ve autonomous posting yoktur.             |
| API-001      |        2119 | POST `/api/v1/auth/register`                                                |
| API-002      |        2120 | POST `/api/v1/auth/login`                                                   |
| API-003      |        2121 | POST `/api/v1/auth/logout`                                                  |
| API-004      |        2122 | GET `/api/v1/auth/session`                                                  |
| API-005      |        2123 | GET `/api/v1/auth/csrf`                                                     |
| API-006      |        2127 | GET `/api/v1/me`                                                            |
| API-007      |        2128 | PATCH `/api/v1/me`                                                          |
| API-008      |        2129 | POST `/api/v1/me/email`                                                     |
| API-009      |        2130 | POST `/api/v1/me/password`                                                  |
| API-010      |        2131 | POST `/api/v1/me/deactivate`                                                |
| API-011      |        2132 | GET `/api/v1/me/sessions`                                                   |
| API-012      |        2133 | DELETE `/api/v1/me/sessions/{sessionId}`                                    |
| API-013      |        2134 | DELETE `/api/v1/me/sessions`                                                |
| API-014      |        2135 | GET `/api/v1/me/bookmarks`                                                  |
| API-015      |        2136 | GET `/api/v1/me/follows`                                                    |
| API-016      |        2137 | GET `/api/v1/me/votes`                                                      |
| API-017      |        2138 | GET `/api/v1/me/blocks`                                                     |
| API-018      |        2139 | PUT `/api/v1/me/blocks/{userId}`                                            |
| API-019      |        2140 | DELETE `/api/v1/me/blocks/{userId}`                                         |
| API-020      |        2144 | GET `/api/v1/users/{username}`                                              |
| API-021      |        2148 | GET `/api/v1/topics`                                                        |
| API-022      |        2155 | POST `/api/v1/topics`                                                       |
| API-023      |        2161 | GET `/api/v1/topics/{topicId}`                                              |
| API-024      |        2163 | GET `/api/v1/topics/{topicId}/entries`                                      |
| API-025      |        2171 | POST `/api/v1/topics/{topicId}/entries`                                     |
| API-026      |        2172 | PUT `/api/v1/topics/{topicId}/follow`                                       |
| API-027      |        2173 | DELETE `/api/v1/topics/{topicId}/follow`                                    |
| API-028      |        2177 | GET `/api/v1/entries/{entryId}`                                             |
| API-029      |        2178 | PATCH `/api/v1/entries/{entryId}`                                           |
| API-030      |        2179 | DELETE `/api/v1/entries/{entryId}`                                          |
| API-031      |        2180 | GET `/api/v1/entries/{entryId}/revisions`                                   |
| API-032      |        2181 | PUT `/api/v1/entries/{entryId}/vote`                                        |
| API-033      |        2185 | DELETE `/api/v1/entries/{entryId}/vote`                                     |
| API-034      |        2186 | PUT `/api/v1/entries/{entryId}/bookmark`                                    |
| API-035      |        2187 | DELETE `/api/v1/entries/{entryId}/bookmark`                                 |
| API-036      |        2191 | GET `/api/v1/search`                                                        |
| API-037      |        2192 | GET `/api/v1/feeds/debe`                                                    |
| API-038      |        2193 | GET `/api/v1/feeds/random`                                                  |
| API-039      |        2197 | POST `/api/v1/reports`                                                      |
| API-040      |        2201 | GET `/api/v1/moderation/dashboard`                                          |
| API-041      |        2202 | GET `/api/v1/moderation/reports`                                            |
| API-042      |        2203 | GET `/api/v1/moderation/reports/{reportId}`                                 |
| API-043      |        2204 | POST `/api/v1/moderation/reports/{reportId}/resolve`                        |
| API-044      |        2205 | POST `/api/v1/moderation/reports/{reportId}/reject`                         |
| API-045      |        2206 | POST `/api/v1/moderation/entries/{entryId}/hide`                            |
| API-046      |        2207 | POST `/api/v1/moderation/entries/{entryId}/restore`                         |
| API-047      |        2208 | POST `/api/v1/moderation/entries/{entryId}/move`                            |
| API-048      |        2209 | POST `/api/v1/moderation/topics/{topicId}/hide`                             |
| API-049      |        2210 | POST `/api/v1/moderation/topics/{topicId}/restore`                          |
| API-050      |        2211 | POST `/api/v1/moderation/topics/{topicId}/rename`                           |
| API-051      |        2212 | POST `/api/v1/moderation/topics/{topicId}/merge`                            |
| API-052      |        2213 | GET `/api/v1/moderation/users`                                              |
| API-053      |        2214 | POST `/api/v1/moderation/users/{userId}/suspend`                            |
| API-054      |        2215 | POST `/api/v1/moderation/users/{userId}/unsuspend`                          |
| API-055      |        2216 | POST `/api/v1/admin/users/{userId}/grant-moderator`                         |
| API-056      |        2217 | POST `/api/v1/admin/users/{userId}/revoke-moderator`                        |
| API-057      |        2218 | GET `/api/v1/moderation/audit`                                              |
| API-058      |        2253 | Tarihler ISO 8601 UTC.                                                      |
| API-059      |        2255 | page default 1, minimum 1.                                                  |
| API-060      |        2257 | pageSize default 20, maximum 100.                                           |
| API-061      |        2259 | Validation 422.                                                             |
| API-062      |        2261 | Authentication 401.                                                         |
| API-063      |        2263 | Authorization 403.                                                          |
| API-064      |        2265 | Not found 404.                                                              |
| API-065      |        2267 | Conflict 409.                                                               |
| API-066      |        2269 | Rate limit 429 ve Retry-After.                                              |
| API-067      |        2271 | Unexpected 500 ve production'da stack trace yok.                            |
| API-068      |        2273 | Her response X-Request-Id.                                                  |
| API-069      |        2275 | Gelen geçerli UUID X-Request-Id korunur; yoksa üret.                        |
| ARCH-001     |         712 | Modular monolith kullan.                                                    |
| ARCH-002     |         714 | Her domain modülü şu katmanlara ayrılmalıdır:                               |
| ARCH-003     |         722 | Business logic'i React component, route handler veya server action içine    |
| ARCH-004     |         725 | UI server action'ları ve `/api/v1` route handler'ları aynı application      |
| ARCH-005     |         728 | Route handler yalnızca:                                                     |
| ARCH-006     |         743 | Prisma yalnızca repository/data-access katmanından kullanılmalıdır.         |
| ARCH-007     |         745 | Client component içinde Prisma veya database import edilmemelidir.          |
| ARCH-008     |         747 | Bütün write işlemlerinde server-side authorization yeniden kontrol          |
| ARCH-009     |         750 | UI'da buton gizlemek authorization kabul edilmemelidir.                     |
| ARCH-010     |         752 | Bütün sınırsız listeler paginate edilmelidir.                               |
| ARCH-011     |         754 | Kritik domain işlemleri database transaction içinde yapılmalıdır.           |
| ARCH-012     |         756 | N+1 sorgulardan kaçın.                                                      |
| AUTH-001     |        1199 | Registration alanları:                                                      |
| AUTH-002     |        1208 | Password:                                                                   |
| AUTH-003     |        1216 | Argon2id parametreleri:                                                     |
| AUTH-004     |        1223 | Eski düşük parametreli hash ile başarılı login sonrası hash'i güncelle.     |
| AUTH-005     |        1225 | Session token 32 cryptographically secure random byte olmalıdır.            |
| AUTH-006     |        1227 | Raw token database'e yazılmamalıdır.                                        |
| AUTH-007     |        1229 | Session.tokenHash SHA-256 olmalıdır.                                        |
| AUTH-008     |        1231 | Session cookie:                                                             |
| AUTH-009     |        1244 | Session sliding expiration:                                                 |
| AUTH-010     |        1250 | Her session için ayrı CSRF token oluştur.                                   |
| AUTH-011     |        1252 | CSRF token hash'ini database'de tut.                                        |
| AUTH-012     |        1254 | Raw CSRF token'ı non-HttpOnly `ajan_csrf` cookie içinde tut.                |
| AUTH-013     |        1256 | Cookie-authenticated POST, PUT, PATCH ve DELETE request'lerinde:            |
| AUTH-014     |        1265 | Login ve registration için Origin/Host doğrulaması yap.                     |
| AUTH-015     |        1267 | Login hatası yalnızca:                                                      |
| AUTH-016     |        1273 | Var olmayan user login denemesinde dummy Argon2 doğrulaması yap.            |
| AUTH-017     |        1275 | Logout session'ı revoke eder ve cookie'leri temizler.                       |
| AUTH-018     |        1277 | Password change:                                                            |
| AUTH-019     |        1283 | Email change:                                                               |
| AUTH-020     |        1290 | Username değiştirilemez.                                                    |
| AUTH-021     |        1292 | Session management ekranı:                                                  |
| AUTH-022     |        1301 | Suspended kullanıcı:                                                        |
| AUTH-023     |        1325 | Deactivated kullanıcı login olamaz.                                         |
| AUTH-024     |        1327 | Account deactivation:                                                       |
| AUTH-025     |        1348 | Production APP_SECRET en az 32 byte değilse uygulama başlamamalıdır.        |
| BLOCK-001    |        1667 | Kullanıcı kendisini block edemez.                                           |
| BLOCK-002    |        1669 | Moderator/admin block edilebilir; moderasyon yetkisi etkilenmez.            |
| BLOCK-003    |        1671 | Block edilen yazarın entry'leri collapsed placeholder olur.                 |
| BLOCK-004    |        1673 | Placeholder üzerinde tek seferlik gösterme aksiyonu vardır.                 |
| BLOCK-005    |        1675 | Block yalnızca viewer içerik görünürlüğünü etkiler.                         |
| BLOCK-006    |        1677 | Block listesi settings içinde yönetilir.                                    |
| BOOKMARK-001 |        1655 | PUT ve DELETE idempotent.                                                   |
| BOOKMARK-002 |        1657 | HIDDEN veya DELETED entry yeni bookmark alamaz.                             |
| BOOKMARK-003 |        1659 | Bookmark listesi yalnızca erişilebilir entry gösterir.                      |
| CI-001       |        2963 | pull_request ve main push.                                                  |
| CI-002       |        2965 | Concurrency ve stale run cancel.                                            |
| CI-003       |        2967 | PostgreSQL 16 service.                                                      |
| CI-004       |        2969 | Frozen lockfile.                                                            |
| CI-005       |        2971 | pnpm store cache.                                                           |
| CI-006       |        2973 | CI sırası:                                                                  |
| CI-007       |        2992 | Failure başarılı gösterilemez.                                              |
| CI-008       |        2994 | Playwright failure artifact upload.                                         |
| CI-009       |        2996 | Coverage artifact upload.                                                   |
| CI-010       |        2998 | CI hiçbir deployment, release, package publish, e-posta veya harici         |
| CI-011       |        3001 | CI yalnızca repository validation yapar.                                    |
| DATA-001     |         847 | Public registration yalnızca:                                               |
| DATA-002     |         855 | Client request'inden kind, role veya status kabul edilmez.                  |
| DATA-003     |         857 | Username:                                                                   |
| DATA-004     |         865 | Display name:                                                               |
| DATA-005     |         872 | Bio maksimum 500 karakterdir.                                               |
| DATA-006     |         915 | Topic title normalization sırası:                                           |
| DATA-007     |         924 | Normalize edilmiş title 2–100 karakter olmalıdır.                           |
| DATA-008     |         926 | Duplicate kontrolü hem Topic.normalizedTitle hem                            |
| DATA-009     |         929 | Topic create ve rename yarış durumunu engellemek için transaction           |
| DATA-010     |         933 | Slug oluşturma:                                                             |
| DATA-011     |         945 | Canonical topic URL:                                                        |
| DATA-012     |         949 | URL'deki slug güncel değilse 308 canonical redirect yap.                    |
| DATA-013     |         978 | Entry body:                                                                 |
| DATA-014     |         989 | Body değişmemişse revision oluşturma.                                       |
| DATA-015     |         991 | Entry update öncesindeki body EntryRevision'a yazılmalıdır.                 |
| DATA-016     |         993 | Revision geçmişini yalnızca:                                                |
| DATA-017     |        1052 | OTHER reason için details 10–1000 karakter zorunlu.                         |
| DATA-018     |        1054 | Aynı kullanıcı aynı hedef için aynı anda yalnızca bir OPEN report           |
| DATA-019     |        1057 | Report target gerçekten var olmalıdır.                                      |
| DATA-020     |        1083 | AuditLog uygulama üzerinden update veya delete edilemez.                    |
| DATA-021     |        1085 | Audit metadata şunları içeremez:                                            |
| DATA-022     |        1111 | Outbox event domain değişikliğiyle aynı transaction içinde yazılmalıdır.    |
| DATA-023     |        1113 | Outbox payload hassas veri içeremez.                                        |
| DB-001       |        1148 | Email uniqueness emailNormalized üzerinden.                                 |
| DB-002       |        1150 | Username uniqueness usernameNormalized üzerinden.                           |
| DB-003       |        1152 | Topic uniqueness normalizedTitle üzerinden.                                 |
| DB-004       |        1154 | PostgreSQL migration içinde şunları etkinleştir:                            |
| DB-005       |        1159 | Şu index'leri oluştur:                                                      |
| DB-006       |        1181 | Topic.entryCount yalnızca ACTIVE entry sayısıdır.                           |
| DB-007       |        1183 | Entry.score = upvoteCount - downvoteCount.                                  |
| DB-008       |        1185 | HIDDEN ve DELETED entry'ler entryCount'a dahil edilmez.                     |
| DB-009       |        1187 | Topic.lastEntryAt en yeni ACTIVE entry'nin createdAt değeridir.             |
| DB-010       |        1189 | Sayaçları transaction içinde atomik güncelle.                               |
| DB-011       |        1191 | Sayaçları yeniden hesaplayan idempotent script oluştur:                     |
| DEC-001      |         321 | Kullanıcıya clarification sorma.                                            |
| DEC-002      |         323 | Kullanıcıdan onay bekleme.                                                  |
| DEC-003      |         325 | Aşağıda kilitlenmiş teknoloji, route, veri modeli, güvenlik, UI davranışı   |
| DEC-004      |         328 | Belirtilen teknolojiyi başka bir ürünle değiştirme.                         |
| DEC-005      |         341 | Beta, alpha, canary, nightly veya release candidate dependency kullanma.    |
| DEC-006      |         343 | Node.js 22 ile uyumlu kararlı paket sürümleri kullan.                       |
| DEC-007      |         345 | package.json dependency sürümlerini exact version olarak sabitle.           |
| DEC-008      |         355 | Bir gereksinim zor görünüyorsa kapsamdan çıkarma.                           |
| DEC-009      |         357 | Zorunlu bir özellik için mock, placeholder veya sahte başarı üretme.        |
| DEC-010      |         359 | Required özelliklerde şunları bırakma:                                      |
| DEC-011      |         372 | Testi geçirmek için:                                                        |
| DEC-012      |         382 | Requirement çakışması görülürse şu öncelik sırasını kullan:                 |
| DEC-013      |         393 | Çakışmayı `docs/DECISIONS.md` içine kaydet ve en güvenli yaklaşımı uygula.  |
| DEC-014      |         395 | Her faz sonunda ilgili testleri, lint ve typecheck'i çalıştır.              |
| DEC-015      |         397 | Başarısız doğrulamayı düzeltmeden sonraki faza geçme.                       |
| DEC-016      |         399 | Son durumda bütün git diff'i güvenlik, veri bütünlüğü, performans ve        |
| DOC-001      |        3009 | `README.md`                                                                 |
| DOC-002      |        3031 | `AGENTS.md`                                                                 |
| DOC-003      |        3042 | `docs/PLAN.md`                                                              |
| DOC-004      |        3050 | `docs/ARCHITECTURE.md`                                                      |
| DOC-005      |        3067 | `docs/DECISIONS.md`                                                         |
| DOC-006      |        3074 | `docs/API.md`                                                               |
| DOC-007      |        3084 | `docs/openapi.yaml`                                                         |
| DOC-008      |        3095 | `docs/SECURITY.md`                                                          |
| DOC-009      |        3108 | `docs/STATUS.md`                                                            |
| DOC-010      |        3124 | `docs/M1_REQUIREMENTS.md`                                                   |
| DOC-011      |        3128 | `docs/TRACEABILITY.md`                                                      |
| DOC-012      |        3139 | `docs/THREAT_MODEL.md`                                                      |
| DOCKER-001   |        2632 | Multi-stage Dockerfile.                                                     |
| DOCKER-002   |        2634 | Node 22 Alpine.                                                             |
| DOCKER-003   |        2636 | Corepack pnpm.                                                              |
| DOCKER-004   |        2638 | Frozen lockfile.                                                            |
| DOCKER-005   |        2640 | Minimal runtime image.                                                      |
| DOCKER-006   |        2642 | Non-root user.                                                              |
| DOCKER-007   |        2644 | Next standalone.                                                            |
| DOCKER-008   |        2646 | `.dockerignore`.                                                            |
| DOCKER-009   |        2648 | docker-compose services:                                                    |
| DOCKER-010   |        2653 | postgres:16-alpine.                                                         |
| DOCKER-011   |        2655 | Named persistent volume.                                                    |
| DOCKER-012   |        2657 | db healthcheck pg_isready.                                                  |
| DOCKER-013   |        2659 | app db healthy dependency.                                                  |
| DOCKER-014   |        2661 | app healthcheck `/api/health`.                                              |
| DOCKER-015   |        2663 | Development startup:                                                        |
| DOCKER-016   |        2670 | Tek komut:                                                                  |
| DOCKER-017   |        2675 | Production demo seed çalıştırmaz.                                           |
| DOCKER-018   |        2677 | Migration fail ise app başlamaz.                                            |
| DOCKER-019   |        2679 | Docker image hiçbir external service credential içermez.                    |
| DONE-001     |        3285 | Doğru repository.                                                           |
| DONE-002     |        3286 | Origin URL doğru.                                                           |
| DONE-003     |        3287 | Working branch doğru.                                                       |
| DONE-004     |        3288 | Main doğrudan değiştirilmemiş.                                              |
| DONE-005     |        3289 | Clean dependency install.                                                   |
| DONE-006     |        3290 | Frozen lockfile.                                                            |
| DONE-007     |        3291 | Prisma generate.                                                            |
| DONE-008     |        3292 | Clean DB migration.                                                         |
| DONE-009     |        3293 | Seed first run.                                                             |
| DONE-010     |        3294 | Seed second run duplicate olmadan.                                          |
| DONE-011     |        3295 | Registration.                                                               |
| DONE-012     |        3296 | Login.                                                                      |
| DONE-013     |        3297 | Logout.                                                                     |
| DONE-014     |        3298 | Session revoke.                                                             |
| DONE-015     |        3299 | Password change.                                                            |
| DONE-016     |        3300 | Account deactivation.                                                       |
| DONE-017     |        3301 | Topic + first entry transaction.                                            |
| DONE-018     |        3302 | Duplicate topic prevention.                                                 |
| DONE-019     |        3303 | Entry create.                                                               |
| DONE-020     |        3304 | Entry edit/revision.                                                        |
| DONE-021     |        3305 | Entry soft-delete.                                                          |
| DONE-022     |        3306 | Vote create/change/delete.                                                  |
| DONE-023     |        3307 | Bookmark.                                                                   |
| DONE-024     |        3308 | Follow.                                                                     |
| DONE-025     |        3309 | Block.                                                                      |
| DONE-026     |        3310 | Search all types.                                                           |
| DONE-027     |        3311 | Trending formula.                                                           |
| DONE-028     |        3312 | DEBE timezone.                                                              |
| DONE-029     |        3313 | Random topic.                                                               |
| DONE-030     |        3314 | Report.                                                                     |
| DONE-031     |        3315 | Resolve/reject.                                                             |
| DONE-032     |        3316 | Entry hide/restore.                                                         |
| DONE-033     |        3317 | Topic hide/restore.                                                         |
| DONE-034     |        3318 | Topic rename/alias.                                                         |
| DONE-035     |        3319 | Topic merge/redirect.                                                       |
| DONE-036     |        3320 | Entry move.                                                                 |
| DONE-037     |        3321 | Suspend/unsuspend.                                                          |
| DONE-038     |        3322 | Role grant/revoke.                                                          |
| DONE-039     |        3323 | Last admin guard.                                                           |
| DONE-040     |        3324 | Transactional outbox.                                                       |
| DONE-041     |        3325 | Audit logs.                                                                 |
| DONE-042     |        3326 | PostgreSQL rate limit.                                                      |
| DONE-043     |        3327 | CSRF.                                                                       |
| DONE-044     |        3328 | Object-level authorization.                                                 |
| DONE-045     |        3329 | All API endpoints.                                                          |
| DONE-046     |        3330 | OpenAPI alignment.                                                          |
| DONE-047     |        3331 | Desktop UI.                                                                 |
| DONE-048     |        3332 | Mobile UI.                                                                  |
| DONE-049     |        3333 | Light/dark.                                                                 |
| DONE-050     |        3334 | Loading/empty/error/forbidden states.                                       |
| DONE-051     |        3335 | Accessibility.                                                              |
| DONE-052     |        3336 | SEO.                                                                        |
| DONE-053     |        3337 | Health.                                                                     |
| DONE-054     |        3338 | Ready.                                                                      |
| DONE-055     |        3339 | Format success.                                                             |
| DONE-056     |        3340 | Lint zero errors and warnings.                                              |
| DONE-057     |        3341 | Typecheck.                                                                  |
| DONE-058     |        3342 | Unit.                                                                       |
| DONE-059     |        3343 | Integration.                                                                |
| DONE-060     |        3344 | Coverage.                                                                   |
| DONE-061     |        3345 | E2E.                                                                        |
| DONE-062     |        3346 | Production build.                                                           |
| DONE-063     |        3347 | Docker build.                                                               |
| DONE-064     |        3348 | Compose config.                                                             |
| DONE-065     |        3349 | Compose app/db startup.                                                     |
| DONE-066     |        3350 | CI valid.                                                                   |
| DONE-067     |        3351 | No secrets.                                                                 |
| DONE-068     |        3352 | No TODO/FIXME/placeholders.                                                 |
| DONE-069     |        3353 | No critical production vulnerabilities.                                     |
| DONE-070     |        3354 | All requirements PASS.                                                      |
| DONE-071     |        3355 | README usable.                                                              |
| DONE-072     |        3356 | STATUS contains real results.                                               |
| DONE-073     |        3357 | Logical commits.                                                            |
| DONE-074     |        3358 | Working tree clean.                                                         |
| DONE-075     |        3359 | Git diff self-review.                                                       |
| DONE-076     |        3360 | Security self-review.                                                       |
| DONE-077     |        3361 | No side-effecting write outside permitted GitHub repository.                |
| DONE-078     |        3362 | No external messages, e-mails, tasks, uploads or deployments.               |
| DONE-079     |        3363 | GitHub access exists ise branch pushed.                                     |
| DONE-080     |        3364 | GitHub access exists ise draft PR created.                                  |
| DONE-081     |        3365 | Main branch not merged.                                                     |
| E2E-001      |        2885 | Visitor homepage.                                                           |
| E2E-002      |        2886 | Open topic from trending.                                                   |
| E2E-003      |        2887 | Search topic.                                                               |
| E2E-004      |        2888 | Search entry.                                                               |
| E2E-005      |        2889 | Register.                                                                   |
| E2E-006      |        2890 | Login/logout.                                                               |
| E2E-007      |        2891 | Create topic + first entry.                                                 |
| E2E-008      |        2892 | Add entry.                                                                  |
| E2E-009      |        2893 | Edit entry.                                                                 |
| E2E-010      |        2894 | View revisions.                                                             |
| E2E-011      |        2895 | Upvote/change/downvote/remove.                                              |
| E2E-012      |        2896 | Bookmark and favorites.                                                     |
| E2E-013      |        2897 | Follow and following list.                                                  |
| E2E-014      |        2898 | Block author and collapsed entry.                                           |
| E2E-015      |        2899 | Report entry.                                                               |
| E2E-016      |        2900 | Moderator hide and resolve.                                                 |
| E2E-017      |        2901 | Hidden entry invisible.                                                     |
| E2E-018      |        2902 | Restore entry.                                                              |
| E2E-019      |        2903 | Admin suspend.                                                              |
| E2E-020      |        2904 | Suspended write blocked.                                                    |
| E2E-021      |        2905 | Admin unsuspend.                                                            |
| E2E-022      |        2906 | Grant/revoke moderator.                                                     |
| E2E-023      |        2907 | Topic rename redirect.                                                      |
| E2E-024      |        2908 | Topic merge redirect.                                                       |
| E2E-025      |        2909 | Profile update.                                                             |
| E2E-026      |        2910 | Password change.                                                            |
| E2E-027      |        2911 | Session revoke.                                                             |
| E2E-028      |        2912 | Mobile drawer.                                                              |
| E2E-029      |        2913 | Mobile content creation.                                                    |
| E2E-030      |        2914 | Light/dark mode.                                                            |
| E2E-031      |        2915 | Public axe serious/critical zero.                                           |
| E2E-032      |        2916 | Auth/moderation axe serious/critical zero.                                  |
| E2E-033      |        2917 | Keyboard navigation.                                                        |
| E2E-034      |        2918 | 404/error state.                                                            |
| E2E-035      |        2919 | DEBE data.                                                                  |
| ENTRY-001    |        1539 | ACTIVE kullanıcı ACTIVE topic'e entry ekleyebilir.                          |
| ENTRY-002    |        1541 | HIDDEN topic'e entry eklenemez.                                             |
| ENTRY-003    |        1543 | MERGED topic'e entry create denemesi 409 ve canonical target döndürür.      |
| ENTRY-004    |        1545 | Entry body 10–10.000 karakter.                                              |
| ENTRY-005    |        1547 | Entry düz metin saklanır.                                                   |
| ENTRY-006    |        1549 | Renderer:                                                                   |
| ENTRY-007    |        1563 | HTML tag'ları çalıştırılmaz; metin olarak görünür.                          |
| ENTRY-008    |        1565 | Server ve client renderer aynı güvenlik davranışına sahip olmalıdır.        |
| ENTRY-009    |        1567 | Entry card:                                                                 |
| ENTRY-010    |        1582 | Permalink:                                                                  |
| ENTRY-011    |        1586 | Permalink sayfası canonical topic ve entry anchor bağlantısı gösterir.      |
| ENTRY-012    |        1588 | Entry edit:                                                                 |
| ENTRY-013    |        1598 | Entry delete:                                                               |
| ENTRY-014    |        1610 | DELETED entry body yalnızca yazar, moderator ve admin'e görünür.            |
| ENTRY-015    |        1612 | HIDDEN entry:                                                               |
| ENTRY-016    |        1620 | Entry move:                                                                 |
| ENV-001      |        2618 | Zod env validation.                                                         |
| ENV-002      |        2620 | Production:                                                                 |
| EVENT-001    |        2482 | topic.created                                                               |
| EVENT-002    |        2483 | topic.renamed                                                               |
| EVENT-003    |        2484 | topic.hidden                                                                |
| EVENT-004    |        2485 | topic.restored                                                              |
| EVENT-005    |        2486 | topic.merged                                                                |
| EVENT-006    |        2487 | entry.created                                                               |
| EVENT-007    |        2488 | entry.updated                                                               |
| EVENT-008    |        2489 | entry.deleted                                                               |
| EVENT-009    |        2490 | entry.hidden                                                                |
| EVENT-010    |        2491 | entry.restored                                                              |
| EVENT-011    |        2492 | entry.moved                                                                 |
| EVENT-012    |        2493 | entry.voted                                                                 |
| EVENT-013    |        2494 | report.created                                                              |
| EVENT-014    |        2495 | moderation.completed                                                        |
| EVENT-015    |        2496 | user.suspended                                                              |
| EVENT-016    |        2497 | user.unsuspended                                                            |
| EVENT-017    |        2498 | user.role_changed                                                           |
| EVENT-018    |        2499 | user.deactivated                                                            |
| EXTERNAL-001 |         214 | GitHub dışındaki hiçbir sisteme mesaj, e-posta, yorum, bildirim,            |
| EXTERNAL-002 |         217 | Aşağıdaki sistemlerde hiçbir create, send, post, publish, upload,           |
| EXTERNAL-003 |         256 | E-posta gönderme veya Gmail draft oluşturma.                                |
| EXTERNAL-004 |         258 | Slack mesajı veya Slack draft'ı oluşturma.                                  |
| EXTERNAL-005 |         260 | Takvim etkinliği oluşturma, değiştirme veya silme.                          |
| EXTERNAL-006 |         262 | Jira ticket veya Confluence sayfası oluşturma ya da güncelleme.             |
| EXTERNAL-007 |         264 | Google Drive, Docs, Sheets veya Slides üzerinde dosya oluşturma,            |
| EXTERNAL-008 |         267 | Figma dosyası veya diagram oluşturma ya da değiştirme.                      |
| EXTERNAL-009 |         269 | Hosting ortamına deploy etme.                                               |
| EXTERNAL-010 |         271 | Vercel, Netlify, Render, Railway, Fly.io, AWS, GCP, Azure,                  |
| EXTERNAL-011 |         274 | DNS kaydı, domain ayarı, SSL sertifikası veya CDN ayarı değiştirme.         |
| EXTERNAL-012 |         276 | NPM, GitHub Packages, Docker Hub veya başka registry'ye package,            |
| EXTERNAL-013 |         279 | Herhangi bir webhook çağırma.                                               |
| EXTERNAL-014 |         281 | Uygulamaya harici webhook, telemetry, analytics veya tracking               |
| EXTERNAL-015 |         284 | Test amacıyla bile gerçek üçüncü taraf endpoint'e veri gönderme.            |
| EXTERNAL-016 |         286 | Harici serviste kullanıcı, token, API key, integration veya app             |
| EXTERNAL-017 |         289 | Bu yasağı aşmak için browser automation, curl, CLI, MCP connector,          |
| EXTERNAL-018 |         292 | GitHub üzerindeki izin verilen write kapsamı yalnızca şunlardır:            |
| EXTERNAL-019 |         298 | Başka bir GitHub repository, organization, gist veya kullanıcının           |
| EXTERNAL-020 |         301 | Public teknik dokümantasyon, package metadata ve güvenlik                   |
| EXTERNAL-021 |         304 | Dependency indirme ve read-only package registry erişimi serbesttir.        |
| EXTERNAL-022 |         306 | Kullanılan framework ve dependency telemetry'lerini kapat.                  |
| EXTERNAL-023 |         314 | Uygulama runtime'ı varsayılan olarak hiçbir üçüncü taraf servise            |
| FEED-001     |        1732 | Gündem rolling 24 saat üzerinden hesaplanır.                                |
| FEED-002     |        1760 | `/son`: lastEntryAt DESC.                                                   |
| FEED-003     |        1762 | `/yeni`: createdAt DESC.                                                    |
| FEED-004     |        1764 | Bugünün popülerleri Europe/Istanbul gün başlangıcından itibaren aynı        |
| FEED-005     |        1767 | `/debe` bir önceki Europe/Istanbul takvim gününde oluşturulmuş ACTIVE       |
| FEED-006     |        1779 | `/rastgele` ACTIVE topic seçer ve 302 redirect yapar.                       |
| FEED-007     |        1781 | Topic feed listeleri maksimum 30 sonuç.                                     |
| FOLLOW-001   |        1661 | PUT ve DELETE idempotent.                                                   |
| FOLLOW-002   |        1663 | Yalnızca ACTIVE topic follow edilir.                                        |
| FOLLOW-003   |        1665 | MERGED topic follow target bilgisi döndürür.                                |
| ID-001       |        3152 | ` biçimindeki requirement ID'lerini                                         |
| IDEMP-001    |        2310 | Idempotency-Key destekleyen endpoint'ler:                                   |
| IDEMP-002    |        2317 | UI UUID tabanlı key üretir.                                                 |
| IDEMP-003    |        2319 | Scope actorId + route + key.                                                |
| IDEMP-004    |        2321 | Canonical JSON request hash.                                                |
| IDEMP-005    |        2323 | Aynı key ve aynı body replay response döndürür.                             |
| IDEMP-006    |        2325 | Replay header:                                                              |
| IDEMP-007    |        2329 | Aynı key farklı body: 409 IDEMPOTENCY_CONFLICT.                             |
| IDEMP-008    |        2331 | TTL 24 saat.                                                                |
| IT-001       |        2827 | Registration success.                                                       |
| IT-002       |        2828 | Duplicate email case-insensitive.                                           |
| IT-003       |        2829 | Duplicate username.                                                         |
| IT-004       |        2830 | Role escalation prevention.                                                 |
| IT-005       |        2831 | Login.                                                                      |
| IT-006       |        2832 | Generic invalid login.                                                      |
| IT-007       |        2833 | Session create/revoke.                                                      |
| IT-008       |        2834 | Password change revokes others.                                             |
| IT-009       |        2835 | Topic + first entry transaction.                                            |
| IT-010       |        2836 | Duplicate topic race.                                                       |
| IT-011       |        2837 | Alias duplicate.                                                            |
| IT-012       |        2838 | Entry create.                                                               |
| IT-013       |        2839 | Entry edit revision.                                                        |
| IT-014       |        2840 | Unchanged edit no revision.                                                 |
| IT-015       |        2841 | Soft-delete counter.                                                        |
| IT-016       |        2842 | Vote create.                                                                |
| IT-017       |        2843 | Same vote idempotency.                                                      |
| IT-018       |        2844 | Vote change.                                                                |
| IT-019       |        2845 | Vote delete.                                                                |
| IT-020       |        2846 | Own entry vote blocked.                                                     |
| IT-021       |        2847 | Bookmark idempotency.                                                       |
| IT-022       |        2848 | Follow idempotency.                                                         |
| IT-023       |        2849 | User block.                                                                 |
| IT-024       |        2850 | Block collapse data.                                                        |
| IT-025       |        2851 | Search topic.                                                               |
| IT-026       |        2852 | Search alias.                                                               |
| IT-027       |        2853 | Search user.                                                                |
| IT-028       |        2854 | Search entry.                                                               |
| IT-029       |        2855 | Hidden/deleted exclusion.                                                   |
| IT-030       |        2856 | Report create.                                                              |
| IT-031       |        2857 | Duplicate open report.                                                      |
| IT-032       |        2858 | Suspended write restrictions.                                               |
| IT-033       |        2859 | Entry hide/restore.                                                         |
| IT-034       |        2860 | Topic hide/restore.                                                         |
| IT-035       |        2861 | Topic rename alias.                                                         |
| IT-036       |        2862 | Topic merge.                                                                |
| IT-037       |        2863 | Entry move.                                                                 |
| IT-038       |        2864 | Moderator suspend user.                                                     |
| IT-039       |        2865 | Moderator cannot act on admin.                                              |
| IT-040       |        2866 | Admin moderator grant/revoke.                                               |
| IT-041       |        2867 | Last admin race.                                                            |
| IT-042       |        2868 | ModerationAction and AuditLog.                                              |
| IT-043       |        2869 | Correct OutboxEvents.                                                       |
| IT-044       |        2870 | Idempotency replay.                                                         |
| IT-045       |        2871 | Idempotency conflict.                                                       |
| IT-046       |        2872 | Missing CSRF rejected.                                                      |
| IT-047       |        2873 | Invalid Origin rejected.                                                    |
| IT-048       |        2874 | Rate limit 429.                                                             |
| IT-049       |        2875 | Account anonymization.                                                      |
| IT-050       |        2876 | Vote score recalculation.                                                   |
| IT-051       |        2877 | Health.                                                                     |
| IT-052       |        2878 | Ready.                                                                      |
| IT-053       |        2879 | No passwordHash in API.                                                     |
| MOD-001      |        1801 | Moderation dashboard sayaçları:                                             |
| MOD-002      |        1810 | Report filters:                                                             |
| MOD-003      |        1818 | Report detail:                                                              |
| MOD-004      |        1830 | Resolve/reject için 10–1000 karakter resolutionNote.                        |
| MOD-005      |        1832 | Resolve/reject transaction:                                                 |
| MOD-006      |        1839 | Entry hide/restore reason zorunlu.                                          |
| MOD-007      |        1841 | Topic hide/restore reason zorunlu.                                          |
| MOD-008      |        1843 | User suspend:                                                               |
| MOD-009      |        1851 | Unsuspend reason zorunlu.                                                   |
| MOD-010      |        1853 | Role grant/revoke:                                                          |
| MOD-011      |        1863 | Bütün moderation endpoint'leri object-level authorization uygular.          |
| MOD-012      |        1865 | Moderation sayfaları noindex.                                               |
| MOD-013      |        1867 | Moderation listeleri paginate edilir.                                       |
| MOD-014      |        1869 | ModerationAction immutable.                                                 |
| MOD-015      |        1871 | Audit filters:                                                              |
| OPS-001      |        2554 | GET `/api/health`:                                                          |
| OPS-002      |        2564 | GET `/api/ready`:                                                           |
| OPS-003      |        2571 | Log fields:                                                                 |
| OPS-004      |        2583 | Startup env validation:                                                     |
| OPS-005      |        2589 | App `0.0.0.0:3000`.                                                         |
| OPS-006      |        2591 | Graceful shutdown.                                                          |
| OPS-007      |        2593 | Sensitive query parameter redaction.                                        |
| OUT-001      |         529 | LLM bağlantısı.                                                             |
| OUT-002      |         530 | AI agent çalıştırma.                                                        |
| OUT-003      |         531 | Autonomous posting.                                                         |
| OUT-004      |         532 | Agent API key ekranı.                                                       |
| OUT-005      |         533 | Agent worker.                                                               |
| OUT-006      |         534 | Outbox consumer.                                                            |
| OUT-007      |         535 | Chat.                                                                       |
| OUT-008      |         536 | Özel mesaj.                                                                 |
| OUT-009      |         537 | Gerçek zamanlı notification.                                                |
| OUT-010      |         538 | WebSocket.                                                                  |
| OUT-011      |         539 | E-posta gönderimi.                                                          |
| OUT-012      |         540 | Email verification.                                                         |
| OUT-013      |         541 | Forgot-password email.                                                      |
| OUT-014      |         542 | Sosyal OAuth.                                                               |
| OUT-015      |         543 | Mobil native uygulama.                                                      |
| OUT-016      |         544 | PWA.                                                                        |
| OUT-017      |         545 | Offline mode.                                                               |
| OUT-018      |         546 | Ödeme.                                                                      |
| OUT-019      |         547 | Abonelik.                                                                   |
| OUT-020      |         548 | Reklam.                                                                     |
| OUT-021      |         549 | Medya upload.                                                               |
| OUT-022      |         550 | Avatar upload.                                                              |
| OUT-023      |         551 | Entry yorumları.                                                            |
| OUT-024      |         552 | Emoji reaction.                                                             |
| OUT-025      |         553 | Entry draft.                                                                |
| OUT-026      |         554 | Hashtag.                                                                    |
| OUT-027      |         555 | Topic kategorisi.                                                           |
| OUT-028      |         556 | Çok dilli UI.                                                               |
| OUT-029      |         557 | Harici analytics.                                                           |
| OUT-030      |         558 | Harici search service.                                                      |
| OUT-031      |         559 | Redis zorunluluğu.                                                          |
| OUT-032      |         560 | Vendor-specific deployment.                                                 |
| OUT-033      |         561 | Kullanıcı username değiştirme.                                              |
| OUT-034      |         562 | Normal kullanıcı topic rename.                                              |
| OUT-035      |         563 | Moderatörün entry metnini değiştirmesi.                                     |
| OUT-036      |         564 | Ekşi Sözlük'ün bütün tarihsel özellikleriyle tam parity.                    |
| PAGE-001     |        1883 | `/`                                                                         |
| PAGE-002     |        1886 | `/gundem`                                                                   |
| PAGE-003     |        1889 | `/son`                                                                      |
| PAGE-004     |        1892 | `/yeni`                                                                     |
| PAGE-005     |        1895 | `/debe`                                                                     |
| PAGE-006     |        1898 | `/rastgele`                                                                 |
| PAGE-007     |        1901 | `/baslik/ac`                                                                |
| PAGE-008     |        1904 | `/baslik/[topicId]-[slug]`                                                  |
| PAGE-009     |        1907 | `/entry/[id]`                                                               |
| PAGE-010     |        1910 | `/ara?q=&type=&page=`                                                       |
| PAGE-011     |        1913 | `/yazar/[username]`                                                         |
| PAGE-012     |        1916 | `/giris`                                                                    |
| PAGE-013     |        1919 | `/kayit`                                                                    |
| PAGE-014     |        1922 | `/favoriler`                                                                |
| PAGE-015     |        1925 | `/takip`                                                                    |
| PAGE-016     |        1928 | `/oylarim`                                                                  |
| PAGE-017     |        1931 | `/ayarlar`                                                                  |
| PAGE-018     |        1934 | `/ayarlar/guvenlik`                                                         |
| PAGE-019     |        1937 | `/ayarlar/oturumlar`                                                        |
| PAGE-020     |        1940 | `/ayarlar/engellenenler`                                                    |
| PAGE-021     |        1943 | `/moderasyon`                                                               |
| PAGE-022     |        1946 | `/moderasyon/raporlar`                                                      |
| PAGE-023     |        1949 | `/moderasyon/raporlar/[id]`                                                 |
| PAGE-024     |        1952 | `/moderasyon/basliklar`                                                     |
| PAGE-025     |        1955 | `/moderasyon/kullanicilar`                                                  |
| PAGE-026     |        1958 | `/moderasyon/audit`                                                         |
| PAGE-027     |        1961 | `/hakkinda`                                                                 |
| PAGE-028     |        1964 | `/kurallar`                                                                 |
| PAGE-029     |        1967 | `/gizlilik`                                                                 |
| PAGE-030     |        1970 | `/gelistirici/api`                                                          |
| PAGE-031     |        1973 | Custom 404.                                                                 |
| PAGE-032     |        1975 | Global error page.                                                          |
| PAGE-033     |        1977 | Forbidden page.                                                             |
| PERM-001     |        1354 | VISITOR:                                                                    |
| PERM-002     |        1364 | ACTIVE USER:                                                                |
| PERM-003     |        1379 | Kullanıcı kendi entry'sine oy veremez.                                      |
| PERM-004     |        1381 | Kullanıcı yalnızca ACTIVE durumdaki kendi entry'sini edit/delete edebilir.  |
| PERM-005     |        1383 | MODERATOR:                                                                  |
| PERM-006     |        1397 | MODERATOR:                                                                  |
| PERM-007     |        1405 | ADMIN:                                                                      |
| PERM-008     |        1412 | UI veya API üzerinden ADMIN rolü verilemez.                                 |
| PERM-009     |        1414 | Admin kendi rolünü değiştiremez.                                            |
| PERM-010     |        1416 | Son aktif ADMIN:                                                            |
| PERM-011     |        1422 | Son admin guard yarış durumuna karşı SERIALIZABLE transaction veya          |
| PROD-001     |         406 | Ürünün adı `Agent Sözlük` olacaktır.                                        |
| PROD-002     |         408 | Varsayılan application name:                                                |
| PROD-003     |         412 | Ürün adı merkezi config dışında hard-code edilmemelidir.                    |
| PROD-004     |         414 | Slug, package ve service adlarında ASCII biçim kullan:                      |
| PROD-005     |         418 | Uygulamanın bütün kullanıcı arayüzü Türkçe olacaktır.                       |
| PROD-006     |         420 | Varsayılan locale `tr-TR` olacaktır.                                        |
| PROD-007     |         422 | Varsayılan timezone `Europe/Istanbul` olacaktır.                            |
| PROD-008     |         424 | Bütün timestamp değerleri database'de UTC tutulacaktır.                     |
| PROD-009     |         426 | Uygulama başlık ve entry tabanlı katılımcı sözlük olacaktır.                |
| PROD-010     |         428 | Ekşi Sözlük'ün:                                                             |
| PROD-011     |         442 | Yalnızca katılımcı sözlük ürün modeli örnek alınacaktır.                    |
| PROD-012     |         444 | Tasarım özgün, modern, erişilebilir ve içerik odaklı olacaktır.             |
| PROD-013     |         446 | package.json içinde `"private": true` bulunacaktır.                         |
| PROD-014     |         448 | Otomatik LICENSE dosyası oluşturma.                                         |
| PROFILE-001  |        2091 | Public profile:                                                             |
| PROFILE-002  |        2103 | Email public response içinde asla görünmez.                                 |
| PROFILE-003  |        2105 | Profile entry listesi paginate edilir.                                      |
| PROFILE-004  |        2107 | Block action vardır.                                                        |
| PROFILE-005  |        2109 | Moderator/admin moderation shortcut görebilir.                              |
| QA-001       |        2925 | Production business logic mock'lanmaz.                                      |
| QA-002       |        2927 | Tests independent.                                                          |
| QA-003       |        2929 | Test order independent.                                                     |
| QA-004       |        2931 | Fixed sleep yok.                                                            |
| QA-005       |        2933 | PostgreSQL test version 16.                                                 |
| QA-006       |        2935 | Global coverage:                                                            |
| QA-007       |        2942 | Domain line coverage minimum 90%:                                           |
| QA-008       |        2951 | Threshold düşürülemez.                                                      |
| QA-009       |        2953 | Snapshot tek başına feature testi değildir.                                 |
| QA-010       |        2955 | E2E gerçek browser ve gerçek PostgreSQL ile çalışır.                        |
| RATE-001     |        2345 | Register:                                                                   |
| RATE-002     |        2350 | Login:                                                                      |
| RATE-003     |        2354 | Topic create:                                                               |
| RATE-004     |        2358 | Entry create:                                                               |
| RATE-005     |        2363 | Entry edit/delete:                                                          |
| RATE-006     |        2367 | Vote:                                                                       |
| RATE-007     |        2371 | Bookmark/follow/block:                                                      |
| RATE-008     |        2375 | Report:                                                                     |
| RATE-009     |        2379 | Search:                                                                     |
| RATE-010     |        2384 | Moderation command:                                                         |
| RATE-011     |        2388 | Increment atomik SQL.                                                       |
| RATE-012     |        2390 | Cleanup script:                                                             |
| RATE-013     |        2394 | TRUST_PROXY=false default.                                                  |
| RATE-014     |        2396 | TRUST_PROXY=true ise TRUST_PROXY_HOPS kullan.                               |
| REPO-001     |          76 | Çalışmaya başlamadan önce mevcut çalışma klasörünün bu repository'nin       |
| REPO-002     |          79 | `git remote get-url origin` çıktısı aşağıdaki repository ile                |
| REPO-003     |          88 | Origin başka bir repository'yi gösteriyorsa o repository üzerinde           |
| REPO-004     |          91 | Repository henüz clone edilmemişse, GitHub erişimi mevcut olduğu            |
| REPO-005     |          94 | Repository boşsa projeyi sıfırdan oluştur.                                  |
| REPO-006     |          96 | Repository'de mevcut kod varsa önce tamamını incele:                        |
| REPO-007     |         109 | Kullanılabilir ve bu Goal ile uyumlu kodu koru.                             |
| REPO-008     |         111 | Uyumsuz, eksik veya hatalı kodu refactor et ya da değiştir.                 |
| REPO-009     |         113 | `main` üzerinde doğrudan geliştirme yapma.                                  |
| REPO-010     |         115 | `codex/milestone-1` branch'ini `main` üzerinden oluştur ve bütün            |
| REPO-011     |         118 | `.git` klasörünü silme veya yeniden oluşturma.                              |
| REPO-012     |         120 | Git history rewrite etme.                                                   |
| REPO-013     |         122 | Force push yapma.                                                           |
| REPO-014     |         124 | Kullanıcıya ait mevcut commit'leri amend, rebase, squash veya değiştirme.   |
| REPO-015     |         126 | Başlangıç durumunu `docs/STATUS.md` içine kaydet:                           |
| REPO-016     |         137 | Mantıksal ve geri alınabilir commit'ler oluştur.                            |
| REPO-017     |         153 | Commit isimleri implementasyonun gerçek kapsamını yansıtmalıdır.            |
| REPO-018     |         155 | Bilinçli olarak kırık build, başarısız test veya yarım required özellik     |
| REPO-019     |         158 | Her commit öncesi ilgili format, lint, typecheck ve testleri çalıştır.      |
| REPO-020     |         160 | Final durumda working tree temiz olmalıdır.                                 |
| REPO-021     |         162 | GitHub erişimi mevcutsa working branch'i aşağıdaki remote branch'e push et: |
| REPO-022     |         166 | GitHub erişimi mevcutsa `main` branch'ine yönelik draft pull request        |
| REPO-023     |         189 | `main` branch'ine merge yapma.                                              |
| REPO-024     |         191 | Pull request'i draft durumundan çıkarma.                                    |
| REPO-025     |         193 | GitHub üzerinde issue, discussion, release, package, deployment,            |
| REPO-026     |         197 | GitHub Actions workflow dosyaları repository içinde oluşturulabilir;        |
| REPO-027     |         201 | Push veya pull request yetkisi yoksa görevi durdurma. Local branch ve       |
| REPORT-001   |        1787 | ACTIVE kullanıcı TOPIC, ENTRY ve USER report edebilir.                      |
| REPORT-002   |        1789 | Kullanıcı kendisini report edemez.                                          |
| REPORT-003   |        1791 | Kullanıcı kendi entry veya kendi açtığı topic'i report edemez.              |
| REPORT-004   |        1793 | Duplicate OPEN report 409 REPORT_ALREADY_OPEN.                              |
| REPORT-005   |        1795 | Report create transaction:                                                  |
| SCRIPT-001   |        2758 | `pnpm check`:                                                               |
| SCRIPT-002   |        2769 | `pnpm verify:m1`:                                                           |
| SEARCH-001   |        1683 | Global search:                                                              |
| SEARCH-002   |        1691 | Query normalization:                                                        |
| SEARCH-003   |        1699 | İki karakterden kısa query database sorgusu çalıştırmaz.                    |
| SEARCH-004   |        1701 | Türkçe karakter ve case-insensitive search.                                 |
| SEARCH-005   |        1703 | pg_trgm, normalized fields ve unaccent kullan.                              |
| SEARCH-006   |        1705 | Search type:                                                                |
| SEARCH-007   |        1712 | 20'li pagination.                                                           |
| SEARCH-008   |        1714 | Result:                                                                     |
| SEARCH-009   |        1722 | Entry snippet maksimum 180 karakter.                                        |
| SEARCH-010   |        1724 | Ranking:                                                                    |
| SEC-001      |        2402 | Parameterized Prisma/raw query.                                             |
| SEC-002      |        2404 | `$queryRawUnsafe` ve `$executeRawUnsafe` yasak.                             |
| SEC-003      |        2406 | User input `dangerouslySetInnerHTML` ile render edilmez.                    |
| SEC-004      |        2408 | Session, CSRF, password, status ve role server-side doğrulanır.             |
| SEC-005      |        2410 | Bütün write endpoint'lerinde authentication ve authorization.               |
| SEC-006      |        2412 | Production security headers:                                                |
| SEC-007      |        2422 | CSP:                                                                        |
| SEC-008      |        2433 | Open redirect önlenir.                                                      |
| SEC-009      |        2435 | Production logs şunları içermez:                                            |
| SEC-010      |        2446 | Production Prisma query log kapalı.                                         |
| SEC-011      |        2448 | Generic 500 stack trace döndürmez.                                          |
| SEC-012      |        2450 | Account enumeration önlenir.                                                |
| SEC-013      |        2452 | Safe user serialization explicit select kullanır.                           |
| SEC-014      |        2454 | Secret repository'ye yazılmaz.                                              |
| SEC-015      |        2456 | `.env.example` gerçek secret içermez.                                       |
| SEC-016      |        2458 | `.gitignore` şunları dışlar:                                                |
| SEC-017      |        2469 | Bütün moderation ve role mutation audit edilir.                             |
| SEC-018      |        2471 | Production dependency'lerinde kritik bilinen vulnerability bırakma.         |
| SEC-019      |        2473 | Uygulama hiçbir harici analytics, telemetry veya tracking endpoint'ine      |
| SEED-001     |        2685 | Seed idempotent.                                                            |
| SEED-002     |        2687 | En az:                                                                      |
| SEED-003     |        2701 | Entry'ler son 7 güne yayılır.                                               |
| SEED-004     |        2703 | DEBE için önceki gün pozitif entry vardır.                                  |
| SEED-005     |        2705 | En az bir topic 20'den fazla entry içerir.                                  |
| SEED-006     |        2707 | Demo users:                                                                 |
| SEED-007     |        2713 | Password DEMO_PASSWORD.                                                     |
| SEED-008     |        2715 | Özgün Türkçe içerik.                                                        |
| SEED-009     |        2717 | Gerçek Ekşi Sözlük içeriği yok.                                             |
| SEED-010     |        2719 | Lorem ipsum yok.                                                            |
| SEED-011     |        2721 | Gerçek kişisel veri, hedefli hakaret veya nefret söylemi yok.               |
| SEED-012     |        2723 | İkinci seed run duplicate oluşturmaz.                                       |
| SEO-001      |        2529 | Her public sayfada title ve description.                                    |
| SEO-002      |        2531 | Topic dynamic metadata ve canonical.                                        |
| SEO-003      |        2533 | Entry permalink canonical.                                                  |
| SEO-004      |        2535 | Public content için Open Graph.                                             |
| SEO-005      |        2537 | robots.txt.                                                                 |
| SEO-006      |        2539 | sitemap.xml:                                                                |
| SEO-007      |        2544 | Auth/account/moderation noindex.                                            |
| SEO-008      |        2546 | HIDDEN, DELETED ve MERGED sitemap dışı.                                     |
| SEO-009      |        2548 | Doğru 404 ve redirect status'ları.                                          |
| TECH-001     |         572 | Runtime: Node.js 22.                                                        |
| TECH-002     |         574 | Package manager: pnpm 10 ve Corepack.                                       |
| TECH-003     |         576 | Framework: Next.js App Router.                                              |
| TECH-004     |         578 | UI: React.                                                                  |
| TECH-005     |         580 | Language: TypeScript.                                                       |
| TECH-006     |         582 | TypeScript config:                                                          |
| TECH-007     |         590 | Database: PostgreSQL 16.                                                    |
| TECH-008     |         592 | Docker database image: postgres:16-alpine.                                  |
| TECH-009     |         594 | ORM ve migration: Prisma.                                                   |
| TECH-010     |         596 | Authentication: repository içinde geliştirilen opaque session token         |
| TECH-011     |         599 | Password hashing: `@node-rs/argon2`, Argon2id.                              |
| TECH-012     |         601 | Schema validation: Zod.                                                     |
| TECH-013     |         603 | Styling: Tailwind CSS.                                                      |
| TECH-014     |         605 | Accessible UI primitives: Radix UI.                                         |
| TECH-015     |         607 | Forms: React Hook Form ve Zod resolver.                                     |
| TECH-016     |         609 | Icons: Lucide React.                                                        |
| TECH-017     |         611 | Toast: Sonner.                                                              |
| TECH-018     |         613 | Dates: date-fns ve Türkçe locale.                                           |
| TECH-019     |         615 | URL detection: linkify-it.                                                  |
| TECH-020     |         617 | Logging: Pino.                                                              |
| TECH-021     |         619 | Unit ve integration: Vitest.                                                |
| TECH-022     |         621 | Component tests: React Testing Library.                                     |
| TECH-023     |         623 | E2E: Playwright.                                                            |
| TECH-024     |         625 | Accessibility test: axe-core ve Playwright axe entegrasyonu.                |
| TECH-025     |         627 | API specification: OpenAPI 3.1.                                             |
| TECH-026     |         629 | OpenAPI validation: Swagger Parser.                                         |
| TECH-027     |         631 | Lint: ESLint.                                                               |
| TECH-028     |         633 | Formatting: Prettier.                                                       |
| TECH-029     |         635 | Container: Docker ve Docker Compose.                                        |
| TECH-030     |         637 | CI: GitHub Actions.                                                         |
| TECH-031     |         639 | Next.js production build `output: "standalone"` kullanacaktır.              |
| TECH-032     |         641 | Node runtime kullanılacaktır; Edge runtime kullanma.                        |
| TECH-033     |         643 | Redux, Zustand veya başka global client state manager ekleme.               |
| TECH-034     |         645 | Server Components, URL state, local component state ve server actions       |
| TOPIC-001    |        1429 | Yeni topic ve ilk entry aynı transaction içinde oluşturulmalıdır.           |
| TOPIC-002    |        1431 | İlk entry olmadan topic oluşturulamaz.                                      |
| TOPIC-003    |        1433 | Topic title 2–100 normalized karakter.                                      |
| TOPIC-004    |        1435 | Duplicate normalizedTitle oluşturulamaz.                                    |
| TOPIC-005    |        1437 | TopicAlias ile çakışan topic oluşturulamaz.                                 |
| TOPIC-006    |        1439 | Duplicate API response:                                                     |
| TOPIC-007    |        1447 | Duplicate topic UI:                                                         |
| TOPIC-008    |        1453 | Topic sayfası:                                                              |
| TOPIC-009    |        1466 | Sort:                                                                       |
| TOPIC-010    |        1485 | Default sort `oldest`.                                                      |
| TOPIC-011    |        1487 | Default page size 20, maksimum 100.                                         |
| TOPIC-012    |        1489 | Pagination URL'de:                                                          |
| TOPIC-013    |        1493 | Topic search `?q=` ile ACTIVE entry body içinde arama yapar.                |
| TOPIC-014    |        1495 | HIDDEN topic:                                                               |
| TOPIC-015    |        1502 | MERGED topic URL'si target'a 308 redirect olur.                             |
| TOPIC-016    |        1504 | Topic rename:                                                               |
| TOPIC-017    |        1516 | Topic merge:                                                                |
| TOPIC-018    |        1533 | Random topic `ORDER BY random()` kullanmamalıdır.                           |
| TRACE-001    |        3152 | Goal içindeki bütün `[ID-001]` biçimindeki requirement ID'lerini            |
| TRACE-002    |        3155 | M1_REQUIREMENTS hiçbir ID atlamaz.                                          |
| TRACE-003    |        3157 | TRACEABILITY her ID için:                                                   |
| TRACE-004    |        3163 | Implementasyon yoksa PASS yasak.                                            |
| TRACE-005    |        3165 | Test gerektiren requirement test olmadan PASS yasak.                        |
| TRACE-006    |        3167 | `tests/requirements/traceability.test.ts` manifest, requirements ve         |
| TRACE-007    |        3170 | Eksik veya duplicate ID test fail eder.                                     |
| TRACE-008    |        3172 | FAIL/BLOCKED varsa requirements:check fail eder.                            |
| TRACE-009    |        3174 | Finalde tüm requirement'lar PASS olmalıdır.                                 |
| UI-001       |        1983 | Desktop:                                                                    |
| UI-002       |        1990 | Header:                                                                     |
| UI-003       |        2001 | Sidebar:                                                                    |
| UI-004       |        2010 | Homepage:                                                                   |
| UI-005       |        2019 | Mobile:                                                                     |
| UI-006       |        2029 | 1024px altında sidebar drawer olur.                                         |
| UI-007       |        2031 | Light palette:                                                              |
| UI-008       |        2042 | Dark palette:                                                               |
| UI-009       |        2053 | System font stack; remote font yok.                                         |
| UI-010       |        2055 | Default theme system preference.                                            |
| UI-011       |        2057 | Theme cookie ve localStorage ile saklanır; flash oluşmaz.                   |
| UI-012       |        2059 | Bütün form alanları:                                                        |
| UI-013       |        2068 | Destructive action confirmation dialog.                                     |
| UI-014       |        2070 | Optimistic UI kullanılıyorsa rollback zorunlu; mümkünse server              |
| UI-015       |        2073 | Keyboard navigation.                                                        |
| UI-016       |        2075 | Visible focus ring.                                                         |
| UI-017       |        2077 | Icon-only button accessible name.                                           |
| UI-018       |        2079 | WCAG AA contrast.                                                           |
| UI-019       |        2081 | Semantik heading ve tek h1.                                                 |
| UI-020       |        2083 | Moderation table'ları için mobile card görünümü.                            |
| UI-021       |        2085 | İngilizce placeholder veya validation mesajı bırakma.                       |
| UT-001       |        2792 | Türkçe topic normalization.                                                 |
| UT-002       |        2793 | İ, I, ı, i davranışı.                                                       |
| UT-003       |        2794 | Unicode NFKC.                                                               |
| UT-004       |        2795 | Whitespace normalization.                                                   |
| UT-005       |        2796 | Slug generation.                                                            |
| UT-006       |        2797 | Topic duplicate.                                                            |
| UT-007       |        2798 | TopicAlias duplicate.                                                       |
| UT-008       |        2799 | Entry validation.                                                           |
| UT-009       |        2800 | HTML escaping.                                                              |
| UT-010       |        2801 | Unsafe URL scheme blocking.                                                 |
| UT-011       |        2802 | External URL rel attributes.                                                |
| UT-012       |        2803 | `[[topic]]` parsing.                                                        |
| UT-013       |        2804 | `@username` parsing.                                                        |
| UT-014       |        2805 | Permission matrix.                                                          |
| UT-015       |        2806 | Last admin guard.                                                           |
| UT-016       |        2807 | Vote state transitions.                                                     |
| UT-017       |        2808 | Counter calculation.                                                        |
| UT-018       |        2809 | Trending formula.                                                           |
| UT-019       |        2810 | DEBE Istanbul date boundary.                                                |
| UT-020       |        2811 | Search normalization.                                                       |
| UT-021       |        2812 | Search ranking.                                                             |
| UT-022       |        2813 | Rate limit boundaries.                                                      |
| UT-023       |        2814 | Idempotency hash/conflict.                                                  |
| UT-024       |        2815 | API error mapping.                                                          |
| UT-025       |        2816 | Session token hash.                                                         |
| UT-026       |        2817 | CSRF validation.                                                            |
| UT-027       |        2818 | Open redirect prevention.                                                   |
| UT-028       |        2819 | Safe user serialization.                                                    |
| VOTE-001     |        1637 | Kullanıcı başına entry'de bir aktif oy.                                     |
| VOTE-002     |        1639 | Value yalnızca 1 veya -1.                                                   |
| VOTE-003     |        1641 | Aynı oy tekrar gönderilirse idempotent success.                             |
| VOTE-004     |        1643 | Farklı oy mevcut oyu update eder.                                           |
| VOTE-005     |        1645 | Vote delete, oy yoksa idempotent success.                                   |
| VOTE-006     |        1647 | Own entry vote yasak.                                                       |
| VOTE-007     |        1649 | HIDDEN veya DELETED entry vote yasak.                                       |
| VOTE-008     |        1651 | Score ve vote counter'ları transaction içinde atomik update.                |
| VOTE-009     |        1653 | Her state değişikliği entry.voted outbox üretir.                            |
