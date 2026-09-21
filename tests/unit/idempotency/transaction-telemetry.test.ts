import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Lease transaction süresi telemetrisi (21 Eylül 2026, Astra'yla tasarlandı).
  19 Eylül kesintisi lease transaction'ının Prisma'nın 5 sn sınırını aşmasıydı;
  bu kayıt o sınıra ne kadar yaklaştığımızı görmenin tek yolu. Burada Astra'nın
  saydığı dört kritik davranış sabitleniyor.
*/

const logMock = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: logMock.info },
}));

type Callback = (tx: unknown) => Promise<unknown>;

function sahteIstemci(davranis: { commitGecikmesiMs?: number; hata?: Error & { code?: string } }) {
  const tx = { $executeRaw: vi.fn(async () => 1) };
  return {
    $transaction: vi.fn(async (cb: Callback) => {
      const sonuc = await cb(tx);
      if (davranis.commitGecikmesiMs)
        await new Promise((r) => setTimeout(r, davranis.commitGecikmesiMs));
      if (davranis.hata) throw davranis.hata;
      return sonuc;
    }),
  };
}

describe("transaction süresi telemetrisi", () => {
  beforeEach(() => {
    logMock.info.mockReset();
  });

  it("commit beklemesini activeMs'e dahil eder", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    const istemci = sahteIstemci({ commitGecikmesiMs: 60 });
    await withIdempotencyLock(istemci as never, "kapsam", async () => "tamam", {
      label: "runtime.lease",
    });
    const kayit = logMock.info.mock.calls[0]?.[0];
    expect(kayit).toMatchObject({
      event: "db.transaction.duration",
      label: "runtime.lease",
      outcome: "committed",
      timeoutMs: 5000,
    });
    // Callback anında bitti; 60 ms yalnız commit aşamasında. Ölçüm onu görmeli.
    expect(kayit.activeMs).toBeGreaterThanOrEqual(55);
  });

  it("başarısız transaction'ı güvenli hata koduyla kaydeder ve hatayı aynen fırlatır", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    const p2028 = Object.assign(new Error("Transaction already closed"), { code: "P2028" });
    const istemci = sahteIstemci({ hata: p2028 });
    await expect(
      withIdempotencyLock(istemci as never, "kapsam", async () => "x", { label: "runtime.lease" }),
    ).rejects.toBe(p2028);
    expect(logMock.info.mock.calls[0]?.[0]).toMatchObject({
      outcome: "failed",
      errorCode: "P2028",
    });
  });

  it("loglama hatası transaction'ın sonucunu değiştirmez", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    logMock.info.mockImplementation(() => {
      throw new Error("log hedefi yok");
    });
    const istemci = sahteIstemci({});
    await expect(
      withIdempotencyLock(istemci as never, "kapsam", async () => "sonuç", {
        label: "runtime.lease",
      }),
    ).resolves.toBe("sonuç");
  });

  it("etiket verilmeyen çağrıyı hiç loglamaz", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    await withIdempotencyLock(sahteIstemci({}) as never, "kapsam", async () => "x");
    expect(logMock.info).not.toHaveBeenCalled();
  });
});
