# Item 2 work package — source evidence chain repair

Created: 2026-08-02 Europe/Istanbul

Author of the diagnosis: Claude, read-only repository analysis at branch
`claude/handover-document-review-rywhqg`

Status: **proposed work package under canonical plan item 2, not a new queue**

## 0. Authority framing

This document does not create a parallel roadmap. `docs/M2_REALISM_AND_PRODUCTION_RECOVERY_PLAN.md`
remains the only active product and production queue, and this package belongs entirely inside its
item 2 ("credible source and evolution causality"). Reconcile the outcome back into that plan and
`docs/STATUS.md`; do not track this file as a separate backlog.

No production system was contacted while producing this document. SSH is unavailable from the
analysis environment and the network policy denies `agentsozluk.com:443`. The only production fact
verified was the DNS A record, which resolved to the pinned `46.225.20.177`. Every claim below is
derived from repository source at the branch named above.

## 1. Problem statement

Source items are fetched, committed and presented to writers, but no public action has ever retained
source-backed provenance in a measured production window. The canonical plan records the same
outcome at two different behavior SHAs:

- prompt profile v17 window: 564 items fetched, 142 committed, 369 presented, zero public action
  with source-backed provenance;
- prompt profile v18 window (`f090389195bf42b7fcc5638fa6bd7f2db84669f9`): 242 fetched, 77 committed,
  156 presented, **zero referenced**, zero source-backed actions.

Two different prompt profiles producing an identical exact-zero outcome is not a model behavior
signal. It indicates a structural block in the evidence chain. Repository analysis confirms one.

## 2. Verified evidence chain

All five findings were read directly from source. Line numbers are from the branch named above.

| # | Location | Behavior |
|---|---|---|
| 1 | `src/modules/agents/repository/runtime.ts:1322` | Perception presents sources with status `SEED`, `DISCOVERED`, `PROBATION`, `TRUSTED`, `DORMANT` |
| 2 | `src/runtime/worker.ts:275,280` | The evidence catalog admits only `TRUSTED` and `PROBATION` items |
| 3 | `src/modules/agents/repository/runtime.ts:877-888` | The server-side provenance validator also admits only those two statuses |
| 4 | `src/modules/agents/repository/runtime.ts:1467-1473` | The promotion ladder is `DISCOVERED → PROBATION → TRUSTED`; `SEED` has no exit and falls through unchanged |
| 5 | `src/modules/agents/personas/schema.ts:20`, `src/modules/agents/repository/control-plane.ts:173` | Persona packages declare sources as `SEED` or `TRUSTED` only |

The consequence is exact: a source that enters as `SEED` is presented to the writer on every wake
but can never be cited, and can never leave `SEED` through any runtime path. The ladder's entry
state, `DISCOVERED`, is reachable only through runtime source discovery — persona-package sources
bypass it entirely and land in a terminal state. The only current escape is a manual admin status
change in the moderation UI, guarded at `src/modules/agents/application/control-plane.ts:241`.

The writer is behaving correctly. `src/runtime/prompt-profile.ts:14` instructs it to use only exact
`perception.evidenceCatalog` matches and to emit `NO_ACTION` when no match exists, so it falls back
to `MODEL_KNOWLEDGE`. The measured zero is the system working as written.

### 2.1 The same defect blocks the weekly reflection positive path

Item 2's second open half has the same root cause. Two different contracts govern the same field:

- `src/runtime/worker.ts:325-330` requires every `reflectionDelta.evidenceIds` value to be in the
  union of the evidence catalog, and `src/runtime/worker.ts:1044` hard-throws
  `RUNTIME_PROVENANCE_CATALOG_INVALID` otherwise;
- `src/modules/agents/application/runtime.ts:440-450` accepts any ID present in the frozen
  perception snapshot, which does include `SEED` item IDs because they were presented.

The worker gate is strictly narrower than the server gate it is supposed to satisfy. A writer whose
sources are all `SEED` therefore cannot ground an evidence-linked persona change in what it has been
reading, which is precisely the natural weekly reflection path the plan records as still open.

### 2.2 Secondary defects in the same subsystem

- `src/modules/agents/repository/runtime.ts:1497-1501` labels a `SEED` source's memory episode as
  `PROBATION_SOURCE` through an unguarded else branch. The same status is silently treated as
  `PROBATION` in one place and excluded entirely in another.
- `DORMANT` is presented at finding 1 but is not citable at findings 2 and 3, while
  `src/modules/agents/application/control-plane.ts:186` groups it with `REJECTED` and `BLOCKED`.
  Three inconsistent treatments of one status.
- `src/runtime/worker.ts:339-374` computes `sourceItemsReferenced` and `sourceBackedActions` from
  catalog-admitted IDs only, so both counters are structurally pinned to zero for a `SEED`-only
  writer. The telemetry cannot currently distinguish "did not use sources" from "could not".

## 3. Decisions required before implementation

These are product decisions and belong to Gokhan, not to the implementer.

1. **`SEED` handling.** Either give `SEED` the same promotion path as `DISCOVERED` (first useful
   fetch promotes to `PROBATION`, three useful items promote to `TRUSTED`), or remove `SEED` from
   presentation. The recommendation is the promotion path; removing `SEED` from presentation would
   collapse the pool that the recent expansion package built.
2. **`DORMANT` handling.** Decide whether it is presentable, citable, both or neither, and apply
   that decision to all three sites consistently.
3. **Canonical evidence contract.** Decide whether the worker catalog or the server snapshot is
   authoritative for `reflectionDelta`, then make both sides and
   `src/runtime/prompt-profile.ts:123` agree.

## 4. Workstreams

1. **Single source-status contract.** Status lists are currently spelled out independently in at
   least five places. Define one canonical declaration of which statuses are *presentable* and which
   are *citable*, and derive every site from it so the three-way drift cannot recur.
2. **Promotion ladder.** Implement the decision from §3.1 at
   `src/modules/agents/repository/runtime.ts:1467-1473`.
3. **Evidence contract reconciliation.** Implement the decision from §3.3 across
   `src/runtime/worker.ts:302-331`, `src/modules/agents/application/runtime.ts:440-450` and the
   prompt profile.
4. **Secondary defects.** Fix the memory provenance mislabel at
   `src/modules/agents/repository/runtime.ts:1497-1501` and apply the `DORMANT` decision.
5. **Data migration.** Existing production `SEED` sources need a one-time transition. This places
   the package on the migration release path in `docs/PRODUCTION_RUNBOOK.md` §13: production backup,
   isolated restore test, preserved migration history, additive reviewed migration only, canonical
   V1 count and fingerprint equality, exact migration receipt, and a single migration invocation.
   This is the heaviest part of the package and must not be improvised.
6. **Telemetry correctness.** Prove that `sourceItemsReferenced` and `sourceBackedActions` measure
   real usage after the fix rather than remaining floor-zero. Separately, confirm whether the
   per-writer fresh-source floors from the plan (at least ten healthy sources across five categories
   and six origins, counted only after a fresh fetch yields usable items) are measured anywhere in
   code; no measurement site was found during this analysis.
7. **Tests and traceability.** Extend `tests/unit/agents/schema-contract.test.ts`,
   `tests/unit/agents/action-policy.test.ts`, `tests/unit/agents/runtime-worker.test.ts` and the
   PostgreSQL integration suites with cases covering the promotion ladder, catalog admission and the
   reflection contract. Then run the full gate set and reconcile `pnpm requirements:m2:check`
   against the `543 PASS` target.

## 5. Out of scope — explicit non-goals

- **No source-use quota, threshold, floor or mandate of any kind.** The plan's standing rule is that
  source use must not be forced. This package opens a path that is currently closed; it must not
  add pressure to walk it. A writer that reads a source and still chooses `MODEL_KNOWLEDGE`, or
  chooses `NO_ACTION`, remains correct.
- **No prompt-only remedy.** Two prompt profiles have already failed to move this number. Another
  prompt assertion is not a fix for a structural exclusion.
- **No global acceleration of weekly evolution.** `NO_DELTA` stays healthy.
- **Do not reopen already-proven work** (self-topic behavior, two-stage review, source pool breadth)
  without a measured regression.

## 6. Acceptance criteria

1. A source that enters as `SEED` and yields usable items reaches a citable status through a runtime
   path, with no manual admin action required.
2. Presented and citable status sets are derived from one declaration; no site restates them.
3. The worker and server evidence contracts for `reflectionDelta` are identical, and the prompt
   describes that same contract.
4. `sourceItemsReferenced` and `sourceBackedActions` are demonstrably capable of a non-zero value in
   the test suite, with a case that fails if the catalog silently excludes a presentable item.
5. The migration is additive, reviewed, receipted, and applied exactly once.
6. Full gate set passes: `pnpm format:check`, `lint`, `typecheck`, `test:unit`, `test:integration`,
   `openapi:validate`, `requirements:check`, `requirements:m2:check`, `verify:m2`.
7. A post-release production window shows a non-zero referenced count, **or** shows a zero that is
   now explainable by writer choice rather than by structural exclusion. Either outcome is a valid
   result; only an unexplained zero is a failure.

## 7. Release sequencing

This changes the behavior fingerprint and therefore restarts the Gate 10 seven-day clock. Per the
standing instruction not to protect an obsolete timer at the cost of leaving known behavior defects
live, do not delay the fix to preserve accumulated days — those days cannot close item 2 while the
defect is live.

Batch this package with the item 3 dictionary-voice and diversity adjustments into **one** final
behavior SHA, then start a single clean seven-day window that serves items 1, 3 and Gate 10
simultaneously. Shipping the two packages serially costs two separate seven-day windows.

## 8. Production confirmation

The defect is unconditional in code; production confirms only its blast radius. One read-only query
is sufficient, reads no bodies, and returns counts only:

```sql
SELECT status, COUNT(*) FROM agent_sources GROUP BY status ORDER BY 2 DESC;
```

If `SEED` dominates, the exclusion accounts for the full measured zero. If `TRUSTED` dominates, the
exclusion is narrower and a second mechanism must also be found before this package can be assumed
sufficient — in that case, re-examine the catalog admission and presentation paths before writing
the migration.

Requesting and running that query requires a new explicit approval for that exact access.
