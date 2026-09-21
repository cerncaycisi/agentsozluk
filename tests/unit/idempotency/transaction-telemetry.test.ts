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

/*
  Sahte saat: gerçek zamanlayıcı yok, süreler birebir doğrulanır (CI'da kırılgan
  olmaz — Sol, ikinci tur). Her aşama saati kendi içinde ilerletir.
*/
const saat = vi.hoisted(() => ({ simdi: 0 }));
vi.mock("node:perf_hooks", () => ({ performance: { now: () => saat.simdi } }));

type Callback = (tx: unknown) => Promise<unknown>;

function sahteIstemci(davranis: {
  baglantiMs?: number;
  advisoryKilitMs?: number;
  commitMs?: number;
  callbackCalismaz?: boolean;
  hata?: unknown;
}) {
  const tx = {
    $executeRaw: vi.fn(async () => {
      saat.simdi += davranis.advisoryKilitMs ?? 0;
      return 1;
    }),
  };
  return {
    $transaction: vi.fn(async (cb: Callback) => {
      saat.simdi += davranis.baglantiMs ?? 0;
      if (davranis.callbackCalismaz) throw davranis.hata;
      const sonuc = await cb(tx);
      saat.simdi += davranis.commitMs ?? 0;
      if (davranis.hata) throw davranis.hata;
      return sonuc;
    }),
  };
}

function isSuresi<T>(ms: number, deger: T) {
  return async () => {
    saat.simdi += ms;
    return deger;
  };
}

describe("transaction süresi telemetrisi", () => {
  beforeEach(() => {
    logMock.info.mockReset();
    saat.simdi = 1_000;
  });

  it("commit beklemesini activeMs'e dahil eder", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    const istemci = sahteIstemci({ commitMs: 60 });
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
    expect(kayit.activeMs).toBe(60);
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

  it("bağlantıyı acquire'a, advisory kilit + iş + commit'i active'e yazar", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    const istemci = sahteIstemci({ baglantiMs: 40, advisoryKilitMs: 10, commitMs: 50 });
    await withIdempotencyLock(istemci as never, "kapsam", isSuresi(30, "tamam"), {
      label: "runtime.lease",
    });
    // Advisory kilit ve lease işi 5 sn'lik transaction'ın içinde geçer; active'te olmalı.
    expect(logMock.info.mock.calls[0]?.[0]).toMatchObject({
      acquireMs: 40,
      activeMs: 10 + 30 + 50,
      totalMs: 40 + 10 + 30 + 50,
    });
  });

  it("callback hiç başlamadıysa acquireMs ve activeMs null olur", async () => {
    const { withIdempotencyLock } = await import("@/modules/idempotency/repository/idempotency");
    const hata = Object.assign(new Error("bağlantı yok"), { code: "P1001" });
    const istemci = sahteIstemci({ baglantiMs: 20, callbackCalismaz: true, hata });
    await expect(
      withIdempotencyLock(istemci as never, "kapsam", async () => "x", { label: "runtime.lease" }),
    ).rejects.toBe(hata);
    expect(logMock.info.mock.calls[0]?.[0]).toMatchObject({
      outcome: "failed",
      errorCode: "P1001",
      acquireMs: null,
      activeMs: null,
      totalMs: 20,
    });
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
