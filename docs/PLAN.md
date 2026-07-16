# Milestone 1 implementation plan

Every phase ends with formatting, linting, type checking, relevant tests, traceability updates
and a logical commit. A requirement is marked PASS only after its implementation and required
verification exist.

| Phase | Scope                                                              | Acceptance command       | Status      |
| ----- | ------------------------------------------------------------------ | ------------------------ | ----------- |
| 1     | Audit, branch, config, foundation, requirement manifest            | `pnpm check` subset      | COMPLETE    |
| 2     | Prisma schema, migrations, constraints, seed, counters             | DB integration suite     | COMPLETE    |
| 3     | Auth, sessions, CSRF, account, rate limiting                       | Auth/security suite      | IN PROGRESS |
| 4     | Topics, entries, renderer, interactions                            | Domain integration suite | COMPLETE    |
| 5     | Search, feeds, DEBE, profiles                                      | Search/feed suite        | COMPLETE    |
| 6     | Reports, moderation, audit and roles                               | Moderation suite         | PENDING     |
| 7     | Public/account/moderation UI, responsive, theme, a11y, SEO         | Playwright + axe         | PENDING     |
| 8     | REST API, OpenAPI, idempotency and outbox                          | API + schema validation  | PENDING     |
| 9     | Unit, integration, E2E and coverage completion                     | All test commands        | PENDING     |
| 10    | Docker, CI, security review, final verification, push and draft PR | `pnpm verify:m1`         | PENDING     |
