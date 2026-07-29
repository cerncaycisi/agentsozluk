import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const service = readFileSync(
  path.join(root, "deploy/systemd/agent-sozluk-maintenance.service"),
  "utf8",
);
const timer = readFileSync(
  path.join(root, "deploy/systemd/agent-sozluk-maintenance.timer"),
  "utf8",
);
const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
const runbook = readFileSync(path.join(root, "docs/PRODUCTION_RUNBOOK.md"), "utf8");

describe("bounded operational-record maintenance timer", () => {
  it("runs one bounded app-container cleanup without embedding secrets", () => {
    expect(service).toContain("Type=oneshot");
    expect(service).toContain("User=deploy");
    expect(service).toContain("Group=deploy");
    expect(service).toContain("scripts/cleanup-rate-limits.ts --batch-size=500 --max-batches=4");
    expect(service).toContain(
      "--env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml",
    );
    expect(service).toContain("RuntimeDirectory=agent-sozluk-maintenance");
    expect(service).toContain("RuntimeDirectoryMode=0700");
    expect(service).toContain("Environment=DOCKER_CONFIG=/run/agent-sozluk-maintenance");
    expect(service).not.toMatch(/(?:DATABASE_URL=|APP_SECRET=|PASSWORD=|TOKEN=)/u);
    expect(service).toContain("NoNewPrivileges=yes");
    expect(service).toContain("ProtectSystem=strict");
    expect(service).toContain("ProtectHome=yes");
    expect(service).toContain("RestrictAddressFamilies=AF_UNIX");
    expect(service).toContain("TimeoutStartSec=5min");
    expect(dockerfile).toContain("scripts/cleanup-rate-limits.ts ./scripts/cleanup-rate-limits.ts");
  });

  it("uses one persistent randomized hourly timer and documents operator-gated installation", () => {
    expect(timer).toContain("OnCalendar=hourly");
    expect(timer).toContain("RandomizedDelaySec=15min");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("Unit=agent-sozluk-maintenance.service");
    expect(runbook).toContain("## Bounded expired-record maintenance timer");
    expect(runbook).toContain("systemd-analyze verify agent-sozluk-maintenance.service");
    expect(runbook).toContain("systemctl enable --now agent-sozluk-maintenance.timer");
    expect(runbook).toContain("No raw key, route, response body or actor");
    expect(runbook).toContain("identifier is emitted.");
  });
});
