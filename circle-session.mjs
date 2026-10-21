// Pure lifecycle management: no Firebase initialization or stored-data cleanup.
export const CIRCLE_SESSION_ENDED = Symbol("circle-session-ended");

export function createCircleSession({
  getUser, onReset = () => {}, onAccountReset = () => {},
  onError = () => {}, onUnexpected = () => {}
}) {
  let current = null, view = null, authorized = false, epoch = {};
  const listeners = new Map();
  const isCurrent = account => !!account && account === current &&
    getUser()?.uid === account.uid && getUser()?.emailVerified === true;
  const isViewCurrent = candidate => !!candidate && candidate === view && isCurrent(candidate.session);
  const isActive = candidate => isViewCurrent(candidate) && authorized;
  const isOwnerCurrent = owner => owner?.session ? isActive(owner) : isCurrent(owner);
  function unsubscribe(handle) {
    if (handle.unsubscribe && !handle.unsubscribed) {
      handle.unsubscribed = true;
      try { handle.unsubscribe(); } catch { onUnexpected("circle-unsubscribe"); }
    }
  }
  function stop(key) {
    const handle = listeners.get(key);
    if (!handle) return;
    listeners.delete(key);
    handle.active = false;
    handle.snapshot = null;
    unsubscribe(handle);
  }
  function closeCircle(candidate) {
    if (candidate && !isViewCurrent(candidate)) return false;
    view = null;
    authorized = false;
    epoch = {};
    for (const [key, handle] of [...listeners]) if (handle.owner.session) stop(key);
    onReset();
    return true;
  }
  function end() {
    current = null;
    closeCircle();
    for (const key of [...listeners.keys()]) stop(key);
    onAccountReset();
    return epoch;
  }
  function begin(user) {
    end();
    if (user?.uid && user.emailVerified === true) current = Object.freeze({uid:user.uid});
    return current;
  }
  function canRecover(marker, user) {
    return current === null && epoch === marker &&
      user?.uid === getUser()?.uid && user?.emailVerified === true;
  }
  function open(clubId) {
    if (!isCurrent(current)) return null;
    closeCircle();
    view = Object.freeze({clubId, session:current});
    return view;
  }
  function authorize(candidate) {
    if (!isViewCurrent(candidate)) return false;
    authorized = true;
    return true;
  }
  function capture({requireCircle = true} = {}) {
    const account = current, candidate = view, marker = epoch;
    if (!isCurrent(account) || (requireCircle && !isActive(candidate))) return null;
    return Object.freeze({
      uid:account.uid, clubId:candidate?.clubId ?? null, user:getUser(), view:candidate,
      valid:() => isCurrent(account) && epoch === marker &&
        (!requireCircle || isActive(candidate))
    });
  }
  function listen(key, owner, subscribe, onSnapshot) {
    if (!isOwnerCurrent(owner)) return;
    stop(key);
    const handle = {owner, active:true, snapshot:null, unsubscribe:null, unsubscribed:false};
    listeners.set(key, handle);
    const same = () => isOwnerCurrent(owner) && listeners.get(key) === handle;
    const live = () => same() && handle.active;
    const fail = (error, valid) => {
      try { onError(error, {owner, key, valid}); }
      catch { onUnexpected("circle-error-handler"); }
    };
    try {
      handle.unsubscribe = subscribe(snapshot => {
        if (!live()) return;
        const token = {};
        handle.snapshot = token;
        const valid = () => live() && handle.snapshot === token;
        try {
          return Promise.resolve(onSnapshot(snapshot, valid)).catch(error => fail(error, valid));
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
    // The initial callback may synchronously invalidate its own subscription.
    if (!live()) unsubscribe(handle);
  }
  return {
    begin, end, canRecover, open, authorize, closeCircle, capture, listen, stop,
    isCurrent, isViewCurrent, isActive,
    get current() { return current; }, get view() { return view; }
  };
}

// Checks both sides of an asynchronous boundary. Already-submitted writes are
// not cancelled; only later work and stale UI completions are suppressed.
export async function circleStep(operation, action) {
  if (!operation?.valid()) throw CIRCLE_SESSION_ENDED;
  const result = await action();
  if (!operation.valid()) throw CIRCLE_SESSION_ENDED;
  return result;
}
