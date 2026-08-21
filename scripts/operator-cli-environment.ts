import { readFileSync } from "node:fs";

/*
  Operatör script'lerinin ortak CLI ortam hazırlığı. Üç script bunu kopyala-yapıştır
  taşıyordu (agent-rollout, recover-stochastic-runtime, rollout-persona-prompts) ve
  üçünde de aynı iki tuzak vardı:

  1. `process.loadEnvFile()` ZATEN SET EDİLMİŞ değişkenleri EZMEZ. Deploy kabuğunda
     bir `export DATABASE_URL=...` kalıntısı varsa, operatörün açıkça verdiği env
     dosyası sessizce hiçbir şey yapmaz ve script yanlış veritabanına bağlanır.
     Sessiz no-op, hatadan kötüdür. Burada dosya AÇIK bir argüman, kabuk export'u
     ORTAM gürültüsü — açık olan kazanır, ama ezilen her anahtar rapor edilir.

  2. Compose ağındaki `db:5432` host'tan çözülmez; AGENT_DB_IP host adını değiştirir.

  Rapor stderr'e gider ve DEĞER BASMAZ — DATABASE_URL parola taşıyor, bu satırlar
  deploy loglarına düşüyor.
*/

const assignmentPattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u;

/** Dosyadaki anahtarları okur. Değerleri Node'un kendi ayrıştırıcısına bırakır. */
function keysDeclaredIn(envFilePath: string): string[] {
  const keys = new Set<string>();
  for (const line of readFileSync(envFilePath, "utf8").split("\n")) {
    if (line.trimStart().startsWith("#")) continue;
    const match = assignmentPattern.exec(line);
    if (match?.[1]) keys.add(match[1]);
  }
  return [...keys];
}

export interface OperatorCliEnvironmentReport {
  /** Env dosyasından yüklenen anahtarlar. */
  loaded: string[];
  /** Ortamda farklı bir değerle duruyordu, dosyadaki değer geçerli kılındı. */
  overridden: string[];
  /** AGENT_DB_IP ile DATABASE_URL host'u değiştirildiyse yeni host. */
  databaseHost: string | null;
}

export function prepareOperatorCliEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): OperatorCliEnvironmentReport {
  const report: OperatorCliEnvironmentReport = {
    loaded: [],
    overridden: [],
    databaseHost: null,
  };

  const envFilePath = environment.AGENT_OPERATOR_ENV_FILE;
  if (envFilePath) {
    const declared = keysDeclaredIn(envFilePath);
    /*
      loadEnvFile ezmediği için, çakışan anahtarları önce ortamdan siliyoruz; böylece
      dosyadaki değer yerine oturuyor. Silmeden önce hangileri olduğunu not ediyoruz.
    */
    const conflicting = declared.filter((key) => environment[key] !== undefined);
    for (const key of conflicting) delete environment[key];
    process.loadEnvFile(envFilePath);
    report.loaded = declared.filter((key) => environment[key] !== undefined);
    report.overridden = conflicting.filter((key) => environment[key] !== undefined);
  }

  const databaseIp = environment.AGENT_DB_IP;
  if (databaseIp && environment.DATABASE_URL) {
    const databaseUrl = new URL(environment.DATABASE_URL);
    databaseUrl.hostname = databaseIp;
    environment.DATABASE_URL = databaseUrl.toString();
    report.databaseHost = databaseIp;
  }

  return report;
}

/** Raporu stderr'e yazar. Anahtar isimleri basılır, DEĞERLER BASILMAZ. */
export function writeOperatorCliEnvironmentReport(
  report: OperatorCliEnvironmentReport,
  write: (line: string) => void = (line) => process.stderr.write(line),
): void {
  if (report.loaded.length > 0)
    write(`OPERATOR_ENV_LOADED ${report.loaded.slice().sort().join(",")}\n`);
  if (report.overridden.length > 0)
    write(`OPERATOR_ENV_OVERRODE_SHELL ${report.overridden.slice().sort().join(",")}\n`);
  if (report.databaseHost) write(`OPERATOR_DB_HOST ${report.databaseHost}\n`);
}
