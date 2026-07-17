import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { runApi } from "@/lib/http/api";
import { logger } from "@/lib/logging/logger";
import {
  getRequestActorId,
  setRequestActorId,
  withRequestLogContext,
} from "@/lib/logging/request-context";

describe("request logging actor context", () => {
  it("keeps actor identity request-local across async work", async () => {
    expect(getRequestActorId()).toBeNull();
    await withRequestLogContext(async () => {
      setRequestActorId("actor-123");
      await Promise.resolve();
      expect(getRequestActorId()).toBe("actor-123");
    });
    expect(getRequestActorId()).toBeNull();
  });

  it("emits the authenticated actor in structured request logs", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    await runApi(new Request("http://localhost/api/v1/me"), async () => {
      setRequestActorId("actor-456");
      return NextResponse.json({ ok: true });
    });

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "actor-456", path: "/api/v1/me", status: 200 }),
      "request completed",
    );
    info.mockRestore();
  });
});
