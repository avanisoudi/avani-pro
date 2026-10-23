# One feed story card per author

The home feed mapped individual story records to cards, while the separate Stories panel already grouped them. The home feed now reuses storyRings (grouped by author_id, never display name) and keys cards by author ID. Records repeated by ID are deduplicated on load, not deleted from the server. Each card retains all its author's stories in chronological order; manual and timed navigation use the same grouped playback list.

Validation: browser fixture with five stories for three authors, including two different users sharing the same display name. Asserted three cards, one grouped two-story card for the other author, next/previous playback preserving both stories, and both own stories accessible. Existing responsive browser suite, build, 169 feed tests, 4 hardening tests, asset audit all pass. Lint: 0 errors and 34 existing warnings. Tests use mocked Supabase responses, not production data.
