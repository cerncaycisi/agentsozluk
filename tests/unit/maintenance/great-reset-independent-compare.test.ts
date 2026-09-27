import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  compareForIndependentRestore,
  compareLiveWithRestored,
  type GreatResetReceipt,
} from "../../../src/modules/maintenance/repository/great-reset-receipt";

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

type Parts = {
  tables: GreatResetReceipt["tables"];
  schema: string;
  schemaNormalized?: string;
  details: GreatResetReceipt["details"];
};

// Bölüm özetleri ayrıntılardan hesaplanır: makbuz iç tutarlıdır. Değerler gerçek makbuzdaki gibi
// JSON kodlu metindir.
const v = (text: string) => JSON.stringify(text);

function receipt(parts: Parts): GreatResetReceipt {
  const sections = {
    content: sha256(parts.tables),
    sequences: sha256(parts.details.sequences),
    schema: parts.schema,
    schemaNormalized: parts.schemaNormalized ?? parts.schema,
    security: sha256(parts.details.security),
    database: sha256(parts.details.database),
  };
  return {
    version: 3,
    sha256: sha256(sections),
    sections,
    tables: parts.tables,
    details: parts.details,
  };
}

function cluster(bootstrap: string, comment: string, collate = "en_US.utf8"): Parts {
  return {
    tables: { users: { rows: 3, sha256: "a".repeat(64) } },
    schema: "b".repeat(64),
    details: {
      sequences: { entries_public_id_seq: v("[2147483648, false]") },
      security: {
        "relation:users": v('["r", "agent_sozluk", null, false, false]'),
        [`role:${bootstrap}`]: v("[true, true, true, true, true, true, true, -1, null]"),
        "role:agent_sozluk": v("[false, true, false, false, false, false, false, -1, null]"),
        // Gerçek makbuzdaki jsonb biçimi (", " ayırıcı).
        [`membership:["pg_read_all_stats", "pg_monitor", "${bootstrap}"]`]:
          v("[false, true, true]"),
        "type:gtrgm": v(`["${bootstrap}", null]`),
        "extensionMember:type gtrgm": v(`["${bootstrap}", null]`),
        "language:plpgsql": v(`["${bootstrap}", true, null]`),
        "systemFunction:lo_import(text)": v(`{${bootstrap}=X/${bootstrap}}`),
        "systemNamespace:pg_catalog": v(
          `["${bootstrap}", "{${bootstrap}=UC/${bootstrap},=U/${bootstrap}}"]`,
        ),
      },
      database: {
        comment,
        "extension:pg_trgm": v("agent_sozluk"),
        "extension:plpgsql": v(bootstrap),
        locale: v(`["UTF8", "${collate}", "${collate}", "c", null, null, -1, false, "pg_default"]`),
      },
    },
  };
}

const production = () => cluster("postgres", "null");
const operator = () => cluster("agent", v("agentsozluk:great-reset:synthetic:v1"), "C.UTF-8");

function variant(base: Parts, change: (parts: Parts) => void): GreatResetReceipt {
  const copy = structuredClone(base);
  change(copy);
  return receipt(copy);
}

describe("bağımsız restore karşılaştırması (politika i)", () => {
  it("yalnız kurulum süper kullanıcısı adı yapısal eşlenir; locale ve sentetik yorum raporlanır", () => {
    const result = compareForIndependentRestore(receipt(production()), receipt(operator()));
    expect(result.blocking).toEqual([]);
    expect(result.equal).toBe(true);
    expect(result.environment.map((item) => item.key)).toEqual([
      "database:comment",
      "database:locale",
    ]);
    expect(result.environment[1]).toMatchObject({
      expected: expect.stringContaining("en_US.utf8"),
    });
  });

  it("bilinmeyen, tek taraflı ya da yetki/ayar farkı engeller", () => {
    const cases: [string, (parts: Parts) => void][] = [
      [
        "security:role:agent_sozluk",
        (p) => {
          p.details.security["role:agent_sozluk"] = v(
            "[true, true, false, false, false, false, false, -1, null]",
          );
        },
      ],
      [
        "security:role:agent_sozluk_np",
        (p) => {
          p.details.security["role:agent_sozluk_np"] = v(
            "[false, true, false, false, true, false, false, -1, null]",
          );
        },
      ],
      [
        "security:relation:users",
        (p) => {
          p.details.security["relation:users"] = v('["r", "agent", null, false, false]');
        },
      ],
      [
        "security:systemFunction:lo_import(text)",
        (p) => {
          p.details.security["systemFunction:lo_import(text)"] = v("{agent=X/agent,=X/agent}");
        },
      ],
      [
        "database:setting:db:*",
        (p) => {
          p.details.database["setting:db:*"] = v("{statement_timeout=0}");
        },
      ],
      [
        "database:extension:pg_trgm",
        (p) => {
          p.details.database["extension:pg_trgm"] = v("agent");
        },
      ],
      [
        "database:locale",
        (p) => {
          p.details.database.locale = v(
            '["LATIN1", "C.UTF-8", "C.UTF-8", "c", null, null, -1, false, "pg_default"]',
          );
        },
      ],
      [
        "database:comment",
        (p) => {
          p.details.database.comment = v("başka");
        },
      ],
    ];
    for (const [key, change] of cases) {
      const result = compareForIndependentRestore(
        receipt(production()),
        variant(operator(), change),
      );
      expect(result.equal, key).toBe(false);
      expect(result.blocking, key).toContain(key);
    }
  });

  it("içerik, şema ve sequence farkı engeller; tutarsız makbuz reddedilir", () => {
    const content = compareForIndependentRestore(
      receipt(production()),
      variant(operator(), (p) => {
        p.tables.users = { rows: 2, sha256: "c".repeat(64) };
      }),
    );
    expect(content.blocking).toEqual(["section:content", "table:users"]);
    const schema = compareForIndependentRestore(
      receipt(production()),
      variant(operator(), (p) => {
        p.schemaNormalized = "d".repeat(64);
      }),
    );
    expect(schema.blocking).toEqual(["section:schemaNormalized"]);
    const tampered = receipt(operator());
    tampered.details.security["relation:users"] = v('["r", "x", null, false, false]');
    expect(compareForIndependentRestore(receipt(production()), tampered).blocking).toContain(
      "receipt:independent-inconsistent",
    );
  });

  it("canlı ↔ restore: ham şema farkı yalnız kanonik şema eşitse kabul edilir", () => {
    const live = receipt(production());
    const restored = variant(production(), (p) => {
      p.schema = "e".repeat(64);
      p.schemaNormalized = "b".repeat(64);
    });
    expect(compareLiveWithRestored(live, restored).equal).toBe(true);
    const lost = variant(production(), (p) => {
      p.schema = "e".repeat(64);
      p.schemaNormalized = "f".repeat(64);
    });
    expect(compareLiveWithRestored(live, lost)).toMatchObject({
      equal: false,
      sections: ["schemaNormalized"],
    });
  });
  it("Astra 5. tur karşı örnekleri", () => {
    // RLS koşulundaki metin eşlenmez: farklı koşul engeller; rol listesi alanı eşlenir.
    const policy = (roles: string[], qual: string) =>
      v(JSON.stringify(["r", true, roles, qual, null]).replace(/,/g, ", "));
    const withPolicy = (bootstrap: string, qual: string, roles: string[]) => (p: Parts) => {
      p.details.security["policy:users.p"] = policy(roles, qual);
      void bootstrap;
    };
    const prod = variant(production(), withPolicy("postgres", "postgres", ["postgres", "a"]));
    expect(
      compareForIndependentRestore(
        prod,
        variant(operator(), withPolicy("agent", "agent", ["agent", "a"])),
      ).blocking,
    ).toEqual(["security:policy:users.p"]);
    expect(
      compareForIndependentRestore(
        prod,
        variant(operator(), withPolicy("agent", "postgres", ["agent", "a"])),
      ).equal,
    ).toBe(true);
    // İç içe JSON'un yeniden yazımı aynı politikayı farklılaştırmaz.
    const nested = (p: Parts) => {
      p.details.security["policy:users.q"] = v('["r", true, ["a", "b"], null, null]');
    };
    expect(
      compareForIndependentRestore(variant(production(), nested), variant(operator(), nested))
        .equal,
    ).toBe(true);
    // Eşleme sonrası çakışma engeller (ek süper kullanıcı gizlenemez).
    const collision = compareForIndependentRestore(
      receipt(production()),
      variant(operator(), (p) => {
        p.details.security["role:postgres"] = v(
          "[true, true, true, true, true, true, true, -1, null]",
        );
      }),
    );
    expect(collision.blocking).toContain("security:key-collision:role:postgres");
    // Tırnaklı rol adı içeren ACL yapısal ayrıştırılır.
    const quoted = (bootstrap: string) => (p: Parts) => {
      p.details.security["systemFunction:f()"] = v(`{"\\"a=b\\"=r/${bootstrap}"}`);
    };
    expect(
      compareForIndependentRestore(
        variant(production(), quoted("postgres")),
        variant(operator(), quoted("agent")),
      ).equal,
    ).toBe(true);
    // Ayraç içeren rol adlı üyelik anahtarı belirsiz değil.
    const member = (bootstrap: string) => (p: Parts) => {
      p.details.security[`membership:${JSON.stringify([bootstrap, "x>y", bootstrap])}`] =
        v("[false, true, true]");
    };
    expect(
      compareForIndependentRestore(
        variant(production(), member("postgres")),
        variant(operator(), member("agent")),
      ).equal,
    ).toBe(true);
    // Yorum ve ayar değerindeki rol adı metni eşlenmez.
    for (const [key, left, right] of [
      ["comment", v("postgres"), v("agent")],
      ['setting:["db","*"]', v("{app.path=X/postgres}"), v("{app.path=X/agent}")],
    ] as const) {
      const result = compareForIndependentRestore(
        variant(production(), (p) => {
          p.details.database[key] = left;
        }),
        variant(operator(), (p) => {
          p.details.database[key] = right;
        }),
      );
      expect(result.blocking, key).toContain(`database:${key}`);
    }
  });
});
