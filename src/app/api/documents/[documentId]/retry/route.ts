import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { getDb, ensureIndexes } from "@/lib/server/db";
export const runtime = "nodejs";

export async function POST(_request: NextRequest, context: { params: Promise<{ documentId: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const documentId = parseObjectId((await context.params).documentId);
    if (!documentId) return Response.json({ error: "Document not found" }, { status: 404 });
    await ensureIndexes();
    const db = await getDb();
    const document = await db.collection("documents").findOne({ _id: documentId, studentId: user.id });
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    const job = await db.collection("processingJobs").findOne({ _id: document.processingJobId, studentId: user.id });
    if (!job || !["failed", "partially_completed"].includes(job.status)) return Response.json({ error: "There are no failed pages to retry." }, { status: 409 });
    const now = new Date();
    await db.collection("processingJobs").updateOne({ _id: job._id, studentId: user.id }, { $set: { status: "queued", errorMessage: null, completedAt: null, leaseUntil: new Date(0), attempts: 0, updatedAt: now } });
    await db.collection("documents").updateOne({ _id: documentId, studentId: user.id }, { $set: { ocrStatus: "pending", errorMessage: null, updatedAt: now } });
    return Response.json({ jobId: String(job._id), status: "queued" }, { status: 202 });
  } catch { return Response.json({ error: "Could not queue retry" }, { status: 503 }); }
}
