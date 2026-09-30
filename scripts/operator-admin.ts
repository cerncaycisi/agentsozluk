import "./operator-cli-stderr-logs";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server";
import { z } from "zod";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/config/app";
import { getEnvironment } from "@/config/env";
import { getDatabase } from "@/lib/db/client";
import { issueSession } from "@/modules/auth/application/sessions";
import { operatorSessionLifetimeMs, operatorSessionUserAgent } from "@/modules/auth/domain/session";
import { revokeSession } from "@/modules/auth/repository/sessions";
import { resolveOperatorAdmin } from "./agent-operator";

/*
  Operatör yönetici komutu (30 Eylül 2026). Gökhan: "Her şey için komutun olsun."

  Panelin çağırdığı yönetici ve moderasyon API rotalarını süreç içinde, panelle BİREBİR
  aynı yoldan çağırır: gerçek bir yönetici oturumu (giriş akışının `issueSession`'ı),
  CSRF çerezi + başlığı, uygulama kökeni, idempotency anahtarı, hız sınırı, yetki ve
  denetim kaydı rota ne yapıyorsa aynen. Rotaları kopyalamadığı için yeni eklenen her
  yönetici rotası kendiliğinden kapsanır. Oturum yalnız bu çağrı için açılır ve her
  durumda iptal edilir.

  Next.js gerektirdiği için app konteynerinde çalışır:

    docker compose ... exec -T app node node_modules/tsx/dist/cli.mjs \
      scripts/operator-admin.ts GET /api/v1/admin/agent-settings
    ... | docker compose ... exec -T \
      -e AGENT_ADMIN_CONFIRMATION='POST /api/v1/admin/agent-runtime/capability-package' app \
      node node_modules/tsx/dist/cli.mjs scripts/operator-admin.ts \
      POST /api/v1/admin/agent-runtime/capability-package -

  Kurallar:
  - Yalnız `/api/v1/admin/` ve `/api/v1/moderation/` altındaki yollar.
  - GET dışındaki her istek tam `METOD yol` metnini AGENT_ADMIN_CONFIRMATION'da ister
    (yanlış kopyala-yapıştırla mutasyonu önler). Komutun olması üretim yetkisi değildir.
  - Aktör `resolveOperatorAdmin` (AGENT_OPERATOR_ADMIN_ID ya da tek aktif HUMAN ADMIN).
  - Çıktıda kimlik bilgisi, iletişim ve serbest bildirim metni alanları ile metindeki e-postalar
    maskelenir; stdout yalnız sonuç JSON satırıdır (uygulama logları stderr'e).
  - GET dışı isteklerde kullanılan idempotency anahtarı çıktıya yazılır; yeniden denemede
    AGENT_ADMIN_IDEMPOTENCY_KEY ile aynısı verilirse mutasyon tekrarlanmaz.
*/
const allowedPrefixes = ["/api/v1/admin/", "/api/v1/moderation/"] as const;
const methodSchema = z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]);
const environmentSchema = z
  .object({
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
    AGENT_ADMIN_CONFIRMATION: z.string().optional(),
    /** Yeniden denemede aynı anahtar verilirse rota aynı mutasyonu ikinci kez yapmaz. */
    AGENT_ADMIN_IDEMPOTENCY_KEY: z.string().uuid().optional(),
  })
  .passthrough();

/*
  Çıktı politikası (Astra 60f4797 P2): kimlik bilgisi/iletişim alanları adıyla, serbest
  metindeki e-posta adresleri değeriyle maskelenir; bildirim ayrıntısı gibi kişisel
  olabilecek serbest metin alanları (`details`, `message`, `note`) hiç basılmaz. Uzun
  metinler kısaltılır.
*/
const sensitiveKey =
  /credential|token|secret|password|cookie|csrf|authorization|email|phone|ipHash|ipAddress|details|message|note/iu;
const emailValue =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/giu;
const maxTextLength = 2000;

export function redactText(value: string): string {
  const masked = value.replace(emailValue, "[e-posta]");
  return masked.length > maxTextLength ? `${masked.slice(0, maxTextLength)}…[kısaltıldı]` : masked;
}

export function redactSensitive(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sensitiveKey.test(key) ? "[gizli]" : redactSensitive(nested),
      ]),
    );
  return value;
}

/** API yolunu `src/app` altındaki rota dosyasına ve dinamik parametrelere çözer. */
export function resolveRouteFile(
  appRoot: string,
  apiPath: string,
): { file: string; params: Record<string, string> } | null {
  const segments = apiPath.split("/").filter(Boolean);
  let directory = appRoot;
  const params: Record<string, string> = {};
  for (const segment of segments) {
    if (!/^[A-Za-z0-9._~%-]+$/u.test(segment) || segment === "." || segment === "..") return null;
    const literal = path.join(directory, segment);
    if (existsSync(literal) && !segment.startsWith("[")) {
      directory = literal;
      continue;
    }
    const dynamic = readdirSync(directory, { withFileTypes: true }).find(
      (entry) => entry.isDirectory() && /^\[[A-Za-z]+\]$/u.test(entry.name),
    );
    if (!dynamic) return null;
    params[dynamic.name.slice(1, -1)] = decodeURIComponent(segment);
    directory = path.join(directory, dynamic.name);
  }
  const file = path.join(directory, "route.ts");
  return existsSync(file) ? { file, params } : null;
}

async function readBody(argument: string | undefined): Promise<string | undefined> {
  if (argument === undefined) return undefined;
  if (argument !== "-") return argument;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const method = methodSchema.parse(process.argv[2]);
  const target = z.string().min(1).max(500).parse(process.argv[3]);
  const [apiPath = "", query = ""] = target.split("?", 2);
  if (!allowedPrefixes.some((prefix) => apiPath.startsWith(prefix)) || apiPath.includes(".."))
    throw new Error("OPERATOR_ADMIN_PATH_NOT_ALLOWED");
  const environment = environmentSchema.parse(process.env);
  if (method !== "GET" && environment.AGENT_ADMIN_CONFIRMATION !== `${method} ${apiPath}`)
    throw new Error("OPERATOR_ADMIN_CONFIRMATION_REQUIRED");
  const route = resolveRouteFile(path.resolve("src/app"), apiPath);
  if (!route) throw new Error("OPERATOR_ADMIN_ROUTE_NOT_FOUND");
  const routeModule = (await import(pathToFileURL(route.file).href)) as Record<string, unknown>;
  const handler = routeModule[method];
  if (typeof handler !== "function") throw new Error("OPERATOR_ADMIN_METHOD_NOT_ALLOWED");
  const body = await readBody(process.argv[4]);
  if (body !== undefined) JSON.parse(body);

  const database = getDatabase();
  const admin = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);
  /*
    Oturum ömrü (Astra 60f4797 P1/P2): önceki kesintilerden kalmış operatör oturumları
    temizlenir; yenisi 10 dakikalıktır ve kimlik doğrulama onu uzatmaz. SIGINT/SIGTERM'de
    ve her çıkışta iptal edilir; iptal edilemezse bile kendiliğinden kısa sürede düşer.
  */
  await database.session.updateMany({
    where: { userId: admin.actorId, userAgent: operatorSessionUserAgent, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const session = await database.$transaction(async (transaction) => {
    const issued = await issueSession(transaction, admin.actorId, {
      userAgent: operatorSessionUserAgent,
      ip: null,
    });
    const expiresAt = new Date(Date.now() + operatorSessionLifetimeMs);
    await transaction.session.update({ where: { id: issued.id }, data: { expiresAt } });
    return { ...issued, expiresAt };
  });
  let revoked = false;
  const revoke = async () => {
    if (revoked) return;
    revoked = true;
    await database.$transaction((transaction) => revokeSession(transaction, session.id));
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void revoke().finally(() => process.exit(130));
    });
  const idempotencyKey = environment.AGENT_ADMIN_IDEMPOTENCY_KEY ?? randomUUID();
  try {
    const appUrl = new URL(getEnvironment().APP_URL);
    const request = new NextRequest(new URL(`${apiPath}${query ? `?${query}` : ""}`, appUrl), {
      method,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${session.token}; ${CSRF_COOKIE_NAME}=${session.csrfToken}`,
        "x-csrf-token": session.csrfToken,
        origin: appUrl.origin,
        host: appUrl.host,
        "idempotency-key": idempotencyKey,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });
    const response = (await (
      handler as (
        request: NextRequest,
        context: { params: Promise<Record<string, string>> },
      ) => Promise<Response>
    )(request, { params: Promise.resolve(route.params) })) as Response;
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // JSON olmayan yanıt metin olarak kalır.
    }
    process.stdout.write(
      `${JSON.stringify({
        status: response.status,
        ...(method === "GET" ? {} : { idempotencyKey }),
        body: redactSensitive(parsed),
      })}\n`,
    );
    if (!response.ok) process.exitCode = 1;
  } finally {
    await revoke();
    await database.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    const code =
      error instanceof z.ZodError
        ? "OPERATOR_ADMIN_INPUT_INVALID"
        : error instanceof SyntaxError
          ? "OPERATOR_ADMIN_BODY_NOT_JSON"
          : error instanceof Error && /^OPERATOR_ADMIN_[A-Z_]+$/u.test(error.message)
            ? error.message
            : "INTERNAL_ERROR";
    process.stderr.write(`OPERATOR_ADMIN_FAILED code=${code}\n`);
    if (error instanceof z.ZodError)
      for (const issue of error.issues.slice(0, 5))
        process.stderr.write(`  ${issue.path.join(".") || "(kök)"}: ${issue.code}\n`);
    process.exitCode = 1;
  });
