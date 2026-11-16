export type BatchFile = { name: string; mimeType: string; bytes: Uint8Array };
export type BatchItem = { client_item_id: string; file_index: number; ocr_model: string; output_format: "openparser@1" };
export type ExtractItem = { client_item_id: string; file_index: number; ocr_model: string; llm_model: string; schema: Record<string, unknown>; grounding: "field" };
export type OpenParserOperation = "PARSE" | "EXTRACT";

export class OpenParserError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter: string | null = null) {
    super(message);
    this.name = "OpenParserError";
  }
}

export function openParserConfig() {
  const apiKey = process.env.OPENPARSER_API_KEY;
  if (!apiKey) throw new Error("OPENPARSER_API_KEY is not configured");
  return { apiKey, baseUrl: (process.env.OPENPARSER_BASE_URL || "https://api.openparser.dev").replace(/\/+$/, "") };
}

export async function submitOpenParserFiles(args: { files: BatchFile[]; items: BatchItem[] | ExtractItem[]; idempotencyKey: string; operation?: OpenParserOperation }) {
  const { apiKey, baseUrl } = openParserConfig();
  if (args.files.length === 0 || args.files.length !== args.items.length) throw new Error("OpenParser batch files and items must have matching lengths");
  const single = args.files.length === 1;
  const operation = args.operation ?? "PARSE";
  const form = new FormData();
  for (const file of args.files) {
    const body = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
    form.append(single ? "file" : "files", new Blob([body], { type: file.mimeType }), file.name);
  }
  const request = operation === "EXTRACT"
    ? single
      ? (() => { const item = args.items[0] as ExtractItem; return { ocr_model: item.ocr_model, llm_model: item.llm_model, schema: item.schema, grounding: item.grounding }; })()
      : { output_format: "openparser@1", items: args.items }
    : single
      ? { ocr_model: args.items[0].ocr_model, output_format: "openparser@1" }
      : { output_format: "openparser@1", items: args.items };
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  const timeoutMs = Math.min(50_000, Math.max(10_000, (Number(process.env.OPENPARSER_TIMEOUT_SECONDS) || 45) * 1000));
  const endpoint = operation === "EXTRACT" ? (single ? "/extract/async" : "/extract/batch") : (single ? "/parse/async" : "/parse/batch");
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": args.idempotencyKey },
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new OpenParserError(`OpenParser request failed (HTTP ${response.status}).`, response.status, response.headers.get("retry-after"));
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OpenParserError("OpenParser returned an invalid job response.", response.status);
  const record = body as Record<string, unknown>;
  const jobId = typeof record.id === "string" ? record.id : typeof record.job_id === "string" ? record.job_id : null;
  if (!jobId) throw new OpenParserError("OpenParser response did not include a job ID.", response.status);
  return { jobId, body: record, requestMode: operation === "EXTRACT" ? single ? "EXTRACT_ASYNC_SINGLE" as const : "EXTRACT_BATCH" as const : single ? "ASYNC_SINGLE" as const : "BATCH" as const };
}
