# Item 2 work package — source evidence chain repair

Created: 2026-08-02 Europe/Istanbul

Author of the diagnosis: Claude, read-only repository analysis at branch
`claude/handover-document-review-rywhqg`

Revision: 2026-08-02, corrected and completed after (a) an independent read-only
re-verification of every code claim against `main` at
`248a0c3079e21b56c5234f347d27fefb5dee85e6`, and (b) an approved read-only production
inspection. Three errors in the first draft were corrected, one finding was added, the
production blast radius was measured, and the §3 decisions were made. See §9 and §10 for
the exact verification records.

Status: **work package under canonical plan item 2, not a new queue. Decisions are made;
the repository-only implementation is complete; release and post-release evidence remain pending.**

## 0. Authority framing

This document does not create a parallel roadmap. `docs/M2_REALISM_AND_PRODUCTION_RECOVERY_PLAN.md`
remains the only active product and production queue, and this package belongs entirely inside its
item 2 ("credible source and evolution causality"). Reconcile the outcome back into that plan and
`docs/STATUS.md`; do not track this file as a separate backlog.

The §3 decisions were delegated by Gokhan on 2026-08-02 and are recorded here as made. They are
Gokhan's to reverse; they are not the implementer's to reopen.

## 1. Problem statement

Source items are fetched, committed and presented to writers, but no public action has ever retained
source-backed provenance in a measured production window. The canonical plan records the same
outcome at two different behavior SHAs:

- prompt profile v17 window: 564 items fetched, 142 committed, 369 presented, zero public action
  with source-backed provenance;
- prompt profile v18 window (`f090389195bf42b7fcc5638fa6bd7f2db84669f9`): 242 fetched, 77 committed,
  156 presented, **zero referenced**, zero source-backed actions.

Two different prompt profiles producing an identical exact-zero outcome is not a model behavior
signal. It indicates a structural block in the evidence chain. Repository analysis identified one
and production measurement confirmed it (§2.3).

## 2. Verified evidence chain

All findings below were read directly from source and independently re-verified. Line numbers are
from `main` at `248a0c3`.

Sections 2.1–2.4 preserve the pre-package diagnosis that authorized this work; the current local
implementation and refreshed line references are recorded in §11.

| #   | Location                                                                                         | Behavior                                                                                              |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | `src/modules/agents/repository/runtime.ts:1622,1656` (`listRuntimePerceptionSources`)            | Perception presents sources with status `SEED`, `PROBATION`, `TRUSTED`, `DISCOVERED`                  |
| 2   | `src/runtime/worker.ts:275-303`                                                                  | The action evidence catalog admits only `TRUSTED` and `PROBATION` items                               |
| 3   | `src/modules/agents/repository/runtime.ts:885-906`                                               | The server-side provenance validator also admits only those two statuses                              |
| 4   | `src/modules/agents/repository/runtime.ts:1470-1488`                                             | Runtime enters `SEED`/`DISCOVERED` into `PROBATION` and counts only post-entry items before `TRUSTED` |
| 5   | `src/modules/agents/personas/schema.ts:20`, `src/modules/agents/repository/control-plane.ts:173` | Persona packages declare sources as `SEED` or `TRUSTED` only                                          |
| 6   | `src/runtime/worker.ts:671-684`, `src/modules/agents/application/action-executor.ts:676`         | `PROPOSE_SOURCE` creates a **new** source from a URL; it never promotes an existing `SEED` source     |

The pre-package consequence was exact: a source that entered as `SEED` was presented to the writer
on every wake but could not be cited or leave `SEED` through any runtime path. The ladder's entry
state, `DISCOVERED`, was reachable only through runtime source discovery — persona-package sources
bypassed it entirely and landed in a terminal state. Finding 6 closed the last candidate escape
hatch: the writer's own `PROPOSE_SOURCE` action could not rescue a `SEED` source either. The only
pre-package escape was a manual admin status change in `updateAgentSourceAdmin`
(`src/modules/agents/application/control-plane.ts:148`, status assignment at 177-186).

The writer is behaving correctly. `src/runtime/prompt-profile.ts:13` instructs it to use only exact
`perception.evidenceCatalog` matches and to emit `NO_ACTION` when no match exists, so it falls back
to `MODEL_KNOWLEDGE`. The measured zero is the system working as written.

### 2.1 The same defect blocks the weekly reflection positive path

Item 2's second open half has the same root cause. Two different contracts govern the same field:

- Before this package, `src/runtime/worker.ts:330-334` required every `reflectionDelta.evidenceIds`
  value to be in the union of the evidence catalog, and `src/runtime/worker.ts:1049-1051` hard-threw
  `RUNTIME_PROVENANCE_CATALOG_INVALID` otherwise;
- `src/modules/agents/application/runtime.ts:434-446` accepts any ID present in the frozen
  perception snapshot, which does include `SEED` item IDs because they were presented.

The worker gate is strictly narrower than the server gate it is supposed to satisfy. A writer whose
sources are all `SEED` therefore cannot ground an evidence-linked persona change in what it has been
reading, which is precisely the natural weekly reflection path the plan records as still open.

### 2.2 Secondary defects in the same subsystem

- `src/modules/agents/repository/runtime.ts:1518-1528` now maps memory provenance only from the
  canonical `PROBATION`/`TRUSTED` status mapping; the former unguarded `SEED` mislabel is removed.
- `src/runtime/worker.ts:343-374` computes `sourceItemsReferenced` and `sourceBackedActions` from
  typed catalog provenance, while reflection-only source-item references are counted from the
  frozen snapshot's source-item IDs. The telemetry can therefore distinguish available source
  evidence from actual typed action use.
- **Status-list drift was wider than a single defect.** Before this package, the set of source
  statuses was spelled out independently at **at least eight** sites with **four different**
  memberships. The current sites below project the canonical declaration rather than restating
  independent lists:

  | Site                                                                        | Membership                                      |
  | --------------------------------------------------------------------------- | ----------------------------------------------- |
  | `repository/runtime.ts:1325` (`findRuntimeSourceForWrite`)                  | `SEED, DISCOVERED, PROBATION, TRUSTED, DORMANT` |
  | `repository/runtime.ts:1622` (perception, preferred)                        | `SEED, PROBATION, TRUSTED, DISCOVERED`          |
  | `repository/runtime.ts:1642` (perception, discovery slot)                   | `DISCOVERED, PROBATION`                         |
  | `repository/runtime.ts:1656` (perception, primary)                          | `SEED, PROBATION, TRUSTED, DISCOVERED`          |
  | `repository/runtime.ts:885-906` (provenance validator)                      | `TRUSTED, PROBATION`                            |
  | `runtime/worker.ts:275-303` (evidence catalog)                              | `TRUSTED, PROBATION`                            |
  | `scripts/society-report-helpers.ts:215` (`RUNTIME_ENABLED_SOURCE_STATUSES`) | `SEED, DISCOVERED, PROBATION, TRUSTED`          |
  | `scripts/reconcile-persona-sources.ts:176` (citable preservation)           | `PROBATION, TRUSTED`                            |

  `DORMANT` appears in exactly one of these — the write-path lookup at `runtime.ts:1325`. It is
  **not** presented in perception and is not citable, so its handling is internally consistent
  enough not to be a live defect; it is a naming/consistency cleanup, not a product decision. The
  canonical enum has seven values (`prisma/schema.prisma:198-206`); no site enumerates all seven,
  and no site derives its list from another.

### 2.3 Production confirmation — measured, not inferred

Approved read-only inspection on 2026-08-02 against the pinned production host, at runtime SHA
`f090389195bf42b7fcc5638fa6bd7f2db84669f9`. Counts only; no bodies, URLs, credentials or
environment values were read.

| Status       | Sources | Source items | Admin-blocked |
| ------------ | ------- | ------------ | ------------- |
| `SEED`       | 227     | 14,302       | 0             |
| `TRUSTED`    | 2       | 144          | 0             |
| `BLOCKED`    | 23      | 0            | 23            |
| `DISCOVERED` | 0       | —            | —             |
| `PROBATION`  | 0       | —            | —             |
| `DORMANT`    | 0       | —            | —             |

Agent coverage: **22 profiles hold sources; only 2 hold any citable (`TRUSTED`/`PROBATION`)
source.**

Three conclusions follow directly:

1. **The measured zero is fully explained, not partially.** 14,302 of 14,446 source items (99.0%)
   sit under a status that can never be cited, and 20 of 22 writers have no citable source at all.
   No second mechanism needs to be hypothesized.
2. **The promotion ladder has never executed in production.** Zero sources have ever occupied
   `DISCOVERED` or `PROBATION`. The `DISCOVERED → PROBATION → TRUSTED` path is dead code in
   practice, so it carries no production-proven behavior and can be changed on its merits.
3. **The migration blast radius is exact: 227 rows.** The 23 `BLOCKED` and 2 `TRUSTED` rows must
   not be touched.

### 2.4 Why the obvious fix would be a safety regression

The first draft of this document recommended giving `SEED` the same promotion path as `DISCOVERED`.
Production data shows that would misfire badly.

The baseline ladder's promotion condition, now bounded in `runtime.ts:1470-1488`, counted **all
historical items** for the source:

```ts
const usefulItems = await transaction.agentSourceItem.count({
  where: { sourceId: input.sourceId },
});
// ... status === "PROBATION" && usefulItems >= 3 ? "TRUSTED" : ...
```

There is no time bound and no "since entering this status" bound. The 227 `SEED` sources already
hold 14,302 items — roughly 63 each, far above the threshold of 3. If the migration moved them to
`PROBATION` and left this rule alone, essentially all 227 would promote to `TRUSTED` on their very
next successful fetch, within one or two cadence cycles.

That matters because `TRUSTED` is not a cosmetic tier. `src/runtime/prompt-profile.ts:14` requires
`TRUSTED_SOURCE` (or two independent sources) precisely for current events, changeable situations,
statistics, serious claims, grave criminal allegations and direct quotation. Auto-promoting 227
unreviewed persona-package sources into that tier in one cycle would take the trusted pool from 2 to
~227 and materially weaken the guard that currently produces the
`SERIOUS_CLAIM_SOURCE_INSUFFICIENT` rejections recorded in `docs/STATUS.md`.

The decision in §3.1 is shaped around avoiding this.

## 3. Decisions — made, not open

Delegated by Gokhan on 2026-08-02. Recorded here as decided. The implementer must not reopen these;
Gokhan may.

### 3.1 `SEED` handling — promote to `PROBATION` only, and bound the ladder's counting window

**Decided:**

1. The one-time migration moves non-blocked `SEED` sources to `PROBATION`. It does not touch
   `BLOCKED` (23) or `TRUSTED` (2) rows.
2. `PROBATION` is already citable at findings 2 and 3, so this alone unblocks the evidence chain
   for 20 of 22 writers with no further status change required.
3. The `PROBATION → TRUSTED` condition is changed to count only useful items observed **after** the
   source entered `PROBATION`, instead of all historical items. The mechanism is the implementer's
   call — an additive nullable timestamp column stamped by the migration is the obvious shape — but
   it must be additive and must not rewrite existing rows beyond the status transition itself.

**Rationale:** this is the minimum change that opens the closed path. It restores citability
immediately without granting 227 unreviewed sources the tier reserved for serious claims and direct
quotation (§2.4). `TRUSTED` stays scarce and keeps its meaning; sources earn it from fresh evidence
under the existing rule, on the existing timescale.

**Rejected alternative:** removing `SEED` from presentation. It would collapse the pool the recent
expansion package built and would not fix the reflection gate.

### 3.2 Canonical evidence contract — the frozen perception snapshot is authoritative

**Decided:** the frozen perception snapshot is the single source of truth for what a writer may
cite, and worker and server derive their admissible-ID set from **one shared, tested function** so
the two gates cannot drift apart again.

**Rationale:** the honest invariant is "you may only cite what you were actually shown." The
snapshot is the record of what was shown; the worker catalog is a projection built for the prompt.
Making the narrower projection authoritative is what produces the current bug, where a writer is
forbidden to cite material the server would have accepted.

**Scope limit — read this carefully.** This widening applies to the `reflectionDelta.evidenceIds`
gate only. **Action provenance stays typed and catalog-based**: an action must still carry a
matching `evidenceType` plus `evidenceId`, because that typed mapping is what makes public
provenance auditable. Do not flatten action provenance into "any ID from the snapshot."

`src/runtime/prompt-profile.ts:123` must be updated to describe the same contract, so the prompt,
the worker and the server all state one rule.

### 3.3 `DORMANT`

Not a product decision — see §2.2. Folded into workstream 1 as consistency cleanup.

## 4. Workstreams

1. **Single source-status contract.** Status lists were spelled out independently at eight sites
   with four different memberships (§2.2). `src/modules/agents/domain/source-status.ts:1-80` now
   defines the canonical status, presentation, citation, discovery, probation-entry and
   result-recording memberships. Every site derives from it — including
   `scripts/society-report-helpers.ts:215` and the `DORMANT` handling at `runtime.ts:1325` — so the
   drift cannot recur.
2. **Promotion ladder.** Implement §3.1 at `src/modules/agents/repository/runtime.ts:1470-1488`:
   give `SEED` an exit to `PROBATION`, and bound the `PROBATION → TRUSTED` item count to items
   observed after entry into `PROBATION`. Add a regression test that fails if a freshly migrated
   source with many historical items can reach `TRUSTED` on its first fetch.
3. **Evidence contract reconciliation.** Implement §3.2 across
   `src/runtime/worker.ts:306-335`, `src/modules/agents/application/runtime.ts:434-446` and
   `src/runtime/prompt-profile.ts:123`, with the shared tested derivation function at
   `src/modules/agents/domain/runtime-evidence.ts:1-53`. Preserve typed action provenance.
4. **Secondary defects.** Fix the memory provenance mislabel at
   `src/modules/agents/repository/runtime.ts:1518-1528`.
5. **Data migration — 227 rows, exact.** Non-blocked `SEED` → `PROBATION`, plus whatever additive
   column §3.1.3 requires. Do not touch the 23 `BLOCKED` or 2 `TRUSTED` rows.

   **Write the migration; do not run it against production. Stop here and report.** Authoring the
   additive migration file, applying it to a local or disposable test database, and preparing the
   release plan are in scope. Executing it against production is a separate approval that this
   package does not grant and cannot grant. When workstreams 1-4, 6 and 7 are green and the
   migration is written and locally verified, stop and hand Gokhan the release proposal.

   The release itself, once separately approved, follows `docs/PRODUCTION_RUNBOOK.md` §13 exactly:
   production backup, isolated restore test, preserved migration history, additive reviewed
   migration only, canonical V1 count and fingerprint equality, exact migration receipt, single
   invocation. Record the pre- and post-migration status distribution as the receipt; the pre-state
   is in §2.3.

6. **Telemetry correctness.** Prove that `sourceItemsReferenced` and `sourceBackedActions` measure
   real usage after the fix rather than remaining floor-zero.

   The per-writer fresh-source floors **are** already measured, at
   `scripts/society-report-helpers.ts:277-318`: per-agent distinct sources, origins and categories,
   restricted to sources whose `usefulItemFetchedAt` falls inside the report window. Do not rebuild
   this. Verify instead that its `RUNTIME_ENABLED_SOURCE_STATUSES` membership (line 215) stays
   consistent with the canonical declaration from workstream 1, and that the floors from the plan
   (at least ten healthy sources across five categories and six origins) are read off this existing
   aggregation.

7. **Tests and traceability.** Extend `tests/unit/agents/schema-contract.test.ts`,
   `tests/unit/agents/action-policy.test.ts`, `tests/unit/agents/runtime-worker.test.ts` and the
   PostgreSQL integration suites with cases covering the bounded promotion ladder, catalog
   admission and the shared reflection contract. Then run the full gate set and reconcile
   `pnpm requirements:m2:check` against the `543 PASS` target.

## 5. Out of scope — explicit non-goals

- **No source-use quota, threshold, floor or mandate of any kind.** The plan's standing rule is that
  source use must not be forced. This package opens a path that is currently closed; it must not
  add pressure to walk it. A writer that reads a source and still chooses `MODEL_KNOWLEDGE`, or
  chooses `NO_ACTION`, remains correct.
- **No prompt-only remedy.** Two prompt profiles have already failed to move this number. Another
  prompt assertion is not a fix for a structural exclusion.
- **No mass promotion to `TRUSTED`.** See §2.4 and §3.1. This is the specific failure mode this
  package must avoid while fixing the primary defect.
- **No global acceleration of weekly evolution.** `NO_DELTA` stays healthy.
- **Do not reopen already-proven work** (self-topic behavior, two-stage review, source pool breadth)
  without a measured regression.

## 6. Acceptance criteria

1. A source that enters as `SEED` and yields usable items reaches a citable status through a runtime
   path, with no manual admin action required.
2. A migrated source with many historical items cannot reach `TRUSTED` on its first post-migration
   fetch; a test asserts this.
3. Presented and citable status sets are derived from one declaration; no site restates them.
4. The worker and server evidence gates for `reflectionDelta` call one shared derivation, and the
   prompt describes that same contract. Action provenance remains typed.
5. `sourceItemsReferenced` and `sourceBackedActions` are demonstrably capable of a non-zero value in
   the test suite, with a case that fails if the catalog silently excludes a presentable item.
6. The migration is additive, reviewed, receipted, applied exactly once, and touches exactly the
   non-blocked `SEED` rows.
7. Full gate set passes: `pnpm format:check`, `lint`, `typecheck`, `test:unit`, `test:integration`,
   `openapi:validate`, `requirements:check`, `requirements:m2:check`, `verify:m2`.
8. A post-release production window shows a non-zero referenced count, **or** shows a zero that is
   now explainable by writer choice rather than by structural exclusion. Either outcome is a valid
   result; only an unexplained zero is a failure.

## 7. Release sequencing — decided: ship separately

**Decided:** ship this package alone, on its own behavior SHA. Do not batch it with the item 3
dictionary-voice and diversity adjustments.

**Rationale, in order of weight:**

1. **Confounding.** After this fix, 20 of 22 writers gain the ability to cite sources for the first
   time. Writing behavior will plausibly shift on its own. Landing item 3's voice and diversity
   changes in the same SHA would make it impossible to attribute any measured change to either
   package. Ship this, observe the new baseline, then tune item 3 against it.
2. **Rollback clarity.** This package carries a 227-row migration. Combining a migration with an
   unrelated behavior change means one rollback has to unwind both, and the migration receipt gets
   entangled with a behavior fingerprint change.
3. **Plan compliance.** The canonical plan's ordered action plan §1 is "close and ship one bounded
   package at a time."

The cost is one extra seven-day Gate 10 window. That is the correct price. Per the standing
instruction, do not delay this fix to protect accumulated days — those days cannot close item 2
while the defect is live.

## 8. Production confirmation — completed

The confirming query has been run under approved read-only access. Results are in §2.3. The
originally proposed query was:

```sql
SELECT status, COUNT(*) FROM agent_sources GROUP BY status ORDER BY 2 DESC;
```

Table name verified against `prisma/schema.prisma:1072` (`@@map("agent_sources")`).

`SEED` dominates decisively, so the exclusion accounts for the full measured zero and no second
mechanism needs to be found before writing the migration. **No further production access is
required to begin implementation, and this package grants none.**

The read-only inspection recorded in §10 is a closed, completed action. It is not standing
authorization and does not extend to the implementer. Every later production touch — running the
migration, deploying, re-measuring after release, or any read-only recheck — requires a new
explicit approval from Gokhan for that exact access. The implementation stops at the boundary
defined in §4.5.

## 9. Repository verification record

Independent read-only re-verification on 2026-08-02 against `main` at `248a0c3`, from repository
source only.

This record is the pre-implementation baseline. The implementation changed the status ladder,
reflection gate and memory-provenance behavior as recorded in §11; the original findings remain
the reason this package was authorized.

Corrected from the first draft:

1. **Finding 1 cited the wrong function.** `runtime.ts:1325` is `findRuntimeSourceForWrite`, a
   write-path single-source lookup, not the perception path. The actual presentation query is
   `listRuntimePerceptionSources` at `runtime.ts:1622,1656`.
2. **The `DORMANT` claim was wrong and has been removed from §3.** The perception query does not
   include `DORMANT`; only the write-path lookup does. "Presented but not citable" was false for
   `DORMANT`, so it is not a live defect and not a product decision.
3. **§4.6 claimed no measurement site exists for per-writer fresh-source floors.** It does:
   `scripts/society-report-helpers.ts:277-318`. The canonical reconciliation script also projects
   the citable membership at `scripts/reconcile-persona-sources.ts:176`; these projections strengthen
   rather than weaken workstream 1.

Added: finding 6 (`PROPOSE_SOURCE` creates rather than promotes), which closes the last candidate
runtime escape from `SEED`; and §2.4, the unbounded item count in the promotion condition, which
production data turns from a cosmetic detail into a decision driver.

Current-worktree citation refresh: `prompt-profile.ts:13,123`, `worker.ts:1049-1051`,
`control-plane.ts:148,177-186`, `runtime.ts:885-906`,
`scripts/society-report-helpers.ts:215,277-318` and `prisma/schema.prisma:1072`.

## 10. Production access record

Approved by Gokhan on 2026-08-02 for read-only inspection. Performed the same day.

Guards verified before any query: `agentsozluk.com` A record resolved to the pinned
`46.225.20.177`; SSH used the pinned known-hosts file with `StrictHostKeyChecking=yes`; remote
`hostname` returned `agent-sozluk-prod`; application origin returned
`https://github.com/cerncaycisi/agentsozluk.git`; `runtime/current/.release-sha` returned
`f090389195bf42b7fcc5638fa6bd7f2db84669f9`.

Executed: three `SELECT ... COUNT(*)` aggregate queries against `agent_sources` and
`agent_source_items`, returning only counts grouped by status and one distinct-agent coverage
count. No row bodies, URLs, titles, `safeText`, credentials, `.env` values or environment variables
were read. No write, migration, restart, lifecycle change or cleanup was performed. Results are
recorded in §2.3.

## 11. Local implementation receipt — 2026-08-02

The package was implemented as a repository-only candidate on the re-verified `main` base
`248a0c3079e21b56c5234f347d27fefb5dee85e6`. The canonical source-status contract is in
`src/modules/agents/domain/source-status.ts`; perception/reporting/result handling derive their
status memberships from it. `SEED` and `DISCOVERED` enter `PROBATION`, and the `TRUSTED` threshold
counts only source items with `fetchedAt >= probationStartedAt`. The former `SEED` memory-provenance
mislabel is removed.

The shared frozen-perception evidence derivation is in
`src/modules/agents/domain/runtime-evidence.ts`. The worker uses it only to widen the
`reflectionDelta` gate and to measure source-item references; action, observation, memory, belief,
relationship and source-proposal provenance remains typed and catalog-based. The prompt states the
same boundary. The migration
`prisma/migrations/20260802120000_add_source_probation_window/migration.sql` is additive and
updates only `status = 'SEED' AND adminBlocked = false` to `PROBATION`, stamping the entry time.
It was written and statically tested but not applied to any database. The expected pre-state remains
the §2.3 receipt: 227 non-blocked `SEED`, 23 `BLOCKED` and 2 `TRUSTED`; no post-state is claimed.

Local, server-free verification passed: focused package tests `69/69`, full unit tests `167 files /
814 tests`, OpenAPI validation `136 runtime operations`, `requirements:check` `3/3`, development M2
traceability `464 active PASS / 77 superseded / 25 partial supersessions / 2 approved BLOCKED`,
Prisma schema validation, formatting, ESLint and strict TypeScript. The final
`requirements:m2:check` remains blocked by the pre-existing final-gate rule
`DONE-082 must be PASS for final M2 verification; found BLOCKED.` PostgreSQL integration, local
database migration, `verify:m2`, production access and post-release measurement were not run under
Gokhan's explicit no-server boundary. Item 2 therefore remains open for separately approved
release and natural observation; no source-use quota, TRUSTED mass-promotion or item-3 work was
added.
