# Milestone 1 status

## Initial repository state — 2026-07-16 Europe/Istanbul

- Requested origin in the pasted goal: `https://github.com/cerncaycisi/agent-sozluk`.
- User-corrected origin: `https://github.com/cerncaycisi/agentsozluk`.
- Verified origin: `https://github.com/cerncaycisi/agentsozluk.git`.
- Initial branch: empty repository with no commit and no GitHub default branch.
- Working branch: `codex/milestone-1`.
- Main branch last commit SHA: unavailable; the remote repository had zero commits.
- Initial working tree: clean and empty after clone.
- Repository empty: yes.
- Existing technology stack: none.
- Existing features, migrations, tests, Docker and CI: none.
- Local tools: system Node `v25.6.1`; Corepack, Docker and `psql` were not installed.

## Current phase

The Milestone 1 feature set, PostgreSQL data layer, public/account/moderation UI, REST/OpenAPI,
idempotency, transactional outbox, production build and container packaging are implemented.
All locally provable Phase 9 and Phase 10 gates pass: unit/integration coverage, production-server
Playwright, OpenAPI, build, dependency/security hygiene, Docker build, Compose runtime and a
production restore/migration drill. Phase 10 remains in progress only for logical commits, a clean
working tree, branch push, draft pull request and final GitHub CI. Validation results below are
recorded only after the corresponding command or runtime check actually ran.

## Validation ledger

| Check                            | Result      | Evidence                                                                         |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| HTTPS clone of corrected repo    | PASS        | Empty repository cloned successfully                                             |
| Corrected origin                 | PASS        | `git remote get-url origin`                                                      |
| Working branch                   | PASS        | `codex/milestone-1`                                                              |
| Main SHA                         | PASS        | `6296e1f2886483f749af15f27d2add18df6b2e9c`                                       |
| Frozen pnpm install              | PASS        | pnpm 10.34.5; lockfile up to date                                                |
| Formatting                       | PASS        | Prettier check completed                                                         |
| ESLint                           | PASS        | 0 errors, 0 warnings                                                             |
| TypeScript                       | PASS        | strict `tsc --noEmit`                                                            |
| Unit tests                       | PASS        | 48 files, 165 tests                                                              |
| PostgreSQL integration tests     | PASS        | 3 files, 57/57 tests                                                             |
| Global coverage                  | PASS        | 51 files, 222 tests; lines/statements 92.39%; functions 94.08%; branches 85.97%  |
| Domain line coverage             | PASS        | auth 95.78%; topics 99.65%; entries 92.87%; moderation 90.84%; rate-limit 98.48% |
| OpenAPI runtime alignment        | PASS        | OpenAPI 3.1; 59/59 operations aligned                                            |
| Next production build            | PASS        | 40/40 static generation steps                                                    |
| Playwright E2E                   | PASS        | 24/24 across Chromium and Pixel 7                                                |
| Public axe gate                  | PASS        | serious and critical violations: 0                                               |
| Auth/account/moderation axe gate | PASS        | serious and critical violations: 0                                               |
| Prisma schema validation         | PASS        | Prisma 6.19.3 schema is valid                                                    |
| Prisma client generation         | PASS        | Node 22.23.1 with system CA                                                      |
| PostgreSQL 16 migration runtime  | PASS        | Clean database and restored final clone both reached all 5 migrations            |
| Seed first run                   | PASS        | 12 users, 30 topics, 180 entries                                                 |
| Seed second run                  | PASS        | Identical counts; no duplicates                                                  |
| Canonical seed integrity         | PASS        | 180/180 original agentic development-log entries preserved                       |
| Canonical seed immutability      | PASS        | Locked hash, app guards and DB trigger; destructive regression test passes       |
| Log path privacy                 | PASS        | Raw/encoded path emails redacted; malformed encoding regression passes           |
| Counter consistency              | PASS        | Entry mismatches 0; topic mismatches 0                                           |
| Production dependency audit      | PASS        | `pnpm audit --prod --audit-level critical`: no known vulnerabilities             |
| Repository/history secret scan   | PASS        | No high-confidence credential patterns; `.env.example` remains placeholder-only  |
| Required-feature hygiene         | PASS        | No TODO/FIXME/XXX/fake-success/empty/disabled/console-only required handler      |
| Whole-diff and security review   | PASS        | Final delta audit: P0 0, P1 0, P2 0; `git diff --check` passed                   |
| Docker runtime                   | PASS        | Colima 0.10.3; isolated 40 GiB build profile on `/Volumes/GB`                    |
| Project Docker image build       | PASS        | `agent-sozluk:m1-candidate-20260717-1448`; non-root UID 1001                     |
| Docker image credential scan     | PASS        | Config/filesystem scan clean; BuildKit CA secret absent from runner              |
| Docker Compose app/database      | PASS        | `up --build`; app/db healthy; 5 migrations; 12/30/180/180; admin login PASS      |
| Container endpoint smoke         | PASS        | `/api/health`, `/api/ready` and `/` returned HTTP 200                            |
| Production restore drill         | PASS        | 13/30/180/180; 5 migrations; seed disabled; UID 1001; secure admin login         |
| Canonical restore fingerprint    | PASS        | 180 entries; SHA-256 `826da961...868523d` matched exactly                        |
| Fresh final database backup      | PASS        | 59,633-byte custom dump; mode 0600; catalog/restore verified                     |
| Requirement coverage             | IN PROGRESS | 811 aligned IDs: 798 PASS, 13 FAIL, 0 BLOCKED                                    |
| Final repository closeout        | PENDING     | Commits, clean tree, branch push, draft PR, final verifier and GitHub CI remain  |

This machine does not expose the Docker Compose CLI plugin (`docker: unknown command: docker
compose`). Equivalent project validation used standalone `docker-compose` 5.3.1 and an isolated
40 GiB Colima profile. The image, Compose health, demo login, HTTP checks and production restore
drill passed, so this toolchain difference is not a project blocker. The convenience runtime at
`localhost:3000` remained healthy and unchanged during all isolated validation.

Fresh pre-migration backup:

- `/Volumes/GB/colima-migration-backups/20260717-145616/agentsozluk-final-pre-migrations.dump`
- SHA-256: `2ad0e1875208fb5cc6b9bc1dff81910b88bd465a8632e28715b5e808c5afc364`

## Push and draft PR

- `main` was created from foundation commit `6296e1f` with the user's one-time explicit permission.
- The working branch has not been pushed yet.
- A draft pull request has not been created yet.
