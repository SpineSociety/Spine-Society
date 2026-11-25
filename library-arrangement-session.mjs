import {
  ARRANGEMENT_VERSION,
  serializeArrangement,
  validateArrangement,
} from "./library-arrangement-model.mjs";

const clone = value => structuredClone(value);

export function createLibraryArrangementSession({ getAuthUid, subscribe, onSnapshot, onReset, onError }) {
  let current = null;
  let subscription = null;
  let saved = null;
  let generation = 0;

  const isCurrent = session => session !== null &&
    current === session && getAuthUid() === session.uid;

  function disconnect() {
    const previous = subscription;
    subscription = null;
    previous?.unsubscribe?.();
  }

  function end() {
    generation += 1;
    current = null;
    saved = null;
    disconnect();
    onReset?.();
  }

  function begin(uid) {
    end();
    if (typeof uid !== "string" || !uid) return null;
    current = Object.freeze({ uid, generation });
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
      saved = snapshot.val() || null;
      onSnapshot?.(saved, session);
    }, error => {
      if (!valid()) return;
      saved = null;
      disconnect();
      onError?.(error, session);
    });
    if (!valid()) handle.unsubscribe?.();
  }

  async function save(session, scene, transact) {
    if (!isCurrent(session)) throw new Error("Arrangement not saved: the signed-in reader changed.");
    const validation = validateArrangement(scene);
    if (!validation.ok) throw new Error(`Arrangement not saved: ${validation.reason}`);
    const candidate = serializeArrangement(scene);
    const currentRevision = Number(saved?.revision) || 0;
    if (candidate.revision !== currentRevision) {
      throw new Error("Arrangement not saved: another device changed this bookshelf. Reload and try again.");
    }
    if (Object.keys(candidate.positions).length > 300) {
      throw new Error("Arrangement not saved: this bookshelf exceeds the supported 300-book arrangement limit.");
    }
    const expectedGeneration = generation;
    const result = await transact(session.uid, existing => {
      if (!isCurrent(session) || generation !== expectedGeneration) return undefined;
      const remoteRevision = Number(existing?.revision) || 0;
      if (remoteRevision !== currentRevision) return undefined;
      return { ...candidate, revision: remoteRevision + 1 };
    }, { applyLocally: false });
    if (!isCurrent(session) || generation !== expectedGeneration) {
      throw new Error("Arrangement not saved: the signed-in reader changed during the save.");
    }
    if (!result?.committed) {
      throw new Error("Arrangement not saved: the saved bookshelf changed elsewhere. Reload and try again.");
    }
    saved = result.snapshot?.val?.() || { ...candidate, revision: currentRevision + 1 };
    onSnapshot?.(saved, session);
    return clone(saved);
  }

  return {
    begin,
    end,
    listen,
    isCurrent,
    save,
    get current() { return current; },
    get saved() { return saved ? clone(saved) : null; },
  };
}
