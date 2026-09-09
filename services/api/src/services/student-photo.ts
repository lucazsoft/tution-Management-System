import sharp from 'sharp';

const studentPhotoPattern = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

export async function normalizeStudentPhoto(value: unknown) {
  const raw = typeof value === 'string' ? value : '';
  const match = studentPhotoPattern.exec(raw);
  if (!match || raw.length > 7_000_000) throw new Error('Upload a PNG, JPEG, or WebP student photo under 5 MB.');
  const source = Buffer.from(match[1], 'base64');
  if (source.length > 5_000_000) throw new Error('Upload a PNG, JPEG, or WebP student photo under 5 MB.');
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 25_000_000) throw new Error('Student photo dimensions are invalid or too large.');
  const normalized = await sharp(source)
    .rotate()
    .resize(600, 750, { fit: 'cover', position: 'attention', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: normalized.data, width: normalized.info.width, height: normalized.info.height, contentType: 'image/webp' as const };
}
