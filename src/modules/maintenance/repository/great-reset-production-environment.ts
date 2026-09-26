import { execFile } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  productionResetIdentity,
  type ProductionGuardInput,
} from "../domain/great-reset-production-guard";

/*
  Üretim reset ortamı, çağırandan ALINMAZ; bu modül kendisi okur (Astra, PR #232 P2): host adı
  (dosyalardan önce), bu kodun koştuğu release'in fiziksel dizini (`realpath`), `.release-sha`,
  `.env` ve Compose `db` container'ının kimliği. Container etiketlerle bulunur (tam bir tane),
  çalışıyor olmalı, veri volume'u beklenen yola bağlı ve yalnız sabit veri ağına bağlı olmalıdır;
  adres bu ağdan alınır. Docker yerel sokete sabitlenir. Hiçbir değer log'a yazılmaz.
*/
const run = promisify(execFile);

function read(path: string, code: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(code);
  }
}

type Inspection = {
  State?: { Running?: boolean };
  Config?: { Labels?: Record<string, string> };
  Mounts?: { Type?: string; Name?: string; Destination?: string }[];
  NetworkSettings?: {
    Networks?: Record<string, { IPAddress?: string; GlobalIPv6Address?: string }>;
  };
};

async function databaseContainerAddress(): Promise<string> {
  const identity = productionResetIdentity;
  /*
    Docker yerel daemon soketine sabitlenir (Astra, PR #232 2. tur P2): seçili context,
    `DOCKER_HOST` ya da `DOCKER_CONTEXT` başka daemon'u gösterse de ps/inspect bu hosta gider.
    `--host` context seçimini ezer; `DOCKER_*` değişkenleri alt sürece verilmez.
  */
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(environment))
    if (key.startsWith("DOCKER_")) delete environment[key];
  const docker = async (args: string[]) => {
    try {
      return (
        await run("docker", ["--host", identity.dockerSocket, ...args], {
          timeout: 10_000,
          maxBuffer: 1_000_000,
          env: environment,
        })
      ).stdout;
    } catch {
      throw new Error("GREAT_RESET_PRODUCTION_CONTAINER_UNAVAILABLE");
    }
  };
  const ids = (
    await docker([
      "ps",
      "-q",
      "--no-trunc",
      "--filter",
      `label=com.docker.compose.project=${identity.composeProject}`,
      "--filter",
      `label=com.docker.compose.service=${identity.composeService}`,
    ])
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{64}$/u.test(ids[0]!))
    throw new Error("GREAT_RESET_PRODUCTION_CONTAINER_MISMATCH");
  let inspection: Inspection | undefined;
  try {
    [inspection] = JSON.parse(await docker(["inspect", ids[0]!])) as Inspection[];
  } catch {
    throw new Error("GREAT_RESET_PRODUCTION_CONTAINER_MISMATCH");
  }
  const labels = inspection?.Config?.Labels ?? {};
  const networks = Object.entries(inspection?.NetworkSettings?.Networks ?? {});
  const [networkName, network] = networks[0] ?? [];
  const address = network?.IPAddress || network?.GlobalIPv6Address || "";
  if (
    inspection?.State?.Running !== true ||
    labels["com.docker.compose.project"] !== identity.composeProject ||
    labels["com.docker.compose.service"] !== identity.composeService ||
    !(inspection.Mounts ?? []).some(
      (mount) =>
        mount.Type === "volume" &&
        mount.Name === identity.dataVolume &&
        mount.Destination === identity.dataPath,
    ) ||
    networks.length !== 1 ||
    networkName !== identity.dataNetwork ||
    !address
  )
    throw new Error("GREAT_RESET_PRODUCTION_CONTAINER_MISMATCH");
  return address;
}

export async function collectProductionEnvironment(): Promise<ProductionGuardInput> {
  const host = hostname();
  // Host dosya ve Docker okumadan ÖNCE denetlenir; üretim dışında hiçbir şeye bakılmaz.
  if (host !== productionResetIdentity.hostname)
    throw new Error("GREAT_RESET_PRODUCTION_HOST_REQUIRED");
  let releaseDirectory: string;
  try {
    // Bu modül release içinde `src/modules/maintenance/repository/` altındadır.
    releaseDirectory = realpathSync(
      join(fileURLToPath(new URL(".", import.meta.url)), "../../../.."),
    );
  } catch {
    throw new Error("GREAT_RESET_PRODUCTION_RELEASE_MISMATCH");
  }
  return {
    hostname: host,
    envFileContents: read(productionResetIdentity.envFile, "GREAT_RESET_PRODUCTION_ENV_UNREADABLE"),
    releaseDirectory,
    releaseShaFileContents: read(
      join(releaseDirectory, ".release-sha"),
      "GREAT_RESET_PRODUCTION_RELEASE_MISMATCH",
    ),
    databaseAddress: await databaseContainerAddress(),
  };
}
