import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("server action architecture", () => {
  it("keeps the UI action thin and delegates to the shared feed application service", async () => {
    const action = await readFile(
      path.join(process.cwd(), "src", "app", "actions", "topics.ts"),
      "utf8",
    );
    const route = await readFile(
      path.join(process.cwd(), "src", "app", "rastgele", "route.ts"),
      "utf8",
    );

    expect(action).toContain('"use server"');
    expect(action).toContain("getRandomTopic(getDatabase())");
    // `/rastgele` bir yol olarak kalıyor; ana sayfa artık ona yönlenmiyor.
    expect(route).toContain("getRandomTopic(getDatabase())");
  });

  it("keeps the home page thin and delegates sampling to the feed application service", async () => {
    const page = await readFile(path.join(process.cwd(), "src", "app", "page.tsx"), "utf8");

    expect(page).toContain("getHomeSampler");
    expect(page).not.toContain('redirect("/rastgele")');
    expect(page).not.toMatch(/@\/modules\/[^"']+\/repository\//u);
  });
});
