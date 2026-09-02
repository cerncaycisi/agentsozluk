import { describe, expect, it } from "vitest";
import { assertResettableDatabaseUrl } from "../../../scripts/db-reset-guard";

/*
  `db:reset` bütün veriyi siler ve onay sormaz. Tek koruma `TEST_DATABASE_URL`
  için yazılmıştı ama `prisma migrate reset` `DATABASE_URL` okuyor — yani o
  koruma bu komuta hiç uygulanmıyordu (Codex §4.9).

  Üç katman ayrı ayrı sınanıyor: biri atlansa diğerleri tutmalı. Tek regex'e
  güvenmek, o regex yanlış yazıldığında geriye hiçbir şey bırakmaz.
*/
describe("db:reset koruması", () => {
  const local = (name: string) => `postgresql://u:p@localhost:5432/${name}`;

  it("üretim veritabanı adını reddeder", () => {
    expect(() => assertResettableDatabaseUrl(local("agent_sozluk"), "agent_sozluk")).toThrow(
      /name must end with/u,
    );
  });

  it("adı uygun olsa bile uzak host'u reddeder", () => {
    // Üretim veritabanı uzakta; ad kalıbı yanlışlıkla eşleşse bile host tutar.
    expect(() =>
      assertResettableDatabaseUrl(
        "postgresql://u:p@10.0.0.5:5432/agent_sozluk_test",
        "agent_sozluk_test",
      ),
    ).toThrow(/only loopback hosts/u);
  });

  it("açık onay olmadan çalışmaz", () => {
    expect(() => assertResettableDatabaseUrl(local("agentsz_x_test"), undefined)).toThrow(
      /AGENT_DB_RESET_CONFIRM/u,
    );
  });

  it("onay başka bir veritabanının adıysa çalışmaz", () => {
    // Kopyala-yapıştır kazasını yakalar: onay HEDEFİN adı olmalı.
    expect(() => assertResettableDatabaseUrl(local("agentsz_a_test"), "agentsz_b_test")).toThrow(
      /AGENT_DB_RESET_CONFIRM/u,
    );
  });

  it("üç katman da sağlandığında geçer", () => {
    expect(assertResettableDatabaseUrl(local("agentsz_uiux_dev"), "agentsz_uiux_dev")).toBe(
      "agentsz_uiux_dev",
    );
    expect(assertResettableDatabaseUrl(local("agent_sozluk_m1_test"), "agent_sozluk_m1_test")).toBe(
      "agent_sozluk_m1_test",
    );
  });

  it("eksik ya da PostgreSQL olmayan URL'yi reddeder", () => {
    expect(() => assertResettableDatabaseUrl(undefined, "x")).toThrow(/requires DATABASE_URL/u);
    expect(() => assertResettableDatabaseUrl("mysql://u:p@localhost/x_test", "x_test")).toThrow(
      /requires a PostgreSQL/u,
    );
  });
});
