import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const runbook = readFileSync(path.join(process.cwd(), "docs/PRODUCTION_RUNBOOK.md"), "utf8");
const prose = runbook.replace(/\s+/gu, " ");
const gate7 = runbook.slice(
  runbook.indexOf("### Gate 7: backup and isolated restore drill"),
  runbook.indexOf("### Gate 8: deploy, additive migration and V1 preservation"),
);
const gate8 = runbook.slice(
  runbook.indexOf("### Gate 8: deploy, additive migration and V1 preservation"),
  runbook.indexOf("### Capacity prerequisite: real CLI benchmark and persisted measurement"),
);
const capacityGate = runbook.slice(
  runbook.indexOf("### Capacity prerequisite: real CLI benchmark and persisted measurement"),
  runbook.indexOf("## Production smoke and Day 0 activation gate"),
);

describe("Milestone 2 production operator runbook", () => {
  it("keeps every production connection and mutation behind a per-action approval gate", () => {
    expect(prose).toContain("explicit approval for the specific access about to be performed");
    expect(prose).toContain("Each production connection and each mutation still requires");
    expect(prose).toContain("A production restore is a separate destructive action");
    expect(prose).toContain("requires a new explicit approval");
  });

  it("binds the SSH fingerprint and single DNS answer to the pinned production identity", () => {
    expect(runbook).toContain(
      "ssh-keygen -F 46.225.20.177 -f /private/tmp/agent-sozluk-known_hosts",
    );
    expect(runbook).toContain("awk '$NF == \"(ED25519)\" {print $2}'");
    expect(runbook).toContain('test "$m2_known_host_fingerprint" =');
    expect(runbook).toContain("'SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI'");
    expect(runbook).toContain('m2_domain_ipv4="$(dig +short A agentsozluk.com)"');
    expect(runbook).toContain("test \"$m2_domain_ipv4\" = '46.225.20.177'");
    expect(runbook).not.toContain("ssh-keygen -lf /private/tmp/agent-sozluk-known_hosts -E sha256");
    expect(runbook).not.toContain("dig +short A agentsozluk.com | grep -Fx");
  });

  it("defines an exact merged-SHA and clean-checkout gate", () => {
    expect(runbook).toContain("### Gate 6: exact merged revision");
    expect(runbook).toContain("git rev-parse origin/main");
    expect(runbook).toContain("git -C /opt/agent-sozluk/app rev-parse HEAD");
    expect(runbook).toContain("git -C /opt/agent-sozluk/app status --short");
    expect(runbook).toContain("complete 40-character SHA byte-for-byte");
    expect(prose).toContain("Any mismatch keeps `DONE-084` blocked");
  });

  it("requires a private, fail-fast, storage-checked backup under a real write freeze", () => {
    expect(runbook).toContain("### Gate 7: backup and isolated restore drill");
    for (const command of [
      "set -Eeuo pipefail",
      "umask 077",
      "application-wide write freeze",
      "m2_open_transactions",
      "pg_database_size(current_database())",
      "m2_backup_free_bytes >= m2_db_bytes + m2_headroom_bytes",
      "m2_db_free_bytes >= (2 * m2_db_bytes) + m2_headroom_bytes",
      "--format=custom --serializable-deferrable --no-owner --no-privileges",
      "chmod 0600",
      'sha256sum "$m2_backup_file"',
      "pg_restore --list",
      'createdb -U agent_sozluk "$m2_restore_database"',
      "--exit-on-error --no-owner --no-privileges",
      'dropdb -U agent_sozluk "$m2_restore_database"',
    ])
      expect(gate7).toContain(command);
    expect(gate7).toContain("^agent_sozluk_m2_restore_[0-9]{8}_[0-9]{6}$");
    for (const denied of ["agent_sozluk", "postgres", "template0", "template1"])
      expect(gate7).toContain(denied);
    expect(gate7).toContain("m2_assert_scratch_name");
    expect(gate7).toContain("m2_scratch_created");
    expect(gate7).toContain("cleanup_status");
    expect(prose).toContain("Do not automatically overwrite production from the backup");
  });

  it("fingerprints every column and row in all 16 pre-M2 V1 tables deterministically", () => {
    const v1Tables = [
      "users",
      "sessions",
      "topics",
      "topic_aliases",
      "entries",
      "entry_revisions",
      "entry_votes",
      "entry_bookmarks",
      "topic_follows",
      "user_blocks",
      "reports",
      "moderation_actions",
      "audit_logs",
      "outbox_events",
      "rate_limit_buckets",
      "idempotency_records",
    ];
    for (const table of v1Tables) {
      expect(gate7).toContain(`'${table}'`);
      expect(gate7).toContain(`FROM ${table}`);
      expect(gate7).toContain(`jsonb_build_array('${table}'`);
    }
    expect(gate7).not.toMatch(/FROM user_follows/gu);
    expect(gate7.replace(/\s+/gu, " ")).toContain(
      "`user_follows` and every `agent_*` table are M2 objects",
    );
    expect(gate7).toContain("PGOPTIONS=-c timezone=UTC -c extra_float_digits=3");
    expect(gate7).toContain("ORDER BY table_order, row_key");
    expect(gate7).toContain("| sha256sum | awk");
    expect(gate7).toContain("canonical_active_seed_entries|180");
    expect(gate7).toContain("all_seed_entries|180");
    expect(gate7).toContain('cmp -s "$m2_verify_dir/pre-counts"');
    expect(gate7).toContain('[[ "$m2_pre_fingerprint" == "$m2_restore_fingerprint" ]]');
    expect(prose).toContain("are never printed or written to disk");
  });

  it("runs only additive migrations through the Compose array and proves V1 preservation", () => {
    expect(runbook).toContain("### Gate 8: deploy, additive migration and V1 preservation");
    expect(
      gate8.match(/"\$\{m2_compose\[@\]\}" exec -T app pnpm prisma migrate status/gu),
    ).toHaveLength(2);
    expect(gate8).toContain('"${m2_compose[@]}" exec -T app pnpm db:deploy');
    expect(gate8).not.toMatch(/^\$m2_compose exec/gmu);
    expect(gate8.replace(/\s+/gu, " ")).toContain(
      "keep the Gate 7 application-wide write freeze active",
    );
    expect(gate8).toContain('[[ "$m2_pre_fingerprint" == "$m2_post_migration_fingerprint" ]]');
    expect(gate8).toContain("to_regclass('public.user_follows')");
    expect(gate8).toContain("keep runtime and application writes paused");
    expect(gate8).toContain("Never run `db:reset`, seed or an ad-hoc repair");
  });

  it("requires cold, warm and dual real-CLI capacity evidence and persists it", () => {
    expect(capacityGate).toContain("[`AGENT_CAPACITY.md`](AGENT_CAPACITY.md)");
    expect(capacityGate.match(/agent:capacity/gu)).toHaveLength(2);
    expect(capacityGate).toContain("agent:concurrency-test");
    expect(capacityGate).toContain("capacity-cold-$m2_capacity_stamp.json");
    expect(capacityGate).toContain("capacity-warm-$m2_capacity_stamp.json");
    expect(capacityGate).toContain("capacity-dual-$m2_capacity_stamp.json");
    expect(capacityGate).toContain("value.benchmarkRunCount < 10");
    expect(capacityGate).toContain("value.failureRate !== 0");
    expect(capacityGate).toContain("value.p50DurationMs <= value.p75DurationMs");
    expect(capacityGate).toContain("value.p95DurationMs <= value.maxDurationMs");
    expect(capacityGate).toContain("dual.dualRunSuccessCount !== 2");
    expect(capacityGate).toContain("dual.dualProcessPeakRssMb > 0");
    expect(capacityGate).toContain("Benchmark kaydet");
    expect(capacityGate).toContain("Concurrency testi kaydet");
    expect(capacityGate).toContain("FROM agent_runtime_capabilities");
    expect(capacityGate).toContain("cold/warm/dual sample counts");
  });

  it("defines the full human, role-denial, metadata and takedown smoke", () => {
    expect(runbook).toContain("### Gate 9: paused smoke and human checklist");
    for (const evidence of [
      "HUMAN ADMIN",
      "MODERATOR",
      "AGENT receive the expected denial",
      "READ_ONLY",
      "DRY_RUN",
      "NORMAL_WAKE",
      "metadata",
      "topic, feed, search, DEBE and sitemap",
      "ADMIN restore",
    ])
      expect(prose).toContain(evidence);
    expect(prose).toContain("a missing observation is FAIL");
    expect(prose).toContain("Manual runs cannot be queued or leased from a `PAUSED` profile");
    expect(prose).toContain("transition only that profile from `PAUSED` to `ACTIVE`");
    expect(prose).toContain("queue/resume/terminal/re-pause sequence");
    expect(prose).toContain("transition the smoke profile back to `PAUSED`");
  });

  it("gates ten-agent activation on a sampled green five-agent observation", () => {
    expect(runbook).toContain("### Gate 10: controlled five-agent stage");
    expect(prose).toContain("AUTO_CATCH_UP must remain frozen");
    expect(prose).toContain("continuous two-hour window");
    expect(prose).toContain("success rate is at least 90%");
    expect(prose).toContain("at least five real terminal `SCHEDULER_SLOT` runs");
    expect(prose).toContain("every one of the five active profile UUIDs");
    expect(prose).toContain(
      "Manual, catch-up, benchmark, source-refresh and reflection runs do not count",
    );
    expect(prose).toContain("scheduled-run p75 must be at most five minutes");
    expect(prose).toContain("no critical breaker or metadata leak may occur");
    expect(prose).toContain("repeat a fresh continuous two-hour gate");
    expect(runbook).toContain("FROM agent_capacity_snapshots AS s");
    expect(runbook).toContain("linked_active_plans=5");
    expect(runbook).toContain("### Gate 11: ten-agent escalation and first three scheduled runs");
    expect(runbook).toContain("Only after Gate 10 is fully green");
    expect(prose).toContain("Confirm exactly ten `ACTIVE` profiles");
  });

  it("requires three real same-day successful scheduler runs with exact-once evidence", () => {
    expect(runbook).toContain("first three distinct `SCHEDULER_SLOT` runs");
    expect(runbook).toContain("exactly one `agent.run.queued`, `agent.run.started` and terminal");
    expect(runbook).toContain("All three must queue, start and finish on `m2_day0_istanbul_date`");
    expect(runbook).toContain("finish `SUCCEEDED`");
    expect(runbook).toContain("do not substitute a manual run");
    expect(prose).toContain("Crossing midnight is fail-closed");
  });

  it("preserves failed rollout evidence while anchoring a clean retry to one Istanbul date", () => {
    expect(runbook).toContain("`runtime.production.activated`");
    expect(runbook).toContain("`runtime.production.rollout_attempt.started`");
    expect(prose).toContain("A failed attempt is never deleted or relabelled");
    expect(prose).toContain("zero nonterminal runs");
    expect(prose).toContain("exactly ten `PAUSED` profiles");
    expect(prose).toContain("zero live leases");
    expect(runbook).toContain("startProductionRolloutAttempt");
    expect(runbook).toContain("abortProductionRolloutAttempt");
    expect(runbook).toContain("completeProductionRolloutAttempt");
    expect(runbook).toContain("AGENT_ROLLOUT_ATTEMPT_ID");
    expect(runbook).toContain("AGENT_ROLLOUT_COMMAND_ID");
    expect(runbook).toContain("AGENT_ROLLOUT_REASON_CODE=DAY0_START");
    expect(runbook).toContain("AGENT_ROLLOUT_EVIDENCE_FILE");
    expect(prose).toContain("five `gate10-sample` commands");
    expect(prose).toContain("re-runs every proof during `complete`");
    expect(prose).toContain("current rollout-attempt anchor");
  });

  it("requires an approved reboot and verified runtime, site and readiness return", () => {
    expect(prose).toContain("approved host reboot and return proof are mandatory final evidence");
    expect(prose).toContain(
      "specific approval for the global pause, reboot, post-reboot connection",
    );
    expect(runbook).toContain("cat /proc/sys/kernel/random/boot_id");
    expect(runbook).toContain("sudo systemctl reboot");
    expect(runbook).toContain("systemctl is-active agent-sozluk-runtime.service");
    expect(runbook).toContain("tsx/dist/preflight.*scripts/agent-runtime-worker.ts$");
    expect(runbook).toContain("http://127.0.0.1:3000/api/");
    expect(prose).toContain(
      "A reboot that does not return the singleton runtime, site or readiness blocks Day 0",
    );
    expect(prose).toContain("byte-for-byte equality with the post-reboot result");
    expect(runbook).toContain("broken_links");
    expect(runbook).toContain("chain_fingerprint");
  });

  it("keeps the evidence record non-secret and complete", () => {
    expect(runbook).toContain("### Gate 12: final evidence and rollback readiness");
    for (const field of [
      "merged main SHA, deployed SHA and green CI URL",
      "backup filename, SHA-256, restore-drill database name",
      "migration IDs applied",
      "p50/p75/p95/max",
      "persisted capacity-snapshot UUID",
      "five-agent UUID set",
      "first-three scheduled run IDs",
      "pre/post reboot boot-ID change",
    ])
      expect(runbook).toContain(field);
    expect(runbook).toContain("Do not put passwords, tokens, cookies");
    expect(runbook).not.toMatch(/\bcat\s+\/opt\/agent-sozluk\/app\/\.env\b/gu);
    expect(runbook).not.toMatch(/\bprintenv\b/gu);
  });
});
