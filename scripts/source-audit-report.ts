export type SourceAuditStatus = "USABLE" | "EMPTY" | "ERROR";

export interface SourceAuditResult {
  url: string;
  status: SourceAuditStatus;
  itemCount: number;
  durationMs: number;
  errorCode?: string;
}

export interface SourceAuditSummary {
  sourceCount: number;
  originCount: number;
  usableSourceCount: number;
  usableOriginCount: number;
  emptySourceCount: number;
  errorSourceCount: number;
  usefulItemCount: number;
  errorCodes: Record<string, number>;
}

export function summarizeSourceAudit(results: SourceAuditResult[]): SourceAuditSummary {
  const origins = new Set(results.map(({ url }) => new URL(url).origin));
  const usable = results.filter(({ status }) => status === "USABLE");
  const usableOrigins = new Set(usable.map(({ url }) => new URL(url).origin));
  const errorCodes = new Map<string, number>();

  for (const result of results) {
    if (result.status !== "ERROR") continue;
    const code = result.errorCode ?? "SOURCE_FETCH_FAILED";
    errorCodes.set(code, (errorCodes.get(code) ?? 0) + 1);
  }

  return {
    sourceCount: results.length,
    originCount: origins.size,
    usableSourceCount: usable.length,
    usableOriginCount: usableOrigins.size,
    emptySourceCount: results.filter(({ status }) => status === "EMPTY").length,
    errorSourceCount: results.filter(({ status }) => status === "ERROR").length,
    usefulItemCount: usable.reduce((sum, { itemCount }) => sum + itemCount, 0),
    errorCodes: Object.fromEntries(
      [...errorCodes].sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}
