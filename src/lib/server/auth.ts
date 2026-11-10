import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import type { NextRequest } from "next/server";
import { ensureIndexes, getDb } from "@/lib/server/db";

export const SESSION_COOKIE = "cognify_session";
const SESSION_DAYS = 7;
export function validateAuthSecret() {
  const key = process.env.AUTH_SECRET;
  if (!key || key.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
}
function digest(token: string) {
  validateAuthSecret();
  const key = process.env.AUTH_SECRET!;
  return createHmac("sha256", key).update(token).digest("hex");
}

export async function createSession(userId: ObjectId) {
  await ensureIndexes();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await (await getDb()).collection("sessions").insertOne({ tokenHash: digest(token), userId, expiresAt, createdAt: new Date() });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await getDb()).collection("sessions").deleteOne({ tokenHash: digest(token) });
  jar.delete(SESSION_COOKIE);
}

export type SafeUser = { id: string; fullName: string; email: string; role: "student" };
export async function currentUser(): Promise<SafeUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureIndexes();
  const db = await getDb();
  const session = await db.collection("sessions").findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await db.collection("users").findOne({ _id: session.userId, accountStatus: "active" });
  if (!user) return null;
  return { id: String(user._id), fullName: user.fullName, email: user.email, role: "student" };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) return { user: null, response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  return { user, response: null };
}
export function parseObjectId(value: string) { return ObjectId.isValid(value) ? new ObjectId(value) : null; }

export async function authRateLimited(request: NextRequest, identity: string, limit: number) {
  await ensureIndexes();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("x-real-ip") || forwarded || "unknown";
  const windowMs = 15 * 60_000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const bucketKey = digest(`${ip}:${identity}:${windowStart}`);
  const expiresAt = new Date(windowStart + windowMs);
  const result = await (await getDb()).collection("authRateLimits").findOneAndUpdate(
    { bucketKey },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt, createdAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  );
  return (result?.count ?? 0) > limit;
}

export function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(process.env.AUTH_URL || request.nextUrl.origin).origin; }
  catch { return false; }
}
