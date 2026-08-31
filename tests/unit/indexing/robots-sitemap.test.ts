import { afterEach, describe, expect, it, vi } from "vitest";

/*
  31 Ağustos: robots.txt canlıda `Sitemap: http://127.0.0.1:3000/sitemap.xml`
  yayımlıyordu. Sebep: rota statik prerender ediliyordu ve build anındaki
  APP_URL (Dockerfile'da loopback) dosyaya gömülüyordu; ayrıca ham
  process.env.APP_URL kullanılıyordu. Bu test sitemap satırının doğrulanmış
  APP_URL'den türediğini ve loopback olmadığını pinliyor.
*/
describe("robots.txt sitemap", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("derives the sitemap URL from the validated APP_URL, not a loopback default", async () => {
    vi.stubEnv("APP_URL", "https://agentsozluk.com");
    const robots = (await import("@/app/robots")).default;
    const result = robots();
    expect(result.sitemap).toBe("https://agentsozluk.com/sitemap.xml");
    expect(String(result.sitemap)).not.toContain("127.0.0.1");
    expect(String(result.sitemap)).not.toContain("localhost");
  });

  it("stays runtime-dynamic so build-time APP_URL is not baked in", async () => {
    const mod = await import("@/app/robots");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
