import { describe, expect, it, vi } from "vitest";
import type { DatabaseExecutor } from "@/lib/db/types";
import { assertPublicWriteReadiness } from "@/modules/agents/application/action-executor";

describe("agent public-write readiness gate", () => {
  const executor = {} as DatabaseExecutor;

  it("maps a failed readiness probe to a stable 503 rejection before public execution", async () => {
    const checkReadiness = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(
      assertPublicWriteReadiness("CREATE_ENTRY", executor, checkReadiness),
    ).rejects.toMatchObject({
      code: "SERVICE_NOT_READY",
      status: 503,
      message: "Servis hazır değil; public agent action çalıştırılmadı.",
    });
    expect(checkReadiness).toHaveBeenCalledOnce();
    expect(checkReadiness).toHaveBeenCalledWith(executor);
  });

  it("does not require readiness for internal-only actions", async () => {
    const checkReadiness = vi.fn().mockRejectedValue(new Error("must not be called"));

    await expect(
      assertPublicWriteReadiness("UPDATE_BELIEF", executor, checkReadiness),
    ).resolves.toBeUndefined();
    expect(checkReadiness).not.toHaveBeenCalled();
  });
});
