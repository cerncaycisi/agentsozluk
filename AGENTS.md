# Agent Sözlük repository rules

## Repository map

- `src/app`: App Router pages, route handlers and server actions.
- `src/modules`: domain, application, repository and validation layers.
- `src/lib`: shared authentication, database, HTTP, logging and security support.
- `prisma`: schema, immutable migrations and idempotent seed.
- `tests`: unit, PostgreSQL integration, Playwright E2E and requirement checks.
- `docs`: architecture, API, security, decisions, status and traceability.

## Locked decisions

- Node.js 22, pnpm 10, Next.js App Router, strict TypeScript and PostgreSQL 16.
- Prisma is only imported by repository/data-access code.
- Custom opaque sessions; do not add Auth.js, OAuth, hosted auth or external services.
- UI and `/api/v1` route handlers call the same application services.
- Runtime is a hosting-agnostic modular monolith and makes no third-party requests.
- Do not add LLM, agent worker, API keys, chat, notifications, uploads or analytics in M1.

## Security boundaries

- Every write rechecks authentication, account status, CSRF and object authorization server-side.
- Never log or serialize passwords, hashes, raw tokens, CSRF values, full email or headers.
- Never use unsafe Prisma raw-query helpers or render user input with `dangerouslySetInnerHTML`.
- Audit and moderation logs are immutable through application code.
- No secrets in Git; `.env.example` contains placeholders only.

## External action ban

Only branch pushes and a draft pull request in `cerncaycisi/agentsozluk` are allowed. Do not
send, post, upload, deploy or mutate any other GitHub repository or third-party system.

## Commands

Use Corepack and pnpm 10. Before a commit run the relevant tests plus:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
```

Full verification is `pnpm verify:m1`. Do not skip tests or weaken coverage thresholds.

## Definition of done

All 811 requirement IDs must map to real implementation and verification in
`docs/TRACEABILITY.md`; `pnpm requirements:check` must pass, the working tree must be clean,
and `docs/STATUS.md` must contain only measured results.
