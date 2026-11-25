import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialArrangement,
  hydrateArrangement,
  moveObject,
} from "../library-arrangement-model.mjs";
import { createLibraryArrangementSession } from "../library-arrangement-session.mjs";

const dimensions = book => ({ width: book.width || 60, height: book.height || 180 });
const books = [
  { id: "volume-a", shelfX: 0, width: 60, height: 180 },
  { id: "volume-b", shelfX: 80, width: 60, height: 180 },
];
const copy = value => value === null ? null : structuredClone(value);

function makeDatabase() {
  let value = null;
  const listeners = new Set();
  return {
    read: () => copy(value),
    subscribe(_uid, callback) {
      const listener = snapshot => callback({ val: () => copy(snapshot) });
      listeners.add(listener);
      listener(value);
      return () => listeners.delete(listener);
    },
    async transact(_uid, updater) {
      const next = updater(copy(value));
      if (next === undefined) return { committed: false, snapshot: { val: () => copy(value) } };
      value = copy(next);
      for (const listener of [...listeners]) listener(value);
      return { committed: true, snapshot: { val: () => copy(value) } };
    },
    setExternal(next) { value = copy(next); for (const listener of [...listeners]) listener(value); },
  };
}

test("arrangements save and reload without changing legacy library book records", async () => {
  const database = makeDatabase();
  let uid = "reader-one";
  let received = null;
  const session = createLibraryArrangementSession({
    getAuthUid: () => uid,
    subscribe: database.subscribe,
    onSnapshot: value => { received = value; },
  });
  const token = session.begin(uid);
  session.listen(token);
  const first = createInitialArrangement(books, dimensions);
  const moved = moveObject(first, "volume-b", "shelf-2", 35);
  const saved = await session.save(token, moved.scene, database.transact);
  assert.equal(saved.revision, 1);
  assert.equal(hydrateArrangement(books, dimensions, saved).positions["volume-b"].shelfId, "shelf-2");
  assert.deepEqual(books.map(book => book.shelfX), [0, 80]);
  assert.deepEqual(received, saved);

  const reopened = hydrateArrangement(books, dimensions, database.read());
  assert.equal(reopened.revision, 1);
  assert.equal(reopened.positions["volume-b"].x, 35);
  assert.equal(reopened.positions["volume-b"].shelfId, "shelf-2");
});

test("stale revisions and changed auth sessions cannot overwrite the saved layout", async () => {
  const database = makeDatabase();
  let uid = "reader-one";
  const session = createLibraryArrangementSession({
    getAuthUid: () => uid,
    subscribe: database.subscribe,
  });
  const token = session.begin(uid);
  session.listen(token);
  const initial = createInitialArrangement(books, dimensions);
  await session.save(token, initial, database.transact);

  const stale = moveObject(initial, "volume-b", "shelf-2", 45);
  await assert.rejects(session.save(token, stale.scene, database.transact), /changed this bookshelf/);
  assert.equal(hydrateArrangement(books, dimensions, database.read()).positions["volume-b"].x, 80);

  const next = moveObject(hydrateArrangement(books, dimensions, database.read()), "volume-b", "shelf-2", 45);
  uid = "reader-two";
  await assert.rejects(session.save(token, next.scene, database.transact), /reader changed/);
  assert.equal(hydrateArrangement(books, dimensions, database.read()).positions["volume-b"].x, 80);
});

test("arrangement records are isolated to the owner session and never include book metadata", async () => {
  const database = makeDatabase();
  let uid = "reader-one";
  const session = createLibraryArrangementSession({
    getAuthUid: () => uid,
    subscribe: database.subscribe,
  });
  const token = session.begin(uid);
  const scene = createInitialArrangement(books, dimensions);
  await session.save(token, scene, database.transact);
  const saved = database.read();
  assert.deepEqual(Object.keys(saved).sort(), [
    "bookSlots", "positions", "revision", "schemaVersion", "shelfWidth",
  ]);
  assert.deepEqual(Object.keys(saved.positions["slot-001"]).sort(), [
    "bookId", "orientation", "shelfId", "x",
  ]);
  uid = "reader-two";
  assert.equal(session.isCurrent(token), false);
  session.end();
  assert.equal(session.saved, null);
  assert.equal(hydrateArrangement(books, dimensions, database.read()).positions["volume-a"].shelfId, "shelf-1");
});
