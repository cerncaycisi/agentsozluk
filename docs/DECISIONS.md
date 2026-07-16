# Architecture decisions

## ADR-001 — Corrected repository URL

The pasted goal named `cerncaycisi/agent-sozluk`. GitHub returned `Repository not found` via
HTTPS and API. The user explicitly corrected the target to `cerncaycisi/agentsozluk`, which
was verified and cloned. The corrected repository is authoritative for this delivery.

## ADR-002 — Empty remote without main

The corrected remote contained zero commits and no default branch. There was therefore no
`main` SHA from which to create a normal child branch. The unborn branch was named `main` and
the worktree switched to `codex/milestone-1` before any file was created. No application work
is being committed directly to `main`. A draft PR remains dependent on a remote `main` base.

## ADR-003 — Stable dependency line

The implementation uses Node 22 and pnpm 10 metadata, Next.js 15.5, React 19.1, Prisma 6.19,
TypeScript 5.9 and PostgreSQL 16. Versions are exact and avoid beta, canary and floating ranges.

## ADR-004 — External isolation

Runtime integrations, telemetry, remote fonts, analytics and outbound webhooks are prohibited.
Only PostgreSQL is a runtime dependency. GitHub writes are limited to the working branch and a
draft pull request in the corrected repository.
