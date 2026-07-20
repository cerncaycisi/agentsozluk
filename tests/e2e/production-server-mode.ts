export function isProductionE2EServerMode(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return Boolean(environment.CI) || environment.E2E_PRODUCTION_SERVER === "true";
}
