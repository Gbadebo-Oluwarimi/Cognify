import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { OpenParserError, submitOpenParserFiles } from "./openparser";

const originalFetch = globalThis.fetch;
const previousKey = process.env.OPENPARSER_API_KEY;
const previousBase = process.env.OPENPARSER_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.OPENPARSER_API_KEY;
  else process.env.OPENPARSER_API_KEY = previousKey;
  if (previousBase === undefined) delete process.env.OPENPARSER_BASE_URL;
  else process.env.OPENPARSER_BASE_URL = previousBase;
});

test("submits multiple actual files using the documented OpenParser batch multipart shape", async () => {
  process.env.OPENPARSER_API_KEY = "server-only-test-key";
  process.env.OPENPARSER_BASE_URL = "https://parser.example.test/";
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({ id: "job_test_123", status: "queued" }, { status: 202 });
  }) as typeof fetch;

  const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10]);
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const result = await submitOpenParserFiles({
    files: [{ name: "sample.pdf", mimeType: "application/pdf", bytes: pdfBytes }, { name: "sample.png", mimeType: "image/png", bytes: pngBytes }],
    items: [
      { client_item_id: "cognify-item-1", file_index: 0, ocr_model: "paddleocr-vl-1.6", output_format: "openparser@1" },
      { client_item_id: "cognify-item-2", file_index: 1, ocr_model: "paddleocr-vl-1.6", output_format: "openparser@1" },
    ],
    idempotencyKey: "cognify-test-request-1",
  });

  assert.equal(result.jobId, "job_test_123");
  assert.equal(capturedUrl, "https://parser.example.test/parse/batch");
  assert.equal(capturedInit?.method, "POST");
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("Authorization"), "Bearer server-only-test-key");
  assert.equal(headers.get("Idempotency-Key"), "cognify-test-request-1");
  assert.equal(headers.has("Content-Type"), false);
  const multipart = capturedInit?.body as FormData;
  const files = multipart.getAll("files") as File[];
  const file = files[0];
  assert.equal(file.name, "sample.pdf");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), pdfBytes);
  assert.equal(files[1].name, "sample.png");
  assert.deepEqual(new Uint8Array(await files[1].arrayBuffer()), pngBytes);
  const requestPart = multipart.get("request") as Blob;
  assert.deepEqual(JSON.parse(await requestPart.text()), {
    output_format: "openparser@1",
    items: [
      { client_item_id: "cognify-item-1", file_index: 0, ocr_model: "paddleocr-vl-1.6", output_format: "openparser@1" },
      { client_item_id: "cognify-item-2", file_index: 1, ocr_model: "paddleocr-vl-1.6", output_format: "openparser@1" },
    ],
  });
});

test("uses the async single-file parse endpoint for one document", async () => {
  process.env.OPENPARSER_API_KEY = "server-only-test-key";
  let capturedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = String(input);
    return Response.json({ id: "job_single_123", status: "queued" }, { status: 202 });
  }) as typeof fetch;
  const result = await submitOpenParserFiles({
    files: [{ name: "single.pdf", mimeType: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) }],
    items: [{ client_item_id: "cognify-item-1", file_index: 0, ocr_model: "paddleocr-vl-1.6", output_format: "openparser@1" }],
    idempotencyKey: "cognify-test-single",
  });
  assert.equal(capturedUrl, "https://api.openparser.dev/parse/async");
  assert.equal(result.requestMode, "ASYNC_SINGLE");
});

test("uses OpenParser Extract for one file and sends the schema, OCR model, LLM model and grounding mode", async () => {
  process.env.OPENPARSER_API_KEY = "server-only-test-key";
  let capturedUrl = "";
  let capturedRequest: Record<string, unknown> = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    const form = init?.body as FormData;
    capturedRequest = JSON.parse(await (form.get("request") as Blob).text());
    return Response.json({ id: "job_extract_single", status: "queued" }, { status: 202 });
  }) as typeof fetch;
  const schema = { type: "object", properties: { title: { type: "string" } } };
  const result = await submitOpenParserFiles({
    files: [{ name: "single.pdf", mimeType: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) }],
    items: [{ client_item_id: "item-1", file_index: 0, ocr_model: "paddleocr-vl-1.6", llm_model: "openai/gpt-6-luna", schema, grounding: "field" }],
    operation: "EXTRACT", idempotencyKey: "cognify-extract-single",
  });
  assert.equal(capturedUrl, "https://api.openparser.dev/extract/async");
  assert.deepEqual(capturedRequest, { ocr_model: "paddleocr-vl-1.6", llm_model: "openai/gpt-6-luna", schema, grounding: "field" });
  assert.equal(result.requestMode, "EXTRACT_ASYNC_SINGLE");
});

test("sends multiple documents through the OpenParser Extract batch endpoint", async () => {
  process.env.OPENPARSER_API_KEY = "server-only-test-key";
  let capturedUrl = "";
  let capturedRequest: Record<string, unknown> = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedRequest = JSON.parse(await ((init?.body as FormData).get("request") as Blob).text());
    return Response.json({ id: "job_extract_batch", status: "queued" }, { status: 202 });
  }) as typeof fetch;
  const schema = { type: "object", properties: { title: { type: "string" } } };
  await submitOpenParserFiles({
    files: [
      { name: "a.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1]) },
      { name: "b.pdf", mimeType: "application/pdf", bytes: new Uint8Array([2]) },
    ],
    items: [0, 1].map(file_index => ({ client_item_id: `item-${file_index}`, file_index, ocr_model: "paddleocr-vl-1.6", llm_model: "openai/gpt-6-luna", schema, grounding: "field" as const })),
    operation: "EXTRACT", idempotencyKey: "cognify-extract-batch",
  });
  assert.equal(capturedUrl, "https://api.openparser.dev/extract/batch");
  assert.deepEqual(capturedRequest, {
    output_format: "openparser@1",
    items: [0, 1].map(file_index => ({ client_item_id: `item-${file_index}`, file_index, ocr_model: "paddleocr-vl-1.6", llm_model: "openai/gpt-6-luna", schema, grounding: "field" })),
  });
});

test("does not expose provider response bodies or credentials on HTTP errors", async () => {
  process.env.OPENPARSER_API_KEY = "server-only-test-key";
  globalThis.fetch = (async () => new Response("secret provider detail", { status: 429, headers: { "Retry-After": "8" } })) as typeof fetch;
  await assert.rejects(submitOpenParserFiles({
    files: [{ name: "sample.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1]) }],
    items: [{ client_item_id: "cognify-item-1", file_index: 0, ocr_model: "paddleocr-vl-1.6", output_format: "openparser@1" }],
    idempotencyKey: "cognify-test-request-2",
  }), (error: unknown) => {
    assert.ok(error instanceof OpenParserError);
    assert.equal(error.status, 429);
    assert.equal(error.retryAfter, "8");
    assert.equal(error.message.includes("secret"), false);
    assert.equal(error.message.includes("server-only-test-key"), false);
    return true;
  });
});
