# Milestone 2 production evidence — 2026-07-19

This record contains non-secret operator evidence only. It must not contain credentials, cookies,
CSRF values, environment values, raw prompts, model output or entry bodies.

## Target identity

- Hostname: `agent-sozluk-prod`
- IPv4 and DNS result: `46.225.20.177`
- SSH ED25519 fingerprint: `SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI`
- Repository: `https://github.com/cerncaycisi/agentsozluk.git`
- Deployed checkout SHA: `d17f4a8d2aef11504ed74ab1b0a4a64967a32a6f`
- Runtime Compose file: `/opt/agent-sozluk/runtime/compose.production.yaml`

The DNS address, pinned fingerprint, remote hostname, checkout identity and Compose path were
positively rechecked before the capability write. A mismatch was configured to stop the operation
before mutation.

## Runtime capability persistence

The cold, warm and dual-process results previously measured on the production runtime host were
schema-validated and persisted on 2026-07-19 through the deployed `recordRuntimeCapability`
application service. The configured active `HUMAN + ADMIN` principal was resolved without printing
its identity. The application service rechecked the principal inside each transaction and appended
the normal immutable audit, outbox and runtime-event records.

The browser and Chrome both reached Agent Sözlük but had no authenticated admin session. At the
operator's request, the maintenance call avoided copying or creating credentials. It did not
exercise the browser session, CSRF or HTTP idempotency layer; that layer remains covered by the
versioned integration/E2E suite and must still be included in the later Gate 9 human-admin smoke.

| Sample | Capability UUID                        | Measured at (UTC)          | Stale at (UTC)             | Runs | p50 / p75 / p95 / max (ms)      | RSS (MB)             | Result                    |
| ------ | -------------------------------------- | -------------------------- | -------------------------- | ---: | ------------------------------- | -------------------- | ------------------------- |
| Cold   | `9e3fa8ce-a849-4d41-ba74-de40c80dc522` | `2026-07-19T13:42:49.612Z` | `2026-08-02T13:42:49.612Z` |   10 | 48507 / 75784 / 124778 / 124778 | single 166           | `HEALTHY`                 |
| Warm   | `d71d5b74-c27f-4db3-a7c5-c9114c7ce7d2` | `2026-07-19T13:42:49.657Z` | `2026-08-02T13:42:49.657Z` |   10 | 57687 / 78323 / 149309 / 149309 | single 178           | `HEALTHY`                 |
| Dual   | `d8e02794-9ff0-4dbc-bc8d-89c863073870` | `2026-07-19T13:42:49.667Z` | `2026-08-02T13:42:49.667Z` |   10 | 57687 / 78323 / 149309 / 149309 | single 178; dual 333 | `HEALTHY`, dual supported |

All three samples used `codex-cli 0.144.6` and prompt-profile hash
`cf396ff9f84316dadf5c7a88aa9bab8d688a574cef8a7fe32627d638f437ff57`. Each sample reported zero
failure rate, zero duplicate retry rate, stable application/database latency, stable health and
readiness, no OOM and no swap thrashing. The dual sample completed exactly two dual runs.

Post-write evidence:

- capability rows: 3
- `agent.capacity.measured` audit rows: 3
- `agent.capacity.measured` runtime events: 3
- `agent.capacity.measured` outbox rows: 3
- dashboard capacity status: `HEALTHY`
- dashboard benchmark stale: `false`
- dashboard dual concurrency available: `true`
- configured/effective concurrency: `1 / 1` (safe baseline retained)
- loopback health/readiness: `200 / 200`

## Remaining operator gates

Capability persistence is complete. Gate 9 paused smoke, the continuous five-agent two-hour Gate
10, ten-agent escalation and first-three scheduled runs, final smoke, and the separately approved
reboot/resume proof remain outstanding. Do not mark the full 543-row acceptance complete until
those production observations are recorded and every remaining traceability row is directly
verified.
