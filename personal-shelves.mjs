import { resolveShelfLayout, availableShelfPosition, shelfConflicts } from "./shelf-layout.mjs";

// No Firebase dependency: the app injects one narrow save operation.
export function createPersonalShelves({ getBooks, getUid, getSession = getUid, dimensions, renderSpine, savePosition }) {
  const views = new Map();
  const saves = new Map();
  const affected = new Set();
  const observedWidths = new Map();
  let owner = getUid();
  let session = getSession();
  let generation = 0;
  let active = null;
  let notice = "";
  let lastSnapshot = null;

  function resetSession() {
    generation++;
    for (const state of saves.values()) {
      state.invalidated = true;
      state.desired = null;
    }
    cancelDrag();
    owner = getUid();
    session = getSession();
    saves.clear();
    affected.clear();
    observedWidths.clear();
    lastSnapshot = null;
    notice = "";
    for (const view of views.values()) {
      view.arranging = false;
      view.track.replaceChildren();
      view.viewport.scrollLeft = 0;
    }
    refreshPositions();
  }
  function checkOwner() {
    if (owner !== getUid() || session !== getSession()) resetSession();
  }
  function currentSave(id, state) {
    return !state.invalidated && state.generation === generation &&
      owner === state.owner && getUid() === state.owner &&
      session === state.session && getSession() === state.session &&
      saves.get(id) === state;
  }
  function layout() {
    return resolveShelfLayout(getBooks(), dimensions).map(item => {
      const state = saves.get(item.id);
      if (state) item.x = state.remote ?? state.desired ?? state.target ?? state.confirmed;
      if (active?.id === item.id && active.moved) item.x = active.x;
      return item;
    });
  }
  function status(view) {
    const warning = view.conflicts
      ? `${view.conflicts} book${view.conflicts === 1 ? "" : "s"} need attention. Highlighted books are shown separately, not moved or saved. In Arrange, hold one and drag it onto a free space. `
      : "";
    view.status.textContent = warning + (notice || (saves.size && [...saves.values()].some(s => s.running)
      ? "Saving position…" : view.arranging
        ? "Hold a book to move it. Hold near either edge to scroll along the shelf."
        : "Swipe to browse. Tap a book to open it."));
    view.mode.textContent = view.arranging ? "Done" : "Arrange books";
    view.mode.setAttribute("aria-pressed", String(view.arranging));
    view.viewport.classList.toggle("is-arranging", view.arranging);
    view.prev.disabled = view.viewport.scrollLeft <= 0;
    view.next.disabled = view.viewport.scrollLeft >= view.viewport.scrollWidth - view.viewport.clientWidth - 1;
    view.attention.hidden = !view.conflicts;
  }
  function refreshPositions() {
    const positions = new Map(layout().map(item => [item.id, item]));
    const conflicts = shelfConflicts([...positions.values()], affected);
    for (const view of views.values()) {
      if (!view.host.isConnected) continue;
      let right = 0, height = 0, attentionHeight = 0;
      view.conflicts = 0;
      for (const node of view.track.children) {
        const item = positions.get(node.dataset.bookId);
        if (item) height = Math.max(height, item.height * view.scale);
      }
      const baseHeight = Math.max(view.kind === "nook" ? 148 : 230, height + 14);
      for (const node of view.track.children) {
        const item = positions.get(node.dataset.bookId);
        if (!item) continue;
        const conflict = conflicts.has(item.id);
        node.classList.toggle("needs-position-attention", conflict);
        node.dataset.positionConflict = String(conflict);
        node.querySelector(".personal-shelf-attention-label").hidden = !conflict;
        // Separate attention rows are presentation only, not replacement positions.
        node.style.left = `${conflict ? 0 : item.x * view.scale}px`;
        node.style.bottom = `${conflict ? baseHeight + attentionHeight + 24 : 0}px`;
        if (conflict) {
          view.conflicts++;
          attentionHeight += item.height * view.scale + 48;
        }
        node.dataset.shelfX = String(item.x);
        right = Math.max(right, (item.x + item.width) * view.scale);
      }
      view.track.style.width = `${Math.max(view.viewport.clientWidth, right + Math.max(180, view.viewport.clientWidth * 0.75))}px`;
      view.track.style.height = `${baseHeight + attentionHeight}px`;
      view.viewport.style.height = `${baseHeight + attentionHeight + 16}px`;
      status(view);
    }
  }
  function cancelDrag() {
    if (!active) return;
    clearTimeout(active.timer);
    cancelAnimationFrame(active.frame);
    active.node.classList.remove("is-held", "nook-book-held", "collection-book-held");
    active = null;
    refreshPositions();
  }
  async function flush(id, state) {
    state.running = true;
    refreshPositions();
    while (state.desired !== null && currentSave(id, state)) {
      const target = state.desired;
      state.desired = null;
      if (targetPosition(id, target, state.confirmed) !== target) {
        affected.add(id);
        notice = "The shelf changed while saving. This move was not sent. Check the highlighted book and arrange it again.";
        break;
      }
      state.target = target;
      try {
        await savePosition(state.owner, id, target, state.session);
        if (!currentSave(id, state)) return;
        if (state.remote !== null) break;
        state.confirmed = target;
        if (state.desired === null) notice = "Position saved.";
      } catch {
        if (!currentSave(id, state)) return;
        if (state.remote !== null) break;
        affected.add(id);
        notice = state.desired === null
          ? "Position could not be saved. Restored the last saved position. Please try again."
          : "A save failed. Saving your latest position…";
      }
      state.target = null;
      refreshPositions();
    }
    state.target = null;
    state.running = false;
    if (currentSave(id, state)) refreshPositions();
  }
  function commit(id, x, previous) {
    checkOwner();
    if (x === previous || !getUid()) return;
    notice = "";
    let state = saves.get(id);
    if (!state) {
      state = { owner, session, generation, invalidated:false,
        confirmed: previous, desired: null, target: null, running: false, remote:null };
      saves.set(id, state);
    }
    if (state.remote !== null && state.running) {
      notice = "A different position arrived while saving. Wait for this save to finish, then arrange again.";
      refreshPositions();
      return;
    }
    state.remote = null;
    state.desired = x;
    refreshPositions();
    if (!state.running) void flush(id, state);
  }
  function targetPosition(id, proposed, original) {
    const all = layout();
    const item = all.find(value => value.id === id);
    return item ? availableShelfPosition(proposed, item.width, all.filter(value => value.id !== id), original) : original;
  }
  function moveActive() {
    if (!active?.held) return;
    const drag = active;
    const rect = drag.view.viewport.getBoundingClientRect();
    const proposed = drag.attention
      ? (drag.clientX - rect.left - drag.view.viewport.clientLeft + drag.view.viewport.scrollLeft) / drag.view.scale - drag.grab
      : drag.original + (drag.clientX - drag.origin + drag.view.viewport.scrollLeft - drag.scroll) / drag.view.scale;
    drag.x = targetPosition(drag.id, proposed, drag.original);
    drag.moved = true;
    refreshPositions();
  }
  function edgeScroll(time) {
    if (!active?.held) return;
    const drag = active, viewport = drag.view.viewport;
    const rect = viewport.getBoundingClientRect();
    const edge = Math.min(44, rect.width / 5);
    const distance = drag.clientX - rect.left;
    const speed = distance < edge ? -Math.min(1, (edge - distance) / edge) :
      distance > rect.width - edge ? Math.min(1, (distance - rect.width + edge) / edge) : 0;
    const elapsed = Math.min(40, Math.max(0, time - (drag.time ?? time)));
    drag.time = time;
    // Require an intentional movement after the hold; a resting press never scrolls.
    if (drag.moved && speed && elapsed) {
      const before = viewport.scrollLeft;
      viewport.scrollLeft = Math.max(0, before + speed * elapsed * 0.32);
      if (viewport.scrollLeft !== before) moveActive();
    }
    drag.frame = requestAnimationFrame(edgeScroll);
  }
  function bindBook(view, node, item) {
    let browseStart = null;
    let suppressClick = false;
    node.addEventListener("click", event => {
      if (view.arranging || suppressClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
      }
    }, true);
    node.addEventListener("pointerdown", event => {
      if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
      if (!view.arranging) {
        browseStart = event.clientX;
        suppressClick = false;
        return;
      }
      cancelDrag();
      const original = layout().find(value => value.id === item.id)?.x ?? item.x;
      active = { id:item.id, node, view, pointer:event.pointerId, origin:event.clientX,
        clientX:event.clientX, scroll:view.viewport.scrollLeft, original, x:original,
        attention:node.dataset.positionConflict === "true",
        grab:(event.clientX - node.getBoundingClientRect().left) / view.scale,
        held:false, moved:false, timer:null, frame:null, time:null };
      node.setPointerCapture?.(event.pointerId);
      active.timer = setTimeout(() => {
        if (!active || active.node !== node) return;
        active.held = true;
        node.classList.add("is-held", view.kind === "nook" ? "nook-book-held" : "collection-book-held");
        active.frame = requestAnimationFrame(edgeScroll);
      }, 450);
    });
    node.addEventListener("pointermove", event => {
      if (!view.arranging) {
        if (browseStart !== null && Math.abs(event.clientX - browseStart) > 8) suppressClick = true;
        return;
      }
      if (!active || active.node !== node || active.pointer !== event.pointerId) return;
      if (!active.held) {
        if (Math.abs(event.clientX - active.origin) > 8) cancelDrag();
        return;
      }
      active.clientX = event.clientX;
      moveActive();
    });
    node.addEventListener("pointerup", event => {
      browseStart = null;
      if (!active || active.node !== node || active.pointer !== event.pointerId) return;
      const drag = active;
      cancelDrag();
      if (drag.held) {
        suppressClick = true;
        if (drag.moved) commit(drag.id, drag.x, drag.original);
      }
    });
    node.addEventListener("pointercancel", () => {
      browseStart = null;
      suppressClick = true;
      if (active?.node === node) cancelDrag();
    });
    node.addEventListener("lostpointercapture", () => {
      if (active?.node === node) cancelDrag();
    });
  }
  function createView(host, kind) {
    const tools = document.createElement("div");
    tools.className = "personal-shelf-tools";
    const mode = document.createElement("button");
    mode.type = "button";
    mode.className = "personal-shelf-mode";
    const navigation = document.createElement("div");
    navigation.className = "personal-shelf-navigation";
    const prev = document.createElement("button"), next = document.createElement("button");
    for (const [button, text, label, cls] of [
      [prev, "←", "Scroll shelf left", "personal-shelf-prev"],
      [next, "→", "Scroll shelf right", "personal-shelf-next"],
    ]) {
      button.type = "button"; button.textContent = text; button.className = cls;
      button.setAttribute("aria-label", label);
      navigation.append(button);
    }
    const live = document.createElement("p");
    live.className = "personal-shelf-status";
    live.setAttribute("role", "status");
    const attention = document.createElement("button");
    attention.type = "button";
    attention.className = "personal-shelf-attention";
    attention.textContent = "Show books needing attention";
    attention.hidden = true;
    const viewport = document.createElement("div");
    viewport.className = "personal-shelf-viewport";
    viewport.setAttribute("aria-label", kind === "nook" ? "My Nook bookshelf" : "My Collection bookshelf");
    viewport.tabIndex = 0;
    const track = document.createElement("div");
    track.className = "personal-shelf-track";
    viewport.append(track);
    tools.append(mode, navigation);
    host.replaceChildren(tools, live, attention, viewport);
    // Nook's legacy host itself clips overflow; the new inner viewport scrolls.
    host.classList.add("personal-shelf-host");
    const view = { host, kind, scale:kind === "nook" ? 0.68 : 1, tools, mode, status:live,
      viewport, track, prev, next, attention, conflicts:0, arranging:false };
    attention.addEventListener("click", () => {
      cancelDrag();
      view.arranging = true;
      viewport.scrollLeft = 0;
      refreshPositions();
      track.querySelector(".needs-position-attention")?.scrollIntoView({block:"nearest", inline:"nearest"});
    });
    mode.addEventListener("click", () => {
      cancelDrag();
      view.arranging = !view.arranging;
      notice = "";
      for (const child of track.children) child.tabIndex = view.arranging ? 0 : -1;
      refreshPositions();
    });
    for (const [button, direction] of [[prev, -1], [next, 1]]) {
      button.addEventListener("click", () => {
        cancelDrag();
        viewport.scrollBy({left:direction * Math.max(120, viewport.clientWidth * 0.7), behavior:"auto"});
        status(view);
      });
    }
    viewport.addEventListener("scroll", () => status(view), {passive:true});
    views.set(host, view);
    if (typeof ResizeObserver !== "undefined") {
      let lastWidth = -1;
      const observer = new ResizeObserver(entries => {
        if (!host.isConnected) { observer.disconnect(); return; }
        const width = entries[0].contentRect.width;
        // Ignore our own height changes; defer width-driven layout outside delivery.
        if (Math.abs(width - lastWidth) > 0.5) {
          lastWidth = width;
          requestAnimationFrame(refreshPositions);
        }
      });
      observer.observe(viewport);
      view.observer = observer;
    }
    return view;
  }
  function render(host, kind, visibleBooks) {
    if (!host) return;
    checkOwner();
    if (active) cancelDrag();
    const snapshotChanged = getBooks() !== lastSnapshot;
    lastSnapshot = getBooks();
    const incoming = resolveShelfLayout(getBooks(), dimensions);
    for (const item of incoming) {
      const width = observedWidths.get(item.id);
      if (width !== undefined && width !== item.width) affected.add(item.id);
      observedWidths.set(item.id, item.width);
    }
    for (const [id, state] of snapshotChanged ? saves : []) {
      const item = incoming.find(item => item.id === id);
      if (!item) { state.desired = null; state.remote = state.confirmed; saves.delete(id); continue; }
      if (!state.running) {
        // A new snapshot is authoritative once no write is pending. In particular,
        // never require it to equal our last local value before accepting it.
        saves.delete(id);
      } else if (![state.confirmed, state.target, state.desired].includes(item.x)) {
        state.remote = item.x;
        state.desired = null;
        affected.add(id);
        notice = "A different position arrived while saving. Queued moves were cancelled; showing the received position. Check again after saving finishes.";
      } else if (state.remote !== null) {
        state.remote = item.x;
      }
    }
    let view = views.get(host);
    if (!view || !host.contains(view.viewport)) view = createView(host, kind);
    const all = new Map(layout().map(item => [item.id, item]));
    const nodes = visibleBooks.map(book => {
      const item = all.get(book.id);
      const node = document.createElement("div");
      node.className = `personal-shelf-book ${kind === "nook" ? "nook-sortable-book" : "collection-sortable-book"}`;
      node.dataset.bookId = book.id;
      node.dataset.shelfGap = String(Number(book.shelfGap) || 0);
      node.tabIndex = view.arranging ? 0 : -1;
      node.setAttribute("aria-label", book.title || "Book");
      node.style.width = `${item.width * view.scale}px`;
      node.style.height = `${item.height * view.scale}px`;
      const spine = renderSpine(book);
      if (spine instanceof Node) node.append(spine);
      else node.innerHTML = spine; // App's existing escaped, URL-validated renderer.
      const label = document.createElement("span");
      label.className = "personal-shelf-attention-label";
      label.textContent = "Needs attention — hold to reposition";
      label.hidden = true;
      node.append(label);
      bindBook(view, node, item);
      return node;
    });
    if (!nodes.length) {
      const empty = document.createElement("p");
      empty.className = "status";
      empty.textContent = "Your shelf is waiting for its books.";
      nodes.push(empty);
    }
    view.track.replaceChildren(...nodes);
    if (!visibleBooks.length) view.arranging = false;
    view.mode.disabled = visibleBooks.length === 0;
    refreshPositions();
  }
  function dispose() {
    resetSession();
    owner = null;
    for (const view of views.values()) view.observer?.disconnect();
    views.clear();
    for (const state of saves.values()) state.desired = null;
    saves.clear();
  }
  return { render, cancelDrag, resetSession, dispose };
}
