---
name: simpl_support
description: |
  First-party in-app support chat (@simpl/support). Use when wiring customer
  support messaging in simpl_sales, the staff inbox in simpl_dashboard, applying
  the support schema migration, screenshot/context capture, or replacing Intercom.
  Triggers: "support chat", "in-app support", "Intercom replacement", "support inbox".
---

# simpl_support integration guide

## Installation

Vendor the built package into the host (Vercel cannot clone private git deps):

```bash
cd simpl_support && npm run build && bash scripts/sync-vendor.sh ../simpl_sales ../simpl_dashboard
```

```json
"@simpl/support": "file:./vendor/simpl-support"
```

Add `./vendor/simpl-support/dist/**/*.{js,mjs}` to Tailwind `content`.
Apply `migrations/001_support.sql` and expose the `support` schema in Supabase API settings.

## 90% usage

```tsx
import { SupportLauncher } from "@simpl/support/widget"
<SupportLauncher supabase={supabase} userId={user.id} notifyUrl="/api/support/notify" />
```

```tsx
import { SupportInbox } from "@simpl/support/inbox"
<SupportInbox supabase={supabase} staffUserId={user.id} initialThreadId={thread} />
```

```ts
import { createSupportNotifyRoute } from "@simpl/support/server"
export const POST = createSupportNotifyRoute({
  createServiceClient,
  getAuthenticatedUserId, // cookie session; must own the thread
  // notifySecret: optional Bearer for internal callers
  resendApiKey, notifyTo, notifyFrom, inboxBaseUrl,
})
```

Hosts should use `html2canvas-pro` (Tailwind v4 `oklch`) — not stock `html2canvas`.
Until `support` is in Exposed schemas, pass `SUPPORT_APP_BRIDGE` (default in widget/inbox).
Apply migrations `001`, `002` (app bridge), `003` (own-thread sender is user).

## Strict rules

- Access is RLS + `support.is_staff()` (same gate as dashboard `is_admin` / `managed_operator`). Do not add service-role paths in the browser.
- Message `sender_type` / `sender_user_id` are trigger-derived — never trust client claims.
- `sender_type = staff` only when the author is staff **and** the thread belongs to someone else (admins messaging their own product thread stay `user`).
- Keep styling on host shadcn tokens (`bg-background`, `text-foreground`). Do not ship a separate CSS theme.
- Refresh vendor copies via `scripts/sync-vendor.sh` after every library release.

## Pitfalls

- Forgetting to expose the `support` schema → PostgREST 404/PGRST106.
- Omitting the Tailwind content glob → widget looks unstyled.
- Pointing `notifyUrl` at a route without a service-role client → notify cannot update `last_staff_notified_at`.
- Leaving `/api/support/notify` unauthenticated → open email spam. Always pass `getAuthenticatedUserId` and/or `notifySecret`.
- Using stock `html2canvas` with Tailwind v4 → `oklch` parse errors; use `html2canvas-pro`.

## Testing

```bash
npm test
npm run build
```

## What this library does NOT do

- AI replies, macros, SLA, public help center, email ingestion
- Customer AI chat / `customer_agent`
- Intercom / third-party messenger wrappers
