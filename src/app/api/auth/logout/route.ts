import { destroySession } from "@/lib/server/auth";
export const runtime = "nodejs";
export async function POST() {
  try { await destroySession(); return Response.json({ ok: true }); }
  catch { return Response.json({ error: "Could not sign out" }, { status: 500 }); }
}
