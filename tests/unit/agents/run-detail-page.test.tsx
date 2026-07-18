import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";

const mocks = vi.hoisted(() => ({
  actorFromSession: vi.fn(),
  getAgentDetail: vi.fn(),
  getAgentRunDetail: vi.fn(),
  getDatabase: vi.fn(),
  listAgentDashboard: vi.fn(),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("not found"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  }),
  requireAgentAdminPage: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/agents/agent-admin-forms", () => ({
  AgentCredentialRotateForm: () => null,
  AgentLifecycleForm: () => null,
  AgentQuickRunActions: () => null,
  AgentScheduleRegenerateForm: () => null,
  BulkAgentRunForm: () => null,
  ManualAgentRunForm: () => null,
  AgentRunCommands: ({ runId, status }: { runId: string; status: string }) => (
    <span>{`commands:${runId}:${status}`}</span>
  ),
}));
vi.mock("@/components/moderation/moderation-nav", () => ({
  ModerationLayout: ({
    title,
    description,
    children,
  }: {
    title: string;
    description: string;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));
vi.mock("@/lib/auth/server-session", () => ({
  requireAgentAdminPage: mocks.requireAgentAdminPage,
}));
vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/agents", () => ({
  getAgentDetail: mocks.getAgentDetail,
  getAgentRunDetail: mocks.getAgentRunDetail,
  listAgentDashboard: mocks.listAgentDashboard,
}));
vi.mock("@/modules/auth/domain/actor", () => ({ actorFromSession: mocks.actorFromSession }));

import AgentRunDetailPage from "@/app/moderasyon/agentlar/calisma/[runId]/page";
import AgentDashboardPage from "@/app/moderasyon/agentlar/page";
import AgentRunsPage from "@/app/moderasyon/agentlar/[id]/calismalar/page";

const runId = "018f5d51-8f89-4a4e-89df-2166b53ea41f";
const agentId = "018f5d51-8f89-4a4e-89df-2166b53ea420";
const entryId = "018f5d51-8f89-4a4e-89df-2166b53ea421";
const session = {
  userId: "018f5d51-8f89-4a4e-89df-2166b53ea422",
  user: { kind: "HUMAN" as const, role: "ADMIN" as const, status: "ACTIVE" as const },
};

const run = {
  id: runId,
  agentProfileId: agentId,
  runType: "NORMAL_WAKE",
  runStatus: "SUCCEEDED",
  queuePriority: "MANUAL_SINGLE",
  trigger: "ADMIN_MANUAL",
  parentRunId: null,
  personaVersionId: "018f5d51-8f89-4a4e-89df-2166b53ea423",
  availableAt: new Date("2026-07-18T08:00:00.000Z"),
  startedAt: new Date("2026-07-18T08:01:00.000Z"),
  finishedAt: new Date("2026-07-18T08:02:00.000Z"),
  heartbeatAt: new Date("2026-07-18T08:01:30.000Z"),
  cancelRequestedAt: null,
  timeoutSeconds: 600,
  desiredEntryMin: 1,
  desiredEntryMax: 2,
  allowTopicCreation: true,
  allowVoting: true,
  allowFollowing: false,
  allowSourceReading: true,
  saturationOverride: false,
  dailyMaximumOverride: false,
  provocationOverride: false,
  safeRunSummary: { operationSummary: "Güvenli özet <script>alert(1)</script>" },
  usageMetadata: { durationMs: 60_000, provider: "codex-cli" },
  performanceMetrics: { publishedEntries: 1 },
  errorCode: null,
  errorSummary: null,
  attempts: 1,
  createdAt: new Date("2026-07-18T07:59:00.000Z"),
  updatedAt: new Date("2026-07-18T08:02:00.000Z"),
  events: [
    {
      id: "018f5d51-8f89-4a4e-89df-2166b53ea424",
      sequence: 1,
      eventType: "run.completed",
      safeMessage: "Run güvenle tamamlandı.",
      metadata: { phase: "complete" },
      createdAt: new Date("2026-07-18T08:02:00.000Z"),
    },
  ],
  actions: [
    {
      id: "018f5d51-8f89-4a4e-89df-2166b53ea425",
      sequence: 1,
      actionType: "CREATE_ENTRY",
      actionStatus: "SUCCEEDED",
      targetType: "TOPIC",
      targetId: "018f5d51-8f89-4a4e-89df-2166b53ea426",
      input: { body: "Güvenli action içeriği", safeReason: "Görünür topic kanıtı." },
      provenance: { evidenceType: "PLATFORM_EVENT", evidenceIds: [entryId] },
      validationResult: { valid: true },
      result: { entryId },
      rejectionCode: null,
      rejectionReason: null,
      createdAt: new Date("2026-07-18T08:01:10.000Z"),
    },
  ],
  contentRecords: [{ entryId, createdAt: new Date("2026-07-18T08:01:20.000Z") }],
  idempotencyKey: "internal-idempotency-secret",
  leaseOwner: "internal-worker-name",
  adminInstruction: "internal-admin-instruction",
  perceptionSummary: { raw: "private-deliberation" },
};

describe("agent run detail admin page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgentAdminPage.mockResolvedValue(session);
    mocks.getDatabase.mockReturnValue({});
    mocks.actorFromSession.mockReturnValue({ actorRole: "ADMIN", actorKind: "HUMAN" });
    mocks.getAgentRunDetail.mockResolvedValue(run);
    mocks.getAgentDetail.mockResolvedValue({
      id: agentId,
      user: { displayName: "Katman İzci", username: "katmanizci" },
      lifecycleStatus: "ACTIVE",
      runs: [run],
    });
    mocks.listAgentDashboard.mockResolvedValue([
      {
        id: agentId,
        user: { displayName: "Katman İzci", username: "katmanizci" },
        lifecycleStatus: "ACTIVE",
        runtimeStatus: "RUNNING",
        lastHeartbeatAt: run.heartbeatAt,
        currentRun: {
          id: run.id,
          runType: run.runType,
          runStatus: run.runStatus,
          startedAt: run.startedAt,
        },
        today: {
          publishedEntries: 1,
          entryTarget: 15,
          createdTopics: 0,
          topicTarget: 1,
          votes: 2,
          voteTarget: 5,
          sourceReads: 1,
        },
        queueLength: 0,
        nextRunAt: null,
        lastEntry: null,
        personaVersion: 1,
        sourceCount: 4,
        successRate24h: 1,
        targetProjection: 0.75,
        p75RunDurationMs: 60_000,
        codexInvocations: 1,
        averageEntriesPerRun: 1,
        consecutiveFailures: 0,
        latestUsageMetadata: null,
        lastError: null,
      },
    ]);
  });

  it("renders allowlisted safe run data, action evidence and content links", async () => {
    const page = await AgentRunDetailPage({ params: Promise.resolve({ runId }) });
    const html = renderToStaticMarkup(page);

    expect(mocks.requireAgentAdminPage).toHaveBeenCalledOnce();
    expect(mocks.getAgentRunDetail).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ actorRole: "ADMIN", actorKind: "HUMAN" }),
      runId,
    );
    expect(html).toContain("Agent çalışma detayı");
    expect(html).toContain("Run güvenle tamamlandı.");
    expect(html).toContain("PLATFORM_EVENT");
    expect(html).toContain("Validation result");
    expect(html).toContain(`href=\"/entry/${entryId}\"`);
    expect(html).toContain(`href=\"/moderasyon/agent-icerikleri?runId=${runId}\"`);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("internal-idempotency-secret");
    expect(html).not.toContain("internal-worker-name");
    expect(html).not.toContain("internal-admin-instruction");
    expect(html).not.toContain("private-deliberation");
  });

  it("stops before the application service when the HUMAN ADMIN page guard denies access", async () => {
    mocks.requireAgentAdminPage.mockRejectedValue(new AppError("FORBIDDEN", 403, "Yasak."));

    await expect(AgentRunDetailPage({ params: Promise.resolve({ runId }) })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(mocks.getAgentRunDetail).not.toHaveBeenCalled();
  });

  it("links both per-agent history and the live dashboard to the canonical run detail route", async () => {
    const [history, dashboard] = await Promise.all([
      AgentRunsPage({ params: Promise.resolve({ id: agentId }) }),
      AgentDashboardPage({ searchParams: Promise.resolve({}) }),
    ]);
    const expectedHref = `href=\"/moderasyon/agentlar/calisma/${runId}\"`;

    expect(renderToStaticMarkup(history)).toContain(expectedHref);
    expect(renderToStaticMarkup(dashboard)).toContain(expectedHref);
  });

  it("maps a missing run to the page-level 404 boundary", async () => {
    mocks.getAgentRunDetail.mockRejectedValue(
      new AppError("AGENT_RUN_NOT_FOUND", 404, "Agent run bulunamadı."),
    );

    await expect(AgentRunDetailPage({ params: Promise.resolve({ runId }) })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("returns 404 for a malformed run ID without querying the database", async () => {
    await expect(
      AgentRunDetailPage({ params: Promise.resolve({ runId: "not-a-uuid" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(mocks.getAgentRunDetail).not.toHaveBeenCalled();
  });
});
