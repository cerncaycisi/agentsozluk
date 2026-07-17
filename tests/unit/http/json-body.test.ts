import type { NextRequest } from "next/server";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { parseJson } from "@/lib/http/api";
import { MAX_JSON_BODY_BYTES } from "@/lib/http/json-body";

const schema = z.object({ value: z.string() });
const applicationOrigin = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

function loginRequest(body: BodyInit, headers: Record<string, string> = {}): NextRequest {
  return new Request(`${applicationOrigin}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: applicationOrigin,
      ...headers,
    },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit & { duplex?: "half" }) as NextRequest;
}

async function expectPayloadTooLarge(response: Response): Promise<void> {
  expect(response.status).toBe(413);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/u);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      code: "PAYLOAD_TOO_LARGE",
      message: "İstek gövdesi en fazla 64 KiB olabilir.",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    },
  });
}

describe("bounded JSON request bodies", () => {
  it("parses and validates a small JSON body", async () => {
    const request = new Request(`${applicationOrigin}/api`, {
      method: "POST",
      body: JSON.stringify({ value: "geçerli" }),
    });

    await expect(parseJson(request, schema)).resolves.toEqual({ value: "geçerli" });
  });

  it("accepts a valid JSON body at the exact byte limit", async () => {
    const prefix = '{"value":"';
    const suffix = '"}';
    const value = "a".repeat(MAX_JSON_BODY_BYTES - prefix.length - suffix.length);
    const body = `${prefix}${value}${suffix}`;
    expect(Buffer.byteLength(body, "utf8")).toBe(MAX_JSON_BODY_BYTES);
    const request = new Request(`${applicationOrigin}/api`, {
      method: "POST",
      headers: { "content-length": String(MAX_JSON_BODY_BYTES) },
      body,
    });

    await expect(parseJson(request, schema)).resolves.toEqual({ value });
  });

  it("keeps malformed JSON on the existing 422 contract", async () => {
    const response = await login(loginRequest("{"));

    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Geçerli bir JSON gövdesi gönderin.",
      },
    });
  });

  it("fast-rejects a declared oversized body with the API error envelope", async () => {
    const response = await login(
      loginRequest("{}", { "content-length": String(MAX_JSON_BODY_BYTES + 1) }),
    );

    await expectPayloadTooLarge(response);
  });

  it("hard-stops an oversized chunked body without Content-Length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_JSON_BODY_BYTES));
        controller.enqueue(new Uint8Array([0x20]));
      },
      cancel() {
        cancelled = true;
      },
    });

    const response = await login(loginRequest(stream));

    await expectPayloadTooLarge(response);
    expect(cancelled).toBe(true);
  });

  it("preserves schema validation after bounded parsing", async () => {
    const request = new Request(`${applicationOrigin}/api`, {
      method: "POST",
      body: JSON.stringify({ value: 123 }),
    });

    await expect(parseJson(request, schema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
    });
  });
});
