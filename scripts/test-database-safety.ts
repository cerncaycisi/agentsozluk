const safeTestDatabaseName = /(?:^|[_-])test$/iu;

export function requireTestDatabaseUrl(value: string | undefined, caller: string): string {
  if (!value) throw new Error(`${caller} requires TEST_DATABASE_URL.`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${caller} received an invalid TEST_DATABASE_URL.`);
  }

  if (url.protocol !== "postgresql:") {
    throw new Error(`${caller} requires a PostgreSQL TEST_DATABASE_URL.`);
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/gu, ""));
  } catch {
    throw new Error(`${caller} received an invalid TEST_DATABASE_URL database name.`);
  }
  if (!safeTestDatabaseName.test(databaseName)) {
    throw new Error(
      `${caller} refuses to mutate a database unless its name is 'test' or ends with '_test' or '-test'.`,
    );
  }

  return value;
}
