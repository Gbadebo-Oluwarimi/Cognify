import { BSON, GridFSBucket, MongoClient, ObjectId } from "mongodb";

for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile?.(file); } catch { /* Environment variables may be injected by the process manager. */ }
}
const required = ["MONGODB_URI", "MONGODB_DATABASE", "OPENPARSER_API_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} must be configured before the OCR worker starts`);

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DATABASE);
const largeResults = new GridFSBucket(db, { bucketName: "ocrRawResponses" });
const workerId = `${process.pid}-${Date.now()}`;
const model = process.env.OPENPARSER_OCR_MODEL || "paddleocr-vl-1.6";
const baseUrl = (process.env.OPENPARSER_BASE_URL || "https://api.openparser.dev").replace(/\/+$/, "");
const timeoutMs = Math.max(10, Number(process.env.OPENPARSER_TIMEOUT_SECONDS) || 60) * 1000;
const largeThreshold = 14 * 1024 * 1024;
const leaseMs = Math.max(timeoutMs + 30_000, 120_000);
let closing = false;

const safeError = error => error instanceof Error ? error.name : "ProcessingError";
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const asObject = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const lower = value => String(value ?? "").toLowerCase();

async function getJob(jobId) {
  const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${process.env.OPENPARSER_API_KEY}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const error = new Error(`OpenParser job lookup returned ${response.status}`);
    error.status = response.status;
    error.retryAfter = response.headers.get("retry-after");
    throw error;
  }
  return response.json();
}

function childRows(job) {
  const candidates = [job.children, job.results, job.items, job.child_jobs, job.child_results, job.result?.children, job.result?.results, job.result?.items];
  const rows = candidates.find(Array.isArray);
  return rows ?? [];
}

function childItemId(child) {
  return child.client_item_id ?? child.clientItemId ?? child.item?.client_item_id ?? child.request?.client_item_id ?? child.input?.client_item_id ?? child.metadata?.client_item_id ?? null;
}

function childParseResult(child) {
  const nested = child.result ?? child.result_json ?? child.response ?? null;
  if (nested && typeof nested === "object") return asObject(nested);
  if (child.parsed_document || child.parsedDocument) return asObject(child);
  return asObject(child.output ?? child.document ?? child);
}

function parsedDocumentFrom(result) { return asObject(result.parsed_document ?? result.parsedDocument ?? result.document ?? result); }

function childState(child) {
  return lower(child?.status ?? child?.state ?? child?.job_status);
}

function pageText(page) {
  if (typeof page.text === "string") return page.text;
  if (typeof page.markdown === "string") return page.markdown;
  return "";
}

async function writeLargeResult(resultId, result, pages, session, document) {
  const json = Buffer.from(JSON.stringify(result));
  const upload = largeResults.openUploadStreamWithId(new ObjectId(), `ocr-result-${resultId}.json`, { metadata: { resultId, contentType: "application/json" } });
  const fileId = upload.id;
  await new Promise((resolve, reject) => {
    upload.once("finish", resolve);
    upload.once("error", reject);
    upload.end(json);
  });
  const pageRows = [];
  for (let index = 0; index < pages.length; index++) {
    const pageData = pages[index];
    if (BSON.calculateObjectSize({ pageData }) < 15 * 1024 * 1024) {
      pageRows.push({ pageNumber: Number(pageData.number ?? pageData.page_number ?? index + 1), pageData });
    } else {
      const pageBytes = Buffer.from(JSON.stringify(pageData));
      const pageUpload = largeResults.openUploadStream(`ocr-page-${resultId}-${index + 1}.json`, { metadata: { resultId, pageNumber: index + 1, contentType: "application/json" } });
      await new Promise((resolve, reject) => { pageUpload.once("finish", resolve); pageUpload.once("error", reject); pageUpload.end(pageBytes); });
      pageRows.push({ pageNumber: Number(pageData.number ?? pageData.page_number ?? index + 1), rawPageFileId: pageUpload.id });
    }
  }
  if (pageRows.length) await db.collection("ocrPages").bulkWrite(pageRows.map(page => ({ updateOne: {
    filter: { uploadedDocumentId: new ObjectId(resultId), pageNumber: page.pageNumber },
    update: { $set: { ...page, studentId: session.studentId, courseId: session.courseId, topicId: session.topicId, sessionId: session._id, uploadedDocumentId: document._id, createdAt: new Date() }, $setOnInsert: { _id: new ObjectId() } }, upsert: true,
  } })));
  return fileId;
}

async function saveSuccess(session, document, child, parseResult) {
  const now = new Date();
  const parsedDocument = parsedDocumentFrom(parseResult);
  const pages = Array.isArray(parsedDocument.pages) ? parsedDocument.pages : [];
  const resultId = new ObjectId();
  const common = {
    studentId: session.studentId, courseId: session.courseId, topicId: session.topicId,
    sessionId: session._id, uploadSessionId: session._id, uploadedDocumentId: document._id,
    provider: "OPENPARSER", model: session.ocrModel ?? model, llmModel: session.llmModel ?? null,
    operation: session.operation ?? "PARSE", outputFormat: "openparser@1", openParserJobId: session.openParserJobId,
    openParserDocumentId: parsedDocument.document_id ?? child.document_id ?? null,
    pageCount: Number(parsedDocument.page_count ?? pages.length) || pages.length,
    status: "COMPLETED", errorCode: null, errorMessage: null, updatedAt: now,
  };
  const candidate = { ...common, rawResponse: parseResult };
  if (BSON.calculateObjectSize(candidate) > largeThreshold) {
    const fileId = await writeLargeResult(String(document._id), parseResult, pages, session, document);
    const projections = {
      extractedText: typeof parsedDocument.text === "string" && Buffer.byteLength(parsedDocument.text) < 2 * 1024 * 1024 ? parsedDocument.text : undefined,
      markdown: typeof parsedDocument.markdown === "string" && Buffer.byteLength(parsedDocument.markdown) < 2 * 1024 * 1024 ? parsedDocument.markdown : undefined,
      extractedData: parseResult.output && BSON.calculateObjectSize({ extractedData: parseResult.output }) < 2 * 1024 * 1024 ? parseResult.output : undefined,
    };
    await db.collection("ocrDocumentResults").updateOne({ uploadedDocumentId: document._id }, {
      $set: { ...common, ...projections, rawResponseStorage: { bucket: "ocrRawResponses", fileId, encoding: "utf-8-json" } },
      $unset: { rawResponse: "" }, $setOnInsert: { _id: resultId, createdAt: now },
    }, { upsert: true });
  } else {
    const projections = {
      extractedText: typeof parsedDocument.text === "string" ? parsedDocument.text : pages.map(pageText).filter(Boolean).join("\n\n"),
      markdown: typeof parsedDocument.markdown === "string" ? parsedDocument.markdown : pages.map(page => page.markdown).filter(value => typeof value === "string").join("\n\n"),
    };
    const record = { ...common, ...projections, extractedData: parseResult.output ?? null, rawResponse: parseResult };
    if (BSON.calculateObjectSize(record) > largeThreshold) {
      const fileId = await writeLargeResult(String(document._id), parseResult, pages, session, document);
      delete record.rawResponse;
      if (Buffer.byteLength(record.extractedText ?? "") > 2 * 1024 * 1024) delete record.extractedText;
      if (Buffer.byteLength(record.markdown ?? "") > 2 * 1024 * 1024) delete record.markdown;
      if (BSON.calculateObjectSize({ extractedData: record.extractedData }) > 2 * 1024 * 1024) delete record.extractedData;
      record.rawResponseStorage = { bucket: "ocrRawResponses", fileId, encoding: "utf-8-json" };
    }
    await db.collection("ocrDocumentResults").updateOne({ uploadedDocumentId: document._id }, {
      $set: record, $unset: { rawResponseStorage: "" }, $setOnInsert: { _id: resultId, createdAt: now },
    }, { upsert: true });
  }
  await db.collection("uploadedDocuments").updateOne({ _id: document._id, studentId: session.studentId }, { $set: {
    status: "COMPLETED", openParserDocumentId: parsedDocument.document_id ?? child.document_id ?? null,
    pageCount: common.pageCount, errorCode: null, errorMessage: null, updatedAt: now,
  } });
}

async function saveFailure(session, document, child, message) {
  const now = new Date();
  await db.collection("uploadedDocuments").updateOne({ _id: document._id, studentId: session.studentId }, { $set: {
    status: "FAILED", errorCode: child?.error?.code ?? child?.error_code ?? "OPENPARSER_CHILD_FAILED",
    errorMessage: String(message).slice(0, 500), updatedAt: now,
  } });
  await db.collection("ocrDocumentResults").updateOne({ uploadedDocumentId: document._id }, { $set: {
    studentId: session.studentId, courseId: session.courseId, topicId: session.topicId,
    sessionId: session._id, uploadSessionId: session._id, uploadedDocumentId: document._id,
    provider: "OPENPARSER", model, outputFormat: "openparser@1", openParserJobId: session.openParserJobId,
    rawResponse: child ?? {}, status: "FAILED", errorMessage: String(message).slice(0, 500), updatedAt: now,
  }, $setOnInsert: { _id: new ObjectId(), createdAt: now } }, { upsert: true });
}

async function pollBatch(session, documents, job) {
  const children = childRows(job);
  const byClientId = new Map(children.map(child => [childItemId(child), child]).filter(([id]) => typeof id === "string"));
  const parentStatus = lower(job.status ?? job.state ?? job.job?.status ?? job.job?.state);
  const terminal = ["succeeded", "success", "completed", "complete", "failed", "error", "partial", "partially_completed", "partially_succeeded"].includes(parentStatus);
  let completed = 0;
  let failed = 0;
  for (const document of documents) {
    if (["COMPLETED", "FAILED"].includes(document.status)) continue;
    const child = byClientId.get(document.openParserClientItemId);
    const state = childState(child);
    if (!child || ["queued", "pending", "processing", "running", "submitted"].includes(state)) {
      if (terminal) {
        await saveFailure(session, document, child, "OpenParser completed the batch without returning this document's parse result.");
        failed++;
        continue;
      }
      if (document.status !== "PROCESSING") await db.collection("uploadedDocuments").updateOne({ _id: document._id }, { $set: { status: "PROCESSING", updatedAt: new Date() } });
      continue;
    }
    if (["succeeded", "success", "completed", "complete"].includes(state)) {
      await saveSuccess(session, document, child, childParseResult(child));
      completed++;
    } else {
      const message = child.error?.message ?? child.error_message ?? child.message ?? `OpenParser child status: ${state || "unknown"}`;
      await saveFailure(session, document, child, message);
      failed++;
    }
  }
  const now = new Date();
  const finalCompleted = await db.collection("uploadedDocuments").countDocuments({ uploadSessionId: session._id, status: "COMPLETED" });
  const finalFailed = await db.collection("uploadedDocuments").countDocuments({ uploadSessionId: session._id, status: "FAILED" });
  if (terminal) {
    const finalStatus = finalFailed === 0 ? "COMPLETED" : finalCompleted > 0 ? "PARTIALLY_COMPLETED" : "FAILED";
    await db.collection("uploadSessions").updateOne({ _id: session._id, workerId }, { $set: {
      status: finalStatus, progress: 100, completedFileCount: finalCompleted, failedFileCount: finalFailed,
      openParserStatus: parentStatus, completedAt: now, errorMessage: finalFailed ? `${finalFailed} file(s) failed to parse.` : null, updatedAt: now,
    } });
    return;
  }
  await db.collection("uploadSessions").updateOne({ _id: session._id, workerId }, { $set: {
    status: "PROCESSING", progress: session.documentCount ? Math.floor((finalCompleted + finalFailed) * 100 / session.documentCount) : 0,
    completedFileCount: finalCompleted, failedFileCount: finalFailed, openParserStatus: parentStatus,
    nextAttemptAt: new Date(now.getTime() + Math.max(1500, Number(process.env.OPENPARSER_POLL_INTERVAL_MS) || 3000)), updatedAt: now,
  } });
}

async function claimSession() {
  const now = new Date();
  const result = await db.collection("uploadSessions").findOneAndUpdate({
    status: { $in: ["SUBMITTED", "PROCESSING"] }, openParserJobId: { $type: "string" },
    $and: [
      { $or: [{ workerLeaseUntil: { $lt: now } }, { workerLeaseUntil: { $exists: false } }] },
      { $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }] },
    ],
  }, { $set: { workerId, workerLeaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now } }, { sort: { createdAt: 1 }, returnDocument: "after" });
  return result?.value ?? result;
}

async function processSession(session) {
  try {
    const [documents, job] = await Promise.all([
      db.collection("uploadedDocuments").find({ uploadSessionId: session._id, studentId: session.studentId }).sort({ fileIndex: 1 }).toArray(),
      getJob(session.openParserJobId),
    ]);
    if (!documents.length) throw new Error("Upload session contains no document records");
    if (String(session.requestMode ?? "").includes("SINGLE") && documents.length === 1 && !childRows(job).length) {
      const result = job.result ?? ((job.parsed_document || job.parsedDocument) ? job : job.output ?? null);
      const normalized = result && typeof result === "object" ? {
        ...job,
        children: [{ client_item_id: documents[0].openParserClientItemId, status: job.status ?? job.state, result, document_id: result.document_id }],
      } : job;
      await pollBatch(session, documents, normalized);
    } else {
      await pollBatch(session, documents, job);
    }
  } catch (error) {
    const now = new Date();
    const retryAfter = Number(error?.retryAfter);
    const delay = retryAfter > 0 ? retryAfter * 1000 : Math.max(3000, Number(process.env.OPENPARSER_POLL_INTERVAL_MS) || 3000);
    await db.collection("uploadSessions").updateOne({ _id: session._id, workerId }, { $set: {
      status: "PROCESSING", lastPollError: safeError(error), nextAttemptAt: new Date(now.getTime() + delay), updatedAt: now,
    } });
    console.error(`OpenParser job ${session.openParserJobId} poll failed: ${safeError(error)}`);
  } finally {
    await db.collection("uploadSessions").updateOne({ _id: session._id, workerId }, { $unset: { workerId: "" }, $set: { workerLeaseUntil: new Date(0) } });
  }
}

async function poll() {
  console.log(`Cognify OpenParser polling worker ${workerId} running with model ${model}`);
  while (!closing) {
    const session = await claimSession().catch(error => { console.error("OCR session claim failed:", safeError(error)); return null; });
    if (session) await processSession(session);
    else await sleep(1200);
  }
}

async function shutdown() { closing = true; await client.close(); process.exit(0); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
await poll();
