import { formatSecretFindings, scanRepositorySecrets } from "./repository-secret-scan";

try {
  const findings = scanRepositorySecrets(process.cwd());
  if (findings.length > 0) {
    process.stderr.write(`${formatSecretFindings(findings)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Repository and reachable Git history secret scan passed.\n");
  }
} catch {
  process.stderr.write("Repository secret scan could not complete.\n");
  process.exitCode = 1;
}
