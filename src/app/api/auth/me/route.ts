import { currentUser } from "@/lib/server/auth";
export const runtime = "nodejs";
export async function GET() {
  try { const user = await currentUser(); return Response.json({ user }, { status: user ? 200 : 401 }); }
  catch { return Response.json({ error: "Authentication service unavailable" }, { status: 503 }); }
}
