import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  sendEmailVerification,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref as firebaseRef,
  set,
  get,
  push,
  update,
  remove,
  onValue,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { escapeHtml, safeImageUrl } from "./security-utils.mjs";
import { createPersonalShelves } from "./personal-shelves.mjs";
import { createPersonalLibrarySession, saveExistingPersonalBookPosition } from "./personal-library-session.mjs";
import { createFriendshipSession, isFriendshipPermissionDenied, friendshipDiagnostic } from "./friendship-session.mjs";
import { createCircleSession, circleStep, CIRCLE_SESSION_ENDED } from "./circle-session.mjs";
import {
  isVerifiedV2CircleOwner,
  routeCircleDatabasePath
} from "./circle-paths.mjs";
const firebaseConfig = {
  apiKey: "AIzaSyBd88e6kcNUTytSkLy14uQq5-fQti4dawE",
  authDomain: "spine-society-b2a3c.firebaseapp.com",
  databaseURL: "https://spine-society-b2a3c-default-rtdb.firebaseio.com/",
  projectId: "spine-society-b2a3c",
  storageBucket: "spine-society-b2a3c.firebasestorage.app",
  messagingSenderId: "873293049506",
  appId: "1:873293049506:web:11e8406d7d6d38bfb8b1fb",
  measurementId: "G-FPB0PRLR5G"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const database = getDatabase(app);
const storage = getStorage(app);
const ref = (databaseInstance, path) => firebaseRef(
  databaseInstance,
  databaseInstance === database ? routeCircleDatabasePath(path) : path
);
let currentUser = null;
let currentLibraryBooks = [];
let currentBookmarkBooks = [];
let currentLibraryFilter = "All";
let currentCollectionBooks = [];
let currentClubBooks = [];
let currentClubOwner = null;
let currentClubId = null;
let currentMemberAvatarsHTML = "";
let pendingCircleAccessClubId = null;
let circleRequestRows = new Map();
let circleRequestListenerKeys = new Set();
let circleRequestRenderGeneration = 0;
let circleLeaveState = null;
let currentCircleRitualOwner = false;
let currentCircleRitualId = null;
let pendingCircleRitualPublish = null;
let pendingCircleRitualSuggestion = null;
let currentCircleRitualResponses = {};
let currentCircleRitualPrompt = null;
let currentCircleRitualSuggestions = {};
let circleRitualInFlight = null;
let circleRitualListenerState = null;
let bookmarksUnsubscribe = null;
let bookmarksSessionToken = 0;
let avatarCropper = null;
let croppedAvatarDataUrl = "";
const appCreatorEmail = "kokakisan@gmail.com";
const loadingMessages = [
  "Opening Library...",

  "Turning Pages...",

  "Dusting the Shelves...",

  "Finding Your Next Read...",

  "Gathering Your Circle...",

  "Straightening the Bookmarks...",

  "Brewing a Cup of Tea...",

  "Lighting the Reading Lamp...",

  "Uncovering Hidden Stories...",

  "Reshelving Adventures..."
];
function canManageBook(book, type = "library") {
  if (!currentUser) return false;

  if (type === "library") {
    return true;
  }

  return (
    book.addedBy === currentUser.uid ||
    currentClubOwner === currentUser.uid ||
    currentUser.email === appCreatorEmail
  );
}
function clearCircleLeaveStatus() {
  circleLeaveState = null;
  const status = document.getElementById("circleLeaveStatus");
  status?.replaceChildren();
  if (status) status.hidden = true;
}

function clearCircleList() {
  clearCircleLeaveStatus();
  const count = document.getElementById("clubCount");
  const list = document.getElementById("clubList");
  if (count) count.textContent = "";
  if (list) list.replaceChildren();
  pendingCircleAccessClubId = null;
  const accessStatus = document.getElementById("circleAccessStatus");
  if (accessStatus) {
    accessStatus.replaceChildren();
    accessStatus.hidden = true;
  }
  document.getElementById("circleInvitationInbox")?.replaceChildren();
  circleRequestRows = new Map();
  circleRequestListenerKeys = new Set();
  circleRequestRenderGeneration++;
}

function clearCircleDisplays() {
  // Only our own submitted leave may survive its expected access revocation.
  // Every other circle/account reset invalidates both retries and late UI work.
  if (!circleLeaveState?.closingOwnView) clearCircleLeaveStatus();
  currentClubBooks = [];
  currentCollectionBooks = [];
  currentClubOwner = null;
  currentCircleRitualOwner = false;
  clearCircleRitualUI();
  currentMemberAvatarsHTML = "";
  circleRequestRows = new Map();
  circleRequestListenerKeys = new Set();
  circleRequestRenderGeneration++;
  window.currentClubId = null;
  window.currentClubName = null;
  window.currentNextRead = null;
  window.currentClubMemberCount = 0;
  window.lastPick = null;
  // Clear every circle surface, including off-screen panels and modal copies.
  for (const id of [
    "clubHero", "clubCollectionGrid", "nextReadArea", "booksReadList", "booksReadCount",
    "discussionList", "discussionListClub", "clubMemberPreview", "membersModalList",
    "memberList", "memberCheckinsList", "modalCheckinsPreview", "featuredReaderRow",
    "featuredReaderCount", "finishedBookModalContent", "finishedBookReviewsList",
    "finishedBookRatingSummary", "nookNextRead", "nookCurrentShelf",
    "randomizerBooksClub", "winnerClub", "marginaliaBookTitle", "marginaliaBookAuthor",
    "readingGoalDisplay", "readingDueDisplay", "readingDueCountdown", "modalGoalDisplay",
    "modalDueDisplay", "modalDueCountdown", "modalClubStatus", "modalClubStatusPercent",
    "clubProgressPercentText", "chapterCountText", "goalProgressPercent", "goalProgressMessage",
    "circleAccessManagement"
  ]) {
    document.getElementById(id)?.replaceChildren();
  }
  const circlePageTitle = document.getElementById("circlePageTitle");
  if (circlePageTitle) circlePageTitle.textContent = "Current Read";
  for (const id of ["discussionInput", "discussionInputClub", "checkInAmount",
    "finishedBookReviewInput", "totalChaptersInput", "modalTotalChaptersInput",
    "goalStartChapter", "goalEndChapter", "goalDueDateInput",
    "bookTitleClub", "bookAuthorClub", "bookImageClub", "bookGenreClub",
    "bookLengthCountClub", "bookSynopsisClub"]) {
    const input = document.getElementById(id);
    if (input) input.value = "";
  }
  let closedModal = false;
  for (const id of ["membersModal", "circleSettingsModal", "readingGoalModal",
    "finishedBookModal", "addCollectionBookModal"]) {
    const modal = document.getElementById(id);
    if (modal?.style.display === "flex") closedModal = true;
    if (modal) modal.style.display = "none";
  }
  // A circle book may also be open in the shared book/edit modal.
  if (typeof bookBeingEditedType !== "undefined" && bookBeingEditedType === "collection") {
    const modal = document.getElementById("editBookModal");
    if (modal) modal.style.display = "none";
    bookBeingEditedId = null;
    bookBeingEditedType = null;
    for (const id of ["editBookTitle", "editBookAuthor", "editBookGenre",
      "editBookLengthCount", "editBookSynopsis", "editBookImage"]) {
      const input = document.getElementById(id);
      if (input) input.value = "";
    }
    closedModal = true;
  }
  const bookModal = document.getElementById("bookModal");
  if (bookModal?.dataset.circleView === "true") {
    bookModal.style.display = "none";
    document.getElementById("bookModalBody")?.replaceChildren();
    delete bookModal.dataset.circleView;
    closedModal = true;
  }
  if (closedModal) document.querySelector(".phone-frame")?.classList.remove("modal-open");
  const spin = document.getElementById("spinButtonClub");
  if (spin) spin.disabled = false;
  const fill = document.getElementById("clubProgressFill");
  if (fill) fill.style.width = "0%";
  const screen = document.getElementById("clubScreen");
  if (screen) screen.classList.remove("active");
}

function circleDiagnostic(operation, error) {
  // Never log raw errors, paths, UIDs, contact details or database values.
  console.error({
    operation,
    category:isFriendshipPermissionDenied(error) ? "permission-denied" : "unexpected"
  });
}

function circleUnavailable(view, error) {
  if (error && !isFriendshipPermissionDenied(error)) circleDiagnostic("circle-access", error);
  if (!circleSession.isViewCurrent(view)) return;
  if (circleLeaveState?.submitted && circleLeaveState.view === view &&
      isCircleLeaveCurrent(circleLeaveState)) {
    closeCircleForLeave(circleLeaveState);
    return;
  }
  circleSession.closeCircle(view);
  circleSession.stop("account-clubs");
  clearCircleList();
  showScreen("nook");
  showToast("This circle is not available to this account.", "error");
}

const circleSession = createCircleSession({
  getUser:() => auth.currentUser,
  onReset:clearCircleDisplays,
  onAccountReset:clearCircleList,
  onUnexpected:operation => circleDiagnostic(operation),
  onError:(error, {owner, key, valid}) => {
    if (!valid()) {
      if (!isFriendshipPermissionDenied(error)) circleDiagnostic("obsolete-circle-listener", error);
      return;
    }
    if (owner.session && recoverCircleRitualRead(error, {owner, key, valid})) return;
    if (owner.session) circleUnavailable(owner, error);
    else {
      clearCircleList();
      if (!isFriendshipPermissionDenied(error)) circleDiagnostic("circle-list", error);
    }
  }
});

function listenCircle(key, clubId, path, onSnapshot) {
  const view = circleSession.view;
  if (!circleSession.isActive(view) || view.clubId !== clubId) return;
  circleSession.listen(key, view,
    (next, fail) => onValue(ref(database, `clubs/${clubId}/${path}`), next, fail),
    onSnapshot);
}

async function runCircleOperation(action, accountOnly = false) {
  const operation = circleSession.capture({requireCircle:!accountOnly});
  if (!operation || currentUser?.uid !== operation.uid) return;
  try {
    return await action(operation);
  } catch (error) {
    if (error === CIRCLE_SESSION_ENDED) return;
    if (!operation.valid()) {
      if (!isFriendshipPermissionDenied(error)) circleDiagnostic("obsolete-circle-operation", error);
      return;
    }
    if (operation.view && !accountOnly) circleUnavailable(operation.view, error);
    else {
      if (!isFriendshipPermissionDenied(error)) circleDiagnostic("circle-operation", error);
      showToast("This circle operation could not be completed.", "error");
    }
  }
}

function showCircleAccessStatus(message, actionLabel = "", action = null) {
  const container = document.getElementById("circleAccessStatus");
  if (!container) return;
  container.replaceChildren();
  if (!message) {
    container.hidden = true;
    return;
  }
  const copy = document.createElement("p");
  copy.textContent = message;
  container.append(copy);
  if (actionLabel && typeof action === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = actionLabel;
    button.addEventListener("click", action);
    container.append(button);
  }
  container.hidden = false;
}

function invitationRecordMatches(actual, expected) {
  return !!actual && actual.clubId === expected.clubId &&
    actual.issuedBy === expected.issuedBy &&
    actual.issuedAt === expected.issuedAt &&
    actual.status === expected.status &&
    Object.keys(actual).length === 4;
}

async function writeCircleStepOrConfirm(operation, path, value, isAcknowledged) {
  try {
    await circleStep(operation, () => set(ref(database, path), value));
    return true;
  } catch (error) {
    if (error === CIRCLE_SESSION_ENDED || !operation.valid()) throw error;
    const snapshot = await circleStep(operation, () => get(ref(database, path)));
    if (isAcknowledged(snapshot.val())) return true;
    throw error;
  }
}
async function writeNewCircleOrConfirm(operation, circleId, value) {
  const rootPath = `readerCirclesV2/${circleId}`;
  try {
    await circleStep(operation, () => set(ref(database, rootPath), value));
    return true;
  } catch (error) {
    if (error === CIRCLE_SESSION_ENDED || !operation.valid()) throw error;
    const [requestSnapshot, ownerSnapshot] = await Promise.all([
      circleStep(operation, () => get(ref(database, `${rootPath}/creationRequestId`))),
      circleStep(operation, () => get(ref(database, `${rootPath}/access/ownerUid`)))
    ]);
    if (requestSnapshot.val() === value.creationRequestId &&
        ownerSnapshot.val() === operation.uid) return true;
    throw error;
  }
}
function escapeHTML(value) {
  return escapeHtml(value);
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll("`", "&#096;");
}

function safeImageSource(value) {
  return safeImageUrl(value, window.location.href);
}

function isEmailShapedUsername(value) {
  return typeof value === "string" &&
    /@.*[.]/u.test(value.trim());
}

function publicDisplayName(value) {
  if (typeof value !== "string") return "Reader";
  const name = value.trim();
  return name && !isEmailShapedUsername(name) ? name : "Reader";
}

async function readPublicProfile(uid) {
  const [usernameSnapshot, avatarSnapshot, photoSnapshot] = await Promise.all([
    get(ref(database, `users/${uid}/username`)).catch(error => {
      // The candidate withholds legacy email-shaped aliases from other readers.
      // Do not treat unexpected failures as missing names.
      if (!isFriendshipPermissionDenied(error)) throw error;
      return { val: () => null };
    }),
    get(ref(database, `users/${uid}/avatar`)),
    get(ref(database, `users/${uid}/avatarPhoto`))
  ]);
  const rawAvatar = avatarSnapshot.val();
  return {
    username: publicDisplayName(usernameSnapshot.val()),
    avatar: typeof rawAvatar === "string" && rawAvatar ? rawAvatar : "",
    avatarPhoto: safeImageSource(photoSnapshot.val()) || ""
  };
}

function escapeInlineJson(value) {
  return escapeHTML(JSON.stringify(value));
}

function reportFriendshipFailure(operation, error, acknowledgedSteps = 0) {
  const diagnostic = friendshipDiagnostic(operation, error, acknowledgedSteps);
  console[diagnostic.category === "unexpected" ? "error" : "warn"](
    "Spine Society friendship", diagnostic
  );
}
function friendshipMessage(container, text) {
  const message = document.createElement("p");
  message.className = "helper";
  message.textContent = text;
  container.replaceChildren(message);
}
function friendshipReadFailure(operation, error, valid, container, text) {
  const current = valid();
  if (current || !isFriendshipPermissionDenied(error)) reportFriendshipFailure(operation, error);
  if (current && container.isConnected) friendshipMessage(container, text);
}
const friendshipSession = createFriendshipSession({
  getUser: () => auth.currentUser,
  onReset: () => {
    for (const id of ["friendsList", "friendRequestsList", "readerProfileContent"]) {
      document.getElementById(id)?.replaceChildren();
    }
    const modal = document.getElementById("readerProfileModal");
    if (modal) modal.style.display = "none";
  },
  onUnexpected: operation => reportFriendshipFailure(operation, new Error("Internal friendship failure"))
});

window.showScreen = showScreen;
function showScreen(screenName) {
  document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(button => button.classList.remove("active"));

  const screen = document.getElementById(screenName + "Screen");
  if (screen) {
    screen.classList.add("active");
  }

  const tab = document.getElementById(screenName + "Tab");
  if (tab) {
    tab.classList.add("active");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.toggleNookCircleForm = function () {
  const form = document.getElementById("nookCircleForm");
  const button = document.getElementById("nookCircleToggle");

  if (!form || !button) return;

  const isOpen = form.classList.toggle("show");

  button.setAttribute("aria-expanded", String(isOpen));

  button.innerHTML = isOpen
    ? "× Close"
    : "＋ Create / Join";
};
window.showClubRoomTab = function (tabName) {
  document.querySelectorAll(".club-room-panel").forEach(panel => {
    panel.classList.remove("active");
  });

  const panel = document.getElementById(tabName + "Panel");

  if (panel) {
    panel.classList.add("active");
  }
};
document.getElementById("nookTab").addEventListener("click", () => showScreen("nook"));
document.getElementById("randomizerTab").addEventListener("click", () => showScreen("randomizer"));
document.getElementById("stacksTab").addEventListener("click", () => showScreen("stacks"));
document.getElementById("reflectionTab").addEventListener("click", () => showScreen("reflection"));
document.getElementById("profileTab").addEventListener("click", () => showScreen("profile"));

window.signUpWithEmail = async function () {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!validateLoginInputs()) return;

  let createdUser = null;

  try {
    await setPersistence(auth, browserLocalPersistence);

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    createdUser = userCredential.user;

    try {
      await sendEmailVerification(createdUser, {
        url: "https://spinesociety.github.io/Spine-Society/",
        handleCodeInApp: false
      });
    } catch (emailError) {
      const resendBtn = document.getElementById("resendVerificationBtn");
      if (resendBtn) resendBtn.style.display = "block";

      let signedOut = false;
      try {
        await signOutWithLibraryCleanup();
        signedOut = true;
      } catch (signOutError) {
        console.error("Could not sign out after verification email failure:", signOutError);
      }

      showToast(
        signedOut
          ? "Your account was created, but the verification email could not be sent. Sign in with the same email and password, then choose Resend Verification Email. Do not create another account."
          : "Your account was created, but the verification email could not be sent. Choose Resend Verification Email below to try again. Do not create another account.",
        "error"
      );
      return;
    }

    await signOutWithLibraryCleanup();

    const authScreen = document.getElementById("authScreen");
    const mainApp = document.getElementById("mainApp");
    const mainNav = document.getElementById("mainNav");

    authScreen.style.display = "block";
    mainApp.style.display = "none";
    mainNav.style.display = "none";

    showToast(
      "Verification email sent. Please check your inbox, then sign in.",
      "success"
    );

    const resendBtn = document.getElementById("resendVerificationBtn");

    if (resendBtn) {
      resendBtn.style.display = "block";
    }
  } catch (error) {
    if (error?.code === "auth/email-already-in-use") {
      const resendBtn = document.getElementById("resendVerificationBtn");
      if (resendBtn) resendBtn.style.display = "block";
      showToast(
        "An account already exists with this email. Sign in and choose Resend Verification Email if it is not verified; no new account was created.",
        "error"
      );
      return;
    }

    if (createdUser && auth.currentUser?.uid === createdUser.uid) {
      try {
        await signOutWithLibraryCleanup();
      } catch (signOutError) {
        console.error("Could not sign out after registration failure:", signOutError);
      }
    }
    showToast(getAuthErrorMessage(error), "error");
  }
};
function validateLoginInputs() {
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const emailWarning = document.getElementById("emailWarning");
  const passwordWarning = document.getElementById("passwordWarning");

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let isValid = true;

  emailInput.classList.remove("input-error", "input-shake");
  passwordInput.classList.remove("input-error", "input-shake");

  emailWarning.textContent = "";
  passwordWarning.textContent = "";

  const emailLooksValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!email) {
    emailWarning.textContent = "Enter your email.";
    emailInput.classList.add("input-error", "input-shake");
    isValid = false;
  } else if (!emailLooksValid) {
    emailWarning.textContent = "Enter a valid email address.";
    emailInput.classList.add("input-error", "input-shake");
    isValid = false;
  }

  if (!password) {
    passwordWarning.textContent = "Enter your password.";
    passwordInput.classList.add("input-error", "input-shake");
    isValid = false;
  } else if (password.length < 6) {
    passwordWarning.textContent = "Password must be at least 6 characters.";
    passwordInput.classList.add("input-error", "input-shake");
    isValid = false;
  }

  setTimeout(() => {
    emailInput.classList.remove("input-shake");
    passwordInput.classList.remove("input-shake");
  }, 320);

  return isValid;
}
function setupLiveLoginValidation() {
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const emailWarning = document.getElementById("emailWarning");
  const passwordWarning = document.getElementById("passwordWarning");

  if (!emailInput || !passwordInput || !emailWarning || !passwordWarning) return;

  emailInput.addEventListener("input", () => {
    const email = emailInput.value.trim();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    emailInput.classList.remove("input-error");
    emailWarning.textContent = "";

    if (email && !emailLooksValid) {
      emailInput.classList.add("input-error");
      emailWarning.textContent = "Enter a valid email address.";
    }
  });

  passwordInput.addEventListener("input", () => {
    const password = passwordInput.value;

    passwordInput.classList.remove("input-error");
    passwordWarning.textContent = "";

    if (password && password.length < 6) {
      passwordInput.classList.add("input-error");
      passwordWarning.textContent = "Password must be at least 6 characters.";
    }
  });
}

setupLiveLoginValidation();

/* ==========================================
   SPINE SOCIETY ENTRANCE
   Keep login inactive until cover is opened
========================================== */

const societyCoverImage =
  document.querySelector(".society-cover-image");

if (societyCoverImage) {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  societyCoverImage.src = isStandalone
    ? "Spine-Society-Cover.png"
    : "spine-society-cover-safari.jpg";
}

const societyEntrance =
  document.getElementById("societyEntrance");

const societyEntranceButton =
  document.getElementById("societyEntranceButton");

const loginEmail =
  document.getElementById("loginEmail");

const loginPassword =
  document.getElementById("loginPassword");


function unlockSpineSocietyLogin() {
  if (loginEmail) {
    loginEmail.disabled = false;
  }

  if (loginPassword) {
    loginPassword.disabled = false;
  }
}


if (societyEntranceButton && societyEntrance) {
  societyEntranceButton.addEventListener("click", () => {

    societyEntranceButton.disabled = true;

    societyEntrance.classList.add("is-opening");

    window.setTimeout(() => {
      unlockSpineSocietyLogin();
      societyEntrance.style.display = "none";
    }, 1150);

  });
}
window.loginWithEmail = async function () {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!validateLoginInputs()) return;

  showLibraryLoader();

  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    hideLibraryLoader();
    showToast(getAuthErrorMessage(error), "error");
  }
};

window.loginWithGoogle = async function () {
  showLibraryLoader();

  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, provider);
  } catch (error) {
    hideLibraryLoader();
    showToast(getAuthErrorMessage(error), "error");
  }
};
window.openForgotPasswordModal = function () {
  const modal = document.getElementById("forgotPasswordModal");
  const loginCard = document.querySelector(".reading-journal-card");

  if (modal) modal.style.display = "flex";
  if (loginCard) loginCard.classList.add("login-card-blur");
};

window.closeForgotPasswordModal = function () {
  const modal = document.getElementById("forgotPasswordModal");
  const loginCard = document.querySelector(".reading-journal-card");

  if (modal) modal.style.display = "none";
  if (loginCard) loginCard.classList.remove("login-card-blur");
};

window.sendPasswordReset = async function () {
  const resetEmail = document.getElementById("resetEmail").value.trim();
  const loginEmail = document.getElementById("loginEmail").value.trim();

  const email = resetEmail || loginEmail;

  if (!email) {
    showToast("Enter your email first.", "error");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email, {
      url: "https://spinesociety.github.io/Spine-Society/",
      handleCodeInApp: false
    });

    showToast("Password reset email sent. Check your inbox.", "success");
    closeForgotPasswordModal();
  } catch (error) {
    showToast(getAuthErrorMessage(error), "error");
  }
};
window.resendVerificationEmail = async function () {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const resendBtn = document.getElementById("resendVerificationBtn");

  if (!validateLoginInputs()) return;

  try {
    await setPersistence(auth, browserLocalPersistence);

    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (userCredential.user.emailVerified) {
      showToast("Your email is already verified. You can sign in.", "success");
      await signOutWithLibraryCleanup();
      return;
    }

    await sendEmailVerification(userCredential.user, {
      url: "https://spinesociety.github.io/Spine-Society/",
      handleCodeInApp: false
    });

    await signOutWithLibraryCleanup();

    showToast("Verification email resent. Please check your inbox.", "success");

    if (resendBtn) {
      resendBtn.disabled = true;
      resendBtn.textContent = "Resend available in 60s";

      setTimeout(() => {
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend Verification Email";
      }, 60000);
    }
  } catch (error) {
    showToast(getAuthErrorMessage(error), "error");
  }
};
window.logoutUser = async function () {
  await signOutWithLibraryCleanup();
};

window.saveUsername = async function () {
  if (!currentUser) return alert("Please log in first.");

  const username = document.getElementById("usernameInput").value.trim();
  if (!username) return alert("Enter a Reader Alias.");
  if (isEmailShapedUsername(username)) {
    return alert("Choose a Reader Alias that is not an email address.");
  }

  await update(ref(database, "users/" + currentUser.uid), {
    username,
    email: currentUser.email || "",
    updatedAt: Date.now()
  });

  document.getElementById("currentUsername").textContent = "Reader Alias: " + username;
  alert("Reader Alias saved.");
};


window.saveAvatar = async function () {
  if (!currentUser) return alert("Please log in first.");

  const avatar = document.getElementById("avatarInput").value;

  await update(ref(database, "users/" + currentUser.uid), {
    avatar,
    updatedAt: Date.now()
  });

  document.getElementById("currentAvatar").textContent =
    "Current Avatar: " + avatar;

  showToast("Avatar saved.");
};
window.saveAvatarPhotoUrl = async function () {
  if (!currentUser) return alert("Please log in first.");

  const photoURL = document.getElementById("avatarPhotoUrl").value.trim();
  const safePhotoURL = safeImageSource(photoURL);

  if (!safePhotoURL) return alert("Enter a valid HTTPS, HTTP, or supported image URL first.");

  await update(ref(database, "users/" + currentUser.uid), {
    avatar: "photo",
    avatarPhoto: safePhotoURL,
    updatedAt: Date.now()
  });

  document.getElementById("currentAvatar").textContent =
    "Current Avatar: Photo";

  const previewImage = document.createElement("img");
  previewImage.src = safePhotoURL;
  previewImage.style.cssText = "width:70px;height:70px;border-radius:50%;object-fit:cover;";
  document.getElementById("avatarPreview").replaceChildren(previewImage);

  alert("Profile photo saved.");
};
async function ensureUserRecord(user) {
  await update(ref(database, "users/" + user.uid), {
    email: user.email || "",
    updatedAt: Date.now()
  });
}

function listenToUserClubs() {
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid) return;
  const uid = user.uid;
  const account = circleSession.current;
  if (!circleSession.isCurrent(account)) return;
  circleSession.listen("account-clubs", account,
    (next, fail) => onValue(ref(database, `users/${uid}/clubs`), next, fail),
    async (snapshot, valid) => {
    const isCurrent = () => valid() && currentUser?.uid === uid;
    const clubIds = Object.keys(snapshot.val() || {});
    const count = document.getElementById("clubCount");
    const list = document.getElementById("clubList");
    if (!count || !list || !isCurrent()) return;

    if (clubIds.length === 0) {
      count.textContent = "0 circles";
      list.innerHTML = `<p class="status">Your shelves are waiting for their first reading circle.</p>`;
      return;
    }

    const cards = [];
    for (const clubId of clubIds) {
      // This per-user index is for discovery only. Confirm canonical membership
      // before reading any circle metadata; a forged index grants no authority.
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(clubId)) continue;
      try {
        const membership = await get(ref(database, `clubs/${clubId}/access/members/${uid}`));
        if (!isCurrent()) return;
        const role = membership.val()?.role;
        if (!membership.exists() || !["owner", "member"].includes(role)) continue;

        const [nameSnapshot, membersSnapshot] = await Promise.all([
          get(ref(database, `clubs/${clubId}/name`)),
          get(ref(database, `clubs/${clubId}/access/members`))
        ]);
        if (!isCurrent()) return;
        if (!nameSnapshot.exists()) continue;
        const memberCount = Object.keys(membersSnapshot.val() || {}).length;
        cards.push(`
          <section
            class="nook-circle-card"
            onclick="openClubRoom(${escapeInlineJson(clubId)})"
            onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); openClubRoom(${escapeInlineJson(clubId)}); }"
            role="button"
            tabindex="0"
          >
            <div class="nook-circle-card-copy">
              <h3>${escapeHTML(nameSnapshot.val())}</h3>
              <div class="nook-circle-card-meta">
                👥 ${memberCount} reader${memberCount === 1 ? "" : "s"}
              </div>
            </div>
            <span class="nook-circle-card-arrow" aria-hidden="true">→</span>
          </section>
        `);
      } catch (error) {
        if (!isFriendshipPermissionDenied(error)) {
          console.error("Circle list read failed.");
        }
      }
      if (!isCurrent()) return;
    }

    if (!isCurrent()) return;
    count.textContent = `${cards.length} circle${cards.length === 1 ? "" : "s"}`;
    list.innerHTML = cards.length
      ? cards.join("")
      : `<p class="status">Your shelves are waiting for their first reading circle.</p>`;
  });
}

window.createClub = async function () {
  return runCircleOperation(async operation => {
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid) {
    return alert("Please sign in with a verified account first.");
  }

  const nameInput = document.getElementById("newClubName");
  const requestedName = nameInput.value.trim();
  const clubsIndex = `users/${operation.uid}/clubs`;
  const pendingSnapshot = await circleStep(operation, () => get(ref(database, clubsIndex)));
  const pendingItems = Object.entries(pendingSnapshot.val() || {}).filter(([id, value]) =>
    /^v2_[A-Za-z0-9_-]{1,124}$/.test(id) &&
    value && typeof value === "object" && value.status === "creating" &&
    typeof value.creationRequestId === "string" && typeof value.name === "string" &&
    typeof value.createdAt === "number"
  );
  if (pendingItems.length > 1) {
    return showToast("More than one circle setup needs recovery. No new circle was created.", "error");
  }

  let clubId;
  let clubName;
  let creationRequestId;
  let createdAt;
  if (pendingItems.length === 1) {
    [clubId] = pendingItems[0];
    const pending = pendingItems[0][1];
    if (requestedName && requestedName !== pending.name) {
      return showToast("A circle setup is already pending. Retry that setup before starting another.", "error");
    }
    ({ creationRequestId, name: clubName, createdAt } = pending);
  } else {
    if (!requestedName) return alert("Enter a circle name.");
    if (requestedName.length > 100) return alert("Circle names must be 100 characters or fewer.");
    clubId = `v2_${push(ref(database, "readerCirclesV2")).key}`;
    creationRequestId = push(ref(database, "readerCirclesV2")).key;
    clubName = requestedName;
    createdAt = Date.now();
    // This is a user-owned navigation/recovery pointer only. It grants no
    // circle access; ownership is established only by the create-only rule.
    await circleStep(operation, () => set(ref(database, `${clubsIndex}/${clubId}`), {
      status: "creating", creationRequestId, name: clubName, createdAt
    }));
  }

  try {
    const circlePath = `readerCirclesV2/${clubId}`;
    const record = {
      schemaVersion: 2,
      name: clubName,
      createdAt,
      creationRequestId,
      authority: { ownerUid: operation.uid, creationRequestId },
      access: {
        ownerUid: operation.uid,
        members: {
          [operation.uid]: { role: "owner", joinedAt: createdAt }
        }
      }
    };
    await writeNewCircleOrConfirm(operation, clubId, record);

    // The index is user-owned navigation data, not the authorization source.
    let indexSaved = true;
    try {
      await circleStep(operation, () => set(ref(database, `${clubsIndex}/${clubId}`), true));
    } catch (error) {
      if (error === CIRCLE_SESSION_ENDED || !operation.valid()) throw error;
      if (!isFriendshipPermissionDenied(error)) circleDiagnostic("circle-index-save", error);
      indexSaved = false;
      showToast("Circle created. Its recovery entry is still available; retry to finish setup.", "error");
    }

    if (auth.currentUser?.uid !== user.uid || currentUser?.uid !== user.uid) return;
    if (indexSaved) nameInput.value = "";
    if (indexSaved) showToast("Circle created.");
    await openClub(clubId);
  } catch (error) {
    throw error;
  }
  }, true);
};
let cropper;

window.openCropper = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!currentUser) return alert("Please log in first.");

  const reader = new FileReader();

  reader.onload = async function(e) {
    const photoData = safeImageSource(e.target.result);
    if (!photoData) {
      alert("Choose a PNG, JPEG, GIF, or WebP image.");
      return;
    }

    await update(ref(database, "users/" + currentUser.uid), {
      avatar: "photo",
      avatarPhoto: photoData,
      updatedAt: Date.now()
    });

    const avatar = document.getElementById("profileAvatar");
    if (avatar) {
      avatar.src = photoData;
      avatar.style.display = "block";
    }

    document.getElementById("currentAvatar").textContent = "Current Avatar: Photo";
    showToast("Avatar photo saved.");
  };

  reader.readAsDataURL(file);
};

window.closeCropModal = function() {
  document.getElementById("cropModal").style.display = "none";

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
};

window.saveCroppedAvatar = async function() {
  if (!currentUser) return alert("Please log in first.");

  if (!cropper) {
    alert("The crop tool is still loading. Wait one second, then tap Save Cropped Avatar again.");
    return;
  }

  const canvas = cropper.getCroppedCanvas({
    width: 300,
    height: 300
  });

  if (!canvas) {
    alert("Crop failed. Try choosing the photo again.");
    return;
  }

  const croppedImage = canvas.toDataURL("image/jpeg", 0.8);

  await update(ref(database, "users/" + currentUser.uid), {
    avatar: "photo",
    avatarPhoto: croppedImage,
    updatedAt: Date.now()
  });

  const avatar = document.getElementById("profileAvatar");
  if (avatar) {
    avatar.src = croppedImage;
    avatar.style.display = "block";
  }

  document.getElementById("currentAvatar").textContent = "Current Avatar: Photo";

  closeCropModal();
  showToast("Cropped avatar saved.");
};


function extractClubId(input) {
  try {
    if (input.includes("?club=")) return new URL(input).searchParams.get("club");
  } catch (error) {}
  return input.replace("?club=", "").trim();
}

window.joinClubFromInput = async function () {
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid) {
    return alert("Please sign in with a verified account first.");
  }

  const input = document.getElementById("joinClubId").value.trim();
  if (!input) return alert("Paste a circle code or invite link.");

  const clubId = extractClubId(input);
  if (typeof clubId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clubId)) {
    return showCircleAccessStatus("That circle code or link is not valid.");
  }
  pendingCircleAccessClubId = clubId;
  const result = await runCircleOperation(async operation => {
    if (operation.uid !== user.uid) return;
    const memberPath = `clubs/${clubId}/access/members/${operation.uid}`;
    const memberSnapshot = await circleStep(operation, () => get(ref(database, memberPath)));
    if (memberSnapshot.exists() &&
        ["owner", "member"].includes(memberSnapshot.val()?.role)) {
      return { open: true };
    }

    const requestPath = `clubs/${clubId}/access/requests/${operation.uid}`;
    const requestSnapshot = await circleStep(operation, () => get(ref(database, requestPath)));
    const request = requestSnapshot.val();
    if (request?.status === "pending") {
      showCircleAccessStatus("Your access request is waiting for the circle owner.");
      return;
    }
    if (request?.status === "approved" && typeof request.invitationId === "string") {
      const invitationPath =
        `circleInvitations/${operation.uid}/${clubId}/${request.invitationId}`;
      const invitationSnapshot = await circleStep(operation, () => get(ref(database, invitationPath)));
      const status = invitationSnapshot.val()?.status;
      if (status === "offered") {
        showCircleAccessStatus("Your request was approved. Accept the invitation in your inbox.");
        return;
      }
      if (status === "accepted") {
        showCircleAccessStatus("Your invitation was accepted. Finish joining from your inbox.");
        return;
      }
      if (status === "consumed") {
        showCircleAccessStatus(
          "This invitation was already used. If you previously left the circle, request access again.",
          "Request Access",
          () => window.requestCircleAccess()
        );
        return;
      }
      if (!["declined", "revoked"].includes(status)) {
        showCircleAccessStatus("The owner approved your request and is preparing the invitation.");
        return;
      }
    } else if (request?.status && request.status !== "denied") {
      showCircleAccessStatus("This circle’s access request is not available right now.");
      return;
    }

    showCircleAccessStatus(
      request?.status === "denied"
        ? "Your previous request was denied. You may submit a new request."
        : "You are not a member of this private circle. You can request access from its owner.",
      "Request Access",
      () => window.requestCircleAccess()
    );
  }, true);

  if (result?.open && auth.currentUser?.uid === user.uid && currentUser?.uid === user.uid) {
    document.getElementById("joinClubId").value = "";
    showCircleAccessStatus("");
    await openClub(clubId);
  }
};

window.requestCircleAccess = async function () {
  const user = auth.currentUser;
  const clubId = pendingCircleAccessClubId;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid) {
    return alert("Please sign in with a verified account first.");
  }
  if (typeof clubId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clubId)) {
    return showCircleAccessStatus("Check a circle code or link before requesting access.");
  }
  await runCircleOperation(async operation => {
    const memberPath = `clubs/${clubId}/access/members/${operation.uid}`;
    const memberSnapshot = await circleStep(operation, () => get(ref(database, memberPath)));
    if (memberSnapshot.exists()) {
      showCircleAccessStatus("You already have a circle membership. Use Check Circle to open it.");
      return;
    }

    const requestPath = `clubs/${clubId}/access/requests/${operation.uid}`;
    const requestSnapshot = await circleStep(operation, () => get(ref(database, requestPath)));
    const previous = requestSnapshot.val();
    if (previous?.status === "pending") {
      showCircleAccessStatus("Your access request is already waiting for the circle owner.");
      return;
    }

    let invitationId;
    if (previous?.status === "approved" && typeof previous.invitationId === "string") {
      invitationId = previous.invitationId;
      const invitationSnapshot = await circleStep(operation, () =>
        get(ref(database, `circleInvitations/${operation.uid}/${clubId}/${invitationId}`)));
      const status = invitationSnapshot.val()?.status;
      if (!["declined", "revoked", "consumed"].includes(status)) {
        showCircleAccessStatus(
          status === "offered"
            ? "An invitation is waiting in your inbox."
            : status === "accepted"
              ? "Your accepted invitation is waiting to finish joining."
              : "The owner approved your request and is preparing the invitation."
        );
        return;
      }
    } else if (previous?.status && previous.status !== "denied") {
      showCircleAccessStatus("This circle’s access request is not available right now.");
      return;
    }

    const requestedAt = Math.max(Date.now(), Number(previous?.requestedAt || 0) + 1);
    const nextRequest = {
      status: "pending",
      requestedAt,
      ...(typeof previous?.invitationId === "string"
        ? { invitationId: previous.invitationId }
        : {})
    };
    await writeCircleStepOrConfirm(
      operation,
      requestPath,
      nextRequest,
      value => value?.status === "pending" &&
        value.requestedAt === requestedAt &&
        value.invitationId === nextRequest.invitationId
    );
    showCircleAccessStatus("Access request sent. The circle owner can now review it.");
  }, true);
};

function circleActionButton(label, handler, className = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function renderCircleRequestPanel() {
  const panel = document.getElementById("circleAccessManagement");
  if (!panel) return;
  panel.replaceChildren();
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true ||
      currentUser?.uid !== user.uid || currentClubOwner !== user.uid) return;

  const heading = document.createElement("h4");
  heading.textContent = "Circle access requests";
  panel.append(heading);
  if (circleRequestRows.size === 0) {
    const empty = document.createElement("p");
    empty.className = "small";
    empty.textContent = "No access requests yet.";
    panel.append(empty);
    return;
  }

  for (const [requesterUid, row] of circleRequestRows) {
    const card = document.createElement("section");
    card.className = "circle-access-card";
    const title = document.createElement("strong");
    title.textContent = row.username || "Reader";
    const details = document.createElement("p");
    details.className = "small";
    card.append(title, details);

    if (row.request.status === "pending") {
      details.textContent = "Waiting for your decision.";
      card.append(
        circleActionButton("Approve & send invitation", () =>
          window.approveCircleAccessRequest(requesterUid)),
        circleActionButton("Deny request", () =>
          window.denyCircleAccessRequest(requesterUid))
      );
    } else {
      const status = row.invitation?.status;
      if (!row.request.invitationId || !row.invitation) {
        details.textContent = "Approved; invitation setup is incomplete.";
        card.append(circleActionButton("Retry invitation", () =>
          window.approveCircleAccessRequest(requesterUid)));
      } else if (status === "offered") {
        details.textContent = "Invitation sent; waiting for the reader to respond.";
      } else if (status === "accepted") {
        details.textContent = "Invitation accepted; membership is being completed.";
      } else if (status === "consumed") {
        details.textContent = row.member?.invitationId === row.request.invitationId &&
          row.member?.role === "member"
          ? "Joined"
          : "This invitation was used. The reader may request access again.";
      } else if (status === "declined") {
        details.textContent = "Invitation declined. The reader may request access again.";
      } else if (status === "revoked") {
        details.textContent = "Invitation revoked. The reader may request access again.";
      } else {
        details.textContent = "Invitation state is unavailable.";
      }
    }
    panel.append(card);
  }
}

function listenToCircleRequests(clubId) {
  const user = auth.currentUser;
  const view = circleSession.view;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid ||
      currentClubOwner !== user.uid || !circleSession.isActive(view) ||
      view.clubId !== clubId) return;

  circleRequestRows = new Map();
  circleRequestListenerKeys = new Set();
  circleSession.listen("access-requests", view,
    (next, fail) => onValue(ref(database, `clubs/${clubId}/access/requests`), next, fail),
    async (snapshot, valid) => {
      const generation = ++circleRequestRenderGeneration;
      const requests = snapshot.val() || {};
      const entries = Object.entries(requests).filter(([uid, value]) =>
        /^[A-Za-z0-9_-]{1,128}$/.test(uid) &&
        value && ["pending", "approved"].includes(value.status)
      );
      const neededInvitationKeys = new Set(entries
        .filter(([, request]) => request.status === "approved" &&
          typeof request.invitationId === "string" &&
          /^[A-Za-z0-9_-]{8,64}$/.test(request.invitationId))
        .map(([uid, request]) =>
          `access-invitation-${uid}-${request.invitationId}`));

      for (const key of circleRequestListenerKeys) {
        if (!neededInvitationKeys.has(key)) circleSession.stop(key);
      }
      circleRequestListenerKeys = new Set(
        [...circleRequestListenerKeys].filter(key => neededInvitationKeys.has(key))
      );
      circleRequestRows = new Map(entries.map(([uid, request]) => [
        uid,
        { request, username: "Reader", invitation: null, member: null }
      ]));

      for (const [requesterUid, request] of entries) {
        if (!valid() || generation !== circleRequestRenderGeneration) return;
        const row = circleRequestRows.get(requesterUid);
        if (request.status === "approved" &&
            typeof request.invitationId === "string" &&
            /^[A-Za-z0-9_-]{8,64}$/.test(request.invitationId)) {
          const invitationKey =
            `access-invitation-${requesterUid}-${request.invitationId}`;
          if (!circleRequestListenerKeys.has(invitationKey)) {
            circleRequestListenerKeys.add(invitationKey);
            circleSession.listen(invitationKey, view,
              (next, fail) => onValue(ref(database,
                `circleInvitations/${requesterUid}/${clubId}/${request.invitationId}`), next, fail),
              async (invitationSnapshot, invitationValid) => {
                if (!invitationValid()) return;
                const currentRow = circleRequestRows.get(requesterUid);
                if (!currentRow ||
                    currentRow.request.invitationId !== request.invitationId) return;
                currentRow.invitation = invitationSnapshot.val();
                if (currentRow.invitation?.status === "consumed") {
                  try {
                    const memberSnapshot = await get(ref(database,
                      `clubs/${clubId}/access/members/${requesterUid}`));
                  if (!invitationValid() || generation !== circleRequestRenderGeneration) return;
                    const latestRow = circleRequestRows.get(requesterUid);
                    if (latestRow?.request.invitationId === request.invitationId) {
                      latestRow.member = memberSnapshot.val();
                    }
                  } catch (error) {
                    if (!isFriendshipPermissionDenied(error)) {
                      circleDiagnostic("circle-request-member-read", error);
                    }
                  }
                }
                if (invitationValid()) renderCircleRequestPanel();
              }
            );
          }
        }

        try {
          const nameSnapshot = await get(ref(database, `users/${requesterUid}/username`));
          if (!valid() || generation !== circleRequestRenderGeneration) return;
          const latestRow = circleRequestRows.get(requesterUid);
          if (latestRow) latestRow.username = publicDisplayName(nameSnapshot.val());
        } catch (error) {
          if (!isFriendshipPermissionDenied(error)) {
            circleDiagnostic("circle-request-profile-read", error);
          }
          if (!valid() || generation !== circleRequestRenderGeneration) return;
          const latestRow = circleRequestRows.get(requesterUid);
          if (latestRow) latestRow.username = "Reader";
        }
      }
      if (valid() && generation === circleRequestRenderGeneration) {
        renderCircleRequestPanel();
      }
    });
}

window.approveCircleAccessRequest = async function (requesterUid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requesterUid || "")) return;
  await runCircleOperation(async operation => {
    const user = auth.currentUser;
    const clubId = operation.clubId;
    if (!user || user.uid !== operation.uid || currentClubOwner !== user.uid) return;
    const requestPath = `clubs/${clubId}/access/requests/${requesterUid}`;
    const requestSnapshot = await circleStep(operation, () => get(ref(database, requestPath)));
    const request = requestSnapshot.val();
    if (!request || !["pending", "approved"].includes(request.status)) {
      showToast("This access request is no longer pending.", "error");
      return;
    }

    try {
    let invitationId = request.invitationId;
    if (request.status === "pending") {
      if (typeof invitationId !== "string" ||
          !/^[A-Za-z0-9_-]{8,64}$/.test(invitationId)) {
        invitationId = "";
      } else {
        const existing = await circleStep(operation, () => get(ref(database,
          `circleInvitations/${requesterUid}/${clubId}/${invitationId}`)));
        if (existing.exists()) invitationId = "";
      }
      if (!invitationId) {
        invitationId = push(ref(database,
          `circleInvitations/${requesterUid}/${clubId}`)).key;
      }
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(invitationId || "")) {
        throw new Error("Unable to create a safe invitation identifier.");
      }
      const idPath = `${requestPath}/invitationId`;
      await writeCircleStepOrConfirm(operation, idPath, invitationId,
        value => value === invitationId);
      await writeCircleStepOrConfirm(operation, `${requestPath}/status`, "approved",
        value => value === "approved");
    } else if (!/^[A-Za-z0-9_-]{8,64}$/.test(invitationId || "")) {
      showToast("The approved request is missing its invitation identifier.", "error");
      return;
    }

    const invitationPath =
      `circleInvitations/${requesterUid}/${clubId}/${invitationId}`;
    const invitationSnapshot = await circleStep(operation, () => get(ref(database, invitationPath)));
    if (invitationSnapshot.exists()) {
      const status = invitationSnapshot.val()?.status;
      if (["offered", "accepted", "consumed", "declined", "revoked"].includes(status)) {
        showToast(status === "offered"
          ? "Invitation sent; the reader can accept it from their inbox."
          : status === "accepted"
            ? "The reader accepted. Their membership is being completed."
            : status === "consumed"
              ? "This invitation has already been used."
              : "This invitation is no longer active.", status === "offered" ? "success" : "error");
        return;
      }
      showToast("An invitation record already exists and was not changed.", "error");
      return;
    }

    const offer = {
      clubId,
      issuedBy: operation.uid,
      issuedAt: Date.now(),
      status: "offered"
    };
    await writeCircleStepOrConfirm(operation, invitationPath, offer,
      value => invitationRecordMatches(value, offer));
    showToast("Invitation sent. The reader must accept it to join.");
    } catch (error) {
      if (error === CIRCLE_SESSION_ENDED || !operation.valid()) return;
      if (!isFriendshipPermissionDenied(error)) {
        circleDiagnostic("circle-invitation-issue", error);
      }
      showToast(
        "The request may be partly approved, but the invitation was not confirmed. Review its current state and retry.",
        "error"
      );
    }
  });
};

window.denyCircleAccessRequest = async function (requesterUid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requesterUid || "")) return;
  await runCircleOperation(async operation => {
    const user = auth.currentUser;
    if (!user || user.uid !== operation.uid || currentClubOwner !== user.uid) return;
    const path = `clubs/${operation.clubId}/access/requests/${requesterUid}`;
    const requestSnapshot = await circleStep(operation, () => get(ref(database, path)));
    if (requestSnapshot.val()?.status === "denied") {
      showToast("This request was already denied.");
      return;
    }
    if (requestSnapshot.val()?.status !== "pending") {
      showToast("Only a pending request can be denied.", "error");
      return;
    }
    await writeCircleStepOrConfirm(operation, `${path}/status`, "denied",
      value => value === "denied");
    showToast("Access request denied.");
  });
};

function listenForCircleInvitations(session = circleSession.current) {
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid ||
      !circleSession.isCurrent(session)) return;
  const uid = user.uid;
  let renderGeneration = 0;
  circleSession.listen("circle-invitations", session,
    (next, fail) => onValue(ref(database, `circleInvitations/${uid}`), next, fail),
    async (snapshot, valid) => {
      const generation = ++renderGeneration;
      const inbox = document.getElementById("circleInvitationInbox");
      if (!inbox || !valid()) return;
      inbox.replaceChildren();
      const groups = snapshot.val() || {};
      const invitations = [];
      for (const [clubId, records] of Object.entries(groups)) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(clubId) || !records || typeof records !== "object") continue;
        for (const [invitationId, invitation] of Object.entries(records)) {
          if (!/^[A-Za-z0-9_-]{8,64}$/.test(invitationId) ||
              invitation?.clubId !== clubId ||
              !["offered", "accepted", "consumed", "declined", "revoked"].includes(invitation.status)) continue;
          invitations.push({ clubId, invitationId, invitation });
        }
      }
      if (invitations.length === 0) return;

      const heading = document.createElement("h3");
      heading.textContent = "Circle invitations";
      inbox.append(heading);
      for (const entry of invitations) {
        if (!valid() || generation !== renderGeneration) return;
        const card = document.createElement("section");
        card.className = "circle-access-card";
        const title = document.createElement("strong");
        title.textContent = "Private reading-circle invitation";
        const details = document.createElement("p");
        details.className = "small";
        details.textContent = `Circle code: ${entry.clubId}`;
        card.append(title, details);
        const invitationPath =
          `circleInvitations/${uid}/${entry.clubId}/${entry.invitationId}`;

        let member = null;
        if (["accepted", "consumed"].includes(entry.invitation.status)) {
          try {
            const memberSnapshot = await get(ref(database,
              `clubs/${entry.clubId}/access/members/${uid}`));
            if (!valid() || generation !== renderGeneration) return;
            member = memberSnapshot.val();
          } catch (error) {
            if (!isFriendshipPermissionDenied(error)) {
              circleDiagnostic("circle-invitation-member-read", error);
            }
          }
        }

        const matchingMember = member?.role === "member" &&
          member?.invitationId === entry.invitationId;
        if (entry.invitation.status === "offered") {
          details.textContent = `Circle code: ${entry.clubId}. Accept to join, or decline this invitation.`;
          card.append(
            circleActionButton("Accept & join", () =>
              window.acceptCircleInvitation(entry.clubId, entry.invitationId)),
            circleActionButton("Decline", () =>
              window.declineCircleInvitation(entry.clubId, entry.invitationId))
          );
        } else if (entry.invitation.status === "accepted" && !matchingMember) {
          details.textContent = `Circle code: ${entry.clubId}. Your acceptance is saved; finish joining.`;
          card.append(circleActionButton("Complete joining", () =>
            window.acceptCircleInvitation(entry.clubId, entry.invitationId)));
        } else if (matchingMember &&
                   ["accepted", "consumed"].includes(entry.invitation.status)) {
          details.textContent = "Joined";
          card.append(circleActionButton("Open circle", () =>
            window.openClubRoom(entry.clubId)));
          if (entry.invitation.status === "accepted") {
            card.append(circleActionButton("Finish invitation", () =>
              window.acceptCircleInvitation(entry.clubId, entry.invitationId)));
          }
        } else if (entry.invitation.status === "consumed") {
          details.textContent = "This invitation was already used and cannot be reused.";
        } else if (entry.invitation.status === "declined") {
          details.textContent = "You declined this invitation.";
        } else {
          details.textContent = "This invitation is no longer active.";
        }
        if (valid() && generation === renderGeneration) inbox.append(card);
      }
    });
}

window.acceptCircleInvitation = async function (clubId, invitationId) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(clubId || "") ||
      !/^[A-Za-z0-9_-]{8,64}$/.test(invitationId || "")) return;
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid) return;
  await runCircleOperation(async operation => {
    const invitationPath =
      `circleInvitations/${operation.uid}/${clubId}/${invitationId}`;
    const requestPath = `clubs/${clubId}/access/requests/${operation.uid}`;
    const memberPath = `clubs/${clubId}/access/members/${operation.uid}`;
    try {
      const invitationSnapshot = await circleStep(operation, () => get(ref(database, invitationPath)));
      let invitation = invitationSnapshot.val();
      if (!invitationSnapshot.exists() || invitation.clubId !== clubId) {
        showCircleAccessStatus("This invitation is not available to this account.");
        return;
      }

      const memberSnapshot = await circleStep(operation, () => get(ref(database, memberPath)));
      let member = memberSnapshot.val();
      if (memberSnapshot.exists() &&
          (member?.role !== "member" || member?.invitationId !== invitationId)) {
        showCircleAccessStatus("An existing membership was not changed by this invitation.");
        return;
      }
      if (!memberSnapshot.exists() &&
          !["offered", "accepted"].includes(invitation.status)) {
        showCircleAccessStatus("This invitation is no longer available to accept.");
        return;
      }

      const requestSnapshot = await circleStep(operation, () => get(ref(database, requestPath)));
      const request = requestSnapshot.val();
      if (request?.status !== "approved" || request?.invitationId !== invitationId) {
        showCircleAccessStatus("The owner’s approval is no longer active.");
        return;
      }

      if (!memberSnapshot.exists() && invitation.status === "offered") {
        await writeCircleStepOrConfirm(operation, `${invitationPath}/status`, "accepted",
          value => value === "accepted");
        invitation = { ...invitation, status: "accepted" };
      }

      if (!memberSnapshot.exists()) {
        const membership = {
          role: "member",
          joinedAt: Date.now(),
          invitationId
        };
        await writeCircleStepOrConfirm(operation, memberPath, membership,
          value => value?.role === "member" && value.invitationId === invitationId);
      }

      const confirmedMember = await circleStep(operation, () => get(ref(database, memberPath)));
      member = confirmedMember.val();
      if (!confirmedMember.exists() || member?.role !== "member" ||
          member?.invitationId !== invitationId) {
        showCircleAccessStatus(
          "Your invitation was accepted, but canonical membership is not confirmed yet. Retry from your inbox."
        );
        return;
      }

      try {
        await writeCircleStepOrConfirm(operation,
          `users/${operation.uid}/clubs/${clubId}`, true, value => value === true);
      } catch (error) {
        if (error === CIRCLE_SESSION_ENDED || !operation.valid()) return;
        showCircleAccessStatus(
          "Membership is confirmed. Adding the circle to your list is incomplete; retry from your inbox."
        );
        if (!isFriendshipPermissionDenied(error)) circleDiagnostic("circle-index-save", error);
        return;
      }

      if (invitation.status !== "consumed") {
        try {
          await writeCircleStepOrConfirm(operation, `${invitationPath}/status`, "consumed",
            value => value === "consumed");
        } catch (error) {
          if (error === CIRCLE_SESSION_ENDED || !operation.valid()) return;
          showCircleAccessStatus(
            "Membership is confirmed. Invitation finalization is incomplete; retry from your inbox."
          );
          if (!isFriendshipPermissionDenied(error)) circleDiagnostic("circle-invitation-consume", error);
          return;
        }
      }
      showCircleAccessStatus("You joined the circle. Open it from your circle list or invitation inbox.");
    } catch (error) {
      if (error === CIRCLE_SESSION_ENDED || !operation.valid()) return;
      if (!isFriendshipPermissionDenied(error)) circleDiagnostic("circle-invitation-accept", error);
      showCircleAccessStatus("The invitation could not be completed. Check its current state and retry.");
    }
  }, true);
};

window.declineCircleInvitation = async function (clubId, invitationId) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(clubId || "") ||
      !/^[A-Za-z0-9_-]{8,64}$/.test(invitationId || "")) return;
  await runCircleOperation(async operation => {
    const path = `circleInvitations/${operation.uid}/${clubId}/${invitationId}`;
    const snapshot = await circleStep(operation, () => get(ref(database, path)));
    if (snapshot.val()?.status === "declined") {
      showCircleAccessStatus("This invitation was already declined.");
      return;
    }
    if (snapshot.val()?.status !== "offered") {
      showCircleAccessStatus("Only an offered invitation can be declined.");
      return;
    }
    await writeCircleStepOrConfirm(operation, `${path}/status`, "declined",
      value => value === "declined");
    showCircleAccessStatus("Invitation declined.");
  }, true);
};

window.openClub = async function (clubId) {
  const user = auth.currentUser;
  let clubName;
  let ownerUid;
  let membershipRole = null;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid ||
      typeof clubId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clubId)) {
    showToast("This circle is not available to this account.", "error");
    return false;
  }
  const view = circleSession.open(clubId);
  if (!view) return false;

  try {
    // Opening is read-only. This self-membership check cannot create membership.
    const membershipSnapshot = await get(
      ref(database, `clubs/${clubId}/access/members/${user.uid}`)
    );
    const membership = membershipSnapshot.val();
    membershipRole = membership?.role || null;
    if (!circleSession.isViewCurrent(view)) return false;
    if (!membershipSnapshot.exists() || !["owner", "member"].includes(membership?.role)) {
      circleUnavailable(view);
      return false;
    }

    const [nameSnapshot, ownerSnapshot] = await Promise.all([
      get(ref(database, `clubs/${clubId}/name`)),
      get(ref(database, `clubs/${clubId}/access/ownerUid`))
    ]);
    if (!circleSession.isViewCurrent(view)) return false;
    if (!nameSnapshot.exists() || !ownerSnapshot.exists()) {
      circleUnavailable(view);
      return false;
    }

    clubName = nameSnapshot.val();
    ownerUid = ownerSnapshot.val();
    window.currentClubId = clubId;
    window.currentClubName = clubName;
    currentClubOwner = ownerUid;
    if (!circleSession.authorize(view)) return false;
  } catch (error) {
    circleUnavailable(view, error);
    return false;
  }

  const showOwnerBadge = isVerifiedV2CircleOwner({
    circleId: clubId,
    uid: user.uid,
    emailVerified: user.emailVerified,
    ownerUid,
    membershipRole
  });
  currentCircleRitualOwner = showOwnerBadge;
  const circlePageTitle = document.getElementById("circlePageTitle");
  if (circlePageTitle) circlePageTitle.innerHTML = `
    <span class="circle-page-name">${escapeHTML(clubName)}</span>
    ${showOwnerBadge ? `
      <span id="circleOwnerBadge" class="circle-owner-badge">
        <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <path d="M2 5.1 6.1 8l2.9-5.2L11.9 8 16 5.1l-1.5 9.2h-11L2 5.1Z"></path>
          <path d="M4 16h10"></path>
        </svg>
        <span>Owner</span>
      </span>
    ` : ""}
  `;
  document.getElementById("clubHero").innerHTML = `
    <div class="club-emblem">📚</div>
    <div>
      <div class="panel-kicker">Current Club</div>
      <h3>${escapeHTML(clubName)}</h3>
      <div class="small" id="clubHeroMemberCount">
  Loading readers...
</div>

<div id="clubMemberPreview" style="
  display:flex;
  align-items:center;
  gap:8px;
  margin-top:12px;
  flex-wrap:wrap;
"></div>

<button
  class="secondary"
  onclick="openMembersModal()"
  style="
    margin-top:12px;
    width:auto;
    padding:10px 16px;
  "
>
  View All Members
</button>
    </div>
  `;


   // Membership is monitored first; a synchronous revocation stops registration.
   listenToMembers(clubId);
    if (ownerUid === user.uid) listenToCircleRequests(clubId);
   listenToCollectionBooks(clubId);
   listenToNextRead(clubId);
   listenToBooksRead(clubId);
   listenToDiscussion(clubId);
   listenToCircleRituals(clubId);
   listenToFeaturedVolumeProgress(clubId);
 if (!circleSession.isActive(view)) return false;
 showScreen("club");
  return true;
};

window.openClubRoom = async function (clubId) {
  const opening = openClub(clubId);
  const view = circleSession.view;
  const opened = await opening;
  if (!opened || !circleSession.isActive(view)) return false;
  showScreen("club");
  showClubRoomTab("current");
  return true;
};

function updateNookNextRead(nextRead) {
  const area = document.getElementById("nookNextRead");
  if (!area) return;
  if (!nextRead) { area.innerHTML = `<p class="status">Your next read will appear here.</p>`; return; }
  const imageUrl = safeImageSource(nextRead.image);
  area.innerHTML = `<div class="nook-pick-card">${imageUrl ? `<img class="nook-pick-cover" src="${escapeAttr(imageUrl)}" alt="Book cover">` : `<div class="nook-pick-placeholder">S</div>`}<div class="nook-pick-info"><h3>${escapeHTML(nextRead.title)}</h3>${nextRead.author ? `<div class="small">by ${escapeHTML(nextRead.author)}</div>` : ""}<div class="book-category">${escapeHTML(nextRead.category || "Uncategorized")}</div></div></div>`;
}
function updateNookShelfPreview() {
  const area = document.getElementById("nookCurrentShelf");
  if (!area) return;
  if (!currentClubBooks || currentClubBooks.length === 0) { area.innerHTML = `<p class="status">No books on this circle yet.</p>`; return; }
  const firstBook = currentClubBooks[0];
  area.innerHTML = `<div class="nook-shelf-spine"><div><div class="item-title">${escapeHTML(firstBook.title)}</div>${firstBook.author ? `<div class="small">by ${escapeHTML(firstBook.author)}</div>` : ""}</div><div class="small">${currentClubBooks.length} book${currentClubBooks.length === 1 ? "" : "s"}</div></div>`;
}
window.jumpToCategory = function (category) { showScreen("randomizer"); setTimeout(() => { const select = document.getElementById("spinCategory"); if (select) select.value = category; }, 100); };
function renderBookRandomizerShelf() {
  const shelf = document.getElementById("randomizerBooks");
  if (!shelf) return;

  if (!currentLibraryBooks || currentLibraryBooks.length === 0) {
    shelf.innerHTML = `<p class="status">Add books to your library first.</p>`;
    return;
  }

  shelf.innerHTML = currentLibraryBooks.slice(0, 6).map(book => `
    <div class="randomizer-spine" id="libraryRandomizerBook-${escapeAttr(book.id)}">
      <div class="randomizer-spine-title">${escapeHTML(book.title)}</div>
      <div class="randomizer-spine-author">${escapeHTML(book.author || "Unknown")}</div>
    </div>
  `).join("");
}

function renderFateDecidesShelf() {
  const clubShelf = document.getElementById("randomizerBooksClub");
  if (!clubShelf) return;

  if (!currentCollectionBooks || currentCollectionBooks.length === 0) {
    clubShelf.innerHTML = `<p class="status">Add books to The Collection first.</p>`;
    return;
  }

  clubShelf.innerHTML = currentCollectionBooks.slice(0, 6).map(book => `
    <div class="randomizer-spine" id="collectionRandomizerBook-${escapeAttr(book.id)}">
      <div class="randomizer-spine-title">${escapeHTML(book.title)}</div>
      <div class="randomizer-spine-author">${escapeHTML(book.author || "Unknown")}</div>
    </div>
  `).join("");
}

function renderClubCollection() {
  const collection = document.getElementById("clubCollectionGrid");
  if (!collection) return;

  if (!currentCollectionBooks || currentCollectionBooks.length === 0) {
    collection.innerHTML = `
      <div class="bookshelf-row">
        <button
          class="library-book-spine add-book-spine"
          onclick="openAddCollectionBookModal()"
        >
          <div>＋</div>
          <div>Add<br>Book</div>
        </button>
      </div>
    `;
    return;
  }

  const circleRows = [];

  for (let i = 0; i < currentCollectionBooks.length; i += 4) {
    const rowBooks = currentCollectionBooks.slice(i, i + 4);

    circleRows.push(`
      <div class="bookshelf-row">
        ${rowBooks.map(book => renderLibrarySpine(book)).join("")}
      </div>
    `);
  }

  collection.innerHTML = `
  <div class="bookshelf-row">
    ${currentCollectionBooks.map(book => renderLibrarySpine(book)).join("")}

    <button
      class="library-book-spine add-book-spine"
      onclick="openAddCollectionBookModal()"
    >
      <div>＋</div>
      <div>Add<br>Book</div>
    </button>
  </div>
`;
}
function renderNookCollection() {
  const shelf = document.getElementById("nookCollectionShelf");
  personalShelves.render(shelf, "nook", currentLibraryBooks.slice(0, 6));
}
let personalLibrarySession = null;
const personalShelves = createPersonalShelves({
  getBooks: () => currentLibraryBooks,
  getUid: () => currentUser?.uid,
  getSession: () => personalLibrarySession?.current ?? null,
  dimensions: getBookSpineDimensions,
  renderSpine: renderLibrarySpine,
  savePosition: (uid, bookId, shelfX, session) =>
    saveExistingPersonalBookPosition({
      session, bookId, shelfX,
      isCurrent: candidate => candidate?.uid === uid && personalLibrarySession.isCurrent(candidate),
      hasBook: personalLibrarySession.hasBook,
      transact: (owner, id, updater, options) =>
        runTransaction(ref(database, `users/${owner}/library/${id}`), updater, options)
    })
});
personalLibrarySession = createPersonalLibrarySession({
  getAuthUid: () => auth.currentUser?.uid,
  subscribe: (uid, callback, onError) =>
    onValue(ref(database, `users/${uid}/library`), callback, onError),
  onReset: () => {
    currentLibraryBooks = [];
    const bookModal = document.getElementById("bookModal");
    if (bookModal && bookModal.dataset.circleView !== "true") {
      bookModal.style.display = "none";
      document.getElementById("bookModalBody")?.replaceChildren();
      delete bookModal.dataset.bookmarkView;
    }
    if (bookBeingEditedType === "library") closeEditBookModal();
    closeAddLibraryBookModal();
    personalShelves.resetSession();
    renderBookRandomizerShelf();
  },
  onError: () => showToast("Your library could not be loaded. Please sign in again.", "error"),
  onSnapshot: snapshot => {
    const books = snapshot.val() || {};

    currentLibraryBooks = Object.entries(books)
  .map(([id, value]) => ({
    id,
    ...value
  }))
  .sort((a, b) => {
    const orderA =
      Number.isFinite(Number(a.shelfOrder))
        ? Number(a.shelfOrder)
        : Number.MAX_SAFE_INTEGER;

    const orderB =
      Number.isFinite(Number(b.shelfOrder))
        ? Number(b.shelfOrder)
        : Number.MAX_SAFE_INTEGER;

    return orderA - orderB;
  });

    renderMyLibrary();
    renderNookCollection();
    renderBookRandomizerShelf();
  }
});
function listenToPersonalLibrary(session = personalLibrarySession.current) {
  personalLibrarySession.listen(session);
}
async function signOutWithLibraryCleanup() {
  const circleUser = auth.currentUser;
  const circleEnd = circleSession.end();
  const friendshipUser = auth.currentUser;
  const friendshipEnd = friendshipSession.end();
  personalLibrarySession.end();
  stopBookmarkListener();
  clearBookmarkDisplays();
  try {
    await signOut(auth);
  } catch (error) {
    // An unsuccessful sign-out must not revive the invalidated session.
    const user = auth.currentUser;
    if (personalLibrarySession.current === null &&
        user && user.emailVerified && currentUser?.uid === user.uid) {
      listenToPersonalLibrary(personalLibrarySession.begin(user.uid));
      listenForBookmarks(personalLibrarySession.current);
    }
    if (user?.uid === friendshipUser?.uid && friendshipSession.canRecover(friendshipEnd, user)) {
      const recovered = friendshipSession.begin(user);
      listenForFriendRequests(recovered);
      listenForFriends(recovered);
    }
    if (user?.uid === circleUser?.uid && circleSession.canRecover(circleEnd, user)) {
      circleSession.begin(user);
      listenToUserClubs();
      // Do not silently reopen a private circle after a failed sign-out.
    }
    throw error;
  }
}
function listenToClubBooks(clubId) {
  onValue(ref(database, "clubs/" + clubId + "/books"), (snapshot) => {
    const books = snapshot.val() || {};
    currentClubBooks = Object.entries(books).map(([id, value]) => ({ id, ...value }));
    updateNookShelfPreview();
    renderBookRandomizerShelf();
    
    document.getElementById("bookCount").textContent =
      currentClubBooks.length + " book" + (currentClubBooks.length === 1 ? "" : "s");

    if (currentClubBooks.length === 0) {
      document.getElementById("libraryGrid").innerHTML =
        `<p class="status">Your circle is waiting for its first story.</p>`;
      return;
    }

    document.getElementById("libraryGrid").innerHTML = `
      <div class="bookshelf-row">
        ${currentClubBooks.slice(0, 4).map(book => renderLibrarySpine(book)).join("")}
        ${currentClubBooks.length < 4 ? `<button class="library-book-spine add-book-spine" onclick="document.getElementById('bookTitle').focus()"><div>＋</div><div>Add<br>Book</div></button>` : ""}
      </div>
      <div class="bookshelf-row">
        ${currentClubBooks.slice(4, 7).map(book => renderLibrarySpine(book)).join("")}
        <button class="library-book-spine add-book-spine" onclick="document.getElementById('bookTitle').focus()"><div>＋</div><div>Add<br>Book</div></button>
      </div>
      <div style="margin-top:14px;">
        ${currentClubBooks.map(book => renderBookCard(book, false)).join("")}
      </div>
    `;
  });
}
function listenToCollectionBooks(clubId) {
  listenCircle("collection", clubId, "collection",
    (snapshot) => {

      const books = snapshot.val() || {};

      currentCollectionBooks = Object.entries(books).map(
        ([id, value]) => ({
          id,
          ...value
        })
      );

      renderClubCollection();
      renderFateDecidesShelf();
    }
  );
}
function renderMyLibrary() {
  const library = document.getElementById("libraryGrid");
  if (!library) return;
  const filteredBooks = currentLibraryFilter === "All"
    ? currentLibraryBooks
    : currentLibraryBooks.filter(book =>
      (book.status || "Want to Read") === currentLibraryFilter);
  personalShelves.render(library, "collection", filteredBooks);
}
window.setLibraryFilter = function (filter, button) {
  currentLibraryFilter = filter;

  document.querySelectorAll("#collectionScreen .library-tabs button")
  .forEach(tab => tab.classList.remove("active"));

  button.classList.add("active");

  renderMyLibrary();
};
function renderSpineCard(book) {
  return `
    <div class="spine-card" title="${escapeAttr(book.title)}">
      <div class="spine-title">${escapeHTML(book.title)}</div>
      <div class="spine-author">${escapeHTML(book.author || "Unknown")}</div>
    </div>
  `;
}
function getBookSpineDimensions(book) {
  const count = Number(book.lengthCount);
  const type = book.lengthType || "pages";

  // Default size for books that don't have length information yet.
  if (!count || count <= 0) {
  const seed = String(book.id || book.title || "book")
    .split("")
    .reduce(
      (total, character) =>
        total + character.charCodeAt(0),
      0
    );

  const widthSeed = seed % 5;
  const heightSeed = Math.floor(seed / 5) % 5;

  const widths = [58, 66, 76, 88, 98];
  const heights = [172, 184, 196, 208, 220];

  return {
    width: widths[widthSeed],
    height: heights[heightSeed]
  };
}

  /*
    Convert chapters to an approximate page count ONLY for visual sizing.

    We're not changing the actual stored book information.
    This just gives chapter-based books reasonable dimensions.
  */
  const estimatedPages =
    type === "chapters"
      ? count * 12
      : count;

  /*
    THICKNESS
    Short books = thinner spine
    Long books = thicker spine

    Clamp prevents extremely thin or enormous books.
  */
  const width = Math.round(
    Math.max(
      58,
      Math.min(
        102,
        55 + estimatedPages * 0.075
      )
    )
  );

  /*
    HEIGHT
    Real books aren't taller simply because they have more pages,
    so page count does NOT directly determine height.

    Instead, each title gets a small, consistent variation.
  */
  const seed = String(book.id || book.title || "book")
    .split("")
    .reduce(
      (total, character) =>
        total + character.charCodeAt(0),
      0
    );

  const heightVariation = (seed % 27) - 13;

  const height = 196 + heightVariation;

  return {
    width,
    height
  };
}
function renderLibrarySpine(book, source = "library") {
  const dimensions = getBookSpineDimensions(book);

  return `
    <div
      class="library-book-spine"
      title="${escapeAttr(book.title)}"
      onclick="openBookModal(${escapeInlineJson(book.id)}, ${escapeInlineJson(source)})"
      style="
        cursor:pointer;
        width:${dimensions.width}px;
        height:${dimensions.height}px;
        flex:0 0 ${dimensions.width}px;
      "
    >
      <div class="library-spine-title">
        ${escapeHTML(book.title)}
      </div>

      <div class="library-spine-author">
        ${escapeHTML(book.author || "Unknown")}
      </div>

      <div class="library-spine-status">
        ${escapeHTML(book.category || "Want to Read")}
      </div>
    </div>
  `;
}

function renderBookCard(book, finished) {
  const canEdit =
    currentUser &&
    (
      currentClubOwner === currentUser.uid ||
      book.addedBy === currentUser.uid ||
      !book.addedBy
    );

  return `
    <div class="book-item">
      <div class="book-card-polished">
        ${
          safeImageSource(book.image)
            ? `<img class="book-mini-cover" src="${escapeAttr(safeImageSource(book.image))}" alt="Book cover">`
            : `<div class="book-mini-placeholder">S</div>`
        }

        <div class="book-info">
          <div class="item-title">${escapeHTML(book.title)}</div>

          ${
            book.author
              ? `<div class="small">by ${escapeHTML(book.author)}</div>`
              : ""
          }

          <div class="book-actions">
            ${
              finished
                ? `
                  <button
                    class="danger"
                    onclick="deleteFinishedBook(${escapeInlineJson(book.id)})"
                  >
                    Remove
                  </button>
                `
                : canEdit
                  ? `
                    <button
                      class="secondary"
                      onclick="editBook(${escapeInlineJson(book.id)})"
                    >
                      Edit Book
                    </button>

                    <button
                      class="danger"
                      onclick="deleteCollectionBook(${escapeInlineJson(book.id)})"
                    >
                      Delete Book
                    </button>
                  `
                  : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}
function renderPersonalBookCard(book) {
  return `
    <div class="book-item">
      <div class="book-card-polished">
        ${
          safeImageSource(book.image)
            ? `<img class="book-mini-cover" src="${escapeAttr(safeImageSource(book.image))}" alt="Book cover">`
            : `<div class="book-mini-placeholder">S</div>`
        }

        <div class="book-info">
          <div class="item-title">${escapeHTML(book.title)}</div>

          ${
            book.author
              ? `<div class="small">by ${escapeHTML(book.author)}</div>`
              : ""
          }

          <div class="book-category">
  ${escapeHTML(book.category || "Uncategorized")}
</div>

<div style="margin-top:18px;">
  <select
    onchange="updateBookStatus(${escapeInlineJson(book.id)}, this.value)"
    class="modal-select"
  >
    <option value="Want to Read"
      ${(book.status || "Want to Read") === "Want to Read" ? "selected" : ""}>
      Want to Read
    </option>

    <option value="In Progress"
      ${book.status === "In Progress" ? "selected" : ""}>
      In Progress
    </option>

    <option value="Completed"
      ${book.status === "Completed" ? "selected" : ""}>
      Completed
    </option>
  </select>
</div>

          <div class="book-actions">
            <button
  class="secondary"
  onclick="event.stopPropagation(); openEditBookModal(${escapeInlineJson(book.id)}, 'library')"
>
  Edit Book
</button>

            <button class="danger" onclick="deletePersonalBook(${escapeInlineJson(book.id)})">
              Delete Book
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.openBookModal = function (bookId, source = "library") {
  const modal = document.getElementById("bookModal");
  const body = document.getElementById("bookModalBody");

  if (!modal || !body) return;

  const isBookmark = source === "bookmark";
  const book = isBookmark
    ? currentBookmarkBooks.find(b => b.id === bookId)
    : currentLibraryBooks.find(b => b.id === bookId) ||
      currentCollectionBooks.find(b => b.id === bookId);

  if (!book) {
    alert("Book not found.");
    return;
  }

  const isCollectionBook =
    !isBookmark && currentCollectionBooks.some(b => b.id === bookId);
  modal.dataset.circleView = String(isCollectionBook);
  modal.dataset.bookmarkView = String(isBookmark);

  body.innerHTML = `
    <div class="book-detail-page">

      <div class="book-detail-topbar">
        <button class="book-back-btn" onclick="closeBookModal()">←</button>

        <button
          class="book-bookmark-btn"
          onclick="event.stopPropagation(); saveToBookmarks(${escapeInlineJson(book)})"
          title="Save to Dog-Eared Pages"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h12v18l-6-4-6 4V3z"></path>
          </svg>
        </button>
      </div>

      <div class="book-detail-hero">
        ${
          safeImageSource(book.image)
            ? `<img class="book-detail-cover" src="${escapeAttr(safeImageSource(book.image))}" alt="Book cover">`
            : `<div class="book-detail-placeholder">${escapeHTML((book.title || "S").charAt(0))}</div>`
        }

        <div class="book-detail-info">
          <h2>${escapeHTML(book.title || "Untitled Book")}</h2>

          ${
            book.author
              ? `<p class="book-detail-author">by ${escapeHTML(book.author)}</p>`
              : ""
          }

          <div class="book-detail-meta">
  ${escapeHTML(book.genre || book.category || "Genre Unknown")}
  ${
  book.lengthCount
    ? ` • ${escapeHTML(book.lengthCount)} ${book.lengthType === "chapters" ? "chapters" : "pages"}`
    : ""
}
</div>

<div class="book-detail-rating">
  ${
    book.rating
      ? `★★★★★ ${escapeHTML(book.rating)}`
      : ""
  }
</div>

         
        </div>
      </div>

      <div class="book-detail-divider"></div>

      <section class="book-detail-section">
        <h3>Synopsis</h3>
        <p>
  ${
    book.synopsis
      ? escapeHTML(book.synopsis)
      : "More book details coming soon."
  }
</p>
      </section>

      ${
        !isBookmark && canManageBook(book, isCollectionBook ? "collection" : "library")
          ? `
            <div class="book-actions">
              <button
                class="secondary"
                onclick="event.stopPropagation(); openEditBookModal(${escapeInlineJson(book.id)}, '${isCollectionBook ? "collection" : "library"}')"
              >
                Edit Book
              </button>

              <button
                class="danger"
                onclick="event.stopPropagation(); closeBookModal(); ${isCollectionBook ? `deleteCollectionBook(${escapeInlineJson(book.id)})` : `deletePersonalBook(${escapeInlineJson(book.id)})`}"
              >
                Delete Book
              </button>
            </div>
          `
          : ""
      }

    </div>
  `;

  modal.style.display = "flex";
};

window.closeBookModal = function () {
  const modal = document.getElementById("bookModal");
  if (modal) modal.style.display = "none";
};
window.openAddCollectionBookModal = function () {
  const modal = document.getElementById("addCollectionBookModal");

  if (modal) {
    document.querySelector(".phone-frame").classList.add("modal-open");
    modal.style.display = "flex";
  }
};

window.closeAddCollectionBookModal = function () {
  const modal = document.getElementById("addCollectionBookModal");

  if (modal) {
    document.querySelector(".phone-frame").classList.remove("modal-open");
    modal.style.display = "none";
  }
};
let bookBeingEditedId = null;
let bookBeingEditedType = null;
window.openAddLibraryBookModal = function () {

  const modal = document.getElementById("addLibraryBookModal");

  if (modal) {
    modal.style.display = "flex";
  }

};

window.closeAddLibraryBookModal = function () {

  const modal = document.getElementById("addLibraryBookModal");

  if (modal) {
    modal.style.display = "none";
  }

};

window.addBookToPersonalLibrary = async function () {

  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  const title =
    document.getElementById("libraryBookTitle").value.trim();

  const author =
    document.getElementById("libraryBookAuthor").value.trim();

  const category =
    document.getElementById("libraryBookCategory").value;

  const image =
    document.getElementById("libraryBookImage").value.trim();
const status =
  document.getElementById("libraryBookStatus").value;
  if (!title) {
    alert("Enter a book title.");
    return;
  }

  const bookRef = push(
    ref(database, "users/" + currentUser.uid + "/library")
  );

  await set(bookRef, {
  title,
  author,
  category,
  status,
  image,
  createdAt: Date.now()
});

  document.getElementById("libraryBookTitle").value = "";
  document.getElementById("libraryBookAuthor").value = "";
  document.getElementById("libraryBookImage").value = "";

  closeAddLibraryBookModal();

  alert("Book added to My Library.");
};
window.openEditBookModal = function (bookId, type) {
  bookBeingEditedId = bookId;
  bookBeingEditedType = type;

  const book =
    type === "collection"
      ? currentCollectionBooks.find(b => b.id === bookId)
      : currentLibraryBooks.find(b => b.id === bookId);

  if (!book) {
    alert("Book not found.");
    return;
  }

  document.getElementById("editBookTitle").value = book.title || "";
  document.getElementById("editBookAuthor").value = book.author || "";
  

document.getElementById("editBookGenre").value =
  book.genre || "";

document.getElementById("editBookLengthType").value =
  book.lengthType || "pages";

document.getElementById("editBookLengthCount").value =
  book.lengthCount || "";

document.getElementById("editBookSynopsis").value =
  book.synopsis || "";

document.getElementById("editBookImage").value =
  book.image || "";
  document.querySelector(".phone-frame").classList.add("modal-open");
  document.getElementById("editBookModal").style.display = "flex";
};

window.closeEditBookModal = function () {
  document.querySelector(".phone-frame").classList.remove("modal-open");
  document.getElementById("editBookModal").style.display = "none";
  bookBeingEditedId = null;
  bookBeingEditedType = null;
};
window.opencircleSettingsModal = function () {
  if (!window.currentClubId) {
    alert("Open a circle first.");
    return;
  }

  document.querySelector(".phone-frame").classList.add("modal-open");
  document.getElementById("circleSettingsModal").style.display = "flex";
};

window.closecircleSettingsModal = function () {
  document.querySelector(".phone-frame").classList.remove("modal-open");
  document.getElementById("circleSettingsModal").style.display = "none";
};

window.editCurrentcircleName = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");

  const [ownerSnapshot, nameSnapshot] = await Promise.all([
    circleStep(operation, () => get(ref(database, `clubs/${operation.clubId}/access/ownerUid`))),
    circleStep(operation, () => get(ref(database, `clubs/${operation.clubId}/name`)))
  ]);
  if (!nameSnapshot.exists()) return alert("Circle not found.");
  if (ownerSnapshot.val() !== operation.uid) {
    return alert("Only the circle creator can rename this circle.");
  }

  const newName = prompt("Edit circle name:", nameSnapshot.val() || "");
  if (newName === null) return;
  if (!newName.trim()) return alert("circle name cannot be blank.");

  await circleStep(operation, () => set(
    ref(database, `clubs/${operation.clubId}/name`),
    newName.trim()
  ));

  closecircleSettingsModal();
  showToast("circle updated.");
  });
};

window.copyCurrentCircleInvite = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");

  const inviteLink =
    window.location.origin + window.location.pathname + "?club=" + window.currentClubId;

  try {
    await circleStep(operation, () => navigator.clipboard.writeText(inviteLink));
    showToast("Invite link copied.");
  } catch (error) {
    if (!operation.valid()) return;
    prompt("Copy this invite link:", inviteLink);
  }
  });
};

function isCircleLeaveCurrent(state) {
  return circleLeaveState === state && circleSession.isCurrent(state.account) &&
    auth.currentUser?.uid === state.uid && currentUser?.uid === state.uid;
}

function showCircleLeaveStatus(state, message, retry = false) {
  if (!isCircleLeaveCurrent(state)) return;
  const status = document.getElementById("circleLeaveStatus");
  if (!status) return;
  const copy = document.createElement("p");
  copy.textContent = message;
  status.replaceChildren(copy);
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "Retry leaving";
    button.addEventListener("click", () => leaveCircleMembership(state.clubId, state));
    status.append(button);
  }
  status.hidden = false;
  if (circleSession.isViewCurrent(state.view)) {
    if (retry) {
      closecircleSettingsModal();
      showScreen("nook");
    } else {
      showToast(message);
    }
  }
}

function closeCircleForLeave(state) {
  if (!isCircleLeaveCurrent(state) || !circleSession.isViewCurrent(state.view)) return;
  state.closingOwnView = true;
  try {
    circleSession.closeCircle(state.view);
  } finally {
    state.closingOwnView = false;
  }
  showScreen("nook");
}

// One canonical leave protocol. The two deletions commit atomically: there is
// never a membership-deleted/index-not-deleted intermediate server state.
async function leaveCircleMembership(clubId, retryState = null) {
  const account = circleSession.current;
  const view = circleSession.view;
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true || currentUser?.uid !== user.uid ||
      !circleSession.isCurrent(account) || !/^[A-Za-z0-9_-]{1,128}$/.test(clubId || "")) return;
  if (retryState) {
    if (!isCircleLeaveCurrent(retryState) || retryState.busy) return;
  } else {
    if (!circleSession.isActive(view) || view.clubId !== clubId || circleLeaveState?.busy) return;
    if (!confirm("Leave this circle?")) return;
    if (!circleSession.isCurrent(account) || !circleSession.isActive(view)) return;
  }
  const state = retryState || {
    uid: user.uid, clubId, account, view, busy: false, submitted: false, closingOwnView: false
  };
  circleLeaveState = state;
  state.busy = true;
  state.submitted = false;
  const step = async action => {
    if (!isCircleLeaveCurrent(state)) throw CIRCLE_SESSION_ENDED;
    const result = await action();
    if (!isCircleLeaveCurrent(state)) throw CIRCLE_SESSION_ENDED;
    return result;
  };
  const memberPath = `clubs/${state.clubId}/access/members/${state.uid}`;
  const navigationPath = `users/${state.uid}/clubs/${state.clubId}`;
  showCircleLeaveStatus(state, "Checking whether this membership can safely leave.");
  try {
    const memberSnapshot = await step(() => get(ref(database, memberPath)));
    const member = memberSnapshot.val();
    if (!memberSnapshot.exists()) {
      const navigation = await step(() => get(ref(database, navigationPath)));
      closeCircleForLeave(state);
      showCircleLeaveStatus(state, navigation.exists()
        ? "No canonical membership was found. No records were changed; the remaining list entry was not removed without verification."
        : "Your canonical membership and circle-list entry are already absent. No further records were changed.");
      return;
    }
    if (member?.role === "owner") {
      showCircleLeaveStatus(state, "The circle owner cannot leave. Ownership transfer is not available.");
      return;
    }
    if (member?.role !== "member" ||
        !/^[A-Za-z0-9_-]{8,64}$/.test(member.invitationId || "")) {
      showCircleLeaveStatus(state, "This membership cannot be left under the current policy. No records were changed.");
      return;
    }
    const ownerSnapshot = await step(() =>
      get(ref(database, `clubs/${state.clubId}/access/ownerUid`)));
    const ownerUid = ownerSnapshot.val();
    if (typeof ownerUid !== "string" || !ownerUid || ownerUid === state.uid) {
      showCircleLeaveStatus(state, "Leaving is unavailable because canonical ownership is not confirmed.");
      return;
    }
    const ownerMember = await step(() =>
      get(ref(database, `clubs/${state.clubId}/access/members/${ownerUid}`)));
    const invitation = await step(() => get(ref(database,
      `circleInvitations/${state.uid}/${state.clubId}/${member.invitationId}`)));
    if (ownerMember.val()?.role !== "owner" || invitation.val()?.clubId !== state.clubId ||
        invitation.val()?.issuedBy !== ownerUid || invitation.val()?.status !== "consumed") {
      showCircleLeaveStatus(state,
        "Leaving is unavailable until ownership and invitation finalization are confirmed. Complete joining from your invitation inbox first.");
      return;
    }
    state.submitted = true;
    showCircleLeaveStatus(state, "Leaving is pending. Waiting for server acknowledgement; no success is assumed.");
    // Already-submitted SDK writes cannot be cancelled. Fixed original paths,
    // rules and session guards prevent redirection or subsequent stale UI work.
    await step(() => update(ref(database), {
      [memberPath]: null,
      [navigationPath]: null
    }));
    closeCircleForLeave(state);
    showCircleLeaveStatus(state, "You left the circle. Its books and shared records were preserved.");
    showToast("You left the circle.");
  } catch (error) {
    if (error === CIRCLE_SESSION_ENDED || !isCircleLeaveCurrent(state)) return;
    const denied = isFriendshipPermissionDenied(error);
    if (!denied) circleDiagnostic("circle-leave", error);
    showCircleLeaveStatus(state, denied
      ? "Leaving was denied. No successful leave acknowledgement was received. Recheck your membership and retry."
      : "Leaving was not confirmed. Check your connection and retry; no success is assumed.", true);
  } finally {
    state.busy = false;
  }
}

window.leaveCurrentcircle = function () {
  return leaveCircleMembership(window.currentClubId);
};

function circleDeletionUnavailable() {
  showToast("Circle deletion is temporarily unavailable. No records were changed.", "error");
}

window.deleteCurrentcircle = circleDeletionUnavailable;
window.saveEditedBook = async function () {
  if (bookBeingEditedType === "collection") {
    return runCircleOperation(operation => saveEditedBookForSession(operation));
  }
  return saveEditedBookForSession(null);
};
async function saveEditedBookForSession(operation) {
  if (!bookBeingEditedId || !bookBeingEditedType) {
    alert("No book selected.");
    return;
  }

  const title = document.getElementById("editBookTitle").value.trim();
  const author = document.getElementById("editBookAuthor").value.trim();
  const genre = document.getElementById("editBookGenre").value.trim();
  const lengthType = document.getElementById("editBookLengthType").value;
  const lengthCount = document.getElementById("editBookLengthCount").value.trim();
  const synopsis = document.getElementById("editBookSynopsis").value.trim();
  const image = document.getElementById("editBookImage").value.trim();

  if (!title) {
    alert("Enter a book title.");
    return;
  }

  const path =
    bookBeingEditedType === "collection"
      ? "clubs/" + window.currentClubId + "/collection/" + bookBeingEditedId
      : "users/" + currentUser.uid + "/library/" + bookBeingEditedId;

  const save = () => update(ref(database, path), {
    title,
    author,
    genre,
    lengthType,
    lengthCount,
    synopsis,
    image,
    updatedAt: Date.now()
  });
  if (operation) await circleStep(operation, save);
  else await save();

  closeEditBookModal();
  closeBookModal();

  showToast("Book updated.");
}

window.updateBookStatus = async function (
  bookId,
  typeOrStatus,
  optionalStatus
) {
  if (!currentUser) {
    showToast("Please sign in first.", "error");
    return;
  }

  const isThreeArgumentCall =
    typeof optionalStatus !== "undefined";

  const type = isThreeArgumentCall
    ? typeOrStatus
    : "library";

  const status = isThreeArgumentCall
    ? optionalStatus
    : typeOrStatus;

  if (!bookId || !status) {
    showToast("Could not update the book status.", "error");
    return;
  }

  if (type === "collection" && !window.currentClubId) {
    showToast("Open a reading circle first.", "error");
    return;
  }

  const path =
    type === "collection"
      ? `clubs/${window.currentClubId}/collection/${bookId}`
      : `users/${currentUser.uid}/library/${bookId}`;
  const operation = type === "collection" ? circleSession.capture() : null;
  if (type === "collection" && !operation) return;

  try {
    const save = () => update(ref(database, path), {
      status,
      updatedAt: Date.now()
    });
    if (operation) await circleStep(operation, save);
    else await save();

    const modal = document.getElementById("bookModal");

    if (modal && modal.style.display === "flex") {
      closeBookModal();
    }

    showToast(`Book moved to ${status}.`);
  } catch (error) {
    if (operation) {
      if (error !== CIRCLE_SESSION_ENDED) {
        if (operation.valid()) circleUnavailable(operation.view, error);
        else if (!isFriendshipPermissionDenied(error)) circleDiagnostic("obsolete-circle-status", error);
      }
      return;
    }
    console.error("Book status update failed:", error);
    showToast("The book status could not be updated.", "error");
  }
};
function listenToNextRead(clubId) {
  listenCircle("next-read", clubId, "nextRead", (snapshot) => {
    const nextRead = snapshot.val();
window.currentNextRead = nextRead;
    updateNookNextRead(nextRead);

    const marginaliaTitle = document.getElementById("marginaliaBookTitle");
    const marginaliaAuthor = document.getElementById("marginaliaBookAuthor");
    const area = document.getElementById("nextReadArea");

    if (!area) return;

    if (!nextRead) {
      window.currentNextRead = null;
      area.innerHTML = `<p class="status">No next read set yet.</p>`;

      if (marginaliaTitle) marginaliaTitle.textContent = "Current Read";
      if (marginaliaAuthor) marginaliaAuthor.textContent = "Open a shelf to see notes.";

      return;
    }

    if (marginaliaTitle) marginaliaTitle.textContent = nextRead.title || "Current Read";
    if (marginaliaAuthor) marginaliaAuthor.textContent = nextRead.author || "";

    area.innerHTML = `
      <div class="club-current-read">
      <div class="club-hero-heading">
  <h1>Current Read</h1>
  <p>Reading together as a club</p>
</div>
        <div class="club-current-top">

  <div class="club-current-cover">
    ${
      safeImageSource(nextRead.image)
        ? `<img src="${escapeAttr(safeImageSource(nextRead.image))}" alt="Book cover">`
        : `<div class="cover-placeholder">S</div>`
    }
  </div>

  <div class="club-current-info">

    <h2>${escapeHTML(nextRead.title)}</h2>

    ${
      nextRead.author
        ? `<p class="club-current-author">by ${escapeHTML(nextRead.author)}</p>`
        : ""
    }
    <div class="book-category">
  ${escapeHTML(nextRead.category || "Featured Volume")}
</div>
<div class="club-reading-together">

  <div id="featuredReaderRow" class="featured-reader-row">
    <div class="featured-reader-avatar">✦</div>
  </div>
  <div id="featuredReaderCount" class="featured-reader-count">
  Loading readers...
</div>
</div>
  </div>
            
        </div>

        <div class="club-progress-box new-club-progress">

  <div class="club-progress-head">
    <h3>Reading Goal</h3>
  </div>

  <div class="reading-goal-summary goal-combined-panel">

    <div>
      <p class="mini-label">Current Goal</p>
      <strong id="readingGoalDisplay">Chapters 1–5</strong>
    </div>

    <div>
      <p class="mini-label">Due</p>
      <strong id="readingDueDisplay">May 30</strong>
      <div id="readingDueCountdown" class="due-countdown">
  —
</div>
    </div>

  </div>

  <div class="goal-bar-row">
    <div class="progress-bar-shell">
      <div id="clubProgressFill" class="progress-bar-fill"></div>
    </div>

    <strong id="goalProgressPercent">0%</strong>
  </div>

  <div class="goal-card-footer">
    <span id="goalProgressMessage">Most are on track! ✨</span>

    <button class="goal-details-btn" onclick="openReadingGoalModal()">
      View Details ›
    </button>
  </div>

</div>


<div class="club-progress-card">

  <div class="club-progress-head">
    <h3>Club Progress</h3>
    <span class="chapter-pill">46 Chapters</span>
  </div>

  <div id="clubProgressContent" class="club-progress-grid">

  <div>
    <p class="mini-label">Club Completion</p>
    <strong id="clubProgressPercentText">0%</strong>
  </div>

  <div>
    <p class="mini-label">Status</p>
    <p id="chapterCountText">No progress yet.</p>
  </div>

</div>

</div>


<div class="checked-in-card">

  <div id="memberCheckinsList" class="reader-checkin-row"></div>

  <div class="progress-actions">

    <button class="secondary" onclick="checkInForBook()">
  Check In for Goal
</button>

    <button id="finishedBookBtn" onclick="finishFeaturedBook()" disabled>
      Finished Book 🔒
    </button>

  </div>

  <p id="finishLockText" class="helper">
    Everyone must check in before finishing this book.
  </p>

</div>
      </div>
    `;
  });
}
function listenToBooksRead(clubId) {
  listenCircle("books-read", clubId, "booksRead", (snapshot) => {
    const booksRead = snapshot.val() || {};
    const finishedBooks = Object.entries(booksRead).map(([id, value]) => ({ id, ...value }));

    document.getElementById("booksReadCount").textContent = finishedBooks.length + " read";

    if (finishedBooks.length === 0) {
      document.getElementById("booksReadList").innerHTML =
        `<p class="status">No finished reads yet. Your club history will live here.</p>`;
      return;
    }

    document.getElementById("booksReadList").innerHTML =
  finishedBooks.map(book => `
    <div onclick="openFinishedBookDetails(${escapeInlineJson(book)})">
      ${renderBookCard(book, true)}
    </div>
  `).join("");
  });
}

function listenToMembers(clubId) {
  const memberCount = document.getElementById("clubHeroMemberCount");
  const preview = document.getElementById("clubMemberPreview");
  const modalList = document.getElementById("membersModalList");

  const view = circleSession.view;
  listenCircle("members", clubId, "access/members", async (snapshot, valid) => {
    if (!valid()) return;
    const members = snapshot.val() || {};
    if (!["owner", "member"].includes(members[view.session.uid]?.role)) {
      circleUnavailable(view);
      return;
    }
    const ownerUid = currentClubOwner;
    if (members[view.session.uid]?.role !== "owner" ||
      ownerUid !== view.session.uid) {
      document.getElementById("circleOwnerBadge")?.remove();
    }
    const memberIds = Object.keys(members).filter(uid =>
      ["owner", "member"].includes(members[uid]?.role)
    );

    if (memberCount) {
      memberCount.textContent =
        memberIds.length + " member" + (memberIds.length === 1 ? "" : "s");
    }

    if (memberIds.length === 0) {
      if (preview) preview.innerHTML = "";
      if (modalList) modalList.innerHTML = `<p class="status">No members yet.</p>`;
      return;
    }

    const canonicalOwnerUid = typeof ownerUid === "string" &&
      members[ownerUid]?.role === "owner" ? ownerUid : null;
    const modalMemberIds = [...memberIds].sort((left, right) => {
      const leftIsOwner = left === canonicalOwnerUid;
      const rightIsOwner = right === canonicalOwnerUid;
      if (leftIsOwner !== rightIsOwner) return leftIsOwner ? -1 : 1;
      return left < right ? -1 : left > right ? 1 : 0;
    });
    const visibleMemberIds = memberIds.slice(0, 4);
    const hiddenMemberCount = memberIds.length - visibleMemberIds.length;
    const profiles = new Map();

    for (const uid of new Set([...visibleMemberIds, ...modalMemberIds])) {
      const userData = await readPublicProfile(uid);
      if (!valid()) return;

      const displayName = publicDisplayName(userData.username);
      const avatarPhoto = safeImageSource(userData.avatarPhoto || "");
      const avatarValue = userData.avatar || "📚";
      const avatarHTML = avatarValue === "photo" && avatarPhoto
        ? `<img src="${escapeAttr(avatarPhoto)}"
            style="
              width:100%;
              height:100%;
              border-radius:50%;
              object-fit:cover;
              display:block;
            ">`
        : escapeHTML(avatarValue === "photo"
          ? displayName.charAt(0).toUpperCase()
          : avatarValue);

      profiles.set(uid, {displayName, avatarHTML});
    }

    let previewHTML = "";
    let modalHTML = "";

    for (const uid of visibleMemberIds) {
      const {avatarHTML} = profiles.get(uid);
      previewHTML += `
        <div onclick="openMembersModal()" style="
          width:38px;
          height:38px;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          background:linear-gradient(145deg,var(--gold-soft),var(--gold));
          color:#120b06;
          font-weight:700;
          font-size:.9rem;
        ">
          ${avatarHTML}
        </div>
      `;
    }

    for (const uid of modalMemberIds) {
      const {displayName, avatarHTML} = profiles.get(uid);
      const role = members[uid]?.role;
      const isCanonicalOwner = uid === canonicalOwnerUid && role === "owner";
      const roleHTML = isCanonicalOwner
        ? `<span class="circle-owner-badge member-owner-badge">
            <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path d="M2 5.1 6.1 8l2.9-5.2L11.9 8 16 5.1l-1.5 9.2h-11L2 5.1Z"></path>
              <path d="M4 16h10"></path>
            </svg>
            <span>Owner</span>
          </span>`
        : role === "member"
          ? `<span class="circle-member-role">Member</span>`
          : `<span class="circle-member-role member-role-unavailable">Role unavailable</span>`;

      modalHTML += `
        <div class="book-item member-roster-row">
          <div class="item-title member-roster-title">
            ${avatarHTML}
            <span class="member-roster-name">${escapeHTML(displayName)}</span>
            ${roleHTML}
          </div>
          <button class="secondary" onclick="openReaderProfile(${escapeInlineJson(uid)})">
            View Profile
          </button>
        </div>
      `;
    }

    if (hiddenMemberCount > 0) {
      previewHTML += `
        <div onclick="openMembersModal()"
          class="featured-reader-avatar"
          style="
            display:flex;
            align-items:center;
            justify-content:center;
            font-weight:700;
          ">
          +${hiddenMemberCount}
        </div>
      `;
    }
    currentMemberAvatarsHTML = previewHTML;

    if (preview) preview.innerHTML = previewHTML;
    if (modalList) modalList.innerHTML = modalHTML;

    const featuredReaderRow =
      document.getElementById("featuredReaderRow");

    if (featuredReaderRow) {
      featuredReaderRow.innerHTML = previewHTML;
    }
    const featuredReaderCount =
      document.getElementById("featuredReaderCount");

    if (featuredReaderCount) {
      featuredReaderCount.innerHTML =
        `<span class="member-count-icon">👥</span> ${memberIds.length} member${memberIds.length === 1 ? "" : "s"} reading`;
    }
  });
}

function listenToDiscussion(clubId) {
  listenCircle("discussion", clubId, "discussion", (snapshot) => {
    const discussion = snapshot.val() || {};

    const comments = Object.entries(discussion)
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => a.createdAt - b.createdAt);

    const lists = [
      document.getElementById("discussionList"),
      document.getElementById("discussionListClub")
    ].filter(Boolean);

    if (lists.length === 0) return;

    if (comments.length === 0) {
      lists.forEach(list => {
        list.innerHTML = `<p class="status">No notes yet. Start the conversation.</p>`;
      });
      return;
    }

    const discussionHTML = comments.map(comment => `
      <div class="note-card" onclick="toggleReactionPicker(${escapeInlineJson(comment.id)})">
        <div class="comment-row">
          <div class="comment-avatar">
  ${
    comment.authorAvatar === "photo" && safeImageSource(comment.authorAvatarPhoto)
      ? `<img src="${escapeAttr(safeImageSource(comment.authorAvatarPhoto))}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
      : escapeHTML(comment.authorAvatar || (comment.authorAlias || "R").charAt(0).toUpperCase())
  }
</div>

          <div class="comment-content">
            <div class="comment-alias">
              ${escapeHTML(comment.authorAlias || "Reader")}
            </div>

            <div class="note-message">
              ${escapeHTML(comment.message)}
            </div>

            <div class="comment-time">
              ${formatTimeAgo(comment.createdAt)}${comment.editedAt ? " · edited" : ""}
            </div>

            ${currentUser && comment.authorId === currentUser.uid ? `
              <div class="book-actions">
                <button
                  class="secondary"
                  onclick="event.stopPropagation(); window.editDiscussionComment(${escapeInlineJson(comment.id)})"
                >
                  Edit Note
                </button>

                <button
                  class="danger"
                  onclick="event.stopPropagation(); window.deleteDiscussionComment(${escapeInlineJson(comment.id)})"
                >
                  Delete Note
                </button>
              </div>
            ` : ""}

            <div class="reaction-summary">
              ❤️ ${escapeHTML(comment.reactions?.heart || 0)}
              📚 ${escapeHTML(comment.reactions?.book || 0)}
              👀 ${escapeHTML(comment.reactions?.eyes || 0)}
              😭 ${escapeHTML(comment.reactions?.cry || 0)}
            </div>

            <div id="reactionPicker-${escapeAttr(comment.id)}" class="reaction-picker">
              <button onclick="event.stopPropagation(); reactToComment(${escapeInlineJson(comment.id)}, 'heart')">❤️</button>
              <button onclick="event.stopPropagation(); reactToComment(${escapeInlineJson(comment.id)}, 'book')">📚</button>
              <button onclick="event.stopPropagation(); reactToComment(${escapeInlineJson(comment.id)}, 'eyes')">👀</button>
              <button onclick="event.stopPropagation(); reactToComment(${escapeInlineJson(comment.id)}, 'cry')">😭</button>
            </div>
          </div>
        </div>
      </div>
    `).join("");

    lists.forEach(list => {
      list.innerHTML = discussionHTML;
    });
  });
}

function clearActiveCircleRitual() {
  circleSession.stop("ritual-prompt");
  circleSession.stop("ritual-responses");
  currentCircleRitualId = null;
  currentCircleRitualResponses = {};
  currentCircleRitualPrompt = null;
  for (const id of ["ritualActiveContent", "ritualResponsesList"]) {
    document.getElementById(id)?.replaceChildren();
  }
  const response = document.getElementById("ritualResponseInput");
  if (response) response.value = "";
  for (const id of ["ritualParticipation", "closeCircleRitualButton"]) {
    const element = document.getElementById(id);
    if (element) element.hidden = true;
  }
}

function resumeCircleRitualRead(state, pending) {
  if (circleRitualListenerState !== state || state.recovery !== pending ||
      !pending.operation.valid() || !pending.confirmed || !pending.hasNext ||
      pending.nextId === pending.ritualId) return;
  state.recovery = null;
  const status = document.getElementById("ritualStatus");
  status?.replaceChildren();
  if (status) status.hidden = true;
  try {
    state.render(pending.nextId);
  } catch (error) {
    if (pending.operation.valid() && circleRitualListenerState === state)
      circleUnavailable(state.view, error);
  }
}

function recoverCircleRitualRead(error, {owner, key, valid}) {
  const state = circleRitualListenerState;
  if (!valid() || !isFriendshipPermissionDenied(error) ||
      !["ritual-prompt", "ritual-responses"].includes(key) ||
      state?.view !== owner || !/^v2_[A-Za-z0-9_-]{1,124}$/.test(owner.clubId) ||
      !currentCircleRitualId) return false;
  const operation = circleSession.capture();
  if (!operation || operation.view !== owner) return false;
  const pending = {
    operation, ritualId:currentCircleRitualId, confirmed:false, hasNext:false
  };
  state.recovery = pending;
  // A closing ritual can revoke these reads before the active-pointer event
  // arrives. Quarantine old content immediately; keep canonical access watched.
  clearActiveCircleRitual();
  showCircleRitualStatus("Checking access to the current ritual…");
  const current = () => operation.valid() &&
    circleRitualListenerState === state && state.recovery === pending;
  Promise.resolve().then(async () => {
    const membership = await circleStep(operation, () => get(ref(
      database, `clubs/${operation.clubId}/access/members/${operation.uid}`
    )));
    if (!current()) return;
    const ownerSnapshot = await circleStep(operation, () => get(ref(
      database, `clubs/${operation.clubId}/access/ownerUid`
    )));
    if (!current()) return;
    const role = membership.val()?.role;
    const ownerUid = ownerSnapshot.val();
    if (!["owner", "member"].includes(role) ||
        typeof ownerUid !== "string" || !ownerUid ||
        (role === "owner" && ownerUid !== operation.uid)) {
      circleUnavailable(owner);
      return;
    }
    pending.confirmed = true;
    // Do not infer closure from get(activeRitualId): SDK get() can return the
    // existing listen cache before its pointer event. Wait for that listener.
    showCircleRitualStatus(
      "Ritual content is temporarily unavailable. Reopen this circle to retry if it does not update."
    );
    resumeCircleRitualRead(state, pending);
  }).catch(failure => {
    if (current()) circleUnavailable(owner, failure);
  });
  return true;
}

function clearCircleRitualUI() {
  circleRitualListenerState = null;
  clearActiveCircleRitual();
  currentCircleRitualSuggestions = {};
  circleRitualInFlight = null;
  pendingCircleRitualPublish = null;
  pendingCircleRitualSuggestion = null;
  for (const id of ["ritualActiveContent", "ritualSuggestionList", "ritualStatus"]) {
    document.getElementById(id)?.replaceChildren();
  }
  const status = document.getElementById("ritualStatus");
  if (status) status.hidden = true;
  const pill = document.getElementById("ritualStatusPill");
  if (pill) pill.textContent = "No active ritual";
  const participation = document.getElementById("ritualParticipation");
  if (participation) participation.hidden = true;
  const ownerControls = document.getElementById("ritualOwnerControls");
  if (ownerControls) ownerControls.hidden = true;
  const ownerSuggestions = document.getElementById("ritualOwnerSuggestions");
  if (ownerSuggestions) ownerSuggestions.hidden = true;
  const closeButton = document.getElementById("closeCircleRitualButton");
  if (closeButton) closeButton.hidden = true;
  for (const id of ["ritualResponseInput", "ritualPromptInput", "ritualSuggestionInput"]) {
    const input = document.getElementById(id);
    if (input) input.value = "";
  }
}

function showCircleRitualStatus(message, actionLabel = "", action = null) {
  const status = document.getElementById("ritualStatus");
  if (!status) return;
  status.replaceChildren();
  const copy = document.createElement("p");
  copy.textContent = message;
  status.append(copy);
  if (actionLabel && typeof action === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = actionLabel;
    button.addEventListener("click", action);
    status.append(button);
  }
  status.hidden = false;
}

function ritualTypeLabel(type) {
  return type === "sunday-bookmark"
    ? "The Sunday Bookmark"
    : type === "between-the-lines" ? "Between the Lines" : "Circle Ritual";
}

function renderCircleRitualResponses() {
  const list = document.getElementById("ritualResponsesList");
  if (!list) return;
  list.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "Circle responses";
  list.append(heading);
  const entries = Object.entries(currentCircleRitualResponses || {});
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "helper";
    empty.textContent = "No responses yet. Add a few lines when you’re ready.";
    list.append(empty);
    return;
  }
  for (const [, response] of entries) {
    if (!response || typeof response.text !== "string") continue;
    const card = document.createElement("article");
    card.className = "ritual-response";
    const author = document.createElement("strong");
    author.textContent = response.memberUid === currentUser?.uid ? "Your response" : "Circle member";
    const text = document.createElement("p");
    text.textContent = response.text;
    card.append(author, text);
    list.append(card);
  }
}

function renderCircleRitualPrompt(ritualId, prompt) {
  const content = document.getElementById("ritualActiveContent");
  if (!content) return false;
  content.replaceChildren();
  if (!prompt || prompt.ritualId !== ritualId ||
      !["sunday-bookmark", "between-the-lines"].includes(prompt.type) ||
      typeof prompt.prompt !== "string" || prompt.spoilerSafe !== true) {
    return false;
  }
  const label = document.createElement("div");
  label.className = "ritual-type-label";
  label.textContent = ritualTypeLabel(prompt.type);
  const text = document.createElement("p");
  text.className = "ritual-prompt";
  text.textContent = prompt.prompt;
  const responses = document.createElement("div");
  responses.id = "ritualResponsesList";
  responses.className = "ritual-responses-list";
  content.append(label, text, responses);
  renderCircleRitualResponses();
  document.getElementById("ritualStatusPill").textContent = "Now active";
  document.getElementById("ritualParticipation").hidden = false;
  document.getElementById("closeCircleRitualButton").hidden = !currentCircleRitualOwner;
  const response = currentCircleRitualResponses?.[currentUser?.uid];
  const input = document.getElementById("ritualResponseInput");
  if (input) input.value = typeof response?.text === "string" ? response.text : "";
  return true;
}

function renderCircleRitualSuggestions(suggestions) {
  const list = document.getElementById("ritualSuggestionList");
  if (!list) return;
  list.replaceChildren();
  const entries = [];
  for (const [authorUid, byId] of Object.entries(suggestions || {})) {
    for (const [suggestionId, suggestion] of Object.entries(byId || {})) {
      if (suggestion && typeof suggestion === "object") {
        entries.push({authorUid, suggestionId, suggestion});
      }
    }
  }
  entries.sort((left, right) =>
    (Number(left.suggestion.createdAt) || 0) - (Number(right.suggestion.createdAt) || 0)
  );
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = "No suggestions yet.";
    list.append(empty);
    return;
  }
  for (const {authorUid, suggestionId, suggestion} of entries) {
    const article = document.createElement("article");
    article.className = "ritual-suggestion";
    const type = document.createElement("div");
    type.className = "ritual-type-label";
    type.textContent = `${ritualTypeLabel(suggestion.type)} · ${suggestion.status || "pending"}`;
    const prompt = document.createElement("p");
    prompt.textContent = suggestion.prompt || "";
    article.append(type, prompt);
    if (suggestion.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "ritual-suggestion-actions";
      const alreadyActive = currentCircleRitualPrompt?.sourceSuggestionAuthorUid === authorUid &&
        currentCircleRitualPrompt?.sourceSuggestionId === suggestionId;
      const use = document.createElement("button");
      use.type = "button";
      use.className = "primary";
      use.textContent = alreadyActive ? "Confirm selected" : "Publish this prompt";
      use.disabled = !alreadyActive && !!currentCircleRitualId;
      use.addEventListener("click", () => alreadyActive
        ? reviewCircleRitualSuggestion(authorUid, suggestionId, "selected")
        : publishCircleRitual(suggestion.type, suggestion.prompt, {authorUid, suggestionId})
      );
      const decline = document.createElement("button");
      decline.type = "button";
      decline.className = "secondary";
      decline.textContent = "Decline";
      decline.addEventListener("click", () =>
        reviewCircleRitualSuggestion(authorUid, suggestionId, "declined")
      );
      actions.append(use, decline);
      article.append(actions);
    }
    list.append(article);
  }
}

function listenToCircleRituals(clubId) {
  const view = circleSession.view;
  const state = {view, recovery:null, render:null};
  circleRitualListenerState = state;
  const ownerControls = document.getElementById("ritualOwnerControls");
  const ownerSuggestions = document.getElementById("ritualOwnerSuggestions");
  if (ownerControls) ownerControls.hidden = !currentCircleRitualOwner;
  if (ownerSuggestions) ownerSuggestions.hidden = !currentCircleRitualOwner;
  if (currentCircleRitualOwner) {
    listenCircle("ritual-suggestions", clubId, "rituals/suggestions", snapshot => {
      currentCircleRitualSuggestions = snapshot.val() || {};
      renderCircleRitualSuggestions(currentCircleRitualSuggestions);
    });
  }
  state.render = ritualId => {
    if (circleRitualListenerState !== state || !circleSession.isActive(view)) return;
    clearActiveCircleRitual();
    const content = document.getElementById("ritualActiveContent");
    content?.replaceChildren();
    const participation = document.getElementById("ritualParticipation");
    if (participation) participation.hidden = true;
    const closeButton = document.getElementById("closeCircleRitualButton");
    if (closeButton) closeButton.hidden = true;
    if (ritualId === null) {
      const pill = document.getElementById("ritualStatusPill");
      if (pill) pill.textContent = "No active ritual";
      renderCircleRitualSuggestions(currentCircleRitualSuggestions);
      const empty = document.createElement("p");
      empty.className = "status";
      empty.textContent = "No active ritual right now.";
      content?.append(empty);
      return;
    }
    if (typeof ritualId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(ritualId)) {
      circleUnavailable(view);
      return;
    }
    currentCircleRitualId = ritualId;
    renderCircleRitualSuggestions(currentCircleRitualSuggestions);
    const pill = document.getElementById("ritualStatusPill");
    if (pill) pill.textContent = "Loading ritual…";
    listenCircle("ritual-prompt", clubId, `rituals/prompts/${ritualId}`, (promptSnapshot, valid) => {
      if (!valid()) return;
      if (!promptSnapshot.exists()) {
        circleUnavailable(view);
        return;
      }
      currentCircleRitualPrompt = promptSnapshot.val();
      if (!renderCircleRitualPrompt(ritualId, currentCircleRitualPrompt)) {
        circleUnavailable(view);
        return;
      }
      renderCircleRitualSuggestions(currentCircleRitualSuggestions);
    });
    listenCircle("ritual-responses", clubId, `rituals/responses/${ritualId}`, (responseSnapshot, valid) => {
      if (!valid()) return;
      currentCircleRitualResponses = responseSnapshot.val() || {};
      renderCircleRitualResponses();
      const ownResponse = currentCircleRitualResponses[currentUser?.uid];
      const input = document.getElementById("ritualResponseInput");
      if (input && typeof ownResponse?.text === "string") input.value = ownResponse.text;
    });
  };
  listenCircle("ritual-active", clubId, "rituals/activeRitualId", (snapshot, valid) => {
    if (!valid() || circleRitualListenerState !== state) return;
    const pending = state.recovery;
    if (pending) {
      pending.hasNext = true;
      pending.nextId = snapshot.val();
      resumeCircleRitualRead(state, pending);
    } else state.render(snapshot.val());
  });
}

function ritualOperation(action) {
  if (circleRitualListenerState?.recovery) {
    showCircleRitualStatus("Please wait for ritual access to be confirmed, or reopen this circle to retry.");
    return Promise.resolve();
  }
  const operation = circleSession.capture();
  if (!operation || currentUser?.uid !== operation.uid) return Promise.resolve();
  if (circleRitualInFlight?.operation.valid()) {
    showCircleRitualStatus("A ritual change is still awaiting confirmation. Please wait before trying another change.");
    return circleRitualInFlight.promise;
  }
  const pending = {operation,promise:null};
  circleRitualInFlight = pending;
  pending.promise = Promise.resolve().then(() =>
    operation.valid() ? action(operation) : undefined
  ).catch(error => {
    if (error === CIRCLE_SESSION_ENDED || !operation.valid()) return;
    if (isFriendshipPermissionDenied(error)) {
      circleUnavailable(operation.view, error);
      return;
    }
    circleDiagnostic("circle-ritual-operation", error);
    showCircleRitualStatus(
      "That change could not be fully confirmed. Some steps may already be saved; retry to safely continue.",
      "Retry",
      () => {
        if (operation.valid()) return ritualOperation(action);
      }
    );
  }).finally(() => {
    if (circleRitualInFlight === pending) circleRitualInFlight = null;
  });
  return pending.promise;
}

function ritualPromptMatches(actual, expected) {
  if (!actual || typeof actual !== "object") return false;
  const keys = Object.keys(expected).sort();
  return Object.keys(actual).sort().join("|") === keys.join("|") &&
    keys.every(key => actual[key] === expected[key]);
}

async function publishCircleRitual(type, promptText, sourceSuggestion = null) {
  return ritualOperation(async operation => {
    const prompt = String(promptText || "").trim();
    if (!currentCircleRitualOwner || !["sunday-bookmark", "between-the-lines"].includes(type) ||
        !prompt || prompt.length > 600) {
      showCircleRitualStatus("Choose a ritual type and enter a prompt of 600 characters or fewer.");
      return;
    }
    const pending = pendingCircleRitualPublish;
    if (pending && (pending.clubId !== operation.clubId || pending.uid !== operation.uid ||
        pending.type !== type || pending.prompt !== prompt ||
        pending.sourceSuggestionId !== (sourceSuggestion?.suggestionId || null) ||
        pending.sourceAuthorUid !== (sourceSuggestion?.authorUid || null))) {
      showCircleRitualStatus("Retry or finish the pending publish before preparing another ritual.");
      return;
    }
    const state = pending || {
      clubId:operation.clubId,
      uid:operation.uid,
      ritualId:push(ref(database, `clubs/${operation.clubId}/rituals/prompts`)).key,
      type,
      prompt,
      sourceSuggestionId:sourceSuggestion?.suggestionId || null,
      sourceAuthorUid:sourceSuggestion?.authorUid || null,
      publishedAt:Date.now()
    };
    if (!state.ritualId || !/^[A-Za-z0-9_-]{8,64}$/.test(state.ritualId)) {
      throw new Error("Could not create a valid ritual identifier.");
    }
    pendingCircleRitualPublish = state;
    const record = {
      ritualId:state.ritualId,
      type:state.type,
      prompt:state.prompt,
      spoilerSafe:true,
      publishedBy:state.uid,
      publishedAt:state.publishedAt,
      ...(state.sourceSuggestionId ? {
        sourceSuggestionId:state.sourceSuggestionId,
        sourceSuggestionAuthorUid:state.sourceAuthorUid
      } : {})
    };
    const promptPath = `clubs/${state.clubId}/rituals/prompts/${state.ritualId}`;
    const existing = await circleStep(operation, () => get(ref(database, promptPath)));
    if (existing.exists()) {
      if (!ritualPromptMatches(existing.val(), record)) {
        throw new Error("The pending ritual ID belongs to a different record.");
      }
    } else {
      await circleStep(operation, () => set(ref(database, promptPath), record));
    }
    const activePath = `clubs/${state.clubId}/rituals/activeRitualId`;
    const active = await circleStep(operation, () => get(ref(database, activePath)));
    if (active.val() !== state.ritualId) {
      if (active.exists()) {
        showCircleRitualStatus("Close the current ritual before publishing another one.");
        return;
      }
      const result = await circleStep(operation, () => runTransaction(
        ref(database, activePath),
        value => operation.valid() && value === null ? state.ritualId : undefined,
        {applyLocally:false}
      ));
      if (!result.committed) {
        const confirmed = await circleStep(operation, () => get(ref(database, activePath)));
        if (confirmed.val() !== state.ritualId) {
          showCircleRitualStatus("Another ritual became active first. Review it before retrying.");
          return;
        }
      }
    }
    let reviewConfirmed = true;
    if (state.sourceSuggestionId && state.sourceAuthorUid) {
      reviewConfirmed = await confirmCircleRitualSuggestionReview(
        operation, state.sourceAuthorUid, state.sourceSuggestionId, "selected"
      );
    }
    pendingCircleRitualPublish = null;
    const promptInput = document.getElementById("ritualPromptInput");
    if (promptInput) promptInput.value = "";
    showCircleRitualStatus(reviewConfirmed
      ? "Your ritual is active. Members can now respond."
      : "Your ritual is active, but the suggestion was already reviewed differently. Its original record was preserved.");
  });
}

window.publishCircleRitualFromForm = function () {
  return publishCircleRitual(
    document.getElementById("ritualTypeSelect")?.value,
    document.getElementById("ritualPromptInput")?.value
  );
};

window.closeActiveCircleRitual = function () {
  return ritualOperation(async operation => {
    const expectedId = currentCircleRitualId;
    if (!currentCircleRitualOwner || !expectedId) return;
    const path = `clubs/${operation.clubId}/rituals/activeRitualId`;
    const result = await circleStep(operation, () => runTransaction(
      ref(database, path),
      value => operation.valid() && value === expectedId ? null : undefined,
      {applyLocally:false}
    ));
    if (!result.committed) {
      const current = await circleStep(operation, () => get(ref(database, path)));
      if (current.exists()) {
        showCircleRitualStatus("The active ritual changed before it could be closed. Refresh and review it.");
        return;
      }
    }
    showCircleRitualStatus("Ritual closed. Its prompt and responses remain preserved.");
  });
};

window.saveCircleRitualResponse = function () {
  return ritualOperation(async operation => {
    const ritualId = currentCircleRitualId;
    const input = document.getElementById("ritualResponseInput");
    const text = input?.value.trim() || "";
    if (!ritualId || !text || text.length > 2400) {
      showCircleRitualStatus("Write a response of up to 2,400 characters.");
      return;
    }
    const path = `clubs/${operation.clubId}/rituals/responses/${ritualId}/${operation.uid}`;
    const result = await circleStep(operation, () => runTransaction(
      ref(database, path),
      existing => {
        if (!operation.valid()) return undefined;
        const createdAt = existing?.createdAt ?? Date.now();
        return {
          memberUid:operation.uid,
          text,
          createdAt,
          updatedAt:Math.max(Date.now(), createdAt)
        };
      },
      {applyLocally:false}
    ));
    if (!result.committed) throw new Error("Response was not acknowledged.");
    showCircleRitualStatus("Your response is saved for this circle.");
  });
};

window.submitCircleRitualSuggestion = function () {
  return ritualOperation(async operation => {
    const type = document.getElementById("ritualSuggestionType")?.value;
    const input = document.getElementById("ritualSuggestionInput");
    const prompt = input?.value.trim() || "";
    if (!["sunday-bookmark", "between-the-lines"].includes(type) || !prompt || prompt.length > 600) {
      showCircleRitualStatus("Choose a ritual type and enter an idea of 600 characters or fewer.");
      return;
    }
    let state = pendingCircleRitualSuggestion;
    if (state && (state.clubId !== operation.clubId || state.uid !== operation.uid ||
        state.type !== type || state.prompt !== prompt)) {
      showCircleRitualStatus("Retry your pending suggestion before sending another one.");
      return;
    }
    if (!state) {
      state = {
        clubId:operation.clubId,
        uid:operation.uid,
        suggestionId:push(ref(
          database, `clubs/${operation.clubId}/rituals/suggestions/${operation.uid}`
        )).key,
        type,
        prompt,
        createdAt:Date.now()
      };
      pendingCircleRitualSuggestion = state;
    }
    const value = {
      authorUid:state.uid,
      type:state.type,
      prompt:state.prompt,
      createdAt:state.createdAt,
      status:"pending"
    };
    const path = `clubs/${state.clubId}/rituals/suggestions/${state.uid}/${state.suggestionId}`;
    const existing = await circleStep(operation, () => get(ref(database, path)));
    if (existing.exists()) {
      if (!ritualPromptMatches(existing.val(), value)) {
        throw new Error("The pending suggestion ID belongs to a different record.");
      }
    } else {
      await circleStep(operation, () => set(ref(database, path), value));
    }
    pendingCircleRitualSuggestion = null;
    input.value = "";
    showCircleRitualStatus("Your suggestion was sent privately to the Circle Owner.");
  });
};

async function confirmCircleRitualSuggestionReview(operation, authorUid, suggestionId, status) {
  const path = `clubs/${operation.clubId}/rituals/suggestions/${authorUid}/${suggestionId}`;
  const existing = await circleStep(operation, () => get(ref(database, path)));
  if (!existing.exists()) return false;
  if (existing.val().status === status) return true;
  if (existing.val().status !== "pending") return false;
  await circleStep(operation, () => set(ref(database, `${path}/status`), status));
  return true;
}

async function reviewCircleRitualSuggestion(authorUid, suggestionId, status) {
  return ritualOperation(async operation => {
    if (!currentCircleRitualOwner ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(authorUid || "") ||
        !/^[A-Za-z0-9_-]{8,64}$/.test(suggestionId || "") ||
        !["selected", "declined"].includes(status)) return;
    const confirmed = await confirmCircleRitualSuggestionReview(operation, authorUid, suggestionId, status);
    showCircleRitualStatus(!confirmed
      ? "This suggestion was already reviewed differently. Its saved record was preserved."
      : status === "selected"
      ? "Suggestion marked as selected."
      : "Suggestion declined.");
  });
}

window.addBookToClub = async function () {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  const title = document.getElementById("bookTitle").value.trim();
  const author = document.getElementById("bookAuthor").value.trim();
  const category = document.getElementById("bookCategory").value;
  const image = document.getElementById("bookImage").value.trim();

  if (!title) {
    alert("Enter a book title.");
    return;
  }

  const bookRef = push(
    ref(database, "users/" + currentUser.uid + "/library")
  );

  await set(bookRef, {
    title,
    author,
    category,
    image,
    createdAt: Date.now()
  });

  document.getElementById("bookTitle").value = "";
  document.getElementById("bookAuthor").value = "";
  document.getElementById("bookImage").value = "";

  alert("Book added to My Library.");
};
window.addBookToClubCollection = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) {
    alert("Open a society first.");
    return;
  }

  const title = document.getElementById("bookTitleClub").value.trim();
  const author = document.getElementById("bookAuthorClub").value.trim();
  const category = document.getElementById("bookCategoryClub").value;
  const image = document.getElementById("bookImageClub").value.trim();
const genre =
  document.getElementById("bookGenreClub").value.trim();

const lengthType =
  document.getElementById("bookLengthTypeClub").value;

const lengthCount =
  document.getElementById("bookLengthCountClub").value.trim();

const synopsis =
  document.getElementById("bookSynopsisClub").value.trim();
  if (!title) {
    alert("Enter a book title.");
    return;
  }

  const bookRef = push(
    ref(database, "clubs/" + operation.clubId + "/collection")
  );

  await circleStep(operation, () => set(bookRef, {
  title,
  author,
  
  image,

  genre,
  lengthType,
  lengthCount,
  synopsis,

  addedBy: currentUser.uid,
  createdAt: Date.now()
}));

  document.getElementById("bookTitleClub").value = "";
document.getElementById("bookAuthorClub").value = "";
document.getElementById("bookImageClub").value = "";

document.getElementById("bookGenreClub").value = "";
document.getElementById("bookLengthTypeClub").value = "pages";
document.getElementById("bookLengthCountClub").value = "";
document.getElementById("bookSynopsisClub").value = "";
closeAddCollectionBookModal();
  showToast("Added to The Collection.");
  });
};

window.spinBook = function () {
  if (!window.currentClubId) return alert("Open a circle first.");

  if (!currentLibraryBooks || currentLibraryBooks.length === 0) {
    document.getElementById("winner").innerHTML =
      "Add books to your Library first.";
    return;
  }

  const selectedCategory = document.getElementById("spinCategory").value;

  const filteredBooks =
    selectedCategory === "All Books"
      ? currentLibraryBooks
      : currentLibraryBooks.filter(book => book.category === selectedCategory);

  if (filteredBooks.length === 0) {
    document.getElementById("winner").innerHTML =
      "No books in this category yet.";
    return;
  }

  const spinButton = document.getElementById("spinButton");
  const winner = document.getElementById("winner");

  spinButton.disabled = true;
  winner.innerHTML = "Choosing...";

  let count = 0;
  const maxCount = 18;

  const interval = setInterval(() => {
    document.querySelectorAll("#randomizerBooks .randomizer-spine")
      .forEach(book => book.classList.remove("active"));

    const randomBook =
      filteredBooks[Math.floor(Math.random() * filteredBooks.length)];

    const activeBook =
      document.getElementById("libraryRandomizerBook-" + randomBook.id);

    if (activeBook) activeBook.classList.add("active");

    count++;

    if (count >= maxCount) {
      clearInterval(interval);

      const finalBook =
        filteredBooks[Math.floor(Math.random() * filteredBooks.length)];

      document.querySelectorAll("#randomizerBooks .randomizer-spine")
        .forEach(book => book.classList.remove("active"));

      const finalElement =
        document.getElementById("libraryRandomizerBook-" + finalBook.id);

      if (finalElement) finalElement.classList.add("active");

      winner.innerHTML = `
        <h3>${escapeHTML(finalBook.title)}</h3>
        ${finalBook.author ? `<div class="small">by ${escapeHTML(finalBook.author)}</div>` : ""}
      `;

      spinButton.disabled = false;
    }
  }, 120);
};

window.spinBookFromClub = function () {
  const operation = circleSession.capture();
  if (!operation) return;
  if (!window.currentClubId) return alert("Open a society first.");

  if (!currentCollectionBooks || currentCollectionBooks.length === 0) {
    document.getElementById("winnerClub").innerHTML =
      "Add books to The Collection first.";
    return;
  }

  const selectedCategory = document.getElementById("spinCategoryClub").value;

  const filteredBooks =
    selectedCategory === "All Books"
      ? currentCollectionBooks
      : currentCollectionBooks.filter(book => book.category === selectedCategory);

  if (filteredBooks.length === 0) {
    document.getElementById("winnerClub").innerHTML =
      "No books in this category yet.";
    return;
  }

  const spinButton = document.getElementById("spinButtonClub");
  const winner = document.getElementById("winnerClub");

  spinButton.disabled = true;
  winner.innerHTML = "Fate is deciding...";

  let count = 0;
  const maxCount = 18;

  const interval = setInterval(() => {
    if (!operation.valid()) { clearInterval(interval); return; }
    document.querySelectorAll("#randomizerBooksClub .randomizer-spine")
      .forEach(book => book.classList.remove("active"));

    const randomBook =
      filteredBooks[Math.floor(Math.random() * filteredBooks.length)];

    const activeBook =
      document.getElementById("collectionRandomizerBook-" + randomBook.id);

    if (activeBook) activeBook.classList.add("active");

    count++;

    if (count >= maxCount) {
      clearInterval(interval);

      const finalBook =
        filteredBooks[Math.floor(Math.random() * filteredBooks.length)];

      window.lastPick = finalBook;

      document.querySelectorAll("#randomizerBooksClub .randomizer-spine")
        .forEach(book => book.classList.remove("active"));

      const finalElement =
        document.getElementById("collectionRandomizerBook-" + finalBook.id);

      if (finalElement) finalElement.classList.add("active");

      winner.innerHTML = `
  <div class="fate-result-card">

    <div class="fate-result-kicker">
      Fate has chosen
    </div>

    <div class="fate-result-title">
      ${escapeHTML(finalBook.title)}
    </div>

    ${
      finalBook.author
        ? `<div class="small">by ${escapeHTML(finalBook.author)}</div>`
        : ""
    }

    <button onclick="setNextRead()">
      Set as Featured Volume
    </button>

  </div>
`;

      spinButton.disabled = false;
    }
  }, 120);
};

window.setNextRead = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a society first.");
  if (!window.lastPick) return alert("Let Fate Decides choose a book first.");
  const pick = window.lastPick;

  await circleStep(operation, () => set(ref(database, "clubs/" + operation.clubId + "/nextRead"), {
    title: pick.title || "",
    author: pick.author || "",
    category: pick.category || "",
    image: pick.image || "",
    sourceCollectionBookId: pick.id,
    setAt: Date.now()
  }));

  await circleStep(operation, () => set(
    ref(database, "clubs/" + operation.clubId + "/collection/" + pick.id),
    null
  ));

  window.lastPick = null;

  document.getElementById("winnerClub").innerHTML =
    "Featured Volume has been set.";

  showToast("Featured Volume set!");
  });
}; 

window.markNextReadFinished = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");

  const nextReadSnapshot = await circleStep(operation, () => get(ref(database, "clubs/" + operation.clubId + "/nextRead")));
  const nextRead = nextReadSnapshot.val();

  if (!nextRead) return alert("No next read to finish.");

  const finishedRef = push(ref(database, "clubs/" + operation.clubId + "/booksRead"));

  await circleStep(operation, () => set(finishedRef, {
    title: nextRead.title || "",
    author: nextRead.author || "",
    category: nextRead.category || "",
    image: nextRead.image || "",
    finishedAt: Date.now(),
    finishedBy: operation.uid
  }));

  await circleStep(operation, () => set(ref(database, "clubs/" + operation.clubId + "/nextRead"), null));
  alert("Moved to Finished Reads!");
  });
};
window.updateClubProgress = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) {
    alert("Open a society first.");
    return;
  }

  const progress = prompt("Where is the club currently reading? Example: Chapters 21–36");

  if (!progress) return;

  await circleStep(operation, () => update(ref(database, "clubs/" + operation.clubId + "/nextRead"), {
    progress,
    updatedAt: Date.now()
  }));

  alert("Club progress updated.");
  });
};
window.postDiscussionComment = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) {
    return alert("Open a circle first.");
  }

  if (!currentUser) {
    return alert("Please log in first.");
  }

  const input = document.getElementById("discussionInput");

  if (!input) {
    return alert("Discussion input could not be found.");
  }

  const message = input.value.trim();

  if (!message) {
    return alert("Write a note first.");
  }

    const userData = await circleStep(operation, () => readPublicProfile(operation.uid));

    const commentRef = push(
      ref(
        database,
        "clubs/" + operation.clubId + "/discussion"
      )
    );

    await circleStep(operation, () => set(commentRef, {
      message,
      authorId: operation.uid,
      authorAlias: userData.username,
      authorAvatar: userData.avatar || "📚",
      authorAvatarPhoto: userData.avatarPhoto || "",
      createdAt: Date.now()
    }));

    input.value = "";
    showToast("Note posted.");
  });
};
window.sendReadingCheckIn = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) {
    alert("Open a circle first.");
    return;
  }

  const input = document.getElementById("checkInAmount");
  const amount = input.value.trim();

  if (!amount) {
    alert("Enter what you finished reading.");
    return;
  }

  const nextReadSnapshot = await circleStep(operation, () => get(
    ref(database, "clubs/" + operation.clubId + "/nextRead")
  ));

  const nextRead = nextReadSnapshot.val();

  if (!nextRead) {
    alert("Set a Featured Volume first so your check-in knows which book you mean.");
    return;
  }

  const userData = await circleStep(operation, () => readPublicProfile(operation.uid));

  const name = userData.username;
  const avatar = userData.avatar || "📚";
  const bookTitle = nextRead.title || "the current read";
  const bookAuthor = nextRead.author ? " by " + nextRead.author : "";

  const message = `
<div class="checkin-label">🕯️ Reading Check-In</div>

<div class="checkin-text">
  Finished ${amount} of
</div>

<div class="checkin-book">
  ${bookTitle}${bookAuthor} ✨
</div>
`;

  
await circleStep(operation, () => set(
  ref(database, "clubs/" + operation.clubId + "/checkIns/" + operation.uid),
  {
    name,
    avatar,
    amount,
    bookTitle,
    checkedInAt: Date.now()
  }
));
  input.value = "";
  alert("Your reading circle has been notified!");
  });
};
window.undoReadingCheckIn = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) {
    alert("Open a circle first.");
    return;
  }

  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  await circleStep(operation, () => set(
    ref(database, "clubs/" + operation.clubId + "/checkIns/" + operation.uid),
    null
  ));

  alert("Your check-in was removed.");
  });
};
window.postDiscussionCommentFromClub = async function () {
  return runCircleOperation(async operation => {
  const input = document.getElementById("discussionInputClub");
  if (!input) return;
  const message = input.value.trim();
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!message) return alert("Write a note first.");
  const userData = await circleStep(operation, () => readPublicProfile(operation.uid));
  const commentRef = push(ref(database, "clubs/" + operation.clubId + "/discussion"));
  await circleStep(operation, () => set(commentRef, {
  message,
  authorId: operation.uid,
  authorAlias: userData.username,
  authorAvatar: userData.avatar || "📚",
  authorAvatarPhoto: userData.avatarPhoto,
createdAt: Date.now()
}));
  input.value = "";
  });
};

window.deleteFinishedBook = async function (bookId) {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!confirm("Remove this finished read?")) return;

  await circleStep(operation, () => set(ref(database, "clubs/" + operation.clubId + "/booksRead/" + bookId), null));
  alert("Finished read removed.");
  });
};

window.deleteBook = async function (bookId) {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!confirm("Delete this book from the circle?")) return;

  await circleStep(operation, () => set(ref(database, "clubs/" + operation.clubId + "/books/" + bookId), null));
  showToast("Book deleted.");
  });
};

window.editBook = async function (bookId) {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");

  const book = currentClubBooks.find(b => b.id === bookId);
  if (!book) return alert("Book not found.");

  const newTitle = prompt("Edit book title:", book.title || "");
  if (newTitle === null) return;

  const newAuthor = prompt("Edit author name:", book.author || "");
  if (newAuthor === null) return;

  const newCategory = prompt("Edit category:", book.category || "Book Club Pick");
  if (newCategory === null) return;

  const newImage = prompt("Edit cover image URL:", book.image || "");
  if (newImage === null) return;

  await circleStep(operation, () => update(ref(database, "clubs/" + operation.clubId + "/books/" + bookId), {
    title: newTitle.trim(),
    author: newAuthor.trim(),
    category: newCategory.trim(),
    image: newImage.trim(),
    updatedAt: Date.now()
  }));

  showToast("Book updated.");
  });
};
window.deleteCollectionBook = async function (bookId) {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a society first.");
  if (!confirm("Delete this book from The Collection?")) return;

  await circleStep(operation, () => set(ref(database, "clubs/" + operation.clubId + "/collection/" + bookId), null));
  alert("Book deleted from The Collection.");
  });
};
window.deletePersonalBook = async function (bookId) {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  if (!confirm("Delete this book from My Library?")) return;

  await set(ref(database, "users/" + currentUser.uid + "/library/" + bookId), null);

  alert("Book deleted from My Library.");
};
window.editPersonalBook = async function (bookId) {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  const book = currentLibraryBooks.find(b => b.id === bookId);
  if (!book) return alert("Book not found.");

  const newTitle = prompt("Edit book title:", book.title || "");
  if (newTitle === null) return;

  const newAuthor = prompt("Edit author name:", book.author || "");
  if (newAuthor === null) return;

  const newCategory = prompt("Edit category:", book.category || "Book Club Pick");
  if (newCategory === null) return;

  const newImage = prompt("Edit cover image URL:", book.image || "");
  if (newImage === null) return;

  await update(ref(database, "users/" + currentUser.uid + "/library/" + bookId), {
    title: newTitle.trim(),
    author: newAuthor.trim(),
    category: newCategory.trim(),
    image: newImage.trim(),
    updatedAt: Date.now()
  });

  alert("Book updated in My Library.");
};
window.editCollectionBook = async function (bookId) {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a society first.");

  const book = currentCollectionBooks.find(b => b.id === bookId);
  if (!book) return alert("Book not found.");

  const newTitle = prompt("Edit book title:", book.title || "");
  if (newTitle === null) return;

  const newAuthor = prompt("Edit author name:", book.author || "");
  if (newAuthor === null) return;

  const newCategory = prompt("Edit category:", book.category || "Book Club Pick");
  if (newCategory === null) return;

  const newImage = prompt("Edit cover image URL:", book.image || "");
  if (newImage === null) return;

  await circleStep(operation, () => update(ref(database, "clubs/" + operation.clubId + "/collection/" + bookId), {
    title: newTitle.trim(),
    author: newAuthor.trim(),
    category: newCategory.trim(),
    image: newImage.trim(),
    updatedAt: Date.now()
  }));

  alert("Collection book updated.");
  });
};
window.togglePasswordVisibility = function () {
  const passwordInput = document.getElementById("loginPassword");
  const toggleButton = document.getElementById("passwordToggle");

  if (!passwordInput || !toggleButton) return;

  const isHidden = passwordInput.type === "password";

  passwordInput.type = isHidden ? "text" : "password";

  toggleButton.classList.toggle("open", isHidden);

  toggleButton.setAttribute(
    "aria-label",
    isHidden ? "Hide password" : "Show password"
  );

  toggleButton.setAttribute(
    "aria-pressed",
    String(isHidden)
  );
};
window.openMembersModal = function () {
  const modal = document.getElementById("membersModal");
  const modalList = document.getElementById("membersModalList");

  if (!modal || !modalList) {
    alert("Members modal is missing.");
    return;
  }
document.querySelector(".phone-frame").classList.add("modal-open");
  modal.style.display = "flex";

  if (!window.currentClubId) {
    modalList.innerHTML = `<p class="status">No club selected.</p>`;
    return;
  }

  if (!modalList.innerHTML.trim()) {
    modalList.innerHTML = `<p class="status">Loading members...</p>`;
  }
};

window.closeMembersModal = function () {
  const modal = document.getElementById("membersModal");
  document.querySelector(".phone-frame").classList.remove("modal-open");
  if (modal) modal.style.display = "none";
};

window.removeClub = async function (clubId) {
  return runCircleOperation(async operation => {
  if (!currentUser) return alert("Please log in first.");
  if (!confirm("Remove this circle from your list?")) return;

  await circleStep(operation, () => set(ref(database, "users/" + operation.uid + "/clubs/" + clubId), null));
  if (circleSession.view?.clubId === clubId) circleSession.closeCircle();
  alert("Circle removed from your list.");
  }, true);
};
window.editcircleName = async function (clubId) {
  return runCircleOperation(async operation => {
  if (!currentUser) return alert("Please log in first.");

  if (clubId !== operation.clubId) return;
  const [ownerSnapshot, nameSnapshot] = await Promise.all([
    circleStep(operation, () => get(ref(database, `clubs/${clubId}/access/ownerUid`))),
    circleStep(operation, () => get(ref(database, `clubs/${clubId}/name`)))
  ]);
  if (!nameSnapshot.exists()) return alert("Circle not found.");
  if (ownerSnapshot.val() !== operation.uid) {
    return alert("Only the circle creator can rename this circle.");
  }

  const newName = prompt("Edit circle name:", nameSnapshot.val() || "");

  if (newName === null) return;
  if (!newName.trim()) return alert("Circle name cannot be blank.");

  await circleStep(operation, () => set(
    ref(database, `clubs/${clubId}/name`),
    newName.trim()
  ));

  showToast("Circle updated.");
  }, true);
};

window.deleteCircle = circleDeletionUnavailable;
function formatTimeAgo(timestamp) {
  if (!timestamp) return "Just now";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return days + "d ago";
}

window.reactToComment = async function (commentId, reactionType) {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(reactionType)) return;

  const commentRef = ref(database, "clubs/" + operation.clubId + "/discussion/" + commentId);
  const snapshot = await circleStep(operation, () => get(commentRef));
  const comment = snapshot.val();
  if (!comment) return;

  await circleStep(operation, () => runTransaction(
    ref(database, `clubs/${operation.clubId}/discussion/${commentId}/reactions/${reactionType}`),
    count => (Number(count) || 0) + 1
  ));
  });
};

window.toggleReactionPicker = function (commentId) {
  const picker = document.getElementById("reactionPicker-" + commentId);
  if (!picker) return;
  picker.classList.toggle("show");
};

window.editDiscussionComment = async function (commentId) {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");

  const commentRef = ref(database, "clubs/" + operation.clubId + "/discussion/" + commentId);
  const snapshot = await circleStep(operation, () => get(commentRef));
  const comment = snapshot.val();

  if (!comment) return alert("Note not found.");

  const updatedMessage = prompt("Edit your Marginalia note:", comment.message || "");
  if (updatedMessage === null) return;

  if (!updatedMessage.trim()) return alert("Note cannot be blank.");

  await circleStep(operation, () => update(commentRef, {
    message: updatedMessage.trim(),
    editedAt: Date.now()
  }));

  showToast("Note updated.");
  });
};

window.deleteDiscussionComment = async function (commentId) {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!confirm("Delete this Marginalia note?")) return;

  await circleStep(operation, () => set(ref(database, "clubs/" + operation.clubId + "/discussion/" + commentId), null));
  alert("Note deleted.");
  });
};

function buildInviteText(clubId, clubName) {
  const inviteLink = window.location.origin + window.location.pathname + "?club=" + clubId;

  return {
    inviteLink,
    inviteText: "Join my Spine Society Circle: " + clubName + "\n" + inviteLink
  };
}

window.textCurrentClubInvite = function (clubId, clubName) {
  const invite = buildInviteText(clubId, clubName);
  window.location.href = "sms:?&body=" + encodeURIComponent(invite.inviteText);
};

window.emailCurrentClubInvite = function (clubId, clubName) {
  const invite = buildInviteText(clubId, clubName);
  const subject = "Join my Spine Society circle: " + clubName;

  window.location.href =
    "mailto:?subject=" + encodeURIComponent(subject) +
    "&body=" + encodeURIComponent(invite.inviteText);
};

window.copyCurrentClubInvite = async function (clubId, clubName) {
  return runCircleOperation(async operation => {
  const invite = buildInviteText(clubId, clubName);

  try {
    await circleStep(operation, () => navigator.clipboard.writeText(invite.inviteText));
    alert("Invite copied.");
  } catch (error) {
    if (!operation.valid()) return;
    prompt("Copy this invite:", invite.inviteText);
  }
  }, true);
};

function handleInviteLink() {
  const params = new URLSearchParams(window.location.search);
  const clubId = params.get("club");

  if (clubId) {
    document.getElementById("joinClubId").value = clubId;
    showScreen("nook");
    const form = document.getElementById("nookCircleForm");
    if (form && !form.classList.contains("show")) window.toggleNookCircleForm();
    pendingCircleAccessClubId = extractClubId(clubId);
    showCircleAccessStatus(
      "Circle link detected. Check access to open the circle or request access; nothing is submitted automatically."
    );
  }
}
function getAuthErrorMessage(error) {
  switch (error.code) {
    case "auth/invalid-email":
      return "That email doesn’t look quite right.";

    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password doesn’t match our records.";

    case "auth/email-already-in-use":
      return "An account already exists with this email.";

    case "auth/weak-password":
      return "Password should be at least 6 characters.";

    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before finishing.";

    case "auth/network-request-failed":
      return "Network issue. Check your connection and try again.";

    default:
      return "Something went wrong. Please try again.";
  }
}
function showLibraryLoader() {
  const loader = document.getElementById("libraryLoader");
  const loaderText = document.getElementById("loaderText");

  if (loaderText) {
    loaderText.textContent =
      loadingMessages[
        Math.floor(Math.random() * loadingMessages.length)
      ];
  }

  if (loader) {
    loader.classList.add("show");
  }
}

function hideLibraryLoader() {
  const loader = document.getElementById("libraryLoader");

  if (loader) {
    loader.classList.remove("show");
  }
}
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.className = "";
  toast.classList.add("show", type);

  clearTimeout(window.toastTimeout);

  window.toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}
onAuthStateChanged(auth, async (user) => {
  circleSession.begin(user);
  const friendship = friendshipSession.begin(user);
  const session = personalLibrarySession.begin(user?.uid ?? null);
  stopBookmarkListener();
  clearBookmarkDisplays();
  const authScreen = document.getElementById("authScreen");
  const mainApp = document.getElementById("mainApp");
  const mainNav = document.getElementById("mainNav");

  if (!user) {
    currentUser = null;
    authScreen.style.display = "block";
    mainApp.style.display = "none";
    mainNav.style.display = "none";
    hideLibraryLoader();
    return;
  }

  try {
  if (!user.emailVerified) {
  currentUser = null;
  window.currentClubId = null;
  window.currentNextRead = null;

  authScreen.style.display = "block";
  mainApp.style.display = "none";
  mainNav.style.display = "none";

  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  showToast(
  "Please verify your email before entering Spine Society.",
  "error"
);

const resendBtn = document.getElementById("resendVerificationBtn");

if (resendBtn) {
  resendBtn.style.display = "block";
}

hideLibraryLoader();

return;
}
  await wait(1500);
if (!personalLibrarySession.isCurrent(session)) return;

hideLibraryLoader();

currentUser = user;

authScreen.style.display = "none";
mainApp.style.display = "block";
mainNav.style.display = "grid";

    document.getElementById("accountEmail").textContent =
      "Signed in as " + (user.email || "Google user");

    await ensureUserRecord(user);
    if (!personalLibrarySession.isCurrent(session)) return;

    const userData = await readPublicProfile(user.uid);
    if (!personalLibrarySession.isCurrent(session)) return;

    document.getElementById("usernameInput").value =
      userData.username === "Reader" ? "" : userData.username;
    document.getElementById("currentUsername").textContent =
      "Reader Alias: " + userData.username;
    document.getElementById("nookReaderName").textContent = userData.username;

    if (userData.avatar === "photo") {
      const avatar = document.getElementById("profileAvatar");

      if (avatar) {
        if (userData.avatarPhoto) avatar.src = userData.avatarPhoto;
        else avatar.removeAttribute("src");
        avatar.style.display = userData.avatarPhoto ? "block" : "none";
      }

      document.getElementById("currentAvatar").textContent =
        "Current Avatar: Photo";
    } else if (userData.avatar) {
      const avatarInput = document.getElementById("avatarInput");

      if (avatarInput) avatarInput.value = userData.avatar;

      document.getElementById("currentAvatar").textContent =
        "Current Avatar: " + userData.avatar;
    }

listenToUserClubs();
listenForCircleInvitations(circleSession.current);
listenToPersonalLibrary(session);
listenForFriendRequests(friendship);
listenForFriends(friendship);
    listenForBookmarks(session);
handleInviteLink();
showScreen("nook");

  } catch (error) {
    if (!personalLibrarySession.isCurrent(session)) return;
    console.error("Login load error:", error);
    alert("You signed in, but something failed while loading your profile: " + error.message);
  }
});

window.finishFeaturedBook = async function () {
  return runCircleOperation(async operation => {
  const user = auth.currentUser;
  const clubId = operation.clubId;
  const nextRead = window.currentNextRead;

  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");
  if (!nextRead) return alert("No featured volume selected.");

  const confirmFinish = confirm(
    `Move "${nextRead.title}" to Finished Reads and clear the current reading goal?`
  );

  if (!confirmFinish) return;

  const finishedAt = Date.now();
  const finishedId = push(ref(database, `clubs/${clubId}/booksRead`)).key;
  const changes = {
    [`booksRead/${finishedId}`]: {
      ...nextRead,
      finishedAt,
      finishedBy: user.uid
    },
    "featuredVolume/currentGoal": "Set your next reading goal",
    "featuredVolume/dueDateLabel": "No due date",
    "featuredVolume/dueDate": null,
    "featuredVolume/totalChapters": null,
    "featuredVolume/updatedAt": finishedAt,
    // Check-ins belong to their reader. Finishing a shared volume must not
    // erase another member's progress or historical root-level check-ins.
    [`featuredVolume/checkins/${operation.uid}`]: null
  };
  await circleStep(operation, () => update(ref(database, `clubs/${clubId}`), changes));

  window.currentNextRead = null;

  const modal = document.getElementById("readingGoalModal");
  if (modal) modal.style.display = "none";

  

  showToast("Book moved to Finished Reads.");
  showClubRoomTab("current");
  });
};
window.saveTotalChapters = async function () {
  return runCircleOperation(async operation => {
  const user = auth.currentUser;
  const clubId = operation.clubId;
  const input = document.getElementById("totalChaptersInput");

  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");
  if (!input.value) return alert("Enter the total number of chapters.");

  await circleStep(operation, () => set(ref(database, `clubs/${clubId}/featuredVolume/totalChapters`), Number(input.value)));

  alert("Chapter count saved!");
  });
};

window.checkInForBook = async function () {
  return runCircleOperation(async operation => {
  const user = auth.currentUser;
  const clubId = operation.clubId;

  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");

  const profile = await circleStep(operation, () => readPublicProfile(operation.uid));
  await circleStep(operation, () => set(ref(database, `clubs/${clubId}/featuredVolume/checkins/${operation.uid}`), {
    name: profile.username || "Reader",
    checkedIn: true,
    checkedInAt: Date.now()
  }));
  });
};
function getDaysLeftText(dueDate) {
  if (!dueDate) return "";

  const [year, month, day] = dueDate.split("-").map(Number);

  const due = new Date(year, month - 1, day);
  const today = new Date();

  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const daysLeft =
    (due.getTime() - today.getTime()) / 86400000;

  if (daysLeft > 1) return `(${daysLeft} days left)`;
  if (daysLeft === 1) return "(1 day left)";
  if (daysLeft === 0) return "(Due today)";
  return "(Past due)";
}
function listenToFeaturedVolumeProgress(clubId) {
  let data = {};
  let members = {};
  const renderProgress = () => {

const totalChapters = data.totalChapters || null;
const checkins = data.checkins || {};

const memberCount = Object.keys(members).length;
    const currentGoal = data.currentGoal || "Chapters 1–5";
    const dueDateLabel = data.dueDateLabel || "May 30";
    const dueDate = data.dueDate || null;
    const input = document.getElementById("totalChaptersInput");
    const chapterText = document.getElementById("chapterCountText");
    const readingGoalDisplay = document.getElementById("readingGoalDisplay");
    const modalGoalDisplay = document.getElementById("modalGoalDisplay");
    const readingDueDisplay = document.getElementById("readingDueDisplay");
    const modalDueDisplay = document.getElementById("modalDueDisplay");
    if (readingGoalDisplay) readingGoalDisplay.textContent = currentGoal;
if (modalGoalDisplay) modalGoalDisplay.textContent = currentGoal;

if (readingDueDisplay) readingDueDisplay.textContent = dueDateLabel;
if (modalDueDisplay) modalDueDisplay.textContent = dueDateLabel;
const readingDueCountdown =
  document.getElementById("readingDueCountdown");

const modalDueCountdown =
  document.getElementById("modalDueCountdown");

const countdownText = getDaysLeftText(dueDate);

if (readingDueCountdown) {
  readingDueCountdown.textContent = countdownText;
}

if (modalDueCountdown) {
  modalDueCountdown.textContent = countdownText;
}

    const checkinsList = document.getElementById("memberCheckinsList");
    const finishedBtn = document.getElementById("finishedBookBtn");
    const lockText = document.getElementById("finishLockText");
    const fill = document.getElementById("clubProgressFill");
    const goalPercent = document.getElementById("goalProgressPercent");
    const goalMessage = document.getElementById("goalProgressMessage");

    const checkedInCount = Object.keys(checkins).length;
    const visibleMemberCount =
  document.querySelectorAll(".featured-reader-avatar").length;

const totalMembers = Math.max(memberCount, checkedInCount, 1);
window.currentClubMemberCount = totalMembers;
    
    const percent = Math.min(
      Math.round((checkedInCount / totalMembers) * 100),
      100
    );
    const everyoneCheckedIn = checkedInCount >= totalMembers;

    if (input && totalChapters) input.value = totalChapters;

    const clubProgressPercentText =
  document.getElementById("clubProgressPercentText");

if (clubProgressPercentText) {
  clubProgressPercentText.textContent = `${percent}%`;
}

if (chapterText) {
  chapterText.textContent = everyoneCheckedIn
    ? "All caught up! 📚"
    : `${totalMembers - checkedInCount} reader${(totalMembers - checkedInCount) === 1 ? "" : "s"} still catching up`;
}

    if (checkinsList) {
  checkinsList.innerHTML = Object.values(checkins).map(member => `
    <div class="checkin-row">
      <span>${escapeHTML(member.name)}</span>
      <span>✅ Goal complete</span>
    </div>
  `).join("");
}
const modalCheckinsPreview =
  document.getElementById("modalCheckinsPreview");

if (modalCheckinsPreview) {
  const checkedMembers = Object.values(checkins);

  modalCheckinsPreview.innerHTML = checkedMembers.length
  ? checkedMembers.map(member => `
      <div class="modal-checkin-row">
        <span class="modal-checkin-name">${escapeHTML(member.name)}</span>
        <span class="modal-checkin-status">✅ Goal Complete</span>
      </div>
    `).join("")
  : `<div class="checkin-loading">No one has completed this goal yet.</div>`;
}
    if (fill) fill.style.width = `${percent}%`;

    if (goalPercent) {
      goalPercent.textContent = `${percent}%`;
    }

    if (goalMessage) {
  goalMessage.textContent = everyoneCheckedIn
    ? "Everyone's in! 🎉"
    : "Most are on track! ✨";
}
const modalClubStatus =
  document.getElementById("modalClubStatus");

const modalClubStatusPercent =
  document.getElementById("modalClubStatusPercent");

if (modalClubStatus) {
  modalClubStatus.textContent =
    `${checkedInCount} of ${totalMembers} checked in`;
}

if (modalClubStatusPercent) {
  modalClubStatusPercent.textContent =
    `${percent}% complete`;
}
    const isOwner = auth.currentUser?.uid === currentClubOwner;

if (finishedBtn) {
  finishedBtn.disabled = !everyoneCheckedIn || !isOwner;

  if (!isOwner) {
    finishedBtn.textContent = "Owner Only 🔒";
  } else {
    finishedBtn.textContent = everyoneCheckedIn
      ? "Finished Book ✅"
      : "Finished Book 🔒";
  }
}

if (lockText) {
  if (!isOwner) {
    lockText.textContent =
      `${checkedInCount}/${totalMembers} members checked in. Only the club owner can finish the book.`;
  } else {
    lockText.textContent = everyoneCheckedIn
      ? "Everyone has checked in. You can finish the book."
      : `${checkedInCount}/${totalMembers} members checked in.`;
  }
}
  };
  listenCircle("featured-progress", clubId, "featuredVolume", snapshot => {
    data = snapshot.val() || {};
    renderProgress();
  });
  listenCircle("progress-members", clubId, "access/members", snapshot => {
    members = snapshot.val() || {};
    renderProgress();
  });
}
function openReadingGoalModal() {
  alert("Reading Goal Details Modal Coming Next!");
}
window.openReadingGoalModal = function () {
  const modal = document.getElementById("readingGoalModal");
  if (modal) modal.style.display = "flex";
};

window.closeReadingGoalModal = function () {
  const modal = document.getElementById("readingGoalModal");
  if (modal) modal.style.display = "none";
};
window.toggleGoalEditor = function () {
  const editor = document.getElementById("goalEditor");

  if (!editor) return;

  editor.style.display =
    editor.style.display === "none"
      ? "block"
      : "none";
};
window.loadFinishedBookReviews = function (book) {
  const clubId = window.currentClubId;
  const reviewsList =
    document.getElementById("finishedBookReviewsList");

  if (!clubId || !book || !book.title || !reviewsList) return;

  listenCircle("finished-reviews", clubId, `finishedBookReviews/${book.title}`,
    (snapshot) => {

      const reviews = snapshot.val() || {};

      const cards = Object.values(reviews).map(review => {
        const card = document.createElement("div");
        card.className = "finished-review-card";
        const name = document.createElement("div");
        name.className = "finished-review-name";
        name.textContent = review.name || "Reader";
        const stars = document.createElement("div");
        stars.className = "finished-review-stars";
        const rating = Math.min(5, Math.max(0, Math.trunc(Number(review.rating) || 0)));
        stars.textContent = "★".repeat(rating) + "☆".repeat(5 - rating);
        const text = document.createElement("p");
        text.className = "finished-review-text";
        text.textContent = review.text || "";
        const date = document.createElement("div");
        date.className = "finished-review-date";
        date.textContent = new Date(review.createdAt || Date.now()).toLocaleDateString(
          "en-US", { month: "long", day: "numeric", year: "numeric" }
        );
        card.append(name, stars, text, date);
        return card;
      });
      if (!cards.length) {
        const empty = document.createElement("p");
        empty.className = "helper";
        empty.textContent = "No reviews yet. Be the first to share your thoughts.";
        cards.push(empty);
      }
      reviewsList.replaceChildren(...cards);
    }
  );
};
window.saveFinishedBookReview = async function (book) {
  return runCircleOperation(async operation => {
  const user = auth.currentUser;
  const clubId = operation.clubId;
  const input = document.getElementById("finishedBookReviewInput");
const ratingInput = document.getElementById("finishedBookReviewRating");
const rating = Number(ratingInput?.value || 0);
  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");
  if (!book || !book.title) return alert("Book not found.");
  if (!input || !input.value.trim()) return alert("Write a review first.");
if (!rating) return alert("Choose a star rating first.");
  const profile = await circleStep(operation, () => readPublicProfile(operation.uid));
  const reviewRef = ref(
  database,
  `clubs/${clubId}/finishedBookReviews/${book.title}/${user.uid}`
);

  await circleStep(operation, () => set(reviewRef, {
  userId: user.uid,
  name: profile.username || "Reader",
  rating,
  text: input.value.trim(),
  createdAt: Date.now()
}));

  const reviewText = input.value.trim();

input.value = "";

const reviewsList = document.getElementById("finishedBookReviewsList");

if (reviewsList) {
  const card = document.createElement("div");
  card.className = "finished-review-card";
  const name = document.createElement("strong");
  name.textContent = profile.username || "Reader";
  const text = document.createElement("p");
  text.textContent = reviewText;
  card.append(name, text);
  reviewsList.replaceChildren(card);
} else {
  alert("Reviews list not found.");
}

showToast("Review posted!");
  });
};
window.openReaderProfile = async function (uid) {
  const modal = document.getElementById("readerProfileModal");
  const content = document.getElementById("readerProfileContent");

  if (!modal || !content) return;
  const view = friendshipSession.beginView(uid);
  if (!view) return;
  const valid = () => friendshipSession.isViewCurrent(view) &&
    content.isConnected && document.getElementById("readerProfileContent") === content;
  content.replaceChildren();
  modal.style.display = "none";

  let userData;
  try {
    userData = await readPublicProfile(uid);
  } catch (error) {
    if (valid() || !isFriendshipPermissionDenied(error)) reportFriendshipFailure("profile-read", error);
    if (valid()) {
      friendshipMessage(content, "This reader's profile could not be loaded.");
      modal.style.display = "flex";
    }
    return;
  }
  if (!valid()) return;
  const displayName = userData.username;

  const avatar = userData.avatar || "📚";

  content.innerHTML = `
    <div class="finished-detail-card">

      <div class="finished-detail-hero">
        <div class="finished-detail-placeholder"></div>

        <div>
          <p class="mini-label">Reader Profile</p>
          <h2></h2>
          <p class="helper">Spine Society reader</p>
        </div>
      </div>

      <section class="finished-detail-section">
  <h3>Friend Status</h3>

  <div id="readerFriendStatus">
    <p class="helper">Checking friend status...</p>
  </div>
</section>

      <section class="finished-detail-section">
        <h3>Stacks</h3>
        <p class="helper">Public stacks will appear here.</p>

        <button
  class="secondary"
  onclick="openReaderStacks(${escapeInlineJson(uid)})">
  View Stacks
</button>
      </section>

      <section class="finished-detail-section">
        <h3>Library</h3>
        <p class="helper">Personal libraries are private and are not available from reader profiles.</p>

        <button class="secondary" type="button" disabled aria-disabled="true"
          title="Personal libraries are private">
          View Library
        </button>
      </section>

    </div>
  `;
  content.querySelector(".finished-detail-placeholder").textContent = avatar;
  content.querySelector("h2").textContent = displayName;
loadReaderFriendStatus(uid, view);
  modal.style.display = "flex";
};
window.openReaderStacks = async function (uid) {
  const modal = document.getElementById("readerStacksModal");
  const content = document.getElementById("readerStacksContent");

  if (!modal || !content) return;

  content.innerHTML = `
    <div class="finished-detail-card">
      <section class="finished-detail-section">
        <h3>Public Stacks</h3>
        <p class="helper">This reader's public stacks will appear here.</p>
      </section>

      <section class="finished-detail-section">
        <h3>Recent Reviews</h3>
        <p class="helper">Reviews and ratings from finished books will appear here.</p>
      </section>

      <section class="finished-detail-section">
        <h3>Suggested Reads</h3>
        <p class="helper">Book suggestions from this reader will appear here.</p>
      </section>
    </div>
  `;

  modal.style.display = "flex";
};

window.closeReaderStacks = function () {
  const modal = document.getElementById("readerStacksModal");
  if (modal) modal.style.display = "none";
};
window.closeReaderProfileModal = function () {
  friendshipSession.closeView();
  const modal = document.getElementById("readerProfileModal");
  if (modal) modal.style.display = "none";
};

window.sendFriendRequest = async function (uid) {
  const user = auth.currentUser;
  const session = friendshipSession.current;

  if (!user) return alert("Please log in first.");
  if (!uid) return alert("Reader not found.");
  if (uid === user.uid) return alert("You can't add yourself.");
  if (!friendshipSession.isCurrent(session)) return;

  try {
    await set(ref(database, `users/${uid}/friendRequests/${user.uid}`), {
      from: user.uid,
      email: user.email || "",
      createdAt: Date.now()
    });
    if (friendshipSession.isCurrent(session)) showToast("Friend request sent!");
  } catch (error) {
    const current = friendshipSession.isCurrent(session);
    if (current || !isFriendshipPermissionDenied(error)) reportFriendshipFailure("send-request", error);
    if (current) showToast("Friend request could not be sent.", "error");
  }
};
window.listenForFriendRequests = function (session = friendshipSession.current) {
  if (!friendshipSession.isCurrent(session)) return;

  const container =
    document.getElementById("friendRequestsList");

  if (!container) return;

  const live = valid => valid() && container.isConnected &&
    document.getElementById("friendRequestsList") === container;
  friendshipSession.listen("requests", session,
    (next, fail) => onValue(ref(database, `users/${session.uid}/friendRequests`), next, fail),
    (snapshot, valid) => {
      if (!live(valid)) return;

      const requests = snapshot.val() || {};

      const requestIds = Object.keys(requests);

      if (!requestIds.length) {
        container.innerHTML =
          `<p class="status">No friend requests yet.</p>`;
        return;
      }

      container.innerHTML =
        requestIds.map(uid => `
          <div class="book-item">

            <div class="item-title">
              ${escapeHTML(requests[uid].email || "Reader")}
            </div>

            <button onclick="acceptFriendRequest(${escapeInlineJson(uid)})">
              Accept
            </button>

          </div>
        `).join("");
    },
    (error, valid) => friendshipReadFailure("requests-list", error, () => live(valid),
      container, "Friend requests could not be loaded.")
  );
};
window.acceptFriendRequest = async function (uid) {
  const user = auth.currentUser;
  const session = friendshipSession.current;

  if (!user || !uid || !friendshipSession.isCurrent(session)) return;
  let acknowledged = 0;
  const current = () => friendshipSession.isCurrent(session);
  const stopIfObsolete = () => {
    if (current()) return false;
    if (acknowledged > 0 && acknowledged < 3) {
      reportFriendshipFailure("accept-request", "session-ended", acknowledged);
    }
    return true;
  };
  try {

  await set(
    ref(database, `users/${user.uid}/friends/${uid}`),
    true
  );
  acknowledged = 1;
  if (stopIfObsolete()) return;

  await set(
    ref(database, `users/${uid}/friends/${user.uid}`),
    true
  );
  acknowledged = 2;
  if (stopIfObsolete()) return;

  await remove(
    ref(database, `users/${user.uid}/friendRequests/${uid}`)
  );
  acknowledged = 3;

  if (current()) showToast("Friend added!");
  } catch (error) {
    if (current() || acknowledged > 0 || !isFriendshipPermissionDenied(error)) {
      reportFriendshipFailure("accept-request", error, acknowledged);
    }
    if (current()) showToast(acknowledged > 0
      ? "Friendship acceptance partially completed. No automatic repairs were made."
      : "Friend request could not be accepted.", "error");
  }
};
window.listenForFriends = function (session = friendshipSession.current) {
  if (!friendshipSession.isCurrent(session)) return;

  const container = document.getElementById("friendsList");

  if (!container) return;

  const live = valid => valid() && container.isConnected &&
    document.getElementById("friendsList") === container;
  friendshipSession.listen("friends", session,
    (next, fail) => onValue(ref(database, `users/${session.uid}/friends`), next, fail),
    async (snapshot, valid) => {
      if (!live(valid)) return;
      const friends = snapshot.val() || {};
      const friendIds = Object.keys(friends);

      if (!friendIds.length) {
        container.innerHTML =
          `<p class="status">No friends yet.</p>`;
        return;
      }

      let html = "";

      for (const uid of friendIds) {
        if (!live(valid)) return;
        let userData;
        try {
          userData = await readPublicProfile(uid);
        } catch (error) {
          if (!isFriendshipPermissionDenied(error)) throw error;
          if (!live(valid)) return;
          reportFriendshipFailure("friend-profile-read", error);
          html += `<div class="book-item"><div class="item-title">Profile unavailable</div></div>`;
          continue;
        }
        if (!live(valid)) return;

        const displayName = userData.username;

        html += `
          <div class="book-item">
            <div class="item-title">
              ${escapeHTML(displayName)}
            </div>

            <button
              class="secondary"
              onclick="openReaderProfile(${escapeInlineJson(uid)})">
              View Profile
            </button>
          </div>
        `;
      }

      if (live(valid)) container.innerHTML = html;
    },
    (error, valid) => friendshipReadFailure("friends-list", error, () => live(valid),
      container, "Friends could not be loaded.")
  );
};
function clearBookmarkDisplays() {
  currentBookmarkBooks = [];
  const modal = document.getElementById("bookModal");
  if (modal?.dataset.bookmarkView === "true") {
    modal.style.display = "none";
    document.getElementById("bookModalBody")?.replaceChildren();
    delete modal.dataset.bookmarkView;
  }
  document.getElementById("bookmarksList")?.replaceChildren();
  document.getElementById("nookDogEaredShelf")?.replaceChildren();
}

function stopBookmarkListener() {
  bookmarksSessionToken += 1;
  const unsubscribe = bookmarksUnsubscribe;
  bookmarksUnsubscribe = null;
  unsubscribe?.();
}

window.saveToBookmarks = async function (book) {
  const user = auth.currentUser;
  const session = personalLibrarySession.current;

  if (!user) return alert("Please log in first.");
  const isCurrent = () => user.emailVerified === true &&
    auth.currentUser?.uid === user.uid &&
    currentUser?.uid === user.uid &&
    personalLibrarySession.isCurrent(session);
  if (!isCurrent()) return alert("Please log in first.");
  if (!book || !book.title) return alert("Book not found.");

  const bookmarksRef = ref(database, `users/${user.uid}/bookmarks`);
  const snapshot = await get(bookmarksRef);
  if (!isCurrent()) return;
  const existingBookmarks = snapshot.val() || {};
  const alreadySaved = Object.values(existingBookmarks).some(savedBook =>
    (savedBook.title || "").toLowerCase() === (book.title || "").toLowerCase() &&
    (savedBook.author || "").toLowerCase() === (book.author || "").toLowerCase()
  );

  if (alreadySaved) {
    showToast("Already in Dog-Eared Pages 🔖");
    return;
  }

  const bookmarkRef = push(bookmarksRef);
  if (!isCurrent()) return;
  await set(bookmarkRef, {
    sourceBookId: book.id || "",
    title: book.title || "",
    author: book.author || "",
    image: book.image || "",
    category: book.category || "",
    // Preserve the original length choice.
    lengthType: book.lengthType || "",
    lengthCount: book.lengthCount || "",
    savedAt: Date.now()
  });
  if (isCurrent()) showToast("Saved to Dog-Eared Pages 🔖");
};

window.listenForBookmarks = function (session = personalLibrarySession.current) {
  stopBookmarkListener();
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true ||
      !personalLibrarySession.isCurrent(session) || session.uid !== user.uid ||
      currentUser?.uid !== user.uid) {
    clearBookmarkDisplays();
    return;
  }
  const uid = user.uid;
  const token = bookmarksSessionToken;
  const isCurrent = () => bookmarksSessionToken === token &&
    auth.currentUser?.uid === uid && currentUser?.uid === uid &&
    personalLibrarySession.isCurrent(session);
  const container = document.getElementById("bookmarksList");
  const nookContainer = document.getElementById("nookDogEaredShelf");
  if (!container && !nookContainer) return;

  const unsubscribe = onValue(ref(database, `users/${uid}/bookmarks`), snapshot => {
    if (!isCurrent()) return;
    const bookmarks = snapshot.val() || {};
    const bookmarkIds = Object.keys(bookmarks);
    currentBookmarkBooks = bookmarkIds.map(id => ({...bookmarks[id], id}));
    if (!bookmarkIds.length) {
      if (container) container.innerHTML = `<p class="status">No dog-eared pages yet.</p>`;
      if (nookContainer) nookContainer.innerHTML = `<p class="status">No dog-eared pages yet.</p>`;
      return;
    }
    const renderBookmark = id => renderLibrarySpine({...bookmarks[id], id}, "bookmark");
    if (container) {
      container.innerHTML = `<div class="bookshelf-row">${bookmarkIds.map(renderBookmark).join("")}</div>`;
    }
    if (nookContainer) {
      nookContainer.innerHTML = bookmarkIds.slice(0, 6).map(renderBookmark).join("");
    }
  }, () => {
    if (!isCurrent()) return;
    stopBookmarkListener();
    clearBookmarkDisplays();
    showToast("Dog-Eared Pages could not be loaded.", "error");
  });
  if (isCurrent()) bookmarksUnsubscribe = unsubscribe;
  else unsubscribe();
};
window.openBookmarksPage = function () {
  showScreen("bookmarks");
};
window.loadReaderFriendStatus = function (uid, view = friendshipSession.view) {
  const statusBox = document.getElementById("readerFriendStatus");

  if (!uid || !statusBox || !friendshipSession.isViewCurrent(view) || view.uid !== uid) return;
  friendshipSession.stop("profile-status");
  const live = () => friendshipSession.isViewCurrent(view) && statusBox.isConnected &&
    document.getElementById("readerFriendStatus") === statusBox;

  if (uid === view.session.uid) {
    statusBox.innerHTML = `<p class="helper">This is your profile.</p>`;
    return;
  }

  friendshipSession.listen("profile-status", view.session,
    (next, fail) => onValue(ref(database, `users/${view.session.uid}/friends/${uid}`), next, fail),
    (snapshot, valid) => {
    if (!live() || !valid()) return;
    if (snapshot.exists()) {
      statusBox.innerHTML = `<p class="helper">✓ Friends</p>`;
    } else {
      statusBox.innerHTML = `
        <p class="helper">Not friends yet.</p>
        <button onclick="sendFriendRequest(${escapeInlineJson(uid)})">
          Add Friend
        </button>
      `;
    }
  },
    (error, valid) => friendshipReadFailure("profile-status", error, () => live() && valid(),
      statusBox, "Friend status could not be checked.")
  );
};
window.setReviewRating = function (rating) {
  const input =
    document.getElementById("finishedBookReviewRating");

  if (input) {
    input.value = rating;
  }

  const label =
    document.getElementById("selectedReviewRatingText");

  if (label) {
    label.textContent =
      `Your Rating: ${"★".repeat(rating)}${"☆".repeat(5-rating)}`;
  }
};
window.saveFinishedBookRating = async function (book, rating) {
  return runCircleOperation(async operation => {
  const user = auth.currentUser;
  const clubId = operation.clubId;

  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");
  if (!book || !book.title) return alert("Book not found.");

  const profile = await circleStep(operation, () => readPublicProfile(operation.uid));
  await circleStep(operation, () => set(
    ref(database, `clubs/${clubId}/finishedBookRatings/${book.title}/${user.uid}`),
    {
      userId: user.uid,
      name: profile.username || "Reader",
      rating,
      createdAt: Date.now()
    }
  ));

  loadFinishedBookRatings(book);
showToast(`Rated ${rating} stars!`);
  });
};
window.loadFinishedBookRatings = function (book) {
  const clubId = window.currentClubId;
  const summary = document.getElementById("finishedBookRatingSummary");

  if (!clubId || !book || !book.title || !summary) return;

  listenCircle("finished-ratings", clubId, `finishedBookRatings/${book.title}`,
    (snapshot) => {
      const ratings = snapshot.val() || {};
      const ratingArray = Object.values(ratings);

      if (!ratingArray.length) {
        summary.textContent = "No ratings yet.";
        return;
      }

      const total = ratingArray.reduce((sum, item) => {
        return sum + Number(item.rating || 0);
      }, 0);

      const average = (total / ratingArray.length).toFixed(1);

      summary.textContent =
        `Club Rating: ${average} ★ · Based on ${ratingArray.length} rating${ratingArray.length === 1 ? "" : "s"}`;
    }
  );
};
window.saveGoalEditor = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) {
    alert("Open a club first.");
    return;
  }

  const start = document.getElementById("goalStartChapter").value.trim();
  const end = document.getElementById("goalEndChapter").value.trim();

  if (!start || !end) {
    alert("Enter both a start and end chapter.");
    return;
  }

  const goalText = `Chapters ${start}–${end}`;

  await circleStep(operation, () => update(ref(database, `clubs/${operation.clubId}/featuredVolume`), {
  currentGoal: goalText,
  goalStart: start,
  goalEnd: end,
  updatedAt: Date.now(),
  checkins: {}
}));

  document.getElementById("readingGoalDisplay").textContent = goalText;
  document.getElementById("modalGoalDisplay").textContent = goalText;

  showToast("Reading goal updated.");
  });
};
window.toggleDueDateEditor = function () {
  const editor = document.getElementById("dueDateEditor");
  if (!editor) return;

  editor.style.display =
    editor.style.display === "none" ? "block" : "none";
};

window.saveDueDateEditor = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) {
    alert("Open a club first.");
    return;
  }

  const dueDate = document.getElementById("goalDueDateInput").value;

  if (!dueDate) {
    alert("Choose a due date.");
    return;
  }

  const formattedDate = new Date(dueDate + "T00:00:00").toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });

  await circleStep(operation, () => update(ref(database, `clubs/${operation.clubId}/featuredVolume`), {
    dueDate,
    dueDateLabel: formattedDate,
    updatedAt: Date.now()
  }));

  document.getElementById("readingDueDisplay").textContent = formattedDate;
  document.getElementById("modalDueDisplay").textContent = formattedDate;

  showToast("Due date updated.");
  });
};
window.toggleTotalChaptersEditor = function () {
  const editor = document.getElementById("totalChaptersEditor");
  if (!editor) return;

  editor.style.display =
    editor.style.display === "none" ? "block" : "none";
};

window.saveTotalChaptersEditor = async function () {
  return runCircleOperation(async operation => {
  if (!window.currentClubId) {
    alert("Open a club first.");
    return;
  }

  const totalChapters =
    document.getElementById("modalTotalChaptersInput").value.trim();

  if (!totalChapters) {
    alert("Enter total chapters.");
    return;
  }

  await circleStep(operation, () => update(ref(database, `clubs/${operation.clubId}/featuredVolume`), {
    totalChapters: Number(totalChapters),
    updatedAt: Date.now()
  }));

  const modalTotal =
    document.getElementById("modalTotalChapterDisplay");

  if (modalTotal) {
    modalTotal.textContent = totalChapters;
  }

  const mainInput =
    document.getElementById("totalChaptersInput");

  if (mainInput) {
    mainInput.value = totalChapters;
  }

  showToast("Total chapters updated.");
  });
};
window.openFinishedBookDetails = function (book) {
  if (!circleSession.isActive(circleSession.view)) return;
  const modal = document.getElementById("finishedBookModal");
  const content = document.getElementById("finishedBookModalContent");

  if (!modal || !content) return;

  content.innerHTML = `
    <div class="finished-detail-card">

      <div class="finished-detail-hero">
        ${
          safeImageSource(book.image)
            ? `<img src="${escapeAttr(safeImageSource(book.image))}" class="finished-detail-cover">`
            : `<div class="finished-detail-placeholder">📚</div>`
        }

        <div>
          <p class="mini-label">Finished Read</p>
          <h2>${escapeHTML(book.title || "Untitled Book")}</h2>
          <p class="helper">by ${escapeHTML(book.author || "Unknown Author")}</p>
        </div>
      </div>

      <section class="finished-detail-section">
  <h3>Club Rating</h3>

  <div class="rating-picker">
    <button onclick="saveFinishedBookRating(${escapeInlineJson(book)}, 1)">★</button>
    <button onclick="saveFinishedBookRating(${escapeInlineJson(book)}, 2)">★</button>
    <button onclick="saveFinishedBookRating(${escapeInlineJson(book)}, 3)">★</button>
    <button onclick="saveFinishedBookRating(${escapeInlineJson(book)}, 4)">★</button>
    <button onclick="saveFinishedBookRating(${escapeInlineJson(book)}, 5)">★</button>
  </div>

  <p id="finishedBookRatingSummary" class="helper">
    No ratings yet.
  </p>
</section>

      <section class="finished-detail-section">
  <h3>Reader Reviews</h3>
<div class="review-rating-picker">

  <span onclick="setReviewRating(1)">★</span>
  <span onclick="setReviewRating(2)">★</span>
  <span onclick="setReviewRating(3)">★</span>
  <span onclick="setReviewRating(4)">★</span>
  <span onclick="setReviewRating(5)">★</span>

</div>

<div id="selectedReviewRatingText" class="helper">
  No rating selected.
</div>

<input type="hidden" id="finishedBookReviewRating" value="">
  <textarea
    id="finishedBookReviewInput"
    placeholder="Share your thoughts about this book..."
    style="width:100%; min-height:90px; margin-top:10px;"
  ></textarea>

  <button onclick="saveFinishedBookReview(${escapeInlineJson(book)})">
    Post Review
  </button>

  <div id="finishedBookReviewsList">
    <p class="helper">Reviews will appear here after members share their thoughts.</p>
  </div>
</section>

      <section class="finished-detail-section">
        <h3>Suggested Next Reads</h3>
        <p class="helper">Members will be able to suggest similar books here.</p>
      </section>

    </div>
  `;
loadFinishedBookReviews(book);
loadFinishedBookRatings(book);

modal.style.display = "flex";
};

window.closeFinishedBookModal = function () {
  circleSession.stop("finished-reviews");
  circleSession.stop("finished-ratings");
  const modal =
    document.getElementById("finishedBookModal");

  if (modal) {
    modal.style.display = "none";
  }
};

const pageLayer = document.getElementById("floatingPages");
const authScreen = document.getElementById("authScreen");

const DAY_MAX_ACTIVE_PAGES = 5;
const NIGHT_MAX_ACTIVE_PAGES = 3;

const DAY_SPAWN_DELAY = 3600;
const NIGHT_SPAWN_DELAY = 5600;

let floatingPageTimer = null;

const bookTextSnippets = [
  "The lamp burned low beside the shelves as the readers gathered quietly between chapters. Some stories felt like secrets, others like doors waiting to be opened.",
  "A page turned softly in the dark, carrying with it the scent of dust, ink, and old paper. The room listened as if every book had something left to say.",
  "They came for the story, but stayed for the conversation. Between the margins, friendships formed in small notes, shared glances, and favorite lines.",
  "The chapter ended, but the thought remained. Somewhere in the hush of the room, another reader reached the same sentence and smiled.",
  "Books have a way of finding the people who need them. One page, one passage, one quiet evening can change the shape of a memory."
];

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function libraryIsInNightMode() {
  return authScreen?.classList.contains("lamp-is-off") ?? false;
}

function createFloatingPage() {
  if (!pageLayer) return;

  const nightMode = libraryIsInNightMode();

  const maxActivePages = nightMode
    ? NIGHT_MAX_ACTIVE_PAGES
    : DAY_MAX_ACTIVE_PAGES;

  const activePages =
    pageLayer.querySelectorAll(".floating-page").length;

  if (activePages >= maxActivePages) {
    return;
  }

  const page = document.createElement("div");
  page.className = "floating-page";

  const text = document.createElement("span");
  text.className = "page-text";

  const randomText =
    bookTextSnippets[Math.floor(Math.random() * bookTextSnippets.length)] +
    " " +
    bookTextSnippets[Math.floor(Math.random() * bookTextSnippets.length)];

  text.textContent = randomText;
  page.appendChild(text);

  const size = nightMode
    ? randomBetween(58, 96)
    : randomBetween(52, 104);

  const startX = randomBetween(-6, 96);

  const opacity = nightMode
    ? randomBetween(0.16, 0.32)
    : randomBetween(0.24, 0.52);

  const sizeRatio = (size - 52) / (104 - 52);

  const duration = nightMode
    ? 25 - sizeRatio * 5
    : 18 - sizeRatio * 6;

  const sway = nightMode
    ? randomBetween(-42, 42)
    : randomBetween(-70, 70);

  const rotate = nightMode
    ? randomBetween(-9, 9)
    : randomBetween(-18, 18);

  const shadowX = randomBetween(-12, 12);

  page.style.left = `${startX}vw`;
  page.style.setProperty("--page-width", `${size}px`);
  page.style.setProperty("--page-opacity", opacity);
  page.style.setProperty("--fall-duration", `${duration}s`);
  page.style.setProperty("--sway", `${sway}px`);
  page.style.setProperty("--start-rotate", `${rotate}deg`);
  page.style.setProperty("--shadow-x", `${shadowX}px`);

  pageLayer.appendChild(page);

  window.setTimeout(() => {
    page.remove();
  }, duration * 1000);
}

function scheduleNextFloatingPage() {
  const delay = libraryIsInNightMode()
    ? NIGHT_SPAWN_DELAY
    : DAY_SPAWN_DELAY;

  floatingPageTimer = window.setTimeout(() => {
    createFloatingPage();
    scheduleNextFloatingPage();
  }, delay);
}

function startFloatingPages() {
  if (!pageLayer) return;

  createFloatingPage();
  scheduleNextFloatingPage();
}

startFloatingPages();

/* ==========================================
   PREMIUM DAILY NOTE ROTATION
========================================== */

const premiumDailyNotes = [
  {
    day: "Monday",
    icon: "📖",
    title: "Librarian’s Note",
    prompt: "Which character would you invite to your reading circle?",
    secondary: "Leave your answer in today’s discussion.",
    theme: "note-theme-librarian",
    showReaders: false
  },
  {
    day: "Tuesday",
    icon: "☕",
    title: "Café Recommendation",
    prompt: "Brew a cup and begin the chapter you keep putting off.",
    secondary: "Ten quiet pages still count as a reading night.",
    theme: "note-theme-cafe",
    showReaders: false
  },
  {
    day: "Wednesday",
    icon: "💬",
    title: "Readers Are Discussing",
    prompt: "“I did not see that twist coming.”",
    secondary: "The latest conversation is waiting inside your circle.",
    theme: "note-theme-discussion",
    showReaders: true,
    readerText: "3 readers joined the conversation"
  },
  {
    day: "Thursday",
    icon: "📚",
    title: "Hidden Gem",
    prompt: "Love a tense, unreliable narrator?",
    secondary: "Choose a lesser-known thriller from your collection tonight.",
    theme: "note-theme-hidden-gem",
    showReaders: false
  },
  {
    day: "Friday",
    icon: "🎲",
    title: "Weekend Challenge",
    prompt: "Read somewhere you have never opened a book before.",
    secondary: "Bonus points for fresh air, rain, or a warm drink.",
    theme: "note-theme-challenge",
    showReaders: false
  },
  {
    day: "Saturday",
    icon: "✨",
    title: "Literary Fortune",
    prompt: "The next book you open may surprise you.",
    secondary: "Trust the shelf that catches your attention first.",
    theme: "note-theme-fortune",
    showReaders: false
  },
  {
    day: "Sunday",
    icon: "🕯️",
    title: "Cozy Ritual",
    prompt: "Light a candle. Put your phone away. Read one chapter.",
    secondary: "Let the week end somewhere between the pages.",
    theme: "note-theme-ritual",
    showReaders: false
  }
];

let dailyNoteIndex = new Date().getDay() - 1;
let dailyNoteTimer = null;
let dailyNoteIsAnimating = false;

if (dailyNoteIndex < 0) {
  dailyNoteIndex = 6;
}

function updateDailyNoteDots() {
  const dotsContainer = document.getElementById("dailyNoteDots");

  if (!dotsContainer) return;

  dotsContainer.innerHTML = premiumDailyNotes
    .map((note, index) => {
      const activeClass =
        index === dailyNoteIndex
          ? " daily-note-dot-active"
          : "";

      return `
        <button
          type="button"
          class="daily-note-dot${activeClass}"
          aria-label="Show ${note.day} note"
          onclick="showPremiumDailyNote(${index})"
        ></button>
      `;
    })
    .join("");
}

function applyDailyNoteContent(note, index) {
  const card = document.getElementById("dailyNoteCard");
  const icon = document.getElementById("dailyNoteIcon");
  const eyebrow = document.getElementById("dailyNoteEyebrow");
  const title = document.getElementById("dailyNoteTitle");
  const number = document.getElementById("dailyNoteNumber");
  const prompt = document.getElementById("dailyNotePrompt");
  const secondary = document.getElementById("dailyNoteSecondary");
  const readers = document.getElementById("dailyNoteReaders");
  const readerText = document.getElementById("dailyNoteReaderText");

  if (
    !card ||
    !icon ||
    !eyebrow ||
    !title ||
    !number ||
    !prompt ||
    !secondary ||
    !readers
  ) {
    return;
  }

  card.className = `daily-note-card ${note.theme}`;

  icon.textContent = note.icon;
  eyebrow.textContent = note.day;
  title.textContent = note.title;
  number.textContent = String(index + 1).padStart(2, "0");
  prompt.textContent = note.prompt;
  secondary.textContent = note.secondary;

  readers.hidden = !note.showReaders;

  if (note.showReaders && readerText) {
    readerText.textContent =
      note.readerText || "Readers are talking about this.";
  }

  updateDailyNoteDots();
}

function animateDailyNoteChange(index) {
  const paper = document.getElementById("dailyNotePaper");

  if (!paper || dailyNoteIsAnimating) return;

  dailyNoteIsAnimating = true;

  paper.classList.remove(
    "note-paper-enter",
    "note-paper-leave"
  );

  paper.classList.add("note-paper-leave");

  window.setTimeout(() => {
    dailyNoteIndex =
      (index + premiumDailyNotes.length) %
      premiumDailyNotes.length;

    applyDailyNoteContent(
      premiumDailyNotes[dailyNoteIndex],
      dailyNoteIndex
    );

    paper.classList.remove("note-paper-leave");

    void paper.offsetWidth;

    paper.classList.add("note-paper-enter");

    window.setTimeout(() => {
      paper.classList.remove("note-paper-enter");
      dailyNoteIsAnimating = false;
    }, 720);
  }, 520);
}

window.showPremiumDailyNote = function (index) {
  animateDailyNoteChange(index);
  restartPremiumDailyNoteTimer();
};

function rotatePremiumDailyNote() {
  animateDailyNoteChange(dailyNoteIndex + 1);
}


function restartPremiumDailyNoteTimer() {
  clearInterval(dailyNoteTimer);

  dailyNoteTimer = setInterval(() => {
    rotatePremiumDailyNote();
  }, 10000); // Rotate every 10 seconds
}

function initializePremiumDailyNote() {
  applyDailyNoteContent(
    premiumDailyNotes[dailyNoteIndex],
    dailyNoteIndex
  );

  restartPremiumDailyNoteTimer();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializePremiumDailyNote,
    { once: true }
  );
} else {
  initializePremiumDailyNote();
}
/* ==========================================
   Ambient Library Steam
========================================== */

function createLibrarySteam() {
  const container = document.getElementById("librarySteam");

  if (!container) return;

  container.innerHTML = "";

  const nightMode = document
    .getElementById("authScreen")
    ?.classList.contains("lamp-is-off");

  const steamCount = 3;

  for (let i = 0; i < steamCount; i++) {
  const steam = document.createElement("span");
  steam.className = "steam";

  steam.style.setProperty(
    "--steam-duration",
    `${20 + Math.random() * 8}s`
  );

    steam.style.setProperty(
      "--steam-delay",
      `${Math.random() * -24}s`
    );

    steam.style.setProperty(
      "--steam-drift",
      `${-45 + Math.random() * 90}px`
    );

    steam.style.setProperty(
      "--steam-scale",
      `${0.7 + Math.random() * 0.45}`
    );

    steam.style.setProperty(
  "--steam-opacity",
  "0.85"
);

    container.appendChild(steam);
  }
}

function watchLibraryLampForSteam() {
  const authScreen = document.getElementById("authScreen");

  if (!authScreen) return;

  const lampObserver = new MutationObserver((mutations) => {
    const lampModeChanged = mutations.some(
      mutation =>
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
    );

    if (lampModeChanged) {
      createLibrarySteam();
    }
  });

  lampObserver.observe(authScreen, {
    attributes: true,
    attributeFilter: ["class"]
  });
}

function initializeLibrarySteam() {
  createLibrarySteam();
  watchLibraryLampForSteam();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeLibrarySteam,
    { once: true }
  );
} else {
  initializeLibrarySteam();
}
/* ==========================================
   Floating Library Dust
========================================== */

function createLibraryDust() {
  const container = document.getElementById("dustParticles");

  if (!container) return;

  container.innerHTML = "";

  const nightMode = document
  .getElementById("authScreen")
  ?.classList.contains("lamp-is-off");

const particleCount = nightMode ? 16 : 35;
const glintIndex = Math.floor(Math.random() * particleCount);
for (let i = 0; i < particleCount; i++) {

    const dust = document.createElement("span");
    dust.className = "dust-particle";

    // Keep most particles inside the lamp beam
const top = 5 + Math.random() * 85;

// As the particle gets lower, allow the beam to widen.
const spread = 8 + (top * 0.22);

dust.style.left = `${
  18 + (Math.random() - 0.5) * spread
}%`;

dust.style.top = `${top}%`;
// Fade particles as they move farther from the lamp
const visibility = Math.max(
  0.05,
  0.28 - (top * 0.0024)
);

dust.style.setProperty(
  "--dust-opacity",
  visibility.toFixed(2)
);
    dust.style.setProperty(
      "--dust-size",
      `${1 + Math.random() * 2}px`
    );



    // Give each particle its own personality
const personality = Math.random();

let duration;
let drift;

if (personality < 0.70) {

  // Gentle drift
  duration = 28 + Math.random() * 18;
  drift = -18 + Math.random() * 36;

} else if (personality < 0.90) {

  // Almost hovering
  duration = 48 + Math.random() * 22;
  drift = -8 + Math.random() * 16;

} else {

  // Light breeze
  duration = 18 + Math.random() * 10;
  drift = -45 + Math.random() * 90;

}

dust.style.setProperty(
  "--dust-duration",
  `${duration}s`
);

dust.style.setProperty(
  "--dust-drift",
  `${drift}px`
);

    dust.style.setProperty(
      "--dust-delay",
      `${Math.random() * -30}s`
    );

    dust.style.setProperty(
      "--dust-fade-duration",
      `${6 + Math.random() * 6}s`
    );

    dust.style.setProperty(
      "--dust-fade-delay",
      `${Math.random() * -8}s`
    );

if (i === glintIndex) {
  dust.classList.add("dust-glint");
}
    container.appendChild(dust);
    
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    createLibraryDust,
    { once: true }
  );
} else {
  createLibraryDust();
}

/* Rebuild dust whenever the lamp mode changes */

function watchLibraryLampForDust() {
  const authScreen = document.getElementById("authScreen");

  if (!authScreen) return;

  const lampObserver = new MutationObserver((mutations) => {
    const lampModeChanged = mutations.some(
      mutation =>
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
    );

    if (lampModeChanged) {
      createLibraryDust();
    }
  });

  lampObserver.observe(authScreen, {
    attributes: true,
    attributeFilter: ["class"]
  });
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    watchLibraryLampForDust,
    { once: true }
  );
} else {
  watchLibraryLampForDust();
}
