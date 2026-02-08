import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "panopticon-replays";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate presigned PUT URLs for uploading replay frames + manifest to R2.
 */
export async function generateUploadUrls(
  sessionId: string,
  agentId: string,
  frameCount: number
): Promise<{ frameUrls: string[]; manifestUrl: string }> {
  const prefix = `replays/${sessionId}/${agentId}`;
  const expiresIn = 3600; // 1 hour

  const frameUrls = await Promise.all(
    Array.from({ length: frameCount }, (_, i) => {
      const key = `${prefix}/frame-${String(i).padStart(4, "0")}.jpg`;
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        ContentType: "image/jpeg",
      });
      return getSignedUrl(s3, command, { expiresIn });
    })
  );

  const manifestCommand = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: `${prefix}/manifest.json`,
    ContentType: "application/json",
  });
  const manifestUrl = await getSignedUrl(s3, manifestCommand, { expiresIn });

  return { frameUrls, manifestUrl };
}

/**
 * Get the public read URL for a key in R2.
 */
export function getPublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}
