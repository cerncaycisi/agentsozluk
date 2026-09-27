import { hostname } from "node:os";
import type { PrismaClient } from "@prisma/client";
import { productionResetIdentity } from "@/modules/maintenance/domain/great-reset-production-guard";
import { assertOperationTarget } from "@/modules/maintenance/repository/great-reset-operation";

/*
  Great reset operatör CLI'lerinin (bayrak dondurma/geri açma, boşaltma) hedef guard'ı (Astra #243
  P1). İlk mutasyondan önce, uygulama servislerinin kullanacağı AYNI istemciyle:
  - Üretim host'unda: DB adı, sahibi = bağlanan kullanıcı, küme kimliği ve PostgreSQL 16 birebir
    üretim reset kimliği olmalı (restore kopyası ya da başka küme reddedilir).
  - Başka yerde: yalnız NODE_ENV=test, loopback istemci adresi ve `_test` ile biten DB (yerel
    test/prova).
*/
export async function assertResetOperatorTarget(database: PrismaClient): Promise<void> {
  if (hostname() === productionResetIdentity.hostname) {
    await assertOperationTarget(database, {
      databaseName: productionResetIdentity.databaseName,
      owner: productionResetIdentity.owner,
      clusterId: productionResetIdentity.clusterId,
    });
    return;
  }
  // İstemci yalnız loopback'e bağlanır; sunucunun gördüğü adres ortama göre değişir (CI'da Docker
  // servis ağı; aynı kural `runIntegrationTestGreatReset`'te, Astra PR #237 2. tur P2).
  let clientHost = "";
  try {
    clientHost = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    clientHost = "";
  }
  const [row] = await database.$queryRaw<{ database: string }[]>`
    SELECT current_database() AS database`;
  if (
    process.env.NODE_ENV !== "test" ||
    !["127.0.0.1", "localhost"].includes(clientHost) ||
    !row ||
    !/^[a-z_][a-z0-9_]*_test$/u.test(row.database)
  )
    throw new Error("GREAT_RESET_OPERATOR_TARGET_INVALID");
}
