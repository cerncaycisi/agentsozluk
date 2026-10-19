import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/http/errors";
import {
  focusIdArray,
  focusOfferCooldownMs,
  focusRunEligible,
  focusWindowError,
  isFocusListActive,
  selectFocusTopic,
  withFocusTopic,
  type FocusListWindow,
  type FocusRunContext,
  type FocusTopicState,
} from "@/modules/agents/domain/focus-list";
import { browsableTopicMenu, interestTopicLimit } from "@/modules/agents/domain/runtime-browse";
import { focusListCreateSchema } from "@/modules/agents/validation/focus-list-schemas";
import { focusFailureCode, readFocusListInput } from "../../../scripts/agent-focus";

/*
  Süreli odak listesi seçim kuralları (Gökhan kararı, 19 Ekim 2026). Seçim saf fonksiyondur;
  veritabanı yolu tests/integration/agent-focus-list.test.ts içinde.
*/

const day = 24 * 3_600_000;
const start = new Date("2026-10-26T09:00:00.000Z");
const now = new Date(start.getTime() + 5 * day);
const agent = "11111111-1111-4111-8111-111111111111";
const otherAgent = "22222222-2222-4222-8222-222222222222";
const topics = ["t-a", "t-b", "t-c"];

function list(overrides: Partial<FocusListWindow> = {}): FocusListWindow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    topicIds: topics,
    agentProfileIds: [agent],
    startsAt: start,
    endsAt: new Date(start.getTime() + 14 * day),
    endedAt: null,
    ...overrides,
  };
}

function run(overrides: Partial<FocusRunContext> = {}): FocusRunContext {
  return {
    agentProfileId: agent,
    runType: "NORMAL_WAKE",
    trigger: "STOCHASTIC_TICK",
    seed: "run-1",
    now,
    ...overrides,
  };
}

function state(topicId: string, overrides: Partial<FocusTopicState> = {}): FocusTopicState {
  return {
    topicId,
    eligible: true,
    agentEntriesSinceStart: 0,
    writtenByAgentSinceStart: false,
    lastOfferedAt: null,
    ...overrides,
  };
}

const freshStates = () => topics.map((topicId) => state(topicId));

describe("süreli odak listesi seçimi", () => {
  it("uygun yazarın doğal koşusunda tam bir başlık seçer, seçim deterministiktir", () => {
    const first = selectFocusTopic(list(), run(), freshStates());
    expect(topics).toContain(first);
    expect(selectFocusTopic(list(), run(), freshStates())).toBe(first);
  });

  it("seçili olmayan yazar, elle koşu ve NORMAL_WAKE dışı koşu odak görmez", () => {
    expect(selectFocusTopic(list(), run({ agentProfileId: otherAgent }), freshStates())).toBeNull();
    expect(selectFocusTopic(list(), run({ trigger: "ADMIN_BULK" }), freshStates())).toBeNull();
    expect(selectFocusTopic(list(), run({ trigger: "MANUAL" }), freshStates())).toBeNull();
    expect(selectFocusTopic(list(), run({ runType: "ENTRY_BURST" }), freshStates())).toBeNull();
    expect(selectFocusTopic(list(), run({ runType: "REFLECTION" }), freshStates())).toBeNull();
    expect(focusRunEligible(list(), run({ trigger: "SCHEDULER_SLOT" }))).toBe(true);
  });

  it("pencere bitince, başlamadan önce ve erken kapatılınca hiçbir şey seçmez", () => {
    const ended = list({ endsAt: new Date(now.getTime()) });
    expect(isFocusListActive(ended, now)).toBe(false);
    expect(selectFocusTopic(ended, run(), freshStates())).toBeNull();
    expect(
      selectFocusTopic(list({ startsAt: new Date(now.getTime() + 1) }), run(), freshStates()),
    ).toBeNull();
    expect(selectFocusTopic(list({ endedAt: now }), run(), freshStates())).toBeNull();
    expect(selectFocusTopic(null, run(), freshStates())).toBeNull();
    expect(isFocusListActive(list(), now)).toBe(true);
  });

  it("aynı yazara 3 gün içinde sunulan başlığı atlar, süre dolunca yeniden sunar", () => {
    const recent = new Date(now.getTime() - focusOfferCooldownMs + 60_000);
    const states = [
      state("t-a", { lastOfferedAt: recent }),
      state("t-b", { lastOfferedAt: recent }),
      state("t-c", { lastOfferedAt: recent }),
    ];
    expect(selectFocusTopic(list(), run(), states)).toBeNull();
    const old = new Date(now.getTime() - focusOfferCooldownMs);
    states[1] = state("t-b", { lastOfferedAt: old });
    expect(selectFocusTopic(list(), run(), states)).toBe("t-b");
  });

  it("dönüşüm: hiç sunulmamış başlık önce, sonra en uzun süredir sunulmamış", () => {
    const states = [
      state("t-a", { lastOfferedAt: new Date(now.getTime() - 4 * day) }),
      state("t-b", { lastOfferedAt: new Date(now.getTime() - 5 * day) }),
      state("t-c"),
    ];
    expect(selectFocusTopic(list(), run(), states)).toBe("t-c");
    states[2] = state("t-c", { lastOfferedAt: new Date(now.getTime() - 3.5 * day) });
    expect(selectFocusTopic(list(), run(), states)).toBe("t-b");
    // Eşitlikte koşu kimliği karması bozar; farklı koşular farklı başlık görebilir.
    const seen = new Set(
      Array.from({ length: 20 }, (_, index) =>
        selectFocusTopic(list(), run({ seed: `run-${index}` }), freshStates()),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("pencerede 2 ajan entry'si alan başlık ve yazarın zaten yazdığı başlık düşer", () => {
    expect(
      selectFocusTopic(list({ topicIds: ["t-a"] }), run(), [
        state("t-a", { agentEntriesSinceStart: 2 }),
      ]),
    ).toBeNull();
    expect(
      selectFocusTopic(list({ topicIds: ["t-a"] }), run(), [
        state("t-a", { agentEntriesSinceStart: 1 }),
      ]),
    ).toBe("t-a");
    expect(
      selectFocusTopic(list({ topicIds: ["t-a"] }), run(), [
        state("t-a", { writtenByAgentSinceStart: true }),
      ]),
    ).toBeNull();
  });

  it("uygun olmayan (gizli, birleşmiş, kilitli, ince) ve durumu bilinmeyen başlığı atlar", () => {
    expect(
      selectFocusTopic(list(), run(), [
        state("t-a", { eligible: false }),
        state("t-b", { eligible: false }),
        state("t-c"),
      ]),
    ).toBe("t-c");
    // Durumu okunamayan (silinmiş) başlık hiç seçilmez.
    expect(selectFocusTopic(list(), run(), [state("t-a", { eligible: false })])).toBeNull();
    expect(selectFocusTopic(list(), run(), [])).toBeNull();
  });
});

describe("odak başlığı okuma menüsünde", () => {
  it("ilgi listesinin başına tek öğe olarak girer, sınır ve tekillik korunur", () => {
    const interests = Array.from({ length: interestTopicLimit }, (_, index) => ({
      id: `i-${index}`,
      title: `ilgi ${index}`,
    }));
    const merged = withFocusTopic(interests, { id: "t-a", title: "odak" }, interestTopicLimit);
    expect(merged).toHaveLength(interestTopicLimit);
    expect(merged[0]).toEqual({ id: "t-a", title: "odak" });
    const duplicate = withFocusTopic(
      [
        { id: "x", title: "x" },
        { id: "t-a", title: "odak" },
      ],
      { id: "t-a", title: "odak" },
      interestTopicLimit,
    );
    expect(duplicate.map(({ id }) => id)).toEqual(["t-a", "x"]);
    expect(withFocusTopic(interests, null, interestTopicLimit)).toEqual(interests);
  });

  it("menüde sıradan bir 'ilgi' öğesidir ve en çok bir tane bulunur", () => {
    const interestTopics = withFocusTopic(
      [{ id: "i-0", title: "ilgi" }],
      { id: "t-a", title: "odak" },
      interestTopicLimit,
    );
    const menu = browsableTopicMenu({ interestTopics });
    expect(menu[0]).toEqual({ id: "t-a", title: "odak", hint: "ilgi" });
    expect(menu.filter(({ id }) => topics.includes(id))).toHaveLength(1);
  });
});

describe("odak listesi girdisi", () => {
  const input = {
    ...valid(),
    topics: [5182, "akgun-seramik-duratiles--4935", "4642"],
    agents: ["@Yazar_a", "yazar_b", "yazar_c", "yazar_d", "yazar_e", "yazar_f"],
  };

  it("publicId, slug--publicId ve kullanıcı adlarını normalleştirir", () => {
    const parsed = focusListCreateSchema.parse(input);
    expect(parsed.topics).toEqual([5182n, 4935n, 4642n]);
    expect(parsed.agents[0]).toBe("yazar_a");
  });

  it("15'ten fazla başlığı, 6–10 dışı yazar sayısını ve tekrarı reddeder", () => {
    const many = Array.from({ length: 16 }, (_, index) => index + 1);
    expect(focusListCreateSchema.safeParse({ ...input, topics: many }).success).toBe(false);
    expect(
      focusListCreateSchema.safeParse({ ...input, agents: input.agents.slice(0, 5) }).success,
    ).toBe(false);
    expect(
      focusListCreateSchema.safeParse({
        ...input,
        agents: [...input.agents, "g", "h", "i", "j", "k"],
      }).success,
    ).toBe(false);
    expect(
      focusListCreateSchema.safeParse({ ...input, topics: [5182, "baslik--5182"] }).success,
    ).toBe(false);
    expect(focusListCreateSchema.safeParse({ ...input, topics: ["baslik"] }).success).toBe(false);
    expect(focusListCreateSchema.safeParse({ ...input, extra: true }).success).toBe(false);
  });

  it("pencere en çok 14 gün ve gelecekte biter", () => {
    expect(focusWindowError(start, new Date(start.getTime() + 14 * day))).toBeNull();
    expect(focusWindowError(start, new Date(start.getTime() + 14 * day + 1))).toBe(
      "FOCUS_WINDOW_TOO_LONG",
    );
    expect(focusWindowError(start, start)).toBe("FOCUS_WINDOW_ENDS_IN_PAST");
  });

  it("JSONB kimlik dizisini kapalı yönde okur", () => {
    expect(focusIdArray(["a", 1, "", null, "b"])).toEqual(["a", "b"]);
    expect(focusIdArray({ a: 1 })).toEqual([]);
  });
});

describe("agent:focus operatör komutu", () => {
  it("liste dosyasını okur, gerekçeyi ortamdan alır", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "agent-focus-"));
    const file = path.join(directory, "liste.json");
    const withoutReason: Partial<ReturnType<typeof valid>> = valid();
    delete withoutReason.reason;
    writeFileSync(file, JSON.stringify(withoutReason));
    const parsed = readFocusListInput(file, "odakli deneme T0 acilisi");
    expect(parsed.reason).toBe("odakli deneme T0 acilisi");
    expect(() => readFocusListInput(file, undefined)).toThrow(z.ZodError);
    writeFileSync(file, JSON.stringify({ ...withoutReason, reason: "dosyadan gelen gerekce" }));
    // Dosyadaki gerekçe yok sayılır; ortam gerekçesi kazanır.
    expect(readFocusListInput(file, "ortam gerekcesi uzun").reason).toBe("ortam gerekcesi uzun");
  });

  it("yalnız güvenli hata kodu üretir", () => {
    expect(
      focusFailureCode(
        new AppError("AGENT_FOCUS_LIST_INVALID", 422, "x", undefined, undefined, {
          reason: "FOCUS_TOPIC_INELIGIBLE",
          publicIds: ["5182"],
        }),
      ),
    ).toBe("AGENT_FOCUS_LIST_INVALID reason=FOCUS_TOPIC_INELIGIBLE");
    expect(focusFailureCode(new AppError("AGENT_FOCUS_LIST_CONFLICT", 409, "x"))).toBe(
      "AGENT_FOCUS_LIST_CONFLICT",
    );
    expect(focusFailureCode(new SyntaxError("Unexpected token"))).toBe("OPERATOR_INPUT_INVALID");
    expect(focusFailureCode(new Error("postgres://secret"))).toBe("INTERNAL_ERROR");
  });
});

function valid() {
  return {
    label: "mimarlık ve sinema",
    topics: [5182, "4935"],
    agents: ["yazar_a", "yazar_b", "yazar_c", "yazar_d", "yazar_e", "yazar_f"],
    endsAt: "2026-11-09T09:00:00Z",
    reason: "odakli deneme T0 acilisi",
  };
}
