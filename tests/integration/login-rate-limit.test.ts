import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { getEnvironment } from "@/config/env";
import { hmacIdentifier } from "@/lib/security/crypto";
import { hashPassword } from "@/modules/auth/domain/password";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  18 Eylül incelemesi B3 / PLAN F10. Birim testi bu kapanışı kanıtlayamaz:
  `enforceRateLimit` mock'lanınca geriye yalnız "doğru adı çağırdım" kalır.
  Burada gerçek PostgreSQL, gerçek kova sayacı, gerçek 429 ve gerçek
  `Retry-After` ölçülüyor.

  Kapatılan açık: tek `${ip}:${email}` kovası aynı IP'den farklı e-postalara
  gelen denemeleri saymıyordu — her e-posta ayrı kovaya düşüp sınırsız
  kalıyordu (hesap sayma / kullanıcı adı keşfi).
*/

const IP = "198.51.100.42";

function loginRequest(email: string) {
  return new NextRequest("http://127.0.0.1:3000/api/v1/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:3000",
      "x-forwarded-for": IP,
    },
    body: JSON.stringify({ email, password: "Yanlış-Şifre-2026" }),
  });
}

/*
  Oran sınırı 15 dk'lık SABİT pencere kullanır (fixedWindow, çağa hizalı). Bu
  testler kovayı birkaç saniyede doldurur; pencere tam o sırada dönerse sayaç
  sıfırlanır ve 31. istek 429 yerine 401 alır. 22 Eylül'de iki kez oldu (00:00
  ve 07:30 UTC). Sınıra 60 sn'den az kaldıysa sınırı geçene kadar beklenir.
*/
const LOGIN_PENCERESI_MS = 15 * 60 * 1000;
const PENCERE_PAYI_MS = 60 * 1000;

async function pencereSinirindanUzaklas() {
  const kalan = LOGIN_PENCERESI_MS - (Date.now() % LOGIN_PENCERESI_MS);
  if (kalan < PENCERE_PAYI_MS) await new Promise((coz) => setTimeout(coz, kalan + 1000));
}

beforeEach(async () => {
  await resetIntegrationDatabase();
  await pencereSinirindanUzaklas();
}, PENCERE_PAYI_MS + 30_000);

afterAll(async () => {
  await closeIntegrationDatabase();
});

describe("giriş oran sınırı — gerçek veritabanı", () => {
  it("aynı IP'den farklı e-postalar tek kovada toplanır ve 31. istek 429 alır", async () => {
    // Otuz farklı e-posta: eski düzende otuz ayrı kova, yani sınırsız.
    for (let sayac = 0; sayac < 30; sayac += 1) {
      const yanit = await loginRoute(loginRequest(`yok-${sayac}@integration.test`));
      expect(yanit.status).toBe(401);
    }

    const otuzBirinci = await loginRoute(loginRequest("yok-30@integration.test"));
    expect(otuzBirinci.status).toBe(429);
    await expect(otuzBirinci.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(Number(otuzBirinci.headers.get("Retry-After"))).toBeGreaterThan(0);

    const kova = await integrationDatabase.rateLimitBucket.findFirst({
      where: { action: "login:ip" },
    });
    expect(kova).toMatchObject({ count: 31 });

    // Kimlik HMAC'lenerek saklanır: ham IP veritabanına girmez.
    expect(kova?.keyHash).toBe(hmacIdentifier(getEnvironment().APP_SECRET, `ip:${IP}`));
    expect(JSON.stringify(kova)).not.toContain(IP);
  });

  it("IP kovası dolduğunda şifre doğrulaması hiç çalışmaz", async () => {
    const sifre = "Doğru-Şifre-2026";
    await integrationDatabase.user.create({
      data: {
        kind: "HUMAN",
        role: "USER",
        status: "ACTIVE",
        email: "kurban@integration.test",
        emailNormalized: "kurban@integration.test",
        username: "kurban",
        usernameNormalized: "kurban",
        displayName: "Kurban",
        passwordHash: await hashPassword(sifre),
        termsVersion: "1.0",
        termsAcceptedAt: new Date(),
      },
    });

    for (let sayac = 0; sayac < 30; sayac += 1) {
      await loginRoute(loginRequest(`dolduran-${sayac}@integration.test`));
    }

    // Kova dolu: DOĞRU şifreyle bile 429. Bu, IP bazlı sınırın kabul edilen
    // bedeli; paylaşımlı NAT arkasındaki kullanıcı da etkilenir.
    const dogruSifreyle = new NextRequest("http://127.0.0.1:3000/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
        "x-forwarded-for": IP,
      },
      body: JSON.stringify({ email: "kurban@integration.test", password: sifre }),
    });
    const yanit = await loginRoute(dogruSifreyle);
    expect(yanit.status).toBe(429);
    expect(await integrationDatabase.session.count()).toBe(0);
  });

  it("farklı IP aynı hesaba erişebilir — hesap bazlı kilit YOKTUR", async () => {
    const sifre = "Doğru-Şifre-2026";
    await integrationDatabase.user.create({
      data: {
        kind: "HUMAN",
        role: "USER",
        status: "ACTIVE",
        email: "hedef@integration.test",
        emailNormalized: "hedef@integration.test",
        username: "hedef",
        usernameNormalized: "hedef",
        displayName: "Hedef",
        passwordHash: await hashPassword(sifre),
        termsVersion: "1.0",
        termsAcceptedAt: new Date(),
      },
    });

    // Saldırgan tek IP'den aynı hesabı yirmi kez dener.
    for (let sayac = 0; sayac < 20; sayac += 1) {
      await loginRoute(loginRequest("hedef@integration.test"));
    }

    // Kurban BAŞKA bir IP'den girebilmeli. Hesap bazlı kova eklenseydi burası
    // 429 olurdu ve saldırgan kurbanı kendi hesabından kilitlerdi.
    const baskaIp = new NextRequest("http://127.0.0.1:3000/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
        "x-forwarded-for": "203.0.113.9",
      },
      body: JSON.stringify({ email: "hedef@integration.test", password: sifre }),
    });
    const yanit = await loginRoute(baskaIp);
    expect(yanit.status).toBe(200);
  });
});
