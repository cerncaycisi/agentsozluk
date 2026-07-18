import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertAgentLifeLedgerContracts,
  type OpenApiDocument,
  type OpenApiSchema,
} from "../../../scripts/validate-openapi";

let sourceDocument: OpenApiDocument;

function cloneDocument(): OpenApiDocument {
  return structuredClone(sourceDocument);
}

function componentSchema(document: OpenApiDocument, name: string): OpenApiSchema {
  const schema = document.components?.schemas?.[name];
  if (!schema) throw new Error(`Missing ${name} fixture`);
  return schema;
}

function inlineProperty(schema: OpenApiSchema, property: string): OpenApiSchema {
  const candidate = schema.properties?.[property];
  if (!candidate || "$ref" in candidate) throw new Error(`Missing inline ${property} fixture`);
  return candidate;
}

beforeAll(async () => {
  sourceDocument = (await SwaggerParser.parse(
    path.join(process.cwd(), "docs/openapi.yaml"),
  )) as OpenApiDocument;
});

describe("OpenAPI agent life-ledger contracts", () => {
  it("accepts the checked-in cursor, export and strict runtime batch contracts", () => {
    expect(() => assertAgentLifeLedgerContracts(sourceDocument)).not.toThrow();
  });

  it("rejects a runtime payload that stops requiring one of its four arrays", () => {
    const drifted = cloneDocument();
    const payload = componentSchema(drifted, "RuntimeLifeEventsPayloadInput");
    if (!payload.required) throw new Error("Missing payload required fixture");
    payload.required = payload.required.filter((field) => field !== "memoryCandidates");

    expect(() => assertAgentLifeLedgerContracts(drifted)).toThrow(
      /RuntimeLifeEventsPayloadInput required fields mismatch/u,
    );
  });

  it("rejects drift in the bounded observation batch size", () => {
    const drifted = cloneDocument();
    const payload = componentSchema(drifted, "RuntimeLifeEventsPayloadInput");
    inlineProperty(payload, "observations").maxItems = 101;

    expect(() => assertAgentLifeLedgerContracts(drifted)).toThrow(
      /observations has the wrong maximum/u,
    );
  });

  it("rejects loss of the cross-array non-empty requirement", () => {
    const drifted = cloneDocument();
    delete componentSchema(drifted, "RuntimeLifeEventsPayloadInput").anyOf;

    expect(() => assertAgentLifeLedgerContracts(drifted)).toThrow(
      /must require at least one record across arrays/u,
    );
  });

  it("rejects replacing the exact runtime batch response", () => {
    const drifted = cloneDocument();
    const response =
      drifted.paths?.["/api/v1/internal/agent-runtime/runs/{runId}/life-events"]?.post?.responses?.[
        "200"
      ];
    if (!response) throw new Error("Missing runtime life response fixture");
    response.$ref = "#/components/responses/Success";

    expect(() => assertAgentLifeLedgerContracts(drifted)).toThrow(
      /Runtime life-events POST 200 response must reference/u,
    );
  });

  it("rejects loss of the complete-filter NDJSON response media type", () => {
    const drifted = cloneDocument();
    const content = drifted.components?.responses?.AgentLifeReadSuccess?.content;
    if (!content) throw new Error("Missing AgentLifeReadSuccess content fixture");
    delete content["application/x-ndjson"];

    expect(() => assertAgentLifeLedgerContracts(drifted)).toThrow(
      /AgentLifeReadSuccess media types mismatch/u,
    );
  });
});
