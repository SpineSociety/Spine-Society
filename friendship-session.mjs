// No Firebase initialization. Session identity, subscriptions and view tokens
// are independent of the personal-library lifecycle.
export function isFriendshipPermissionDenied(error) {
  if (typeof error?.code === "string") {
    return error.code.toLowerCase().replace(/^database\//, "").replaceAll("_", "-") === "permission-denied";
  }
  // Firebase 10.12.2 get() can reject with an ordinary Error, without a code.
  return error instanceof Error &&
    ["Permission denied", "permission_denied"].includes(error.message);
}

export function friendshipDiagnostic(operation, error, acknowledgedSteps = 0) {
  const category = error === "session-ended" ? "session-ended" :
    isFriendshipPermissionDenied(error) ? "permission-denied" : "unexpected";
  // Deliberately exclude message, stack, UID, email, URLs and database values.
  return Object.freeze({
    operation, category,
    acknowledgedSteps,
    partialCompletion: acknowledgedSteps > 0 && acknowledgedSteps < 3
  });
}

export function createFriendshipSession({ getUser, onReset, onUnexpected }) {
  let current = null, epoch = {}, view = null;
  const listeners = new Map();
  const isCurrent = session => {
    const user = getUser();
    return !!session && current === session && user?.uid === session.uid && user.emailVerified === true;
  };
  function unsubscribe(handle) {
    if (!handle.unsubscribed && handle.unsubscribe) {
      handle.unsubscribed = true;
      try { handle.unsubscribe(); }
      catch { onUnexpected("friendship-unsubscribe"); }
    }
  }
  function stop(key) {
    const handle = listeners.get(key);
    if (!handle) return;
    listeners.delete(key); // Invalidate before calling SDK unsubscribe.
    handle.active = false;
    unsubscribe(handle);
  }
  function closeView() {
    view = null;
    stop("profile-status");
  }
  function end() {
    current = null;
    epoch = {};
    closeView();
    for (const key of [...listeners.keys()]) stop(key);
    onReset();
    return epoch;
  }
  function begin(user) {
    end();
    if (user?.uid && user.emailVerified === true) current = Object.freeze({uid:user.uid});
    return current;
  }
  function canRecover(marker, user) {
    return epoch === marker && current === null &&
      user?.uid === getUser()?.uid && user?.emailVerified === true;
  }
  function beginView(uid, session = current) {
    if (!uid || !isCurrent(session)) return null;
    closeView();
    view = Object.freeze({uid, session});
    return view;
  }
  const isViewCurrent = candidate => !!candidate && view === candidate && isCurrent(candidate.session);
  function listen(key, session, subscribe, onSnapshot, onError) {
    if (!isCurrent(session)) return;
    stop(key);
    const handle = {active:true, unsubscribe:null, unsubscribed:false, snapshot:null};
    listeners.set(key, handle);
    const same = () => isCurrent(session) && listeners.get(key) === handle;
    const live = () => same() && handle.active;
    const fail = (error, valid) => {
      try { onError(error, valid); }
      catch { onUnexpected("friendship-error-handler"); }
    };
    try {
      handle.unsubscribe = subscribe(snapshot => {
        if (!live()) return;
        const token = {};
        handle.snapshot = token;
        const valid = () => live() && handle.snapshot === token;
        try {
          Promise.resolve(onSnapshot(snapshot, valid)).catch(error => fail(error, valid));
        } catch (error) { fail(error, valid); }
      }, error => {
        if (!live()) { fail(error, () => false); return; }
        handle.active = false;
        handle.snapshot = null;
        unsubscribe(handle);
        fail(error, same);
      });
    } catch (error) {
      handle.active = false;
      fail(error, same);
    }
    // An initial synchronous callback can end/replace its own subscription.
    if (!live()) unsubscribe(handle);
  }
  return {
    begin, end, isCurrent, canRecover, listen, stop, beginView, closeView, isViewCurrent,
    get current() { return current; }, get view() { return view; }
  };
}
