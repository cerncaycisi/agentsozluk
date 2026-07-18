import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertAgentMutationSchemaContracts,
  type OpenApiDocument,
  type OpenApiSchema,
} from "../../../scripts/validate-openapi";

let sourceDocument: OpenApiDocument;

function cloneDocument(): OpenApiDocument {
  return structuredClone(sourceDocument);
}

function inlineSchema(
  candidate: OpenApiSchema | { $ref: string } | undefined,
  label: string,
): OpenApiSchema {
  if (!candidate || "$ref" in candidate) throw new Error(`${label} is not an inline schema`);
  return candidate;
}

function creationBranch(document: OpenApiDocument, method: string): OpenApiSchema {
  const createSchema = document.components?.schemas?.AgentCreateInput;
  const creationSchema = inlineSchema(createSchema?.properties?.creation, "creation");
  const branch = creationSchema.oneOf?.find((candidate) => {
    const methodSchema = inlineSchema(candidate.properties?.method, "method");
    return methodSchema.const === method;
  });
  if (!branch) throw new Error(`Missing ${method} creation branch`);
  return branch;
}

beforeAll(async () => {
  sourceDocument = (await SwaggerParser.parse(
    path.join(process.cwd(), "docs/openapi.yaml"),
  )) as OpenApiDocument;
});

describe("OpenAPI agent mutation schema contracts", () => {
  it("accepts the checked-in Zod-aligned agent mutation schemas", () => {
    expect(() => assertAgentMutationSchemaContracts(sourceDocument)).not.toThrow();
  });

  it.each([
    ["TEMPLATE", "templateUsername"],
    ["CLONE", "sourceAgentId"],
    ["IMPORT", "format"],
  ])("rejects a %s branch that stops requiring %s", (method, requiredField) => {
    const drifted = cloneDocument();
    const branch = creationBranch(drifted, method);
    branch.required = (branch.required ?? []).filter((field) => field !== requiredField);
    expect(() => assertAgentMutationSchemaContracts(drifted)).toThrow(
      new RegExp(`${method} creation required fields mismatch`, "u"),
    );
  });

  it("rejects a CUSTOM branch that starts accepting method-specific fields", () => {
    const drifted = cloneDocument();
    const branch = creationBranch(drifted, "CUSTOM");
    branch.properties = {
      ...branch.properties,
      sourceAgentId: { type: "string", format: "uuid" },
    };
    expect(() => assertAgentMutationSchemaContracts(drifted)).toThrow(
      /CUSTOM creation properties mismatch/u,
    );
  });

  it.each(["persona", "displayName", "publicBio"])(
    "rejects removal of the %s to changeSummary dependency",
    (field) => {
      const drifted = cloneDocument();
      const updateSchema = drifted.components?.schemas?.AgentUpdateInput;
      if (!updateSchema?.dependentRequired) throw new Error("Missing dependentRequired fixture");
      delete updateSchema.dependentRequired[field];
      expect(() => assertAgentMutationSchemaContracts(drifted)).toThrow(
        /AgentUpdateInput dependentRequired fields mismatch/u,
      );
    },
  );
});
