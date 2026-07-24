import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("persona source audit entrypoint", () => {
  it("loads through the repository tsx CommonJS path and fails closed on invalid input", () => {
    const root = process.cwd();
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        path.join(root, "scripts/audit-persona-sources.ts"),
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SOURCE_AUDIT_URLS_BASE64: Buffer.from("{}", "utf8").toString("base64"),
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe("SOURCE_AUDIT_FATAL");
    expect(result.stderr).not.toMatch(/top-level await|Transform failed/iu);
  });
});
