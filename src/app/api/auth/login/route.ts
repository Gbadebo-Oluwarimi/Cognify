import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/server/db";
import { authRateLimited, createSession, originAllowed } from "@/lib/server/auth";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request body" }, { status: 400 });
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (email.length > 254 || password.length > 128) return Response.json({ error: "Invalid email or password." }, { status: 401 });
    if (await authRateLimited(request, `login:${email}`, 10)) return Response.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
    const user = await (await getDb()).collection("users").findOne({ email, accountStatus: "active" });
    if (!user || !await bcrypt.compare(password, user.passwordHash)) return Response.json({ error: "Invalid email or password." }, { status: 401 });
    await createSession(user._id);
    return Response.json({ user: { id: String(user._id), fullName: user.fullName, email: user.email, role: "student" } });
  } catch (error) {
    console.error("Login failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Could not sign in. Check server configuration and try again." }, { status: 500 });
  }
}
