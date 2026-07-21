import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";

const methods = ["get", "post", "put", "patch", "delete"] as const;
type Method = (typeof methods)[number];

interface OpenApiReference {
  $ref: string;
}

export interface OpenApiSchema {
  type?: string | string[];
  additionalProperties?: boolean | OpenApiSchema | OpenApiReference;
  required?: string[];
  properties?: Record<string, OpenApiSchema | OpenApiReference>;
  items?: OpenApiSchema | OpenApiReference;
  oneOf?: OpenApiSchema[];
  anyOf?: Array<OpenApiSchema | OpenApiReference>;
  allOf?: Array<OpenApiSchema | OpenApiReference>;
  dependentRequired?: Record<string, string[]>;
  const?: unknown;
  default?: unknown;
  enum?: unknown[];
  pattern?: string;
  format?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  "x-maximum-decimal"?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

interface OpenApiParameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: OpenApiSchema;
}

interface OpenApiMediaType {
  schema?: OpenApiSchema | OpenApiReference;
  description?: string;
}

interface OpenApiRequestBody extends Partial<OpenApiReference> {
  required?: boolean;
  content?: Record<string, OpenApiMediaType>;
}

interface OpenApiResponse extends Partial<OpenApiReference> {
  headers?: Record<string, unknown>;
  content?: Record<string, OpenApiMediaType>;
}

interface OpenApiOperation {
  operationId?: string;
  parameters?: Array<OpenApiParameter | OpenApiReference>;
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
  security?: Array<Record<string, unknown>>;
}

type OpenApiPathItem = Partial<Record<Method, OpenApiOperation>> & {
  parameters?: Array<OpenApiParameter | OpenApiReference>;
};

export interface OpenApiDocument {
  openapi?: string;
  security?: Array<Record<string, unknown>>;
  paths?: Record<string, OpenApiPathItem>;
  components?: {
    parameters?: Record<string, OpenApiParameter>;
    schemas?: Record<string, OpenApiSchema>;
    requestBodies?: Record<string, OpenApiRequestBody>;
    responses?: Record<string, OpenApiResponse>;
    securitySchemes?: Record<
      string,
      { type?: string; in?: string; name?: string; scheme?: string; bearerFormat?: string }
    >;
  };
}

const publicOperations = new Set([
  "GET /api/health",
  "GET /api/ready",
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/login",
  "GET /api/v1/auth/session",
  "GET /api/v1/users/{username}",
  "GET /api/v1/topics",
  "GET /api/v1/topics/{topicId}",
  "GET /api/v1/topics/{topicId}/entries",
  "GET /api/v1/entries/{entryId}",
  "GET /api/v1/search",
  "GET /api/v1/feeds/debe",
  "GET /api/v1/feeds/random",
]);

const internalRuntimeOperations = new Set([
  "POST /api/v1/internal/agent-runtime/lease",
  "POST /api/v1/internal/agent-runtime/plans/today",
  "POST /api/v1/internal/agent-runtime/heartbeat",
  "GET /api/v1/internal/agent-runtime/runs/{runId}/context",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/events",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/life-events",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions/execute",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/memories",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources/attempts",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/complete",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/fail",
]);

const expectedQueryParameters: Record<string, string[]> = {
  "GET /api/v1/me/bookmarks": ["page", "pageSize"],
  "GET /api/v1/me/follows": ["page", "pageSize"],
  "GET /api/v1/me/followed-users": ["page", "pageSize"],
  "GET /api/v1/me/votes": ["page", "pageSize"],
  "GET /api/v1/me/blocks": ["page", "pageSize"],
  "GET /api/v1/users/{username}": ["page", "pageSize"],
  "GET /api/v1/topics": ["feed", "page", "pageSize", "window"],
  "GET /api/v1/topics/{topicId}/entries": ["page", "pageSize", "q", "sort"],
  "GET /api/v1/entries/{entryId}/revisions": ["page", "pageSize"],
  "GET /api/v1/search": ["page", "q", "type"],
  "GET /api/v1/moderation/reports": [
    "from",
    "page",
    "pageSize",
    "reason",
    "reporter",
    "status",
    "targetType",
    "to",
  ],
  "GET /api/v1/moderation/users": ["page", "pageSize", "q"],
  "GET /api/v1/moderation/audit": [
    "action",
    "actorId",
    "entityType",
    "from",
    "page",
    "pageSize",
    "requestId",
    "to",
  ],
  "GET /api/v1/admin/agent-content": [
    "agentProfileId",
    "from",
    "hiddenStatus",
    "overrideStatus",
    "page",
    "pageSize",
    "reportStatus",
    "runId",
    "sourceProvenance",
    "to",
    "topicId",
  ],
  "GET /api/v1/admin/agent-sources": [
    "adminBlocked",
    "adminPinned",
    "agentProfileId",
    "domain",
    "page",
    "pageSize",
    "status",
  ],
  "GET /api/v1/admin/agent-runtime/events": ["afterId", "limit", "poll"],
  "GET /api/v1/admin/agents/{agentId}/memories": ["page", "pageSize"],
  "GET /api/v1/admin/agents/{agentId}/life": [
    "cursor",
    "eventType",
    "format",
    "from",
    "limit",
    "runId",
    "to",
  ],
};

const expectedRequestBodies: Record<string, string> = {
  "POST /api/v1/auth/register": "Registration",
  "POST /api/v1/auth/login": "Login",
  "PATCH /api/v1/me": "ProfileUpdate",
  "POST /api/v1/me/email": "EmailChange",
  "POST /api/v1/me/password": "PasswordChange",
  "POST /api/v1/me/deactivate": "Deactivation",
  "POST /api/v1/topics": "TopicCreate",
  "POST /api/v1/topics/{topicId}/entries": "EntryCreate",
  "PATCH /api/v1/entries/{entryId}": "EntryCreate",
  "PUT /api/v1/entries/{entryId}/vote": "Vote",
  "POST /api/v1/reports": "ReportCreate",
  "POST /api/v1/moderation/reports/{reportId}/resolve": "ReportDecision",
  "POST /api/v1/moderation/reports/{reportId}/reject": "ReportDecision",
  "POST /api/v1/moderation/entries/{entryId}/hide": "ModerationReason",
  "POST /api/v1/moderation/entries/{entryId}/restore": "ModerationReason",
  "POST /api/v1/moderation/entries/{entryId}/move": "MoveEntry",
  "POST /api/v1/moderation/topics/{topicId}/hide": "ModerationReason",
  "POST /api/v1/moderation/topics/{topicId}/restore": "ModerationReason",
  "POST /api/v1/moderation/topics/{topicId}/rename": "RenameTopic",
  "POST /api/v1/moderation/topics/{topicId}/merge": "MergeTopic",
  "POST /api/v1/moderation/users/{userId}/suspend": "ModerationReason",
  "POST /api/v1/moderation/users/{userId}/unsuspend": "ModerationReason",
  "POST /api/v1/admin/users/{userId}/approve-writer": "ModerationReason",
  "POST /api/v1/admin/users/{userId}/grant-moderator": "ModerationReason",
  "POST /api/v1/admin/users/{userId}/revoke-moderator": "ModerationReason",
  "POST /api/v1/admin/agents": "AgentCreate",
  "PATCH /api/v1/admin/agents/{agentId}": "AgentUpdate",
  "POST /api/v1/admin/agents/{agentId}/lifecycle": "AgentLifecycleChange",
  "POST /api/v1/admin/agents/{agentId}/persona/rollback": "AgentPersonaRollback",
  "PATCH /api/v1/admin/agent-settings": "AgentGlobalSettingsUpdate",
  "POST /api/v1/admin/agents/{agentId}/credentials/rotate": "AgentCredentialRotation",
  "POST /api/v1/admin/agents/{agentId}/runs": "ManualAgentRun",
  "POST /api/v1/admin/agents/{agentId}/runs/cancel-pending": "CancelPendingAgentRuns",
  "POST /api/v1/admin/agents/{agentId}/runs/graceful-stop": "GracefulStopAgentRuns",
  "POST /api/v1/admin/agents/{agentId}/memories/{memoryId}/invalidate": "AgentMemoryInvalidate",
  "POST /api/v1/admin/agents/{agentId}/memories/{memoryId}/forget": "AgentMemoryForget",
  "POST /api/v1/admin/agents/{agentId}/memories/reconsolidate": "AgentMemoryReconsolidate",
  "POST /api/v1/admin/agent-runs/bulk/preview": "BulkAgentRunPreview",
  "POST /api/v1/admin/agent-runs/bulk": "BulkAgentRun",
  "POST /api/v1/admin/agent-runs/cancel-pending": "CancelPendingGlobalAgentRuns",
  "POST /api/v1/admin/agent-runs/graceful-stop": "GracefulStopGlobalAgentRuns",
  "POST /api/v1/admin/agent-runs/{runId}/cancel": "AgentRunCommand",
  "POST /api/v1/admin/agent-runs/{runId}/retry": "AgentRunCommand",
  "POST /api/v1/admin/agent-content/bulk-hide": "AgentContentBulkAction",
  "POST /api/v1/admin/agent-content/bulk-restore": "AgentContentBulkAction",
  "POST /api/v1/admin/agent-content/topic-lock": "AgentTopicWriteLock",
  "DELETE /api/v1/admin/agent-content/topic-lock/{topicId}": "ModerationReason",
  "PATCH /api/v1/admin/agent-sources/{sourceId}": "AgentSourceAdminUpdate",
  "POST /api/v1/admin/agent-runtime/pause": "RuntimeControl",
  "POST /api/v1/admin/agent-runtime/resume": "RuntimeControl",
  "POST /api/v1/admin/agent-runtime/benchmark": "RuntimeCapabilityMeasurement",
  "POST /api/v1/admin/agent-runtime/concurrency-test": "RuntimeCapabilityMeasurement",
  "POST /api/v1/admin/agent-schedule/regenerate": "DailyPlanGeneration",
  "POST /api/v1/internal/agent-runtime/lease": "RuntimeLease",
  "POST /api/v1/internal/agent-runtime/plans/today": "RuntimeDailyPlan",
  "POST /api/v1/internal/agent-runtime/heartbeat": "RuntimeHeartbeat",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/events": "RuntimeEvents",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/life-events": "RuntimeLifeEvents",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions": "RuntimeActions",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions/execute": "RuntimeExecuteActions",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/memories": "RuntimeMemories",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources": "RuntimeSourceResult",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources/attempts": "RuntimeSourceAttempt",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/complete": "RuntimeComplete",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/fail": "RuntimeFail",
};

const idempotentOperations = new Set([
  "POST /api/v1/topics",
  "POST /api/v1/topics/{topicId}/entries",
  "POST /api/v1/reports",
  "POST /api/v1/moderation/reports/{reportId}/resolve",
  "POST /api/v1/moderation/reports/{reportId}/reject",
  "POST /api/v1/moderation/entries/{entryId}/hide",
  "POST /api/v1/moderation/entries/{entryId}/restore",
  "POST /api/v1/moderation/entries/{entryId}/move",
  "POST /api/v1/moderation/topics/{topicId}/hide",
  "POST /api/v1/moderation/topics/{topicId}/restore",
  "POST /api/v1/moderation/topics/{topicId}/rename",
  "POST /api/v1/moderation/topics/{topicId}/merge",
  "POST /api/v1/moderation/users/{userId}/suspend",
  "POST /api/v1/moderation/users/{userId}/unsuspend",
  "POST /api/v1/admin/users/{userId}/approve-writer",
  "POST /api/v1/admin/users/{userId}/grant-moderator",
  "POST /api/v1/admin/users/{userId}/revoke-moderator",
  "POST /api/v1/admin/agents",
  "PATCH /api/v1/admin/agents/{agentId}",
  "POST /api/v1/admin/agents/{agentId}/lifecycle",
  "POST /api/v1/admin/agents/{agentId}/persona/rollback",
  "PATCH /api/v1/admin/agent-settings",
  "POST /api/v1/admin/agents/{agentId}/credentials/rotate",
  "POST /api/v1/admin/agents/{agentId}/runs",
  "POST /api/v1/admin/agents/{agentId}/runs/cancel-pending",
  "POST /api/v1/admin/agents/{agentId}/runs/graceful-stop",
  "POST /api/v1/admin/agents/{agentId}/memories/{memoryId}/invalidate",
  "POST /api/v1/admin/agents/{agentId}/memories/{memoryId}/forget",
  "POST /api/v1/admin/agents/{agentId}/memories/reconsolidate",
  "POST /api/v1/admin/agent-runs/bulk/preview",
  "POST /api/v1/admin/agent-runs/bulk",
  "POST /api/v1/admin/agent-runs/cancel-pending",
  "POST /api/v1/admin/agent-runs/graceful-stop",
  "POST /api/v1/admin/agent-runs/{runId}/cancel",
  "POST /api/v1/admin/agent-runs/{runId}/retry",
  "POST /api/v1/admin/agent-content/bulk-hide",
  "POST /api/v1/admin/agent-content/bulk-restore",
  "POST /api/v1/admin/agent-content/topic-lock",
  "DELETE /api/v1/admin/agent-content/topic-lock/{topicId}",
  "PATCH /api/v1/admin/agent-sources/{sourceId}",
  "POST /api/v1/admin/agent-runtime/pause",
  "POST /api/v1/admin/agent-runtime/resume",
  "POST /api/v1/admin/agent-runtime/benchmark",
  "POST /api/v1/admin/agent-runtime/concurrency-test",
  "POST /api/v1/admin/agent-schedule/regenerate",
  "POST /api/v1/internal/agent-runtime/lease",
  "POST /api/v1/internal/agent-runtime/plans/today",
  "POST /api/v1/internal/agent-runtime/heartbeat",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/events",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/life-events",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions/execute",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/memories",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources/attempts",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/complete",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/fail",
]);

function hasExactSecurity(
  security: Array<Record<string, unknown>> | undefined,
  expectedNames: string[],
): boolean {
  if (expectedNames.length === 0) return security?.length === 0;
  if (security?.length !== 1) return false;
  const actualNames = Object.keys(security[0]!).sort();
  return actualNames.join(",") === [...expectedNames].sort().join(",");
}

function resolveParameter(
  document: OpenApiDocument,
  parameter: OpenApiParameter | OpenApiReference,
): OpenApiParameter {
  if (!("$ref" in parameter)) return parameter;
  const prefix = "#/components/parameters/";
  if (!parameter.$ref.startsWith(prefix))
    throw new Error(`Unsupported parameter reference: ${parameter.$ref}`);
  const name = parameter.$ref.slice(prefix.length);
  const resolved = document.components?.parameters?.[name];
  if (!resolved) throw new Error(`Unresolved parameter reference: ${parameter.$ref}`);
  return resolved;
}

function assertExactNames(actual: string[], expected: string[], label: string): void {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (
    new Set(actual).size !== actual.length ||
    sortedActual.join(",") !== sortedExpected.join(",")
  ) {
    throw new Error(
      `${label} mismatch; expected [${sortedExpected.join(", ")}], got [${sortedActual.join(", ")}]`,
    );
  }
}

function inlineSchema(
  candidate: OpenApiSchema | OpenApiReference | undefined,
  label: string,
): OpenApiSchema {
  if (!candidate || "$ref" in candidate) throw new Error(`${label} must be an inline schema`);
  return candidate;
}

function componentSchema(document: OpenApiDocument, name: string): OpenApiSchema {
  const schema = document.components?.schemas?.[name];
  if (!schema) throw new Error(`OpenAPI components.schemas.${name} is required`);
  return schema;
}

const expectedCreationProperties = {
  CUSTOM: ["method"],
  TEMPLATE: ["method", "templateUsername"],
  CLONE: ["method", "sourceAgentId"],
  IMPORT: ["method", "format"],
} as const;

export function assertAgentMutationSchemaContracts(document: OpenApiDocument): void {
  const createSchema = componentSchema(document, "AgentCreateInput");
  const creationSchema = inlineSchema(
    createSchema.properties?.creation,
    "AgentCreateInput.creation",
  );
  if (creationSchema.oneOf?.length !== Object.keys(expectedCreationProperties).length) {
    throw new Error("AgentCreateInput.creation must contain exactly four discriminated branches");
  }
  if (
    !creationSchema.default ||
    typeof creationSchema.default !== "object" ||
    Array.isArray(creationSchema.default) ||
    (creationSchema.default as Record<string, unknown>).method !== "CUSTOM" ||
    Object.keys(creationSchema.default).length !== 1
  ) {
    throw new Error("AgentCreateInput.creation default must be exactly { method: CUSTOM }");
  }

  const seenMethods: string[] = [];
  for (const branch of creationSchema.oneOf) {
    if (branch.type !== "object" || branch.additionalProperties !== false) {
      throw new Error("Every AgentCreateInput.creation branch must be a closed object schema");
    }
    const methodSchema = inlineSchema(
      branch.properties?.method,
      "AgentCreateInput.creation method",
    );
    if (methodSchema.type !== "string" || typeof methodSchema.const !== "string") {
      throw new Error("Every AgentCreateInput.creation branch must use a string method const");
    }
    const method = methodSchema.const;
    if (!(method in expectedCreationProperties)) {
      throw new Error(`Unexpected AgentCreateInput.creation method: ${method}`);
    }
    const expected = [
      ...expectedCreationProperties[method as keyof typeof expectedCreationProperties],
    ];
    assertExactNames(branch.required ?? [], expected, `${method} creation required fields`);
    assertExactNames(
      Object.keys(branch.properties ?? {}),
      expected,
      `${method} creation properties`,
    );
    seenMethods.push(method);

    if (method === "TEMPLATE") {
      const templateUsername = inlineSchema(
        branch.properties?.templateUsername,
        "TEMPLATE creation templateUsername",
      );
      if (templateUsername.type !== "string" || templateUsername.pattern !== "^[a-z0-9_]{3,32}$") {
        throw new Error("TEMPLATE creation templateUsername must match the Zod username regex");
      }
    }
    if (method === "CLONE") {
      const sourceAgentId = inlineSchema(
        branch.properties?.sourceAgentId,
        "CLONE creation sourceAgentId",
      );
      if (sourceAgentId.type !== "string" || sourceAgentId.format !== "uuid") {
        throw new Error("CLONE creation sourceAgentId must be a UUID string");
      }
    }
    if (method === "IMPORT") {
      const format = inlineSchema(branch.properties?.format, "IMPORT creation format");
      if (format.type !== "string") {
        throw new Error("IMPORT creation format must be a string enum");
      }
      assertExactNames(
        (format.enum ?? []).filter((value): value is string => typeof value === "string"),
        ["JSON", "YAML"],
        "IMPORT creation format enum",
      );
    }
  }
  assertExactNames(
    seenMethods,
    Object.keys(expectedCreationProperties),
    "AgentCreateInput.creation methods",
  );

  const updateSchema = componentSchema(document, "AgentUpdateInput");
  const identityFields = ["persona", "displayName", "publicBio"];
  const dependencies = updateSchema.dependentRequired ?? {};
  assertExactNames(
    Object.keys(dependencies),
    identityFields,
    "AgentUpdateInput dependentRequired fields",
  );
  for (const field of identityFields) {
    assertExactNames(
      dependencies[field] ?? [],
      ["changeSummary"],
      `AgentUpdateInput ${field} dependencies`,
    );
  }
  inlineSchema(updateSchema.properties?.changeSummary, "AgentUpdateInput.changeSummary");
}

function assertSchemaReference(candidate: unknown, expectedReference: string, label: string): void {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("$ref" in candidate) ||
    candidate.$ref !== expectedReference
  ) {
    throw new Error(`${label} must reference ${expectedReference}`);
  }
}

function closedObjectSchema(
  document: OpenApiDocument,
  name: string,
  fields: string[],
): OpenApiSchema {
  const schema = componentSchema(document, name);
  if (schema.type !== "object" || schema.additionalProperties !== false) {
    throw new Error(`${name} must be a closed object schema`);
  }
  assertExactNames(schema.required ?? [], fields, `${name} required fields`);
  assertExactNames(Object.keys(schema.properties ?? {}), fields, `${name} properties`);
  return schema;
}

function operationFor(
  document: OpenApiDocument,
  routePath: string,
  method: Method,
): { operation: OpenApiOperation; pathItem: OpenApiPathItem } {
  const pathItem = document.paths?.[routePath];
  const operation = pathItem?.[method];
  if (!pathItem || !operation) throw new Error(`${method.toUpperCase()} ${routePath} is required`);
  return { operation, pathItem };
}

function operationParameters(
  document: OpenApiDocument,
  pathItem: OpenApiPathItem,
  operation: OpenApiOperation,
): OpenApiParameter[] {
  return [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map((parameter) =>
    resolveParameter(document, parameter),
  );
}

function queryParameterSchema(parameters: OpenApiParameter[], name: string): OpenApiSchema {
  const parameter = parameters.find(
    (candidate) => candidate.in === "query" && candidate.name === name,
  );
  if (!parameter?.schema) throw new Error(`Query parameter ${name} schema is required`);
  return parameter.schema;
}

function arrayProperty(schema: OpenApiSchema, property: string, label: string): OpenApiSchema {
  const candidate = inlineSchema(schema.properties?.[property], `${label}.${property}`);
  if (candidate.type !== "array") throw new Error(`${label}.${property} must be an array`);
  return candidate;
}

function assertResponseCodes(
  operation: OpenApiOperation,
  expectedCodes: string[],
  label: string,
): void {
  assertExactNames(Object.keys(operation.responses ?? {}), expectedCodes, `${label} responses`);
}

const agentLifeEventFields = [
  "id",
  "agentProfileId",
  "runId",
  "actionId",
  "decisionSeq",
  "eventType",
  "subject",
  "summary",
  "confidence",
  "evidenceIds",
  "causedBy",
  "before",
  "after",
  "changedFields",
  "metadata",
  "occurredAt",
  "createdAt",
  "schemaVersion",
  "agentSequence",
  "batchId",
  "batchSequence",
  "contentHash",
  "previousEventHash",
  "eventHash",
];

export function assertAgentLifeLedgerContracts(document: OpenApiDocument): void {
  const adminPath = "/api/v1/admin/agents/{agentId}/life";
  const { operation: adminOperation, pathItem: adminPathItem } = operationFor(
    document,
    adminPath,
    "get",
  );
  const adminParameters = operationParameters(document, adminPathItem, adminOperation);
  assertExactNames(
    adminParameters
      .filter((parameter) => parameter.in === "query")
      .map((parameter) => parameter.name ?? ""),
    ["cursor", "eventType", "format", "from", "limit", "runId", "to"],
    "Agent life query parameters",
  );
  const cursor = queryParameterSchema(adminParameters, "cursor");
  if (
    cursor.type !== "string" ||
    cursor.pattern !== "^\\d{1,19}$" ||
    cursor.maxLength !== 19 ||
    cursor["x-maximum-decimal"] !== "9223372036854775807"
  ) {
    throw new Error("Agent life cursor must be a bounded decimal string");
  }
  const limit = queryParameterSchema(adminParameters, "limit");
  if (
    limit.type !== "integer" ||
    limit.minimum !== 1 ||
    limit.maximum !== 500 ||
    limit.default !== 100
  ) {
    throw new Error("Agent life limit must match the 1..500 Zod contract with default 100");
  }
  const eventType = queryParameterSchema(adminParameters, "eventType");
  if (eventType.type !== "string" || eventType.minLength !== 1 || eventType.maxLength !== 100) {
    throw new Error("Agent life eventType must match the bounded exact filter");
  }
  if (queryParameterSchema(adminParameters, "runId").format !== "uuid") {
    throw new Error("Agent life runId filter must be a UUID");
  }
  for (const name of ["from", "to"]) {
    if (queryParameterSchema(adminParameters, name).format !== "date-time") {
      throw new Error(`Agent life ${name} filter must use date-time format`);
    }
  }
  const format = queryParameterSchema(adminParameters, "format");
  assertExactNames(
    (format.enum ?? []).filter((value): value is string => typeof value === "string"),
    ["json", "jsonl"],
    "Agent life format enum",
  );
  if (format.type !== "string" || format.default !== "json") {
    throw new Error("Agent life format must default to json");
  }
  assertResponseCodes(
    adminOperation,
    ["200", "401", "403", "404", "422", "default"],
    "Agent life GET",
  );
  assertSchemaReference(
    adminOperation.responses?.["200"],
    "#/components/responses/AgentLifeReadSuccess",
    "Agent life GET 200 response",
  );

  const runtimePath = "/api/v1/internal/agent-runtime/runs/{runId}/life-events";
  const { operation: runtimeOperation, pathItem: runtimePathItem } = operationFor(
    document,
    runtimePath,
    "post",
  );
  if (!hasExactSecurity(runtimeOperation.security, ["runtimeBearer"])) {
    throw new Error("Runtime life-events security must be exactly [runtimeBearer]");
  }
  const runtimeParameters = operationParameters(document, runtimePathItem, runtimeOperation);
  const idempotencyParameter = runtimeParameters.find(
    (parameter) => parameter.in === "header" && parameter.name?.toLowerCase() === "idempotency-key",
  );
  if (
    !idempotencyParameter?.required ||
    idempotencyParameter.schema?.pattern !== "^[!-~]{1,255}$"
  ) {
    throw new Error("Runtime life-events must require a visible-ASCII Idempotency-Key");
  }
  assertSchemaReference(
    runtimeOperation.requestBody,
    "#/components/requestBodies/RuntimeLifeEvents",
    "Runtime life-events request body",
  );
  assertResponseCodes(
    runtimeOperation,
    ["200", "401", "403", "409", "413", "422", "429", "default"],
    "Runtime life-events POST",
  );
  assertSchemaReference(
    runtimeOperation.responses?.["200"],
    "#/components/responses/RuntimeLifeEventsSuccess",
    "Runtime life-events POST 200 response",
  );

  const requestBody = document.components?.requestBodies?.RuntimeLifeEvents;
  if (!requestBody?.required) throw new Error("RuntimeLifeEvents request body must be required");
  assertExactNames(
    Object.keys(requestBody.content ?? {}),
    ["application/json"],
    "RuntimeLifeEvents request media types",
  );
  assertSchemaReference(
    requestBody.content?.["application/json"]?.schema,
    "#/components/schemas/RuntimeLifeEventsInput",
    "RuntimeLifeEvents JSON schema",
  );

  const lifeEvent = closedObjectSchema(document, "AgentLifeEvent", agentLifeEventFields);
  const decimalPattern = "^[1-9]\\d{0,18}$";
  if (inlineSchema(lifeEvent.properties?.id, "AgentLifeEvent.id").pattern !== decimalPattern) {
    throw new Error("AgentLifeEvent.id must be a positive decimal string");
  }
  for (const field of ["contentHash", "eventHash"]) {
    if (
      inlineSchema(lifeEvent.properties?.[field], `AgentLifeEvent.${field}`).pattern !==
      "^[a-f0-9]{64}$"
    ) {
      throw new Error(`AgentLifeEvent.${field} must be a SHA-256 hex digest`);
    }
  }

  const page = closedObjectSchema(document, "AgentLifePage", ["items", "nextCursor"]);
  const pageItems = arrayProperty(page, "items", "AgentLifePage");
  if (pageItems.maxItems !== 500) throw new Error("AgentLifePage.items must be capped at 500");
  assertSchemaReference(
    pageItems.items,
    "#/components/schemas/AgentLifeEvent",
    "AgentLifePage.items",
  );
  const pageEnvelope = closedObjectSchema(document, "AgentLifePageEnvelope", ["data", "requestId"]);
  assertSchemaReference(
    pageEnvelope.properties?.data,
    "#/components/schemas/AgentLifePage",
    "AgentLifePageEnvelope.data",
  );

  const observation = closedObjectSchema(document, "AgentLifeObservationInput", [
    "subjectType",
    "subjectId",
    "summary",
    "salience",
    "provenance",
  ]);
  const observationSummary = inlineSchema(
    observation.properties?.summary,
    "AgentLifeObservationInput.summary",
  );
  if (observationSummary.maxLength !== 1000 || !observationSummary.pattern) {
    throw new Error("AgentLifeObservationInput.summary must be bounded and display-safe");
  }

  const decisionStep = closedObjectSchema(document, "AgentDecisionJournalStepInput", [
    "seq",
    "kind",
    "subject",
    "summary",
    "confidence",
    "evidenceIds",
    "causedBySeqs",
  ]);
  const decisionKind = inlineSchema(
    decisionStep.properties?.kind,
    "AgentDecisionJournalStepInput.kind",
  );
  assertExactNames(
    (decisionKind.enum ?? []).filter((value): value is string => typeof value === "string"),
    [
      "OBSERVATION",
      "INTERPRETATION",
      "OPTION_CONSIDERED",
      "OPTION_REJECTED",
      "OPTION_SELECTED",
      "STATE_PROPOSAL",
    ],
    "Agent decision-journal kind enum",
  );
  if (arrayProperty(decisionStep, "evidenceIds", "AgentDecisionJournalStepInput").maxItems !== 20) {
    throw new Error("Agent decision-journal evidenceIds must be capped at 20");
  }
  if (
    arrayProperty(decisionStep, "causedBySeqs", "AgentDecisionJournalStepInput").maxItems !== 20
  ) {
    throw new Error("Agent decision-journal causedBySeqs must be capped at 20");
  }

  const actionIntent = closedObjectSchema(document, "AgentActionIntentInput", [
    "sequence",
    "desire",
    "expectedOutcome",
    "selectedOptionSeq",
  ]);
  const expectedOutcome = inlineSchema(
    actionIntent.properties?.expectedOutcome,
    "AgentActionIntentInput.expectedOutcome",
  );
  if (expectedOutcome.maxLength !== 500 || !expectedOutcome.pattern) {
    throw new Error("AgentActionIntentInput.expectedOutcome must be bounded and display-safe");
  }

  const payload = closedObjectSchema(document, "RuntimeLifeEventsPayloadInput", [
    "observations",
    "memoryCandidates",
    "decisionJournal",
    "actionIntents",
  ]);
  const payloadArrays = {
    observations: { maximum: 100, item: "AgentLifeObservationInput" },
    memoryCandidates: { maximum: 50, item: "AgentLifeObservationInput" },
    decisionJournal: { maximum: 100, item: "AgentDecisionJournalStepInput" },
    actionIntents: { maximum: 50, item: "AgentActionIntentInput" },
  } as const;
  for (const [field, contract] of Object.entries(payloadArrays)) {
    const array = arrayProperty(payload, field, "RuntimeLifeEventsPayloadInput");
    if (array.maxItems !== contract.maximum) {
      throw new Error(`RuntimeLifeEventsPayloadInput.${field} has the wrong maximum`);
    }
    assertSchemaReference(
      array.items,
      `#/components/schemas/${contract.item}`,
      `RuntimeLifeEventsPayloadInput.${field} items`,
    );
  }
  if (
    arrayProperty(payload, "decisionJournal", "RuntimeLifeEventsPayloadInput").uniqueItems !==
      true ||
    arrayProperty(payload, "actionIntents", "RuntimeLifeEventsPayloadInput").uniqueItems !== true
  ) {
    throw new Error("Runtime life decision and action arrays must reject exact duplicates");
  }
  if (payload.anyOf?.length !== 4) {
    throw new Error("RuntimeLifeEventsPayloadInput must require at least one record across arrays");
  }
  const nonEmptyArrays = payload.anyOf.map((candidate) => {
    const branch = inlineSchema(candidate, "RuntimeLifeEventsPayloadInput non-empty branch");
    const entries = Object.entries(branch.properties ?? {});
    if (entries.length !== 1) {
      throw new Error("Every runtime life non-empty branch must select exactly one array");
    }
    const [field, constraint] = entries[0]!;
    if (inlineSchema(constraint, `${field} non-empty constraint`).minItems !== 1) {
      throw new Error(`Runtime life ${field} non-empty branch must require one item`);
    }
    return field;
  });
  assertExactNames(nonEmptyArrays, Object.keys(payloadArrays), "Runtime life non-empty arrays");

  const runtimeInput = closedObjectSchema(document, "RuntimeLifeEventsInput", [
    "workerId",
    "leaseToken",
    "payload",
  ]);
  const workerId = inlineSchema(
    runtimeInput.properties?.workerId,
    "RuntimeLifeEventsInput.workerId",
  );
  if (
    workerId.minLength !== 3 ||
    workerId.maxLength !== 200 ||
    workerId.pattern !== "^[A-Za-z0-9._:-]+$"
  ) {
    throw new Error("RuntimeLifeEventsInput.workerId must match the runtime worker schema");
  }
  assertSchemaReference(
    runtimeInput.properties?.leaseToken,
    "#/components/schemas/RuntimeLeaseToken",
    "RuntimeLifeEventsInput.leaseToken",
  );
  assertSchemaReference(
    runtimeInput.properties?.payload,
    "#/components/schemas/RuntimeLifeEventsPayloadInput",
    "RuntimeLifeEventsInput.payload",
  );

  const batchResult = closedObjectSchema(document, "RuntimeLifeEventsBatchResult", [
    "batchId",
    "inserted",
    "replayed",
    "events",
  ]);
  if (batchResult.oneOf?.length !== 2) {
    throw new Error("RuntimeLifeEventsBatchResult must distinguish insert from replay");
  }
  const resultBranches = new Map(
    batchResult.oneOf.map((branch) => [
      inlineSchema(branch.properties?.replayed, "Runtime life result replayed branch").const,
      inlineSchema(branch.properties?.inserted, "Runtime life result inserted branch"),
    ]),
  );
  if (resultBranches.get(true)?.const !== 0) {
    throw new Error("Runtime life replay result must report inserted=0");
  }
  const insertedResult = resultBranches.get(false);
  if (insertedResult?.minimum !== 1 || insertedResult.maximum !== 300) {
    throw new Error("Runtime life new result must report 1..300 inserted events");
  }
  const resultEvents = arrayProperty(batchResult, "events", "RuntimeLifeEventsBatchResult");
  if (resultEvents.minItems !== 1 || resultEvents.maxItems !== 300) {
    throw new Error("RuntimeLifeEventsBatchResult.events must contain 1..300 records");
  }
  assertSchemaReference(
    resultEvents.items,
    "#/components/schemas/AgentLifeEvent",
    "RuntimeLifeEventsBatchResult.events",
  );
  const runtimeEnvelope = closedObjectSchema(document, "RuntimeLifeEventsEnvelope", [
    "data",
    "requestId",
  ]);
  assertSchemaReference(
    runtimeEnvelope.properties?.data,
    "#/components/schemas/RuntimeLifeEventsBatchResult",
    "RuntimeLifeEventsEnvelope.data",
  );

  const readResponse = document.components?.responses?.AgentLifeReadSuccess;
  if (!readResponse) throw new Error("AgentLifeReadSuccess response component is required");
  assertExactNames(
    Object.keys(readResponse.headers ?? {}),
    ["Cache-Control", "Content-Disposition", "X-Content-Type-Options", "X-Request-Id"],
    "AgentLifeReadSuccess headers",
  );
  assertExactNames(
    Object.keys(readResponse.content ?? {}),
    ["application/json", "application/x-ndjson"],
    "AgentLifeReadSuccess media types",
  );
  assertSchemaReference(
    readResponse.content?.["application/json"]?.schema,
    "#/components/schemas/AgentLifePageEnvelope",
    "AgentLifeReadSuccess JSON schema",
  );
  if (
    inlineSchema(
      readResponse.content?.["application/x-ndjson"]?.schema,
      "AgentLifeReadSuccess NDJSON schema",
    ).type !== "string"
  ) {
    throw new Error("AgentLifeReadSuccess NDJSON body must be a string stream");
  }

  const runtimeResponse = document.components?.responses?.RuntimeLifeEventsSuccess;
  if (!runtimeResponse) throw new Error("RuntimeLifeEventsSuccess response component is required");
  assertExactNames(
    Object.keys(runtimeResponse.headers ?? {}),
    ["Idempotent-Replay", "X-Request-Id"],
    "RuntimeLifeEventsSuccess headers",
  );
  assertExactNames(
    Object.keys(runtimeResponse.content ?? {}),
    ["application/json"],
    "RuntimeLifeEventsSuccess media types",
  );
  assertSchemaReference(
    runtimeResponse.content?.["application/json"]?.schema,
    "#/components/schemas/RuntimeLifeEventsEnvelope",
    "RuntimeLifeEventsSuccess JSON schema",
  );
}

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(target);
      return entry.name === "route.ts" ? [target] : [];
    }),
  );
  return nested.flat();
}

function operationKey(method: string, routePath: string): string {
  return `${method.toUpperCase()} ${routePath}`;
}

async function runtimeOperations(): Promise<Set<string>> {
  const root = path.join(process.cwd(), "src/app/api");
  const operations = new Set<string>();
  for (const file of await routeFiles(root)) {
    const source = await readFile(file, "utf8");
    const routePath = `/${path
      .relative(path.join(process.cwd(), "src/app"), path.dirname(file))
      .split(path.sep)
      .map((part) => part.replace(/^\[([^\]]+)\]$/u, "{$1}"))
      .join("/")}`;
    const matcher = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/gu;
    for (const match of source.matchAll(matcher))
      operations.add(operationKey(match[1]!, routePath));
  }
  return operations;
}

async function main(): Promise<void> {
  const specificationPath = path.join(process.cwd(), "docs/openapi.yaml");
  const document = (await SwaggerParser.validate(specificationPath)) as OpenApiDocument;
  const sourceDocument = (await SwaggerParser.parse(specificationPath)) as OpenApiDocument;
  if (document.openapi !== "3.1.0") throw new Error("OpenAPI version must be exactly 3.1.0");
  const sessionScheme = document.components?.securitySchemes?.sessionCookie;
  const csrfScheme = document.components?.securitySchemes?.csrfHeader;
  const runtimeScheme = document.components?.securitySchemes?.runtimeBearer;
  if (
    sessionScheme?.type !== "apiKey" ||
    sessionScheme.in !== "cookie" ||
    sessionScheme.name !== "ajan_session"
  )
    throw new Error("OpenAPI sessionCookie must document the ajan_session cookie");
  if (
    csrfScheme?.type !== "apiKey" ||
    csrfScheme.in !== "header" ||
    csrfScheme.name !== "X-CSRF-Token"
  )
    throw new Error("OpenAPI csrfHeader must document X-CSRF-Token");
  if (
    runtimeScheme?.type !== "http" ||
    runtimeScheme.scheme !== "bearer" ||
    runtimeScheme.bearerFormat !== "opaque-agent-runtime-token"
  ) {
    throw new Error("OpenAPI runtimeBearer must document the opaque runtime bearer token");
  }
  assertAgentMutationSchemaContracts(sourceDocument);
  assertAgentLifeLedgerContracts(sourceDocument);

  const documented = new Set<string>();
  for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
    const sourcePathItem = sourceDocument.paths?.[routePath];
    if (!sourcePathItem) throw new Error(`Source path item missing for ${routePath}`);
    for (const method of methods) {
      const operation = pathItem[method];
      const sourceOperation = sourcePathItem[method];
      if (!operation || !sourceOperation) continue;
      const key = operationKey(method, routePath);
      documented.add(key);
      if (!operation.operationId) throw new Error(`${key} has no operationId`);

      const responseCodes = Object.keys(operation.responses ?? {});
      if (!responseCodes.some((code) => /^2\d\d$/u.test(code)))
        throw new Error(`${key} has no successful response`);
      for (const [code, response] of Object.entries(operation.responses ?? {})) {
        if (!response.headers?.["X-Request-Id"])
          throw new Error(`${key} response ${code} must document X-Request-Id`);
      }

      const effectiveSecurity = operation.security ?? document.security;
      const expectedSecurity = internalRuntimeOperations.has(key)
        ? ["runtimeBearer"]
        : publicOperations.has(key)
          ? []
          : method === "get"
            ? ["sessionCookie"]
            : ["sessionCookie", "csrfHeader"];
      if (!hasExactSecurity(effectiveSecurity, expectedSecurity))
        throw new Error(`${key} security must be exactly [${expectedSecurity.join(", ")}]`);

      const parameters = [
        ...(sourcePathItem.parameters ?? []),
        ...(sourceOperation.parameters ?? []),
      ].map((parameter) => resolveParameter(sourceDocument, parameter));
      const parameterKeys = parameters.map((parameter) => `${parameter.in}:${parameter.name}`);
      if (new Set(parameterKeys).size !== parameterKeys.length)
        throw new Error(`${key} contains duplicate parameters`);

      const expectedPathNames = [...routePath.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]!);
      const pathParameters = parameters.filter((parameter) => parameter.in === "path");
      assertExactNames(
        pathParameters.map((parameter) => parameter.name ?? ""),
        expectedPathNames,
        `${key} path parameters`,
      );
      for (const parameter of pathParameters) {
        if (!parameter.required)
          throw new Error(`${key} path parameter ${parameter.name} is optional`);
        if (parameter.name?.endsWith("Id") && parameter.schema?.format !== "uuid")
          throw new Error(`${key} path parameter ${parameter.name} must use UUID format`);
      }

      assertExactNames(
        parameters
          .filter((parameter) => parameter.in === "query")
          .map((parameter) => parameter.name ?? ""),
        expectedQueryParameters[key] ?? [],
        `${key} query parameters`,
      );

      const requestBodyReference = sourceOperation.requestBody?.$ref;
      const expectedRequestBody = expectedRequestBodies[key];
      if (expectedRequestBody) {
        const expectedReference = `#/components/requestBodies/${expectedRequestBody}`;
        if (requestBodyReference !== expectedReference)
          throw new Error(`${key} request body must reference ${expectedReference}`);
        const payloadTooLarge = sourceOperation.responses?.["413"];
        if (payloadTooLarge?.$ref !== "#/components/responses/PayloadTooLarge") {
          throw new Error(
            `${key} response 413 must reference #/components/responses/PayloadTooLarge`,
          );
        }
      } else if (sourceOperation.requestBody) {
        throw new Error(`${key} documents an unexpected request body`);
      }

      const hasIdempotencyKey = parameters.some(
        (parameter) =>
          parameter.in === "header" && parameter.name?.toLowerCase() === "idempotency-key",
      );
      if (hasIdempotencyKey !== idempotentOperations.has(key))
        throw new Error(`${key} Idempotency-Key contract does not match runtime policy`);
    }
  }

  const runtime = await runtimeOperations();
  const missing = [...runtime].filter((operation) => !documented.has(operation)).sort();
  const stale = [...documented].filter((operation) => !runtime.has(operation)).sort();
  if (missing.length || stale.length) {
    throw new Error(
      [
        missing.length ? `Missing from OpenAPI:\n${missing.join("\n")}` : "",
        stale.length ? `Not implemented by runtime:\n${stale.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  process.stdout.write(
    `OpenAPI 3.1 validation passed: ${documented.size} runtime operations aligned; security, parameters, request bodies, agent mutation/life-ledger schemas and response headers verified.\n`,
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href) void main();
