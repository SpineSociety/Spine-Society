export const ARRANGEMENT_VERSION = 1;
export const ORIENTATIONS = Object.freeze(["upright", "lean-left", "lean-right", "horizontal"]);
export const LEAN_DEGREES = 3;
export const LEAN_SUPPORT_GAP = 9;
export const STACK_GAP = 4;
export const MAX_STACK_BOOKS = 3;
export const INITIAL_BOOKS_PER_SHELF = 12;
export const MAX_SHELVES = 300;
const clone = value => structuredClone(value);
const cloneScene = scene => ({
  ...scene,
  shelves: [...scene.shelves],
  positions: clone(scene.positions),
  stacks: clone(scene.stacks),
  books: [...scene.books],
  dimensions: scene.dimensions,
});

const isFiniteNonNegative = value => Number.isFinite(value) && value >= 0;
const same = (left, right) => Math.abs(left - right) < 0.000001;
const shelfIdFor = index => `shelf-${index}`;
const shelfNumber = id => {
  const match = /^shelf-([1-9]\d{0,2})$/.exec(String(id || ""));
  return match ? Number(match[1]) : 0;
};

function getBook(scene, id) {
  return scene.books.find(book => book.id === id) ?? null;
}

function getSize(scene, id) {
  const book = getBook(scene, id);
  return book ? scene.dimensions(book) : null;
}

function footprint(scene, id) {
  const placement = scene.positions[id];
  const size = getSize(scene, id);
  if (!placement || !size) return null;
  if (placement.orientation === "horizontal") {
    const stack = placement.stackId ? scene.stacks[placement.stackId] : null;
    if (!stack) return null;
    return stackFootprint(scene, stack);
  }
  const degrees = placement.orientation === "lean-left"
    ? -LEAN_DEGREES
    : placement.orientation === "lean-right" ? LEAN_DEGREES : 0;
  const radians = degrees * Math.PI / 180;
  const corners = [
    [-size.width / 2, 0], [size.width / 2, 0],
    [size.width / 2, -size.height], [-size.width / 2, -size.height],
  ].map(([x, y]) => ({
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  }));
  const center = placement.x + size.width / 2;
  const minX = Math.min(...corners.map(point => point.x));
  const maxX = Math.max(...corners.map(point => point.x));
  const minY = Math.min(...corners.map(point => point.y));
  const maxY = Math.max(...corners.map(point => point.y));
  return {
    left: center + minX,
    right: center + maxX,
    top: scene.shelfHeight - maxY + minY,
    bottom: scene.shelfHeight,
    width: maxX - minX,
    height: maxY - minY,
    shelfId: placement.shelfId,
    objectId: id,
    bookIds: [id],
  };
}

function stackFootprint(scene, stack) {
  const sizes = stack.bookIds.map(id => getSize(scene, id));
  if (sizes.some(size => !size)) return null;
  const length = Math.max(...sizes.map(size => size.height));
  const thickness = sizes.reduce((sum, size) => sum + size.width, 0) +
    Math.max(0, sizes.length - 1) * STACK_GAP;
  return {
    left: stack.x,
    right: stack.x + length,
    top: scene.shelfHeight - thickness,
    bottom: scene.shelfHeight,
    width: length,
    height: thickness,
    shelfId: stack.shelfId,
    objectId: stack.id,
    bookIds: [...stack.bookIds],
  };
}

export function createInitialArrangement(books, dimensions) {
  const ordered = [...books];
  if (ordered.length > 300) {
    throw new Error("This bookshelf has more than 300 books; arrange them only after a larger collection format is prepared.");
  }
  const positions = {};
  const shelves = Array.from({
    length: Math.max(1, Math.ceil(ordered.length / INITIAL_BOOKS_PER_SHELF) + 1),
  }, (_, index) => shelfIdFor(index + 1));
  let cursor = 0;
  for (const [index, book] of ordered.entries()) {
    const size = dimensions(book);
    const savedX = book.shelfX;
    const gap = Number(book.shelfGap);
    cursor += Number.isFinite(gap) && gap > 0 ? gap : 0;
    const x = typeof savedX === "number" && isFiniteNonNegative(savedX) ? savedX : cursor;
    positions[book.id] = {
      shelfId: shelves[Math.floor(index / INITIAL_BOOKS_PER_SHELF)] || shelves[0],
      x,
      orientation: "upright",
      stackId: null,
    };
    cursor = Math.max(cursor, x + size.width);
  }
  return {
    schemaVersion: ARRANGEMENT_VERSION,
    revision: 0,
    shelves,
    positions,
    stacks: {},
    books: ordered,
    dimensions,
    shelfWidth: Math.max(520, cursor + 260),
    shelfHeight: 260,
  };
}

export function hydrateArrangement(books, dimensions, saved) {
  if (saved === null || saved === undefined) return createInitialArrangement(books, dimensions);
  if (!saved || typeof saved !== "object" || saved.schemaVersion !== ARRANGEMENT_VERSION ||
      !Number.isInteger(saved.revision) || saved.revision < 0 ||
      !saved.positions || typeof saved.positions !== "object" ||
      Object.keys(saved.positions).length > 300 ||
      (saved.bookSlots !== undefined && (!saved.bookSlots || typeof saved.bookSlots !== "object")) ||
      (saved.stacks !== undefined && (!saved.stacks || typeof saved.stacks !== "object"))) {
    throw new Error("Saved bookshelf arrangement has an unsupported or incomplete format.");
  }
  const currentBooks = [...books];
  if (currentBooks.length > 300) {
    throw new Error("This bookshelf has more than 300 books; saved arrangements were left unchanged.");
  }
  const currentIds = new Set(currentBooks.map(book => book.id));
  const positions = {};
  for (const [key, place] of Object.entries(saved.positions)) {
    const bookId = place?.bookId || key;
    if (!currentIds.has(bookId)) continue;
    if (positions[bookId]) {
      throw new Error("Saved bookshelf arrangement has duplicate entries for one book.");
    }
    if (saved.bookSlots && saved.bookSlots[bookId] !== key) {
      throw new Error("Saved bookshelf arrangement has an inconsistent book index.");
    }
    const { bookId: _bookId, positionSlot: _positionSlot, ...placement } = clone(place);
    positions[bookId] = placement;
  }
  if (saved.bookSlots) {
    for (const [bookId, slot] of Object.entries(saved.bookSlots)) {
      if (currentIds.has(bookId) && saved.positions[slot]?.bookId !== bookId) {
        throw new Error("Saved bookshelf arrangement has an invalid book index.");
      }
    }
  }
  const initialShelves = createInitialArrangement(currentBooks, dimensions).shelves;
  const shelfCount = Math.min(MAX_SHELVES, Math.max(
    initialShelves.length,
    ...Object.values(positions).map(place => shelfNumber(place.shelfId) + 1),
  ));
  const shelves = Array.from({ length: shelfCount }, (_, index) => shelfIdFor(index + 1));
  const stacks = Object.fromEntries(Object.entries(saved.stacks || {}).flatMap(([id, value]) => {
    const savedIds = value?.members
      ? Object.values(value.members).map(member => member?.bookId).filter(Boolean)
      : (Array.isArray(value?.bookIds)
        ? value.bookIds
        : Object.entries(value?.bookIds || {}).filter(([, included]) => included === true).map(([bookId]) => bookId));
    const bookIds = savedIds.filter(bookId =>
      currentIds.has(bookId) && positions[bookId]?.stackId === id);
    if (!bookIds.length) return [];
    const origins = Object.fromEntries(bookIds
      .filter(bookId => positions[bookId]?.origin || value.origins?.[bookId])
      .map(bookId => [bookId, clone(positions[bookId]?.origin || value.origins[bookId])]));
    for (const bookId of bookIds) {
      if (positions[bookId]) delete positions[bookId].origin;
    }
    const { members: _members, ...stackData } = clone(value);
    return [[id, { ...stackData, id, bookIds, origins }]];
  }));
  for (const [id, stack] of Object.entries(stacks)) {
    for (const bookId of stack.bookIds) {
      const place = positions[bookId];
      if (!place) continue;
      place.stackId = id;
      place.shelfId = stack.shelfId;
      place.x = stack.x;
      place.orientation = "horizontal";
    }
  }
  for (const id of Object.keys(positions)) {
    if (positions[id].stackId &&
        (!stacks[positions[id].stackId] || !stacks[positions[id].stackId].bookIds.includes(id))) {
      positions[id] = { ...positions[id], stackId: null, orientation: "upright" };
    }
  }
  let cursor = Math.max(0, ...currentBooks.map(book => {
    const existing = positions[book.id];
    if (existing) return existing.x + (Number(dimensions(book).width) || 0);
    const legacy = book.shelfX;
    return typeof legacy === "number" && isFiniteNonNegative(legacy)
      ? legacy + (Number(dimensions(book).width) || 0)
      : 0;
  }));
  for (const [index, book] of currentBooks.entries()) {
    if (positions[book.id]) continue;
    const size = dimensions(book);
    const legacy = book.shelfX;
    const x = typeof legacy === "number" && isFiniteNonNegative(legacy) ? legacy : cursor;
    positions[book.id] = {
      shelfId: shelves[Math.floor(index / INITIAL_BOOKS_PER_SHELF)] || shelves[0],
      x,
      orientation: "upright",
      stackId: null,
    };
    cursor = Math.max(cursor, x + size.width);
  }
  const scene = {
    schemaVersion: ARRANGEMENT_VERSION,
    revision: saved.revision,
    shelves,
    positions,
    stacks,
    books: currentBooks,
    dimensions,
    shelfWidth: Math.max(520, Number(saved.shelfWidth) || 0,
      ...Object.entries(positions).map(([id, place]) => {
        const size = dimensions(currentBooks.find(book => book.id === id) || {});
        return (Number(place?.x) || 0) + (Number(size.width) || 0) + 260;
      })),
    shelfHeight: 260,
  };
  const result = validateArrangement(scene);
  if (!result.ok) throw new Error(`Saved bookshelf arrangement needs attention: ${result.reason}`);
  return scene;
}

export function serializeArrangement(scene) {
  const positionSlots = new Map();
  let slotIndex = 0;
  for (const book of scene.books) {
    if (!scene.positions[book.id]) continue;
    slotIndex += 1;
    if (slotIndex > 300) throw new Error("This bookshelf can save arrangements for up to 300 books.");
    positionSlots.set(book.id, `slot-${String(slotIndex).padStart(3, "0")}`);
  }
  const positions = Object.fromEntries([...positionSlots.entries()].map(([bookId, slot]) => {
    const place = clone(scene.positions[bookId]);
    const serialized = { bookId, ...place };
    delete serialized.stackId;
    if (place.stackId) {
      serialized.stackId = place.stackId;
      serialized.origin = clone(scene.stacks[place.stackId]?.origins?.[bookId]);
    } else {
      delete serialized.origin;
    }
    return [slot, serialized];
  }));
  const stacks = Object.fromEntries(Object.entries(scene.stacks).map(([id, stack]) => [id, {
    id,
    shelfId: stack.shelfId,
    x: stack.x,
    members: Object.fromEntries(stack.bookIds.map((bookId, index) => [
      `member-${index + 1}`,
      { bookId, positionSlot: positionSlots.get(bookId) },
    ])),
  }]));
  const serialized = {
    schemaVersion: ARRANGEMENT_VERSION,
    revision: scene.revision,
    bookSlots: Object.fromEntries(positionSlots),
    positions,
    shelfWidth: scene.shelfWidth,
  };
  if (Object.keys(stacks).length) serialized.stacks = stacks;
  return serialized;
}

export function sceneObjects(scene, shelfId) {
  const objects = [];
  const usedStacks = new Set();
  for (const book of scene.books) {
    const place = scene.positions[book.id];
    if (!place || place.shelfId !== shelfId) continue;
    if (place.stackId) {
      if (usedStacks.has(place.stackId)) continue;
      usedStacks.add(place.stackId);
      const stack = scene.stacks[place.stackId];
      if (stack) objects.push({ id: stack.id, type: "stack", footprint: stackFootprint(scene, stack), bookIds: [...stack.bookIds] });
      continue;
    }
    objects.push({
      id: book.id,
      type: "book",
      footprint: footprint(scene, book.id),
      bookIds: [book.id],
      orientation: place.orientation,
    });
  }
  return objects.filter(item => item.footprint).sort((a, b) => a.footprint.left - b.footprint.left);
}

function supportedLean(scene, bookId, orientation) {
  const place = scene.positions[bookId];
  const current = footprint(scene, bookId);
  if (!place || !current || !orientation.startsWith("lean-")) return true;
  const books = scene.books.filter(book => book.id !== bookId);
  return books.some(other => {
    const otherPlace = scene.positions[other.id];
    if (!otherPlace || otherPlace.shelfId !== place.shelfId || otherPlace.orientation !== "upright" || otherPlace.stackId) return false;
    const otherBox = footprint(scene, other.id);
    if (!otherBox) return false;
    const gap = orientation === "lean-left" ? current.left - otherBox.right : otherBox.left - current.right;
    const verticalOverlap = Math.max(0, Math.min(current.bottom, otherBox.bottom) - Math.max(current.top, otherBox.top));
    return gap >= -0.5 && gap <= LEAN_SUPPORT_GAP && verticalOverlap >= current.height * 0.65;
  });
}

export function validateArrangement(scene) {
  if (!Array.isArray(scene.shelves) || !scene.shelves.length ||
      scene.shelves.length > MAX_SHELVES || new Set(scene.shelves).size !== scene.shelves.length) {
    return { ok: false, reason: "The shelf list is invalid." };
  }
  const ids = new Set(scene.books.map(book => book.id));
  if (ids.size !== scene.books.length || Object.keys(scene.positions).length !== ids.size ||
      [...ids].some(id => !scene.positions[id])) {
    return { ok: false, reason: "Every book must have exactly one saved placement." };
  }
  for (const [id, place] of Object.entries(scene.positions)) {
    if (!ids.has(id) || !scene.shelves.includes(place.shelfId) || !isFiniteNonNegative(place.x) ||
        !ORIENTATIONS.includes(place.orientation)) return { ok: false, reason: "A book placement is invalid." };
    if (place.orientation === "horizontal" && !place.stackId) return { ok: false, reason: "A horizontal book must belong to a stack." };
    if (place.orientation !== "horizontal" && place.stackId) return { ok: false, reason: "A stacked book has an invalid orientation." };
  }
  const members = new Set();
  for (const [id, stack] of Object.entries(scene.stacks)) {
    if (stack.id !== id || !scene.shelves.includes(stack.shelfId) || !isFiniteNonNegative(stack.x) ||
        !Array.isArray(stack.bookIds) || stack.bookIds.length < 1 || stack.bookIds.length > MAX_STACK_BOOKS ||
        !stack.origins || typeof stack.origins !== "object") return { ok: false, reason: "A stack record is invalid." };
    for (const bookId of stack.bookIds) {
      const place = scene.positions[bookId];
      if (!place || place.stackId !== id || place.orientation !== "horizontal" || members.has(bookId) ||
          !stack.origins[bookId] || !scene.shelves.includes(stack.origins[bookId].shelfId) ||
          !isFiniteNonNegative(stack.origins[bookId].x) ||
          !ORIENTATIONS.includes(stack.origins[bookId].orientation)) {
        return { ok: false, reason: "Stack membership is inconsistent." };
      }
      members.add(bookId);
    }
  }
  if ([...Object.entries(scene.positions)].some(([id, place]) => place.stackId && !scene.stacks[place.stackId]?.bookIds.includes(id))) {
    return { ok: false, reason: "A book refers to a missing stack." };
  }
  for (const shelfId of scene.shelves) {
    const objects = sceneObjects(scene, shelfId);
    for (const object of objects) {
      if (object.footprint.left < -0.5 || object.footprint.right > scene.shelfWidth + 0.5 ||
          object.footprint.top < -0.5 || object.footprint.bottom > scene.shelfHeight + 0.5) {
        return { ok: false, reason: "A book or stack is outside the shelf." };
      }
    }
    for (let i = 0; i < objects.length; i += 1) {
      for (let j = i + 1; j < objects.length; j += 1) {
        const a = objects[i].footprint, b = objects[j].footprint;
        if (a.left < b.right - 0.5 && a.right > b.left + 0.5 &&
            a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) {
          return { ok: false, reason: "Books or stacks would overlap." };
        }
      }
    }
  }
  for (const [id, place] of Object.entries(scene.positions)) {
    if (place.orientation.startsWith("lean-") && !supportedLean(scene, id, place.orientation)) {
      return { ok: false, reason: "A leaning book needs a nearby upright supporting book." };
    }
  }
  return { ok: true, reason: "" };
}

function finish(next, reason, prior) {
  const lastShelf = next.shelves.at(-1);
  if (lastShelf && sceneObjects(next, lastShelf).length && next.shelves.length < MAX_SHELVES) {
    next.shelves.push(shelfIdFor(next.shelves.length + 1));
  }
  next.shelfWidth = Math.max(next.shelfWidth, ...Object.entries(next.positions).map(([id, place]) => {
    const size = getSize(next, id);
    return place.x + (place.orientation === "horizontal" ? (size?.height || 0) : (size?.width || 0)) + 260;
  }));
  const validation = validateArrangement(next);
  return validation.ok
    ? { ok: true, scene: { ...next, revision: prior.revision }, reason }
    : { ok: false, scene: prior, reason: validation.reason };
}

function objectFor(scene, id) {
  const stackId = scene.positions[id]?.stackId;
  if (stackId && scene.stacks[stackId]) return scene.stacks[stackId];
  const place = scene.positions[id];
  const size = getSize(scene, id);
  if (!place || !size) return null;
  return { id, shelfId: place.shelfId, x: place.x, bookIds: [id], footprint: footprint(scene, id) };
}

export function moveObject(scene, objectId, shelfId, x) {
  const object = scene.stacks[objectId] || objectFor(scene, objectId);
  if (!object || !scene.shelves.includes(shelfId) || !isFiniteNonNegative(x)) {
    return { ok: false, scene, reason: "Choose a valid book and shelf position." };
  }
  const next = cloneScene(scene);
  const objectKey = next.stacks[objectId] ? objectId : object.id;
  if (next.stacks[objectKey]) {
    next.stacks[objectKey].shelfId = shelfId;
    next.stacks[objectKey].x = x;
    for (const id of next.stacks[objectKey].bookIds) {
      next.positions[id].shelfId = shelfId;
      next.positions[id].x = x;
    }
  } else {
    next.positions[objectId].shelfId = shelfId;
    next.positions[objectId].x = x;
  }
  return finish(next, "Book arrangement saved.", scene);
}

export function setOrientation(scene, bookId, orientation) {
  if (!ORIENTATIONS.includes(orientation) || !scene.positions[bookId] || scene.positions[bookId].stackId) {
    return { ok: false, scene, reason: "Choose an unstacked book and a valid orientation." };
  }
  if (orientation === "horizontal") {
    const direct = buildStack(scene, [bookId]);
    if (direct.ok) return direct;
    for (const shelfId of scene.shelves) {
      const objects = sceneObjects(scene, shelfId);
      const candidates = [
        scene.positions[bookId].shelfId === shelfId ? scene.positions[bookId].x : null,
        16,
        ...objects.map(object => object.footprint.right + STACK_GAP),
      ].filter((value, index, values) => value !== null && values.indexOf(value) === index);
      for (const x of candidates) {
        const relocated = buildStack(scene, [bookId], { shelfId, x });
        if (relocated.ok) {
          return { ...relocated, reason: "Laid horizontally in open space; other books stayed in place." };
        }
      }
    }
    return direct;
  }
  const next = cloneScene(scene);
  next.positions[bookId].orientation = orientation;
  return finish(next, orientation.startsWith("lean-") ? "Supported lean applied." : "Book stood upright.", scene);
}

export function buildStack(scene, bookIds, destination = null) {
  const unique = [...new Set(bookIds)];
  if (!unique.length || unique.length > MAX_STACK_BOOKS ||
      unique.some(id => !scene.positions[id] || scene.positions[id].stackId)) {
    return { ok: false, scene, reason: "Select one to three unstacked books." };
  }
  const first = scene.positions[unique[0]];
  const shelfId = destination?.shelfId || first.shelfId;
  const x = destination?.x ?? first.x;
  if (!scene.shelves.includes(shelfId) || !isFiniteNonNegative(x)) {
    return { ok: false, scene, reason: "Choose a valid stack destination." };
  }
  const next = cloneScene(scene);
  let sequence = Object.keys(next.stacks).length + 1;
  while (next.stacks[`stack-${sequence}`]) sequence += 1;
  const id = `stack-${sequence}`;
  const origins = Object.fromEntries(unique.map(bookId => [bookId, clone(next.positions[bookId])]));
  const stack = { id, shelfId, x, bookIds: unique, origins };
  next.stacks[id] = stack;
  for (const bookId of unique) {
    next.positions[bookId] = { ...next.positions[bookId], shelfId, x, orientation: "horizontal", stackId: id };
  }
  return finish(next, `Built a ${unique.length}-book horizontal stack.`, scene);
}

export function addBooksToStack(scene, stackId, bookIds) {
  const stack = scene.stacks[stackId];
  const unique = [...new Set(bookIds)];
  if (!stack || !unique.length || unique.some(id => !scene.positions[id] ||
      scene.positions[id].stackId || stack.bookIds.includes(id)) ||
      stack.bookIds.length + unique.length > MAX_STACK_BOOKS) {
    return { ok: false, scene, reason: "That stack cannot accept the selected books." };
  }
  const next = cloneScene(scene);
  const target = next.stacks[stackId];
  for (const bookId of unique) {
    target.origins[bookId] = clone(next.positions[bookId]);
    next.positions[bookId] = { ...next.positions[bookId], shelfId: target.shelfId, x: target.x,
      orientation: "horizontal", stackId };
  }
  target.bookIds.push(...unique);
  return finish(next, `Added books to the ${target.bookIds.length}-book stack.`, scene);
}

export function combineObjects(scene, sourceBookId, targetBookId) {
  const source = scene.positions[sourceBookId];
  const target = scene.positions[targetBookId];
  if (!source || !target || sourceBookId === targetBookId) {
    return { ok: false, scene, reason: "Choose two different books to stack." };
  }
  const sourceStackId = source.stackId;
  const targetStackId = target.stackId;
  if (sourceStackId && sourceStackId === targetStackId) {
    return { ok: false, scene, reason: "Those books are already in the same stack." };
  }
  if (sourceStackId && targetStackId) {
    const from = scene.stacks[sourceStackId];
    const into = scene.stacks[targetStackId];
    if (from.bookIds.length + into.bookIds.length > MAX_STACK_BOOKS) {
      return { ok: false, scene, reason: "A stack can hold no more than three books." };
    }
    const next = cloneScene(scene);
    const destination = next.stacks[targetStackId];
    const moving = next.stacks[sourceStackId];
    destination.bookIds.push(...moving.bookIds);
    Object.assign(destination.origins, moving.origins);
    for (const id of moving.bookIds) {
      next.positions[id] = {
        ...next.positions[id],
        shelfId: destination.shelfId,
        x: destination.x,
        orientation: "horizontal",
        stackId: targetStackId,
      };
    }
    delete next.stacks[sourceStackId];
    return finish(next, `Combined into a ${destination.bookIds.length}-book stack.`, scene);
  }
  if (sourceStackId) return addBooksToStack(scene, sourceStackId, [targetBookId]);
  if (targetStackId) return addBooksToStack(scene, targetStackId, [sourceBookId]);
  return buildStack(scene, [targetBookId, sourceBookId], {
    shelfId: target.shelfId,
    x: target.x,
  });
}

export function separateStack(scene, stackId) {
  const stack = scene.stacks[stackId];
  if (!stack) return { ok: false, scene, reason: "That stack no longer exists." };
  const next = cloneScene(scene);
  delete next.stacks[stackId];
  for (const id of stack.bookIds) next.positions[id] = clone(stack.origins[id]);
  return finish(next, "Stack separated; original positions restored.", scene);
}

export function insertObject(scene, objectId, targetId, before = false) {
  const object = objectFor(scene, objectId);
  const target = objectFor(scene, targetId);
  if (!object || !target || objectId === targetId || object.stackId || target.stackId ||
      object.bookIds.some(id => target.bookIds.includes(id))) {
    return { ok: false, scene, reason: "Choose separate unstacked books to insert." };
  }
  const next = cloneScene(scene);
  const targetPlace = next.positions[targetId];
  const targetSize = getSize(next, targetId);
  const ownSize = getSize(next, objectId);
  const insertionX = targetPlace.x + (before ? -ownSize.width : targetSize.width);
  const sameShelf = next.books
    .filter(book => next.positions[book.id].shelfId === targetPlace.shelfId && book.id !== objectId)
    .sort((a, b) => next.positions[a.id].x - next.positions[b.id].x);
  let cursor = insertionX;
  next.positions[objectId].shelfId = targetPlace.shelfId;
  next.positions[objectId].x = Math.max(0, insertionX);
  for (const book of sameShelf) {
    const place = next.positions[book.id];
    const size = getSize(next, book.id);
    if (place.x >= next.positions[objectId].x && place.x < next.positions[objectId].x + ownSize.width) {
      cursor = next.positions[objectId].x + ownSize.width + 8;
    }
    if (place.x >= cursor) {
      place.x = cursor;
      cursor += size.width + 8;
    }
  }
  next.shelfWidth = Math.max(next.shelfWidth, cursor + 260);
  return finish(next, "Inserted book; affected books shifted to make room.", scene);
}
