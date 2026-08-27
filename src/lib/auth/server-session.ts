import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { authenticateSession } from "@/modules/auth/application/sessions";

export async function currentPageSession() {
  const cookieStore = await cookies();
  return authenticateSession(getDatabase(), cookieStore.get(SESSION_COOKIE_NAME)?.value, {
    extendExpiration: false,
  });
}

export async function requirePageSession() {
  const session = await currentPageSession();
  if (!session) redirect("/giris?next=/");
  return session;
}

export async function requireModerationPage() {
  const session = await requirePageSession();
  if (
    session.user.status !== "ACTIVE" ||
    (session.user.role !== "MODERATOR" && session.user.role !== "ADMIN")
  )
    redirect("/yasak");
  return session;
}

/*
  Moderasyon sayfalarında iki ayrı kapı var ve ikincisi hata sayfasına düşüyordu.

  `requireModerationPage` yalnız ROLE bakıyor (MODERATOR/ADMIN) ve reddederse
  `/yasak`'a yönlendiriyor — doğru davranış. Ama sayfanın yüklediği veri ayrıca
  YETENEK istiyor (`FORMAT_MODERATOR`, `APPEAL_DECIDER`, `LEGAL_REVIEWER`) ve o
  kontrol `AppError(MODERATION_CAPABILITY_REQUIRED, 403)` fırlatıyor. Sunucu
  bileşeninde fırlatılan hata Next'in hata sınırına düşüyor, yani yetkisi
  olmayan moderatör "bu alan için yetkiniz yok" yerine beyaz hata sayfası
  görüyordu. Çökme değil, ama 403'ü 500 gibi gösteriyor.

  Bu sarmalayıcı yalnız o tek kodu `/yasak`'a çeviriyor. Başka her hata olduğu
  gibi yeniden fırlatılıyor — gerçek 500'ler görünmez olmamalı, ve Next'in
  kendi `redirect()`/`notFound()` sinyalleri de `AppError` olmadığı için
  dokunulmadan geçiyor.
*/
export async function withModerationCapability<T>(load: () => Promise<T> | T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AppError && error.code === "MODERATION_CAPABILITY_REQUIRED")
      redirect("/yasak");
    throw error;
  }
}

export async function requireAgentAdminPage() {
  const session = await requirePageSession();
  if (
    session.user.status !== "ACTIVE" ||
    session.user.kind !== "HUMAN" ||
    session.user.role !== "ADMIN"
  ) {
    redirect("/yasak");
  }
  return session;
}
