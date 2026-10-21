// Shared, full-size Collection coordinates. Legacy records are read, never repaired.
export function resolveShelfLayout(books, dimensions) {
  let legacyCursor = 0;
  return books.map(book => {
    const size = dimensions(book);
    const gap = Number(book.shelfGap);
    legacyCursor += Number.isFinite(gap) && gap > 0 ? gap : 0;
    const saved = book.shelfX;
    const x = typeof saved === "number" && Number.isFinite(saved) && saved >= 0
      ? saved : legacyCursor;
    legacyCursor += size.width;
    return { id: book.id, book, x, width: size.width, height: Math.max(210, size.height) };
  });
}

export function availableShelfPosition(proposed, width, obstacles, original = 0) {
  const x = Math.max(0, Number.isFinite(proposed) ? proposed : original);
  const free = candidate => candidate >= 0 && obstacles.every(other =>
    candidate + width <= other.x + 0.000001 || candidate >= other.x + other.width - 0.000001);
  if (free(x)) return x;
  const candidates = [0, original, ...obstacles.flatMap(other =>
    [other.x - width, other.x + other.width])].filter(free);
  candidates.sort((a, b) => Math.abs(a - x) - Math.abs(b - x) ||
    Math.abs(a - original) - Math.abs(b - original));
  return candidates[0] ?? original;
}

// Quarantine only the affected presentation; never change stored coordinates.
// Prefer keeping unchanged neighbors on the shelf when a rollback/width edit conflicts.
export function shelfConflicts(items, affected = new Set()) {
  const kept = [], conflicts = new Set();
  for (const item of [...items].sort((a, b) => Number(affected.has(a.id)) - Number(affected.has(b.id)))) {
    if (kept.some(other => item.x < other.x + other.width - 0.000001 &&
      item.x + item.width > other.x + 0.000001)) conflicts.add(item.id);
    else kept.push(item);
  }
  return conflicts;
}
