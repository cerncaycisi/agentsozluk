import path from "node:path";
import { describe, expect, it } from "vitest";
import { redactSensitive, resolveRouteFile } from "../../scripts/operator-admin";

/*
  Operatör yönetici komutu (30 Eylül 2026): API yolunu gerçek rota dosyasına çözer ve
  çıktıda kimlik bilgisi taşıyan alanları maskeler.
*/
const appRoot = path.resolve("src/app");

describe("operatör yönetici komutu", () => {
  it("sabit ve dinamik yol parçalarını rota dosyasına çözer", () => {
    expect(resolveRouteFile(appRoot, "/api/v1/admin/agent-settings")?.file).toBe(
      path.join(appRoot, "api/v1/admin/agent-settings/route.ts"),
    );
    const dynamic = resolveRouteFile(
      appRoot,
      "/api/v1/admin/agent-sources/4f2c9b1e-2d3a-4b5c-8d6e-7f8091a2b3c4",
    );
    expect(dynamic?.file).toBe(
      path.join(appRoot, "api/v1/admin/agent-sources/[sourceId]/route.ts"),
    );
    expect(dynamic?.params).toEqual({ sourceId: "4f2c9b1e-2d3a-4b5c-8d6e-7f8091a2b3c4" });
    expect(resolveRouteFile(appRoot, "/api/v1/admin/olmayan-rota")).toBeNull();
    expect(resolveRouteFile(appRoot, "/api/v1/admin/agent-settings/../../internal")).toBeNull();
    expect(resolveRouteFile(appRoot, "/api/v1/admin/../admin/agent-settings")).toBeNull();
  });

  it("kimlik bilgisi, token, parola ve çerez alanlarını maskeler", () => {
    expect(
      redactSensitive({
        data: {
          credential: "agt_gizli",
          runtimeToken: "x",
          nested: [{ password: "p", name: "görünür" }],
          csrfToken: "c",
          status: "ACTIVE",
        },
      }),
    ).toEqual({
      data: {
        credential: "[gizli]",
        runtimeToken: "[gizli]",
        nested: [{ password: "[gizli]", name: "görünür" }],
        csrfToken: "[gizli]",
        status: "ACTIVE",
      },
    });
  });
});
