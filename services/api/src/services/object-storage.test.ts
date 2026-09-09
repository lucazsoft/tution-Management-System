import assert from 'node:assert/strict';
import { objectStorageEnabled, privateImageUrl, storePrivateImage, type ObjectStorageOperations } from './object-storage';

async function run() {
  const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];

  const image = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(objectStorageEnabled(), false);
  assert.equal(await storePrivateImage(image, { tenantId: 'tenant-test', branchId: 'branch-test', category: 'payment-proofs', id: 'attempt-test' }), image);
  assert.equal(await privateImageUrl(image), image);
  assert.equal(await privateImageUrl(null), null);

  process.env.R2_ACCOUNT_ID = 'account-test';
  process.env.R2_ACCESS_KEY_ID = 'access-test';
  process.env.R2_SECRET_ACCESS_KEY = 'secret-test';
  process.env.R2_BUCKET = 'bucket-test';
  const uploads: Parameters<ObjectStorageOperations['put']>[0][] = [];
  const operations: ObjectStorageOperations = {
    async put(input) { uploads.push(input); },
    async signedGet(input) { return `https://signed.example/${input.bucket}/${input.key}`; },
  };
  const reference = await storePrivateImage(image, { tenantId: 'tenant-test', branchId: 'branch-test', category: 'payment-proofs', id: 'attempt-test' }, operations);
  const uploaded = uploads[0];
  assert.ok(uploaded);
  assert.match(reference, /^r2:tenants\/tenant-test\/branches\/branch-test\/payment-proofs\/attempt-test-[0-9a-f-]+\.png$/);
  assert.equal(uploaded?.bucket, 'bucket-test');
  assert.equal(uploaded?.contentType, 'image/png');
  assert.equal(uploaded?.tenantId, 'tenant-test');
  assert.equal(uploaded?.branchId, 'branch-test');
  assert.equal(uploaded?.bytes.toString('base64'), 'iVBORw0KGgo=');
  assert.equal(await privateImageUrl(reference, operations), `https://signed.example/bucket-test/${reference.slice(3)}`);

  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
  console.log('PASS private object storage compatibility fallback');
}

void run();
