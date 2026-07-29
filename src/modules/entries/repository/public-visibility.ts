import { Prisma } from "@prisma/client";

/**
 * Canonical seed entries stay immutable. A separate audited overlay can remove
 * an unsafe seed entry from public discovery without changing the corpus row.
 */
export const publiclyVisibleEntryWhere = {
  AND: [
    {
      OR: [{ seedVisibility: { is: null } }, { seedVisibility: { is: { suppressed: false } } }],
    },
  ],
} satisfies Prisma.EntryWhereInput;

export const publiclyVisibleEntrySql = (alias: Prisma.Sql) =>
  Prisma.sql`NOT EXISTS (
    SELECT 1
    FROM "seed_entry_visibility" AS seed_visibility
    WHERE seed_visibility."entryId" = ${alias}.id
      AND seed_visibility."suppressed" = true
  )`;
