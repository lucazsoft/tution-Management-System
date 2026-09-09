# Branch payment settings

Management is web-first. Tenant admins manage settings at `/tenant/payment-settings`, including a branch audit table. Branch admins have a read-only view at `/branch/payment-settings`, limited to their assigned branches. Other roles have no access to these management views or APIs.

All API paths below are relative to `/api/finances` and require a session. The session determines the tenant; the client cannot select another tenant.

| Method | Path | Access |
| --- | --- | --- |
| GET | `/payment-settings?branchId=…` | Tenant admin or admin assigned to that branch |
| GET | `/payment-settings` | Tenant admin only |
| PUT | `/branches/:branchId/payment-settings` | Tenant admin, within their tenant |
| DELETE | `/branches/:branchId/payment-settings` | Tenant admin, within their tenant |
| GET | `/admin/branches/payment-settings` | Tenant admin only |
| GET | `/invoices/:invoiceId/payment-settings` | Existing invoice payment authorization (owner, linked parent, or authorized billing staff) |

Checkout uses the invoice endpoint. The server authorizes the invoice and derives its branch, so students and parents can receive payment instructions without access to the management API. Both the web checkout and mobile student invoice sheet use this endpoint.

An enabled branch QR overrides defaults. Saving `staticQrEnabled: false` retains a disabled configuration but uses tenant defaults for payment instructions. Deleting the configuration also restores defaults. The audit response retains `hasCustomSettings` to describe stored configuration; the UI source and filters describe which configuration is effective.

ConnectIPS always uses tenant settings. Currently, tenant defaults are loaded from environment variables; there is no separate persisted tenant-default settings layer. When neither static QR nor ConnectIPS is available, checkout directs the payer to contact an administrator.

The target product model is:

- **Tenant default QR:** one fallback QR configured by the tenant admin and inherited by branches without an override.
- **Branch QR override:** an optional QR for one branch. The invoice determines the branch; clients never choose it while submitting payment.
- **ConnectIPS:** one tenant-level merchant configuration shared by every branch. Each payment attempt still stores the invoice-derived `tenantId`, `branchId`, and `invoiceId`, so callbacks can automate settlement for the correct branch and invoice.

Persisted tenant-default editing is still a separate backend change. Until that exists, the default QR and ConnectIPS enablement come from deployment environment variables. The UI must not imply that an environment-backed default was saved by a tenant admin.

Enabling QR requires an uploaded PNG, JPEG, or WebP image (under 1 MB; file signature checked by the server), account name and bank name (1–100 characters each), and account number (5–20 characters). Account numbers stay strings to preserve leading zeros. Instructions are optional (up to 500 characters).

Reads retry transient network failures twice with exponential backoff. Writes are never automatically replayed. HTTP 400, 403, and 404 responses are shown without retrying automatically.

Verification:

- `npm.cmd run test:phase-four-branch-payment --workspace @tms/api` includes service tests and real route handlers with mocked persistence for role permissions, tenant isolation, validation, invoice selection, and fallback.
- `apps/web/tests/branch-payment-settings.js` covers management form and read-only behavior using mocked HTTP responses. Run with TestCafe and the web server on port 5189.
- Production builds: `npm.cmd run build --workspace web` and `npm.cmd run build --workspace @tms/api`.

Mobile admin management is intentionally absent. The existing mobile parent fee screen still uses demo data and has no live invoice IDs; migrating that screen is separate from this integration. Mobile student billing is controlled by its existing feature flag.

## Verified image updates

The tenant-admin page opens in a saved summary state. **Edit settings** reveals the form, and the file picker appears only when adding or replacing a QR image. Uploading and previewing an image never sends a code. **Continue to SMS verification** is enabled only after the configuration changes and requests one six-digit code for the exact pending update. Returning to the editor keeps the pending changes without sending another code. A successful confirmation returns to the saved summary. Turning off a branch override follows the restore-defaults confirmation flow. Branch admins remain read-only.

`POST /branches/:branchId/payment-settings/verification` accepts `{ action: "save" | "reset", config }` and returns a challenge ID, masked destination, and expiry. Submit `{ verification: { challengeId, code } }` alongside the PUT settings or in the DELETE body. Codes are bound to the tenant, admin, branch, action, and exact submitted settings. They expire after five minutes, allow five guesses, and can only be consumed once. Request issuance is limited to five per admin per fifteen-minute rate-limit window.

SMS delivery requires `SMS_PROVIDER=AAKASH`, `AAKASH_SMS_AUTH_TOKEN`, and a valid saved Nepali mobile number. Mock or disabled SMS cannot authorize changes. No real SMS was sent during automated tests.

The existing `staticQrImageUrl` field retains its name for compatibility but new writes contain the uploaded image as a data URI stored in the database; external image URLs are rejected on new saves. Existing URL configurations can still be read, but must be replaced with an upload before resaving. This needs no schema migration. Mobile renders uploaded images from bytes.

## Payment proof and official receipt

The image uploaded by a parent is **payment proof**. It remains attached to the manual QR payment attempt for administrative review. The tenant Payments page renders that data image in an authenticated in-app viewer and shows the attempt's branch. It does not navigate to the raw data URI.

After an administrator approves the proof, the transaction marks the invoice paid. The paid invoice, payment date, transaction reference, original line items, PAN snapshot, and VAT snapshot form the official receipt shown to the parent or student. Rejecting proof does not create a paid receipt.

Manual-payment proofs use private Cloudflare R2 when `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` are all configured. The API uploads the validated image under a tenant- and branch-scoped key, stores an `r2:` object reference in PostgreSQL, and returns a five-minute signed URL only after payment-list authorization. If the R2 configuration is incomplete, the existing database data URI remains as a rollout fallback.

Branch QR images still use database data URIs. Moving them requires a second compatibility step because existing QR editing and SMS challenge hashing bind the exact image value. Do that together with persisted tenant-default QR settings rather than changing the storage identifier independently.
