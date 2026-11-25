# Spine Society — Library Restoration Candidate

This isolated, uncommitted candidate restores My Nook, My Collection, Dog-Eared Pages, and the previously iPhone-tested bookshelf arrangement interactions. It does not change production Firebase, publish, merge, or deploy.

## Arrangement data and migration

- Existing library entries are not rewritten or deleted. On first view, books are placed from existing `shelfX` values and their current order. Legacy records have no shelf, orientation, or stack fields, so this initial layout is derived rather than migrated in place.
- A reader's saved arrangement lives separately at `users/$uid/shelfArrangementV1`. It stores only book IDs, shelf placement, horizontal coordinates, orientation, and stack membership/original positions. A `bookSlots` reverse index and rules validation prevent duplicate or mismatched book placements.
- Arrangement writes use a Firebase transaction with revision checks and are limited to the signed-in, verified account owner. The complete candidate rules are in `rules/reader-release-1-1-2-rtdb-rules.json`; they have not been applied to production.
- Existing `shelfX` values remain unchanged. Newly added books get a derived placement; deleted books are excluded when the saved arrangement is hydrated and removed from that separate record on a later successful save.
- Arrange mode is capped at 300 books/placements/shelves. Larger libraries remain fully available in Browse and search with arrangement controls disabled; they are never truncated or blocked from opening. Shelf rows are inferred from placements, so empty trailing rows are not persisted.

## Restored interactions

Browse and Arrange modes support upright books, both supported lean directions, horizontal books, stacks up to three, cross-shelf movement and stacking, separating, intentional gaps, keyboard movement, and collision checks. The integrated browser fixture checks these controls and reload behavior using an in-memory save adapter.

## Verification

Run the focused unit, source, and mobile-browser tests from this directory:

```sh
node --test tests/library*.test.mjs tests/profile-photo-unit.test.mjs
```

The browser fixture emulates 375px and 390px in Chromium and uses an in-memory save adapter. It does not verify physical iPhone Safari or production authentication/database integration.

Run the full candidate rules against the existing local Firebase Database Emulator CLI, with fictional data only:

```sh
ROOT="$PWD"
TEMP_RUN="$(mktemp -d)"
(
  cd "$TEMP_RUN"
  "$ROOT/../../../artifacts/spine-society-phase3-integration/security-testing-rtdb-rules-2026-11-11/node_modules/.bin/firebase" \
    emulators:exec --only database --project demo-spine-society-library-arrangement \
    --config "$ROOT/firebase.arrangement.json" \
    "node $ROOT/tests/library-arrangement-rules-emulator.mjs"
)
rm -rf "$TEMP_RUN"
```

Capture six full-app viewport screenshots (fictional data, no Firebase connection):

```sh
node tests/capture-library-screenshots.mjs
```

Outputs are in the ignored `generated-artifacts/library-restoration/` directory. The capture uses the current app HTML/CSS and the integrated shelf module; a local-only fixture hides the sign-in/entrance screens and supplies fictional books.

## Release limitations

The complete candidate differs from current main's merged Reader 1.1.2 rules file at `04f33e0` only by adding `users/$uid/shelfArrangementV1`. Baseline SHA-256 is `9f75f9908c7c10031af0aaae62ea91bd0e642a342672c13355e166950b5bf631`; candidate SHA-256 is `a21a0362756290853c9e36c08024d63f6e8fc7c57258e315a98a9ed707d303c4`. That confirms the Display Name, avatar-style, profile-photo, and all other rules are unchanged from the merged source candidate. The Firebase Console export currently available in the workspace predates Reader 1.1.2 and lacks `displayName` and `avatarStyle`; it is not a valid production baseline. A fresh live Rules-tab export is still required to prove production currently matches `04f33e0`. No production Firebase was accessed.

The screenshots use the actual application HTML/CSS and were compared against the preserved Phase 3F/3G references. Nook retains the stamp, lamp, six-book miniature, room card, and Circles section; the collection retains its two tabs, Browse/Arrange, search, status filters, and live shelf. The fixed bottom navigation overlays the lower call-to-action/shelf in these first-viewport captures, and the Circles section is below the Nook fold. Dog-Eared Pages has the approved count and subtitle; the reference also has a Phase 3G offline-preview banner, intentionally absent from the real app. The archived Phase 3G screenshot shows front-facing, centered book titles, while its saved integration source/tests specify vertical spine lettering; this candidate follows the source/tests. That screenshot/source disagreement remains for visual approval. These are desktop-Chromium captures, not physical iPhone Safari.

Offline transaction behavior and actual multi-device Firebase race handling have not been exercised. The first-use layout is derived, not written into legacy library entries; an empty shelf row cannot be retained as a separate preference.