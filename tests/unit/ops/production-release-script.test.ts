import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const wrapperPath = path.join(root, "scripts/deploy-production-no-migration.sh");
const remotePath = path.join(root, "scripts/production-release-remote.sh");
const wrapper = readFileSync(wrapperPath, "utf8");
const remote = readFileSync(remotePath, "utf8");

describe("schema-neutral production release lane", () => {
  it("keeps both shell entrypoints syntax-valid", () => {
    expect(() => execFileSync("bash", ["-n", wrapperPath])).not.toThrow();
    expect(() => execFileSync("bash", ["-n", remotePath])).not.toThrow();
  });

  it("requires an exact approval receipt and all production identity pins", () => {
    expect(wrapper).toContain("AGENT_SOZLUK_PRODUCTION_APPROVED_SHA");
    expect(wrapper).toContain("EXACT_APPROVAL_RECEIPT_REQUIRED");
    expect(wrapper).toContain("46.225.20.177");
    expect(wrapper).toContain("agent-sozluk-prod");
    expect(wrapper).toContain("agentsozluk.com");
    expect(wrapper).toContain("SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI");
    expect(wrapper).toContain("StrictHostKeyChecking=yes");
    expect(wrapper).toContain("IdentitiesOnly=yes");
    expect(wrapper).toContain("IdentityAgent=none");
  });

  it("uses a separate checked transport and execution session", () => {
    expect(wrapper).toContain("install -m 0700 /dev/stdin");
    expect(wrapper).toContain("bash -n '$remote_script'");
    expect(wrapper).toContain('<"$root/scripts/production-release-remote.sh"');
    expect(wrapper).toContain("exec '$remote_script' '$candidate_sha' '$cleanup'");
  });

  it("is no-migration, resumable and shares the exact release smoke", () => {
    expect(remote).toContain("MIGRATION_SET_CHANGED");
    expect(remote).toContain('cmp -s "$state_dir/applied-migrations"');
    expect(remote).toContain("scripts/release-smoke.ts");
    expect(remote).toContain('if test -d "$release"');
    expect(remote).toContain("ps --all -q app");
    expect(remote).toContain('if test "$app_health" != healthy');
    expect(remote).toContain(
      'test "$(docker inspect --format \'{{.Image}}\' "$app_container")" = "$image_id"',
    );
    expect(remote).toContain('if test "$current_sha" != "$candidate_sha"');
    expect(remote).not.toMatch(/\b(?:prisma migrate deploy|db:deploy|db:reset)\b/gu);
  });

  it("waits without cancellation and preserves release integrity", () => {
    expect(remote).toContain("RUN_DRAIN_TIMEOUT");
    expect(remote).toContain('if test "$worker_state" = active');
    expect(remote).not.toMatch(/\b(?:cancel|abort)ProductionRollout/gu);
    expect(remote).not.toContain("UPDATE agent_runs");
    expect(remote).toContain('sudo mv -Tf "$runtime_next"');
    expect(remote).toContain("\\( -type f -o -type d \\) -perm /022");
    expect(remote).toContain("prisma migrate");
    expect(remote).toContain('command.includes("prisma migrate")');
  });

  it("uses exact allowlist cleanup and never prunes volumes or all Docker state", () => {
    expect(remote).toContain('docker image rm "$ref"');
    expect(remote).toContain("docker builder prune --force --filter 'until=24h'");
    expect(remote).toContain('for release in "$runtime_root"/releases/*');
    expect(remote).toContain('test "$release" = "$current_runtime"');
    expect(remote).toContain('test "$release" = "$previous_runtime"');
    expect(remote).toContain('sudo find "$release" -xdev -depth -delete');
    expect(remote).not.toContain("docker system prune");
    expect(remote).not.toContain("docker volume prune");
    expect(remote).not.toContain("--volumes");
    expect(remote).toContain('test "$volume_hash_after" = "$volume_hash_before"');
    expect(remote).toContain('test "$container_hash_after" = "$container_hash_before"');
    expect(remote).toContain("disk_before=");
    expect(remote).toContain("disk_after=");
  });
});
