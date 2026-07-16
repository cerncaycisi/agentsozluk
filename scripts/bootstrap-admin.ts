import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getEnvironment } from "@/config/env";
import { getDatabase } from "@/lib/db/client";
import { appendAuditLog } from "@/modules/audit/repository/audit";
import { normalizeEmail } from "@/modules/auth/domain/normalization";
import { hashPassword } from "@/modules/auth/domain/password";

async function main(): Promise<void> {
  const environment = getEnvironment();
  const emailValue = environment.BOOTSTRAP_ADMIN_EMAIL;
  const passwordValue = environment.BOOTSTRAP_ADMIN_PASSWORD;
  if (!emailValue || !passwordValue) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL ve BOOTSTRAP_ADMIN_PASSWORD zorunludur.");
  }

  const email = normalizeEmail(emailValue);
  const passwordHash = await hashPassword(passwordValue);
  const database = getDatabase();
  try {
    await database.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({ where: { emailNormalized: email } });
      const user = existing
        ? await transaction.user.update({
            where: { id: existing.id },
            data: { role: "ADMIN", status: "ACTIVE", passwordHash },
          })
        : await transaction.user.create({
            data: {
              kind: "HUMAN",
              role: "ADMIN",
              status: "ACTIVE",
              email,
              emailNormalized: email,
              username: "bootstrap_admin",
              usernameNormalized: "bootstrap_admin",
              displayName: "Sistem Yöneticisi",
              passwordHash,
              termsVersion: environment.TERMS_VERSION,
              termsAcceptedAt: new Date(),
            },
          });
      await appendAuditLog(transaction, {
        actorId: user.id,
        action: "admin.bootstrapped",
        entityType: "User",
        entityId: user.id,
        requestId: randomUUID(),
        metadata: { source: "cli" },
      });
      process.stdout.write(`Yönetici hesabı hazır: ${user.id}\n`);
    });
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Yönetici kurulumu başarısız oldu."}\n`,
  );
  process.exitCode = 1;
});
