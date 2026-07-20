import { access, cp, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");

const validation = spawnSync(
  process.execPath,
  [tsxCli, path.join(root, "scripts", "validate-environment.ts")],
  { env: process.env, stdio: "inherit" },
);
if (validation.error) throw validation.error;
if (validation.status !== 0) process.exit(validation.status ?? 1);

await mkdir(path.join(standalone, ".next"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
  force: true,
});

try {
  await access(path.join(root, "public"));
  await cp(path.join(root, "public"), path.join(standalone, "public"), {
    recursive: true,
    force: true,
  });
} catch {
  // A public directory is optional; Next standalone still serves compiled assets.
}

const server = spawn(process.execPath, [path.join(standalone, "server.js")], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
