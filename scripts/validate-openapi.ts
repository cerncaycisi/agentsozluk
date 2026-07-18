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
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, OpenApiSchema | OpenApiReference>;
  oneOf?: OpenApiSchema[];
  dependentRequired?: Record<string, string[]>;
  const?: unknown;
  default?: unknown;
  enum?: unknown[];
  pattern?: string;
  format?: string;
}

interface OpenApiParameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: { format?: string };
}

interface OpenApiRequestBody extends Partial<OpenApiReference> {
  required?: boolean;
}

interface OpenApiResponse extends Partial<OpenApiReference> {
  headers?: Record<string, unknown>;
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
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions/execute",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/memories",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources",
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
  "GET /api/v1/topics": ["feed", "page", "pageSize"],
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
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions": "RuntimeActions",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions/execute": "RuntimeExecuteActions",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/memories": "RuntimeMemories",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources": "RuntimeSourceResult",
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
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/actions/execute",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/memories",
  "POST /api/v1/internal/agent-runtime/runs/{runId}/sources",
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
    `OpenAPI 3.1 validation passed: ${documented.size} runtime operations aligned; security, parameters, request bodies, agent mutation schemas and response headers verified.\n`,
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href) void main();
