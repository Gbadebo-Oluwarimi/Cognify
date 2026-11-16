import { createHash, randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { ensureIndexes, getDb } from "@/lib/server/db";
import { OpenParserError, openParserConfig, submitOpenParserFiles } from "@/lib/server/openparser";
import { extractionSchemaForCategory } from "@/lib/server/textbook-extraction-schema";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ sessionId: string }> };
const maxFileBytes = Number(process.env.MATERIAL_MAX_FILE_SIZE) || 10 * 1024 * 1024;
const maxSessionBytes = Number(process.env.MATERIAL_MAX_BATCH_SIZE) || 50 * 1024 * 1024;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const cleanName = (name: string) => name.replace(/[\\/]/g, "_").slice(0, 180) || "document";

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const sessionId = parseObjectId((await context.params).sessionId);
    if (!sessionId) return Response.json({ error: "Upload session not found" }, { status: 404 });
    const db = await getDb();
    const session = await db.collection("uploadSessions").findOne({ _id: sessionId, studentId: user.id });
    if (!session) return Response.json({ error: "Upload session not found" }, { status: 404 });
    const form = await request.formData();
    const requestIdRaw = String(form.get("requestId") ?? "");
    const requestId = /^[\da-f-]{36}$/i.test(requestIdRaw) ? requestIdRaw : randomUUID();
    const priorRetry = session.retryRequestId === requestId;
    const failedDocs = priorRetry && Array.isArray(session.retryDocumentIds)
      ? await db.collection("uploadedDocuments").find({ _id: { $in: session.retryDocumentIds }, uploadSessionId: sessionId, studentId: user.id }).sort({ fileIndex: 1 }).toArray()
      : await db.collection("uploadedDocuments").find({ uploadSessionId: sessionId, studentId: user.id, status: "FAILED" }).sort({ fileIndex: 1 }).toArray();
    if (!failedDocs.length) return Response.json({ error: "This upload has no failed documents to retry." }, { status: 409 });
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (files.length !== failedDocs.length) return Response.json({ error: `Select the ${failedDocs.length} failed file(s), in the order shown.` }, { status: 400 });
    if (files.reduce((sum, file) => sum + file.size, 0) > maxSessionBytes) return Response.json({ error: "The selected files exceed the combined upload size limit." }, { status: 413 });
    openParserConfig();
    const prepared = [];
    for (const [index, file] of files.entries()) {
      if (file.size > maxFileBytes) return Response.json({ error: `${cleanName(file.name)} exceeds the per file size limit.` }, { status: 413 });
      const bytes = Buffer.from(await file.arrayBuffer());
      const detected = await fileTypeFromBuffer(bytes);
      if (!detected || !["application/pdf", "image/jpeg", "image/png"].includes(detected.mime)) return Response.json({ error: `${cleanName(file.name)} is not a supported PDF, JPG, JPEG, or PNG file.` }, { status: 415 });
      if (failedDocs[index].contentHash !== sha256(bytes)) return Response.json({ error: `Selected file ${index + 1} does not match the failed source ${failedDocs[index].originalFileName}.` }, { status: 409 });
      prepared.push({ bytes, mimeType: detected.mime, document: failedDocs[index] });
    }

    if (session.retryRequestId && !priorRetry && ["SUBMITTING", "SUBMISSION_RETRYABLE", "SUBMITTED", "PROCESSING"].includes(session.status)) return Response.json({ error: "A retry is already in progress for this session." }, { status: 409 });
    const clientItemIds = priorRetry
      ? failedDocs.map((doc: any) => doc.retryClientItemId ?? doc.openParserClientItemId)
      : prepared.map(() => randomUUID());
    const idempotencyKey = priorRetry && typeof session.retryIdempotencyKey === "string" ? session.retryIdempotencyKey : `cognify-retry-${session._id}-${requestId}`;
    if (priorRetry && session.openParserJobId && ["SUBMITTED", "PROCESSING", "COMPLETED", "PARTIALLY_COMPLETED"].includes(session.status)) {
      return Response.json({ uploadSession: { id: String(session._id), status: session.status, openParserJobId: session.openParserJobId } }, { status: 202 });
    }

    await ensureIndexes();
    const now = new Date();
    await db.collection("uploadSessions").updateOne({ _id: sessionId, studentId: user.id }, { $set: {
      status: "SUBMITTING", errorMessage: null, retryRequestId: requestId, retryIdempotencyKey: idempotencyKey,
      retryDocumentIds: failedDocs.map(doc => doc._id), openParserJobId: null, updatedAt: now,
    } });
    await Promise.all(prepared.map((item, index) => db.collection("uploadedDocuments").updateOne({ _id: item.document._id, studentId: user.id, status: "FAILED" }, { $set: {
      status: "PENDING", errorCode: null, errorMessage: null, retryClientItemId: clientItemIds[index], openParserClientItemId: clientItemIds[index], updatedAt: now,
    } })));

    const items = prepared.map((item, index) => ({
      client_item_id: clientItemIds[index], file_index: index,
      ocr_model: process.env.OPENPARSER_OCR_MODEL || "paddleocr-vl-1.6",
      llm_model: process.env.OPENPARSER_LLM_MODEL || "openai/gpt-6-luna",
      schema: extractionSchemaForCategory(session.category, String(item.document._id)), grounding: "field" as const,
    }));
    let submitted;
    try {
      submitted = await submitOpenParserFiles({ files: prepared.map(item => ({ name: item.document.originalFileName, mimeType: item.mimeType, bytes: item.bytes })), items, idempotencyKey, operation: "EXTRACT" });
    } catch (error) {
      const status = error instanceof OpenParserError ? error.status : null;
      const retryable = status === null || status === 429 || status >= 500;
      const retryAfter = error instanceof OpenParserError ? error.retryAfter : null;
      await db.collection("uploadSessions").updateOne({ _id: sessionId, studentId: user.id }, { $set: {
        status: retryable ? "SUBMISSION_RETRYABLE" : "PARTIALLY_COMPLETED", errorCode: status ? `HTTP_${status}` : "NETWORK_ERROR",
        errorMessage: retryable ? "OpenParser is temporarily unavailable. Retry with the same failed files." : "OpenParser rejected the failed-file retry.",
        retryAfter: retryAfter ?? null, updatedAt: new Date(),
      } });
      await Promise.all(prepared.map(item => db.collection("uploadedDocuments").updateOne({ _id: item.document._id, studentId: user.id }, { $set: { status: "FAILED", errorMessage: retryable ? "OpenParser did not confirm this retry. Re-select the same file to safely retry." : "OpenParser rejected this retry.", updatedAt: new Date() } })));
      return Response.json({ error: retryable ? "OpenParser is temporarily unavailable. Retry with the same failed files." : error instanceof Error ? error.message : "OpenParser rejected this retry." }, { status: status === 429 ? 429 : status && status >= 400 && status < 500 ? 422 : 502, ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}) });
    }
    await Promise.all([
      db.collection("uploadSessions").updateOne({ _id: sessionId, studentId: user.id }, { $set: {
        openParserJobId: submitted.jobId, requestMode: submitted.requestMode, status: "SUBMITTED", submissionResponse: submitted.body,
        submittedAt: new Date(), operation: "EXTRACT", ocrModel: process.env.OPENPARSER_OCR_MODEL || "paddleocr-vl-1.6", llmModel: process.env.OPENPARSER_LLM_MODEL || "openai/gpt-6-luna", errorMessage: null, updatedAt: new Date(),
      }, $inc: { submitAttempts: 1 } }),
      db.collection("uploadedDocuments").updateMany({ _id: { $in: failedDocs.map(doc => doc._id) }, studentId: user.id }, { $set: { status: "SUBMITTED", openParserJobId: submitted.jobId, updatedAt: new Date() } }),
    ]);
    return Response.json({ uploadSession: { id: String(sessionId), status: "SUBMITTED", openParserJobId: submitted.jobId, documentCount: failedDocs.length } }, { status: 202 });
  } catch (error) {
    console.error("OpenParser failed-file retry failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not retry these files with OpenParser." }, { status: 503 });
  }
}
