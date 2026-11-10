import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { ensureIndexes, getDb } from "@/lib/server/db";
import { authRateLimited, createSession, originAllowed, validateAuthSecret } from "@/lib/server/auth";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
    validateAuthSecret();
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request body" }, { status: 400 });
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (fullName.length < 2 || fullName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 128) {
      return Response.json({ error: "Enter a valid name and email; password must be 10–128 characters." }, { status: 400 });
    }
    if (await authRateLimited(request, "register", 8)) return Response.json({ error: "Too many registration attempts. Try again in 15 minutes." }, { status: 429 });
    await ensureIndexes();
    const now = new Date();
    const result = await (await getDb()).collection("users").insertOne({ fullName, email, passwordHash: await bcrypt.hash(password, 12), role: "student", accountStatus: "active", createdAt: now, updatedAt: now });
    await createSession(result.insertedId);
    return Response.json({ user: { id: String(result.insertedId), fullName, email, role: "student" } }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return Response.json({ error: "An account with that email already exists." }, { status: 409 });
    console.error("Registration failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not create account. Check server configuration and try again." }, { status: 500 });
  }
}
