import { NextRequest } from "next/server";
import { ensureIndexes, getDb } from "@/lib/server/db";
import { currentUser } from "@/lib/server/auth";
export const runtime = "nodejs";
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
function expose(course: Record<string, unknown>) { return { ...course, id: String(course._id), studentId: undefined, _id: undefined }; }

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    await ensureIndexes();
    const courses = await (await getDb()).collection("courses").find({ studentId: user.id, status: "active" }).sort({ updatedAt: -1 }).toArray();
    return Response.json({ courses: courses.map(expose) });
  } catch (error) {
    console.error("Course list failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not load courses" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request body" }, { status: 400 });
    const title = clean(body.title, 120);
    const subject = clean(body.subject, 80);
    const description = clean(body.description, 500);
    const year = Number(body.examinationYear);
    if (title.length < 2 || subject.length < 2 || !Number.isInteger(year) || year < 2020 || year > 2100) return Response.json({ error: "Provide a title, subject, and valid examination year." }, { status: 400 });
    await ensureIndexes();
    const now = new Date();
    const course = { studentId: user.id, title, subject, examinationBody: "WAEC", examinationYear: year, description, status: "active", createdAt: now, updatedAt: now };
    const result = await (await getDb()).collection("courses").insertOne(course);
    return Response.json({ course: { ...course, id: String(result.insertedId) } }, { status: 201 });
  } catch (error) {
    console.error("Course creation failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not create course" }, { status: 503 });
  }
}
