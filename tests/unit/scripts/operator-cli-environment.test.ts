import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  prepareOperatorCliEnvironment,
  writeOperatorCliEnvironmentReport,
} from "../../../scripts/operator-cli-environment";

function envFileWith(contents: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), "operator-env-"));
  const filePath = path.join(directory, "operator.env");
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

/*
  prepareOperatorCliEnvironment gerçek process.loadEnvFile'ı çağırıyor; o da yalnızca
  process.env'e yazıyor. Bu yüzden testler process.env üzerinde koşuyor ve sonrasında
  temizliyor — sahte bir ortam nesnesi geçirmek loadEnvFile'ın davranışını atlardı ve
  düzeltilen tuzağın ta kendisini test dışında bırakırdı.
*/
function withProcessEnvironment(
  overrides: Record<string, string | undefined>,
  run: () => void,
): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("prepareOperatorCliEnvironment", () => {
  it("env dosyası kabuktaki eski değeri ezer ve ezdiğini raporlar", () => {
    const filePath = envFileWith("DATABASE_URL=postgresql://test:test@db:5432/agent_sozluk\n");
    withProcessEnvironment(
      {
        AGENT_OPERATOR_ENV_FILE: filePath,
        AGENT_DB_IP: undefined,
        DATABASE_URL: "postgresql://test:test@localhost:5432/agent_sozluk",
      },
      () => {
        const report = prepareOperatorCliEnvironment();
        // Sessiz no-op üretim olayıydı: dosya verildiyse dosya geçerlidir.
        expect(process.env.DATABASE_URL).toBe("postgresql://test:test@db:5432/agent_sozluk");
        expect(report.overridden).toEqual(["DATABASE_URL"]);
      },
    );
  });

  it("kabukta olmayan anahtarı yükler ama ezilmiş saymaz", () => {
    const filePath = envFileWith("OPERATOR_TEST_ONLY_KEY=deger\n");
    withProcessEnvironment(
      {
        AGENT_OPERATOR_ENV_FILE: filePath,
        AGENT_DB_IP: undefined,
        OPERATOR_TEST_ONLY_KEY: undefined,
      },
      () => {
        const report = prepareOperatorCliEnvironment();
        expect(report.loaded).toContain("OPERATOR_TEST_ONLY_KEY");
        expect(report.overridden).not.toContain("OPERATOR_TEST_ONLY_KEY");
      },
    );
  });

  it("yorum satırlarını anahtar saymaz", () => {
    const filePath = envFileWith("# DATABASE_URL=yorumdaki\nOPERATOR_TEST_ONLY_KEY=deger\n");
    withProcessEnvironment(
      {
        AGENT_OPERATOR_ENV_FILE: filePath,
        AGENT_DB_IP: undefined,
        DATABASE_URL: "postgresql://test:test@localhost:5432/agent_sozluk",
        OPERATOR_TEST_ONLY_KEY: undefined,
      },
      () => {
        const report = prepareOperatorCliEnvironment();
        expect(report.overridden).toEqual([]);
        expect(process.env.DATABASE_URL).toBe("postgresql://test:test@localhost:5432/agent_sozluk");
      },
    );
  });

  it("AGENT_DB_IP yalnızca host'u değiştirir, kimlik ve yolu korur", () => {
    withProcessEnvironment(
      {
        AGENT_OPERATOR_ENV_FILE: undefined,
        AGENT_DB_IP: "127.0.0.1",
        DATABASE_URL: "postgresql://test:test@db:5432/agent_sozluk?schema=public",
      },
      () => {
        const report = prepareOperatorCliEnvironment();
        expect(process.env.DATABASE_URL).toBe(
          "postgresql://test:test@127.0.0.1:5432/agent_sozluk?schema=public",
        );
        expect(report.databaseHost).toBe("127.0.0.1");
      },
    );
  });

  it("hiçbir yönerge verilmediğinde ortama dokunmaz", () => {
    withProcessEnvironment(
      {
        AGENT_OPERATOR_ENV_FILE: undefined,
        AGENT_DB_IP: undefined,
        DATABASE_URL: "postgresql://test:test@db:5432/agent_sozluk",
      },
      () => {
        const report = prepareOperatorCliEnvironment();
        expect(process.env.DATABASE_URL).toBe("postgresql://test:test@db:5432/agent_sozluk");
        expect(report).toEqual({ loaded: [], overridden: [], databaseHost: null });
      },
    );
  });
});

describe("writeOperatorCliEnvironmentReport", () => {
  it("anahtar adlarını basar, değerleri BASMAZ", () => {
    const lines: string[] = [];
    writeOperatorCliEnvironmentReport(
      {
        loaded: ["DATABASE_URL", "APP_SECRET"],
        overridden: ["DATABASE_URL"],
        databaseHost: "127.0.0.1",
      },
      (line) => lines.push(line),
    );
    const output = lines.join("");
    expect(output).toContain("OPERATOR_ENV_LOADED APP_SECRET,DATABASE_URL");
    expect(output).toContain("OPERATOR_ENV_OVERRODE_SHELL DATABASE_URL");
    expect(output).toContain("OPERATOR_DB_HOST 127.0.0.1");
    // Bu satırlar deploy loguna düşüyor; DATABASE_URL parola taşıyor.
    expect(output).not.toContain("postgresql://");
  });

  it("söylenecek bir şey yoksa hiç yazmaz", () => {
    const lines: string[] = [];
    writeOperatorCliEnvironmentReport({ loaded: [], overridden: [], databaseHost: null }, (line) =>
      lines.push(line),
    );
    expect(lines).toEqual([]);
  });
});
