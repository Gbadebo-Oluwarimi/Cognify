import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { fileTypeFromBuffer } from "file-type";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { ensureIndexes, getDb } from "@/lib/server/db";
import { destroyPrivateAsset, uploadPrivateBuffer } from "@/lib/server/cloudinary";
export const runtime = "nodejs";
export const maxDuration = 60;

const allowedTypes = new Set(["textbook", "syllabus", "note", "past_question"]);
const maxBytes = Number(process.env.OCR_MAX_FILE_SIZE) || 20 * 1024 * 1024;
const maxPages = Number(process.env.OCR_MAX_PAGE_COUNT) || 200;
const maxFiles = Number(process.env.OCR_MAX_FILES_PER_UPLOAD) || 10;
const safeName = (name: string) => name.replace(/[/\\]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "upload";

export async function GET(_request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const courseId = parseObjectId((await context.params).courseId);
    if (!courseId) return Response.json({ error: "Course not found" }, { status: 404 });
    const db = await getDb();
    if (!await db.collection("courses").findOne({ _id: courseId, studentId: user.id })) return Response.json({ error: "Course not found" }, { status: 404 });
    const documents = await db.collection("documents").find({ studentId: user.id, courseId }).sort({ createdAt: -1 }).toArray();
    const jobs = await db.collection("processingJobs").find({ _id: { $in: documents.map(document => document.processingJobId) }, studentId: user.id }).toArray();
    const jobsById = new Map(jobs.map(job => [String(job._id), job]));
    return Response.json({ documents: documents.map(d => { const job = jobsById.get(String(d.processingJobId)); return { id: String(d._id), title: d.title, description: d.description, documentType: d.documentType, fileCount: d.originalFiles.length, pageCount: d.pageCount, ocrStatus: d.ocrStatus, progressPercentage: job?.progressPercentage ?? 0, failedPageCount: job?.failedPages?.length ?? 0, createdAt: d.createdAt }; }) });
  } catch { return Response.json({ error: "Could not load course documents" }, { status: 503 }); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  const uploaded: Array<{ publicId: string; resourceType: "image" | "raw" }> = [];
  let documentId: ObjectId | null = null;
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const courseId = parseObjectId((await context.params).courseId);
    if (!courseId) return Response.json({ error: "Course not found" }, { status: 404 });
    const db = await getDb();
    const course = await db.collection("courses").findOne({ _id: courseId, studentId: user.id, status: "active" });
    if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
    const form = await request.formData();
    const documentType = String(form.get("documentType") ?? "");
    const title = String(form.get("title") ?? "").trim().slice(0, 160);
    const description = String(form.get("description") ?? "").trim().slice(0, 1000);
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (!allowedTypes.has(documentType) || title.length < 2 || files.length < 1 || files.length > maxFiles) return Response.json({ error: "Choose a category, title, and a valid number of files." }, { status: 400 });
    let projectedPages = 0;
    const prepared: Array<{ file: File; bytes: Buffer; mime: string; resourceType: "image" | "raw"; pageCount: number }> = [];
    for (const file of files) {
      if (file.size > maxBytes) return Response.json({ error: `${safeName(file.name)} exceeds the configured file-size limit.` }, { status: 413 });
      const bytes = Buffer.from(await file.arrayBuffer());
      const detected = await fileTypeFromBuffer(bytes);
      if (!detected || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(detected.mime)) return Response.json({ error: `${safeName(file.name)} is not a supported JPG, PNG, WEBP, or PDF file.` }, { status: 415 });
      const resourceType = detected.mime === "application/pdf" ? "raw" : "image";
      let pageCount = 1;
      if (resourceType === "raw") {
        try { pageCount = (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount(); }
        catch { return Response.json({ error: `${safeName(file.name)} is not a readable PDF.` }, { status: 415 }); }
        if (pageCount < 1 || pageCount > maxPages) return Response.json({ error: `PDF page count must be between 1 and ${maxPages}.` }, { status: 413 });
      }
      projectedPages += pageCount;
      prepared.push({ file, bytes, mime: detected.mime, resourceType, pageCount });
    }
    if (projectedPages > maxPages) return Response.json({ error: `Document page count exceeds the configured limit of ${maxPages}.` }, { status: 413 });

    documentId = new ObjectId();
    const folder = `cognify/students/${user.id}/courses/${courseId}/${documentType}`;
    const originals = [];
    for (let index = 0; index < prepared.length; index++) {
      const item = prepared[index]; const publicId = randomUUID();
      const asset = await uploadPrivateBuffer(item.bytes, { folder, publicId, resourceType: item.resourceType });
      uploaded.push({ publicId: asset.public_id, resourceType: item.resourceType });
      originals.push({
        _id: asset.asset_id,
        cloudinary: { provider: "cloudinary", publicId: asset.public_id, assetId: asset.asset_id, secureUrl: asset.secure_url, resourceType: item.resourceType, format: asset.format, bytes: asset.bytes, folder: asset.folder ?? folder },
        originalFilename: safeName(item.file.name), mimeType: item.mime, fileSize: asset.bytes, sequenceNumber: index + 1, pageCount: item.pageCount, uploadedAt: new Date(),
      });
    }
    const pageCount = prepared.reduce((total, item) => total + item.pageCount, 0); const now = new Date();
    const documentRecord = { _id: documentId, studentId: user.id, courseId, documentType, title, description, originalFiles: originals, pageCount, ocrStatus: "pending", ocrEngine: "PaddleOCR", processingStartedAt: null, processingCompletedAt: null, errorMessage: null, createdAt: now, updatedAt: now };
    const jobId = new ObjectId();
    await ensureIndexes();
    await db.collection("documents").insertOne({ ...documentRecord, processingJobId: jobId });
    await db.collection("processingJobs").insertOne({ _id: jobId, documentId, studentId: user.id, courseId, jobType: "ocr", status: "queued", currentPage: 0, totalPages: pageCount, progressPercentage: 0, attempts: 0, failedPages: [], errorMessage: null, startedAt: null, completedAt: null, leaseUntil: new Date(0), createdAt: now, updatedAt: now });
    return Response.json({ documentId: String(documentId), jobId: String(jobId), status: "queued" }, { status: 202 });
  } catch (error) {
    if (documentId) {
      const db = await getDb().catch(() => null);
      if (db) await Promise.allSettled([db.collection("documents").deleteOne({ _id: documentId }), db.collection("processingJobs").deleteOne({ documentId })]);
    }
    await Promise.allSettled(uploaded.map(asset => destroyPrivateAsset(asset.publicId, asset.resourceType)));
    console.error("Document upload failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not upload the document. Check Cloudinary configuration and try again." }, { status: 503 });
  }
}
