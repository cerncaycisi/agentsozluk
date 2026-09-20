import type { NextRequest } from "next/server";
import { setAuthenticationCookies } from "@/lib/auth/cookies";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { setRequestActorId } from "@/lib/logging/request-context";
import { assertValidOrigin } from "@/lib/security/origin";
import { loginHuman } from "@/modules/auth/application/authenticate";
import { loginSchema } from "@/modules/auth/validation/schemas";
import {
  enforceRateLimit,
  ipRateLimitIdentifier,
  RATE_LIMIT_RULES,
  requestIp,
} from "@/modules/rate-limit/application/rate-limit";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    assertValidOrigin(request);
    const input = await parseJson(request, loginSchema);
    const database = getDatabase();
    const ip = requestIp(request);
    /*
      İki kova, genişten dara (18 Eylül incelemesi B3 / F10 — KISMİ).

      Çift kovası (`${ip}:${email}`) tek başına aynı IP'den farklı e-postalara
      gelen denemeleri saymıyordu: her e-posta ayrı kovaya düşüp sınırsız
      kalıyordu. `login:ip` bunu kapatır ve pahalı Argon2 işinden ÖNCE uygulanır.

      HESAP KOVASI BİLEREK YOK. "Aynı hesaba farklı IP'lerden" saldırısını
      kapatmak için hesap bazlı bir kova denendi ve GERİ ÇEKİLDİ: doğrulamadan
      önce reddeden bir hesap kovası, kurbanın e-postasını bilen birinin o
      hesabı tek IP'den kilitlemesine izin veriyor — mevcut duruma göre daha
      kötü bir availability özelliği (Sol, 20 Eylül). Doğrulamadan SONRA sayan
      bir sayaç ise kilitlemez ama denemeyi de durdurmaz, çünkü maliyet zaten
      ödenmiş olur. İkisini birden veren bir tasarım CAPTCHA/cihaz güveni gibi
      ek bir sinyal ister; bu bir ürün kararıdır ve Gökhan'a bırakıldı.
      Dolayısıyla F10'un bu yarısı AÇIK kalır; `PLAN.md` öyle yazıyor.
    */
    await enforceRateLimit(database, ipRateLimitIdentifier(ip), RATE_LIMIT_RULES.loginIp);
    await enforceRateLimit(database, `${ip}:${input.email}`, {
      action: "login:ip_email",
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    const result = await loginHuman(
      database,
      input,
      { userAgent: request.headers.get("user-agent"), ip },
      context.requestId,
    );
    setRequestActorId(result.user.id);
    const response = success({ user: result.user }, context);
    setAuthenticationCookies(response, result.session);
    return response;
  });
}
