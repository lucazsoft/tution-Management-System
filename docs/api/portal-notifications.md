# Portal Notifications

Parent and Student portal notifications are persisted in `PortalNotification`. Read state is account-scoped and synchronized through `POST /api/portal-notifications/read`.

## Delivery configuration

SMS uses the existing Aakash adapter:

- `SMS_PROVIDER=AAKASH`
- `AAKASH_SMS_AUTH_TOKEN=<secret>`

Push delivery uses a provider-neutral HTTPS gateway:

- `PUSH_PROVIDER=WEBHOOK`
- `PUSH_WEBHOOK_URL=https://push-gateway.example/deliver`
- `PUSH_WEBHOOK_TOKEN=<secret>`

The gateway receives `{ userId, title, body }` and should return JSON containing `notificationId` or `id`. Production defaults to disabled delivery when no provider is configured; it never reports simulated push delivery as successful. Development simulation is allowed only outside production.

## Deployment

Apply migration `20260915190000_portal_notifications` before deploying the API. Regenerate Prisma Client as part of the normal build.

## Read-state security

The read endpoint updates rows only when notification ID, authenticated user ID, and tenant ID match. IDs belonging to another account or tenant are ignored.
