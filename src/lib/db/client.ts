import { PrismaClient } from "@prisma/client";
import { getEnvironment } from "@/config/env";

const globalDatabase = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const environment = getEnvironment();
  return new PrismaClient({
    log: environment.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export function getDatabase(): PrismaClient {
  globalDatabase.prisma ??= createClient();
  return globalDatabase.prisma;
}

export type DatabaseClient = PrismaClient;
