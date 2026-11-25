import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const projectId = "demo-spine-society-r112-photo";
const databaseNamespace = `${projectId}-default-rtdb`;
const authOrigin = "http://127.0.0.1:19099";
const databaseOrigin = "http://127.0.0.1:19000";
const photoRules = JSON.parse(
  await readFile(new URL("../rules/reader-release-1-1-2-rtdb-rules.json", import.meta.url), "utf8"),
);
const fixture = JSON.parse(
  await readFile(new URL("./firebase/database.rules.json", import.meta.url), "utf8"),
);
assert.equal(
  fixture.rules.users.$uid.avatar[".validate"],
  photoRules.rules.users.$uid.avatar[".validate"],
  "Emulator must use the complete candidate avatar validation rule.",
);
assert.equal(
  fixture.rules.users.$uid.avatarPhoto[".write"],
  photoRules.rules.users.$uid.avatarPhoto[".write"],
  "Emulator must use the complete candidate RTDB photo write rule.",
);
assert.equal(
  fixture.rules.users.$uid.avatarPhoto[".validate"],
  photoRules.rules.users.$uid.avatarPhoto[".validate"],
  "Emulator must use the complete candidate photo validation rule.",
);
for (const key of ["displayName", "avatarStyle"]) {
  assert.deepEqual(
    fixture.rules.users.$uid[key],
    photoRules.rules.users.$uid[key],
    `Emulator must preserve deployed ${key} rules exactly.`,
  );
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function createTestUser({ verified = true } = {}) {
  const suffix = randomUUID();
  const email = `reader-${suffix}@example.test`;
  const password = `LocalOnly-${suffix}-A1!`;
  const created = await jsonRequest(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  assert.equal(created.response.status, 200, "Auth Emulator should create a fictional account.");
  const uid = created.body.localId;
  const initialToken = created.body.idToken;
  if (verified) {
    const sent = await jsonRequest(
      `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=fake-api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: initialToken }),
      },
    );
    assert.equal(sent.response.status, 200, "Auth Emulator should issue a local verification code.");
    const oobResult = await jsonRequest(`${authOrigin}/emulator/v1/projects/${projectId}/oobCodes`);
    const oobCode = oobResult.body?.oobCodes?.find(entry => entry.email === email)?.oobCode;
    assert.ok(oobCode, "Auth Emulator should retain the fictional verification code locally.");
    const verifiedResult = await jsonRequest(
      `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode, returnSecureToken: true }),
      },
    );
    assert.equal(verifiedResult.response.status, 200);
    assert.equal(verifiedResult.body.emailVerified, true);
  }
  const signedIn = await jsonRequest(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  assert.equal(signedIn.response.status, 200, "Fictional account should sign in to the Auth Emulator.");
  const token = signedIn.body.idToken;
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.aud, projectId, "Test token must belong to the demo project.");
  assert.equal(claims.user_id, uid);
  assert.equal(claims.email_verified, verified);
  return { uid, token, email, password };
}

function databaseUrl(path, token = "") {
  const params = new URLSearchParams({ ns: databaseNamespace });
  if (token) params.set("auth", token);
  return `${databaseOrigin}/${path}.json?${params}`;
}

async function setRules(rules) {
  const result = await jsonRequest(
    `${databaseOrigin}/.settings/rules.json?ns=${encodeURIComponent(databaseNamespace)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: JSON.stringify(rules),
    },
  );
  assert.equal(result.response.status, 200, "Local emulator rules should install successfully.");
}

function denied(response, label) {
  assert.ok(
    response.status === 401 || response.status === 403,
    `${label}: expected denied access; received HTTP ${response.status}.`,
  );
}

async function writePhoto(uid, token, value, method = "PUT") {
  return fetch(databaseUrl(`users/${uid}/avatarPhoto`, token), {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(value),
  });
}

const legacyPng = "data:image/png;base64,iVBORw0KGgo=";
const legacyUrl = "https://legacy-images.example.test/reader-avatar.png";
const owner = await createTestUser();
const legacyUrlOwner = await createTestUser();
const legacyEmailNameOwner = await createTestUser();
const verifiedReader = await createTestUser();
const unverifiedReader = await createTestUser({ verified: false });

await setRules({ rules: { ".read": true, ".write": true } });
// Seed only fictional local accounts while emulator rules are open; immediately
// restore the locked fixture before any authorization assertions.
for (const [uid, value] of [[owner.uid, legacyPng], [legacyUrlOwner.uid, legacyUrl]]) {
  const seeded = await jsonRequest(databaseUrl(`users/${uid}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer owner",
    },
    body: JSON.stringify({ avatar: "photo", avatarPhoto: value }),
  });
  assert.equal(seeded.response.status, 200);
}
const legacyEmailNameSeed = await jsonRequest(databaseUrl(`users/${legacyEmailNameOwner.uid}`), {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer owner",
  },
  body: JSON.stringify({ displayName: "legacy@example.test" }),
});
assert.equal(legacyEmailNameSeed.response.status, 200);
await setRules(fixture);

const presentationUpdate = await jsonRequest(databaseUrl(`users/${owner.uid}`, owner.token), {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    avatar: "initials",
    avatarStyle: "plum",
    displayName: "Fictional Reader",
  }),
});
assert.equal(presentationUpdate.response.status, 200, "Verified owner can preserve initials, color, and display-name editing.");
const visibleName = await jsonRequest(databaseUrl(`users/${owner.uid}/displayName`, verifiedReader.token));
assert.equal(visibleName.response.status, 200);
assert.equal(visibleName.body, "Fictional Reader");
const visibleStyle = await jsonRequest(databaseUrl(`users/${owner.uid}/avatarStyle`, verifiedReader.token));
assert.equal(visibleStyle.response.status, 200);
assert.equal(visibleStyle.body, "plum");
const otherNameWrite = await fetch(databaseUrl(`users/${owner.uid}/displayName`, verifiedReader.token), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify("Unauthorized edit"),
});
denied(otherNameWrite, "Another verified reader cannot edit Display Name");
const otherStyleWrite = await fetch(databaseUrl(`users/${owner.uid}/avatarStyle`, verifiedReader.token), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify("fern"),
});
denied(otherStyleWrite, "Another verified reader cannot edit avatar color");
const invalidStyle = await fetch(databaseUrl(`users/${owner.uid}/avatarStyle`, owner.token), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify("unlisted-color"),
});
denied(invalidStyle, "Owner cannot write an unlisted avatar color");
const invalidDisplayName = await fetch(databaseUrl(`users/${owner.uid}/displayName`, owner.token), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify("reader@example.test"),
});
denied(invalidDisplayName, "Display Name cannot be an email address");
const unverifiedStyle = await fetch(databaseUrl(`users/${unverifiedReader.uid}/avatarStyle`, unverifiedReader.token), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify("fern"),
});
denied(unverifiedStyle, "Unverified owner cannot change avatar color");
const anonymousNameRead = await fetch(databaseUrl(`users/${owner.uid}/displayName`));
denied(anonymousNameRead, "Anonymous visitor cannot read Display Name");
const legacyEmailNameOwnerRead = await jsonRequest(
  databaseUrl(`users/${legacyEmailNameOwner.uid}/displayName`, legacyEmailNameOwner.token),
);
assert.equal(legacyEmailNameOwnerRead.body, "legacy@example.test");
const legacyEmailNamePeerRead = await fetch(
  databaseUrl(`users/${legacyEmailNameOwner.uid}/displayName`, verifiedReader.token),
);
denied(legacyEmailNamePeerRead, "Display Name privacy guard hides legacy email-shaped values");

const legacyRead = await jsonRequest(databaseUrl(`users/${owner.uid}/avatarPhoto`, verifiedReader.token));
assert.equal(legacyRead.response.status, 200, "Verified readers should retain access to legacy inline images.");
assert.equal(legacyRead.body, legacyPng, "Legacy PNG data must remain unchanged.");
const legacyUrlRead = await jsonRequest(databaseUrl(`users/${legacyUrlOwner.uid}/avatarPhoto`, verifiedReader.token));
assert.equal(legacyUrlRead.response.status, 200, "Verified readers should retain access to legacy URL references.");
assert.equal(legacyUrlRead.body, legacyUrl);

const noPhoto = "data:image/jpeg;base64,/9j/AA==";
const atomicPhotoOwner = await createTestUser();
const atomicCreate = await jsonRequest(databaseUrl(`users/${atomicPhotoOwner.uid}`, atomicPhotoOwner.token), {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ avatar: "photo", avatarPhoto: noPhoto }),
});
assert.equal(atomicCreate.response.status, 200, "Verified owner can atomically create a photo and select it.");
const createPhoto = await writePhoto(owner.uid, owner.token, noPhoto);
assert.equal(createPhoto.status, 200, "Verified owner should create a bounded JPEG data URL.");
const selectPhoto = await jsonRequest(databaseUrl(`users/${owner.uid}`, owner.token), {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ avatar: "photo" }),
});
assert.equal(selectPhoto.response.status, 200, "Owner can select the saved photo marker.");

const replacement = "data:image/jpeg;base64,/9j/AA==";
const replacePhoto = await writePhoto(owner.uid, owner.token, replacement);
assert.equal(replacePhoto.status, 200, "Verified owner should replace their own photo.");

const crossAccount = await writePhoto(owner.uid, verifiedReader.token, noPhoto);
denied(crossAccount, "Another verified reader cannot replace the owner's photo");
const crossAccountDelete = await writePhoto(owner.uid, verifiedReader.token, "", "DELETE");
denied(crossAccountDelete, "Another verified reader cannot delete the owner's photo");
const unverifiedWrite = await writePhoto(unverifiedReader.uid, unverifiedReader.token, noPhoto);
denied(unverifiedWrite, "Unverified account cannot upload");
const anonymousWrite = await writePhoto(owner.uid, "", noPhoto);
denied(anonymousWrite, "Anonymous visitor cannot upload");
const invalidFormat = await writePhoto(owner.uid, owner.token, "data:image/png;base64,AA==");
denied(invalidFormat, "New PNG data URL is rejected");
const invalidPrefix = await writePhoto(owner.uid, owner.token, "not-an-image");
denied(invalidPrefix, "New non-image data is rejected");
const oversized = await writePhoto(
  owner.uid,
  owner.token,
  `data:image/jpeg;base64,${"A".repeat(400_000)}`,
);
denied(oversized, "Oversized JPEG data URL is rejected");

const anonymousRead = await fetch(databaseUrl(`users/${owner.uid}/avatarPhoto`));
denied(anonymousRead, "Anonymous visitor cannot read photos");
const unverifiedRead = await fetch(databaseUrl(`users/${owner.uid}/avatarPhoto`, unverifiedReader.token));
denied(unverifiedRead, "Unverified account cannot read photos");
const verifiedRead = await jsonRequest(databaseUrl(`users/${owner.uid}/avatarPhoto`, verifiedReader.token));
assert.equal(verifiedRead.response.status, 200);
assert.equal(verifiedRead.body, replacement, "Verified readers can read the current photo value.");

// A normal unrelated profile update must not force a legacy photo rewrite.
const preserveLegacy = await jsonRequest(databaseUrl(`users/${legacyUrlOwner.uid}`, legacyUrlOwner.token), {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "Fictional Reader" }),
});
assert.equal(preserveLegacy.response.status, 200);
const legacyAfterUpdate = await jsonRequest(databaseUrl(`users/${legacyUrlOwner.uid}/avatarPhoto`, legacyUrlOwner.token));
assert.equal(legacyAfterUpdate.body, legacyUrl);

// Fresh sign-in obtains a new token; the database value remains after a session
// refresh, matching the persistence needed by a browser reload.
const signedIn = await jsonRequest(
  `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: owner.email,
      password: owner.password,
      returnSecureToken: true,
    }),
  },
);
assert.equal(signedIn.response.status, 200, "Fictional owner should be able to sign in again.");
const persistedRead = await jsonRequest(
  databaseUrl(`users/${owner.uid}/avatarPhoto`, signedIn.body.idToken),
);
assert.equal(persistedRead.response.status, 200);
assert.equal(persistedRead.body, replacement, "New photo remains after fresh authentication.");

const removePhoto = await jsonRequest(databaseUrl(`users/${owner.uid}`, signedIn.body.idToken), {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ avatar: "🌿", avatarPhoto: null }),
});
assert.equal(removePhoto.response.status, 200, "Owner can atomically remove a photo and select an avatar preset.");
const removedPhotoRead = await jsonRequest(
  databaseUrl(`users/${owner.uid}/avatarPhoto`, signedIn.body.idToken),
);
assert.equal(removedPhotoRead.body, null, "Photo removal deletes only the photo field.");

console.log("Reader photo emulator checks passed: atomic owner uploads, denied cross-account access, size/format limits, legacy preservation, delete, verified reads, Display Name privacy, and post-sign-in persistence.");
