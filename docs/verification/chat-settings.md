# Discussion settings and adding members

## Delivered

- A clearly labelled settings action in the conversation header opens a native modal dialog. It is placed in the browser top layer, so the mobile top/bottom navigation cannot cover its close button. Escape, focus containment, return focus and scrolling work on mobile/desktop.
- Replaces the old hidden/responsive third-column settings rules without changing normal conversation geometry.
- Responsible users can search by name/username (two-character minimum), add one person at a time, rename or update the group photo. Existing members and the signed-in user are excluded from suggestions.
- Stale search results are cleared; loading, empty and failure states are explicit. Member read failure prevents additions and offers a reload. A synchronous mutation lock prevents double requests, shared with photo updates. No success is shown before RPC confirmation.
- All members are shown, with Responsible/You labels. Removal and ownership transfer controls live alongside each member, with confirmation. The responsible user must transfer before leaving; ordinary members retain the existing leave action.
- Private discussions show their information/members/media, not group management controls. Media counts explicitly concern currently loaded messages.

## Permissions and scope

Reuses `avani_manage_chat` from migration 013: authenticated conversation membership is required, non-group conversations are rejected, add/remove/rename/transfer require the current owner, leave disallows the owner, additions are idempotent and the 101-member limit remains enforced. Photo permissions remain enforced by the existing avatar RPC. No permission widening and no new migration.

Community groups linked through `public.groups` intentionally remain managed in the Groups feature: the existing chat RPC rejects changes to them. The settings interface explains this distinction. No live database mutation or production permission test was performed for this change.

## Validation

- `npm run build`: pass.
- `npm run test:feed`: 169/169.
- `npm run test:hardening`: 4/4.
- `npm run test:assets`: 26 files, no byte-identical duplicates; icon references resolved.
- `npm run lint`: 0 errors, 34 existing warnings.
- Existing `scripts/browser-feed-check.mjs`: pass (feed, publishing, stories, messaging heading).
- New `npm run test:chat-browser`: six browser cases (1214/390px × owner/member/direct). Narrow cases also exercise the dark stylesheet. Actual rendered bounds and close-button hit testing confirm that navigation cannot hide the settings dialog. Mocked Supabase responses verify adding and refreshing membership, rejecting and retrying a failed add, double-click protection, exclusion after adding, clearing failed search results, renaming, cancelled and confirmed removal, transfer and loss of old-owner controls, complete member list, and keyboard close/focus return. These are isolated UI/RPC-contract tests, not production end-to-end tests.

Browser tests require optional tools: `npm install --no-save --package-lock=false playwright-core @sparticuz/chromium`. Start Vite with `VITE_SUPABASE_URL=https://avani-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=browser-test-only npm run dev -- --host 0.0.0.0`, then run `npm run test:chat-browser`. Browser/system libraries must be available in the execution environment. Screenshots generated locally under ignored `.arena/chat-settings/`.
