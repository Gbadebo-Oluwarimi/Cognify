import { NextRequest } from "next/server";
import { currentUser, parseObjectId } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { privateAssetUrl } from "@/lib/server/cloudinary";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ documentId: string; sourceFileId: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const { documentId: rawId, sourceFileId } = await context.params;
    const documentId = parseObjectId(rawId);
    if (!documentId || sourceFileId.length > 200) return Response.json({ error: "Asset not found" }, { status: 404 });
    const document = await (await getDb()).collection("documents").findOne({ _id: documentId, studentId: user.id });
    if (!document) return Response.json({ error: "Asset not found" }, { status: 404 });
    const source = document.originalFiles.find((file: { _id: string }) => file._id === sourceFileId);
    if (!source) return Response.json({ error: "Asset not found" }, { status: 404 });
    const cloud = source.cloudinary;
    const url = privateAssetUrl(cloud.publicId, cloud.format, cloud.resourceType);
    return Response.redirect(url, 302);
  } catch { return Response.json({ error: "Could not retrieve asset" }, { status: 503 }); }
}
