# Messaging heading colour regression

The earlier change in messaging.css was overridden by avani-neon.css. The WhatsApp geometry redesign imposed --wa-text on the heading and hid the subtitle on desktop; older theme selectors also overrode violet on mobile.

The shared heading rules now live outside desktop-only geometry: solid #7c3aed in light mode, #a78bfa in dark mode, no gradient/transparent text, and visible muted subtitle. No changes to messaging behaviour or assets.

Validation: scripts/browser-feed-check.mjs now navigates the actual React /messages route with mocked Supabase responses, loads the full stylesheet stack and asserts computed colour, text fill, absence of gradient, and subtitle visibility at 1214px and 390px in both themes. Browser suite passed, along with build, feed, hardening and asset tests. Lint: 0 errors, 34 existing warnings. This does not verify a production deployment, email delivery or Google login.
