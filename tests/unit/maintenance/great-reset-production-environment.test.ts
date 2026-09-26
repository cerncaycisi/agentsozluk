import { beforeEach, describe, expect, it, vi } from "vitest";

// Docker ve dosya sistemi taklit edilir; gerçek üretim ortamına dokunulmaz.
const calls: { args: string[]; env: NodeJS.ProcessEnv | undefined }[] = [];
let inspection: Record<string, unknown> = {};
vi.mock("node:os", () => ({ hostname: () => "agent-sozluk-prod" }));
vi.mock("node:fs", () => ({
  readFileSync: (path: string) =>
    path.endsWith(".release-sha") ? `${"a".repeat(40)}\n` : "DATABASE_URL=x\n",
  realpathSync: () => `/opt/agent-sozluk/runtime/releases/${"a".repeat(40)}`,
}));
vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    args: string[],
    options: { env?: NodeJS.ProcessEnv },
    callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    calls.push({ args, env: options.env });
    const stdout = args.includes("ps") ? `${"b".repeat(64)}\n` : JSON.stringify([inspection]);
    callback(null, { stdout, stderr: "" });
  },
}));

const { collectProductionEnvironment } =
  await import("@/modules/maintenance/repository/great-reset-production-environment");

function container(network = "agent-sozluk_backend") {
  return {
    State: { Running: true },
    Config: {
      Labels: { "com.docker.compose.project": "agent-sozluk", "com.docker.compose.service": "db" },
    },
    Mounts: [
      {
        Type: "volume",
        Name: "agent-sozluk_postgres_data",
        Destination: "/var/lib/postgresql/data",
      },
    ],
    NetworkSettings: { Networks: { [network]: { IPAddress: "172.19.0.5" } } },
  };
}

beforeEach(() => {
  calls.length = 0;
  inspection = container();
});

describe("production reset environment", () => {
  it("pins docker to the local socket and drops DOCKER_* variables", async () => {
    process.env.DOCKER_HOST = "tcp://elsewhere:2376";
    process.env.DOCKER_CONTEXT = "remote";
    try {
      const environment = await collectProductionEnvironment();
      expect(environment.databaseAddress).toBe("172.19.0.5");
    } finally {
      delete process.env.DOCKER_HOST;
      delete process.env.DOCKER_CONTEXT;
    }
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.args.slice(0, 2)).toEqual(["--host", "unix:///var/run/docker.sock"]);
      expect(Object.keys(call.env ?? {}).filter((key) => key.startsWith("DOCKER_"))).toEqual([]);
    }
  });

  it("requires the exact data network, not just the project prefix", async () => {
    for (const network of ["agent-sozluk_unapproved", "agent-sozluk_", "other_backend"]) {
      inspection = container(network);
      await expect(collectProductionEnvironment()).rejects.toThrow(
        "GREAT_RESET_PRODUCTION_CONTAINER_MISMATCH",
      );
    }
  });
});
