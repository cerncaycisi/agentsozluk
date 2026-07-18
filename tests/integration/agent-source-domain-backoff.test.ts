import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inTransaction } from "@/lib/db/transaction";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { createAgent, createAgentSchema, sourceFailureBackoffMs } from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import {
  getRuntimePerceptionRecords,
  storeRuntimeSourceResult,
} from "@/modules/agents/repository/runtime";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

function actor(adminId: string): ActorContext {
  return {
    actorId: adminId,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createAdmin() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `source-domain-${suffix}@integration.test`,
      emailNormalized: `source-domain-${suffix}@integration.test`,
      username: `source_domain_${suffix.slice(0, 12)}`,
      usernameNormalized: `source_domain_${suffix.slice(0, 12)}`,
      displayName: "Source domain admin",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("agent source domain backoff with PostgreSQL", () => {
  it("shares consecutive failures across sibling URLs and resets the domain on success", async () => {
    const admin = await createAdmin();
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({ persona: originalPersonaPack.personas[0] }),
    );
    const run = await integrationDatabase.agentRun.create({
      data: {
        agentProfileId: created.agent.profile.id,
        runType: "SOURCE_REFRESH",
        runStatus: "RUNNING",
        queuePriority: "SOURCE_REFRESH",
        trigger: "DOMAIN_BACKOFF_FIXTURE",
        personaVersionId: created.agent.personaVersion.id,
        idempotencyKey: randomUUID(),
        timeoutSeconds: 240,
        desiredEntryMin: 0,
        desiredEntryMax: 0,
      },
    });
    const domain = "shared-backoff.integration.test";
    const sources = await Promise.all(
      ["feed-a", "feed-b"].map((path) =>
        integrationDatabase.agentSource.create({
          data: {
            agentProfileId: created.agent.profile.id,
            url: `https://${domain}/${path}`,
            normalizedDomain: domain,
            sourceType: "HTML",
            status: "SEED",
            topics: ["testing"],
            trustScore: 0.8,
            interestScore: 0.8,
            noveltyScore: 0.5,
            usefulnessScore: 0.5,
            addedByOrigin: "ADMIN",
          },
        }),
      ),
    );
    const firstFailureAt = new Date("2026-07-18T10:00:00.000Z");
    const secondFailureAt = new Date("2026-07-18T10:01:00.000Z");
    const store = (sourceId: string, now: Date, errorCode?: string) =>
      inTransaction(integrationDatabase, (transaction) =>
        storeRuntimeSourceResult(transaction, {
          sourceId,
          runId: run.id,
          agentProfileId: created.agent.profile.id,
          items: [],
          topics: [],
          now,
          ...(errorCode ? { errorCode } : {}),
        }),
      );

    const firstFailure = await store(sources[0]!.id, firstFailureAt, "SOURCE_HTTP_503");
    expect(firstFailure.changes).toHaveLength(2);
    expect(firstFailure.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: sources[0]!.id,
          normalizedDomain: domain,
          before: expect.objectContaining({ consecutiveFailures: 0, lastFetchedAt: null }),
          after: expect.objectContaining({
            consecutiveFailures: 1,
            lastFetchedAt: firstFailureAt,
          }),
        }),
        expect.objectContaining({
          sourceId: sources[1]!.id,
          before: expect.objectContaining({ consecutiveFailures: 0 }),
          after: expect.objectContaining({ consecutiveFailures: 1 }),
        }),
      ]),
    );
    const secondFailure = await store(sources[1]!.id, secondFailureAt, "SOURCE_HTTP_503");
    expect(secondFailure.changes).toHaveLength(2);
    expect(secondFailure.changes.map(({ after }) => after.consecutiveFailures)).toEqual([2, 2]);

    const failedDomain = await integrationDatabase.agentSource.findMany({
      where: { agentProfileId: created.agent.profile.id, normalizedDomain: domain },
      orderBy: { url: "asc" },
      select: { consecutiveFailures: true },
    });
    expect(failedDomain).toEqual([{ consecutiveFailures: 2 }, { consecutiveFailures: 2 }]);
    expect(sourceFailureBackoffMs(failedDomain[0]!.consecutiveFailures)).toBe(120_000);

    const perception = await inTransaction(integrationDatabase, (transaction) =>
      getRuntimePerceptionRecords(transaction, {
        agentProfileId: created.agent.profile.id,
        agentUserId: created.agent.user.id,
        now: new Date("2026-07-18T10:01:30.000Z"),
        includeSources: true,
        sourceFetchLimit: 8,
      }),
    );
    expect(
      perception.sources
        .filter(({ normalizedDomain }) => normalizedDomain === domain)
        .map(({ domainConsecutiveFailures, domainLastAttemptAt }) => ({
          domainConsecutiveFailures,
          domainLastAttemptAt,
        })),
    ).toEqual([
      { domainConsecutiveFailures: 2, domainLastAttemptAt: secondFailureAt },
      { domainConsecutiveFailures: 2, domainLastAttemptAt: secondFailureAt },
    ]);

    const recoveredAt = new Date("2026-07-18T10:04:00.000Z");
    const recovered = await store(sources[0]!.id, recoveredAt);
    expect(recovered.changes).toHaveLength(2);
    expect(recovered.changes.map(({ after }) => after.consecutiveFailures)).toEqual([0, 0]);
    await expect(
      integrationDatabase.agentSource.findMany({
        where: { agentProfileId: created.agent.profile.id, normalizedDomain: domain },
        orderBy: { url: "asc" },
        select: { consecutiveFailures: true },
      }),
    ).resolves.toEqual([{ consecutiveFailures: 0 }, { consecutiveFailures: 0 }]);
  });
});
