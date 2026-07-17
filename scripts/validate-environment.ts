import "dotenv/config";
import { getEnvironment } from "@/config/env";

try {
  getEnvironment();
  process.stdout.write("Environment validation passed.\n");
} catch {
  process.stderr.write("Environment validation failed.\n");
  process.exitCode = 1;
}
