import { afterEach, describe, expect, it, vi } from "vitest";

/*
  `/indexnow-key.txt` yalnız üretim ortamındaki anahtarı yayımlar (12 Ekim 2026). Ortam önbelleğe
  alındığı için her senaryo modülü yeniden yükler.
*/
async function rota(anahtar: string | undefined) {
  vi.resetModules();
  if (anahtar === undefined) vi.stubEnv("INDEXNOW_KEY", undefined as unknown as string);
  else vi.stubEnv("INDEXNOW_KEY", anahtar);
  return (await import("@/app/indexnow-key.txt/route")).GET;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("IndexNow anahtar dosyası", () => {
  it("anahtar verilmemişse 404 döner", async () => {
    const GET = await rota(undefined);
    const yanit = GET();
    expect(yanit.status).toBe(404);
  });

  it("anahtarı düz metin olarak yayımlar", async () => {
    const GET = await rota("a1b2c3d4e5f60718");
    const yanit = GET();
    expect(yanit.status).toBe(200);
    expect(yanit.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await yanit.text()).toBe("a1b2c3d4e5f60718");
  });

  it("biçimi geçersiz anahtarı ortam doğrulamasında reddeder", async () => {
    const GET = await rota("kısa");
    expect(() => GET()).toThrow();
  });
});
