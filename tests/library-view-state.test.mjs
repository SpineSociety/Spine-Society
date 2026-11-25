import assert from "node:assert/strict";
import test from "node:test";
import { countLibraryBookStatuses, filterLibraryBooks } from "../library-view-state.mjs";

const books = [
  { id: "a", title: "The Glass Garden", author: "Mara Ellery", status: "In Progress" },
  { id: "b", title: "A Quiet Map", author: "R. Vale", status: "Completed" },
  { id: "c", title: "Small Weather", author: "Mara Ellery" },
];

test("collection filters preserve the existing book records and statuses", () => {
  assert.deepEqual(filterLibraryBooks(books, "All").map(({ id }) => id), ["a", "b", "c"]);
  assert.deepEqual(filterLibraryBooks(books, "In Progress").map(({ id }) => id), ["a"]);
  assert.deepEqual(filterLibraryBooks(books, "Completed").map(({ id }) => id), ["b"]);
  assert.deepEqual(filterLibraryBooks(books, "Want to Read").map(({ id }) => id), ["a", "b", "c"]);
});

test("search matches title or author without case sensitivity", () => {
  assert.deepEqual(filterLibraryBooks(books, "All", "  glass  ").map(({ id }) => id), ["a"]);
  assert.deepEqual(filterLibraryBooks(books, "All", "MARA").map(({ id }) => id), ["a", "c"]);
  assert.deepEqual(filterLibraryBooks(books, "Completed", "mara").map(({ id }) => id), []);
});

test("status counts include every collection book exactly once", () => {
  assert.deepEqual(countLibraryBookStatuses(books), {
    All: 3,
    "In Progress": 1,
    Completed: 1,
  });
});
