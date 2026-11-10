import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export function uploadPrivateBuffer(buffer: Buffer, options: { folder: string; publicId: string; resourceType: "image" | "raw" }) {
  return new Promise<{
    asset_id: string; public_id: string; secure_url: string; resource_type: string;
    format: string; bytes: number; folder?: string;
  }>((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      folder: options.folder,
      public_id: options.publicId,
      resource_type: options.resourceType,
      type: "authenticated",
      access_mode: "authenticated",
      overwrite: false,
      use_filename: false,
      unique_filename: false,
    }, (error, result) => {
      if (error || !result) return reject(error ?? new Error("Cloudinary returned no asset"));
      resolve(result as unknown as {
        asset_id: string; public_id: string; secure_url: string; resource_type: string;
        format: string; bytes: number; folder?: string;
      });
    }).end(buffer);
  });
}

export async function destroyPrivateAsset(publicId: string, resourceType: "image" | "raw") {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: "authenticated", invalidate: true });
}

export function privateAssetUrl(publicId: string, format: string, resourceType: "image" | "raw") {
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 15 * 60,
  });
}
