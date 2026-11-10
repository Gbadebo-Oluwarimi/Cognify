import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ documentId: string; pageId: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const { documentId: rawDocumentId, pageId: rawPageId } = await context.params;
    const documentId = parseObjectId(rawDocumentId); const pageId = parseObjectId(rawPageId);
    if (!documentId || !pageId) return Response.json({ error: "OCR page not found" }, { status: 404 });
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
    if (typeof body.correctedText !== "string" || body.correctedText.length > 100_000) return Response.json({ error: "Correction must be text under 100,000 characters." }, { status: 400 });
    const db = await getDb();
    const document = await db.collection("documents").findOne({ _id: documentId, studentId: user.id });
    if (!document) return Response.json({ error: "OCR page not found" }, { status: 404 });
    const page = await db.collection("ocrPages").findOneAndUpdate({ _id: pageId, documentId, studentId: user.id }, { $set: { correctedText: body.correctedText, correctedAt: new Date(), updatedAt: new Date() } }, { returnDocument: "after" });
    if (!page) return Response.json({ error: "OCR page not found" }, { status: 404 });
    return Response.json({ pageId: String(page._id), correctedText: page.correctedText, originalText: page.extractedText });
  } catch { return Response.json({ error: "Could not save OCR correction" }, { status: 503 }); }
}
