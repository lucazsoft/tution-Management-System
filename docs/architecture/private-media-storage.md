# Private media storage plan

## Decision

Use the private Cloudflare R2 bucket `tms-private-media` for user-uploaded files and durable generated documents. PostgreSQL stores ownership, authorization metadata, checksums, lifecycle state, and an opaque `r2:` object reference. API responses expose an authenticated download or a short-lived signed URL only after authorization.

Public bucket access remains disabled. Certificate verification may be public, but it returns verification metadata rather than a private student photo or unrestricted PDF URL.

## Current inventory

| Asset | Current state | Target |
| --- | --- | --- |
| Parent payment proof | New uploads use R2 when configured; legacy data URIs remain readable | Keep private in R2 and expose five-minute signed reads to authorized finance staff |
| Branch QR image | Data URI in `BranchPaymentSettings.staticQrImageUrl` | Move with persisted tenant-default QR settings and preserve SMS challenge binding |
| Tenant-default QR | Deployment environment variables | Persist one tenant-level record, editable only by Tenant Admin with SMS verification |
| Student photo | Private R2 upload and normalized WebP portrait are implemented; Digital ID falls back to initials | Add parent-facing reads only when the parent portal needs the photo |
| Digital ID card | Rendered from live student data; onboarding exposes a placeholder storage URL | Continue rendering on demand; do not store a screenshot of the whole card |
| Certificate template | New templates use validated structured design metadata; legacy HTML or file records remain readable | Version structured designs; store a future optional background binary in R2 rather than JSON |
| Issued certificate | Immutable issuance snapshot, revocation state, authenticated PDF generation, and public metadata verification are implemented | Optionally cache the generated PDF in R2 by certificate and template version |
| Staff document and petty-cash receipt | External URL fields | Migrate later after payment and student identity flows are stable |

## Object keys

The API generates every key. Keys never contain a person's name, email, phone number, admission number, or payment reference.

```text
tenants/{tenantId}/branches/{branchId}/payment-proofs/{attemptId}-{uuid}.{ext}
tenants/{tenantId}/branches/{branchId}/student-photos/{studentId}-{uuid}.{ext}
tenants/{tenantId}/certificate-templates/{templateId}/{versionId}.{ext}
tenants/{tenantId}/branches/{branchId}/certificates/{certificateId}/{version}.pdf
tenants/{tenantId}/payment-settings/tenant-qr/{versionId}.{ext}
tenants/{tenantId}/branches/{branchId}/payment-settings/branch-qr/{versionId}.{ext}
```

## Shared database record

Add a `MediaObject` model instead of adding raw URLs to each feature:

```text
id, tenantId, branchId?, category, ownerType, ownerId,
objectKey, mimeType, byteSize, sha256, width?, height?,
status, createdBy, createdAt, replacedAt?, deletedAt?
```

During migration, feature records keep an opaque `r2:` reference while `MediaObject` records provide ownership and lifecycle metadata. Object keys remain server-only. Signed URLs are temporary response values and are never stored.

## Access rules

| Asset | Write | Read |
| --- | --- | --- |
| Payment proof | Student or linked parent submitting that invoice | Tenant Admin and finance staff scoped to the invoice branch |
| Student photo | Tenant Admin or Branch Admin assigned to an active student enrollment | Student, linked parent, assigned branch staff, Tenant Admin |
| Tenant QR | Tenant Admin after SMS verification | Authorized checkout users for an invoice in the tenant |
| Branch QR | Tenant Admin after SMS verification | Authorized checkout users for that branch; Branch Admin read-only |
| Certificate template | Tenant Admin | Tenant Admin and certificate issuers with branch access |
| Issued certificate PDF | Authorized issuer | Student, linked parent, branch-scoped staff, Tenant Admin |
| Certificate verification metadata | Issuance workflow | Public by unpredictable verification ID; exclude sensitive fields |

Cross-tenant lookups return 404. Access is derived from the authenticated database record; clients cannot request an arbitrary R2 key.

## Upload controls

- Validate MIME type, magic bytes, decoded size, and image dimensions on the API.
- Re-encode student photos and image proofs to remove metadata and constrain dimensions.
- Allow PNG, JPEG, and WebP for images; allow PDF only for approved document categories.
- Use UUID-backed keys and record SHA-256 checksums.
- Reject SVG and active document formats for identity photos, proofs, QR images, and certificate backgrounds.
- Limit student-photo originals to 5 MB and normalized output to a documented pixel size; retain the current 1 MB limit for proofs and QR images.
- Add upload rate limits and audit events for create, replace, read, approve, reject, and delete.

## Product behavior

### Payment proof

Call the parent-uploaded image **payment proof**. Approval marks the invoice paid and makes the official invoice receipt available. The uploaded image itself is not the official receipt.

### Student photo and Digital ID

Branch Admin uploads or replaces a student's photo from the student record. The student cannot replace institutional identity media. Digital ID reads the current authorized photo and falls back to initials when absent. The card remains live, so status, branch, enrollment, and validity updates do not require regenerating an image.

### Certificates

Issuance stores an immutable snapshot of student name, branch, grade or course, template version, issuer, and issue date. Downloads render from that snapshot. Replacing a template never changes an issued certificate. Public verification confirms the snapshot and revocation state without returning private media.

## Rollout order

1. **Payment proofs:** deploy the completed R2 adapter; verify a staging submission, approval, signed view, and legacy data-URI view.
2. **MediaObject foundation:** deploy the schema and shared private object adapter; add scheduled cleanup after retention requirements are approved.
3. **Student photos:** deploy the completed admin upload/replace flow, authorized portal reads, and Digital ID rendering.
4. **Tenant and branch QR:** persist tenant defaults, migrate QR binaries, and bind SMS challenges to checksum plus media ID.
5. **Certificate templates:** structured versioned designs are implemented for new templates; migrate or archive remaining legacy file and HTML templates.
6. **Issued certificates:** immutable snapshots, revocation, generated PDFs, and public metadata verification are implemented; optionally cache generated PDFs in R2.
7. **Remaining documents:** migrate staff documents and petty-cash receipts from arbitrary external links.

Every phase keeps existing records readable until a measured backfill finishes. Delete legacy blobs only after reference counts, checksums, authorized reads, backups, and restore checks pass.

## Production verification

- Confirm all four `R2_*` variables exist and the token is limited to `tms-private-media` Object Read & Write.
- Submit a staging proof and verify its key contains the correct tenant and branch IDs.
- Confirm PostgreSQL stores an `r2:` reference for the new attempt.
- Confirm another tenant and an unrelated Branch Admin receive 404.
- Confirm the signed URL expires and the bucket cannot be read publicly.
- Approve the attempt and verify the official invoice receipt contains the payment date and reference.
- Verify an older database-backed proof still opens.
- Document R2 backup or versioning and test restore before removing legacy data.
