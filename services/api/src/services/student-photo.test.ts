import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeStudentPhoto } from './student-photo';

async function run() {
  const source = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#245ca6' } }).png().toBuffer();
  const result = await normalizeStudentPhoto(`data:image/png;base64,${source.toString('base64')}`);
  assert.equal(result.contentType, 'image/webp');
  assert.equal(result.width, 600);
  assert.equal(result.height, 750);
  assert.equal((await sharp(result.bytes).metadata()).format, 'webp');

  await assert.rejects(() => normalizeStudentPhoto('data:image/svg+xml;base64,PHN2Zy8+'), /PNG, JPEG, or WebP/);
  await assert.rejects(() => normalizeStudentPhoto('data:image/png;base64,bm90LWFuLWltYWdl'), /Input buffer/);
  console.log('PASS student photos validate supported input and normalize to a bounded WebP portrait');
}

void run();
