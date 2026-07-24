import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pathFromRoot = (...parts: string[]) => path.join(root, ...parts);
const assemblerPath = pathFromRoot("scripts/assemble-runtime-release.sh");
const builderPath = pathFromRoot("scripts/build-release-bundle.sh");
const installerPath = pathFromRoot("scripts/install-release-artifact-remote.sh");
const verifierPath = pathFromRoot("scripts/verify-release-bundle.mjs");
const wrapperPath = pathFromRoot("scripts/deploy-production-no-migration.sh");
const remotePath = pathFromRoot("scripts/production-release-remote.sh");
const assembler = readFileSync(assemblerPath, "utf8");
const builder = readFileSync(builderPath, "utf8");
const installer = readFileSync(installerPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");
const wrapper = readFileSync(wrapperPath, "utf8");
const remote = readFileSync(remotePath, "utf8");
const dockerfile = readFileSync(pathFromRoot("Dockerfile"), "utf8");
const packageJson = JSON.parse(readFileSync(pathFromRoot("package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};
const runtimePackage = JSON.parse(
  readFileSync(pathFromRoot("packages/runtime-release/package.json"), "utf8"),
) as { dependencies: Record<string, string> };
const workflowSource = readFileSync(
  pathFromRoot(".github/workflows/release-candidate.yml"),
  "utf8",
);
const workflow = parse(workflowSource) as {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: {
    bundle?: {
      steps?: {
        name?: string;
        run?: string;
        uses?: string;
        with?: Record<string, unknown>;
      }[];
    };
  };
};

function externalProductionAgentDependencies(): string[] {
  const configFile = ts.readConfigFile(pathFromRoot("tsconfig.json"), ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const visited = new Set<string>();
  const external = new Set<string>();
  const packageName = (specifier: string) => {
    if (specifier.startsWith("node:")) return null;
    return specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
  };
  const walk = (file: string) => {
    const normalized = path.normalize(file);
    if (visited.has(normalized)) return;
    visited.add(normalized);
    const imports = ts.preProcessFile(readFileSync(normalized, "utf8"), true, true).importedFiles;
    for (const imported of imports) {
      const resolved = ts.resolveModuleName(
        imported.fileName,
        normalized,
        parsedConfig.options,
        ts.sys,
      ).resolvedModule;
      if (resolved && !resolved.resolvedFileName.includes("/node_modules/")) {
        const sourceCandidate = resolved.resolvedFileName.replace(/\.d\.ts$/u, ".ts");
        if (existsSync(sourceCandidate)) walk(sourceCandidate);
        else if (existsSync(resolved.resolvedFileName)) walk(resolved.resolvedFileName);
        continue;
      }
      const dependency = packageName(imported.fileName);
      if (dependency) external.add(dependency);
    }
  };

  for (const [name, command] of Object.entries(packageJson.scripts)) {
    if (!name.startsWith("agent:")) continue;
    const match = command.match(/scripts\/([\w-]+\.ts)/u);
    const script = match?.[1];
    if (!script) continue;
    const scriptPath = pathFromRoot("scripts", script);
    if (existsSync(scriptPath)) walk(scriptPath);
  }
  return [...external].sort();
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

describe("build-once exact-SHA release artifacts", () => {
  it("keeps every release artifact entrypoint syntax-valid", () => {
    for (const script of [assemblerPath, builderPath, installerPath, wrapperPath, remotePath]) {
      expect(() => execFileSync("bash", ["-n", script])).not.toThrow();
    }
    expect(() => execFileSync(process.execPath, ["--check", verifierPath])).not.toThrow();
  });

  it("packages the complete production agent-script dependency closure, not the web app", () => {
    expect(externalProductionAgentDependencies()).toEqual([
      "@node-rs/argon2",
      "@prisma/client",
      "dotenv",
      "linkify-it",
      "zod",
    ]);
    expect(runtimePackage.dependencies).toEqual({
      "@node-rs/argon2": packageJson.dependencies["@node-rs/argon2"],
      "@prisma/client": packageJson.dependencies["@prisma/client"],
      dotenv: packageJson.dependencies.dotenv,
      "linkify-it": packageJson.dependencies["linkify-it"],
      prisma: packageJson.dependencies.prisma,
      tsx: packageJson.dependencies.tsx,
      zod: packageJson.dependencies.zod,
    });
    expect(runtimePackage.dependencies).not.toHaveProperty("next");
    expect(runtimePackage.dependencies).not.toHaveProperty("react");
    expect(
      dockerfile.match(
        /COPY packages\/runtime-release\/package\.json \.\/packages\/runtime-release\/package\.json/gu,
      ),
    ).toHaveLength(2);
  });

  it("assembles one Linux/glibc runtime with exact native and source receipts", () => {
    expect(assembler).toContain("--config.inject-workspace-packages=true");
    expect(assembler).toContain("--filter @agent-sozluk/runtime-release");
    expect(assembler).toContain("process.versions.modules");
    expect(assembler).toContain("glibcVersionRuntime");
    expect(assembler).toContain("@node-rs/argon2-linux-x64-gnu");
    expect(assembler).toContain("debian-openssl-3.0.x");
    expect(assembler).toContain('git -C "$root" archive');
    expect(assembler).toContain('>"$output/.release-sha"');
    expect(assembler).not.toContain("pnpm install --prod");
  });

  it("builds once, smokes before packaging, checksums both archives and caps upload size", () => {
    expect(builder).toContain("docker buildx build");
    expect(builder).toContain('--build-arg "SOURCE_REVISION=$candidate_sha"');
    expect(builder).toContain("scripts/release-smoke.ts");
    expect(builder).toContain("docker save");
    expect(builder).toContain("runtime-release.tar.zst");
    expect(builder).toContain("sha256sum app-image.tar.zst runtime-release.tar.zst");
    expect(builder).toContain("RELEASE_BUNDLE_MAX_BYTES:-251658240");
    expect(builder).toContain("image_bytes=%s runtime_bytes=%s");
    expect(builder.indexOf("BUNDLE_SIZE_LIMIT")).toBeLessThan(
      builder.indexOf("RELEASE_BUNDLE_READY"),
    );
  });

  it("uses a manual, green-main-only, one-day release workflow without production access", () => {
    expect(Object.keys(workflow.on ?? {})).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ actions: "read", contents: "read" });
    const steps = workflow.jobs?.bundle?.steps ?? [];
    const runs = steps.flatMap((step) => (step.run ? [step.run] : []));
    expect(runs.some((run) => run.includes("git rev-parse origin/main"))).toBe(true);
    expect(runs.some((run) => run.includes("gh run list") && run.includes("--workflow CI"))).toBe(
      true,
    );
    expect(runs).toContain("pnpm install --frozen-lockfile");
    expect(runs.some((run) => run.includes("scripts/build-release-bundle.sh"))).toBe(true);
    const upload = steps.find((step) => step.uses === "actions/upload-artifact@v4");
    expect(upload?.with).toMatchObject({
      "if-no-files-found": "error",
      "retention-days": 1,
      "compression-level": 0,
    });
    expect(workflowSource).not.toMatch(/\b(?:ssh|scp|rsync)\b/u);
    expect(workflowSource).not.toContain("46.225.20.177");
  });

  it("verifies the exact manifest, checksums and byte counts before promotion", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "agent-sozluk-bundle-test."));
    const candidateSha = "a".repeat(40);
    const imageId = `sha256:${"b".repeat(64)}`;
    const image = Buffer.from("image-archive");
    const runtime = Buffer.from("runtime-archive");
    const imageHash = sha256(image);
    const runtimeHash = sha256(runtime);
    try {
      writeFileSync(path.join(directory, "app-image.tar.zst"), image);
      writeFileSync(path.join(directory, "runtime-release.tar.zst"), runtime);
      writeFileSync(
        path.join(directory, "manifest.env"),
        [
          "format=agent-sozluk-release-v1",
          `source_sha=${candidateSha}`,
          `image_ref=agent-sozluk:${candidateSha}`,
          `image_id=${imageId}`,
          "runtime_abi=linux-x64-glibc-node-abi-127",
          "image_archive=app-image.tar.zst",
          `image_sha256=${imageHash}`,
          `image_bytes=${image.length}`,
          "runtime_archive=runtime-release.tar.zst",
          `runtime_sha256=${runtimeHash}`,
          `runtime_bytes=${runtime.length}`,
          `total_bytes=${image.length + runtime.length}`,
          "",
        ].join("\n"),
      );
      writeFileSync(
        path.join(directory, "SHA256SUMS"),
        `${imageHash}  app-image.tar.zst\n${runtimeHash}  runtime-release.tar.zst\n`,
      );
      const receipt = JSON.parse(
        execFileSync(process.execPath, [verifierPath, directory, candidateSha], {
          encoding: "utf8",
        }),
      ) as { imageId: string; sourceSha: string; totalBytes: number };
      expect(receipt).toEqual(
        expect.objectContaining({
          imageId,
          sourceSha: candidateSha,
          totalBytes: image.length + runtime.length,
        }),
      );

      writeFileSync(path.join(directory, "app-image.tar.zst"), Buffer.alloc(image.length, 1));
      const tampered = spawnSync(process.execPath, [verifierPath, directory, candidateSha], {
        encoding: "utf8",
      });
      expect(tampered.status).toBe(90);
      expect(tampered.stderr).toContain("RELEASE_ARTIFACT_FAIL code=IMAGE_HASH_MISMATCH");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("promotes the exact artifact inertly before the existing guarded cutover", () => {
    expect(wrapper).toContain("--artifact-run");
    expect(wrapper).toContain("ARTIFACT_RUN_REQUIRED");
    expect(wrapper).toContain("Release Candidate Bundle");
    expect(wrapper).toContain("--workflow CI");
    expect(wrapper).toContain("/Volumes/GB/agent-sozluk-release-artifacts");
    expect(wrapper).toContain("actions/artifacts/$artifact_id/zip");
    expect(wrapper).toContain(".artifact-digest");
    expect(wrapper).toContain("shasum -a 256");
    expect(wrapper).toContain("ARTIFACT_ZIP_PATH_INVALID");
    expect(wrapper).toContain("verify-release-bundle.mjs");
    expect(wrapper).toContain("zstd -q --decompress --stdout");
    expect(wrapper).toContain("install-release-artifact-remote.sh");
    expect(wrapper).toContain("--build-on-host");
    expect(wrapper).toContain("AMBIGUOUS_RELEASE_SOURCE");
    expect(installer).toContain("docker load");
    expect(installer).toContain("RELEASE_ARTIFACT_RUNTIME_READY");
    expect(installer).toContain("sudo mv -T");
    expect(installer).not.toContain("systemctl");
    expect(installer).not.toContain("docker compose");
    expect(installer).not.toContain("/runtime/current");
    expect(remote).toContain("scripts/assemble-runtime-release.sh");
    expect(remote).not.toContain("/usr/bin/pnpm install --prod --frozen-lockfile");
  });

  it("retains no secret material and removes only the exact successful local download", () => {
    expect(verifier).not.toMatch(/\b(?:token|password|cookie|secret)\b/iu);
    expect(installer).not.toMatch(/\b(?:token|password|cookie|secret)\b/iu);
    expect(wrapper).not.toContain("source manifest.env");
    expect(wrapper).toContain('test "$artifact_dir" = "$expected_artifact_dir"');
    expect(wrapper).toContain('find "$artifact_dir" -xdev -depth -delete');
    expect(statSync(verifierPath).isFile()).toBe(true);
  });
});
