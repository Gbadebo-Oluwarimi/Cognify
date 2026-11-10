import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { v2 as cloudinary } from "cloudinary";

try { process.loadEnvFile?.(".env.local"); } catch { /* Environment can also be injected by the process manager. */ }
const required = ["MONGODB_URI", "MONGODB_DATABASE", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "OCR_SERVICE_URL", "OCR_API_TOKEN"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} must be configured before the OCR worker starts`);
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DATABASE);
const workerId = randomUUID();
const concurrency = Math.max(1, Number(process.env.OCR_WORKER_CONCURRENCY) || 1);
const maxAttempts = Math.max(1, Number(process.env.OCR_JOB_MAX_ATTEMPTS) || 5);
const timeoutMs = Math.max(10, Number(process.env.OCR_JOB_TIMEOUT_SECONDS) || 180) * 1000;
const leaseMs = Math.max(timeoutMs + 30_000, 240_000);
const active = new Set();
let shuttingDown = false;

const safeError = error => error instanceof Error ? error.name : "ProcessingError";
function assetUrl(asset) {
  return cloudinary.utils.private_download_url(asset.publicId, asset.format || undefined, {
    resource_type: asset.resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 10 * 60,
  });
}

async function ocrPage(source, pageNumber, pdfBytes) {
  const url = source.cloudinary.resourceType === "raw"
    ? `${process.env.OCR_SERVICE_URL.replace(/\/$/, "")}/v1/pdf/page`
    : `${process.env.OCR_SERVICE_URL.replace(/\/$/, "")}/v1/ocr`;
  const form = new FormData();
  const bytes = pdfBytes ?? Buffer.from(await (await fetch(assetUrl(source.cloudinary), { signal: AbortSignal.timeout(timeoutMs) })).arrayBuffer());
  if (!pdfBytes && source.cloudinary.resourceType === "raw") throw new Error("PDF source bytes were not loaded");
  form.append("file", new Blob([bytes], { type: source.mimeType }), source.originalFilename);
  if (source.cloudinary.resourceType === "raw") form.append("page_number", String(pageNumber));
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.OCR_API_TOKEN}` }, body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`OCR service returned ${response.status}`);
  return response.json();
}

function splitQuestions(text) {
  const starts = [...text.matchAll(/(?:^|\n)\s*(\d{1,3})[.)]\s+/g)];
  return starts.map((match, index) => {
    const begin = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const end = starts[index + 1]?.index ?? text.length;
    const chunk = text.slice(begin, end).trim();
    const lines = chunk.split(/\r?\n/);
    const questionLines = [];
    const options = [];
    for (const line of lines) {
      const option = line.match(/^\s*\(?([A-E])\)?[.)]\s*(.+)$/i);
      if (option) options.push({ label: option[1].toUpperCase(), text: option[2].trim() });
      else questionLines.push(line.trim());
    }
    return { number: Number(match[1]), chunk, questionText: questionLines.join(" ").trim(), options };
  }).filter(question => question.questionText.length > 0);
}

async function updateProgress(job, processed, total, failedPages) {
  await db.collection("processingJobs").updateOne({ _id: job._id, workerId, status: "processing" }, { $set: {
    currentPage: processed, totalPages: total, progressPercentage: total ? Math.floor(processed * 100 / total) : 100,
    failedPages, leaseUntil: new Date(Date.now() + leaseMs), updatedAt: new Date(),
  } });
}

async function savePage(job, document, source, pageNumber, sequenceNumber, result) {
  const pages = db.collection("ocrPages");
  const identity = { documentId: document._id, sourceFileId: source._id, pageNumber };
  const pageId = new ObjectId(); const now = new Date();
  await pages.updateOne(identity, { $set: {
    studentId: job.studentId, courseId: job.courseId, sequenceNumber,
    originalAsset: { publicId: source.cloudinary.publicId, secureUrl: source.cloudinary.secureUrl, resourceType: source.cloudinary.resourceType, format: source.cloudinary.format },
    extractedText: result.extractedText || "", lines: result.lines || [], layoutBlocks: result.layoutBlocks || [], tables: result.tables || [], formulas: result.formulas || [],
    confidenceScore: result.confidenceScore ?? null, extractionWarnings: [...(result.warnings || []), ...(document.documentType === "past_question" && splitQuestions(result.extractedText || "").length === 0 ? ["No deterministic question boundaries were found on this page; review the full OCR text."] : [])], raw: result.raw || [], ocrEngine: result.engine || "PaddleOCR", ocrModelVersion: result.modelVersion || null,
    status: "completed", errorMessage: null, updatedAt: now,
  }, $setOnInsert: { _id: pageId, ...identity, createdAt: now } }, { upsert: true });
  const page = await pages.findOne(identity);
  if (!page || document.documentType !== "past_question") return;
  const questions = splitQuestions(result.extractedText || "");
  const collection = db.collection("pastQuestions");
  for (const question of questions) {
    await collection.updateOne({ documentId: document._id, sourceFileId: source._id, sourcePageNumber: pageNumber, questionNumber: question.number }, {
      $setOnInsert: {
        documentId: document._id, studentId: job.studentId, courseId: job.courseId, sourcePageIds: [page._id], sourceFileId: source._id,
        examinationBody: null, examinationYear: null, subject: null, paperNumber: null, section: null,
        sourcePageNumber: pageNumber, questionNumber: question.number, questionText: question.questionText,
        questionOptions: question.options, correctAnswer: null, answerExplanation: null,
        sourcePageNumbers: [pageNumber], extractionConfidence: result.confidenceScore ?? null,
        extractionStatus: "needs_review", originalExtractedContent: question.chunk, correctedContent: null, verifiedAt: null,
        createdAt: now, updatedAt: now,
      },
    }, { upsert: true });
  }
}

async function processJob(job) {
  const documents = db.collection("documents");
  const document = await documents.findOne({ _id: job.documentId, studentId: job.studentId, courseId: job.courseId });
  if (!document) throw new Error("Document not found");
  const now = new Date();
  await documents.updateOne({ _id: document._id, studentId: job.studentId }, { $set: { ocrStatus: "processing", processingStartedAt: document.processingStartedAt || now, updatedAt: now } });
  let processed = 0;
  let sequenceNumber = 0;
  const failedPages = [];
  for (const source of document.originalFiles.sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
    let pdfBytes;
    if (source.cloudinary.resourceType === "raw") {
      const download = await fetch(assetUrl(source.cloudinary), { signal: AbortSignal.timeout(timeoutMs) });
      if (!download.ok) throw new Error(`Cloudinary download returned ${download.status}`);
      pdfBytes = Buffer.from(await download.arrayBuffer());
    }
    for (let pageNumber = 1; pageNumber <= source.pageCount; pageNumber++) {
      sequenceNumber++;
      const identity = { documentId: document._id, sourceFileId: source._id, pageNumber };
      const existing = await db.collection("ocrPages").findOne({ ...identity, status: "completed" });
      if (existing) { processed++; await updateProgress(job, processed, job.totalPages, failedPages); continue; }
      try {
        const result = await ocrPage(source, pageNumber, pdfBytes);
        await savePage(job, document, source, pageNumber, sequenceNumber, result);
      } catch (error) {
        const message = safeError(error);
        failedPages.push({ sourceFileId: source._id, pageNumber, errorMessage: message });
        await db.collection("ocrPages").updateOne(identity, { $set: { studentId: job.studentId, courseId: job.courseId, sequenceNumber, extractedText: "", extractionWarnings: [], status: "failed", errorMessage: message, updatedAt: new Date() }, $setOnInsert: { _id: new ObjectId(), ...identity, createdAt: new Date() } }, { upsert: true });
      }
      processed++;
      await updateProgress(job, processed, job.totalPages, failedPages);
    }
  }
  const status = failedPages.length === 0 ? "completed" : processed > failedPages.length ? "partially_completed" : "failed";
  const finished = new Date();
  await db.collection("processingJobs").updateOne({ _id: job._id, workerId }, { $set: { status, currentPage: processed, progressPercentage: processed ? Math.floor(processed * 100 / job.totalPages) : 0, failedPages, errorMessage: failedPages.length ? "One or more pages could not be processed." : null, completedAt: finished, leaseUntil: new Date(0), updatedAt: finished }, $unset: { workerId: "" } });
  await documents.updateOne({ _id: document._id, studentId: job.studentId }, { $set: { ocrStatus: status, errorMessage: failedPages.length ? "One or more pages could not be processed." : null, processingCompletedAt: finished, updatedAt: finished } });
}

async function claimJob() {
  const now = new Date();
  return db.collection("processingJobs").findOneAndUpdate(
    { attempts: { $lt: maxAttempts }, $or: [{ status: "queued" }, { status: "processing", leaseUntil: { $lt: now } }] },
    { $set: { status: "processing", workerId, startedAt: now, leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );
}

async function failExhaustedJobs() {
  const now = new Date();
  const exhausted = await db.collection("processingJobs").find({ attempts: { $gte: maxAttempts }, $or: [{ status: "queued" }, { status: "processing", leaseUntil: { $lt: now } }] }, { projection: { _id: 1, documentId: 1 } }).toArray();
  if (!exhausted.length) return;
  const ids = exhausted.map(job => job._id);
  await db.collection("processingJobs").updateMany({ _id: { $in: ids } }, { $set: { status: "failed", errorMessage: "The OCR job exhausted its retry limit.", completedAt: now, leaseUntil: new Date(0), updatedAt: now }, $unset: { workerId: "" } });
  await db.collection("documents").updateMany({ _id: { $in: exhausted.map(job => job.documentId) } }, { $set: { ocrStatus: "failed", errorMessage: "The OCR job exhausted its retry limit.", processingCompletedAt: now, updatedAt: now } });
}

async function poll() {
  while (!shuttingDown) {
    await failExhaustedJobs().catch(error => console.error("Could not close exhausted jobs:", safeError(error)));
    while (!shuttingDown && active.size < concurrency) {
      const job = await claimJob().catch(error => { console.error("OCR job claim failed:", safeError(error)); return null; });
      if (!job) break;
      const task = processJob(job).catch(async error => {
        const message = safeError(error); const now = new Date();
        const status = job.attempts >= maxAttempts ? "failed" : "partially_completed";
        await db.collection("processingJobs").updateOne({ _id: job._id, workerId }, { $set: { status, errorMessage: message, completedAt: now, leaseUntil: new Date(0), updatedAt: now }, $unset: { workerId: "" } });
        await db.collection("documents").updateOne({ _id: job.documentId, studentId: job.studentId }, { $set: { ocrStatus: status, errorMessage: "The OCR worker could not complete this document.", updatedAt: now } });
        console.error(`OCR job ${job._id} failed: ${message}`);
      }).finally(() => active.delete(task));
      active.add(task);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function shutdown() { shuttingDown = true; await Promise.allSettled([...active]); await client.close(); process.exit(0); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
console.log(`Cognify OCR worker ${workerId} running with concurrency ${concurrency}`);
await poll();
