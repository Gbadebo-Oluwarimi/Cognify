import { GridFSBucket } from "mongodb";
import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };

async function readJson(bucket: GridFSBucket, fileId: unknown) {
  if (!fileId) return null;
  const chunks: Buffer[] = [];
  const stream = bucket.openDownloadStream(fileId as never);
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const sessionId = parseObjectId((await context.params).sessionId);
    if (!sessionId) return Response.json({ error: "Upload session not found" }, { status: 404 });
    const db = await getDb();
    const session = await db.collection("uploadSessions").findOne({ _id: sessionId, studentId: user.id });
    if (!session) return Response.json({ error: "Upload session not found" }, { status: 404 });
    const [topic, course, documents, results] = await Promise.all([
      db.collection("topics").findOne({ _id: session.topicId, studentId: user.id, courseId: session.courseId }),
      db.collection("courses").findOne({ _id: session.courseId, studentId: user.id }),
      db.collection("uploadedDocuments").find({ uploadSessionId: sessionId, studentId: user.id }).sort({ fileIndex: 1 }).toArray(),
      db.collection("ocrDocumentResults").find({ sessionId, studentId: user.id }).toArray(),
    ]);
    const largeResults = new GridFSBucket(db, { bucketName: "ocrRawResponses" });
    const resultByDocument = new Map(results.map(result => [String(result.uploadedDocumentId), result]));
    const documentsView = await Promise.all(documents.map(async document => {
      const result = resultByDocument.get(String(document._id));
      let rawResponse: unknown = undefined;
      let pages: any[] = [];
      if (result) {
        if (process.env.NODE_ENV !== "production") {
          rawResponse = result.rawResponse ?? (await readJson(largeResults, result.rawResponseStorage?.fileId));
        }
        const pageRows = await db.collection("ocrPages").find({ uploadedDocumentId: document._id }).sort({ pageNumber: 1 }).toArray();
        if (pageRows.length) pages = await Promise.all(pageRows.map(async page => ({ pageNumber: page.pageNumber, ...(page.pageData ? { ...page.pageData } : { pageData: await readJson(largeResults, page.rawPageFileId) }) })));
        else if (rawResponse && Array.isArray((rawResponse as any).pages)) pages = (rawResponse as any).pages;
      }
      return {
        id: String(document._id), filename: document.originalFileName, mimeType: document.mimeType, fileSize: document.fileSize,
        fileIndex: document.fileIndex, status: document.status, errorMessage: document.errorMessage ?? null,
        result: result ? {
          status: result.status, extractedText: result.extractedText ?? null, markdown: result.markdown ?? null,
          extractedData: result.extractedData ?? null,
          pageCount: result.pageCount ?? document.pageCount ?? pages.length, pages,
          ...(rawResponse !== undefined ? { rawResponse } : {}),
        } : null,
      };
    }));
    return Response.json({
      session: { id: String(session._id), title: session.title, category: session.category, status: session.status, progress: session.progress ?? 0, createdAt: session.createdAt, completedAt: session.completedAt ?? null, errorMessage: session.errorMessage ?? null, openParserJobId: session.openParserJobId ?? null },
      course: { id: String(session.courseId), name: course?.title ?? course?.name ?? "Course" },
      topic: { id: String(session.topicId), name: topic?.name ?? "Topic" },
      documents: documentsView,
    });
  } catch (error) {
    console.error("OCR result retrieval failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not load OCR results" }, { status: 503 });
  }
}
