import { PrismaClient } from "@prisma/client";
import { getEnvironment } from "@/config/env";

const globalDatabase = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const environment = getEnvironment();
  return new PrismaClient({
    log: environment.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const database = globalDatabase.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalDatabase.prisma = database;

export type DatabaseClient = PrismaClient;
