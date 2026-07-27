ALTER TABLE "agent_credentials"
ADD COLUMN "runtimeEnrollmentCipher" TEXT;

CREATE TABLE "agent_runtime_credential_sync" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'global',
    "workerId" VARCHAR(200) NOT NULL,
    "desiredFingerprint" VARCHAR(64) NOT NULL,
    "loadedCredentialIds" UUID[] NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_runtime_credential_sync_pkey" PRIMARY KEY ("id")
);
