import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ documentId: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const documentId = parseObjectId((await context.params).documentId);
    if (!documentId) return Response.json({ error: "Document not found" }, { status: 404 });
    const db = await getDb();
    const document = await db.collection("documents").findOne({ _id: documentId, studentId: user.id });
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    const pages = await db.collection("ocrPages").find({ documentId, studentId: user.id }).sort({ sequenceNumber: 1, pageNumber: 1 }).toArray();
    const questions = document.documentType === "past_question" ? await db.collection("pastQuestions").find({ documentId, studentId: user.id }).sort({ sourcePageNumbers: 1, questionNumber: 1 }).toArray() : [];
    return Response.json({
      document: { id: String(document._id), courseId: String(document.courseId), title: document.title, documentType: document.documentType, pageCount: document.pageCount, ocrStatus: document.ocrStatus, errorMessage: document.errorMessage },
      pages: pages.map(page => { const source = document.originalFiles.find((file: { _id: string }) => file._id === page.sourceFileId); return { id: String(page._id), sourceFileId: page.sourceFileId, sourceMimeType: source?.mimeType, sourceFilename: source?.originalFilename, pageNumber: page.pageNumber, sequenceNumber: page.sequenceNumber, extractedText: page.extractedText, correctedText: page.correctedText ?? null, lines: page.lines, confidenceScore: page.confidenceScore, extractionWarnings: page.extractionWarnings, status: page.status, errorMessage: page.errorMessage }; }),
      questions: questions.map(question => ({ id: String(question._id), questionNumber: question.questionNumber, questionText: question.questionText, questionOptions: question.questionOptions, sourcePageNumbers: question.sourcePageNumbers, extractionStatus: question.extractionStatus })),
    });
  } catch { return Response.json({ error: "Could not load document pages" }, { status: 503 }); }
}
