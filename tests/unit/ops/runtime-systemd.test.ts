import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const service = readFileSync(
  path.join(root, "deploy/systemd/agent-sozluk-runtime.service"),
  "utf8",
);
const environmentExample = readFileSync(
  path.join(root, "deploy/systemd/agent-sozluk-runtime.env.example"),
  "utf8",
);
const bubblewrapAppArmorProfile = readFileSync(
  path.join(root, "deploy/apparmor/usr.bin.bwrap-agent-sozluk"),
  "utf8",
);
const runbook = readFileSync(path.join(root, "docs/PRODUCTION_RUNBOOK.md"), "utf8");

function directiveValues(input: string, name: string): string[] {
  return input
    .split("\n")
    .filter((line) => line.startsWith(`${name}=`))
    .map((line) => line.slice(name.length + 1));
}

function exampleEnvironment(input: string): Record<string, string> {
  return Object.fromEntries(
    input
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator <= 0) throw new Error(`Invalid environment example line: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

describe("ARCH-004 and RUNTIME-001..004 production host readiness", () => {
  it("runs one direct Node 22/tsx orchestrator as the dedicated runtime identity", () => {
    expect(directiveValues(service, "User")).toEqual(["agent-runtime"]);
    expect(directiveValues(service, "Group")).toEqual(["agent-runtime"]);
    expect(directiveValues(service, "WorkingDirectory")).toEqual([
      "/opt/agent-sozluk/runtime/current",
    ]);
    expect(directiveValues(service, "EnvironmentFile")).toEqual(["/etc/agent-sozluk/runtime.env"]);
    expect(service).toContain(
      `ExecStartPre=/usr/bin/node -e "process.exit(Number(process.versions.node.split('.')[0]) === 22 ? 0 : 1)"`,
    );

    const starts = directiveValues(service, "ExecStart");
    expect(starts).toEqual([
      "/usr/bin/node --require /opt/agent-sozluk/runtime/current/node_modules/tsx/dist/preflight.cjs --import file:///opt/agent-sozluk/runtime/current/node_modules/tsx/dist/loader.mjs scripts/agent-runtime-worker.ts",
    ]);
    expect(starts[0]).toMatch(
      /^\/usr\/bin\/node --require .*tsx\/dist\/preflight\.cjs --import file:\/\/.*tsx\/dist\/loader\.mjs scripts\/agent-runtime-worker\.ts$/u,
    );
    expect(starts[0]).not.toMatch(/\bpnpm\b/u);
    expect(starts[0]).not.toMatch(/(?:docker|git|ssh|sudo|\bsh\b|bash)/u);
    expect(service).not.toMatch(/^Environment=.*AGENT_RUNTIME_/gmu);
    expect(service).not.toMatch(/^Environment=.*CODEX_(?:HOME|EXECUTABLE)/gmu);
  });

  it("denies privilege, host secrets, Docker and repository access with narrow write paths", () => {
    for (const directive of [
      "NoNewPrivileges=yes",
      "PrivateTmp=yes",
      "PrivateDevices=yes",
      "DevicePolicy=closed",
      "ProtectSystem=strict",
      "ProtectHome=yes",
      "ProtectClock=yes",
      "ProtectHostname=no",
      "ProtectKernelTunables=no",
      "ProtectKernelModules=yes",
      "ProtectKernelLogs=no",
      "ProtectControlGroups=yes",
      "ProtectProc=invisible",
      "CapabilityBoundingSet=",
      "AmbientCapabilities=",
      "LockPersonality=yes",
      "RestrictRealtime=yes",
      "RestrictSUIDSGID=yes",
      "RemoveIPC=yes",
      "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
      "RestrictNamespaces=user mnt pid ipc uts",
      "SystemCallArchitectures=native",
      "SystemCallFilter=~@clock @cpu-emulation @debug @module @obsolete @raw-io @reboot @swap",
      "UMask=0077",
    ]) {
      expect(service, directive).toContain(directive);
    }

    expect(directiveValues(service, "ReadWritePaths")).toEqual([
      "/opt/agent-sozluk/runtime/codex-home /opt/agent-sozluk/runtime/work",
    ]);
    expect(directiveValues(service, "ReadOnlyPaths")).toEqual([
      "/opt/agent-sozluk/runtime/current /var/lib/agent-sozluk-runtime/credentials.json /var/lib/agent-sozluk-runtime/enrollment-private.pem /etc/agent-sozluk/runtime.env",
    ]);
    expect(service).toContain(
      "ExecStartPre=/usr/bin/test -r /var/lib/agent-sozluk-runtime/enrollment-private.pem",
    );
    expect(directiveValues(service, "InaccessiblePaths")).toEqual([
      "-/opt/agent-sozluk/app -/run/docker.sock -/var/run/docker.sock",
    ]);
    expect(service).toContain(
      "These systemd protections create locked /proc submounts that prevent",
    );
    expect(service).toContain("Bubblewrap provides a");
    expect(service).toContain("private /proc, private /dev and UTS namespace");
  });

  it("uses bounded restart, shutdown, resource and journal policies", () => {
    for (const directive of [
      "Restart=on-failure",
      "RestartSec=5s",
      "KillSignal=SIGTERM",
      "KillMode=mixed",
      "TimeoutStopSec=21min",
      "SendSIGKILL=yes",
      "MemoryHigh=1536M",
      "MemoryMax=2048M",
      "TasksMax=128",
      "LimitNOFILE=4096",
      "CPUQuota=200%",
      "OOMPolicy=stop",
      "StandardOutput=journal",
      "StandardError=journal",
      "SyslogIdentifier=agent-sozluk-runtime",
      "LogRateLimitIntervalSec=30s",
      "LogRateLimitBurst=200",
    ]) {
      expect(service, directive).toContain(directive);
    }
    expect(service).toContain("A manual run may legally consume 1200 seconds.");
    expect(service).toContain("finish");
    expect(service).toContain("in-flight runOnce");
    expect(service).toContain("systemd owns the worker");
  });

  it("keeps the EnvironmentFile non-secret and points at isolated runtime state", () => {
    const environment = exampleEnvironment(environmentExample);
    expect(Object.keys(environment).sort()).toEqual(
      [
        "AGENT_RUNTIME_BASE_URL",
        "AGENT_RUNTIME_CODEX_HOME",
        "AGENT_RUNTIME_CREDENTIAL_FILE",
        "AGENT_RUNTIME_ENROLLMENT_KEY_FILE",
        "AGENT_RUNTIME_POLL_MS",
        "AGENT_RUNTIME_PROCESSING_LANES",
        "AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS",
        "AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS",
        "AGENT_RUNTIME_WORKER_ID",
        "AGENT_RUNTIME_WORK_ROOT",
        "CODEX_EXECUTABLE",
        "CODEX_SANDBOX_EXECUTABLE",
        "LOG_LEVEL",
      ].sort(),
    );
    expect(environment).toMatchObject({
      AGENT_RUNTIME_BASE_URL: "http://127.0.0.1:3000",
      AGENT_RUNTIME_CODEX_HOME: "/opt/agent-sozluk/runtime/codex-home",
      AGENT_RUNTIME_CREDENTIAL_FILE: "/var/lib/agent-sozluk-runtime/credentials.json",
      AGENT_RUNTIME_ENROLLMENT_KEY_FILE: "/var/lib/agent-sozluk-runtime/enrollment-private.pem",
      AGENT_RUNTIME_PROCESSING_LANES: "2",
      AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS: "120000",
      AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS: "300000",
      AGENT_RUNTIME_WORK_ROOT: "/opt/agent-sozluk/runtime/work",
      CODEX_EXECUTABLE: "/usr/local/bin/codex",
      CODEX_SANDBOX_EXECUTABLE: "/usr/bin/bwrap",
    });

    const forbiddenKeys = Object.keys(environment).filter((key) =>
      /(?:APP_SECRET|DATABASE|PASSWORD|PRIVATE_KEY|TOKEN|SSH|GITHUB|DOCKER_HOST)/u.test(key),
    );
    expect(forbiddenKeys).toEqual([]);
    expect(environmentExample).not.toMatch(/agt_[A-Za-z0-9_-]{40,100}/u);
    expect(environmentExample).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/u);
    expect(environmentExample).not.toMatch(/postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/u);
    expect(service).not.toMatch(/agt_[A-Za-z0-9_-]{40,100}/u);
    expect(service).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/u);
    expect(service).not.toMatch(/postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/u);
  });

  it("documents separate operator gates and user-controlled interactive Codex login", () => {
    expect(runbook).toContain("## Runtime host installation readiness (operator-gated)");
    expect(runbook).toContain(
      "This versioned unit is readiness evidence, not proof that the service is active",
    );
    expect(runbook).toContain("sudo -u agent-runtime");
    expect(runbook).toContain("/usr/local/bin/codex login");
    expect(service).toContain("ExecStartPre=/usr/bin/test -x /usr/bin/bwrap");
    expect(service).toContain("ExecStartPre=/usr/bin/bwrap --version");
    expect(runbook).toContain("--tmpfs /var/lib/agent-sozluk-runtime");
    expect(runbook).toContain("test ! -e /var/lib/agent-sozluk-runtime/credentials.json");
    expect(runbook).toContain("test ! -e /var/lib/agent-sozluk-runtime/enrollment-private.pem");
    expect(runbook).toContain("systemd-analyze verify");
    expect(runbook).toContain("systemd-analyze security agent-sozluk-runtime.service");
    expect(runbook).toMatch(
      /Do\s+not enable or start the unit before this interactive gate passes/u,
    );
  });

  it("keeps Ubuntu user-namespace hardening enabled with a narrow Bubblewrap profile", () => {
    expect(bubblewrapAppArmorProfile).toContain("/usr/bin/bwrap flags=(unconfined)");
    expect(bubblewrapAppArmorProfile).toContain("userns,");
    expect(bubblewrapAppArmorProfile).not.toMatch(
      /kernel\.apparmor_restrict_unprivileged_userns=0/u,
    );
    expect(runbook).toContain("deploy/apparmor/usr.bin.bwrap-agent-sozluk");
    expect(runbook).toContain("sudo apparmor_parser -r");
    expect(runbook).toContain("never compensate by removing Bubblewrap");
    expect(runbook).toContain('runtime_release="$(readlink -e');
  });

  it("assigns the stochastic society tick to the same singleton worker", () => {
    expect(directiveValues(service, "ExecStart")).toEqual([
      "/usr/bin/node --require /opt/agent-sozluk/runtime/current/node_modules/tsx/dist/preflight.cjs --import file:///opt/agent-sozluk/runtime/current/node_modules/tsx/dist/loader.mjs scripts/agent-runtime-worker.ts",
    ]);
    expect(runbook).toContain("random 2–5 minute delay");
    expect(runbook).toContain("/api/v1/internal/agent-runtime/scheduler/tick");
    expect(runbook).toContain("Legacy daily-plan routes");
    expect(runbook).toContain("410 AGENT_DAILY_PLANNING_RETIRED");
    expect(runbook).toContain("Historical daily-plan Day 0 gate — archived, do not execute");
    expect(runbook).toContain("runtime:plan");
    expect(runbook).toContain("does not impersonate a HUMAN ADMIN");
  });
});
