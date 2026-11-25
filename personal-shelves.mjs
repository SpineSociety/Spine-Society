import {
  addBooksToStack,
  buildStack,
  combineObjects,
  createInitialArrangement,
  hydrateArrangement,
  moveObject,
  sceneObjects,
  separateStack,
  setOrientation,
} from "./library-arrangement-model.mjs";

const SHELF_ROW_HEIGHT = 260;
const clone = value => structuredClone(value);
const isFiniteNonNegative = value => Number.isFinite(value) && value >= 0;

export function createPersonalShelves({
  getBooks,
  getUid,
  getSession = getUid,
  getSavedArrangement = () => null,
  dimensions,
  renderSpine,
  saveArrangement,
}) {
  const views = new Map();
  let owner = getUid();
  let session = getSession();
  let scene = null;
  let sceneSignature = "";
  let notice = "";
  let active = null;
  let selected = new Set();
  let saving = false;
  let disposed = false;

  function checkOwner() {
    if (owner === getUid() && session === getSession()) return;
    cancelDrag();
    owner = getUid();
    session = getSession();
    scene = null;
    sceneSignature = "";
    selected.clear();
    notice = "";
    saving = false;
  }

  function arrangement() {
    checkOwner();
    const books = getBooks();
    const saved = getSavedArrangement();
    const signature = `${owner || ""}:${JSON.stringify(saved || null)}:${books.map(book =>
      `${book.id}:${book.shelfX ?? ""}:${book.shelfGap ?? ""}:${book.lengthCount ?? ""}:${book.lengthType ?? ""}`
    ).join("|")}`;
    if (!scene || signature !== sceneSignature) {
      scene = hydrateArrangement(books, dimensions, saved);
      sceneSignature = signature;
      const liveIds = new Set(books.map(book => book.id));
      selected = new Set([...selected].filter(id => liveIds.has(id)));
    }
    return scene;
  }

  function setScene(next) {
    scene = next;
    const books = getBooks();
    sceneSignature = `${owner || ""}:${JSON.stringify(getSavedArrangement() || null)}:${books.map(book =>
      `${book.id}:${book.shelfX ?? ""}:${book.shelfGap ?? ""}:${book.lengthCount ?? ""}:${book.lengthType ?? ""}`
    ).join("|")}`;
  }

  function status(view, text = notice) {
    if (!view.status.isConnected) return;
    const fallback = view.arranging
      ? "Tap books to select. Hold and drag to move across shelves; use the controls for orientation and stacking."
      : "Swipe to browse. Tap a book to open it.";
    view.status.textContent = saving ? "Saving arrangement…" : (text || fallback);
    view.browse.classList.toggle("is-active", !view.arranging);
    view.browse.setAttribute("aria-pressed", String(!view.arranging));
    view.arrange.classList.toggle("is-active", view.arranging);
    view.arrange.setAttribute("aria-pressed", String(view.arranging));
    view.viewport.classList.toggle("is-arranging", view.arranging);
    view.controls.hidden = !view.arranging;
    for (const node of view.track.querySelectorAll("[data-book-id]")) {
      const isSelected = selected.has(node.dataset.bookId);
      node.classList.toggle("is-selected", isSelected);
      node.setAttribute("aria-pressed", String(isSelected));
      node.tabIndex = 0;
    }
    for (const button of view.controls.querySelectorAll("button")) button.disabled = saving;
  }

  function cancelDrag() {
    if (!active) return;
    clearTimeout(active.timer);
    active.node.classList.remove("is-held", "is-dragging");
    active = null;
  }

  function renderSpineNode(book, dimensionsForBook) {
    const node = document.createElement("div");
    node.className = "personal-shelf-book collection-sortable-book";
    node.dataset.bookId = book.id;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", book.title || "Book");
    node.tabIndex = -1;
    node.style.setProperty("--spine-thickness", `${dimensionsForBook.width}px`);
    node.style.setProperty("--spine-length", `${dimensionsForBook.height}px`);
    const markup = renderSpine(book);
    if (markup instanceof Node) node.append(markup);
    else node.innerHTML = markup;
    return node;
  }

  function shelfIndex(shelfId, currentScene = arrangement()) {
    return Math.max(0, currentScene.shelves.indexOf(shelfId));
  }

  function stackOrder(bookId, currentScene) {
    const stackId = currentScene.positions[bookId]?.stackId;
    if (!stackId) return 0;
    return Math.max(0, currentScene.stacks[stackId]?.bookIds.indexOf(bookId) ?? 0);
  }

  function placementStyles(node, bookId, currentScene, view) {
    const position = currentScene.positions[bookId];
    const book = currentScene.books.find(item => item.id === bookId);
    if (!position || !book) return;
    const size = dimensions(book);
    const horizontal = position.orientation === "horizontal";
    const order = stackOrder(bookId, currentScene);
    const layerOffset = horizontal
      ? currentScene.stacks[position.stackId].bookIds.slice(0, order)
        .reduce((sum, id) => sum + dimensions(currentScene.books.find(item => item.id === id)).width + 4, 0)
      : 0;
    const scale = view.kind === "nook" ? 0.36 : 1;
    const width = (horizontal ? size.height : size.width) * scale;
    const height = (horizontal ? size.width : size.height) * scale;
    node.classList.toggle("is-horizontal", horizontal);
    node.classList.toggle("is-lean-left", position.orientation === "lean-left");
    node.classList.toggle("is-lean-right", position.orientation === "lean-right");
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.left = `${position.x * scale}px`;
    node.style.bottom = `${(shelfIndex(position.shelfId, currentScene) * SHELF_ROW_HEIGHT + layerOffset) * scale}px`;
    node.dataset.shelfId = position.shelfId;
    node.dataset.orientation = position.orientation;
  }

  async function persist(next, successText) {
    if (saving) return false;
    checkOwner();
    const capturedSession = session;
    const capturedUid = owner;
    if (!capturedUid || capturedSession !== getSession()) {
      notice = "Sign in again before saving an arrangement.";
      for (const view of views.values()) status(view);
      return false;
    }
    saving = true;
    for (const view of views.values()) status(view);
    try {
      const saved = await saveArrangement(capturedUid, next, capturedSession);
      if (capturedUid !== getUid() || capturedSession !== getSession()) return false;
      const currentBooks = getBooks();
      scene = hydrateArrangement(currentBooks, dimensions, saved);
      sceneSignature = `${owner || ""}:${JSON.stringify(getSavedArrangement() || null)}:${currentBooks.map(book =>
        `${book.id}:${book.shelfX ?? ""}:${book.shelfGap ?? ""}:${book.lengthCount ?? ""}:${book.lengthType ?? ""}`
      ).join("|")}`;
      notice = successText || "Bookshelf arrangement saved.";
      return true;
    } catch (error) {
      if (capturedUid === getUid() && capturedSession === getSession()) {
        notice = error?.message || "Arrangement could not be saved. Your last saved layout is unchanged.";
      }
      return false;
    } finally {
      if (capturedUid === getUid() && capturedSession === getSession()) {
        saving = false;
        for (const view of views.values()) {
          render(view.host, view.kind, view.visibleBooks, view.options);
        }
      }
    }
  }

  async function apply(result) {
    if (!result.ok) {
      notice = result.reason;
      for (const view of views.values()) status(view);
      return false;
    }
    return persist(result.scene, result.reason);
  }

  function addToolButton(container, label, action, description = label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "personal-shelf-action";
    button.textContent = label;
    button.setAttribute("aria-label", description);
    button.addEventListener("click", action);
    container.append(button);
    return button;
  }

  function selectBook(bookId, view) {
    if (selected.has(bookId)) selected.delete(bookId);
    else if (selected.size < 3) selected.add(bookId);
    else notice = "Select up to three books for one stack.";
    status(view);
  }

  async function handleControl(view, command) {
    const currentScene = arrangement();
    const ids = [...selected];
    if (!ids.length) {
      notice = "Select a book first.";
      status(view);
      return;
    }
    let result;
    if (["upright", "lean-left", "lean-right", "horizontal"].includes(command)) {
      if (ids.length !== 1) {
        notice = "Choose one book to change its orientation.";
        status(view);
        return;
      }
      result = setOrientation(currentScene, ids[0], command);
    } else if (command === "stack") {
      const positions = ids.map(id => currentScene.positions[id]);
      if (positions.some(position => position.stackId)) {
        notice = "Separate existing stacks before building a new one.";
        status(view);
        return;
      }
      const anchor = currentScene.positions[ids.at(-1)];
      result = buildStack(currentScene, ids, { shelfId: anchor.shelfId, x: anchor.x });
    } else if (command === "separate") {
      const stackIds = new Set(ids.map(id => currentScene.positions[id]?.stackId).filter(Boolean));
      if (stackIds.size !== 1) {
        notice = "Select books from one stack to separate it.";
        status(view);
        return;
      }
      result = separateStack(currentScene, [...stackIds][0]);
    }
    if (result) {
      const success = await apply(result);
      if (success) selected.clear();
      status(view);
    }
  }

  function createCollectionView(host) {
    const tools = document.createElement("div");
    tools.className = "personal-shelf-tools";
    const modeGroup = document.createElement("div");
    modeGroup.className = "personal-shelf-mode-group";
    modeGroup.setAttribute("role", "group");
    modeGroup.setAttribute("aria-label", "My Collection mode");
    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "personal-shelf-mode is-active";
    browse.textContent = "Browse";
    browse.setAttribute("aria-pressed", "true");
    const arrange = document.createElement("button");
    arrange.type = "button";
    arrange.className = "personal-shelf-mode";
    arrange.textContent = "Arrange";
    arrange.setAttribute("aria-pressed", "false");
    modeGroup.append(browse, arrange);
    const navigation = document.createElement("div");
    navigation.className = "personal-shelf-navigation";
    for (const [text, amount, label] of [
      ["←", -1, "Scroll bookshelf left"],
      ["→", 1, "Scroll bookshelf right"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "personal-shelf-scroll";
      button.textContent = text;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", () =>
        viewport.scrollBy({ left: amount * Math.max(140, viewport.clientWidth * .7), behavior: "auto" }));
      navigation.append(button);
    }
    const statusNode = document.createElement("p");
    statusNode.className = "personal-shelf-status";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    const controls = document.createElement("div");
    controls.className = "personal-shelf-arrangement-actions";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Selected book arrangement");
    for (const [label, command] of [
      ["Stand upright", "upright"],
      ["Lean left", "lean-left"],
      ["Lean right", "lean-right"],
      ["Lay flat", "horizontal"],
      ["Stack selected", "stack"],
      ["Separate stack", "separate"],
    ]) {
      addToolButton(controls, label, () => void handleControl(view, command));
    }
    const viewport = document.createElement("div");
    viewport.className = "personal-shelf-viewport";
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", "My Collection shelves");
    viewport.tabIndex = 0;
    const track = document.createElement("div");
    track.className = "personal-shelf-track";
    viewport.append(track);
    tools.append(modeGroup, navigation);
    host.replaceChildren(tools, controls, statusNode, viewport);
    host.classList.add("personal-shelf-host");
    const view = { host, kind: "collection", tools, browse, arrange, status: statusNode,
      controls, viewport, track, arranging: false, visibleBooks: [], options: {}, initialScrollSet: false };
    for (const [button, arranging] of [[browse, false], [arrange, true]]) {
      button.addEventListener("click", () => {
        cancelDrag();
        view.arranging = arranging;
        notice = "";
        if (!arranging) selected.clear();
        render(view.host, view.kind, view.visibleBooks, view.options);
      });
    }
    views.set(host, view);
    return view;
  }

  function addShelfRails(track, sceneWidth, shelves) {
    for (let index = 0; index < shelves.length; index += 1) {
      const rail = document.createElement("div");
      rail.className = "personal-shelf-rail";
      rail.setAttribute("aria-hidden", "true");
      rail.style.left = "0";
      rail.style.bottom = `${index * SHELF_ROW_HEIGHT}px`;
      rail.style.width = `${sceneWidth}px`;
      const label = document.createElement("span");
      label.textContent = `${index + 1}`;
      rail.append(label);
      track.append(rail);
    }
  }

  function bindBook(view, node, book) {
    node.addEventListener("click", event => {
      if (view.arranging) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectBook(book.id, view);
      }
    }, true);
    node.addEventListener("keydown", event => {
      if (!view.arranging && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        node.querySelector(".library-book-spine")?.click();
        return;
      }
      if (!view.arranging || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Escape") {
        selected.clear();
        status(view);
        return;
      }
      const currentScene = arrangement();
      const place = currentScene.positions[book.id];
      const index = shelfIndex(place.shelfId, currentScene);
      const nextIndex = event.key === "ArrowUp" ? Math.min(currentScene.shelves.length - 1, index + 1)
        : event.key === "ArrowDown" ? Math.max(0, index - 1) : index;
      const x = place.x + (event.key === "ArrowLeft" ? -24 : event.key === "ArrowRight" ? 24 : 0);
      const next = moveObject(currentScene, book.id, currentScene.shelves[nextIndex], x);
      void apply(next);
    });
    node.addEventListener("pointerdown", event => {
      if (!view.arranging || saving || event.isPrimary === false ||
          (event.button !== undefined && event.button !== 0)) return;
      cancelDrag();
      const rect = node.getBoundingClientRect();
      active = {
        view, node, bookId: book.id, pointerId: event.pointerId,
        originX: event.clientX, originY: event.clientY, clientX: event.clientX, clientY: event.clientY,
        grabX: event.clientX - rect.left, original: arrangement().positions[book.id],
        x: arrangement().positions[book.id].x, shelfId: arrangement().positions[book.id].shelfId,
        held: false, moved: false, timer: null,
      };
      try { node.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture is unavailable for synthetic or interrupted events. */ }
      active.timer = setTimeout(() => {
        if (active?.node !== node) return;
        active.held = true;
        node.classList.add("is-held");
      }, 420);
    });
    node.addEventListener("pointermove", event => {
      if (!active || active.node !== node || active.pointerId !== event.pointerId) return;
      if (!active.held) {
        if (Math.hypot(event.clientX - active.originX, event.clientY - active.originY) > 8) cancelDrag();
        return;
      }
      const rect = view.viewport.getBoundingClientRect();
      const y = event.clientY - rect.top + view.viewport.scrollTop;
      const currentScene = arrangement();
      const row = currentScene.shelves.length - 1 -
        Math.max(0, Math.min(currentScene.shelves.length - 1, Math.floor(y / SHELF_ROW_HEIGHT)));
      active.shelfId = currentScene.shelves[row];
      active.x = Math.max(0, event.clientX - rect.left + view.viewport.scrollLeft - active.grabX);
      active.clientX = event.clientX;
      active.clientY = event.clientY;
      active.moved = true;
      node.classList.add("is-dragging");
      node.style.left = `${active.x}px`;
      node.style.bottom = `${row * SHELF_ROW_HEIGHT}px`;
    });
    node.addEventListener("pointerup", event => {
      if (!active || active.node !== node || active.pointerId !== event.pointerId) return;
      const drag = active;
      cancelDrag();
      if (!drag.held || !drag.moved) return;
      const targetNode = document.elementsFromPoint(event.clientX, event.clientY)
        .map(element => element.closest?.("[data-book-id]"))
        .find(candidate => candidate && candidate !== drag.node && candidate.dataset.bookId !== drag.bookId);
      if (targetNode) {
        const result = combineObjects(arrangement(), drag.bookId, targetNode.dataset.bookId);
        void apply(result);
      } else {
        const result = moveObject(arrangement(), drag.bookId, drag.shelfId, drag.x);
        void apply(result);
      }
    });
    node.addEventListener("pointercancel", () => {
      if (active?.node === node) cancelDrag();
    });
    node.addEventListener("lostpointercapture", () => {
      if (active?.node === node) cancelDrag();
    });
  }

  function renderNook(host, visibleBooks, options) {
    if (!host) return;
    const track = document.createElement("div");
    track.className = "personal-shelf-track";
    track.setAttribute("aria-label", "Miniature shelf");
    const allBooks = getBooks();
    const positions = resolveNookPositions(allBooks, dimensions);
    for (const book of visibleBooks) {
      const position = positions[book.id];
      if (!position) continue;
      const node = document.createElement("div");
      node.className = "personal-shelf-book nook-sortable-book";
      node.dataset.bookId = book.id;
      node.setAttribute("aria-label", book.title || "Book");
      node.style.width = `${Math.max(24, Math.min(34, position.width * .36))}px`;
      node.style.height = `${position.height * .56}px`;
      node.style.flex = "0 0 auto";
      const markup = renderSpine(book);
      if (markup instanceof Node) node.append(markup);
      else node.innerHTML = markup;
      track.append(node);
    }
    host.replaceChildren(track);
    host.classList.add("personal-shelf-host");
  }

  function resolveNookPositions(books, measure) {
    let x = 0;
    const output = {};
    for (const book of books.slice(0, 6)) {
      const size = measure(book);
      output[book.id] = { x, width: size.width, height: size.height };
      x += Math.max(25, Math.min(34, size.width * .36)) + 5;
    }
    return output;
  }

  function renderUnarrangedCollection(host, visibleBooks, options = {}, explanation) {
    const allBooks = getBooks();
    const previousViewport = host.querySelector(".personal-shelf-viewport");
    const previousScroll = previousViewport
      ? { left: previousViewport.scrollLeft, top: previousViewport.scrollTop }
      : null;
    const rowFor = new Map();
    const cursorByRow = new Map();
    let width = 520;
    allBooks.forEach((book, index) => {
      const row = Math.floor(index / 12);
      const size = dimensions(book);
      const cursor = cursorByRow.get(row) || 0;
      const gap = Number(book.shelfGap);
      const x = typeof book.shelfX === "number" && isFiniteNonNegative(book.shelfX)
        ? book.shelfX
        : cursor + (Number.isFinite(gap) && gap > 0 ? gap : 0);
      rowFor.set(book.id, { row, x, size });
      cursorByRow.set(row, Math.max(cursor, x + size.width));
      width = Math.max(width, x + size.width + 260);
    });
    const noticeNode = document.createElement("p");
    noticeNode.className = "personal-shelf-status";
    noticeNode.setAttribute("role", "status");
    noticeNode.setAttribute("aria-live", "polite");
    noticeNode.textContent = explanation ||
      "Arrange mode supports up to 300 books. Browse and search remain available for your full collection.";
    const viewport = document.createElement("div");
    viewport.className = "personal-shelf-viewport";
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", "My Collection shelves");
    viewport.tabIndex = 0;
    const track = document.createElement("div");
    track.className = "personal-shelf-track";
    const rowCount = Math.max(1, Math.ceil(allBooks.length / 12));
    track.style.width = `${width}px`;
    track.style.height = `${rowCount * SHELF_ROW_HEIGHT}px`;
    track.style.minHeight = `${rowCount * SHELF_ROW_HEIGHT}px`;
    viewport.style.height = `${Math.min(rowCount * SHELF_ROW_HEIGHT, 320)}px`;
    addShelfRails(track, width, Array.from({ length: rowCount }, (_, index) => `shelf-${index + 1}`));
    const view = { arranging: false, viewport };
    for (const book of visibleBooks) {
      const placement = rowFor.get(book.id);
      if (!placement) continue;
      const node = renderSpineNode(book, placement.size);
      node.tabIndex = 0;
      node.style.width = `${placement.size.width}px`;
      node.style.height = `${placement.size.height}px`;
      node.style.left = `${placement.x}px`;
      node.style.bottom = `${placement.row * SHELF_ROW_HEIGHT}px`;
      node.dataset.shelfId = `shelf-${placement.row + 1}`;
      node.dataset.orientation = "upright";
      bindBook(view, node, book);
      track.append(node);
    }
    if (!visibleBooks.length) {
      const empty = document.createElement("p");
      empty.className = "status personal-shelf-empty";
      empty.textContent = options.emptyMessage || "Your collection is waiting for its books.";
      track.append(empty);
    }
    viewport.append(track);
    host.replaceChildren(noticeNode, viewport);
    host.classList.add("personal-shelf-host");
    requestAnimationFrame(() => {
      if (!viewport.isConnected) return;
      viewport.scrollLeft = previousScroll?.left || 0;
      viewport.scrollTop = previousScroll
        ? previousScroll.top
        : Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    });
  }

  function render(host, kind, visibleBooks, options = {}) {
    if (!host || disposed) return;
    checkOwner();
    if (kind === "nook") {
      renderNook(host, visibleBooks, options);
      return;
    }
    if (getBooks().length > 300) {
      renderUnarrangedCollection(host, visibleBooks, options);
      return;
    }
    let currentScene;
    try {
      currentScene = arrangement();
    } catch (error) {
      renderUnarrangedCollection(
        host,
        visibleBooks,
        options,
        `Saved arrangement could not be loaded. Browse remains available; the saved copy was not changed. ${error?.message || ""}`.trim(),
      );
      return;
    }
    let view = views.get(host);
    if (!view || !host.contains(view.viewport)) view = createCollectionView(host);
    view.visibleBooks = visibleBooks;
    view.options = options;
    const nodes = [];
    const width = Math.min(20000, Math.max(currentScene.shelfWidth,
      ...Object.values(currentScene.positions).map(place => place.x + 280)));
    view.track.replaceChildren();
    addShelfRails(view.track, width, currentScene.shelves);
    view.track.style.width = `${width}px`;
    view.track.style.height = `${currentScene.shelves.length * SHELF_ROW_HEIGHT}px`;
    view.track.style.minHeight = `${currentScene.shelves.length * SHELF_ROW_HEIGHT}px`;
    view.viewport.style.height = `${Math.min(currentScene.shelves.length * SHELF_ROW_HEIGHT, 320)}px`;
    view.track.setAttribute("aria-label", `${currentScene.shelves.length} personal bookshelves`);
    for (const book of visibleBooks) {
      if (!currentScene.positions[book.id]) continue;
      const node = renderSpineNode(book, dimensions(book));
      placementStyles(node, book.id, currentScene, view);
      bindBook(view, node, book);
      nodes.push(node);
    }
    view.track.append(...nodes);
    if (!visibleBooks.length) {
      const empty = document.createElement("p");
      empty.className = "status personal-shelf-empty";
      empty.textContent = options.emptyMessage || "Your shelf is waiting for its books.";
      view.track.append(empty);
    }
    status(view);
    if (!view.initialScrollSet) {
      view.initialScrollSet = true;
      requestAnimationFrame(() => {
        if (view.viewport.isConnected) {
          view.viewport.scrollTop = Math.max(0, view.viewport.scrollHeight - view.viewport.clientHeight);
        }
      });
    }
  }

  function resetSession() {
    cancelDrag();
    owner = getUid();
    session = getSession();
    scene = null;
    sceneSignature = "";
    selected.clear();
    notice = "";
    saving = false;
    for (const view of views.values()) {
      view.arranging = false;
      view.track.replaceChildren();
      view.viewport.scrollLeft = 0;
      view.viewport.scrollTop = 0;
      view.initialScrollSet = false;
    }
  }

  function dispose() {
    disposed = true;
    resetSession();
    views.clear();
  }

  return { render, cancelDrag, resetSession, dispose };
}
