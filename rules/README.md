# Reader Release 1.1.2 RTDB rules candidate

`reader-release-1-1-2-rtdb-rules.json` is a complete Realtime Database
ruleset generated from `reader-release-1-1-baseline-rtdb-rules.json`, the
previously verified Reader 1.1 candidate (SHA-256:
`fea084d8c73d177062eb27bb236ac20522c4783d8688c4ca1863df7895e1fcf8`).
The baseline file is preserved beside the candidate for review and rollback.

The complete ruleset differs at exactly three leaves:

- `users/$uid/avatar/.validate` checks the proposed profile's photo sibling so
  the app can atomically select a newly uploaded photo.
- `users/$uid/avatarPhoto/.write` permits only a verified owner to create,
  replace, preserve unchanged legacy values, or delete their own photo.
- `users/$uid/avatarPhoto/.validate` accepts unchanged legacy values and
  bounded new JPEG data URLs up to 400,000 characters.

All other rules are copied unchanged from the verified baseline, including the
Display Name privacy check and the existing avatar color rules. This is a
candidate only; it does not change Firebase or the live website.

The local emulator fixture is intentionally narrow and is not deployable.

The editor pins Cropper.js 1.6.2 because this restored interface uses the 1.x
`getCroppedCanvas` API; Cropper.js 2 replaces that API and changes its options.

Realtime Database rules can check the JPEG data-URL prefix, encoded text shape,
and length. They cannot decode the image bytes, confirm actual JPEG encoding or
300×300 dimensions, or scan image content. Client-side crop and re-encoding are
not a security boundary.

Photos remain stored on each user's profile. Verified readers can read them by
design. This adds database bandwidth when profiles load; new Circle discussion
records do not copy full photo data. Existing discussion records remain
compatible.

Before any production rules change, obtain a fresh full Rules-tab export, save
it as a rollback copy, compare it with this complete candidate, and obtain
separate approval. Never deploy the emulator fixture.
