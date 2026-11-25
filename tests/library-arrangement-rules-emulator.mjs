import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL(
  "../../../../artifacts/spine-society-phase3-integration/security-testing-rtdb-rules-2026-11-11/package.json",
  import.meta.url,
));
const { initializeTestEnvironment, assertFails, assertSucceeds } =
  require("@firebase/rules-unit-testing");
const { ref, set, get } = require("firebase/database");
const rules = await readFile(new URL("../rules/reader-release-1-1-2-rtdb-rules.json", import.meta.url), "utf8");
const environment = await initializeTestEnvironment({
  projectId: "demo-spine-society-library-arrangement",
  database: { host: "127.0.0.1", port: 9125, rules },
});
const ownerUid = "fictional-owner";
const otherUid = "fictional-other-reader";
const arrangementPath = `users/${ownerUid}/shelfArrangementV1`;
const databaseFor = (uid, verified = true) =>
  environment.authenticatedContext(uid, { email_verified: verified }).database();
const position = (bookId, index, overrides = {}) => [
  `slot-${String(index).padStart(3, "0")}`,
  { bookId, shelfId: "shelf-1", x: index * 80, orientation: "upright", ...overrides },
];
const recordFor = (bookId = "book-0") => {
  const [slot, value] = position(bookId, 1);
  return {
    schemaVersion: 1,
    revision: 1,
    shelfWidth: 520,
    bookSlots: { [bookId]: slot },
    positions: { [slot]: value },
  };
};

try {
  await environment.withSecurityRulesDisabled(async context => {
    const library = Object.fromEntries(Array.from({ length: 301 }, (_, index) => [
      `book-${index}`,
      { title: `Fictional Book ${index}`, author: "Fictional Reader" },
    ]));
    library["x".repeat(129)] = { title: "Long Fictional ID", author: "Fictional Reader" };
    await set(ref(context.database(), `users/${ownerUid}/library`), library);
  });

  const ownerPath = ref(databaseFor(ownerUid), arrangementPath);
  await assertSucceeds(set(ownerPath, recordFor()));
  await assertSucceeds(get(ownerPath));
  await assertFails(get(ref(databaseFor(otherUid), arrangementPath)));
  await assertFails(set(ref(databaseFor(otherUid), arrangementPath), recordFor()));
  await assertFails(get(ref(databaseFor(ownerUid, false), arrangementPath)));
  await assertFails(set(ref(databaseFor(ownerUid, false), arrangementPath), recordFor()));
  await assertFails(get(ref(environment.unauthenticatedContext().database(), arrangementPath)));
  await assertFails(set(ref(environment.unauthenticatedContext().database(), arrangementPath), recordFor()));

  await assertFails(set(ref(databaseFor(ownerUid), arrangementPath), recordFor("not-in-this-library")));

  const duplicate = recordFor();
  duplicate.positions["slot-002"] = structuredClone(duplicate.positions["slot-001"]);
  await assertFails(set(ref(databaseFor(ownerUid), arrangementPath), duplicate));

  const badIndex = recordFor();
  badIndex.bookSlots["book-0"] = "slot-002";
  await assertFails(set(ref(databaseFor(ownerUid), arrangementPath), badIndex));
  await assertFails(set(ref(databaseFor(ownerUid), arrangementPath), recordFor("x".repeat(129))));

  const threeBookIds = ["book-0", "book-1", "book-2"];
  const threeSlots = threeBookIds.map((_, index) => `slot-${String(index + 1).padStart(3, "0")}`);
  const threeBookStack = {
    schemaVersion: 1,
    revision: 2,
    shelfWidth: 520,
    bookSlots: Object.fromEntries(threeBookIds.map((bookId, index) => [bookId, threeSlots[index]])),
    positions: Object.fromEntries(threeBookIds.map((bookId, index) => [threeSlots[index], {
      bookId,
      shelfId: "shelf-300",
      x: 0,
      orientation: "horizontal",
      stackId: "stack-1",
      origin: { shelfId: "shelf-1", x: index * 80, orientation: "upright" },
    }])),
    stacks: {
      "stack-1": {
        id: "stack-1",
        shelfId: "shelf-300",
        x: 0,
        members: Object.fromEntries(threeBookIds.map((bookId, index) => [
          `member-${index + 1}`,
          { bookId, positionSlot: threeSlots[index] },
        ])),
      },
    },
  };
  await assertSucceeds(set(ref(databaseFor(ownerUid), arrangementPath), threeBookStack));
  const fourBookStack = structuredClone(threeBookStack);
  fourBookStack.revision = 3;
  fourBookStack.bookSlots["book-3"] = "slot-004";
  fourBookStack.positions["slot-004"] = {
    bookId: "book-3",
    shelfId: "shelf-300",
    x: 0,
    orientation: "horizontal",
    stackId: "stack-1",
    origin: { shelfId: "shelf-1", x: 240, orientation: "upright" },
  };
  fourBookStack.stacks["stack-1"].members["member-4"] = {
    bookId: "book-3",
    positionSlot: "slot-004",
  };
  await assertFails(set(ref(databaseFor(ownerUid), arrangementPath), fourBookStack));

  const invalidShelf = recordFor();
  invalidShelf.positions["slot-001"].shelfId = "shelf-301";
  await assertFails(set(ref(databaseFor(ownerUid), arrangementPath), invalidShelf));

  const tooManyPositions = {
    schemaVersion: 1,
    revision: 4,
    shelfWidth: 20000,
    bookSlots: {},
    positions: {},
  };
  for (let index = 0; index < 301; index += 1) {
    const [slot, value] = position(`book-${index}`, index + 1);
    tooManyPositions.bookSlots[value.bookId] = slot;
    tooManyPositions.positions[slot] = value;
  }
  await assertFails(set(ref(databaseFor(ownerUid), arrangementPath), tooManyPositions));
  console.log("PASS: verified-owner isolation, bounded and unique positions, valid shelf 300, invalid shelf 301, three-book maximum, and library membership.");
} finally {
  await environment.cleanup();
}
