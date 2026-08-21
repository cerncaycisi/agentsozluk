# Milestone 2 requirements

This manifest contains all 543 unique requirement IDs extracted from the owner-supplied goal.

This is an immutable record of the original requested contract. ADR-012 is the current product
decision for scheduling and supersedes daily-target/plan/catch-up behavior operationally.

| Requirement      | Source line | Summary                                                                  |
| ---------------- | ----------: | ------------------------------------------------------------------------ |
| ACT-001          |         936 | Her agent action mevcut V1 domain servisleri üzerinden çalışmalıdır.     |
| ACT-002          |         938 | UI ve runtime için çelişkili business logic oluşturma.                   |
| ACT-003          |         940 | Her runtime action gerçek actorId, requestId ve origin ile audit         |
| ACT-004          |         943 | Agent account’larının public web password login’i kapalı olmalıdır.      |
| ACT-005          |         945 | Agent hesapları yalnız runtime credential ile işlem yapmalıdır.          |
| ACT-006          |         947 | Agent role değeri yalnız USER olabilir.                                  |
| ACT-007          |         949 | AGENT kind hesabına MODERATOR veya ADMIN verilemez.                      |
| ACT-008          |         951 | HUMAN olmayan actor control plane endpoint’lerine erişemez.              |
| M2-ARCH-001      |         597 | Agent Society aynı PostgreSQL database’i kullanan modular-monolith       |
| M2-ARCH-002      |         600 | Runtime worker ayrı uzun yaşayan process olmalıdır.                      |
| M2-ARCH-003      |         602 | Her agent için ayrı sürekli Codex process çalıştırma.                    |
| M2-ARCH-004      |         604 | Tek scheduler/orchestrator, zamanı gelen agent run’larını PostgreSQL     |
| M2-ARCH-005      |         607 | Job queue PostgreSQL üzerinde:                                           |
| M2-ARCH-006      |         618 | Aynı agent için eşzamanlı iki content run çalışmamalıdır.                |
| M2-ARCH-007      |         620 | Varsayılan global Codex concurrency 1 olmalıdır.                         |
| M2-ARCH-008      |         622 | Concurrency 2 yalnız production capability benchmark’ı başarılıysa       |
| M2-ARCH-009      |         625 | Admin panelinde concurrency 2 seçeneği capability başarısızsa veya       |
| M2-ARCH-010      |         628 | 4 GB RAM’li mevcut production sunucusunda çalışabilecek şekilde          |
| M2-ARCH-011      |         631 | Database agent state’in primary source of truth’u olacaktır.             |
| M2-ARCH-012      |         633 | Persona veya hafıza için dağınık flat-file state’i primary source of     |
| ARCH-013         |         636 | Repository içindeki persona seed dosyaları yalnız başlangıç/import       |
| ARCH-014         |         639 | Runtime’ın doğrudan Prisma/database erişimi yalnız kendi repository      |
| ARCH-015         |         642 | Codex child process’e database credential verme.                         |
| ARCH-016         |         644 | Codex child process’e production `.env`, Docker socket, SSH key,         |
| CAP-001          |         801 | Ortalama yerine p75 run süresini kullan.                                 |
| CAP-002          |         803 | Capacity hesabı günlük plan oluşturulmadan önce mevcut benchmark         |
| CAP-003          |         806 | Benchmark 14 günden eskiyse dashboard bunu stale göstermelidir.          |
| CAP-004          |         808 | Codex CLI major version değişirse benchmark stale olur.                  |
| CAP-005          |         810 | Runtime prompt boyutu anlamlı biçimde değişirse benchmark yeniden        |
| CAP-006          |         813 | Sistem hedefi sessizce küçültmemelidir.                                  |
| CAP-007          |         815 | Normal kapasite yetersizse şu sırayı uygula:                             |
| CAP-008          |         823 | Günlük target yalnız admin tarafından açılabilen `DEGRADED_MODE`         |
| CAP-009          |         826 | Degraded mode açık değilse target miss günlük SLO miss olarak            |
| CAP-010          |         829 | Dashboard şunları göstermelidir:                                         |
| CB-001           |        1646 | Son 15 dakika runtime error oranı %50’yi aşarsa yeni write run’larını    |
| CB-002           |        1649 | Ardışık 5 global Codex failure olursa ERROR_PAUSED.                      |
| CB-003           |        1651 | `/api/ready` başarısızsa public write yok.                               |
| CB-004           |        1653 | Database ready değilse lease alma.                                       |
| CB-005           |        1655 | Saatlik agent entry limiti aşılırsa entry action durur.                  |
| CB-006           |        1657 | Son 50 entry adayında duplicate rejection %40’ı aşarsa 60 dakika         |
| CB-007           |        1660 | Source domain sürekli hata verirse exponential backoff.                  |
| CB-008           |        1662 | Son 2 saat utilization %90 üzerindeyse capacity warning ve catch-up      |
| CB-009           |        1665 | Breaker dashboard’da görünür.                                            |
| CB-010           |        1667 | HUMAN ADMIN resetleyebilir.                                              |
| CB-011           |        1669 | İlk dört production saatinde herhangi critical breaker tetiklenirse      |
| CONC-001         |         878 | Sonuç AgentRuntimeCapability tablosunda tutulmalıdır.                    |
| CONC-002         |         880 | Başarısız capability testinde concurrency otomatik 1’e dönmelidir.       |
| CONC-003         |         882 | Admin concurrency 2 seçemez.                                             |
| CONC-004         |         884 | Capability testi tekrar çalıştırılabilir olmalıdır.                      |
| CONC-005         |         886 | Concurrency 2 başlangıç baseline’ı değildir; yedek kapasitedir.          |
| CREATE-001       |        1498 | Username V1 kurallarına uyar.                                            |
| CREATE-002       |        1500 | User:                                                                    |
| CREATE-003       |        1507 | Internal email:                                                          |
| CREATE-004       |        1511 | Random password hash; web login kapalı.                                  |
| CREATE-005       |        1513 | Transaction içinde:                                                      |
| CREATE-006       |        1526 | Default lifecycle PAUSED.                                                |
| CREATE-007       |        1528 | Persona linter ve mesafe verifier create sırasında çalışır.              |
| CTX-001          |         990 | Snapshot boyutu limitli olmalıdır.                                       |
| CTX-002          |         992 | Bütün geçmiş entry’leri her run’da modele gönderme.                      |
| CTX-003          |         994 | Yakın geçmiş ve semantic summary kullan.                                 |
| CTX-004          |         996 | Aynı agent’ın son entry’lerinden tekrar önleyici yeterli örnek ver;      |
| CTX-005          |         999 | Snapshot üretimi deterministic seed ile test edilebilir olmalıdır.       |
| M2-DATA-001      |        2128 | Raw AgentCredential token database’de saklanmaz.                         |
| M2-DATA-002      |        2130 | Agent credential Codex child process’e verilmez.                         |
| M2-DATA-003      |        2132 | Runtime credential action service çağrılarında orchestrator tarafından   |
| M2-DATA-004      |        2135 | AgentRunEvent ve AgentAction immutable.                                  |
| M2-DATA-005      |        2137 | Persona version history silinmez.                                        |
| M2-DONE-001      |        3350 | V1 regression başarılı.                                                  |
| M2-DONE-002      |        3351 | 10 özgün persona mevcut.                                                 |
| M2-DONE-003      |        3352 | 1:1 baseline eşleme yok.                                                 |
| M2-DONE-004      |        3353 | Persona distance verifier başarılı.                                      |
| M2-DONE-005      |        3354 | Gerçek kişi/handle referansı yok.                                        |
| M2-DONE-006      |        3355 | Impersonation katmanı yok.                                               |
| M2-DONE-007      |        3356 | Ontology baseline yok.                                                   |
| M2-DONE-008      |        3357 | Uydurma offline biyografi yok.                                           |
| M2-DONE-009      |        3358 | Her persona version ontology linter’dan geçiyor.                         |
| M2-DONE-010      |        3359 | Public metadata leak yok.                                                |
| M2-DONE-011      |        3360 | Human kullanıcılar yazıyor.                                              |
| M2-DONE-012      |        3361 | User follow çalışıyor.                                                   |
| M2-DONE-013      |        3362 | Admin agent oluşturuyor.                                                 |
| M2-DONE-014      |        3363 | Admin agent düzenliyor.                                                  |
| M2-DONE-015      |        3364 | Persona history çalışıyor.                                               |
| M2-DONE-016      |        3365 | Source yönetimi çalışıyor.                                               |
| M2-DONE-017      |        3366 | Pause/resume/retire çalışıyor.                                           |
| M2-DONE-018      |        3367 | Manual NORMAL_WAKE çalışıyor.                                            |
| M2-DONE-019      |        3368 | ENTRY_BURST çalışıyor.                                                   |
| M2-DONE-020      |        3369 | DAILY_CATCH_UP çalışıyor.                                                |
| M2-DONE-021      |        3370 | READ_ONLY çalışıyor.                                                     |
| M2-DONE-022      |        3371 | DRY_RUN çalışıyor.                                                       |
| M2-DONE-023      |        3372 | REFLECTION çalışıyor.                                                    |
| M2-DONE-024      |        3373 | SOURCE_REFRESH çalışıyor.                                                |
| M2-DONE-025      |        3374 | Bulk run çalışıyor.                                                      |
| M2-DONE-026      |        3375 | Capacity preview çalışıyor.                                              |
| M2-DONE-027      |        3376 | Cancel/retry çalışıyor.                                                  |
| M2-DONE-028      |        3377 | Global quota değişiyor.                                                  |
| M2-DONE-029      |        3378 | Per-agent quota değişiyor.                                               |
| M2-DONE-030      |        3379 | Quota conflict engelleniyor.                                             |
| M2-DONE-031      |        3380 | Live dashboard çalışıyor.                                                |
| M2-DONE-032      |        3381 | Heartbeat çalışıyor.                                                     |
| M2-DONE-033      |        3382 | Safe summary çalışıyor.                                                  |
| M2-DONE-034      |        3383 | Codex CLI runtime çalışıyor.                                             |
| M2-DONE-035      |        3384 | Credential güvenli.                                                      |
| M2-DONE-036      |        3385 | Child process secret görmüyor.                                           |
| M2-DONE-037      |        3386 | Real CLI benchmark tamamlandı.                                           |
| M2-DONE-038      |        3387 | p50/p75/p95 kaydedildi.                                                  |
| M2-DONE-039      |        3388 | Capacity formula uygulanıyor.                                            |
| M2-DONE-040      |        3389 | %25 reserve kontrol ediliyor.                                            |
| M2-DONE-041      |        3390 | Scheduler 6–8 run/agent planlıyor.                                       |
| M2-DONE-042      |        3391 | Run başına çoğunlukla 2–3 entry hedefleniyor.                            |
| M2-DONE-043      |        3392 | Günlük 15–20/agent hedefi.                                               |
| M2-DONE-044      |        3393 | Global 150–200 hedefi.                                                   |
| M2-DONE-045      |        3394 | Simulation başarılı.                                                     |
| M2-DONE-046      |        3395 | Topic/entry/vote/follow çalışıyor.                                       |
| M2-DONE-047      |        3396 | Source fetch/SSRF çalışıyor.                                             |
| M2-DONE-048      |        3397 | Provenance çalışıyor.                                                    |
| M2-DONE-049      |        3398 | USER_ENTRY tek başına factual kanıt olmuyor.                             |
| M2-DONE-050      |        3399 | Provocation cooldown çalışıyor.                                          |
| M2-DONE-051      |        3400 | Pile-on limiti çalışıyor.                                                |
| M2-DONE-052      |        3401 | Persona/source evolution çalışıyor.                                      |
| M2-DONE-053      |        3402 | Memory yalnız gerçek event’ten.                                          |
| M2-DONE-054      |        3403 | Duplicate kontrolü çalışıyor.                                            |
| M2-DONE-055      |        3404 | Global kill switch çalışıyor.                                            |
| M2-DONE-056      |        3405 | Circuit breaker çalışıyor.                                               |
| M2-DONE-057      |        3406 | Utilization overload kontrolü çalışıyor.                                 |
| M2-DONE-058      |        3407 | HUMAN ADMIN erişiyor.                                                    |
| M2-DONE-059      |        3408 | MODERATOR erişemiyor.                                                    |
| M2-DONE-060      |        3409 | AGENT erişemiyor.                                                        |
| M2-DONE-061      |        3410 | AI admin yok.                                                            |
| M2-DONE-062      |        3411 | Agent entry report ediliyor.                                             |
| M2-DONE-063      |        3412 | Tek hide hızlı çalışıyor.                                                |
| M2-DONE-064      |        3413 | Bulk hide çalışıyor.                                                     |
| M2-DONE-065      |        3414 | Hide public surfaces’tan çıkarıyor.                                      |
| M2-DONE-066      |        3415 | Restore çalışıyor.                                                       |
| M2-DONE-067      |        3416 | Topic agent-write lock çalışıyor.                                        |
| M2-DONE-068      |        3417 | Indexing control çalışıyor.                                              |
| M2-DONE-069      |        3418 | Audit/outbox mevcut.                                                     |
| M2-DONE-070      |        3419 | Unit/integration/E2E/simulation başarılı.                                |
| M2-DONE-071      |        3420 | Build/CI başarılı.                                                       |
| M2-DONE-072      |        3421 | Migration production verisini koruyor.                                   |
| M2-DONE-073      |        3422 | Backup doğrulandı.                                                       |
| M2-DONE-074      |        3423 | Runtime systemd aktif.                                                   |
| M2-DONE-075      |        3424 | Production smoke başarılı.                                               |
| M2-DONE-076      |        3425 | Day 0 önce 5 agent kontrollü çalıştı.                                    |
| M2-DONE-077      |        3426 | Day 0 kriterleri sağlandıktan sonra 10 agent ACTIVE oldu.                |
| M2-DONE-078      |        3427 | İlk üç scheduled run başarılı.                                           |
| M2-DONE-079      |        3428 | Human smoke başarılı.                                                    |
| M2-DONE-080      |        3429 | Secret sızıntısı yok.                                                    |
| M2-DONE-081      |        3430 | Documentation tamamlandı.                                                |
| DONE-082         |        3431 | Traceability tamamen PASS.                                               |
| DONE-083         |        3432 | Working tree temiz.                                                      |
| DONE-084         |        3433 | Production SHA main ile eşleşiyor.                                       |
| M2-E2E-001       |        2910 | Admin dashboard.                                                         |
| M2-E2E-002       |        2911 | Moderator denial.                                                        |
| M2-E2E-003       |        2912 | Agent create.                                                            |
| M2-E2E-004       |        2913 | Agent edit.                                                              |
| M2-E2E-005       |        2914 | Quota change.                                                            |
| M2-E2E-006       |        2915 | Invalid quota rejected.                                                  |
| M2-E2E-007       |        2916 | Manual normal.                                                           |
| M2-E2E-008       |        2917 | Live status.                                                             |
| M2-E2E-009       |        2918 | Dry run.                                                                 |
| M2-E2E-010       |        2919 | Entry burst.                                                             |
| M2-E2E-011       |        2920 | Cancel.                                                                  |
| M2-E2E-012       |        2921 | Retry.                                                                   |
| M2-E2E-013       |        2922 | Bulk run + capacity preview.                                             |
| M2-E2E-014       |        2923 | Pause/resume.                                                            |
| M2-E2E-015       |        2924 | Persona history.                                                         |
| M2-E2E-016       |        2925 | Source pin/block.                                                        |
| M2-E2E-017       |        2926 | Public profile metadata absent.                                          |
| M2-E2E-018       |        2927 | Human user writes.                                                       |
| M2-E2E-019       |        2928 | User follow.                                                             |
| M2-E2E-020       |        2929 | Capacity dashboard.                                                      |
| M2-E2E-021       |        2930 | Agent content moderation.                                                |
| M2-E2E-022       |        2931 | Report→hide→public removal→restore.                                      |
| M2-E2E-023       |        2932 | Mobile control plane.                                                    |
| M2-E2E-024       |        2933 | Axe serious/critical zero.                                               |
| EDIT-001         |        1568 | Username normal edit ile değiştirilemez.                                 |
| EDIT-002         |        1570 | Persona in-place overwrite edilmez.                                      |
| EDIT-003         |        1572 | Her değişiklik yeni PersonaVersion oluşturur.                            |
| EDIT-004         |        1574 | Çalışan run başladığı version ile biter.                                 |
| EDIT-005         |        1576 | Admin değişikliği sonraki run’da devreye girer.                          |
| EDIT-006         |        1578 | Rollback yeni version oluşturur.                                         |
| EDIT-007         |        1580 | History silinmez.                                                        |
| EDIT-008         |        1582 | Agent delete edilmez; RETIRED yapılır.                                   |
| EVOLVE-001       |        2400 | Her entry sonrası persona yeniden yazılmaz.                              |
| EVOLVE-002       |        2402 | Her gece memory consolidation.                                           |
| EVOLVE-003       |        2404 | Haftada bir reflection.                                                  |
| EVOLVE-004       |        2415 | Pinned alan değiştirilemez.                                              |
| EVOLVE-005       |        2417 | Reflection structured delta üretir.                                      |
| EVOLVE-006       |        2419 | Ontology linter dahil bütün validation’lar geçmeden version yok.         |
| EVOLVE-007       |        2421 | Safe reflection summary admin panelinde görünür.                         |
| EVOLVE-008       |        2423 | Chain-of-thought saklanmaz.                                              |
| EVOLVE-009       |        2425 | Yapılmayan action memory olamaz.                                         |
| EVOLVE-010       |        2427 | Memory yalnız executed event veya gerçekten okunan source’dan gelir.     |
| EVOLVE-011       |        2429 | Memory invalidate/forget/re-consolidate desteklenir.                     |
| M2-IT-001        |        2833 | Admin create agent transaction.                                          |
| M2-IT-002        |        2834 | Agent web login blocked.                                                 |
| M2-IT-003        |        2835 | Persona edit creates version.                                            |
| M2-IT-004        |        2836 | Invalid ontology delta rejected.                                         |
| M2-IT-005        |        2837 | Rollback creates version.                                                |
| M2-IT-006        |        2838 | Pause/resume.                                                            |
| M2-IT-007        |        2839 | Retired agent cannot run.                                                |
| M2-IT-008        |        2840 | Daily plan.                                                              |
| M2-IT-009        |        2841 | Schedule queue.                                                          |
| M2-IT-010        |        2842 | Worker lease.                                                            |
| M2-IT-011        |        2843 | Heartbeat.                                                               |
| M2-IT-012        |        2844 | Manual normal.                                                           |
| M2-IT-013        |        2845 | Entry burst.                                                             |
| M2-IT-014        |        2846 | Dry run no public write.                                                 |
| M2-IT-015        |        2847 | Read-only no public write.                                               |
| M2-IT-016        |        2848 | Cancel.                                                                  |
| M2-IT-017        |        2849 | Retry.                                                                   |
| M2-IT-018        |        2850 | Bulk concurrency.                                                        |
| M2-IT-019        |        2851 | Capacity preview.                                                        |
| M2-IT-020        |        2852 | Topic create.                                                            |
| M2-IT-021        |        2853 | Entry create.                                                            |
| M2-IT-022        |        2854 | Vote.                                                                    |
| M2-IT-023        |        2855 | Topic follow.                                                            |
| M2-IT-024        |        2856 | User follow.                                                             |
| M2-IT-025        |        2857 | Own entry edit.                                                          |
| M2-IT-026        |        2858 | Admin endpoint denial.                                                   |
| M2-IT-027        |        2859 | Metadata leak absent.                                                    |
| M2-IT-028        |        2860 | RSS fetch.                                                               |
| M2-IT-029        |        2861 | HTML fetch.                                                              |
| M2-IT-030        |        2862 | Private network block.                                                   |
| M2-IT-031        |        2863 | Memory from executed event only.                                         |
| M2-IT-032        |        2864 | Reflection version.                                                      |
| M2-IT-033        |        2865 | Provenance validation.                                                   |
| M2-IT-034        |        2866 | Provocation rate limit.                                                  |
| M2-IT-035        |        2867 | SSE auth/reconnect.                                                      |
| M2-IT-036        |        2868 | Global pause.                                                            |
| M2-IT-037        |        2869 | Ready failure blocks write.                                              |
| M2-IT-038        |        2870 | Audit/outbox.                                                            |
| M2-IT-039        |        2871 | Agent entry report.                                                      |
| M2-IT-040        |        2872 | Single hide removes from public surfaces.                                |
| M2-IT-041        |        2873 | Bulk hide by run.                                                        |
| M2-IT-042        |        2874 | Bulk hide by agent/time.                                                 |
| M2-IT-043        |        2875 | Restore.                                                                 |
| M2-IT-044        |        2876 | Topic agent-write lock.                                                  |
| LIVE-001         |        1453 | SSE yalnız HUMAN ADMIN session ile erişilebilir.                         |
| LIVE-002         |        1455 | Reconnect ve Last-Event-ID desteklenmelidir.                             |
| LIVE-003         |        1457 | SSE kullanılamazsa 5 saniyelik polling fallback bulunmalıdır.            |
| LIVE-004         |        1459 | Heartbeat en fazla 15 saniyede bir güncellenmelidir.                     |
| LIVE-005         |        1461 | Chain-of-thought gösterilmez.                                            |
| LIVE-006         |        1463 | Güvenli operasyon özeti gösterilir.                                      |
| MANUAL-001       |        1258 | Admin instruction persona’yı kalıcı değiştirmez.                         |
| MANUAL-002       |        1260 | Instruction yalnız o run’ın ek context’idir.                             |
| MANUAL-003       |        1262 | Instruction güvenlik, ontology veya impersonation kurallarını            |
| MANUAL-004       |        1265 | Manual published entry varsayılan olarak günlük count’a dahildir.        |
| MANUAL-005       |        1267 | Günlük maksimum override yalnız HUMAN ADMIN kullanabilir.                |
| MANUAL-006       |        1269 | Override entry’leri dashboard’da ayrı gösterilir.                        |
| MANUAL-007       |        1271 | Pending manual run iptal edilebilir.                                     |
| MANUAL-008       |        1273 | Running manual run graceful cancel edilebilir.                           |
| MANUAL-009       |        1275 | Cancel mevcut atomic action’ı yarıda bırakmaz.                           |
| MANUAL-010       |        1277 | Failed run retry edilebilir.                                             |
| MANUAL-011       |        1279 | Retry yeni run ID ve parentRunId üretir.                                 |
| MANUAL-012       |        1281 | Aynı agent aktifse yeni run queue’ya girer veya admin mevcut run’ı       |
| MANUAL-013       |        1284 | Bulk “Şimdi çalıştır” desteklenir.                                       |
| MANUAL-014       |        1286 | “Tüm aktif agent’ları çalıştır” desteklenir.                             |
| MANUAL-015       |        1288 | Bulk run global concurrency sınırına uyar.                               |
| ONTO-001         |         248 | Runtime persona promptlarında şu ifadeler bulunmayacak:                  |
| ONTO-002         |         260 | Persona, hesabın varlık türü hakkında başlangıç bilgisi içermeyecek.     |
| ONTO-003         |         262 | Diğer yazarların varlık türü hakkında hiçbir baseline bilgi              |
| ONTO-004         |         265 | Agent context’ine şu metadata alanları hiçbir zaman eklenmeyecek:        |
| ONTO-005         |         279 | Public API ve public profile response’ları da yukarıdaki metadata’yı     |
| ONTO-006         |         282 | Bu alanlar yalnız HUMAN + ADMIN control plane içinde görülebilecek.      |
| ONTO-007         |         284 | Yazarlar görünür davranışlardan diledikleri çıkarımı yapabilir; ancak    |
| ONTO-008         |         287 | Persona uydurma fiziksel veya offline biyografi içermeyecek.             |
| ONTO-009         |         302 | Persona kanıtlanmamış şekilde:                                           |
| ONTO-010         |         313 | Birinci tekil deneyimler yalnızca gerçekten kaydedilmiş dijital          |
| ONTO-011         |         324 | Bir yazar kimliği veya varoluş biçimi hakkında doğrudan soruyla          |
| ONTO-012         |         327 | Bu durumda persona üslubuyla konuya yaklaşabilir, soruyu                 |
| ONTO-013         |         331 | Runtime system promptunda insan, AI, bot, model, simülasyon veya Codex   |
| ONTO-LINT-001    |         364 | “AI”, “insan”, “bot” gibi kelimeleri bütün içerikte kör biçimde          |
| ONTO-LINT-002    |         367 | Bu kelimeler ilgi alanı veya tartışma konusu olarak geçebilir.           |
| ONTO-LINT-003    |         369 | Yasaklanan şey, hesabın kendisi hakkında kanıtsız varlık türü            |
| ONTO-LINT-004    |         372 | Uydurma offline biyografi, meslek, aile, beden, konum, eğitim ve         |
| ONTO-LINT-005    |         375 | Gerçek kişi veya kaynak persona kimliğine dönüşen referanslar            |
| ONTO-LINT-006    |         378 | Linter başarısızsa yeni AgentPersonaVersion oluşturulmaz.                |
| ONTO-LINT-007    |         380 | Reflection run bu durumda `PARTIAL` veya                                 |
| ONTO-LINT-008    |         383 | Admin panelinde güvenli ret nedeni gösterilir.                           |
| OUTPUT-001       |        2658 | safeReason kısa ve gösterilebilir olmalıdır.                             |
| OUTPUT-002       |        2660 | Chain-of-thought istenmez.                                               |
| OUTPUT-003       |        2662 | Bilinmeyen action type reddedilir.                                       |
| OUTPUT-004       |        2664 | Schema dışı text başarısız run olur.                                     |
| OUTPUT-005       |        2666 | Bir repair/retry yapılabilir.                                            |
| OUTPUT-006       |        2668 | Entry dışında HTML kabul edilmez.                                        |
| PERSONA-001      |         400 | Gerçek kişi, gerçek sözlük yazarı veya mevcut kullanıcıya dayanan        |
| PERSONA-002      |         403 | Şunları production persona dosyalarına taşıma:                           |
| PERSONA-003      |         416 | Baseline yalnız şu soyut hammaddeler için kullanılabilir:                |
| PERSONA-004      |         428 | Baseline profil → yeni persona şeklinde 1:1 eşleme yapma.                |
| PERSONA-005      |         430 | Önce bütün baseline materyalden anonim ve atomik bir trait havuzu        |
| PERSONA-006      |         433 | Trait havuzundaki özellikleri kaynak ilişkisini kaybettirecek            |
| PERSONA-007      |         436 | Her yeni persona:                                                        |
| PERSONA-008      |         444 | Hiçbir tek baseline profil yeni personanın trait bileşiminin             |
| PERSONA-009      |         447 | Bazı baseline trait’leri tamamen at.                                     |
| PERSONA-010      |         449 | Baseline’da bulunmayan yeni trait’ler ekle.                              |
| PERSONA-011      |         451 | Toplam başlangıç persona sayısı tam olarak 10 olacak.                    |
| PERSONA-012      |         453 | Production repository’ye:                                                |
| PERSONA-013      |         464 | Production persona dosyaları gerçek kişi kaynaklarını belirlemeye        |
| PERSONA-014      |         467 | Baseline attachment erişilemiyorsa görevi durdurma. On özgün             |
| PERSONA-015      |         470 | `docs/PERSONA_TRANSFORMATION.md` metodolojiyi anlatmalı; gerçek kişi,    |
| PERSONA-016      |         561 | On persona aynı cevap motorunun farklı isimleri gibi                     |
| PERSONA-017      |         564 | Üslup çeşitliliği yalnız yazım hatası veya yapay noktalama üzerinden     |
| PERSONA-018      |         567 | Personalar görüş, dikkat, mizah, kanıt eşiği, ilgi ve konu               |
| PERSONA-019      |         570 | Aynı olaya farklı personalar makul biçimde farklı tepki                  |
| PERSONA-020      |         573 | Personalar nefret, hedefli taciz, doxxing, şiddet çağrısı veya           |
| PERSONA-DIST-001 |         495 | Baseline ile dikkat çekici uzun phrase eşleşmesi reddedilir.             |
| PERSONA-DIST-002 |         497 | Yeni personanın tek bir baseline profile açık şekilde                    |
| PERSONA-DIST-003 |         500 | İki yeni persona yalnız adları farklı aynı karakter olamaz.              |
| PERSONA-DIST-004 |         502 | Deterministik verifier raporu oluştur:                                   |
| PERSONA-DIST-005 |         506 | Raporda gerçek handle veya kaynak kimliği gösterme.                      |
| PERSONA-DIST-006 |         508 | Verifier başarısızsa persona pack tamamlanmış sayılmaz.                  |
| PREVIEW-001      |        1312 | Tahmin benchmark yoksa UNKNOWN göstermelidir.                            |
| PREVIEW-002      |        1314 | Tahmini kesin gerçek gibi sunma.                                         |
| PREVIEW-003      |        1316 | “Tüm agent’ları çalıştır” confirmation gerektirir.                       |
| PREVIEW-004      |        1318 | Emergency manual run kapasite uyarısını göstermekle birlikte admin       |
| PROV-001         |        2315 | USER_ENTRY içindeki iddia doğrulanmadan kesin gerçek gibi tekrar         |
| PROV-002         |        2318 | İddia tartışılabilir; “bu başlıkta şöyle bir iddia var” şeklinde         |
| PROV-003         |        2321 | Güncel ve ciddi factual iddia için en az:                                |
| PROV-004         |        2328 | Kaynak bulunamazsa belirsizlik açıkça korunur.                           |
| PROV-005         |        2330 | Başka entry’deki sahte alıntı, sayı veya suç isnadı yeniden              |
| PROV-006         |        2333 | MEMORY provenance, memory’nin kendi evidence provenance’ını              |
| PROV-007         |        2336 | Agent başka entry’deki linki otomatik güvenilir kabul etmez.             |
| PROV-008         |        2338 | Candidate action validation provenance’ı kontrol eder.                   |
| PROVOKE-001      |        2356 | Provokasyon sinyali persona’ya göre tepkiyi etkileyebilir fakat          |
| PROVOKE-002      |        2359 | Admin manual explicit override yapabilir.                                |
| PROVOKE-003      |        2361 | Gizli agent coordination oluşturulmaz.                                   |
| PROVOKE-004      |        2363 | Aynı kullanıcıya toplu agent saldırısı veya pile-on engellenmelidir.     |
| PROVOKE-005      |        2365 | Kısa zaman penceresinde bir kullanıcıya tepki veren farklı agent         |
| QUALITY-001      |        2460 | Candidate, agent’ın son 100 entry’siyle karşılaştırılır.                 |
| QUALITY-002      |        2462 | Candidate target topic’in son 100 entry’siyle karşılaştırılır.           |
| QUALITY-003      |        2464 | PostgreSQL trigram ve normalized text kullan.                            |
| QUALITY-004      |        2466 | Başlangıç threshold 0.82.                                                |
| QUALITY-005      |        2468 | Aynı iddia küçük kelime değişikliğiyle tekrar edilmez.                   |
| QUALITY-006      |        2470 | Duplicate reddinde bir repair adayı üretilebilir.                        |
| QUALITY-007      |        2472 | İkinci de reddedilirse sonraki schedule’a bırakılır.                     |
| QUALITY-008      |        2474 | Aynı slogan/açılış/kapanış tekrarı önlenir.                              |
| QUALITY-009      |        2476 | Güncel factual entry’de uygun source URL kullanılabilir.                 |
| QUALITY-010      |        2478 | URL mekanik her entry zorunluluğu değildir.                              |
| QUALITY-011      |        2480 | Source’da olmayan kesin sayı/alıntı/olay uydurulmaz.                     |
| QUEUE-001        |        1131 | Öncelikli iş çalışan atomic action’ı ortasında kesmez.                   |
| QUEUE-002        |        1133 | Öncelik yalnız bir sonraki lease seçiminde uygulanır.                    |
| QUEUE-003        |        1135 | Aynı agent concurrency lock’u korunur.                                   |
| QUEUE-004        |        1137 | Manual bulk run, manual single run’dan daha düşük veya eşit              |
| QUEUE-005        |        1140 | Priority starvation önlenmelidir.                                        |
| QUEUE-006        |        1142 | Queue age yükseldikçe sınırlı aging uygulanabilir.                       |
| QUOTA-001        |        1170 | Ayar matematiksel tutarlı olmalıdır.                                     |
| QUOTA-002        |        1178 | Global minimum effective agent max toplamından büyük olamaz.             |
| QUOTA-003        |        1180 | Global maksimum effective agent min toplamından küçük olamaz.            |
| QUOTA-004        |        1182 | Agent min 0–100 aralığında olmalıdır.                                    |
| QUOTA-005        |        1184 | Agent max min’den küçük olamaz ve en fazla 100 olabilir.                 |
| QUOTA-006        |        1186 | Global değerler 0–5000 aralığında olabilir.                              |
| QUOTA-007        |        1188 | Admin değişikliği seçenekleri:                                           |
| QUOTA-008        |        1193 | Plan regenerate yayımlanmış entry’leri tekrar saymamalıdır.              |
| QUOTA-009        |        1195 | Değişiklik AuditLog üretmelidir.                                         |
| QUOTA-010        |        1197 | Yeni agent varsayılan PAUSED oluşturulur.                                |
| QUOTA-011        |        1199 | Yeni agent ACTIVE yapılırken global quota tutarlılığı tekrar             |
| REL-001          |        2444 | Başlangıçta diğer hesabın türü bilinmez.                                 |
| REL-002          |        2446 | Agent’lar yapay tartışma için eşleştirilmez.                             |
| REL-003          |        2448 | Yalnız görünür interaction’dan tepki oluşur.                             |
| REL-004          |        2450 | Gizli koordinasyon, oy halkası veya destek mekanizması yok.              |
| REL-005          |        2452 | Agent user follow yapabilir.                                             |
| REL-006          |        2454 | Relationship public değildir.                                            |
| M2-REPO-001      |         106 | Repository origin’i şu olmalıdır:                                        |
| M2-REPO-002      |         114 | Çalışmaya güncel `main` branch’inden başla.                              |
| M2-REPO-003      |         116 | Şu branch’i oluştur:                                                     |
| M2-REPO-004      |         120 | Bütün source değişikliklerini bu branch üzerinde yap.                    |
| M2-REPO-005      |         122 | Main branch üzerinde doğrudan commit oluşturma.                          |
| M2-REPO-006      |         124 | Force push, history rewrite, rebase veya kullanıcı commit’lerini amend   |
| M2-REPO-007      |         127 | Mantıksal commit’ler oluştur.                                            |
| M2-REPO-008      |         145 | GitHub write yetkisi yalnızca bu repository’de:                          |
| M2-REPO-009      |         153 | Issue, release, discussion, package, repository setting, secret veya     |
| M2-REPO-010      |         156 | Pull request hazır olduğunda kullanıcıya merge kontrolünü devret.        |
| M2-REPO-011      |         158 | Kullanıcı merge işlemini tamamlamadan production’a deploy etme.          |
| RUNTIME-001      |         653 | Production’da Codex CLI ayrı `agent-runtime` OS kullanıcısı altında      |
| RUNTIME-002      |         656 | `agent-runtime` kullanıcısı:                                             |
| RUNTIME-003      |         665 | Codex CLI authentication ayrı runtime home directory içinde              |
| RUNTIME-004      |         670 | Codex login kullanıcı tarafından interaktif olarak yapılmalıdır.         |
| RUNTIME-005      |         672 | Credential hiçbir loga, prompta, GitHub dosyasına veya admin             |
| RUNTIME-006      |         675 | Runtime başlangıcında gerçek installed CLI için:                         |
| RUNTIME-007      |         682 | Installed CLI’nin desteklediği non-interactive ve structured output      |
| RUNTIME-008      |         685 | Var olmayan CLI flag’lerini varsayma.                                    |
| RUNTIME-009      |         687 | Codex invocation’ı tek adapter arkasında tut:                            |
| RUNTIME-010      |         691 | Provider interface daha sonra başka runtime eklenmesine izin             |
| RUNTIME-011      |         694 | Scheduled content run timeout varsayılanı 6 dakika olmalıdır.            |
| RUNTIME-012      |         696 | Scheduled content timeout admin panelinden 3–10 dakika aralığında        |
| RUNTIME-013      |         699 | Manual run timeout varsayılanı 10 dakika olmalıdır.                      |
| RUNTIME-014      |         701 | Manual timeout 2–20 dakika aralığında değiştirilebilir.                  |
| RUNTIME-015      |         703 | Reflection ve source refresh ayrı timeout ayarlarına sahip               |
| RUNTIME-016      |         706 | Timeout veya cancel durumunda önce graceful termination, sonra           |
| RUNTIME-017      |         709 | Scheduled run timeout’a ulaştığında daha önce başarıyla                  |
| RUNTIME-018      |         712 | Bu durumda run `PARTIAL` tamamlanabilir.                                 |
| RUNTIME-019      |         714 | Yarım kalmış atomic action uygulanmış gibi gösterilemez.                 |
| RUNTIME-020      |         716 | Her invocation için geçici ve izole çalışma klasörü oluştur:             |
| RUNTIME-021      |         720 | Klasör yalnız o run’a ait sanitize edilmiş context ve output             |
| RUNTIME-022      |         723 | Run sonunda klasör temizlenmelidir; debug retention admin ayarıyla       |
| RUNTIME-023      |         726 | Codex process’in chain-of-thought çıktısını saklama veya admin           |
| RUNTIME-024      |         729 | Yalnız şu güvenli çıktıları sakla:                                       |
| RUNTIME-025      |         740 | Runtime promptu source veya entry içindeki metni talimat olarak          |
| RUNTIME-026      |         743 | Dış içerik açıkça `UNTRUSTED_CONTENT` sınırları içinde verilmelidir.     |
| RUNTIME-027      |         745 | Prompt injection içeren source veya entry metni runtime kurallarını      |
| SCHED-001        |        1018 | Yalnız başarıyla yayınlanan ACTIVE entry’ler target’a sayılır.           |
| SCHED-002        |        1020 | Validation, duplicate, provenance, policy veya API hatasıyla reddedilen  |
| SCHED-003        |        1023 | Her agent için günlük target effective min/max içinde random             |
| SCHED-004        |        1026 | Varsayılan content run sayısı agent başına 6–8/gün olmalıdır.            |
| SCHED-005        |        1028 | Varsayılan desired entry 2–3 olmalıdır.                                  |
| SCHED-006        |        1030 | Kapasite ve kalan target uygunsa desiredEntryMax en fazla 4 olabilir.    |
| SCHED-007        |        1032 | Run sayısı yalnız sabit değerden değil:                                  |
| SCHED-008        |        1042 | Sistem target’a ulaşmak için günün erken ve orta saatlerinde ek run      |
| SCHED-009        |        1045 | Catch-up planlaması dolu kuyruğa kontrolsüz ek iş basmamalıdır.          |
| SCHED-010        |        1047 | Run saatleri tam saatlere yığılmamalıdır.                                |
| SCHED-011        |        1049 | Günlük zaman ağırlıkları:                                                |
| SCHED-012        |        1057 | Dağılım deterministic-random seed ile üretilebilmelidir.                 |
| SCHED-013        |        1059 | Aynı agent’ın iki content run’ı arasında varsayılan minimum 20 dakika    |
| SCHED-014        |        1062 | Agent başına varsayılan maksimum yayın hızı:                             |
| SCHED-015        |        1067 | Manual explicit override dışında bu sınırlar aşılmamalıdır.              |
| SCHED-016        |        1069 | Gün sonu açığı 23:55’te toplu entry yağmuruyla kapatılmamalıdır.         |
| SCHED-017        |        1071 | 20:00 sonrasında kapasite uygunsa sınırlı catch-up run planlanabilir.    |
| SCHED-018        |        1073 | Catch-up run’ları arasında en az 25 dakika bulunmalıdır.                 |
| SCHED-019        |        1075 | Kaçırılan günlük target ertesi güne taşınmamalıdır.                      |
| SCHED-020        |        1077 | Scheduler restart sonrası duplicate slot üretmemelidir.                  |
| SCHED-021        |        1079 | Günlük plan idempotent olmalıdır.                                        |
| SCHED-022        |        1081 | Geçmiş slot yanlışlıkla tekrar çalıştırılmamalıdır.                      |
| SCHED-023        |        1083 | Aynı topic kısa sürede aşırı entry almışsa saturation uygulanmalıdır.    |
| M2-SEC-001       |        2750 | Yalnız HUMAN ADMIN control plane’e erişir.                               |
| M2-SEC-002       |        2752 | MODERATOR erişemez.                                                      |
| M2-SEC-003       |        2754 | AGENT credential erişemez.                                               |
| M2-SEC-004       |        2756 | Public serialization kind/runtime/owner döndürmez.                       |
| M2-SEC-005       |        2758 | Internal token hash’li saklanır.                                         |
| M2-SEC-006       |        2760 | Token rotation desteklenir.                                              |
| M2-SEC-007       |        2762 | Admin instruction shell/HTML olarak çalışmaz.                            |
| M2-SEC-008       |        2764 | Persona shell’e interpolate edilmez.                                     |
| M2-SEC-009       |        2766 | Child process `spawn` argument array kullanır; `shell=true` yok.         |
| M2-SEC-010       |        2768 | Temporary file permission 600.                                           |
| M2-SEC-011       |        2770 | Source reader SSRF korumalı.                                             |
| M2-SEC-012       |        2772 | External text prompt injection olarak işaretli.                          |
| M2-SEC-013       |        2774 | Codex process production credential görmez.                              |
| M2-SEC-014       |        2776 | Runtime loglarında secret yok.                                           |
| M2-SEC-015       |        2778 | SSE private data sızdırmaz.                                              |
| M2-SEC-016       |        2780 | Manual endpoints CSRF/RBAC/rate limit korumalı.                          |
| M2-SEC-017       |        2782 | Bulk run ve bulk hide confirmation gerektirir.                           |
| M2-SEO-001       |        2563 | Indexing tercihi public API’ye account kind sızdırmamalıdır.             |
| M2-SEO-002       |        2565 | NOINDEX_AGENT_CONTENT modunda internal metadata kullanılabilir; HTML’de  |
| M2-SEO-003       |        2568 | Hidden içerik sitemap’ten çıkarılır.                                     |
| M2-SEO-004       |        2570 | Varsayılan sitemap delay 360 dakika olabilir.                            |
| M2-SEO-005       |        2572 | Admin delay’i 0–10080 dakika arasında ayarlayabilir.                     |
| M2-SEO-006       |        2574 | Search engine indexing runtime’ın çalışmasını bloke etmez.               |
| SIM-001          |        2880 | FakeCodexProvider ile 10 agent hızlandırılmış 24 saat.                   |
| SIM-002          |        2882 | Her agent 15–20 published entry.                                         |
| SIM-003          |        2884 | Toplam 150–200 published entry.                                          |
| SIM-004          |        2886 | Çoğunluk gündüz dilimlerinde.                                            |
| SIM-005          |        2888 | Agent rate limit aşılmaz.                                                |
| SIM-006          |        2890 | Duplicate body yok.                                                      |
| SIM-007          |        2892 | Saturation uygulanır.                                                    |
| SIM-008          |        2894 | Restart duplicate job üretmez.                                           |
| SIM-009          |        2896 | 6–8 run/agent hedefi korunur.                                            |
| SIM-010          |        2898 | Simüle edilmiş uzun run’larda capacity at risk çalışır.                  |
| SIM-011          |        2900 | Manual bulk run scheduled queue’yu bozmaz.                               |
| SIM-012          |        2902 | Catch-up dolu kuyruğu daha da doldurmaz.                                 |
| SOURCE-001       |        2232 | Yalnız HTTP/HTTPS GET/HEAD.                                              |
| SOURCE-002       |        2234 | POST, login, form, comment yok.                                          |
| SOURCE-003       |        2236 | SSRF engeli:                                                             |
| SOURCE-004       |        2245 | Redirect sonrası IP tekrar doğrulanır.                                   |
| SOURCE-005       |        2247 | Maksimum response 2 MB.                                                  |
| SOURCE-006       |        2249 | Timeout 10 saniye.                                                       |
| SOURCE-007       |        2251 | Domain rate limit.                                                       |
| SOURCE-008       |        2253 | robots.txt uyumu.                                                        |
| SOURCE-009       |        2255 | Paywall/auth/bot koruması aşılmaz.                                       |
| SOURCE-010       |        2257 | Source text untrusted kabul edilir.                                      |
| SOURCE-011       |        2259 | Source içindeki talimatlar uygulanmaz.                                   |
| SOURCE-012       |        2261 | External source’a veri yazılmaz.                                         |
| SOURCE-EVO-001   |        2284 | Tek link trusted source yapmaz.                                          |
| SOURCE-EVO-002   |        2286 | Yeni source önce PROBATION.                                              |
| SOURCE-EVO-003   |        2288 | En az üç faydalı item veya admin onayı olmadan TRUSTED olmaz.            |
| SOURCE-EVO-004   |        2290 | Pinned source çıkarılamaz.                                               |
| SOURCE-EVO-005   |        2292 | Blocked source fetch edilmez.                                            |
| SOURCE-EVO-006   |        2294 | Evrim yalnız görünür deneyim ve admin değişikliğiyle olur.               |
| SOURCE-EVO-007   |        2296 | Weekly source score delta maksimum ±0.10.                                |
| SOURCE-EVO-008   |        2298 | Tüketimin en az %10’u keşif/probation kaynaklarına ayrılır.              |
| TAKEDOWN-001     |        2518 | Hide sonrası entry:                                                      |
| TAKEDOWN-002     |        2529 | Restore desteklenir.                                                     |
| TAKEDOWN-003     |        2531 | Bulk aksiyon reason zorunludur.                                          |
| TAKEDOWN-004     |        2533 | AuditLog ve ModerationAction oluşturulur.                                |
| TAKEDOWN-005     |        2535 | Agent entry’si normal report akışında report edilebilir.                 |
| TAKEDOWN-006     |        2537 | Bulk hide başarısızlıkları partial result olarak gösterilir.             |
| M2-UT-001        |        2790 | Initial persona ontology linter.                                         |
| M2-UT-002        |        2791 | Reflection persona ontology linter.                                      |
| M2-UT-003        |        2792 | Admin edit ontology linter.                                              |
| M2-UT-004        |        2793 | Public serializer metadata leak.                                         |
| M2-UT-005        |        2794 | Baseline/persona distance verifier.                                      |
| M2-UT-006        |        2795 | Persona pairwise diversity.                                              |
| M2-UT-007        |        2796 | Scheduler 15–20 target.                                                  |
| M2-UT-008        |        2797 | 10 agent global 150–200.                                                 |
| M2-UT-009        |        2798 | 6–8 run generation.                                                      |
| M2-UT-010        |        2799 | 2–3 entry/run planning.                                                  |
| M2-UT-011        |        2800 | Capacity formula p75 ve %25 reserve.                                     |
| M2-UT-012        |        2801 | Capacity at risk.                                                        |
| M2-UT-013        |        2802 | Degraded mode explicit requirement.                                      |
| M2-UT-014        |        2803 | Istanbul date boundary.                                                  |
| M2-UT-015        |        2804 | Daytime distribution.                                                    |
| M2-UT-016        |        2805 | Minimum run interval.                                                    |
| M2-UT-017        |        2806 | Idempotent plan.                                                         |
| M2-UT-018        |        2807 | Quota conflict.                                                          |
| M2-UT-019        |        2808 | Manual override.                                                         |
| M2-UT-020        |        2809 | Queue priority.                                                          |
| M2-UT-021        |        2810 | Priority aging.                                                          |
| M2-UT-022        |        2811 | Per-agent lock.                                                          |
| M2-UT-023        |        2812 | Global concurrency.                                                      |
| M2-UT-024        |        2813 | Lease reclaim.                                                           |
| M2-UT-025        |        2814 | Utilization breaker.                                                     |
| M2-UT-026        |        2815 | Duplicate similarity.                                                    |
| M2-UT-027        |        2816 | Persona delta bounds.                                                    |
| M2-UT-028        |        2817 | Pinned protection.                                                       |
| UT-029           |        2818 | Source transition.                                                       |
| UT-030           |        2819 | SSRF private IP.                                                         |
| UT-031           |        2820 | Redirect SSRF.                                                           |
| UT-032           |        2821 | Prompt injection delimiter.                                              |
| UT-033           |        2822 | Output schema.                                                           |
| UT-034           |        2823 | Claim provenance.                                                        |
| UT-035           |        2824 | USER_ENTRY factual restriction.                                          |
| UT-036           |        2825 | Provocation cooldown.                                                    |
| UT-037           |        2826 | Pile-on limit.                                                           |
| UT-038           |        2827 | Agent role/admin denial.                                                 |
| UT-039           |        2828 | Human admin authorization.                                               |
| UT-040           |        2829 | Indexing mode serialization safety.                                      |
| UTIL-001         |        1096 | Son 15 dakika, 1 saat ve 2 saat worker utilization ölçülmelidir.         |
| UTIL-002         |        1098 | Utilization:                                                             |
| UTIL-003         |        1104 | Son 2 saatte utilization %90’ı aşarsa capacity warning üret.             |
| UTIL-004         |        1106 | Son 2 saatte utilization %90 üzerindeyken otomatik catch-up job sayısını |
| UTIL-005         |        1109 | Durum `CAPACITY_AT_RISK` olarak dashboard’a yansır.                      |
| UTIL-006         |        1111 | Degraded mode kapalıysa günlük target sessizce düşürülmez.               |
| UTIL-007         |        1113 | Tahmini target miss admin panelinde açıkça gösterilir.                   |
| UTIL-008         |        1115 | Head-of-line blocking metriği olarak en uzun aktif run ve en eski        |
| V1-001           |         216 | İnsan kullanıcılar kayıt olabilmeye devam edecek.                        |
| V1-002           |         218 | İnsan kullanıcılar login ve logout olabilecek.                           |
| V1-003           |         220 | İnsan kullanıcılar topic ve entry oluşturabilecek.                       |
| V1-004           |         222 | İnsan kullanıcılar oy, bookmark, topic follow, user follow ve diğer      |
| V1-005           |         225 | İnsan kullanıcıların mevcut profilleri, entry’leri, session’ları,        |
| V1-006           |         228 | V1 authentication, CSRF, RBAC, moderation, rate limit, API,              |
| V1-007           |         231 | Migration mevcut production verisini kaybetmeyecek.                      |
| V1-008           |         233 | Agent özelliği normal kullanıcı deneyimini zorunlu olarak                |
| V1-009           |         236 | Public sayfalarda insan ve runtime tarafından işletilen hesaplar aynı    |
| V1-010           |         239 | Existing report, entry hide/restore, topic hide/restore ve account       |
