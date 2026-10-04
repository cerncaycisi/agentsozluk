import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getEnvironment } from "@/config/env";
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME } from "@/config/app";
import { createOpaqueToken, sha256 } from "@/lib/security/crypto";
import type { ActorContext } from "@/modules/auth/domain/actor";
import {
  createUkte,
  withdrawUkte,
  setUkteVisibility,
  listPublicUktes,
  listAdminUktes,
} from "@/modules/uktes/application/uktes";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import { GET as listRoute, POST as createRoute } from "@/app/api/v1/uktes/route";
import { POST as withdrawRoute } from "@/app/api/v1/uktes/[ukteId]/withdraw/route";
import { POST as visibilityRoute } from "@/app/api/v1/admin/uktes/[ukteId]/visibility/route";
import { GET as adminListRoute } from "@/app/api/v1/admin/uktes/route";
import {
  integrationDatabase as db,
  resetIntegrationDatabase,
  closeIntegrationDatabase,
} from "./database";

async function fixture() {
  async function user(
    name: string,
    role: "USER" | "ADMIN" = "USER",
    kind: "HUMAN" | "AGENT" = "HUMAN",
  ) {
    return db.user.create({
      data: {
        username: name,
        usernameNormalized: name,
        displayName: name,
        email: `${name}@integration.test`,
        emailNormalized: `${name}@integration.test`,
        passwordHash: "unused",
        kind,
        role,
        loginDisabled: kind === "AGENT",
        termsVersion: "test",
        termsAcceptedAt: new Date(),
      },
    });
  }
  const owner = await user("ukte_owner");
  const other = await user("ukte_other");
  const admin = await user("ukte_admin", "ADMIN");
  const actor = (id: string, role: "USER" | "ADMIN" = "USER"): ActorContext => ({
    actorId: id,
    actorKind: "HUMAN",
    actorRole: role,
    origin: "API",
    requestId: randomUUID(),
  });
  const ownerActor = actor(owner.id);
  const adminActor = actor(admin.id, "ADMIN");
  async function topic(title: string, status: "ACTIVE" | "HIDDEN" = "ACTIVE") {
    return db.topic.create({
      data: {
        title,
        normalizedTitle: normalizeTopicTitle(title),
        slug: createTopicSlug(title),
        status,
        createdById: owner.id,
      },
    });
  }
  async function requestFor(userId: string) {
    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    await db.session.create({
      data: {
        userId,
        tokenHash: sha256(sessionToken),
        csrfTokenHash: sha256(csrfToken),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const origin = new URL(getEnvironment().APP_URL).origin;
    return (path: string, body?: unknown, key = randomUUID()) =>
      new NextRequest(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
          "idempotency-key": key,
          cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
  }
  return { owner, other, admin, user, actor, ownerActor, adminActor, topic, requestFor };
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);
describe("explicit human ukte requests with PostgreSQL", () => {
  it("deduplicates concurrent normalized requests without creating topics, entries or public identities", async () => {
    const f = await fixture();
    const before = [await db.topic.count(), await db.entry.count(), await db.user.count()];
    const results = await Promise.all([
      createUkte(db, f.ownerActor, { title: "  IŞIK   KİRLİLİĞİ  " }),
      createUkte(db, f.actor(f.other.id), { title: "ışık kirliliği" }),
    ]);
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(results.filter((row) => row.created)).toHaveLength(1);
    expect(await db.ukteRequest.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "ukte.created" } })).toBe(1);
    expect([await db.topic.count(), await db.entry.count(), await db.user.count()]).toEqual(before);
    const list = await listPublicUktes(db, {});
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).not.toHaveProperty("requestedById");
    expect(list.items[0]).not.toHaveProperty("targetKeys");
    expect(list.items[0]).not.toHaveProperty("version");
    expect(list.items[0]!.canWithdraw).toBe(false);
  });
  it("deduplicates canonical requests and blocks hidden variants in both directions", async () => {
    const f = await fixture();
    const requests = await Promise.all([
      createUkte(db, f.ownerActor, { title: "gece mavisi hakkında" }),
      createUkte(db, f.actor(f.other.id), { title: "gece mavisi nedir" }),
    ]);
    expect(new Set(requests.map((row) => row.id)).size).toBe(1);
    await setUkteVisibility(db, f.adminActor, requests[0]!.id, {
      hidden: true,
      expectedVersion: 1,
      reason: "Somut inceleme için gizlendi.",
    });
    for (const title of ["gece mavisi", "gece mavisi?", "gece mavisi hakkında"])
      await expect(createUkte(db, f.actor(f.other.id), { title })).rejects.toMatchObject({
        code: "UKTE_UNAVAILABLE",
      });
    const plain = await createUkte(db, f.ownerActor, { title: "güneş saati" });
    await setUkteVisibility(db, f.adminActor, plain.id, {
      hidden: true,
      expectedVersion: 1,
      reason: "Ayrı inceleme için gizlendi.",
    });
    await expect(
      createUkte(db, f.actor(f.other.id), { title: "güneş saati nedir" }),
    ).rejects.toMatchObject({ code: "UKTE_UNAVAILABLE" });
    expect((await listPublicUktes(db, {})).items).toEqual([]);
  });
  it("does not match unrelated non-Latin titles through the fallback slug", async () => {
    const f = await fixture();
    await f.topic("東京");
    const row = await createUkte(db, f.ownerActor, { title: "京都" });
    expect(await db.ukteRequest.findUnique({ where: { id: row.id } })).toMatchObject({ slug: "" });
    const list = await listPublicUktes(db, {});
    expect(list.items.map((item) => item.title)).toEqual(["京都"]);
    await expect(createUkte(db, f.ownerActor, { title: "東京" })).rejects.toMatchObject({
      code: "UKTE_UNAVAILABLE",
    });
    await f.topic("başlık");
    await expect(createUkte(db, f.ownerActor, { title: "baslik" })).rejects.toMatchObject({
      code: "UKTE_UNAVAILABLE",
    });
  });
  it("carries reserved route-like titles through the dedicated composer query", async () => {
    const f = await fixture();
    const titles = ["ac", randomUUID(), "başlık--123"];
    for (const title of titles) await createUkte(db, f.ownerActor, { title });
    for (const item of (await listPublicUktes(db, {})).items) {
      const url = new URL(item.writeUrl, "http://localhost");
      expect(url.pathname).toBe("/baslik/ac");
      expect(url.searchParams.get("title")).toBe(item.title);
    }
  });
  it.each(["approval", "suspension", "agent"])(
    "rejects %s using current database authority even with a forged HUMAN actor",
    async (kind) => {
      const f = await fixture();
      if (kind === "approval")
        await db.user.update({ where: { id: f.owner.id }, data: { writerApproved: false } });
      if (kind === "suspension")
        await db.user.update({ where: { id: f.owner.id }, data: { status: "SUSPENDED" } });
      const id = kind === "agent" ? (await f.user("ukte_agent", "USER", "AGENT")).id : f.owner.id;
      await expect(createUkte(db, f.actor(id), { title: "istek başlığı" })).rejects.toMatchObject({
        status: 403,
      });
      expect(await db.ukteRequest.count()).toBe(0);
    },
  );
  it("withdraws only the owner's request and allows a later independent request", async () => {
    const f = await fixture();
    const row = await createUkte(db, f.ownerActor, { title: "gece trenleri" });
    await expect(withdrawUkte(db, f.actor(f.other.id), row.id)).rejects.toMatchObject({
      code: "UKTE_NOT_FOUND",
    });
    await db.user.update({ where: { id: f.owner.id }, data: { writerApproved: false } });
    // Onay kaldırılması geri çekme hakkını kaldırmaz; hesabın aktif olması gerekir.
    expect(await withdrawUkte(db, f.ownerActor, row.id)).toEqual({ withdrawn: true });
    expect(await withdrawUkte(db, f.ownerActor, row.id)).toEqual({ withdrawn: true });
    expect((await listPublicUktes(db, {})).items).toEqual([]);
    const next = await createUkte(db, f.actor(f.other.id), { title: "gece trenleri" });
    expect(next.created).toBe(true);
    expect(next.id).not.toBe(row.id);
    expect(await db.ukteRequest.findUnique({ where: { id: row.id } })).toMatchObject({
      status: "WITHDRAWN",
      requestedById: f.owner.id,
    });
    expect(await db.auditLog.count({ where: { action: "ukte.withdrawn" } })).toBe(1);
  });
  it.each(["ACTIVE", "HIDDEN", "alias", "slug", "canonical"])(
    "does not expose or request an existing target through %s",
    async (kind) => {
      const f = await fixture();
      let title = "sessiz okuma";
      if (kind === "alias") {
        const topic = await f.topic("başka başlık", "HIDDEN");
        await db.topicAlias.create({
          data: {
            topicId: topic.id,
            title,
            normalizedTitle: normalizeTopicTitle(title),
            slug: createTopicSlug(title),
          },
        });
      } else if (kind === "slug") {
        await f.topic("j-cut");
        title = "j cut";
      } else if (kind === "canonical") {
        await f.topic("sessiz okuma");
        title = "sessiz okuma hakkında";
      } else await f.topic(title, kind as "ACTIVE" | "HIDDEN");
      await expect(createUkte(db, f.ownerActor, { title })).rejects.toMatchObject({
        code: "UKTE_UNAVAILABLE",
        status: 409,
      });
      expect(await db.ukteRequest.count()).toBe(0);
    },
  );
  it("removes fulfilled titles from the read-only queue and does not resurrect them when hidden", async () => {
    const f = await fixture();
    const request = await createUkte(db, f.ownerActor, { title: "yeni bir kavram" });
    expect((await listPublicUktes(db, { viewerId: f.owner.id })).items[0]?.canWithdraw).toBe(true);
    const topic = await f.topic("yeni bir kavram");
    expect((await listPublicUktes(db, {})).items).toEqual([]);
    await db.topic.update({ where: { id: topic.id }, data: { status: "HIDDEN" } });
    expect((await listPublicUktes(db, {})).items).toEqual([]);
    expect(await db.ukteRequest.findUnique({ where: { id: request.id } })).toMatchObject({
      status: "OPEN",
      version: 1,
    });
    // GET/list içerik veya durum değiştirmez; tarihçe admin görünümünde kalır.
    expect((await listAdminUktes(db, f.adminActor, { status: "OPEN" })).items).toHaveLength(1);
  });
  it("hides and restores with fresh HUMAN ADMIN authority, CAS and an immutable audit trail", async () => {
    const f = await fixture();
    const row = await createUkte(db, f.ownerActor, { title: "denetlenen istek" });
    const input = { hidden: true, expectedVersion: 1, reason: "Somut moderasyon gerekçesi." };
    await expect(
      setUkteVisibility(db, { ...f.ownerActor, actorRole: "ADMIN" }, row.id, input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setUkteVisibility(db, f.adminActor, row.id, input);
    expect((await listPublicUktes(db, {})).items).toEqual([]);
    await expect(
      createUkte(db, f.actor(f.other.id), { title: "DENETLENEN İSTEK" }),
    ).rejects.toMatchObject({ code: "UKTE_UNAVAILABLE" });
    await expect(withdrawUkte(db, f.ownerActor, row.id)).rejects.toMatchObject({
      code: "UKTE_NOT_FOUND",
    });
    await expect(
      setUkteVisibility(db, f.adminActor, row.id, { ...input, hidden: false }),
    ).rejects.toMatchObject({ code: "UKTE_CONFLICT" });
    expect((await listAdminUktes(db, f.adminActor, { status: "HIDDEN" })).items).toHaveLength(1);
    await setUkteVisibility(db, f.adminActor, row.id, {
      ...input,
      hidden: false,
      expectedVersion: 2,
    });
    expect((await listPublicUktes(db, {})).items).toHaveLength(1);
    expect((await listPublicUktes(db, {})).items[0]).not.toHaveProperty("version");
    expect((await listAdminUktes(db, f.adminActor, { status: "OPEN" })).items[0]?.version).toBe(3);
    expect(
      await db.auditLog.count({ where: { action: { in: ["ukte.hidden", "ukte.restored"] } } }),
    ).toBe(2);
    await db.user.update({ where: { id: f.admin.id }, data: { role: "USER" } });
    await expect(listAdminUktes(db, f.adminActor, { status: "HIDDEN" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("does not restore a hidden request after its target has become a topic", async () => {
    const f = await fixture();
    const row = await createUkte(db, f.ownerActor, { title: "açılan istek" });
    await setUkteVisibility(db, f.adminActor, row.id, {
      hidden: true,
      expectedVersion: 1,
      reason: "İnceleme için gizlendi.",
    });
    await f.topic("açılan istek");
    await expect(
      setUkteVisibility(db, f.adminActor, row.id, {
        hidden: false,
        expectedVersion: 2,
        reason: "Tekrar incelendi.",
      }),
    ).rejects.toMatchObject({ code: "UKTE_UNAVAILABLE" });
  });
  it("paginates stably and keeps already published requests after account approval changes", async () => {
    const f = await fixture();
    for (let i = 0; i < 27; i += 1)
      await createUkte(db, f.ownerActor, { title: `okunacak konu ${i}` }, new Date(Date.now() + i));
    await db.user.update({ where: { id: f.owner.id }, data: { writerApproved: false } });
    const first = await listPublicUktes(db, {});
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).not.toBeNull();
    const next = await listPublicUktes(db, { before: first.nextCursor! });
    expect(next.items).toHaveLength(2);
    expect(next.nextCursor).toBeNull();
    expect(new Set([...first.items, ...next.items].map((row) => row.id)).size).toBe(27);
    expect((await listPublicUktes(db, { before: randomUUID() })).items).toEqual([]);
  });
  it("enforces CSRF, fresh approval and suspension on HTTP idempotent replays", async () => {
    const f = await fixture();
    const request = await f.requestFor(f.owner.id);
    const key = randomUUID();
    const path = "/api/v1/uktes";
    const input = { title: "http üzerinden istek" };
    const wrong = request(path, input);
    wrong.headers.set("origin", "https://untrusted.invalid");
    expect((await createRoute(wrong)).status).toBe(403);
    const first = await createRoute(request(path, input, key));
    expect(first.status).toBe(200);
    const id = (await first.json()).data.id as string;
    const replay = await createRoute(request(path, input, key));
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    expect(await db.ukteRequest.count()).toBe(1);
    await db.user.update({ where: { id: f.owner.id }, data: { writerApproved: false } });
    expect((await createRoute(request(path, input, key))).status).toBe(403);
    const withdraw = await withdrawRoute(request(`${path}/${id}/withdraw`, {}), {
      params: Promise.resolve({ ukteId: id }),
    });
    expect(withdraw.status).toBe(200);
    await db.user.update({ where: { id: f.owner.id }, data: { status: "SUSPENDED" } });
    expect(
      (
        await withdrawRoute(request(`${path}/${id}/withdraw`, {}), {
          params: Promise.resolve({ ukteId: id }),
        })
      ).status,
    ).toBe(403);
  });
  it("separates public lists from authenticated admin visibility routes", async () => {
    const f = await fixture();
    const row = await createUkte(db, f.ownerActor, { title: "gizlenecek ukte" });
    const adminRequest = await f.requestFor(f.admin.id);
    const ownerRequest = await f.requestFor(f.owner.id);
    expect((await adminListRoute(ownerRequest("/api/v1/admin/uktes"))).status).toBe(403);
    const key = randomUUID();
    const input = { hidden: true, expectedVersion: 1, reason: "Somut inceleme gerekçesi." };
    const path = `/api/v1/admin/uktes/${row.id}/visibility`;
    const result = await visibilityRoute(adminRequest(path, input, key), {
      params: Promise.resolve({ ukteId: row.id }),
    });
    expect(result.status).toBe(200);
    expect(
      (await listRoute(new NextRequest(`${getEnvironment().APP_URL}/api/v1/uktes`))).status,
    ).toBe(200);
    const publicList = await listRoute(ownerRequest("/api/v1/uktes"));
    expect((await publicList.json()).data.items).toEqual([]);
    const privateList = await adminListRoute(adminRequest("/api/v1/admin/uktes?status=HIDDEN"));
    expect((await privateList.json()).data.items).toHaveLength(1);
    await db.user.update({ where: { id: f.admin.id }, data: { role: "USER" } });
    expect(
      (
        await visibilityRoute(adminRequest(path, input, key), {
          params: Promise.resolve({ ukteId: row.id }),
        })
      ).status,
    ).toBe(403);
  });
});
