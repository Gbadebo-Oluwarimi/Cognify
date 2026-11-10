import { NextRequest } from "next/server";
import { getDb, ensureIndexes } from "@/lib/server/db";
import { currentUser, parseObjectId } from "@/lib/server/auth";
export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
function expose(course: Record<string, unknown>) { const { _id, studentId, ...rest } = course; return { ...rest, id: String(_id) }; }

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const id = parseObjectId((await context.params).courseId);
    if (!id) return Response.json({ error: "Course not found" }, { status: 404 });
    const course = await (await getDb()).collection("courses").findOne({ _id: id, studentId: user.id });
    if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
    return Response.json({ course: expose(course) });
  } catch { return Response.json({ error: "Could not load course" }, { status: 503 }); }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const id = parseObjectId((await context.params).courseId);
    if (!id) return Response.json({ error: "Course not found" }, { status: 404 });
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request body" }, { status: 400 });
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) { const v = clean(body.title, 120); if (v.length < 2) return Response.json({ error: "Invalid title" }, { status: 400 }); $set.title = v; }
    if (body.subject !== undefined) { const v = clean(body.subject, 80); if (v.length < 2) return Response.json({ error: "Invalid subject" }, { status: 400 }); $set.subject = v; }
    if (body.description !== undefined) $set.description = clean(body.description, 500);
    if (body.examinationYear !== undefined) { const v = Number(body.examinationYear); if (!Number.isInteger(v) || v < 2020 || v > 2100) return Response.json({ error: "Invalid examination year" }, { status: 400 }); $set.examinationYear = v; }
    if (body.status !== undefined) { if (typeof body.status !== "string" || !["active", "archived"].includes(body.status)) return Response.json({ error: "Invalid status" }, { status: 400 }); $set.status = body.status; }
    const course = await (await getDb()).collection("courses").findOneAndUpdate({ _id: id, studentId: user.id }, { $set }, { returnDocument: "after" });
    if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
    return Response.json({ course: expose(course) });
  } catch { return Response.json({ error: "Could not update course" }, { status: 503 }); }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const id = parseObjectId((await context.params).courseId);
    if (!id) return Response.json({ error: "Course not found" }, { status: 404 });
    await ensureIndexes();
    const result = await (await getDb()).collection("courses").updateOne({ _id: id, studentId: user.id }, { $set: { status: "archived", updatedAt: new Date() } });
    if (!result.matchedCount) return Response.json({ error: "Course not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "Could not archive course" }, { status: 503 }); }
}
