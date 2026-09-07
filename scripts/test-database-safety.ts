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
  /*
    Yol TEK parça olmalı. Ölçüldü (7 Eylül 2026): bu kontrol yokken
    `postgresql://host/agentsz_uiux_dev/agent_sozluk_m1_test` adresi korumadan
    GEÇİYOR (metin `_test` ile bitiyor) ama Prisma İLK parçaya bağlanıyor —
    yani `agentsz_uiux_dev`'e. Entegrasyon testleri o veritabanını temizledi.

    Aynı kalıp üretimi de hedefleyebilirdi: `.../agent_sozluk/x_test` korumadan
    geçip `agent_sozluk`'a bağlanırdı. `psql` bu adresi reddediyor, Prisma
    kabul ediyor; koruma metne değil, istemcinin ÇÖZDÜĞÜ ada bakmalı.
  */
  if (databaseName.includes("/"))
    throw new Error(
      `${caller} refuses a multi-segment TEST_DATABASE_URL path ("${databaseName}"): the client would connect to the first segment.`,
    );
  if (!safeTestDatabaseName.test(databaseName)) {
    throw new Error(
      `${caller} refuses to mutate a database unless its name is 'test' or ends with '_test' or '-test'.`,
    );
  }

  return value;
}
