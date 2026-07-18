import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";

const demoPassword = process.env.DEMO_PASSWORD ?? "change-this-demo-password";
const suffix = Date.now().toString(36);
let ipCounter = 100;
let agentProfileId = "";
let agentUsername = "";
let runtimeCredential = "";
let cancellableRunId = "";
let humanTopicId = "";
let humanTopicUrl = "";
let agentEntryId = "";
let agentEntryBody = "";

interface Envelope<T = Record<string, unknown>> {
  data?: T;
  error?: { code?: string; message?: string };
}

async function isolateIp(page: Page): Promise<void> {
  ipCounter += 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${ipCounter}` });
}

async function login(page: Page, email = "admin@local.test"): Promise<void> {
  await isolateIp(page);
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(demoPassword);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByRole("button", { name: "Hesap menüsünü aç" })).toBeVisible({
    timeout: 20_000,
  });
}

async function browserApi<T = Record<string, unknown>>(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
  expectedStatus = 200,
): Promise<T> {
  const result = await page.evaluate(
    async ({ requestMethod, requestPath, requestBody }) => {
      const csrf = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("ajan_csrf="))
        ?.split("=")
        .slice(1)
        .join("=");
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers: {
          ...(requestBody === undefined ? {} : { "Content-Type": "application/json" }),
          ...(requestMethod === "GET"
            ? {}
            : {
                "X-CSRF-Token": decodeURIComponent(csrf ?? ""),
                "Idempotency-Key": crypto.randomUUID(),
              }),
        },
        ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
      });
      return { status: response.status, envelope: (await response.json()) as Envelope };
    },
    { requestMethod: method, requestPath: path, requestBody: body },
  );
  expect(result.status, JSON.stringify(result.envelope.error)).toBe(expectedStatus);
  if (expectedStatus >= 400) return result.envelope as T;
  expect(result.envelope.data).toBeDefined();
  return result.envelope.data as T;
}

async function runtimeApi<T>(
  request: APIRequestContext,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await request.post(path, {
    headers: {
      authorization: `Bearer ${runtimeCredential}`,
      "idempotency-key": crypto.randomUUID(),
    },
    data: body,
  });
  const envelope = (await response.json()) as Envelope<T>;
  expect(response.status(), JSON.stringify(envelope.error)).toBe(200);
  return envelope.data as T;
}

test.beforeEach(async ({ page }) => {
  for (const host of [
    "www.googletagmanager.com",
    "www.google-analytics.com",
    "region1.google-analytics.com",
    "analytics.google.com",
    "stats.g.doubleclick.net",
  ]) {
    await page.route(`https://${host}/**`, (route) => route.abort("blockedbyclient"));
  }
});

test.describe.serial("@desktop Milestone 2 agent society", () => {
  test("E2E-001 admin dashboard", async ({ page }) => {
    await login(page);
    await page.goto("/moderasyon/agentlar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Agent control plane" }),
    ).toBeVisible();
  });

  test("E2E-002 moderator denial", async ({ page }) => {
    await login(page, "moderator@local.test");
    const denied = await browserApi<Envelope>(page, "GET", "/api/v1/admin/agents", undefined, 403);
    expect(denied.error?.code).toBe("FORBIDDEN");
  });

  test("E2E-003 agent create", async ({ page }) => {
    await login(page);
    const persona = {
      ...originalPersonaPack.personas[0],
      username: `${originalPersonaPack.personas[0]!.username}_${suffix}`.slice(0, 32),
      displayName: `${originalPersonaPack.personas[0]!.displayName} ${suffix.slice(-4)}`,
    };
    const created = await browserApi<{
      agent: { profile: { id: string }; user: { username: string } };
      credential: string;
    }>(page, "POST", "/api/v1/admin/agents", { persona, lifecycleStatus: "PAUSED" });
    agentProfileId = created.agent.profile.id;
    agentUsername = created.agent.user.username;
    runtimeCredential = created.credential;
    expect(agentProfileId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(runtimeCredential).toMatch(/^agt_[A-Za-z0-9_-]{40,100}$/u);
  });

  test("E2E-004 agent edit", async ({ page }) => {
    await login(page);
    const updated = await browserApi<{ user: { displayName: string } }>(
      page,
      "PATCH",
      `/api/v1/admin/agents/${agentProfileId}`,
      {
        displayName: `E2E Agent ${suffix}`,
        changeSummary: "E2E agent görünen adı kontrollü olarak güncellendi.",
      },
    );
    expect(updated.user.displayName).toBe(`E2E Agent ${suffix}`);
  });

  test("E2E-005 quota change", async ({ page }) => {
    await login(page);
    const settings = await browserApi<{ settingsVersion: number }>(
      page,
      "GET",
      "/api/v1/admin/agent-settings",
    );
    await browserApi(page, "PATCH", "/api/v1/admin/agent-settings", {
      expectedSettingsVersion: settings.settingsVersion,
      changeReason: "E2E quota apply-mode ve global target değişikliği doğrulaması.",
      quotaApplyMode: "REGENERATE_REMAINING_TODAY",
      globalDailyEntryMin: 15,
      globalDailyEntryMax: 20,
    });
    const updated = await browserApi<{
      useGlobalEntryQuota: boolean;
      dailyEntryMin: number;
      dailyEntryMax: number;
    }>(page, "PATCH", `/api/v1/admin/agents/${agentProfileId}`, {
      useGlobalEntryQuota: false,
      dailyEntry: { min: 15, max: 20 },
    });
    expect(updated).toMatchObject({
      useGlobalEntryQuota: false,
      dailyEntryMin: 15,
      dailyEntryMax: 20,
    });
  });

  test("E2E-006 invalid quota rejected", async ({ page }) => {
    await login(page);
    const rejected = await browserApi<Envelope>(
      page,
      "PATCH",
      `/api/v1/admin/agents/${agentProfileId}`,
      { useGlobalEntryQuota: false, dailyEntry: { min: 20, max: 15 } },
      422,
    );
    expect(rejected.error?.code).toBe("VALIDATION_ERROR");
  });

  test("E2E-007 manual normal", async ({ page }) => {
    await login(page);
    await browserApi(page, "POST", `/api/v1/admin/agents/${agentProfileId}/lifecycle`, {
      status: "ACTIVE",
      reason: "E2E normal run doğrulaması için agent aktive ediliyor.",
    });
    const result = await browserApi<{
      count: number;
      run: { id: string; runType: string; runStatus: string };
    }>(page, "POST", `/api/v1/admin/agents/${agentProfileId}/runs`, {
      runType: "NORMAL_WAKE",
      entryTarget: 2,
      priority: "NORMAL",
    });
    cancellableRunId = result.run.id;
    expect(result).toMatchObject({
      count: 1,
      run: { runType: "NORMAL_WAKE", runStatus: "QUEUED" },
    });
  });

  test("E2E-008 live status", async ({ page }) => {
    await login(page);
    const health = await browserApi<{ runtimeEnabled: boolean }>(
      page,
      "GET",
      "/api/v1/admin/agent-runtime/health",
    );
    expect(health.runtimeEnabled).toBe(true);
    await page.goto("/moderasyon/agentlar/olaylar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Canlı agent olayları" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(/Bağlantı: (LIVE|POLLING)/u, {
      timeout: 15_000,
    });
    const newestEventBefore = await page.locator("ol > li").first().textContent();
    await browserApi(page, "POST", `/api/v1/admin/agents/${agentProfileId}/runs`, {
      runType: "READ_ONLY",
      entryTarget: 0,
      adminInstruction: `E2E live event ${suffix}`,
    });
    await expect
      .poll(() => page.locator("ol > li").first().textContent(), { timeout: 15_000 })
      .not.toBe(newestEventBefore);
    await expect(
      page.getByText("Manual agent run kuyruğa alındı.", { exact: true }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/moderasyon\/agentlar\/olaylar$/u);
  });

  test("E2E-009 dry run", async ({ page }) => {
    await login(page);
    const result = await browserApi<{
      run: { runType: string; desiredEntryMax: number };
    }>(page, "POST", `/api/v1/admin/agents/${agentProfileId}/runs`, {
      runType: "DRY_RUN",
      entryTarget: 0,
    });
    expect(result.run).toMatchObject({ runType: "DRY_RUN", desiredEntryMax: 0 });
  });

  test("E2E-010 entry burst", async ({ page }) => {
    await login(page);
    const result = await browserApi<{
      run: { runType: string; desiredEntryMax: number };
    }>(page, "POST", `/api/v1/admin/agents/${agentProfileId}/runs`, {
      runType: "ENTRY_BURST",
      entryTarget: 3,
    });
    expect(result.run).toMatchObject({ runType: "ENTRY_BURST", desiredEntryMax: 3 });
  });

  test("E2E-011 cancel", async ({ page }) => {
    await login(page);
    const cancelled = await browserApi<{ runStatus: string }>(
      page,
      "POST",
      `/api/v1/admin/agent-runs/${cancellableRunId}/cancel`,
      { reason: "E2E queued run cancellation verification." },
    );
    expect(cancelled.runStatus).toBe("CANCELLED");
  });

  test("E2E-012 retry", async ({ page }) => {
    await login(page);
    const retry = await browserApi<{ parentRunId: string; runStatus: string }>(
      page,
      "POST",
      `/api/v1/admin/agent-runs/${cancellableRunId}/retry`,
      { reason: "E2E cancelled run retry lineage verification." },
    );
    expect(retry).toMatchObject({ parentRunId: cancellableRunId, runStatus: "QUEUED" });
  });

  test("E2E-013 bulk run and capacity preview", async ({ page }) => {
    await login(page);
    const selection = {
      agentIds: [agentProfileId],
      run: { runType: "DRY_RUN", entryTarget: 0, priority: "NORMAL" },
    };
    const preview = await browserApi<{ runCount: number; concurrency: number }>(
      page,
      "POST",
      "/api/v1/admin/agent-runs/bulk/preview",
      selection,
    );
    expect(preview).toMatchObject({ runCount: 1, concurrency: 1 });
    const queued = await browserApi<{ count: number }>(
      page,
      "POST",
      "/api/v1/admin/agent-runs/bulk",
      { ...selection, confirmation: "RUN_SELECTED_AGENTS" },
    );
    expect(queued.count).toBe(1);
  });

  test("E2E-014 pause and resume", async ({ page }) => {
    await login(page);
    await page.goto("/moderasyon/agent-kapasite");
    await page.getByLabel("Pause gerekçesi").fill("E2E global runtime pause verification.");
    await page.getByRole("button", { name: "Global runtime pause" }).click();
    await expect(page.getByLabel("Resume/reset gerekçesi")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Resume/reset gerekçesi").fill("E2E global runtime resume verification.");
    await page.getByRole("button", { name: "Resume ve reset" }).click();
    await expect(page.getByLabel("Pause gerekçesi")).toBeVisible({ timeout: 20_000 });

    await page.goto(`/moderasyon/agentlar/${agentProfileId}`);
    await page.getByLabel("Yeni durum").selectOption("PAUSED");
    await page
      .getByLabel("Gerekçe", { exact: true })
      .fill("E2E agent lifecycle pause verification.");
    await page.getByRole("button", { name: "Durumu değiştir" }).click();
    await expect(
      page.getByText("Agent lifecycle PAUSED olarak güncellendi.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(new RegExp(`@${agentUsername} · PAUSED`, "u"))).toBeVisible({
      timeout: 20_000,
    });
    await page.getByLabel("Yeni durum").selectOption("ACTIVE");
    await page
      .getByLabel("Gerekçe", { exact: true })
      .fill("E2E agent lifecycle resume verification.");
    await page.getByRole("button", { name: "Durumu değiştir" }).click();
    await expect(
      page.getByText("Agent lifecycle ACTIVE olarak güncellendi.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(new RegExp(`@${agentUsername} · ACTIVE`, "u"))).toBeVisible({
      timeout: 20_000,
    });
  });

  test("E2E-015 persona history", async ({ page }) => {
    await login(page);
    const detail = await browserApi<{
      personaVersions: Array<{ version: number }>;
    }>(page, "GET", `/api/v1/admin/agents/${agentProfileId}`);
    expect(detail.personaVersions.some(({ version }) => version === 1)).toBe(true);
    const rolled = await browserApi<{ version: number }>(
      page,
      "POST",
      `/api/v1/admin/agents/${agentProfileId}/persona/rollback`,
      { version: 1, reason: "E2E append-only persona rollback verification." },
    );
    expect(rolled.version).toBeGreaterThan(1);
  });

  test("E2E-016 source pin and block", async ({ page }) => {
    await login(page);
    const sources = await browserApi<Array<{ id: string }>>(
      page,
      "GET",
      `/api/v1/admin/agent-sources?agentProfileId=${agentProfileId}`,
    );
    const sourceId = sources[0]!.id;
    const pinned = await browserApi<{ adminPinned: boolean }>(
      page,
      "PATCH",
      `/api/v1/admin/agent-sources/${sourceId}`,
      { adminPinned: true, reason: "E2E source pin verification." },
    );
    expect(pinned.adminPinned).toBe(true);
    const blocked = await browserApi<{ adminPinned: boolean; adminBlocked: boolean }>(
      page,
      "PATCH",
      `/api/v1/admin/agent-sources/${sourceId}`,
      {
        adminPinned: false,
        adminBlocked: true,
        reason: "E2E source block verification after unpin.",
      },
    );
    expect(blocked).toMatchObject({ adminPinned: false, adminBlocked: true });
  });

  test("E2E-017 public profile metadata absent", async ({ page }) => {
    await page.goto(`/yazar/${agentUsername}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("agentProfileId");
    expect(html).not.toContain("personaVersion");
    expect(html).not.toContain("runtimeStatus");
  });

  test("E2E-018 human user writes", async ({ page }) => {
    await login(page, "writer@local.test");
    await page.goto("/baslik/ac");
    const title = `Agent society human flow ${suffix}`;
    await page.getByRole("textbox", { name: "Başlık", exact: true }).fill(title);
    await page
      .getByRole("textbox", { name: "İlk entry", exact: true })
      .fill("M2 agent society E2E içinde insan yazar akışını doğrulayan yeterince uzun entry.");
    await page.getByRole("button", { name: "Başlığı oluştur" }).click();
    await expect(page).toHaveURL(/\/baslik\/[0-9a-f-]{36}-/u, { timeout: 20_000 });
    humanTopicUrl = new URL(page.url()).pathname;
    humanTopicId = humanTopicUrl.split("/").at(-1)!.slice(0, 36);
    expect(humanTopicId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  test("E2E-019 user follow", async ({ page }) => {
    await login(page, "writer@local.test");
    await page.goto(`/yazar/${agentUsername}`);
    await page.getByRole("button", { name: "Yazarı takip et", exact: true }).click();
    await expect(page.getByRole("button", { name: "Takibi bırak", exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("E2E-020 capacity dashboard", async ({ page }) => {
    await login(page);
    await page.goto("/moderasyon/agent-kapasite");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Concurrency/u).first()).toBeVisible();
    await expect(page.getByText("Projected target shortfall", { exact: true })).toBeVisible();
    await expect(page.getByText("Son actual günlük SLO miss", { exact: true })).toBeVisible();
  });

  test("E2E-021 agent content moderation", async ({ page, request }) => {
    await login(page);
    await browserApi(page, "POST", `/api/v1/admin/agents/${agentProfileId}/runs`, {
      runType: "NORMAL_WAKE",
      entryTarget: 1,
      priority: "EMERGENCY",
      dailyMaximumOverride: true,
    });
    const workerId = `e2e-worker-${suffix}`;
    const lease = await runtimeApi<{ run: { id: string; leaseToken: string } }>(
      request,
      "/api/v1/internal/agent-runtime/lease",
      { workerId, leaseSeconds: 60 },
    );
    const runId = lease.run.id;
    const leaseToken = lease.run.leaseToken;
    agentEntryBody = `Agent society E2E runtime entry ${suffix}; görünür topic bağlamına dayanan benzersiz içerik.`;
    await runtimeApi(request, `/api/v1/internal/agent-runtime/runs/${runId}/actions`, {
      workerId,
      leaseToken,
      actions: [
        {
          sequence: 1,
          actionType: "CREATE_ENTRY",
          safeReason: "E2E görünür topic bağlamı güvenli entry adayını destekliyor.",
          targetType: "TOPIC",
          targetId: humanTopicId,
          input: { topicId: humanTopicId, body: agentEntryBody },
          provenance: {
            evidenceType: "PLATFORM_EVENT",
            evidenceIds: [humanTopicId],
            shortRationale: "E2E görünür platform topic kanıtı.",
          },
        },
      ],
      payload: {
        observations: [],
        memoryCandidates: [],
        decisionJournal: [
          {
            seq: 1,
            kind: "OPTION_SELECTED",
            subject: "E2E topic için entry oluşturmak",
            summary: "Görünür topic bağlamına dayalı sınırlı entry action seçildi.",
            confidence: 0.8,
            evidenceIds: [humanTopicId],
            causedBySeqs: [],
          },
        ],
        actionIntents: [
          {
            sequence: 1,
            desire: 0.8,
            expectedOutcome: "Görünür topic üzerinde tek doğrulanabilir entry oluşacak.",
            selectedOptionSeq: 1,
          },
        ],
      },
    });
    const executed = await runtimeApi<{
      actions: Array<{ actionStatus: string; result: { entryId: string } }>;
    }>(request, `/api/v1/internal/agent-runtime/runs/${runId}/actions/execute`, {
      workerId,
      leaseToken,
      sequences: [1],
    });
    expect(executed.actions[0]!.actionStatus).toBe("SUCCEEDED");
    agentEntryId = executed.actions[0]!.result.entryId;
    await runtimeApi(request, `/api/v1/internal/agent-runtime/runs/${runId}/complete`, {
      workerId,
      leaseToken,
      outcome: "SUCCEEDED",
      state: { curiosity: 0.5, confidence: 0.6, topicFatigue: {} },
      safeRunSummary: {
        operationSummary: "E2E agent content run completed.",
        observedItemIds: [humanTopicId],
        proposedActionCount: 1,
        completedActionCount: 1,
        rejectedActionCount: 0,
        shortRationale: "E2E runtime publication verification.",
      },
      usageMetadata: { durationMs: 1000, provider: "codex-cli", model: "e2e-fake" },
      performanceMetrics: { publishedEntries: 1, createdTopics: 0, votes: 0, sourceReads: 0 },
    });
    await page.goto("/moderasyon/agent-icerikleri");
    await expect(page.getByText(agentEntryBody, { exact: true })).toBeVisible();
  });

  test("E2E-022 report hide public removal and restore", async ({ page }) => {
    await login(page, "writer@local.test");
    await browserApi(
      page,
      "POST",
      "/api/v1/reports",
      {
        targetType: "ENTRY",
        targetId: agentEntryId,
        reason: "SPAM",
        details: "E2E agent content takedown flow report.",
      },
      201,
    );
    const visitorContext = await page.context().browser()!.newContext();
    const visitor = await visitorContext.newPage();
    const searchQuery = `runtime entry ${suffix}`;
    const getPublicData = async <T>(path: string): Promise<T> => {
      const response = await visitorContext.request.get(path);
      expect(response.status(), path).toBe(200);
      const envelope = (await response.json()) as Envelope<T>;
      expect(envelope.data).toBeDefined();
      return envelope.data as T;
    };
    const topicEntriesPath = `/api/v1/topics/${humanTopicId}/entries?page=1&pageSize=20`;
    const searchPath = `/api/v1/search?type=entries&q=${encodeURIComponent(searchQuery)}`;

    // Warm every dynamic public surface before takedown so the same visitor
    // proves that no stale page/API cache survives the hide transaction.
    await visitor.goto(`/entry/${agentEntryId}`);
    await expect(visitor.getByText(agentEntryBody, { exact: true })).toBeVisible();
    await visitor.goto(humanTopicUrl);
    await expect(visitor.getByText(agentEntryBody, { exact: true })).toBeVisible();
    await visitor.goto(`/yazar/${agentUsername}`);
    await expect(visitor.getByText(agentEntryBody, { exact: true })).toBeVisible();
    expect(
      (await getPublicData<Array<{ id: string }>>(topicEntriesPath)).some(
        ({ id }) => id === agentEntryId,
      ),
    ).toBe(true);
    expect(
      (await getPublicData<Array<{ id: string }>>(searchPath)).some(
        ({ id }) => id === agentEntryId,
      ),
    ).toBe(true);

    await page.context().clearCookies();
    await login(page);
    await browserApi(page, "POST", "/api/v1/admin/agent-content/bulk-hide", {
      entryIds: [agentEntryId],
      reason: "E2E report sonrası agent entry gizleme doğrulaması.",
      confirmation: "HIDE_AGENT_CONTENT",
    });
    await visitor.goto(`/entry/${agentEntryId}`);
    await expect(
      visitor.getByRole("heading", { level: 1, name: "Bu sayfa sözlükte yok" }),
    ).toBeVisible();
    await visitor.goto(humanTopicUrl);
    await expect(visitor.getByText(agentEntryBody, { exact: true })).toHaveCount(0);
    await visitor.goto(`/yazar/${agentUsername}`);
    await expect(visitor.getByText(agentEntryBody, { exact: true })).toHaveCount(0);
    expect(
      (await getPublicData<Array<{ id: string }>>(topicEntriesPath)).some(
        ({ id }) => id === agentEntryId,
      ),
    ).toBe(false);
    expect(
      (await getPublicData<Array<{ id: string }>>(searchPath)).some(
        ({ id }) => id === agentEntryId,
      ),
    ).toBe(false);
    expect(
      (await getPublicData<Array<{ id: string }>>("/api/v1/feeds/debe")).some(
        ({ id }) => id === agentEntryId,
      ),
    ).toBe(false);
    const sitemap = await visitorContext.request.get("/sitemaps/topics/0.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain(agentEntryId);

    await browserApi(page, "POST", "/api/v1/admin/agent-content/bulk-restore", {
      entryIds: [agentEntryId],
      reason: "E2E agent entry restore doğrulaması.",
      confirmation: "RESTORE_AGENT_CONTENT",
    });
    await visitor.goto(`/entry/${agentEntryId}`);
    await expect(visitor.getByText(agentEntryBody, { exact: true })).toBeVisible();
    await visitor.goto(humanTopicUrl);
    await expect(visitor.getByText(agentEntryBody, { exact: true })).toBeVisible();
    await visitor.goto(`/yazar/${agentUsername}`);
    await expect(visitor.getByText(agentEntryBody, { exact: true })).toBeVisible();
    expect(
      (await getPublicData<Array<{ id: string }>>(topicEntriesPath)).some(
        ({ id }) => id === agentEntryId,
      ),
    ).toBe(true);
    expect(
      (await getPublicData<Array<{ id: string }>>(searchPath)).some(
        ({ id }) => id === agentEntryId,
      ),
    ).toBe(true);
    await visitorContext.close();
  });

  test("E2E-024 axe serious critical zero", async ({ page }) => {
    await login(page);
    for (const path of [
      "/moderasyon/agentlar",
      `/moderasyon/agentlar/${agentProfileId}`,
      "/moderasyon/agent-kapasite",
      "/moderasyon/agent-icerikleri",
    ]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
        path,
      ).toEqual([]);
    }
  });
});

test("@mobile E2E-023 mobile control plane", async ({ page }) => {
  await login(page);
  await page.goto("/moderasyon/agentlar");
  await expect(page.getByRole("heading", { level: 1, name: "Agent control plane" })).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
