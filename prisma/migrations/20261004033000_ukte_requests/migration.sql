CREATE TYPE "UkteStatus" AS ENUM ('OPEN', 'WITHDRAWN', 'HIDDEN');
CREATE TABLE "ukte_requests" (
  "id" UUID NOT NULL,
  "title" VARCHAR(400) NOT NULL,
  "normalizedTitle" VARCHAR(400) NOT NULL,
  "targetKeys" TEXT[] NOT NULL,
  "slug" VARCHAR(400) NOT NULL,
  "requestedById" UUID NOT NULL,
  "status" "UkteStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMPTZ(3),
  CONSTRAINT "ukte_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ukte_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ukte_requests_shape_check" CHECK (
    "version" > 0 AND length("normalizedTitle") BETWEEN 2 AND 100
    AND cardinality("targetKeys") BETWEEN 1 AND 6
    AND "normalizedTitle" = ANY("targetKeys")
    AND (("status" = 'OPEN' AND "closedAt" IS NULL)
      OR ("status" <> 'OPEN' AND "closedAt" IS NOT NULL AND "closedAt" >= "createdAt"))
  )
);
CREATE UNIQUE INDEX "ukte_requests_one_open_title" ON "ukte_requests"("normalizedTitle") WHERE "status" = 'OPEN';
CREATE INDEX "ukte_requests_status_createdAt_id_idx" ON "ukte_requests"("status", "createdAt", "id");
CREATE INDEX "ukte_requests_normalizedTitle_status_idx" ON "ukte_requests"("normalizedTitle", "status");
CREATE INDEX "ukte_requests_requestedById_idx" ON "ukte_requests"("requestedById");
