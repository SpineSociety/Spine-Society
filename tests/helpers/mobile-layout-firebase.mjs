// Local browser-test adapter only. No Firebase SDK or network connection.
const uid = "fictional-mobile-layout-reader";
const count = Number(new URL(location.href).searchParams.get("books") || 3);
const titles = [
  "The Lantern at Fenwick", "A Map of Quiet Rooms", "The Orchard Clock",
  "Letters from Alder House", "The Blue Thread Almanac", "Winter at Bellweather",
];
const library = Object.fromEntries(titles.slice(0, count).map((title, i) => [
  `fictional-book-${i}`,
  { title, author: "Fictional Author", category: "Fiction", status: "In Progress",
    shelfOrder: i, shelfX: i * 78, lengthType: "Pages", lengthCount: 240 + i * 35 },
]));
const records = {
  users: {
    [uid]: {
      username: "FictionalReader", displayName: "Reader", avatar: "📚",
      readerProfile: { biography: "", currentlyReadingBookId: "" },
      library, bookmarks: {}, clubs: {},
    },
  },
};
export const auth = {
  currentUser: { uid, email: "fictional@example.invalid", emailVerified: true },
};
window.__mobileLayoutTest = { uid, count, writes: [], authReady: false };
function valueAt(path) {
  return path.split("/").filter(Boolean).reduce((value, key) => value?.[key], records) ?? null;
}
function snapshot(value) {
  return {
    val: () => value, exists: () => value !== null,
    child: key => snapshot(value?.[key] ?? null),
    forEach: callback => Object.entries(value || {}).some(([key, child]) =>
      callback({ key, ...snapshot(child) }) === true),
  };
}
export const initializeApp = () => ({ localTestOnly: true });
export const getAuth = () => auth;
export class GoogleAuthProvider {}
export const getDatabase = () => ({ localTestOnly: true });
export const ref = (_database, path) => ({ path });
export const get = async reference => snapshot(valueAt(reference.path));
export function onValue(reference, callback) {
  let active = true;
  queueMicrotask(() => { if (active) callback(snapshot(valueAt(reference.path))); });
  return () => { active = false; };
}
export function onAuthStateChanged(_auth, callback) {
  setTimeout(async () => {
    await callback(auth.currentUser);
    window.__mobileLayoutTest.authReady = true;
  }, 50);
  return () => {};
}
export async function update(reference, patch) {
  window.__mobileLayoutTest.writes.push({ path: reference.path, patch });
  // Auth boot only updates its in-memory email/timestamp. No account data is written.
  if (reference.path !== `users/${uid}` ||
      Object.keys(patch).some(key => !["email", "updatedAt"].includes(key))) {
    throw new Error("Unexpected write during layout-only test");
  }
}
export async function signOut() { auth.currentUser = null; }
export const browserLocalPersistence = {};
export const setPersistence = async () => {};
function forbidden() { throw new Error("Mutation/auth action is outside this local layout test"); }
export const set = forbidden;
export const push = forbidden;
export const remove = forbidden;
export const runTransaction = forbidden;
export const createUserWithEmailAndPassword = forbidden;
export const signInWithEmailAndPassword = forbidden;
export const signInWithPopup = forbidden;
export const sendEmailVerification = forbidden;
export const sendPasswordResetEmail = forbidden;
