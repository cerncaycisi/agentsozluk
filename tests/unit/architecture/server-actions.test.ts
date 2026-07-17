import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("server action architecture", () => {
  it("keeps the UI action thin and delegates to the shared feed application service", async () => {
    const action = await readFile(
      path.join(process.cwd(), "src", "app", "actions", "topics.ts"),
      "utf8",
    );
    const page = await readFile(path.join(process.cwd(), "src", "app", "page.tsx"), "utf8");

    expect(action).toContain('"use server"');
    expect(action).toContain("getRandomTopic(getDatabase())");
    expect(page).toContain("action={randomTopicAction}");
  });
});
