import { createPersonalShelves } from "../personal-shelves.mjs";
import { countLibraryBookStatuses, filterLibraryBooks } from "../library-view-state.mjs";
import {
  buildStack,
  createInitialArrangement,
  serializeArrangement,
  setOrientation,
} from "../library-arrangement-model.mjs";

const books = [
  ["book-amber", "The Lantern at Dusk", "Mara Ellery", "Completed", 184],
  ["book-garden", "A Garden of Margins", "Jon Bell", "In Progress", 256],
  ["book-water", "The Quiet Water", "S. A. Rowan", "Want to Read", 312],
  ["book-clock", "A Clock for the Moon", "Milo Finch", "Completed", 168],
  ["book-archive", "The Archive of Rain", "E. W. North", "Want to Read", 224],
  ["book-small", "Small Notes from Elsewhere", "Ada North", "In Progress", 192],
  ["book-copper", "The Copper Garden", "Nell Arbour", "Want to Read", 340],
  ["book-paper", "Rooms of Paper", "R. L. Moss", "Completed", 132],
].map(([id, title, author, status, lengthCount], index) => ({
  id, title, author, status, lengthCount, lengthType: "pages",
  shelfGap: 5,
}));
const screen = new URLSearchParams(location.search).get("screen") || "nook";
const isArrangeScreen = screen === "collection-arrange" || screen === "collection-arrange-stack";
const dimensions = getBookSpineDimensions;

let screenshotArrangement = null;
if (isArrangeScreen) {
  let shelfX = 0;
  for (const book of books) {
    book.shelfX = shelfX;
    shelfX += dimensions(book).width + 16;
  }
  let scene = createInitialArrangement(books, dimensions);
  for (const [bookId, orientation] of [
    ["book-garden", "lean-left"],
    ["book-clock", "lean-right"],
  ]) {
    const result = setOrientation(scene, bookId, orientation);
    if (!result.ok) throw new Error(`Arrange screenshot setup failed: ${result.reason}`);
    scene = result.scene;
  }
  const stacked = buildStack(scene, ["book-small", "book-copper", "book-paper"], {
    shelfId: "shelf-2",
    x: 180,
  });
  if (!stacked.ok) throw new Error(`Arrange screenshot stack setup failed: ${stacked.reason}`);
  screenshotArrangement = {
    ...serializeArrangement(stacked.scene),
    revision: 1,
  };
}
const bookmarks = [
  { ...books[3], id: "saved-clock", category: "Fantasy" },
  { ...books[5], id: "saved-small", category: "Poetry" },
  { ...books[7], id: "saved-paper", category: "Literary Fiction" },
];

function getBookSpineDimensions(book) {
  const count = Number(book.lengthCount);
  const estimatedPages = (book.lengthType || "pages") === "chapters" ? count * 12 : count;
  const width = Math.round(Math.max(58, Math.min(102, 55 + estimatedPages * 0.075)));
  const seed = [...String(book.id || book.title || "book")]
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  return { width, height: 196 + (seed % 27) - 13 };
}

function renderSpine(book) {
  const dimensions = getBookSpineDimensions(book);
  const palettes = ["palette-olive", "palette-oxblood", "palette-blue", "palette-plum", "palette-umber", "palette-forest"];
  const seed = [...String(book.id || book.title || "book")]
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  const spine = document.createElement("div");
  spine.className = `library-book-spine ${palettes[seed % palettes.length]}`;
  spine.style.setProperty("--book-height", `${dimensions.height}px`);
  spine.style.width = `${dimensions.width}px`;
  spine.style.height = `${dimensions.height}px`;
  spine.style.flex = `0 0 ${dimensions.width}px`;
  spine.title = book.title;
  spine.addEventListener("click", event => event.preventDefault());
  const title = document.createElement("div");
  const titleClass = Array.from(String(book.title || "")).length > 22
    ? " library-spine-title--long"
    : "";
  title.className = `library-spine-title${titleClass}`;
  title.textContent = book.title;
  const author = document.createElement("div");
  author.className = "library-spine-author";
  author.textContent = book.author || "Unknown";
  const status = document.createElement("div");
  status.className = "library-spine-status";
  status.textContent = book.category || book.status || "Want to Read";
  spine.append(title, author, status);
  return spine;
}

const fakeSession = Object.freeze({ uid: "fictional-screenshot-reader" });
const shelves = createPersonalShelves({
  getBooks: () => books,
  getUid: () => fakeSession.uid,
  getSession: () => fakeSession,
  getSavedArrangement: () => screenshotArrangement,
  dimensions,
  renderSpine,
  saveArrangement: async () => { throw new Error("Screenshot preview is read-only."); },
});

let currentFilter = "All";
let currentSearch = "";
function renderCollection() {
  const visible = filterLibraryBooks(books, currentFilter, currentSearch);
  const counts = countLibraryBookStatuses(books);
  document.querySelectorAll("#collectionScreen [data-filter-count]").forEach(node => {
    node.textContent = String(counts[node.dataset.filterCount] || 0);
  });
  const resultCount = document.getElementById("libraryResultCount");
  if (resultCount) resultCount.textContent = `${visible.length} of ${books.length} books`;
  shelves.render(document.getElementById("libraryGrid"), "collection", visible, {
    emptyMessage: "No books match these filters.",
  });
}

function setScreen(screenName) {
  const libraryView = screenName === "bookmarks"
    ? "bookmarks"
    : screenName.startsWith("collection") ? "collection" : null;
  const nookView = screenName.startsWith("nook");
const screenIds = {
    nook: "nookScreen",
    "nook-lower": "nookScreen",
  collection: "collectionScreen",
  "collection-shelf": "collectionScreen",
  "collection-shelf-next": "collectionScreen",
  "collection-arrange": "collectionScreen",
  "collection-arrange-stack": "collectionScreen",
    bookmarks: "bookmarksScreen",
    randomizer: "randomizerScreen",
    reflection: "reflectionScreen",
    profile: "profileScreen",
  };
  document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
  document.getElementById(screenIds[screenName] || "nookScreen")?.classList.add("active");
  const navName = libraryView ? "stacks" : nookView ? "nook" : screenName;
  document.querySelectorAll("#mainNav .nav-btn").forEach(button => button.classList.remove("active"));
  document.getElementById(`${navName}Tab`)?.classList.add("active");
  if (libraryView) {
    document.querySelectorAll(".phase3g-collection-tabs [data-library-view]").forEach(button => {
      const active = button.dataset.libraryView === libraryView;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }
  window.scrollTo(0, 0);
}

window.showScreen = setScreen;
window.showLibraryView = screenName =>
  setScreen(screenName === "bookmarks" ? "bookmarks" : "collection");
window.setLibraryFilter = (status, button) => {
  currentFilter = status;
  document.querySelectorAll("#collectionScreen [data-filter]").forEach(candidate => {
    const active = candidate === button;
    candidate.classList.toggle("active", active);
    candidate.setAttribute("aria-pressed", String(active));
  });
  renderCollection();
};
window.setLibrarySearch = query => {
  currentSearch = String(query || "");
  renderCollection();
};
window.toggleNookCircleForm = () => {};

const authScreen = document.getElementById("authScreen");
if (authScreen) authScreen.style.setProperty("display", "none", "important");
const societyEntrance = document.querySelector(".society-entrance");
if (societyEntrance) societyEntrance.style.setProperty("display", "none", "important");
const mainApp = document.getElementById("mainApp");
if (mainApp) mainApp.style.display = "block";
const mainNav = document.getElementById("mainNav");
if (mainNav) mainNav.style.display = "grid";
const readerName = document.getElementById("nookReaderName");
if (readerName) readerName.textContent = "Avery";
const collectionCount = document.getElementById("phase3g-book-count");
if (collectionCount) collectionCount.textContent = `${books.length} BOOKS`;
const clubCount = document.getElementById("clubCount");
if (clubCount) clubCount.textContent = "A QUIET PLACE TO GATHER";
const clubList = document.getElementById("clubList");
if (clubList) {
  clubList.innerHTML = '<p class="status">Your circles will appear here when you join one.</p>';
}

shelves.render(document.getElementById("nookCollectionShelf"), "nook", books.slice(0, 6));
renderCollection();
const bookmarkRow = document.createElement("div");
bookmarkRow.className = "bookshelf-row";
for (const book of bookmarks) bookmarkRow.append(renderSpine(book));
document.getElementById("bookmarksList")?.replaceChildren(bookmarkRow);
const bookmarkCount = document.getElementById("phase3g-bookmark-count");
if (bookmarkCount) bookmarkCount.textContent = `${bookmarks.length} SAVED`;

document.getElementById("nookTab")?.addEventListener("click", () => setScreen("nook"));
document.getElementById("randomizerTab")?.addEventListener("click", () => setScreen("randomizer"));
document.getElementById("stacksTab")?.addEventListener("click", () => setScreen("collection"));
document.getElementById("reflectionTab")?.addEventListener("click", () => setScreen("reflection"));
document.getElementById("profileTab")?.addEventListener("click", () => setScreen("profile"));

setScreen(screen);
if (isArrangeScreen) {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const arrangeButton = [...document.querySelectorAll("#libraryGrid .personal-shelf-mode")]
    .find(button => button.textContent === "Arrange");
  arrangeButton?.click();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const activeScreen = document.getElementById("collectionScreen");
  const tools = document.querySelector("#libraryGrid .personal-shelf-tools");
  if (activeScreen && tools) {
    activeScreen.scrollTop += tools.getBoundingClientRect().top -
      activeScreen.getBoundingClientRect().top - 12;
  }
  const viewport = document.querySelector("#libraryGrid .personal-shelf-viewport");
  if (viewport) {
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = screen === "collection-arrange-stack"
      ? Math.min(maxScroll, Math.round(maxScroll / 2) + 40)
      : maxScroll;
    viewport.scrollLeft = 0;
  }
}
if (screen === "nook-lower" || screen === "collection-shelf" || screen === "collection-shelf-next") {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const activeScreen = document.querySelector(".screen.active");
  if (screen === "nook-lower") {
    const target = document.querySelector("#nookScreen .phase4b1-nook-room-card");
    if (activeScreen && target) {
      activeScreen.scrollTop += target.getBoundingClientRect().top -
        activeScreen.getBoundingClientRect().top - 14;
    }
  } else {
    const viewport = document.querySelector("#collectionScreen #libraryGrid .personal-shelf-viewport");
    if (activeScreen && viewport) {
      activeScreen.scrollTop += viewport.getBoundingClientRect().top -
        activeScreen.getBoundingClientRect().top - 14;
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      if (screen === "collection-shelf-next") {
        const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        viewport.scrollLeft = Math.min(maxScroll, viewport.clientWidth);
      }
    }
  }
}
await document.fonts?.ready;
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
document.documentElement.dataset.screenshotReady = "true";
