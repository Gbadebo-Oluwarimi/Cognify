import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { ensureIndexes, getDb } from "@/lib/server/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

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
    const topics = await db.collection("topics").find({ studentId: user.id, courseId }).sort({ name: 1 }).toArray();
    return Response.json({ topics: topics.map(({ _id, studentId, courseId: _courseId, ...topic }) => ({ ...topic, id: String(_id) })) });
  } catch (error) {
    console.error("Topic list failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not load topics" }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const courseId = parseObjectId((await context.params).courseId);
    if (!courseId) return Response.json({ error: "Course not found" }, { status: 404 });
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
    const name = clean((body as { name?: unknown } | null)?.name, 120);
    if (name.length < 2) return Response.json({ error: "Topic name must contain at least 2 characters." }, { status: 400 });
    const db = await getDb();
    const course = await db.collection("courses").findOne({ _id: courseId, studentId: user.id, status: "active" });
    if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
    await ensureIndexes();
    const now = new Date();
    const topic = { _id: new ObjectId(), studentId: user.id, courseId, name, description: "", createdAt: now, updatedAt: now };
    try { await db.collection("topics").insertOne(topic); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) return Response.json({ error: "A topic with this name already exists in the course." }, { status: 409 });
      throw error;
    }
    return Response.json({ topic: { id: String(topic._id), name, description: topic.description, createdAt: now } }, { status: 201 });
  } catch (error) {
    console.error("Topic creation failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not create topic" }, { status: 503 });
  }
}
