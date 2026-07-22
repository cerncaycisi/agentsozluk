# Agent Sözlük attempt ledger

This append-only ledger prevents repeated debugging and deployment mistakes. Read it before CI,
runtime recovery or production work. Record only safe operational evidence; never include secrets,
credentials, raw environment values, prompts or entry bodies.

## 2026-07-22 — continuous stochastic flow

### Local PostgreSQL integration rerun

- Scope: focused `agent-control-plane` integration test after retiring daily targets.
- Failed attempt: a guessed TCP URL used the wrong local database role.
- Exact error: `User was denied access on the database (not available)`; all 19 tests failed during
  database reset before application assertions ran.
- Root cause: environment identity, not repository code.
- Verified resolution: discover the running PostgreSQL 16 instance with `pg_isready` and query the
  current local role through `psql -d postgres`; run the isolated test database as that role.
- Result: `tests/integration/agent-control-plane.test.ts` passed `19/19`.
- Do not repeat: do not guess local PostgreSQL credentials and do not classify reset/setup failures
  as product test failures.

### GitHub Actions run 29904101551

- SHA: `aabed2d0605284cab75cbc2ebc29c62e99a1ac30`.
- Passed before failure: format, lint, typecheck, unit, integration, life-ledger acceptance,
  coverage, OpenAPI, M1 requirements, M2 simulation, persona verifier, metadata leak scan and
  production build.
- Failed check: `End-to-end tests`.
- Exact product-contract mismatch: `E2E-005 quota change` expected HTTP 200 but the intentionally
  retired endpoint returned HTTP 410 with `AGENT_DAILY_PLANNING_RETIRED`.
- Retry side effect: the serial suite had already created its fixture agent, then retried with the
  same canonical persona and received `PERSONA_PAIRWISE_DISTANCE_REJECTED`.
- Root cause: stale E2E expectations plus a non-retry-safe persona fixture; not a continuous-flow
  runtime regression.
- Resolution: assert the retired 410 contract and select a different canonical persona per retry.
- Do not repeat: whenever a control-plane feature is retired, update E2E contracts in the same
  commit; serial Playwright setup that writes persistent records must be retry-safe.

### Local Playwright environment and stale manual-run override

- Failed environment attempt: launching Playwright through the fallback package-manager wrapper
  caused its global-setup subprocess to use Node 24.14 and pnpm 11.9.
- Exact error: `ERR_PNPM_UNSUPPORTED_ENGINE`; the repository requires Node 22 and pnpm 10.
- Verified environment path: launch the Playwright CLI with the Homebrew Node 22 binary, set
  `npm_execpath` to the cached Corepack pnpm 10 CLI, and use `E2E_PRODUCTION_SERVER=true` after a
  successful production build. Development-server mode can spend the 30-second test timeout on a
  cold route compile and is not equivalent to CI's production-server mode.
- Product-contract mismatch found after the environment fix: `E2E-021` still sent
  `dailyMaximumOverride: true`; the retired override correctly returned HTTP 410 with
  `AGENT_DAILY_PLANNING_RETIRED`.
- Resolution: remove retired daily/saturation overrides from fixtures and remove daily target,
  projected shortfall, catch-up and daily SLO rows from the capacity UI.
- Verified result: production-server Chromium run for `tests/e2e/agent-society.spec.ts` passed
  `23/23`; focused control-plane integration remained `19/19`, and format, lint, typecheck plus
  production build passed.
- Do not repeat: run the exact production-server E2E mode for CI parity and search the full E2E
  suite for retired request fields, not only the first failing test.
