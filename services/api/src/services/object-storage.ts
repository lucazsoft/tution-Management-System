import crypto from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const prefix = 'r2:';

function configuration() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function client(config: NonNullable<ReturnType<typeof configuration>>) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export type ObjectStorageOperations = {
  put: (input: { bucket: string; key: string; bytes: Buffer; contentType: string; tenantId: string; branchId: string }) => Promise<void>;
  signedGet: (input: { bucket: string; key: string }) => Promise<string>;
};

const defaultOperations: ObjectStorageOperations = {
  async put(input) {
    const config = configuration()!;
    await client(config).send(new PutObjectCommand({ Bucket: input.bucket, Key: input.key, Body: input.bytes, ContentType: input.contentType, CacheControl: 'private, max-age=300', Metadata: { tenant: input.tenantId, branch: input.branchId } }));
  },
  async signedGet(input) {
    const config = configuration()!;
    return getSignedUrl(client(config), new GetObjectCommand({ Bucket: input.bucket, Key: input.key }), { expiresIn: 300 });
  },
};

function parseDataImage(value: string): { contentType: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: Buffer } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error('A valid PNG, JPEG, or WebP image is required.');
  return { contentType: match[1] as 'image/png' | 'image/jpeg' | 'image/webp', bytes: Buffer.from(match[2], 'base64') };
}

export function objectStorageEnabled() {
  return configuration() !== null;
}

type PrivateImageScope = { tenantId: string; branchId: string; category: 'payment-proofs' | 'student-photos'; id: string };

export async function storePrivateBytes(image: { bytes: Buffer; contentType: 'image/png' | 'image/jpeg' | 'image/webp' }, scope: PrivateImageScope, operations: ObjectStorageOperations = defaultOperations) {
  const config = configuration();
  if (!config) throw new Error('Private object storage is not configured.');
  const extension = image.contentType === 'image/jpeg' ? 'jpg' : image.contentType.slice('image/'.length);
  const key = `tenants/${scope.tenantId}/branches/${scope.branchId}/${scope.category}/${scope.id}-${crypto.randomUUID()}.${extension}`;
  await operations.put({ bucket: config.bucket, key, bytes: image.bytes, contentType: image.contentType, tenantId: scope.tenantId, branchId: scope.branchId });
  return `${prefix}${key}`;
}

export async function storePrivateImage(value: string, scope: PrivateImageScope, operations: ObjectStorageOperations = defaultOperations) {
  const config = configuration();
  if (!config) return value;
  return storePrivateBytes(parseDataImage(value), scope, operations);
}

export async function privateImageUrl(value: string | null, operations: ObjectStorageOperations = defaultOperations) {
  if (!value?.startsWith(prefix)) return value;
  const config = configuration();
  if (!config) throw new Error('Object storage is not configured for this image.');
  return operations.signedGet({ bucket: config.bucket, key: value.slice(prefix.length) });
}
