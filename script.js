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
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  push,
  update,
  remove,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
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
let currentUser = null;
let currentLibraryBooks = [];
let currentLibraryFilter = "All";
let currentCollectionBooks = [];
let currentClubBooks = [];
let currentClubOwner = null;
let currentClubId = null;
let currentMemberAvatarsHTML = "";
let avatarCropper = null;
let croppedAvatarDataUrl = "";
const appCreatorEmail = "kokakisan@gmail.com";

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
function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll("`", "&#096;");
}

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
document.getElementById("libraryTab").addEventListener("click", () => showScreen("library"));
document.getElementById("randomizerTab").addEventListener("click", () => showScreen("randomizer"));
document.getElementById("stacksTab").addEventListener("click", () => showScreen("stacks"));
document.getElementById("reflectionTab").addEventListener("click", () => showScreen("reflection"));
document.getElementById("profileTab").addEventListener("click", () => showScreen("profile"));

window.signUpWithEmail = async function () {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!validateLoginInputs()) return;

  try {
    await setPersistence(auth, browserLocalPersistence);

const userCredential = await createUserWithEmailAndPassword(
  auth,
  email,
  password
);

await sendEmailVerification(userCredential.user, {
  url: "https://spinesociety.github.io/Spine-Society/",
  handleCodeInApp: false
});

await signOut(auth);

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
window.loginWithEmail = async function () {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!validateLoginInputs()) return;

  try {
    await setPersistence(auth, browserLocalPersistence);

    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
  showToast(getAuthErrorMessage(error), "error");
}
};

window.loginWithGoogle = async function () {
  try {
    await setPersistence(auth, browserLocalPersistence);

    await signInWithPopup(auth, provider);
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
      return;
    }

    await sendEmailVerification(userCredential.user, {
  url: "https://spinesociety.github.io/Spine-Society/",
  handleCodeInApp: false
});
    await signOut(auth);

    showToast("Verification email resent. Please check your inbox.", "success");

    resendBtn.disabled = true;
    resendBtn.textContent = "Resend available in 60s";

    setTimeout(() => {
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend Verification Email";
    }, 60000);

  } catch (error) {
    showToast(getAuthErrorMessage(error), "error");
  }
};
window.logoutUser = async function () {
  await signOut(auth);
};

window.saveUsername = async function () {
  if (!currentUser) return alert("Please log in first.");

  const username = document.getElementById("usernameInput").value.trim();
  if (!username) return alert("Enter a Reader Alias.");

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

  if (!photoURL) return alert("Paste a photo URL first.");

  await update(ref(database, "users/" + currentUser.uid), {
    avatar: "photo",
    avatarPhoto: photoURL,
    updatedAt: Date.now()
  });

  document.getElementById("currentAvatar").textContent =
    "Current Avatar: Photo";

  document.getElementById("avatarPreview").innerHTML =
    `<img src="${photoURL}" style="width:70px;height:70px;border-radius:50%;object-fit:cover;">`;

  alert("Profile photo saved.");
};
async function ensureUserRecord(user) {
  await update(ref(database, "users/" + user.uid), {
    email: user.email || "",
    updatedAt: Date.now()
  });
}

function listenToUserClubs() {
  const userClubsRef = ref(database, "users/" + currentUser.uid + "/clubs");

  onValue(userClubsRef, async (snapshot) => {
    const clubs = snapshot.val() || {};
    const clubIds = Object.keys(clubs);

    document.getElementById("clubCount").textContent =
      clubIds.length + " circle" + (clubIds.length === 1 ? "" : "s");

    if (clubIds.length === 0) {
      document.getElementById("clubList").innerHTML =
        `<p class="status">Your shelves are waiting for their first reading circle.</p>`;
      return;
    }

    let html = "";
    for (const clubId of clubIds) {
      const clubSnapshot = await get(ref(database, "clubs/" + clubId));
      const club = clubSnapshot.val();
      if (!club) continue;
const memberCount = club.members
  ? Object.keys(club.members).length
  : 0;
      html += `
  <section class="current-club-panel">

    <div class="club-emblem">
      📚
    </div>

    <div style="flex:1;">

      

      <h3>
        ${escapeHTML(club.name)}
      </h3>
<div class="small">
  👥 ${memberCount} reader${memberCount === 1 ? "" : "s"}
</div>

      <div style="
        display:flex;
        gap:10px;
        margin-top:14px;
      ">


        <button
  class="secondary"
  onclick="openClubRoom('${clubId}')"
  style="flex:1;"
>
  View Club Room
</button>


      </div>

    </div>

  </section>
`;
    }

    document.getElementById("clubList").innerHTML = html;
  });
}

window.createClub = async function () {
  if (!currentUser) return alert("Please log in first.");

  const clubName = document.getElementById("newClubName").value.trim();
  if (!clubName) return alert("Enter a circle name.");

  const clubRef = push(ref(database, "clubs"));
  const clubId = clubRef.key;

  await set(clubRef, {
    name: clubName,
    owner: currentUser.uid,
    createdBy: currentUser.email || "",
    createdAt: Date.now(),
    members: {
  [currentUser.uid]: {
    name: currentUser.displayName || currentUser.email || "Reader",
    email: currentUser.email || ""
  }
}
  });

  await set(ref(database, "users/" + currentUser.uid + "/clubs/" + clubId), true);

  document.getElementById("newClubName").value = "";
  showToast("Circle created.");
  openClub(clubId);
};
let cropper;

window.openCropper = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!currentUser) return alert("Please log in first.");

  const reader = new FileReader();

  reader.onload = async function(e) {
    const photoData = e.target.result;

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
  if (!currentUser) return alert("Please log in first.");

  const input = document.getElementById("joinClubId").value.trim();
  if (!input) return alert("Paste a circle code or invite link.");

  const clubId = extractClubId(input);

  const userSnapshot = await get(ref(database, "users/" + currentUser.uid));
const userData = userSnapshot.val() || {};

await set(ref(database, "clubs/" + clubId + "/members/" + currentUser.uid), {
  name: userData.username || currentUser.displayName || currentUser.email || "Reader",
  email: currentUser.email || "",
  avatar: userData.avatar || "📚",
  avatarPhoto: userData.avatarPhoto || ""
});
  await set(ref(database, "users/" + currentUser.uid + "/clubs/" + clubId), true);

  document.getElementById("joinClubId").value = "";
  showToast("Joined circle.");
  openClub(clubId);
};

window.openClub = async function (clubId) {
  const clubSnapshot = await get(ref(database, "clubs/" + clubId));
  const club = clubSnapshot.val();

  if (!club) return alert("circle not found.");

  window.currentClubId = clubId;
  
  if (currentUser && currentUser.uid) {
  const userSnapshot = await get(ref(database, "users/" + currentUser.uid));
  const userData = userSnapshot.val() || {};

  await set(ref(database, "clubs/" + clubId + "/members/" + currentUser.uid), {
    name: userData.username || currentUser.displayName || currentUser.email || "Reader",
    email: currentUser.email || "",
    avatar: userData.avatar || "📚",
    avatarPhoto: userData.avatarPhoto || ""
  });
}
  window.currentClubName = club.name;
  currentClubOwner = club.owner || null;

  document.getElementById("clubHero").innerHTML = `
    <div class="club-emblem">📚</div>
    <div>
      <div class="panel-kicker">Current Club</div>
      <h3>${escapeHTML(club.name)}</h3>
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


   listenToCollectionBooks(clubId);
   listenToNextRead(clubId);
   listenToBooksRead(clubId);
   listenToMembers(clubId);
   listenToDiscussion(clubId);
   listenToFeaturedVolumeProgress(clubId);
 showScreen("club");
};

window.openClubRoom = async function (clubId) {

  await openClub(clubId);

  showScreen("club");

  showClubRoomTab("current");

};

function updateNookNextRead(nextRead) {
  const area = document.getElementById("nookNextRead");
  if (!area) return;
  if (!nextRead) { area.innerHTML = `<p class="status">Your next read will appear here.</p>`; return; }
  area.innerHTML = `<div class="nook-pick-card">${nextRead.image ? `<img class="nook-pick-cover" src="${escapeAttr(nextRead.image)}" alt="Book cover">` : `<div class="nook-pick-placeholder">S</div>`}<div class="nook-pick-info"><h3>${escapeHTML(nextRead.title)}</h3>${nextRead.author ? `<div class="small">by ${escapeHTML(nextRead.author)}</div>` : ""}<div class="book-category">${escapeHTML(nextRead.category || "Uncategorized")}</div></div></div>`;
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
    <div class="randomizer-spine" id="libraryRandomizerBook-${book.id}">
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
    <div class="randomizer-spine" id="collectionRandomizerBook-${book.id}">
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
 function listenToPersonalLibrary() {
  if (!currentUser) return;

  onValue(ref(database, "users/" + currentUser.uid + "/library"), (snapshot) => {
    const books = snapshot.val() || {};

    currentLibraryBooks = Object.entries(books).map(([id, value]) => ({
      id,
      ...value
    }));

    renderMyLibrary();
    renderBookRandomizerShelf();
  });
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

  onValue(
    ref(database, "clubs/" + clubId + "/collection"),
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

  const filteredBooks =
  currentLibraryFilter === "All"
    ? currentLibraryBooks
    : currentLibraryBooks.filter(book =>
        (book.status || "Want to Read") === currentLibraryFilter
      );

  if (!filteredBooks || filteredBooks.length === 0) {
  library.innerHTML = `
    <div class="bookshelf-row">

      <button
        class="library-book-spine add-book-spine"
        onclick="openAddLibraryBookModal()"
      >
        <div>＋</div>
        <div>Add<br>Book</div>
      </button>

    </div>
  `;
  return;
}

  library.innerHTML = `
    <div class="bookshelf-row">

      ${filteredBooks.map(book =>
        renderLibrarySpine(book)
      ).join("")}

      <button
        class="library-book-spine add-book-spine"
        onclick="openAddLibraryBookModal()"
      >
        <div>＋</div>
        <div>Add<br>Book</div>
      </button>

    </div>
  `;
}
window.setLibraryFilter = function (filter, button) {
  currentLibraryFilter = filter;

  document.querySelectorAll("#libraryScreen .library-tabs button")
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

function renderLibrarySpine(book) {
  return `
    <div
      class="library-book-spine"
      title="${escapeAttr(book.title)}"
      onclick="openBookModal('${book.id}')"
      style="cursor:pointer;"
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
          book.image
            ? `<img class="book-mini-cover" src="${escapeAttr(book.image)}" alt="Book cover">`
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
                    onclick="deleteFinishedBook('${book.id}')"
                  >
                    Remove
                  </button>
                `
                : canEdit
                  ? `
                    <button
                      class="secondary"
                      onclick="editBook('${book.id}')"
                    >
                      Edit Book
                    </button>

                    <button
                      class="danger"
                      onclick="deleteCollectionBook('${book.id}')"
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
          book.image
            ? `<img class="book-mini-cover" src="${escapeAttr(book.image)}" alt="Book cover">`
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
    onchange="updateBookStatus('${book.id}', this.value)"
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
  onclick="event.stopPropagation(); openEditBookModal('${book.id}', 'library')"
>
  Edit Book
</button>

            <button class="danger" onclick="deletePersonalBook('${book.id}')">
              Delete Book
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
window.updateBookStatus = async function (bookId, status) {
  await update(
    ref(database, "users/" + currentUser.uid + "/library/" + bookId),
    {
      status,
      updatedAt: Date.now()
    }
  );

  showToast("Book status updated.");
};
window.openBookModal = function (bookId) {
  const modal = document.getElementById("bookModal");
  const body = document.getElementById("bookModalBody");

  if (!modal || !body) return;

  const book =
    currentLibraryBooks.find(b => b.id === bookId) ||
    currentCollectionBooks.find(b => b.id === bookId);

  if (!book) {
    alert("Book not found.");
    return;
  }

  const isCollectionBook =
    currentCollectionBooks.some(b => b.id === bookId);

  body.innerHTML = `
    <div class="book-detail-page">

      <div class="book-detail-topbar">
        <button class="book-back-btn" onclick="closeBookModal()">←</button>

        <button
          class="book-bookmark-btn"
          onclick='event.stopPropagation(); saveToBookmarks(${JSON.stringify(book)})'
          title="Save to Dog-Eared Pages"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h12v18l-6-4-6 4V3z"></path>
          </svg>
        </button>
      </div>

      <div class="book-detail-hero">
        ${
          book.image
            ? `<img class="book-detail-cover" src="${escapeAttr(book.image)}" alt="Book cover">`
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
    ? ` • ${book.lengthCount} ${book.lengthType === "chapters" ? "chapters" : "pages"}`
    : ""
}
</div>

<div class="book-detail-rating">
  ${
    book.rating
      ? `★★★★★ ${book.rating}`
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
        canManageBook(book, isCollectionBook ? "collection" : "library")
          ? `
            <div class="book-actions">
              <button
                class="secondary"
                onclick="event.stopPropagation(); openEditBookModal('${book.id}', '${isCollectionBook ? "collection" : "library"}')"
              >
                Edit Book
              </button>

              <button
                class="danger"
                onclick="event.stopPropagation(); closeBookModal(); ${isCollectionBook ? `deleteCollectionBook('${book.id}')` : `deletePersonalBook('${book.id}')`}"
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
  if (!window.currentClubId) return alert("Open a circle first.");

  const clubSnapshot = await get(ref(database, "clubs/" + window.currentClubId));
  const club = clubSnapshot.val();

  if (!club) return alert("circle not found.");

  if (club.owner !== currentUser.uid && currentUser.email !== appCreatorEmail) {
    return alert("Only the circle creator can rename this circle.");
  }

  const newName = prompt("Edit circle name:", club.name || "");
  if (newName === null) return;
  if (!newName.trim()) return alert("circle name cannot be blank.");

  await update(ref(database, "clubs/" + window.currentClubId), {
    name: newName.trim(),
    updatedAt: Date.now()
  });

  closecircleSettingsModal();
  showToast("circle updated.");
};

window.copyCurrentcircleInvite = async function () {
  if (!window.currentClubId) return alert("Open a circle first.");

  const inviteLink =
    window.location.origin + window.location.pathname + "?club=" + window.currentClubId;

  try {
    await navigator.clipboard.writeText(inviteLink);
    showToast("Invite link copied.");
  } catch (error) {
    prompt("Copy this invite link:", inviteLink);
  }
};

window.leaveCurrentcircle = async function () {
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!confirm("Leave this circle?")) return;

  await set(ref(database, "clubs/" + window.currentClubId + "/members/" + currentUser.uid), null);
  await set(ref(database, "users/" + currentUser.uid + "/clubs/" + window.currentClubId), null);

  closecircleSettingsModal();
  showScreen("nook");
  showToast("circle removed.");
};

window.deleteCurrentcircle = async function () {
  if (!window.currentClubId) return alert("Open a circle first.");

  const clubSnapshot = await get(ref(database, "clubs/" + window.currentClubId));
  const club = clubSnapshot.val();

  if (!club) return alert("circle not found.");

  if (club.owner !== currentUser.uid && currentUser.email !== appCreatorEmail) {
    return alert("Only the circle creator can delete this circle.");
  }

  if (!confirm("Delete this circle for everyone?")) return;

  await set(ref(database, "clubs/" + window.currentClubId), null);
  await set(ref(database, "users/" + currentUser.uid + "/clubs/" + window.currentClubId), null);

  closecircleSettingsModal();
  showScreen("nook");
  showToast("circle deleted.");
};
window.saveEditedBook = async function () {
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

  await update(ref(database, path), {
    title,
    author,
    genre,
    lengthType,
    lengthCount,
    synopsis,
    image,
    updatedAt: Date.now()
  });

  closeEditBookModal();
  closeBookModal();

  showToast("Book updated.");
};

window.updateBookStatus = async function (bookId, type, status) {
  const path =
    type === "collection"
      ? "clubs/" + window.currentClubId + "/collection/" + bookId
      : "users/" + currentUser.uid + "/library/" + bookId;

  await update(ref(database, path), {
    status,
    updatedAt: Date.now()
  });

  closeBookModal();
  showToast("Book moved to " + status + ".");
};
function listenToNextRead(clubId) {
  onValue(ref(database, "clubs/" + clubId + "/nextRead"), (snapshot) => {
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
      nextRead.image
        ? `<img src="${escapeAttr(nextRead.image)}" alt="Book cover">`
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
  onValue(ref(database, "clubs/" + clubId + "/booksRead"), (snapshot) => {
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
    <div onclick='openFinishedBookDetails(${JSON.stringify(book)})'>
      ${renderBookCard(book, true)}
    </div>
  `).join("");
  });
}

function listenToMembers(clubId) {
  const memberCount = document.getElementById("clubHeroMemberCount");
  const preview = document.getElementById("clubMemberPreview");
  const modalList = document.getElementById("membersModalList");

  onValue(ref(database, "clubs/" + clubId + "/members"), async (snapshot) => {
    const members = snapshot.val() || {};
    const memberIds = Object.keys(members);

    if (memberCount) {
      memberCount.textContent =
        memberIds.length + " member" + (memberIds.length === 1 ? "" : "s");
    }

    if (memberIds.length === 0) {
      if (preview) preview.innerHTML = "";
      if (modalList) modalList.innerHTML = `<p class="status">No members yet.</p>`;
      return;
    }

    let previewHTML = "";
    let modalHTML = "";

    const visibleMemberIds = memberIds.slice(0, 4);
const hiddenMemberCount = memberIds.length - visibleMemberIds.length;

for (const uid of visibleMemberIds) {
      const userSnapshot = await get(ref(database, "users/" + uid));
      const userData = userSnapshot.val() || {};

      const displayName =
        userData.username ||
        userData.email ||
        "Reader";

      const memberData = members[uid] || {};

const avatarPhoto = userData.avatarPhoto || memberData.avatarPhoto || "";
const avatarValue = userData.avatar || memberData.avatar || "📚";

const avatarHTML =
  avatarValue === "photo" && avatarPhoto
    ? `<img src="${escapeAttr(avatarPhoto)}"
        style="
          width:100%;
          height:100%;
          border-radius:50%;
          object-fit:cover;
          display:block;
        ">`
    : escapeHTML(avatarValue || displayName.charAt(0).toUpperCase());

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

      modalHTML += `
  <div class="book-item">
    <div class="item-title">${avatarHTML} ${escapeHTML(displayName)}</div>
    <div class="small">Reading circle member</div>

    <button class="secondary" onclick="openReaderProfile('${uid}')">
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
  onValue(ref(database, "clubs/" + clubId + "/discussion"), (snapshot) => {
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
      <div class="note-card" onclick="toggleReactionPicker('${comment.id}')">
        <div class="comment-row">
          <div class="comment-avatar">
  ${
    comment.authorAvatar === "photo" && comment.authorAvatarPhoto
      ? `<img src="${escapeAttr(comment.authorAvatarPhoto)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
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
                  onclick="event.stopPropagation(); window.editDiscussionComment('${comment.id}')"
                >
                  Edit Note
                </button>

                <button
                  class="danger"
                  onclick="event.stopPropagation(); window.deleteDiscussionComment('${comment.id}')"
                >
                  Delete Note
                </button>
              </div>
            ` : ""}

            <div class="reaction-summary">
              ❤️ ${comment.reactions?.heart || 0}
              📚 ${comment.reactions?.book || 0}
              👀 ${comment.reactions?.eyes || 0}
              😭 ${comment.reactions?.cry || 0}
            </div>

            <div id="reactionPicker-${comment.id}" class="reaction-picker">
              <button onclick="event.stopPropagation(); reactToComment('${comment.id}', 'heart')">❤️</button>
              <button onclick="event.stopPropagation(); reactToComment('${comment.id}', 'book')">📚</button>
              <button onclick="event.stopPropagation(); reactToComment('${comment.id}', 'eyes')">👀</button>
              <button onclick="event.stopPropagation(); reactToComment('${comment.id}', 'cry')">😭</button>
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
    ref(database, "clubs/" + window.currentClubId + "/collection")
  );

  await set(bookRef, {
  title,
  author,
  
  image,

  genre,
  lengthType,
  lengthCount,
  synopsis,

  addedBy: currentUser.uid,
  createdAt: Date.now()
});

  document.getElementById("bookTitleClub").value = "";
document.getElementById("bookAuthorClub").value = "";
document.getElementById("bookImageClub").value = "";

document.getElementById("bookGenreClub").value = "";
document.getElementById("bookLengthTypeClub").value = "pages";
document.getElementById("bookLengthCountClub").value = "";
document.getElementById("bookSynopsisClub").value = "";
closeAddCollectionBookModal();
  showToast("Added to The Collection.");
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
  if (!window.currentClubId) return alert("Open a society first.");
  if (!window.lastPick) return alert("Let Fate Decides choose a book first.");

  await set(ref(database, "clubs/" + window.currentClubId + "/nextRead"), {
    title: window.lastPick.title || "",
    author: window.lastPick.author || "",
    category: window.lastPick.category || "",
    image: window.lastPick.image || "",
    setAt: Date.now()
  });

  await set(
    ref(database, "clubs/" + window.currentClubId + "/collection/" + window.lastPick.id),
    null
  );

  window.lastPick = null;

  document.getElementById("winnerClub").innerHTML =
    "Featured Volume has been set.";

  showToast("Featured Volume set!");
}; 

window.markNextReadFinished = async function () {
  if (!window.currentClubId) return alert("Open a circle first.");

  const nextReadSnapshot = await get(ref(database, "clubs/" + window.currentClubId + "/nextRead"));
  const nextRead = nextReadSnapshot.val();

  if (!nextRead) return alert("No next read to finish.");

  const finishedRef = push(ref(database, "clubs/" + window.currentClubId + "/booksRead"));

  await set(finishedRef, {
    title: nextRead.title || "",
    author: nextRead.author || "",
    category: nextRead.category || "",
    image: nextRead.image || "",
    finishedAt: Date.now()
  });

  await set(ref(database, "clubs/" + window.currentClubId + "/nextRead"), null);
  alert("Moved to Finished Reads!");
};
window.updateClubProgress = async function () {
  if (!window.currentClubId) {
    alert("Open a society first.");
    return;
  }

  const progress = prompt("Where is the club currently reading? Example: Chapters 21–36");

  if (!progress) return;

  await update(ref(database, "clubs/" + window.currentClubId + "/nextRead"), {
    progress,
    updatedAt: Date.now()
  });

  alert("Club progress updated.");
};
window.postDiscussionComment = async function () {
  if (!window.currentClubId) return alert("Open a circle first.");

  const input = document.getElementById("discussionInput");
  const message = input.value.trim();

  if (!message) return alert("Write a note first.");

  const userSnapshot = await get(ref(database, "users/" + currentUser.uid));
  const userData = userSnapshot.val();

  await set(
  ref(database, "clubs/" + window.currentClubId + "/checkIns/" + currentUser.uid),
  {
    name,
    avatar,
    amount,
    bookTitle,
    checkedInAt: Date.now()
  }
);

  input.value = "";
};
window.sendReadingCheckIn = async function () {
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

  const nextReadSnapshot = await get(
    ref(database, "clubs/" + window.currentClubId + "/nextRead")
  );

  const nextRead = nextReadSnapshot.val();

  if (!nextRead) {
    alert("Set a Featured Volume first so your check-in knows which book you mean.");
    return;
  }

  const userSnapshot = await get(ref(database, "users/" + currentUser.uid));
  const userData = userSnapshot.val() || {};

  const name = userData.username || currentUser.email || "A reader";
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

  
await set(
  ref(database, "clubs/" + window.currentClubId + "/checkIns/" + currentUser.uid),
  {
    name,
    avatar,
    amount,
    bookTitle,
    checkedInAt: Date.now()
  }
);
  input.value = "";
  alert("Your reading circle has been notified!");
};
window.undoReadingCheckIn = async function () {
  if (!window.currentClubId) {
    alert("Open a circle first.");
    return;
  }

  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  await set(
    ref(database, "clubs/" + window.currentClubId + "/checkIns/" + currentUser.uid),
    null
  );

  alert("Your check-in was removed.");
};
window.postDiscussionCommentFromClub = async function () {
  const input = document.getElementById("discussionInputClub");
  if (!input) return;
  const message = input.value.trim();
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!message) return alert("Write a note first.");
  const userSnapshot = await get(ref(database, "users/" + currentUser.uid));
  const userData = userSnapshot.val();
  const commentRef = push(ref(database, "clubs/" + window.currentClubId + "/discussion"));
  await set(commentRef, {
  message,
  authorId: currentUser.uid,
  authorAlias: userData?.username || currentUser.email || "Reader",
  authorAvatar: userData?.avatar || "📚",
authorAvatarPhoto: userData?.avatarPhoto || "",
authorAvatarPhoto: userData?.avatarPhoto || "",
createdAt: Date.now()
});
  input.value = "";
};

window.deleteFinishedBook = async function (bookId) {
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!confirm("Remove this finished read?")) return;

  await set(ref(database, "clubs/" + window.currentClubId + "/booksRead/" + bookId), null);
  alert("Finished read removed.");
};

window.deleteBook = async function (bookId) {
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!confirm("Delete this book from the circle?")) return;

  await set(ref(database, "clubs/" + window.currentClubId + "/books/" + bookId), null);
  showToast("Book deleted.");
};

window.editBook = async function (bookId) {
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

  await update(ref(database, "clubs/" + window.currentClubId + "/books/" + bookId), {
    title: newTitle.trim(),
    author: newAuthor.trim(),
    category: newCategory.trim(),
    image: newImage.trim(),
    updatedAt: Date.now()
  });

  showToast("Book updated.");
};
window.deleteCollectionBook = async function (bookId) {
  if (!window.currentClubId) return alert("Open a society first.");
  if (!confirm("Delete this book from The Collection?")) return;

  await set(ref(database, "clubs/" + window.currentClubId + "/collection/" + bookId), null);
  alert("Book deleted from The Collection.");
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

  await update(ref(database, "clubs/" + window.currentClubId + "/collection/" + bookId), {
    title: newTitle.trim(),
    author: newAuthor.trim(),
    category: newCategory.trim(),
    image: newImage.trim(),
    updatedAt: Date.now()
  });

  alert("Collection book updated.");
};
window.togglePasswordVisibility = function () {
  const passwordInput = document.getElementById("loginPassword");
  const toggleButton = document.getElementById("passwordToggle");

  if (!passwordInput || !toggleButton) return;

  const isHidden = passwordInput.type === "password";

  passwordInput.type = isHidden ? "text" : "password";

  toggleButton.textContent = isHidden ? "📖" : "📕";
  toggleButton.classList.toggle("open", isHidden);

  toggleButton.setAttribute(
    "aria-label",
    isHidden ? "Hide password" : "Show password"
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
  if (!currentUser) return alert("Please log in first.");
  if (!confirm("Remove this circle from your list?")) return;

  await set(ref(database, "users/" + currentUser.uid + "/clubs/" + clubId), null);
  alert("Circle removed from your list.");
};
window.editcircleName = async function (clubId) {
  if (!currentUser) return alert("Please log in first.");

  const clubSnapshot = await get(ref(database, "clubs/" + clubId));
  const club = clubSnapshot.val();

  if (!club) return alert("Circle not found.");

  if (club.owner !== currentUser.uid && currentUser.email !== appCreatorEmail) {
    return alert("Only the circle creator can rename this circle.");
  }

  const newName = prompt("Edit circle name:", club.name || "");

  if (newName === null) return;
  if (!newName.trim()) return alert("Circle name cannot be blank.");

  await update(ref(database, "clubs/" + clubId), {
    name: newName.trim(),
    updatedAt: Date.now()
  });

  showToast("Circle updated.");
};

window.deleteCircle = async function (clubId) {
  if (!currentUser) return alert("Please log in first.");

  const clubSnapshot = await get(ref(database, "clubs/" + clubId));
  const club = clubSnapshot.val();

  if (!club) return alert("circle not found.");

  if (club.owner === currentUser.uid || currentUser.email === appCreatorEmail) {
    if (!confirm("Delete this circle for everyone?")) return;

    await set(ref(database, "clubs/" + clubId), null);
    await set(ref(database, "users/" + currentUser.uid + "/clubs/" + clubId), null);

    showToast("Circle deleted.");
    return;
  }

  if (!confirm("Leave this circle?")) return;

  await set(ref(database, "clubs/" + clubId + "/members/" + currentUser.uid), null);
  await set(ref(database, "users/" + currentUser.uid + "/clubs/" + clubId), null);

  showToast("Circle removed.");
};
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
  if (!window.currentClubId) return alert("Open a circle first.");

  const commentRef = ref(database, "clubs/" + window.currentClubId + "/discussion/" + commentId);
  const snapshot = await get(commentRef);
  const comment = snapshot.val();
  if (!comment) return;

  const reactions = comment.reactions || {};
  reactions[reactionType] = (reactions[reactionType] || 0) + 1;

  await update(commentRef, { reactions });
};

window.toggleReactionPicker = function (commentId) {
  const picker = document.getElementById("reactionPicker-" + commentId);
  if (!picker) return;
  picker.classList.toggle("show");
};

window.editDiscussionComment = async function (commentId) {
  if (!window.currentClubId) return alert("Open a circle first.");

  const commentRef = ref(database, "clubs/" + window.currentClubId + "/discussion/" + commentId);
  const snapshot = await get(commentRef);
  const comment = snapshot.val();

  if (!comment) return alert("Note not found.");

  const updatedMessage = prompt("Edit your Marginalia note:", comment.message || "");
  if (updatedMessage === null) return;

  if (!updatedMessage.trim()) return alert("Note cannot be blank.");

  await update(commentRef, {
    message: updatedMessage.trim(),
    editedAt: Date.now()
  });

  showToast("Note updated.");
};

window.deleteDiscussionComment = async function (commentId) {
  if (!window.currentClubId) return alert("Open a circle first.");
  if (!confirm("Delete this Marginalia note?")) return;

  await set(ref(database, "clubs/" + window.currentClubId + "/discussion/" + commentId), null);
  alert("Note deleted.");
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
  const invite = buildInviteText(clubId, clubName);

  try {
    await navigator.clipboard.writeText(invite.inviteText);
    alert("Invite copied.");
  } catch (error) {
    prompt("Copy this invite:", invite.inviteText);
  }
};

function handleInviteLink() {
  const params = new URLSearchParams(window.location.search);
  const clubId = params.get("club");

  if (clubId) {
    document.getElementById("joinClubId").value = clubId;
    showScreen("nook");
    alert("Invite detected. Tap Join Circle.");
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
  const authScreen = document.getElementById("authScreen");
  const mainApp = document.getElementById("mainApp");
  const mainNav = document.getElementById("mainNav");

  if (!user) {
    currentUser = null;
    authScreen.style.display = "block";
    mainApp.style.display = "none";
    mainNav.style.display = "none";
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

  return;
}

  currentUser = user;

  authScreen.style.display = "none";
  mainApp.style.display = "block";
  mainNav.style.display = "grid";

    document.getElementById("accountEmail").textContent =
      "Signed in as " + (user.email || "Google user");

    await ensureUserRecord(user);

    const userSnapshot = await get(ref(database, "users/" + user.uid));
    const userData = userSnapshot.val() || {};

    if (userData.username) {
      document.getElementById("usernameInput").value = userData.username;
      document.getElementById("currentUsername").textContent =
        "Reader Alias: " + userData.username;
      document.getElementById("nookReaderName").textContent = userData.username;
    }

    if (userData.avatar === "photo" && userData.avatarPhoto) {
      const avatar = document.getElementById("profileAvatar");

      if (avatar) {
        avatar.src = userData.avatarPhoto;
        avatar.style.display = "block";
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
listenToPersonalLibrary();
listenForFriendRequests();
listenForFriends();
listenForBookmarks();
handleInviteLink();
showScreen("nook");

  } catch (error) {
    console.error("Login load error:", error);
    alert("You signed in, but something failed while loading your profile: " + error.message);
  }
});

window.finishFeaturedBook = async function () {
  const user = auth.currentUser;
  const clubId = window.currentClubId;
  const nextRead = window.currentNextRead;

  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");
  if (!nextRead) return alert("No featured volume selected.");

  const confirmFinish = confirm(
    `Move "${nextRead.title}" to Finished Reads and clear the current reading goal?`
  );

  if (!confirmFinish) return;

  const finishedRef = push(ref(database, `clubs/${clubId}/booksRead`));

  await set(finishedRef, {
    ...nextRead,
    finishedAt: Date.now(),
    finishedBy: user.uid
  });

  await update(ref(database, `clubs/${clubId}`), {
  checkIns: null,
  featuredVolume: {
      currentGoal: "Set your next reading goal",
      dueDateLabel: "No due date",
      dueDate: null,
      totalChapters: null,
      checkins: {}
    }
  });

  window.currentNextRead = null;

  const modal = document.getElementById("readingGoalModal");
  if (modal) modal.style.display = "none";

  

  showToast("Book moved to Finished Reads.");
  showClubRoomTab("current");
};
window.saveTotalChapters = async function () {
  const user = auth.currentUser;
  const clubId = window.currentClubId;
  const input = document.getElementById("totalChaptersInput");

  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");
  if (!input.value) return alert("Enter the total number of chapters.");

  await set(ref(database, `clubs/${clubId}/featuredVolume/totalChapters`), Number(input.value));

  alert("Chapter count saved!");
};

window.checkInForBook = async function () {
  const user = auth.currentUser;
  const clubId = window.currentClubId;

  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");

  await set(ref(database, `clubs/${clubId}/featuredVolume/checkins/${user.uid}`), {
    name: user.displayName || user.email || "Member",
    checkedIn: true,
    checkedInAt: Date.now()
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
  const progressRef = ref(database, `clubs/${clubId}`);

  onValue(progressRef, (snapshot) => {
    const clubData = snapshot.val() || {};
const data = clubData.featuredVolume || {};

const totalChapters = data.totalChapters || null;
const checkins = data.checkins || {};

const members = clubData.members || {};
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
      <span>${member.name}</span>
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
        <span class="modal-checkin-name">${member.name}</span>
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

  onValue(
    ref(database,
      `clubs/${clubId}/finishedBookReviews/${book.title}`
    ),
    (snapshot) => {

      const reviews = snapshot.val() || {};

      reviewsList.innerHTML =
        Object.values(reviews).length
          ? Object.values(reviews).map(review => `
             <div class="finished-review-card">

  <div class="finished-review-name">
    ${review.name || "Reader"}
  </div>

  <div class="finished-review-stars">
  ${"★".repeat(review.rating || 0)}${"☆".repeat(5 - (review.rating || 0))}
</div>

  <p class="finished-review-text">
    ${review.text || ""}
  </p>

  <div class="finished-review-date">
    ${new Date(review.createdAt || Date.now()).toLocaleDateString(
      "en-US",
      {
        month: "long",
        day: "numeric",
        year: "numeric"
      }
    )}
  </div>

</div>
            `).join("")
          : `<p class="helper">
               No reviews yet. Be the first to share your thoughts.
             </p>`;
    }
  );
};
window.saveFinishedBookReview = async function (book) {
  const user = auth.currentUser;
  const clubId = window.currentClubId;
  const input = document.getElementById("finishedBookReviewInput");
const ratingInput = document.getElementById("finishedBookReviewRating");
const rating = Number(ratingInput?.value || 0);
  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");
  if (!book || !book.title) return alert("Book not found.");
  if (!input || !input.value.trim()) return alert("Write a review first.");
if (!rating) return alert("Choose a star rating first.");
  const reviewRef = ref(
  database,
  `clubs/${clubId}/finishedBookReviews/${book.title}/${user.uid}`
);

  await set(reviewRef, {
  userId: user.uid,
  name: user.displayName || user.email || "Reader",
  rating,
  text: input.value.trim(),
  createdAt: Date.now()
});

  const reviewText = input.value.trim();

input.value = "";

const reviewsList = document.getElementById("finishedBookReviewsList");

if (reviewsList) {
  reviewsList.innerHTML = `
    <div class="finished-review-card">
      <strong>${user.displayName || user.email || "Reader"}</strong>
      <p>${reviewText}</p>
    </div>
  `;
} else {
  alert("Reviews list not found.");
}

showToast("Review posted!");
};
window.openReaderProfile = async function (uid) {
  const modal = document.getElementById("readerProfileModal");
  const content = document.getElementById("readerProfileContent");

  if (!modal || !content) return;

  const userSnapshot = await get(ref(database, "users/" + uid));
  const userData = userSnapshot.val() || {};

  const displayName =
    userData.username ||
    userData.email ||
    "Reader";

  const avatar =
    userData.avatar || "📚";

  content.innerHTML = `
    <div class="finished-detail-card">

      <div class="finished-detail-hero">
        <div class="finished-detail-placeholder">
          ${avatar}
        </div>

        <div>
          <p class="mini-label">Reader Profile</p>
          <h2>${escapeHTML(displayName)}</h2>
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
  onclick="openReaderStacks('${uid}')">
  View Stacks
</button>
      </section>

      <section class="finished-detail-section">
        <h3>Library</h3>
        <p class="helper">Full library unlocks for friends.</p>

        <button class="secondary">
          View Library
        </button>
      </section>

    </div>
  `;
loadReaderFriendStatus(uid);
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
  const modal = document.getElementById("readerProfileModal");
  if (modal) modal.style.display = "none";
};

window.sendFriendRequest = async function (uid) {
  const user = auth.currentUser;

  if (!user) return alert("Please log in first.");
  if (!uid) return alert("Reader not found.");
  if (uid === user.uid) return alert("You can't add yourself.");

  await set(ref(database, `users/${uid}/friendRequests/${user.uid}`), {
    from: user.uid,
    email: user.email || "",
    createdAt: Date.now()
  });

  showToast("Friend request sent!");
};
window.listenForFriendRequests = function () {
  const user = auth.currentUser;

  if (!user) return;

  const container =
    document.getElementById("friendRequestsList");

  if (!container) return;

  onValue(
    ref(database, `users/${user.uid}/friendRequests`),
    (snapshot) => {

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
              ${requests[uid].email || "Reader"}
            </div>

            <button onclick="acceptFriendRequest('${uid}')">
              Accept
            </button>

          </div>
        `).join("");
    }
  );
};
window.acceptFriendRequest = async function (uid) {
  const user = auth.currentUser;

  if (!user) return;

  await set(
    ref(database, `users/${user.uid}/friends/${uid}`),
    true
  );

  await set(
    ref(database, `users/${uid}/friends/${user.uid}`),
    true
  );

  await remove(
    ref(database, `users/${user.uid}/friendRequests/${uid}`)
  );

  showToast("Friend added!");
};
window.listenForFriends = function () {
  const user = auth.currentUser;

  if (!user) return;

  const container = document.getElementById("friendsList");

  if (!container) return;

  onValue(
    ref(database, `users/${user.uid}/friends`),
    async (snapshot) => {
      const friends = snapshot.val() || {};
      const friendIds = Object.keys(friends);

      if (!friendIds.length) {
        container.innerHTML =
          `<p class="status">No friends yet.</p>`;
        return;
      }

      let html = "";

      for (const uid of friendIds) {
        const userSnapshot =
          await get(ref(database, `users/${uid}`));

        const userData = userSnapshot.val() || {};

        const displayName =
          userData.username ||
          userData.email ||
          "Reader";

        html += `
          <div class="book-item">
            <div class="item-title">
              ${escapeHTML(displayName)}
            </div>

            <button
              class="secondary"
              onclick="openReaderProfile('${uid}')">
              View Profile
            </button>
          </div>
        `;
      }

      container.innerHTML = html;
    }
  );
};
window.saveToBookmarks = async function (book) {
  const user = auth.currentUser;

  if (!user) return alert("Please log in first.");
  if (!book || !book.title) return alert("Book not found.");

  const bookmarksRef = ref(database, `users/${user.uid}/bookmarks`);
  const snapshot = await get(bookmarksRef);
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

  await set(bookmarkRef, {
    title: book.title || "",
    author: book.author || "",
    image: book.image || "",
    category: book.category || "",
    savedAt: Date.now()
  });

  showToast("Saved to Dog-Eared Pages 🔖");
};
window.listenForBookmarks = function () {
  const user = auth.currentUser;

  if (!user) return;

  const container =
    document.getElementById("bookmarksList");

  if (!container) return;

  onValue(
    ref(database, `users/${user.uid}/bookmarks`),
    (snapshot) => {
      const bookmarks = snapshot.val() || {};
      const bookmarkIds = Object.keys(bookmarks);

      if (!bookmarkIds.length) {
        container.innerHTML =
          `<p class="status">No dog-eared pages yet.</p>`;
        return;
      }

      container.innerHTML = `
        <div class="dog-eared-shelf">
          ${
            bookmarkIds.map(id => {
              const book = bookmarks[id];

              return `
                <div class="dog-eared-book">
                  ${
                    book.image
                      ? `<img src="${escapeAttr(book.image)}" alt="Book cover">`
                      : `<div class="dog-eared-placeholder">
                          ${escapeHTML((book.title || "B").charAt(0))}
                        </div>`
                  }

                  <div class="dog-eared-title">
                    ${escapeHTML(book.title || "Untitled")}
                  </div>
                </div>
              `;
            }).join("")
          }
        </div>
      `;
    }
  );
};
window.loadReaderFriendStatus = function (uid) {
  const user = auth.currentUser;
  const statusBox = document.getElementById("readerFriendStatus");

  if (!user || !uid || !statusBox) return;

  if (uid === user.uid) {
    statusBox.innerHTML = `<p class="helper">This is your profile.</p>`;
    return;
  }

  onValue(ref(database, `users/${user.uid}/friends/${uid}`), (snapshot) => {
    if (snapshot.exists()) {
      statusBox.innerHTML = `<p class="helper">✓ Friends</p>`;
    } else {
      statusBox.innerHTML = `
        <p class="helper">Not friends yet.</p>
        <button onclick="sendFriendRequest('${uid}')">
          Add Friend
        </button>
      `;
    }
  });
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
  const user = auth.currentUser;
  const clubId = window.currentClubId;

  if (!user) return alert("Please log in first.");
  if (!clubId) return alert("Open a club first.");
  if (!book || !book.title) return alert("Book not found.");

  await set(
    ref(database, `clubs/${clubId}/finishedBookRatings/${book.title}/${user.uid}`),
    {
      userId: user.uid,
      name: user.displayName || user.email || "Reader",
      rating,
      createdAt: Date.now()
    }
  );

  loadFinishedBookRatings(book);
showToast(`Rated ${rating} stars!`);
};
window.loadFinishedBookRatings = function (book) {
  const clubId = window.currentClubId;
  const summary = document.getElementById("finishedBookRatingSummary");

  if (!clubId || !book || !book.title || !summary) return;

  onValue(
    ref(database, `clubs/${clubId}/finishedBookRatings/${book.title}`),
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

  await update(ref(database, `clubs/${window.currentClubId}/featuredVolume`), {
  currentGoal: goalText,
  goalStart: start,
  goalEnd: end,
  updatedAt: Date.now(),
  checkins: {}
});

  document.getElementById("readingGoalDisplay").textContent = goalText;
  document.getElementById("modalGoalDisplay").textContent = goalText;

  showToast("Reading goal updated.");
};
window.toggleDueDateEditor = function () {
  const editor = document.getElementById("dueDateEditor");
  if (!editor) return;

  editor.style.display =
    editor.style.display === "none" ? "block" : "none";
};

window.saveDueDateEditor = async function () {
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

  await update(ref(database, `clubs/${window.currentClubId}/featuredVolume`), {
    dueDate,
    dueDateLabel: formattedDate,
    updatedAt: Date.now()
  });

  document.getElementById("readingDueDisplay").textContent = formattedDate;
  document.getElementById("modalDueDisplay").textContent = formattedDate;

  showToast("Due date updated.");
};
window.toggleTotalChaptersEditor = function () {
  const editor = document.getElementById("totalChaptersEditor");
  if (!editor) return;

  editor.style.display =
    editor.style.display === "none" ? "block" : "none";
};

window.saveTotalChaptersEditor = async function () {
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

  await update(ref(database, `clubs/${window.currentClubId}/featuredVolume`), {
    totalChapters: Number(totalChapters),
    updatedAt: Date.now()
  });

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
};
window.openFinishedBookDetails = function (book) {
  const modal = document.getElementById("finishedBookModal");
  const content = document.getElementById("finishedBookModalContent");

  if (!modal || !content) return;

  content.innerHTML = `
    <div class="finished-detail-card">

      <div class="finished-detail-hero">
        ${
          book.image
            ? `<img src="${escapeAttr(book.image)}" class="finished-detail-cover">`
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
    <button onclick='saveFinishedBookRating(${JSON.stringify(book)}, 1)'>★</button>
    <button onclick='saveFinishedBookRating(${JSON.stringify(book)}, 2)'>★</button>
    <button onclick='saveFinishedBookRating(${JSON.stringify(book)}, 3)'>★</button>
    <button onclick='saveFinishedBookRating(${JSON.stringify(book)}, 4)'>★</button>
    <button onclick='saveFinishedBookRating(${JSON.stringify(book)}, 5)'>★</button>
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

  <button onclick='saveFinishedBookReview(${JSON.stringify(book)})'>
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
  const modal =
    document.getElementById("finishedBookModal");

  if (modal) {
    modal.style.display = "none";
  }
};
const pageLayer = document.getElementById("floatingPages");

const MAX_ACTIVE_PAGES = 5;
const SPAWN_DELAY = 3600;

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

function createFloatingPage() {
  if (!pageLayer) return;

  const activePages = pageLayer.querySelectorAll(".floating-page").length;

  if (activePages >= MAX_ACTIVE_PAGES) {
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

  const size = randomBetween(52, 104);
  const startX = randomBetween(-6, 96);
  const opacity = randomBetween(0.24, 0.52);

  // Smaller/background pages drift slower. Larger/foreground pages fall slightly faster.
  const sizeRatio = (size - 52) / (104 - 52);
  const duration = 18 - sizeRatio * 6;

  const sway = randomBetween(-70, 70);
  const rotate = randomBetween(-18, 18);
  const shadowX = randomBetween(-12, 12);

  page.style.left = `${startX}vw`;
  page.style.setProperty("--page-width", `${size}px`);
  page.style.setProperty("--page-opacity", opacity);
  page.style.setProperty("--fall-duration", `${duration}s`);
  page.style.setProperty("--sway", `${sway}px`);
  page.style.setProperty("--start-rotate", `${rotate}deg`);
  page.style.setProperty("--shadow-x", `${shadowX}px`);

  pageLayer.appendChild(page);

  setTimeout(() => {
    page.remove();
  }, duration * 1000);
}

function startFloatingPages() {
  createFloatingPage();

  setInterval(() => {
    createFloatingPage();
  }, SPAWN_DELAY);
}

startFloatingPages();