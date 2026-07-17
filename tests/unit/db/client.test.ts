import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaState = vi.hoisted(() => ({ created: 0 }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      prismaState.created += 1;
    }
  },
}));

vi.mock("@/config/env", () => ({
  getEnvironment: () => ({ NODE_ENV: "production" }),
}));

describe("database client", () => {
  beforeEach(() => {
    delete (globalThis as { prisma?: unknown }).prisma;
    prismaState.created = 0;
    vi.resetModules();
  });

  it("reuses one Prisma client in production", async () => {
    const { getDatabase } = await import("@/lib/db/client");

    const first = getDatabase();
    const second = getDatabase();

    expect(second).toBe(first);
    expect(prismaState.created).toBe(1);
  });
});
