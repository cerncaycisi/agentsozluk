import { describe, expect, it, vi } from "vitest";
import {
  finalizeResetExecution,
  waitForResetGateSessions,
} from "@/modules/maintenance/domain/reset-execution-finalization";
describe("commit sonucu ve bounded control gate kapanışı", () => {
  it("ayrılmayan backend için beş saniye sonunda kapalı kalır", async () => {
    vi.useFakeTimers();
    try {
      const read = vi.fn().mockResolvedValue({ others: 1, pinned: 0, prepared: 0 });
      const rejected = expect(waitForResetGateSessions(read, true, null)).rejects.toThrow(
        "GREAT_RESET_CONTROL_CONNECTIONS_PRESENT",
      );
      await vi.advanceTimersByTimeAsync(5000);
      await rejected;
      expect(read).toHaveBeenCalledTimes(21);
    } finally {
      vi.useRealTimers();
    }
  });
  it("asenkron backend ayrılmasını bekler; başka backend'e karşı kill kullanmaz", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ others: 1, pinned: 0, prepared: 0 })
      .mockResolvedValue({ others: 0, pinned: 0, prepared: 0 });
    await expect(waitForResetGateSessions(read, true, null)).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("kapatma sırasında başka backend veya hazırlanmış işlem varsa hemen reddeder", async () => {
    const read = vi.fn().mockResolvedValue({ others: 1, pinned: 1, prepared: 0 });
    await expect(waitForResetGateSessions(read, false, 123)).rejects.toThrow(
      "GREAT_RESET_CONTROL_CONNECTIONS_PRESENT",
    );
    expect(read).toHaveBeenCalledTimes(1);
    await expect(
      waitForResetGateSessions(async () => ({ others: 0, pinned: 0, prepared: 1 }), true, null),
    ).rejects.toThrow();
  });
  it("reopen hata verse de başarılı COMMIT makbuzunu korur ve control bağlantısını kapatır", async () => {
    const result = { verified: true, operationId: "fixture" };
    const controlDisconnect = vi.fn().mockResolvedValue(undefined);
    await expect(
      finalizeResetExecution(
        async () => result,
        async () => {},
        async () => {
          throw new Error("gate");
        },
        controlDisconnect,
      ),
    ).resolves.toEqual({ result, connectionGate: "CLOSED_UNCERTAIN" });
    expect(controlDisconnect).toHaveBeenCalledTimes(1);
  });
  it("database disconnect hata verirse kapıyı açmaz; control cleanup yine çalışır", async () => {
    const reopen = vi.fn();
    const controlDisconnect = vi.fn();
    const final = await finalizeResetExecution(
      async () => ({ verified: true }),
      async () => {
        throw new Error("disconnect");
      },
      reopen,
      controlDisconnect,
    );
    expect(final.connectionGate).toBe("CLOSED_UNCERTAIN");
    expect(reopen).not.toHaveBeenCalled();
    expect(controlDisconnect).toHaveBeenCalledOnce();
  });
  it("belirsiz transaction sonucu hiçbir cleanup hatasıyla başarıya dönüşmez", async () => {
    const original = new Error("COMMIT_RESPONSE_LOST");
    const controlDisconnect = vi.fn();
    await expect(
      finalizeResetExecution(
        async () => {
          throw original;
        },
        async () => {},
        async () => {
          throw new Error("gate");
        },
        controlDisconnect,
      ),
    ).rejects.toBe(original);
    expect(controlDisconnect).toHaveBeenCalledOnce();
  });
});
