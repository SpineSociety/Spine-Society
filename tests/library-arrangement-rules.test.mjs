import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rulesPath = fileURLToPath(new URL("../rules/reader-release-1-1-2-rtdb-rules.json", import.meta.url));
const rulesDocument = JSON.parse(await readFile(rulesPath, "utf8"));
const arrangement = rulesDocument.rules.users.$uid.shelfArrangementV1;

test("shelf arrangement rules are verified-reader and owner scoped", () => {
  assert.equal(arrangement[".read"], "auth != null && auth.uid === $uid && auth.token.email_verified === true");
  assert.equal(arrangement[".write"], "auth != null && auth.uid === $uid && auth.token.email_verified === true");
  assert.equal(rulesDocument.rules.users.$uid.friends[".read"], false);
  assert.equal(rulesDocument.rules.users.$uid.friends[".write"], false);
  assert.equal(rulesDocument.rules.users.$uid.friendRequests[".read"], false);
  assert.equal(rulesDocument.rules.users.$uid.friendRequests[".write"], false);
  assert.ok(arrangement[".validate"].includes("'bookSlots'"));
  assert.ok(arrangement.positions.$slot[".validate"].includes("bookSlots"));
});

test("arrangement data has strict bounds and rejects unknown fields", () => {
  assert.match(arrangement.positions.$slot[".validate"], /\^slot-\(/);
  assert.match(arrangement.positions.$slot[".validate"], /300/);
  assert.equal(arrangement.positions.$slot.$other[".validate"], false);
  assert.match(arrangement.stacks.$stackId.members.$memberSlot[".validate"], /member-\[123\]/);
  assert.equal(arrangement.stacks.$stackId.$other[".validate"], false);
  assert.equal(arrangement.positions.$slot.origin.$other[".validate"], false);
  assert.equal(JSON.stringify(arrangement).includes("numChildren"), false);
  assert.equal(arrangement.$other[".validate"], false);
  assert.match(arrangement.bookSlots.$bookId[".validate"], /positions/);
});
