import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Database types are exposed from the data-access boundary so application and
 * domain modules never depend on Prisma directly.
 */
export type DatabaseClient = PrismaClient;
export type TransactionClient = Prisma.TransactionClient;
export type DatabaseExecutor = DatabaseClient | TransactionClient;
export type UserWhereInput = Prisma.UserWhereInput;
export type AuditLogWhereInput = Prisma.AuditLogWhereInput;
