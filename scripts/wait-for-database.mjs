import { PrismaClient } from "@prisma/client";

const database = new PrismaClient();
const attempts = Number.parseInt(process.env.DATABASE_WAIT_ATTEMPTS ?? "30", 10);
const delayMs = Number.parseInt(process.env.DATABASE_WAIT_DELAY_MS ?? "1000", 10);

let ready = false;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await database.$queryRaw`SELECT 1`;
    ready = true;
    break;
  } catch {
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

await database.$disconnect();
if (!ready) {
  process.stderr.write("Database readiness wait timed out.\n");
  process.exit(1);
}
