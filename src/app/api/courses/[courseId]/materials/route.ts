import { createHash, randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { ensureIndexes, getDb } from "@/lib/server/db";
import { OpenParserError, openParserConfig, submitOpenParserFiles } from "@/lib/server/openparser";
import { extractionSchemaForCategory } from "@/lib/server/textbook-extraction-schema";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ courseId: string }> };
const categories = new Set(["TEXTBOOK", "CLASS_NOTE", "PAST_QUESTION", "SYLLABUS", "OTHER"]);
const maxFileBytes = Number(process.env.MATERIAL_MAX_FILE_SIZE) || 10 * 1024 * 1024;
const maxSessionBytes = Number(process.env.MATERIAL_MAX_BATCH_SIZE) || 50 * 1024 * 1024;
const maxFiles = Math.min(8, Math.max(1, Number(process.env.MATERIAL_MAX_FILES) || 8));
const cleanName = (name: string) => name.replace(/[\/\\]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "document";
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const courseId = parseObjectId((await context.params).courseId);
    if (!courseId) return Response.json({ error: "Course not found" }, { status: 404 });
    const db = await getDb();
    const course = await db.collection("courses").findOne({ _id: courseId, studentId: user.id });
    if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
    await ensureIndexes();
    const [topics, sessions] = await Promise.all([
      db.collection("topics").find({ studentId: user.id, courseId }).sort({ name: 1 }).toArray(),
      db.collection("uploadSessions").find({ studentId: user.id, courseId }).sort({ createdAt: -1 }).limit(50).toArray(),
    ]);
    const sessionIds = sessions.map(session => session._id);
    const docs = await db.collection("uploadedDocuments").find({ studentId: user.id, uploadSessionId: { $in: sessionIds } }).sort({ uploadSessionId: 1, fileIndex: 1 }).toArray();
    const docsBySession = new Map<string, typeof docs>();
    for (const doc of docs) docsBySession.set(String(doc.uploadSessionId), [...(docsBySession.get(String(doc.uploadSessionId)) ?? []), doc]);
    return Response.json({
      topics: topics.map(topic => ({ id: String(topic._id), name: topic.name, description: topic.description ?? "" })),
      sessions: sessions.map(session => ({
        id: String(session._id), topicId: String(session.topicId), category: session.category, title: session.title,
        status: session.status, progress: session.progress ?? 0, createdAt: session.createdAt,
        completedFileCount: session.completedFileCount ?? 0, failedFileCount: session.failedFileCount ?? 0,
        errorMessage: session.errorMessage ?? null,
        retryRequestId: session.retryRequestId ?? null,
        documents: (docsBySession.get(String(session._id)) ?? []).map(doc => ({
          id: String(doc._id), filename: doc.originalFileName, fileIndex: doc.fileIndex, mimeType: doc.mimeType,
          fileSize: doc.fileSize, status: doc.status, errorMessage: doc.errorMessage ?? null,
        })),
      })),
    });
  } catch (error) {
    console.error("Course OCR list failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not load course uploads" }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const courseId = parseObjectId((await context.params).courseId);
    if (!courseId) return Response.json({ error: "Course not found" }, { status: 404 });
    const db = await getDb();
    const course = await db.collection("courses").findOne({ _id: courseId, studentId: user.id, status: "active" });
    if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
    const form = await request.formData();
    const category = String(form.get("materialType") ?? form.get("category") ?? "").toUpperCase();
    const topicIdRaw = String(form.get("topicId") ?? "");
    const topicName = String(form.get("topicName") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const title = String(form.get("title") ?? "").trim().slice(0, 180);
    const requestIdRaw = String(form.get("requestId") ?? "");
    const requestId = /^[\da-f-]{36}$/i.test(requestIdRaw) ? requestIdRaw : randomUUID();
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!categories.has(category)) return Response.json({ error: "Choose a valid document category." }, { status: 400 });
    if (!files.length || files.length > maxFiles) return Response.json({ error: `Choose between 1 and ${maxFiles} files.` }, { status: 400 });
    if (topicIdRaw && topicName) return Response.json({ error: "Choose an existing topic or enter a new topic name, not both." }, { status: 400 });
    if (!topicIdRaw && topicName.length < 2) return Response.json({ error: "Choose a course topic or enter a new topic name." }, { status: 400 });
    if (files.reduce((sum, file) => sum + file.size, 0) > maxSessionBytes) return Response.json({ error: "The selected files exceed the combined upload size limit." }, { status: 413 });

    await ensureIndexes();
    openParserConfig();
    const topicIdExisting = topicIdRaw ? parseObjectId(topicIdRaw) : null;
    let topic: { _id: ObjectId; name: string } | null = null;
    if (topicIdExisting) {
      const existing = await db.collection("topics").findOne({ _id: topicIdExisting, studentId: user.id, courseId });
      if (existing) topic = { _id: existing._id, name: existing.name };
    }
    if (topicIdRaw && (!topicIdExisting || !topic)) return Response.json({ error: "Topic not found in this course." }, { status: 404 });

    const prepared: Array<{ file: File; bytes: Buffer; mimeType: string; contentHash: string }> = [];
    for (const file of files) {
      if (file.size > maxFileBytes) return Response.json({ error: `${cleanName(file.name)} exceeds the per file size limit.` }, { status: 413 });
      const bytes = Buffer.from(await file.arrayBuffer());
      const detected = await fileTypeFromBuffer(bytes);
      if (!detected || !["application/pdf", "image/jpeg", "image/png"].includes(detected.mime)) {
        return Response.json({ error: `${cleanName(file.name)} is not a supported PDF, JPG, JPEG, or PNG file.` }, { status: 415 });
      }
      prepared.push({ file, bytes, mimeType: detected.mime, contentHash: sha256(bytes) });
    }

    if (!topic) {
      const existing = await db.collection("topics").findOne({ studentId: user.id, courseId, name: topicName });
      if (existing) topic = { _id: existing._id, name: existing.name };
      else {
        const now = new Date();
        const topicObjectId = new ObjectId();
        await db.collection("topics").insertOne({ _id: topicObjectId, studentId: user.id, courseId, name: topicName, description: "", createdAt: now, updatedAt: now });
        topic = { _id: topicObjectId, name: topicName };
      }
    }

    const idempotencyKey = `cognify-${user.id}-${requestId}`;
    let session = await db.collection("uploadSessions").findOne({ studentId: user.id, idempotencyKey });
    let documents: any[];
    if (session) {
      if (String(session.courseId) !== String(courseId) || String(session.topicId) !== String(topic._id) || session.category !== category || session.documentCount !== prepared.length) {
        return Response.json({ error: "This upload retry does not match the original request." }, { status: 409 });
      }
      documents = await db.collection("uploadedDocuments").find({ uploadSessionId: session._id, studentId: user.id }).sort({ fileIndex: 1 }).toArray();
      if (documents.length !== prepared.length || documents.some((doc, index) => doc.contentHash !== prepared[index].contentHash)) {
        return Response.json({ error: "This upload retry does not match the original files and order." }, { status: 409 });
      }
      if (session.openParserJobId) return Response.json({ uploadSession: { id: String(session._id), status: session.status, openParserJobId: session.openParserJobId } }, { status: 202 });
    } else {
      const now = new Date();
      const sessionId = new ObjectId();
      session = {
        _id: sessionId, studentId: user.id, courseId, topicId: topic._id, category, title: title || cleanName(prepared[0].file.name),
        documentCount: prepared.length, completedFileCount: 0, failedFileCount: 0, status: "SUBMITTING", progress: 0,
        idempotencyKey, submitAttempts: 0, openParserJobId: null, errorMessage: null, createdAt: now, updatedAt: now,
      };
      const docs = prepared.map((item, index) => ({
        _id: new ObjectId(), uploadSessionId: sessionId, studentId: user.id, courseId, topicId: topic!._id,
        originalFileName: cleanName(item.file.name), mimeType: item.mimeType, fileSize: item.bytes.length, fileIndex: index,
        contentHash: item.contentHash, openParserClientItemId: randomUUID(), status: "PENDING", errorCode: null, errorMessage: null,
        createdAt: now, updatedAt: now,
      }));
      await db.collection("uploadSessions").insertOne(session);
      await db.collection("uploadedDocuments").insertMany(docs);
      documents = docs;
    }

    const items = prepared.map((_, index) => ({
      client_item_id: documents[index].openParserClientItemId, file_index: index,
      ocr_model: process.env.OPENPARSER_OCR_MODEL || "paddleocr-vl-1.6",
      llm_model: process.env.OPENPARSER_LLM_MODEL || "openai/gpt-6-luna",
      schema: extractionSchemaForCategory(category, String(documents[index]._id)), grounding: "field" as const,
    }));
    let submitted: { jobId: string; body: Record<string, unknown>; requestMode: "ASYNC_SINGLE" | "BATCH" | "EXTRACT_ASYNC_SINGLE" | "EXTRACT_BATCH" };
    try {
      submitted = await submitOpenParserFiles({ files: prepared.map((item, index) => ({ name: documents[index].originalFileName, mimeType: item.mimeType, bytes: item.bytes })), items, idempotencyKey, operation: "EXTRACT" });
    } catch (error) {
      const status = error instanceof OpenParserError ? error.status : null;
      const retryAfter = error instanceof OpenParserError ? error.retryAfter : null;
      const retryable = status === null || status === 429 || status >= 500;
      await db.collection("uploadSessions").updateOne({ _id: session._id, studentId: user.id }, { $set: { status: "SUBMISSION_RETRYABLE", errorMessage: "OpenParser could not be reached. Retry with the same selected files.", updatedAt: new Date() } });
      const finalStatus = retryable ? "SUBMISSION_RETRYABLE" : "FAILED";
      await db.collection("uploadSessions").updateOne({ _id: session._id, studentId: user.id }, { $set: { status: finalStatus, errorCode: status ? `HTTP_${status}` : "NETWORK_ERROR", errorMessage: retryable ? "OpenParser is temporarily unavailable. Retry with the same selected files." : error instanceof Error ? error.message : "OpenParser rejected the request.", retryAfter: retryAfter ?? null, updatedAt: new Date() } });
      if (!retryable) await db.collection("uploadedDocuments").updateMany({ uploadSessionId: session._id, studentId: user.id }, { $set: { status: "FAILED", errorCode: status ? `HTTP_${status}` : "SUBMISSION_FAILED", errorMessage: "OpenParser rejected this document batch.", updatedAt: new Date() } });
      const headers = retryAfter ? { "Retry-After": retryAfter } : undefined;
      return Response.json({ error: retryable ? "OpenParser is temporarily unavailable. Retry this upload with the same selected files." : error instanceof Error ? error.message : "OpenParser rejected this upload." }, { status: status === 429 ? 429 : status && status >= 400 && status < 500 ? 422 : 502, headers });
    }
    const now = new Date();
    await Promise.all([
      db.collection("uploadSessions").updateOne({ _id: session._id, studentId: user.id }, { $set: { openParserJobId: submitted.jobId, requestMode: submitted.requestMode, operation: "EXTRACT", ocrModel: process.env.OPENPARSER_OCR_MODEL || "paddleocr-vl-1.6", llmModel: process.env.OPENPARSER_LLM_MODEL || "openai/gpt-6-luna", status: "SUBMITTED", submissionResponse: submitted.body, submittedAt: now, errorMessage: null, updatedAt: now }, $inc: { submitAttempts: 1 } }),
      db.collection("uploadedDocuments").updateMany({ uploadSessionId: session._id, studentId: user.id }, { $set: { status: "SUBMITTED", openParserJobId: submitted.jobId, updatedAt: now } }),
    ]);
    return Response.json({ uploadSession: { id: String(session._id), status: "SUBMITTED", openParserJobId: submitted.jobId, documentCount: documents.length } }, { status: 202 });
  } catch (error) {
    console.error("OpenParser upload failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not submit these files to OpenParser." }, { status: 503 });
  }
}
