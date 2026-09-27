import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { isAbsolute } from "node:path";
import type { GreatResetReceipt } from "../src/modules/maintenance/repository/great-reset-receipt";
import { writeNewDurable } from "./great-reset-durable-file";
import { localIndependentTarget, localResetTarget } from "./great-reset-local-guard";

/*
  Great reset operasyon adımları CLI'si (tasarım v20 madde 2–4). A5 reset modu bunu onaylı
  `runtime/releases/<SHA>` içinden çağırır. Hedef çağırandan alınmaz:

  - Üretim host'unda: host, fiziksel release, `.release-sha`, `.env`'deki tek `DATABASE_URL` ve
    Compose `db` container kimliği üretim guard'ından geçer; DB `agent_sozluk`. Yalnız `receipt`
    komutu `--database` ile A5'in aynı operasyonda açtığı scratch kopyayı hedefleyebilir.
  - Kişisel operatör sunucusunda: yalnız yerel prova guard'ının izin verdiği sentetik DB.

  great-reset-operation.ts intent-create <operationId> <releaseSha>
  great-reset-operation.ts intent-invalidate <operationId>
  great-reset-operation.ts receipt <çıktı.json> [--database <scratch>]
  great-reset-operation.ts receipt-compare <beklenen.json> <gerçek.json>
  great-reset-operation.ts receipt-compare-restored <canlı.json> <restore.json>
  great-reset-operation.ts receipt-compare-independent <üretim-scratch.json> <operatör.json>
  great-reset-operation.ts traffic-open <operationId>
  great-reset-operation.ts restore-eligibility <operationId> <reset-sonrası-makbuz.json>

  Çıktıda credential, URL veya satır içeriği yoktur; makbuz dosyası yalnız özetleri taşır, 0600
  izinle ve üzerine yazmadan (O_EXCL) açılır.
*/

// A5 scratch'i ve geri dönüş gölgesi (`agent_sozluk_restore_<tarih>_<saat>_<op6>`).
const scratchPattern = /^agent_sozluk_(?:a5|restore)_[0-9]{8}_[0-9]{6}_[0-9a-f]{6}$/u;

type Target = {
  databaseUrl: string;
  releaseSha: string | null;
  identity: { databaseName: string; owner: string; clusterId: string; marker?: string };
};

function fail(code: string): never {
  throw new Error(`GREAT_RESET_${code}`);
}

async function resolveTarget(
  scratch: string | undefined,
  independentOnly = false,
): Promise<Target> {
  const [{ productionResetIdentity, productionResetTarget }, { collectProductionEnvironment }] =
    await Promise.all([
      import("../src/modules/maintenance/domain/great-reset-production-guard"),
      import("../src/modules/maintenance/repository/great-reset-production-environment"),
    ]);
  if (hostname() === productionResetIdentity.hostname) {
    const target = productionResetTarget(await collectProductionEnvironment());
    let databaseName = target.databaseName;
    const url = new URL(target.databaseUrl);
    if (scratch !== undefined) {
      if (!scratchPattern.test(scratch)) fail("INVALID_TARGET");
      databaseName = scratch;
      url.pathname = `/${scratch}`;
    }
    return {
      databaseUrl: url.toString(),
      releaseSha: target.releaseSha,
      identity: {
        databaseName,
        owner: productionResetIdentity.owner,
        clusterId: productionResetIdentity.clusterId,
      },
    };
  }
  if (scratch !== undefined) fail("INVALID_TARGET");
  // Bağımsız restore kapısı: yalnız makbuz komutu, `agent_sozluk`'a ait `…_independent_test` DB.
  if (process.env.AGENT_GREAT_RESET_INDEPENDENT_DATABASE_URL !== undefined) {
    if (independentOnly !== true) fail("INVALID_TARGET");
    const independent = localIndependentTarget(
      process.env.AGENT_GREAT_RESET_INDEPENDENT_DATABASE_URL,
      hostname(),
    );
    return {
      databaseUrl: independent.databaseUrl,
      releaseSha: null,
      identity: {
        databaseName: independent.databaseName,
        owner: independent.identity.owner,
        clusterId: independent.identity.clusterId,
        marker: independent.identity.marker,
      },
    };
  }
  const local = localResetTarget(process.env.AGENT_GREAT_RESET_DATABASE_URL, hostname());
  return {
    databaseUrl: local.databaseUrl,
    releaseSha: null,
    identity: {
      databaseName: local.databaseName,
      owner: local.identity.owner,
      clusterId: local.identity.clusterId,
      marker: local.identity.marker,
    },
  };
}

function writePrivateNew(path: string, content: string): void {
  if (!isAbsolute(path)) fail("INVALID_ARGUMENTS");
  // Tam yazım, fsync, geri okuma ve dizin fsync; doğrulanamayan dosya silinir (Astra, PR #238 P2).
  writeNewDurable(path, content);
}

function readReceipt(path: string): GreatResetReceipt {
  if (!isAbsolute(path)) fail("INVALID_ARGUMENTS");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as GreatResetReceipt;
  } catch {
    fail("RECEIPT_UNREADABLE");
  }
}

async function main(argv: readonly string[]): Promise<string> {
  const [command, ...rest] = argv;
  if (command === "receipt-compare" && rest.length === 2) {
    const { compareReceipts } =
      await import("../src/modules/maintenance/repository/great-reset-receipt");
    const result = compareReceipts(readReceipt(rest[0]!), readReceipt(rest[1]!));
    if (!result.equal) process.exitCode = 3;
    return JSON.stringify({
      equal: result.equal,
      sections: result.sections,
      tables: result.tables,
      unexpected: result.unexpected.map((item) => `${item.section}:${item.key}`),
    });
  }
  if (command === "local-identity" && rest.length === 0) {
    // Yalnız operatör sunucusundaki yerel prova kimliği (host denetimli); üretime bağlanmaz.
    const { localResetIdentityFor } = await import("./great-reset-local-guard");
    const identity = localResetIdentityFor(hostname());
    return JSON.stringify({ hostname: identity.hostname, clusterId: identity.clusterId });
  }
  if (command === "receipt-compare-restored" && rest.length === 2) {
    const { compareLiveWithRestored } =
      await import("../src/modules/maintenance/repository/great-reset-receipt");
    const result = compareLiveWithRestored(readReceipt(rest[0]!), readReceipt(rest[1]!));
    if (!result.equal) process.exitCode = 3;
    return JSON.stringify(result);
  }
  if (command === "receipt-compare-shadow" && rest.length === 2) {
    const { compareShadowWithPreReset } =
      await import("../src/modules/maintenance/repository/great-reset-receipt");
    const result = compareShadowWithPreReset(readReceipt(rest[0]!), readReceipt(rest[1]!));
    if (!result.equal) process.exitCode = 3;
    return JSON.stringify(result);
  }
  if (command === "receipt-compare-independent" && (rest.length === 2 || rest.length === 4)) {
    const { compareForIndependentRestore } =
      await import("../src/modules/maintenance/repository/great-reset-receipt");
    // İsteğe bağlı: iki kümenin kurulum süper kullanıcısı adları (varsayılan postgres, agent).
    const [productionBootstrap = "postgres", independentBootstrap = "agent"] = rest.slice(2);
    if (
      ![productionBootstrap, independentBootstrap].every((name) => /^[a-z_][a-z0-9_]*$/u.test(name))
    )
      fail("INVALID_ARGUMENTS");
    const result = compareForIndependentRestore(readReceipt(rest[0]!), readReceipt(rest[1]!), {
      production: productionBootstrap,
      independent: independentBootstrap,
    });
    if (!result.equal) process.exitCode = 3;
    return JSON.stringify(result);
  }
  let scratch: string | undefined;
  let args = rest;
  // Gölge/scratch hedefi yalnız makbuz ve geri dönüş gölgesi komutlarında.
  if (
    ["receipt", "shadow-mark", "restore-verify"].includes(command ?? "") &&
    rest.length >= 2 &&
    rest[rest.length - 2] === "--database"
  ) {
    scratch = rest[rest.length - 1];
    args = rest.slice(0, -2);
  }
  const valid =
    (command === "intent-create" && args.length === 2) ||
    (command === "intent-invalidate" && args.length === 1) ||
    (command === "receipt" && args.length === 1) ||
    (command === "traffic-open" && args.length === 1) ||
    (command === "restore-eligibility" && args.length === 2) ||
    (command === "commit-digest" && args.length === 1) ||
    (command === "shadow-mark" && args.length === 3 && scratch !== undefined) ||
    (command === "restore-verify" && args.length === 2);
  if (!valid) fail("INVALID_ARGUMENTS");
  const target = await resolveTarget(scratch, command === "receipt");
  const [{ PrismaClient }, operation, receipts, restore] = await Promise.all([
    import("@prisma/client"),
    import("../src/modules/maintenance/repository/great-reset-operation"),
    import("../src/modules/maintenance/repository/great-reset-receipt"),
    import("../src/modules/maintenance/repository/great-reset-restore"),
  ]);
  const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
  try {
    switch (command) {
      case "intent-create": {
        // Üretimde niyetin release'i bu CLI'nin koştuğu onaylı release olmalıdır.
        if (target.releaseSha !== null && args[1] !== target.releaseSha) fail("INVALID_ARGUMENTS");
        return JSON.stringify(
          await operation.createIntent(database, target.identity, args[0]!, args[1]!),
        );
      }
      case "intent-invalidate":
        return JSON.stringify(
          await operation.invalidateIntent(database, target.identity, args[0]!),
        );
      case "receipt": {
        const started = Date.now();
        const receipt = await receipts.computeReceipt(database, target.identity);
        writePrivateNew(args[0]!, `${JSON.stringify(receipt)}\n`);
        return JSON.stringify({
          database: target.identity.databaseName,
          sha256: receipt.sha256,
          seconds: (Date.now() - started) / 1000,
        });
      }
      case "commit-digest":
        return JSON.stringify({
          commitSha256: await restore.commitDigest(database, target.identity, args[0]!),
        });
      case "shadow-mark":
        return JSON.stringify(
          await restore.markShadow(database, target.identity, args[0]!, args[1]!, args[2]!),
        );
      case "restore-verify": {
        const blockers = await restore.verifyRestored(
          database,
          target.identity,
          args[0]!,
          args[1]!,
        );
        if (blockers.length) process.exitCode = 3;
        return JSON.stringify({ verified: blockers.length === 0, blockers });
      }
      case "traffic-open":
        return JSON.stringify(
          await operation.recordTrafficOpen(database, target.identity, args[0]!),
        );
      default: {
        const blockers = await operation.restoreEligibility(
          database,
          target.identity,
          args[0]!,
          readReceipt(args[1]!),
        );
        if (blockers.length) process.exitCode = 3;
        return JSON.stringify({ eligible: blockers.length === 0, blockers });
      }
    }
  } finally {
    await database.$disconnect();
  }
}

void main(process.argv.slice(2))
  .then((output) => process.stdout.write(`${output}\n`))
  .catch((error: unknown) => {
    const code =
      error instanceof Error && /^GREAT_RESET_[A-Z_]+$/u.test(error.message)
        ? error.message
        : "GREAT_RESET_OPERATION_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
