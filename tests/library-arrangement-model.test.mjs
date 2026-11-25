import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStack,
  combineObjects,
  createInitialArrangement,
  hydrateArrangement,
  moveObject,
  sceneObjects,
  separateStack,
  serializeArrangement,
  setOrientation,
  validateArrangement,
} from "../library-arrangement-model.mjs";

const dimensions = book => ({ width: book.width || 60, height: book.height || 180 });
const books = [
  { id: "book-a", title: "A", width: 60, height: 180, shelfX: 0 },
  { id: "book-b", title: "B", width: 66, height: 190, shelfX: 75 },
  { id: "book-c", title: "C", width: 72, height: 200, shelfX: 159 },
  { id: "book-d", title: "D", width: 58, height: 175, shelfX: 300 },
];

test("initial migration preserves legacy shelfX and leaves book records unchanged", () => {
  const original = structuredClone(books);
  const scene = createInitialArrangement(books, dimensions);
  assert.deepEqual(
    books.map(book => scene.positions[book.id].x),
    books.map(book => book.shelfX),
  );
  assert.deepEqual(books, original);
  assert.equal(scene.shelves.length, 2);
  assert.equal(scene.positions["book-a"].orientation, "upright");
  assert.equal(scene.positions["book-a"].shelfId, "shelf-1");
});

test("dynamic shelves expand on demand and shelf placement survives reload", () => {
  const manyBooks = Array.from({ length: 25 }, (_, index) => ({
    id: `many-${index}`, title: `Book ${index}`, shelfX: index * 70, width: 60, height: 180,
  }));
  const scene = createInitialArrangement(manyBooks, dimensions);
  assert.equal(scene.positions["many-24"].shelfId, "shelf-3");
  const moved = moveObject(scene, "many-24", "shelf-4", 12);
  assert.equal(moved.ok, true, moved.reason);
  assert.equal(moved.scene.shelves.at(-1), "shelf-5");
  const reopened = hydrateArrangement(manyBooks, dimensions, serializeArrangement(moved.scene));
  assert.equal(reopened.positions["many-24"].shelfId, "shelf-4");
  assert.equal(reopened.positions["many-24"].x, 12);
  assert.equal(reopened.shelves.at(-1), "shelf-5");
});

test("hydration preserves saved layout, removes deleted books, and adds new books safely", () => {
  const initial = createInitialArrangement(books, dimensions);
  const moved = moveObject(initial, "book-d", "shelf-2", 40);
  assert.equal(moved.ok, true);
  const saved = serializeArrangement(moved.scene);
  const updated = hydrateArrangement(
    [...books.filter(book => book.id !== "book-c"), { id: "book-e", shelfX: 600, width: 60, height: 180 }],
    dimensions,
    saved,
  );
  assert.equal(updated.positions["book-d"].shelfId, "shelf-2");
  assert.equal(updated.positions["book-d"].x, 40);
  assert.equal(updated.positions["book-c"], undefined);
  assert.equal(updated.positions["book-e"].x, 600);
  assert.equal(validateArrangement(updated).ok, true);
});

test("duplicate book placements are rejected instead of overwriting one another", () => {
  const scene = createInitialArrangement(books, dimensions);
  const saved = serializeArrangement(scene);
  saved.positions["slot-005"] = { ...saved.positions["slot-001"] };
  assert.throws(() => hydrateArrangement(books, dimensions, saved), /duplicate entries/);
});

test("supported left and right leans work; unsupported lean is rejected atomically", () => {
  const scene = createInitialArrangement(books, dimensions);
  const unsupported = setOrientation(scene, "book-a", "lean-left");
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.scene, scene);
  const left = setOrientation(scene, "book-b", "lean-left");
  assert.equal(left.ok, true, left.reason);
  const upright = setOrientation(scene, "book-b", "upright");
  const right = setOrientation(upright.scene, "book-b", "lean-right");
  assert.equal(right.ok, true, right.reason);
  assert.equal(validateArrangement(right.scene).ok, true);
});

test("cross-shelf stacking supports three books and restores their original positions", () => {
  const scene = createInitialArrangement(books, dimensions);
  const atOtherShelf = moveObject(scene, "book-c", "shelf-2", 80);
  const stacked = buildStack(atOtherShelf.scene, ["book-a", "book-c", "book-d"], {
    shelfId: "shelf-2", x: 420,
  });
  assert.equal(stacked.ok, true, stacked.reason);
  const stackId = stacked.scene.positions["book-a"].stackId;
  assert.equal(stacked.scene.stacks[stackId].bookIds.length, 3);
  assert.ok(sceneObjects(stacked.scene, "shelf-2").some(item => item.id === stackId));
  assert.equal(buildStack(stacked.scene, ["book-b", "book-c", "book-d", "book-a"]).ok, false);
  const separated = separateStack(stacked.scene, stackId);
  assert.equal(separated.ok, true);
  assert.equal(separated.scene.positions["book-a"].shelfId, "shelf-1");
  assert.equal(separated.scene.positions["book-c"].shelfId, "shelf-2");
  assert.equal(separated.scene.positions["book-d"].shelfId, "shelf-1");
});

test("a direct cross-shelf drop onto a book builds a stack without losing source positions", () => {
  const scene = createInitialArrangement(books, dimensions);
  const moved = moveObject(scene, "book-d", "shelf-2", 80);
  const stacked = combineObjects(moved.scene, "book-a", "book-d");
  assert.equal(stacked.ok, true, stacked.reason);
  assert.equal(stacked.scene.positions["book-a"].shelfId, "shelf-2");
  assert.equal(stacked.scene.positions["book-d"].orientation, "horizontal");
  const separated = separateStack(stacked.scene, stacked.scene.positions["book-a"].stackId);
  assert.equal(separated.scene.positions["book-a"].shelfId, "shelf-1");
  assert.equal(separated.scene.positions["book-d"].shelfId, "shelf-2");
});

test("collision and invalid moves are rejected without mutating the saved scene", () => {
  const scene = createInitialArrangement(books, dimensions);
  const collision = moveObject(scene, "book-d", "shelf-1", 30);
  assert.equal(collision.ok, false);
  assert.equal(collision.scene, scene);
  const invalid = moveObject(scene, "book-d", "not-a-shelf", 10);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.scene, scene);
  assert.equal(validateArrangement(scene).ok, true);
});

test("horizontal orientation, shelf placement, and stack membership survive serialization", () => {
  const scene = createInitialArrangement(books, dimensions);
  const horizontal = setOrientation(scene, "book-d", "horizontal");
  assert.equal(horizontal.ok, true, horizontal.reason);
  const saved = serializeArrangement(horizontal.scene);
  const reopened = hydrateArrangement(books, dimensions, saved);
  assert.equal(reopened.positions["book-d"].orientation, "horizontal");
  assert.ok(reopened.positions["book-d"].stackId);
  assert.equal(reopened.stacks[reopened.positions["book-d"].stackId].bookIds[0], "book-d");
  assert.equal(validateArrangement(reopened).ok, true);
});
