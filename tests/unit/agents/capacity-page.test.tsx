import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actorFromSession: vi.fn(),
  getDatabase: vi.fn(),
  getRuntimeCapacity: vi.fn(),
  requireAgentAdminPage: vi.fn(),
}));

vi.mock("@/components/agents/agent-capability-measurement-form", () => ({
  AgentCapabilityMeasurementForm: () => <div>capacity-package-form</div>,
}));
vi.mock("@/components/agents/agent-admin-forms", () => ({
  RuntimeControlForm: () => <div>runtime-control</div>,
}));
vi.mock("@/components/agents/global-run-control-form", () => ({
  GlobalRunControlForm: () => <div>global-run-control</div>,
}));
vi.mock("@/components/moderation/moderation-nav", () => ({
  ModerationLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/auth/server-session", () => ({
  requireAgentAdminPage: mocks.requireAgentAdminPage,
}));
vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/agents", () => ({ getRuntimeCapacity: mocks.getRuntimeCapacity }));
vi.mock("@/modules/auth/domain/actor", () => ({ actorFromSession: mocks.actorFromSession }));

import AgentCapacityPage from "@/app/moderasyon/agent-kapasite/page";

type Capacity = Parameters<typeof mocks.getRuntimeCapacity.mockResolvedValue>[0];

describe("agent capacity worker observability", () => {
  let capacity: Capacity;

  beforeEach(() => {
    mocks.requireAgentAdminPage.mockResolvedValue({ userId: "admin" });
    mocks.actorFromSession.mockReturnValue({ actorId: "admin" });
    capacity = {
      localDate: new Date("2026-07-29T00:00:00.000Z"),
      runtimeEnabled: true,
      schedulerEnabled: true,
      publishEnabled: true,
      publicWriteEnabled: true,
      runtimeOperatingMode: "NORMAL",
      societyFlowEnabled: true,
      capacityStatus: "HEALTHY",
      configuredConcurrency: 2,
      effectiveConcurrency: 2,
      capacityReserve: 0.7,
      estimatedUtilization: 0.3,
      queueLagMs: 3_000,
      estimatedCompletionAt: null,
      estimatedCompletionDurationMs: null,
      warnings: [],
      benchmark: null,
      circuitBreakers: {
        breakers: [],
        writeRunsPaused: false,
        contentSlowdown: false,
      },
      operational: {
        activeRunStartedAts: [new Date("2026-07-29T12:00:00.000Z")],
        eligibleQueuedRunCount: 1,
        utilization15m: 0.2,
        utilization1h: 0.3,
        utilization2h: 0.4,
        oldestQueuedAt: new Date("2026-07-29T12:00:00.000Z"),
        longestActiveStartedAt: new Date("2026-07-29T12:00:00.000Z"),
        workerPresence: "ONLINE",
        worker: {
          workerId: "agent-runtime-main",
          online: true,
          bootId: "018f5d51-8f89-4a4e-89df-2166b53ea420",
          processingLanes: 2,
          codexVersion: "codex-cli 0.150.0",
          promptProfileHash: "a".repeat(64),
          startedAt: new Date("2026-07-29T11:50:00.000Z"),
          restartCount: 1,
          lastSeenAt: new Date("2026-07-29T12:00:09.000Z"),
          lastSeenAgeMs: 1_000,
        },
        executionSlots: [
          {
            slot: 1,
            status: "ACTIVE",
            workerId: "agent-runtime-main",
            runId: "018f5d51-8f89-4a4e-89df-2166b53ea421",
            runType: "NORMAL_WAKE",
            runStatus: "RUNNING",
            agentProfileId: "018f5d51-8f89-4a4e-89df-2166b53ea422",
            username: "sokaknotu",
            displayName: "Sokak Notu",
            phase: "THINKING",
            startedAt: new Date("2026-07-29T12:00:00.000Z"),
            heartbeatAt: new Date("2026-07-29T12:00:08.000Z"),
            leaseExpiresAt: new Date("2026-07-29T12:01:00.000Z"),
            leaseAgeMs: 10_000,
            heartbeatAgeMs: 2_000,
            leaseRemainingMs: 50_000,
          },
          {
            slot: 2,
            status: "IDLE",
            workerId: "agent-runtime-main",
            runId: null,
            runType: null,
            runStatus: null,
            agentProfileId: null,
            username: null,
            displayName: null,
            phase: null,
            startedAt: null,
            heartbeatAt: null,
            leaseExpiresAt: null,
            leaseAgeMs: null,
            heartbeatAgeMs: null,
            leaseRemainingMs: null,
          },
        ],
        timeoutCount1h: 1,
        recentExecutions: [
          {
            runId: "018f5d51-8f89-4a4e-89df-2166b53ea423",
            runType: "NORMAL_WAKE",
            runStatus: "TIMED_OUT",
            workerId: "agent-runtime-main",
            agentProfileId: "018f5d51-8f89-4a4e-89df-2166b53ea422",
            username: "sokaknotu",
            displayName: "Sokak Notu",
            queueWaitMs: 3_000,
            codexDurationMs: 12_000,
            finishedAt: new Date("2026-07-29T11:59:58.000Z"),
            errorCode: "CODEX_TIMEOUT",
          },
        ],
      },
    };
    mocks.getRuntimeCapacity.mockResolvedValue(capacity);
  });

  it("renders live worker, active/idle lanes and safe recent execution evidence", async () => {
    const html = renderToStaticMarkup(await AgentCapacityPage());

    expect(html).toContain("Worker çevrimiçi");
    expect(html).toContain("agent-runtime-main");
    expect(html).toContain("Tespit edilen restart");
    expect(html).toContain("codex-cli 0.150.0");
    expect(html).toContain("Lane 1");
    expect(html).toContain("ÇALIŞIYOR");
    expect(html).toContain("Sokak Notu (@sokaknotu)");
    expect(html).toContain("THINKING");
    expect(html).toContain("Lane 2");
    expect(html).toContain("BOŞ");
    expect(html).toContain("CODEX_TIMEOUT");
    expect(html).not.toContain("018f5d51-8f89-4a4e-89df-2166b53ea420");
  });

  /*
    E2: Roster sync, run lease/heartbeat ve runtime state heartbeat'i ayrı
    sinyaller. Rozet eskiden yalnız roster'a bakıyordu; lease canlıyken bile
    "Worker görünmüyor" diyor, operatörü gereksiz müdahaleye itiyordu.
  */
  it("separates a stale roster with a live lease from a missing worker", async () => {
    capacity.operational.workerPresence = "ROSTER_STALE_LEASE_ACTIVE";
    capacity.operational.worker.online = false;
    capacity.operational.worker.lastSeenAgeMs = 300_000;
    capacity.operational.executionSlots[0].heartbeatAgeMs = 8_000;
    capacity.operational.executionSlots[0].leaseRemainingMs = 42_000;

    const html = renderToStaticMarkup(await AgentCapacityPage());

    expect(html).toContain("Roster heartbeat bayat · run canlı");
    expect(html).not.toContain("Worker görünmüyor");
    expect(html).toContain("worker çalışıyor, bayat olan yalnız roster kanalı");
    expect(html).toContain("Lease durumu");
    expect(html).toContain("Canlı");
  });

  it("reports a genuinely absent worker and marks the zombie lane", async () => {
    capacity.operational.workerPresence = "ROSTER_STALE_NO_LEASE";
    capacity.operational.worker.online = false;
    capacity.operational.worker.lastSeenAgeMs = 900_000;
    capacity.operational.executionSlots[0].heartbeatAgeMs = 600_000;
    capacity.operational.executionSlots[0].leaseRemainingMs = 0;

    const html = renderToStaticMarkup(await AgentCapacityPage());

    expect(html).toContain("Worker görünmüyor");
    expect(html).not.toContain("Roster heartbeat bayat · run canlı");
    expect(html).toContain("worker süreci gerçekten yok ya da takılmış");
    expect(html).toContain("Süresi dolmuş · zombi run");
  });

  it("distinguishes a worker that never reported from one that died", async () => {
    capacity.operational.workerPresence = "NEVER_REPORTED";
    capacity.operational.worker = null;
    capacity.operational.executionSlots = capacity.operational.executionSlots.map(
      (slot: { slot: number }) => ({
        ...slot,
        status: "IDLE",
        runId: null,
        heartbeatAgeMs: null,
        leaseRemainingMs: null,
      }),
    );

    const html = renderToStaticMarkup(await AgentCapacityPage());

    expect(html).toContain("Worker hiç raporlamadı");
    expect(html).not.toContain("Worker görünmüyor");
    expect(html).toContain("Henüz raporlanmadı");
  });
});
