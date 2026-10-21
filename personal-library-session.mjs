// No Firebase initialization here. All account, subscription and transaction
// operations are injected so lifecycle regressions can run without a database.
export function isExistingPersonalBook(record, id) {
  return record !== null && typeof record === "object" && !Array.isArray(record) &&
    typeof record.title === "string" && record.title.trim().length > 0 &&
    (record.id === undefined || record.id === id);
}

export function createPersonalLibrarySession({ getAuthUid, subscribe, onSnapshot, onReset, onError }) {
  let current = null;
  let subscription = null;
  let records = {};
  const isCurrent = session => session !== null && current === session && getAuthUid() === session.uid;
  function disconnect() {
    const previous = subscription;
    subscription = null;
    previous?.unsubscribe?.();
  }
  function end() {
    current = null; // Invalidate queued callbacks before invoking unsubscribe.
    records = {};
    disconnect();
    onReset();
  }
  function begin(uid) {
    end();
    current = Object.freeze({ uid }); // Object identity distinguishes same-UID re-entry.
    return current;
  }
  function listen(session) {
    if (!isCurrent(session)) return;
    disconnect();
    const handle = { unsubscribe: null };
    subscription = handle;
    const valid = () => isCurrent(session) && subscription === handle;
    handle.unsubscribe = subscribe(session.uid, snapshot => {
      if (!valid()) return;
      records = snapshot.val() || {};
      onSnapshot(snapshot, session);
    }, error => {
      if (!valid()) return;
      records = {};
      disconnect();
      onReset();
      onError?.(error);
    });
    // Also safe for adapters which deliver a synchronous initial callback.
    if (!valid()) handle.unsubscribe?.();
  }
  function hasBook(session, id) {
    return isCurrent(session) && typeof id === "string" &&
      !/[.#$[\]/]/.test(id) && Object.hasOwn(records, id) &&
      isExistingPersonalBook(records[id], id);
  }
  return { begin, end, listen, isCurrent, hasBook, get current() { return current; } };
}

export async function saveExistingPersonalBookPosition({
  session, bookId, shelfX, isCurrent, hasBook, transact
}) {
  if (!isCurrent(session) || !hasBook(session, bookId) ||
      typeof shelfX !== "number" || !Number.isFinite(shelfX) || shelfX < 0) {
    throw new Error("Position not saved: the session or book is no longer available.");
  }
  const result = await transact(session.uid, bookId, record => {
    // Firebase may invoke this repeatedly with newer data. Never recreate a
    // deleted book, and never merge metadata from an old UI snapshot.
    if (!isCurrent(session) || !isExistingPersonalBook(record, bookId)) return undefined;
    return { ...record, shelfX };
  }, { applyLocally: false });
  if (!result.committed) {
    // Initial cache data may also be null; an abort does not prove server deletion.
    throw new Error("Position not saved. Reload the library and try again.");
  }
  return result;
}
