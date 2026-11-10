import { NextRequest } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { ensureIndexes, getDb } from "@/lib/server/db";
export const runtime = "nodejs";

function safeData(value: unknown, depth = 0): unknown {
  if (depth > 12) throw new Error("Workspace nesting is too deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Invalid number"); return value; }
  if (Array.isArray(value)) { if (value.length > 500) throw new Error("Workspace list is too large"); return value.map(v => safeData(v, depth + 1)); }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (key.startsWith("$") || key.includes(".")) continue; out[key] = safeData(child, depth + 1); }
    return out;
  }
  throw new Error("Unsupported workspace value");
}

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    await ensureIndexes();
    const rows = await (await getDb()).collection("studyWorkspaces").find({ studentId: user.id }).sort({ updatedAt: -1 }).toArray();
    return Response.json({ workspaces: rows.map(row => ({ ...(row.data as object), id: row.legacyId, studentId: user.id })) });
  } catch { return Response.json({ error: "Could not load workspaces" }, { status: 503 }); }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const raw = await request.text();
    if (raw.length > 2_000_000) return Response.json({ error: "Workspace payload is too large" }, { status: 413 });
    const body = JSON.parse(raw);
    if (!Array.isArray(body.workspaces) || body.workspaces.length > 50) return Response.json({ error: "Invalid workspace list" }, { status: 400 });
    await ensureIndexes();
    const db = await getDb(); const now = new Date();
    for (const item of body.workspaces) {
      if (!item || typeof item.id !== "string" || item.id.length > 120 || typeof item.subject !== "string" || item.subject.trim().length < 2 || item.subject.length > 80) continue;
      const legacyId = item.id;
      const course = await db.collection("courses").findOneAndUpdate(
        { studentId: user.id, migratedWorkspaceId: legacyId },
        { $setOnInsert: { studentId: user.id, migratedWorkspaceId: legacyId, title: `${item.subject.trim()} – WAEC`, subject: item.subject.trim(), examinationBody: "WAEC", examinationYear: null, description: "Migrated from your earlier study workspace.", status: "active", createdAt: now }, $set: { updatedAt: now } },
        { upsert: true, returnDocument: "after" },
      );
      if (!course) continue;
      const copied = safeData(item) as Record<string, unknown>; delete copied.studentId;
      await db.collection("studyWorkspaces").updateOne({ studentId: user.id, legacyId }, { $set: { studentId: user.id, courseId: course._id, data: copied, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
    }
    const rows = await db.collection("studyWorkspaces").find({ studentId: user.id }).sort({ updatedAt: -1 }).toArray();
    return Response.json({ workspaces: rows.map(row => ({ ...(row.data as object), id: row.legacyId, studentId: user.id })) });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error("Workspace persistence failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not save workspaces" }, { status: 503 });
  }
}
