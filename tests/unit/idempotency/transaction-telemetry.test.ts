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

function bekle(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function sahteIstemci(davranis: {
  kilitGecikmesiMs?: number;
  isGecikmesiMs?: number;
  commitGecikmesiMs?: number;
  callbackCalismaz?: boolean;
  hata?: unknown;
}) {
  const tx = { $executeRaw: vi.fn(async () => 1) };
  return {
    $transaction: vi.fn(async (cb: Callback) => {
      if (davranis.kilitGecikmesiMs) await bekle(davranis.kilitGecikmesiMs);
      if (davranis.callbackCalismaz) throw davranis.hata;
      const sonuc = await cb(tx);
      if (davranis.isGecikmesiMs) await bekle(davranis.isGecikmesiMs);
      if (davranis.commitGecikmesiMs) await bekle(davranis.commitGecikmesiMs);
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
  it("acquireMs, activeMs ve totalMs'i birbirinden ayırır", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    const istemci = sahteIstemci({
      kilitGecikmesiMs: 40,
      isGecikmesiMs: 30,
      commitGecikmesiMs: 50,
    });
    await withIdempotencyLock(istemci as never, "kapsam", async () => "tamam", {
      label: "runtime.lease",
    });
    const kayit = logMock.info.mock.calls[0]?.[0];
    // Callback'ten önceki 40 ms acquire'a, sonraki 80 ms (iş + commit) active'e düşer.
    expect(kayit.acquireMs).toBeGreaterThanOrEqual(35);
    expect(kayit.acquireMs).toBeLessThan(75);
    expect(kayit.activeMs).toBeGreaterThanOrEqual(75);
    expect(kayit.totalMs).toBeGreaterThanOrEqual(115);
    expect(Math.abs(kayit.totalMs - (kayit.acquireMs + kayit.activeMs))).toBeLessThanOrEqual(2);
  });

  it("callback hiç başlamadıysa acquireMs ve activeMs null olur", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    const hata = Object.assign(new Error("bağlantı yok"), { code: "P1001" });
    const istemci = sahteIstemci({ kilitGecikmesiMs: 20, callbackCalismaz: true, hata });
    await expect(
      withIdempotencyLock(istemci as never, "kapsam", async () => "x", { label: "runtime.lease" }),
    ).rejects.toBe(hata);
    const kayit = logMock.info.mock.calls[0]?.[0];
    expect(kayit).toMatchObject({
      outcome: "failed",
      errorCode: "P1001",
      acquireMs: null,
      activeMs: null,
    });
    expect(kayit.totalMs).toBeGreaterThanOrEqual(15);
  });

  it("okunurken fırlatan hata nesnesini bile aynen yukarı taşır", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    // Sol'un bulgusu: iptal edilmiş Proxy'de `code` ve `instanceof` TypeError fırlatır.
    const { proxy, revoke } = Proxy.revocable(new Error("iptal"), {});
    revoke();
    const istemci = sahteIstemci({ hata: proxy });
    const sonuc = await withIdempotencyLock(istemci as never, "kapsam", async () => "x", {
      label: "runtime.lease",
    }).then(
      () => "RESOLVED",
      (error: unknown) => (error === proxy ? "AYNI" : "DEGISTI"),
    );
    expect(sonuc).toBe("AYNI");
  });
});
