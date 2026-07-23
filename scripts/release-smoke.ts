import { readFileSync } from "node:fs";
import path from "node:path";
import {
  constitutionalTopicCreationIssue,
  constitutionalTopicWritingIssue,
} from "@/lib/content/constitution-writing-policy";
import {
  preferredTopicCreationSearchQuery,
  topicCanonicalSearchCandidates,
} from "@/modules/topics/domain/canonicalization";

interface ReleaseSmokeOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  root?: string;
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`RELEASE_SMOKE_FAILED:${code}`);
}

function source(root: string, relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  invariant(["http:", "https:"].includes(url.protocol), "BASE_URL_PROTOCOL");
  invariant(!url.username && !url.password, "BASE_URL_CREDENTIALS");
  url.pathname = url.pathname.replace(/\/+$/gu, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/gu, "");
}

export async function runReleaseSmoke(options: ReleaseSmokeOptions = {}): Promise<void> {
  const root = options.root ?? process.cwd();
  invariant(
    preferredTopicCreationSearchQuery("yapay zeka nedir?") === "yapay zeka",
    "CANONICAL_QUESTION_QUERY",
  );
  invariant(
    preferredTopicCreationSearchQuery("php mi asp mi?") === "php mi asp mi",
    "AMBIGUOUS_QUESTION_QUERY",
  );
  invariant(
    topicCanonicalSearchCandidates("yapay zeka nedir?")
      .map(({ reason }) => reason)
      .join("|") === "EXACT_TITLE|QUESTION_SUFFIX|QUESTION_SUFFIX",
    "CANONICAL_QUERY_ORDER",
  );
  invariant(
    constitutionalTopicWritingIssue("Son dakika: örnek olay")?.code ===
      "CONSTITUTION_TOPIC_NEWS_HEADLINE",
    "NEWS_HEADLINE_REJECTION",
  );
  invariant(
    constitutionalTopicCreationIssue("armut nedir", "Gülgiller familyasında bir meyvedir.")
      ?.code === "CONSTITUTION_TOPIC_QUESTION_ANSWER",
    "QUESTION_ANSWER_REJECTION",
  );
  invariant(
    constitutionalTopicCreationIssue("uzun süre beklemek", "Bilenler yazsın.")?.code ===
      "CONSTITUTION_TOPIC_FIRST_ENTRY_DEPENDENT",
    "DEPENDENT_FIRST_ENTRY_REJECTION",
  );

  const searchRepository = source(root, "src/modules/search/repository/search.ts");
  const topicRepository = source(root, "src/modules/topics/repository/topics.ts");
  const topicService = source(root, "src/modules/topics/application/topics.ts");
  const topicForm = source(root, "src/components/topics/create-topic-form.tsx");
  const actionExecutor = source(root, "src/modules/agents/application/action-executor.ts");
  invariant(searchRepository.includes("FROM topic_aliases AS alias"), "ALIAS_SEARCH_PATH");
  invariant(topicRepository.includes("aliases: { some:"), "ALIAS_CONFLICT_PATH");
  invariant(topicService.includes("input.canonicalOverride"), "HUMAN_OVERRIDE_SERVICE");
  invariant(topicForm.includes("canonicalOverride: true"), "HUMAN_OVERRIDE_FORM");
  invariant(topicService.includes("TOPIC_CANONICAL_SUGGESTION"), "CANONICAL_SUGGESTION_CODE");
  invariant(
    actionExecutor.includes("rejectionCode: rejection.code"),
    "AGENT_REJECTION_PERSISTENCE",
  );

  if (!options.baseUrl) return;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  for (const pathname of ["/api/health", "/api/ready"]) {
    const response = await fetcher(`${baseUrl}${pathname}`, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    invariant(
      response.status === 200,
      `HTTP_${pathname.slice(5).toUpperCase()}_${response.status}`,
    );
  }
  const searchResponse = await fetcher(
    `${baseUrl}/api/v1/search?type=topics&q=${encodeURIComponent("yapay zeka")}`,
    {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    },
  );
  invariant(searchResponse.status === 200, `HTTP_SEARCH_${searchResponse.status}`);
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: pnpm smoke:release [--base-url <http(s)://host>]",
      "",
      "Runs the shared schema-neutral release contract. It never writes to the database.",
      "",
    ].join("\n"),
  );
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  invariant(value && !value.startsWith("--"), `ARGUMENT_${name.slice(2).toUpperCase()}`);
  return value;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }
  const baseUrl = argumentValue("--base-url");
  await runReleaseSmoke({ ...(baseUrl ? { baseUrl } : {}) });
  process.stdout.write(
    `RELEASE_SMOKE PASS static=1${baseUrl ? " health=200 ready=200 search=200" : ""}\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(new URL(import.meta.url).pathname))
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "RELEASE_SMOKE_FAILED:UNKNOWN";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
