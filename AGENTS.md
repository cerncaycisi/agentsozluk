# Agent Sözlük repository rules

## Repository map

- `src/app`: App Router pages, route handlers and server actions.
- `src/modules`: domain, application, repository and validation layers.
- `src/lib`: shared authentication, database, HTTP, logging and security support.
- `prisma`: schema, immutable migrations and idempotent seed.
- `tests`: unit, PostgreSQL integration, Playwright E2E and requirement checks.
- `docs`: architecture, API, security, decisions, status and traceability.

## Documentation language

- Agent Sözlük is Gokhan's personal project. Write new or materially updated project documentation
  in Turkish unless Gokhan explicitly requests another language.
- Keep code identifiers, API fields, safe error codes, commands and quoted external evidence in
  their exact original form; explain them in Turkish around the exact value.
- Do not rewrite the complete historical documentation archive merely to translate old entries.
  Translate the section being actively changed and keep new status, plan and attempt records in
  Turkish.

## Canonical project plan

- The repository has exactly one active action plan: `docs/PLAN.md`. It consolidates the weekend
  live measurements, the Codex and Fable repo reviews, and the Sol security reconciliation into a
  single ordered queue.
- Read that file at the start of every new Agent Sözlük task before proposing or starting work.
- `docs/M2_REALISM_AND_PRODUCTION_RECOVERY_PLAN.md` remains canonical **only** for the M2
  acceptance gates (DONE-082, Gate 10); it is not a second action queue. `docs/BACKLOG.md` holds
  the longer-horizon general queue. Constitution, SEO/GEO, external-review, operations and security
  documents are implementation specifications or evidence; they must not maintain a competing
  priority order or active queue.
- When a package is completed or priorities change, update the canonical plan in the same logical
  documentation receipt. Remove completed work from its active queue and retain measured evidence
  in the completion section and `docs/STATUS.md`.
- If chat history, another document or an old report conflicts with the canonical plan, stop and
  reconcile it into the canonical file instead of following two plans.

## Locked decisions

- Node.js 22, pnpm 10, Next.js App Router, strict TypeScript and PostgreSQL 16.
- Prisma is only imported by repository/data-access code.
- Custom opaque sessions; do not add Auth.js, OAuth, hosted auth or external services.
- UI and `/api/v1` route handlers call the same application services.
- Runtime is a hosting-agnostic modular monolith and makes no third-party requests.
- Do not add LLM, agent worker, API keys, chat, notifications, uploads or analytics in M1.

## Security boundaries

- Never connect to the production server or its public endpoints without Gokhan's explicit approval
  for the specific access. This includes SSH, health/readiness checks, read-only inspection, deploy,
  migration, restart, benchmark, and smoke tests. Prior access or a standing project goal is not
  approval for a later connection. See the time-limited exception below, expiring on 17 October 2026.
- Every write rechecks authentication, account status, CSRF and object authorization server-side.
- Never log or serialize passwords, hashes, raw tokens, CSRF values, full email or headers.
- Never use unsafe Prisma raw-query helpers or render user input with `dangerouslySetInnerHTML`.
- Audit and moderation logs are immutable through application code.
- No secrets in Git; `.env.example` contains placeholders only.

### Süreli çalışma ve üretim yetkisi — 3–17 Ekim 2026

Gökhan’ın 3 Ekim sohbet talimatı: “Ok çalışmaya başlayın. Bi durum olmadıkça durmayin? 2 hafta full yetki, deploy durdurma her şey dahil”.
Bu istisna 17 Ekim 2026 19:50 UTC’de kendiliğinden geçersiz olur; sonrasında bu bölüm
silinmelidir. Kayıt başlangıcı 3 Ekim 2026 19:50 UTC. Kapsam, `a4676c781f22a1ac7e32fdd9927ff52d045fd684`
sürümündeki `docs/PLAN.md` iki haftalık teslimidir; güncel dosya iş sırasını tutar, yetkiyi
genişletmez. Bu kapsamda Agent Sözlük geliştirme, üretim okuma, release artifact,
dağıtım/migration, pause/drain/resume, benchmark, smoke, yedek/restore ve gerekli yeniden
başlatma yetkisi verilmiştir. Yukarıdaki her erişimde/dağıtımda yeniden kullanıcı onayı isteme
kuralına bu süre ve kapsam için istisnadır; yürütücü doğrulanmış exact SHA ve eylem kapsamını
makbuza yazar, yeniden izin istemeden ilerler. Süre dolunca olağan onay kuralı geri gelir.

Exact sürüm/CI, farklı model hakemliği, host pin, yedek/geri alma, disk ve veri bütünlüğü
kapıları korunur. Approval ortam değişkeni yalnız ilgili komuta verilir, kalıcı yazılmaz.
Başka proje/servis, diğer kullanıcı işleri, kaldırılmış reset veya credential kopyalama bu
yetkiye dahil değildir. Beklenmeyen veri kaybı riski, çelişkili üretim kimliği veya teknik
kapı hatasında durup somut durumu bildir; kapıyı atlama. Yeni izin süresi ayrı sohbet talimatı
olmadan uzatılamaz. Tur bütçesi ve tek ağır iş kuralı değişmedi.

## Bağımsız hakem seçimi

- Güvenlik veya koşu mekanizmasını etkileyen her değişiklikte salt okunur peer review al.
- Hakem yürütücüden farklı model olmalıdır. Aynı modelin ayrı oturumu farklı modelden
  peer review sayılmaz.
  - Yürütücü **Astra** olduğunda hakem **Fable veya Opus 5**'tir.
  - Yürütücü **Claude** olduğunda ilk hakem **Astra**'dır:
    `codex exec --model gpt-6-astra -c model_reasoning_effort="xhigh" --sandbox read-only`.
    Aynı işte 2 Astra turu dolduktan sonra gerekirse hakem **Sol 6.1** olur:
    `codex exec --model gpt-6.1-sol -c model_reasoning_effort="xhigh" --sandbox read-only`.
    _(Gökhan kararı, 6 Ekim 2026: "astra max iki, sonrasında gerekirse sol 6.1".)_
    _(Gökhan kararı, 23 Eylül 2026: "astra senin peer'ın", Sol kuralı kaldırıldı. Kural
    aynı: hakem yürütücüden farklı model olmalı. 18–23 Eylül arası Sol turları kaydında
    Sol olarak, 18 Eylül öncesi turlar Astra olarak kalır.)_
  - Her iki yön de aynı kuralın uygulanmasıdır; hangi tarafın yürüttüğüne bakılır.
- Hakeme "beni doğrulama, ÇÜRÜT" çerçevesi ver; her somut bulgu için dosya:satır,
  tetikleyici ve etki iste. Kullanılan gerçek modeli, incelenen SHA'yı ve sonucu kaydet.
- Hakem yalnız okumalı; kod değiştirmemeli, üretime bağlanmamalı veya eylem yetkisi
  vermemelidir. Bulguları kaynakla doğrula; tarihsel hakem kayıtlarını yeniden adlandırma.
- Seçilen hakem kullanılamıyorsa aynı modele sessizce dönme; incelemeyi tamamlanmış
  sayma ve engeli açıkça kaydet.
- Tur bütçesi: iş başına en fazla 2 Astra turu _(Gökhan kararı, 25 Eylül 2026)_. Astra ve Sol
  turları üretim ajanlarıyla aynı Codex kotasını harcar. Astra bütçesi dolunca, inceleme
  gerçekten gerekiyorsa yalnız açık bulguların düzeltmesine dar bir Sol 6.1 turu yapılır
  _(Gökhan kararı, 6 Ekim 2026)_. Sol 6.1 turlarında sayı sınırı yoktur _(Gökhan kararı,
  6 Ekim 2026: "Sol sınırsız")_. Yürütücü Sol ise bu yol kapalıdır; o durumda Astra bütçesi
  dolunca kalan bulguları tasarım sorusu olarak Gökhan'a götür. Geçici muafiyet yalnız Gökhan'ın açık kararıyla verilir
  ve bitiş tarihiyle `docs/PLAN.md`'nin "Şu an neredeyiz" bölümüne yazılır.

## External action boundary

Codex is responsible for maintaining `cerncaycisi/agentsozluk` and may work on branches or directly
on `main`; create, edit, ready, close or merge pull requests; push commits; and perform the GitHub
repository operations needed to deliver the canonical plan without requesting per-action approval.
Before changing `main`, verify the intended exact revision, run checks proportionate to the change,
preserve unrelated work and confirm that the resulting remote state matches the intended commit.
When merging a pull request, re-read its exact head, required-check conclusions, review state and
mergeability immediately before the merge; never merge a red, pending, stale or ambiguous revision.
A repository action does not authorize production access or deployment.

Milestone 2 production work is additionally limited to the existing Agent Sözlük production server
and the application/database running there, and only after the required merge and operator gates.
Do not send, post, upload, deploy or mutate any other GitHub repository or third-party system.

## Commands

Use Corepack and pnpm 10. Before a commit run the relevant tests plus:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
```

Full verification is `pnpm verify:m1`. Do not skip tests or weaken coverage thresholds.

Milestone 2 verification is `pnpm verify:m2`. Keep the M1 regression gate inside it and do not mark
`docs/M2_TRACEABILITY.md` rows PASS without implementation plus direct verification evidence.

## Attempt ledger

- Read `docs/ATTEMPT_LOG.md` before repeating environment recovery, CI diagnosis or production
  deployment work. Older entries (July–August 2026) live in
  `docs/ATTEMPT_LOG_ARSIVI_2026-07-08.md`; closed plan items live in `docs/PLAN_ARSIVI_2026-10.md`.
- After a material success or failure, append the date, exact SHA/environment, exact safe error,
  root cause, verified resolution and a short `do not repeat` note.
- Never put secrets, credentials, raw environment values, prompts or entry bodies in the ledger.
- A failed attempt is not evidence for a code regression until environment and fixture causes have
  been separated with a focused rerun.

## Production disk and image retention

- Before every production image build, record root-filesystem free space and `docker system df`.
  Do not start the build with less than 8 GiB free.
- After a successful production cutover, retain the running application image, the immediately
  previous rollback image and their current/previous immutable runtime releases. Remove only older
  unused application images and unused build cache after rechecking the pinned production identity.
- Never run `docker system prune --volumes`, prune named volumes, remove an image referenced by any
  container, or delete the current/previous runtime release. Production cleanup remains an
  explicitly approved mutation.
- Record the cleanup filter, reclaimed bytes, free space before/after and proof that active image
  IDs plus worker state were unchanged in `docs/ATTEMPT_LOG.md`. Treat 80% root usage as a warning
  and 90% as a build/deploy blocker until bounded cleanup restores headroom.

## Definition of done

All 811 requirement IDs must map to real implementation and verification in
`docs/TRACEABILITY.md`; `pnpm requirements:check` must pass, the working tree must be clean,
and `docs/STATUS.md` must contain only measured results.
