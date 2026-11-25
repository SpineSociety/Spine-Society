import assert from "node:assert/strict";
import test from "node:test";
import { availableShelfPosition, resolveShelfLayout } from "../shelf-layout.mjs";

const dimensions = (book) => ({ width: book.width, height: 210 });

test("saved horizontal positions and intentional gaps are preserved", () => {
  const books = [
    { id: "one", shelfX: 0, width: 80 },
    { id: "two", shelfX: 190, width: 60 },
  ];

  const layout = resolveShelfLayout(books, dimensions);
  assert.deepEqual(layout.map(({ x, width }) => ({ x, width })), [
    { x: 0, width: 80 },
    { x: 190, width: 60 },
  ]);
  assert.equal(availableShelfPosition(310, 50, layout), 310);
  assert.deepEqual(books.map(({ shelfX }) => shelfX), [0, 190]);
});
