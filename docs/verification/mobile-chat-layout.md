# Compact phone conversation layout

The reported screenshot exposed multiple viewport-height assumptions, a second top padding inside the message panel, and navigation covering the bottom of the chat. Theme-specific rules also beat the generic mobile padding resets. The final mobile stylesheet is explicitly scoped to messaging and theme specificity, with no desktop changes.

- Real header and navigation dimensions are measured using ResizeObserver. VisualViewport resize/scroll and window resize keep available height in sync without reloading. Measurement attaches to the existing app shell even while messages are loading.
- Main panel starts immediately below the header; messenger fills its content box (no duplicated top/bottom padding). Only message history scrolls, while header/composer retain their space.
- Bottom navigation hides only in an open mobile thread and returns above the conversation-list viewport. Native settings dialogs retain their top-layer behaviour.
- Smaller sender labels/padding, short bubbles sized to content, 85% maximum bubble width, long text wraps. Search focus highlights the bubble rather than drawing a full-width purple frame. Composer font stays at 16px to avoid the usual iOS input auto-zoom.

Validation: build, 178 feed/model checks, 4 hardening checks, assets passed. Lint: 0 errors / 36 warnings (same as Marketplace batch). Existing browser feed and settings suites passed. New test `npm run test:mobile-messages` exercises 360×640, 390×844, screenshot-equivalent 658×604, landscape 740×390 and reduced-height 390×420, light/dark; computed geometry asserts no top gap, composer flush with viewport bottom, compact header, short outgoing bubble width, no horizontal overflow, focus ring and navigation restoration. Also resizes an already open thread without reload. Screenshots: ignored `.arena/mobile-messages/`.

Browser tests mock Supabase. Reduced-height desktop Chromium and VisualViewport event handling are not proof of physical-device keyboard behaviour or a production deployment. Physical iOS/Android validation remains advisable.
