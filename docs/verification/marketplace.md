# Marketplace — first real catalogue

Replaces the unavailable-state screen on `/marketplace` with cards, photo/price, title search, category/city filters, pages of 24 items, listing detail, seller contact through the existing direct-message RPC, listing publication and owner status actions (sold / relist / withdraw). No example adverts are seeded. No checkout, payment processing or delivery service is represented as available. Existing feature flags remain authoritative and are not force-enabled.

## Database

Inspection found `public.marketplace_listings` already present in the connected production project, despite the old screen claiming there was no listings table. Migration 020 reuses that table, adds category/photo path, indexes and a private image bucket (5 MiB JPEG/PNG/WebP). Retains authenticated-only catalogue access and seller-only mutations. A listing cannot reference a path belonging to another seller or unrelated listing. Pictures are signed for one hour; withdrawn/sold listings are owner-readable, not browseable by other members. Already-issued signed photo URLs remain valid until their normal expiry. No existing adverts are deleted.

Applied successfully to project `hpsftpganwkcftnbgnwq` via migration `marketplace_photos_and_catalog`. The rollback-only regression in `supabase/tests/marketplace_rls.sql` was executed successfully: authenticated reading of active listing, no non-owner updates, forged seller rejected, foreign photo path rejected, owner can mark sold and retain access, other users cannot read the sold listing. This tests database permissions, not production browser upload/delivery.

## Client behaviour and limits

- Required image/title/price/city; per-field bounds, allowed categories/condition/currency, free items supported, EUR/XAF/USD, decimal comma accepted.
- Native modal dialogs with focus/keyboard behaviour, busy guards, preserved form after failures, no fabricated success on rejected writes.
- New upload removed after definite insert rejection; ambiguous network failures deliberately retain the object rather than risk deleting a photo from a committed listing. Such a failure can require checking My listings before retrying. There is no general orphan-object cleanup job in this change.
- Catalogue has no artificial distance, map pin, reviews, inventory totals or seller ratings. City matching is text filtering, not geolocation. Removed ads remain soft-deleted; no permanent purge or payment/refund mechanism is supplied.
- Photo signing failure degrades to a photo-unavailable card. Signed links are renewed on refresh.

## Validation

- Build passed; feed/model suite **178/178**, hardening **4/4**, asset audit passed.
- Lint: 0 errors, 36 warnings (34 pre-existing and 2 effect-state warnings in the new panel).
- `npm run test:marketplace-browser`: mocked Supabase UI/contract checks passed for search/category filtering, free price, real seller-ID DM call, file validation, persisted create/reload, double-submit protection, owner sold/relist, failed insert preserving fields, failed catalogue retry, pagination without duplicates, and empty database with no demo cards. Responsive screenshots at 1366 and 390px, both themes, without horizontal overflow.
- Existing `scripts/browser-feed-check.mjs` passed. Browser fixtures are isolated and never written to production.

For the browser test, install optional `playwright-core @sparticuz/chromium` without saving the lockfile, start Vite using `VITE_SUPABASE_URL=https://avani-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=browser-test-only`, then `npm run test:marketplace-browser`. Suitable Chromium runtime libraries are required. Local screenshots are under ignored `.arena/marketplace/`.

Production front-end deployment is not independently verified by this report. Group-page simplification and unread-state persistence are separate outstanding requests, not claimed fixed by this Marketplace change.
