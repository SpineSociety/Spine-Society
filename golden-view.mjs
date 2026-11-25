// Golden Reading Room view: faithful approved renderRoom markup in a shadow root.
// Persistence disclosure follows the selected review mode; approved visual structure stays fixed.
import { PROFILE_GENRES, profileForDisplay } from "./reader-profile-data.mjs";
const pageBase = new URL("./", location.href);
const asset = (name) => new URL(`./assets/${name}`, pageBase).href;

const icon = (name) => {
  const paths = {
    edit: '<path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5z"/><path d="m13.8 6.7 3.5 3.5"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    literary: '<path d="M4 5.5c2.2-.8 5-.2 8 1.5v13c-3-1.7-5.8-2.3-8-1.5z"/><path d="M20 5.5c-2.2-.8-5-.2-8 1.5v13c3-1.7 5.8-2.3 8-1.5z"/>',
    historical: '<path d="M3 20h18M5 20v-8h14v8M8 12V7h8v5M10 7V4h4v3M8 15h2m4 0h2"/>',
    poetry: '<path d="M12 21V8"/><path d="M12 12C7 12 5 9 5 5c4 0 7 2 7 7ZM12 16c0-4 2-7 7-7 0 4-2 7-7 7Z"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
};

// Keep the approved composition while rendering only saved account data.
const SAMPLE_BIO = "";
const SAMPLE_GENRES = [];
const SAMPLE_BOOK = { title: "", author: "", cover: "", color: "#67513a" };
const GENRES_BY_ID = new Map(PROFILE_GENRES.map(genre => [genre.id, genre]));
const AVATAR_STYLE_COLORS = Object.freeze({
  fern: "#586149",
  clay: "#815444",
  ink: "#42545b",
  plum: "#69545f",
});

function adaptCss(text) {
  return text
    .replace(/:root\b/g, ":host")
    .replace(/body\[data-screen="room"\]/g, '.room-document[data-screen="room"]')
    .replace(/(^|[\s,}])html(\s*\{)/g, "$1:host$2")
    .replace(/(^|[\s,}])body(\s*\{)/g, "$1.room-document$2");
}

const ADAPTER_CSS = `
:host { all: initial; display: block; }
.room-document { display: block; position: relative; }
.room-document[data-screen="room"] .masthead { display: none; }
.reading-empty-state { margin: 0; text-align: center; color: #ead8b4; font: italic 1rem/1.5 var(--serif); }
.identity .avatar[data-avatar-style] { background-image: radial-gradient(circle at 35% 27%, rgba(255,237,183,.28), transparent 36%), linear-gradient(145deg, var(--reader-avatar-color, #465044), #1b211a 80%); }
.avatar-photo { overflow: hidden; padding: 0; }
.avatar-image { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
.friends-entry:disabled { opacity: 1; cursor: default; }
`;

function markup() {
  const ledge = `<img src="${asset("walnut-shelf-ledge.jpg")}" alt="" class="walnut-ledge" width="926" height="55" aria-hidden="true">`;
  const bookHeading = `<div class="book-heading"><span></span><h2 id="reading-heading">Currently Reading</h2><span></span></div>`;
  return `<div class="room-document" data-screen="room"><div class="app-shell">
    <div class="room-scene" aria-hidden="true"><img src="${asset("library-corner.jpg")}" alt="" class="room-scene-art"></div>
    <main id="app" tabindex="-1">
    <div class="page-head page-head-room"><div class="page-head-copy"><div class="page-head-top"><div class="eyebrow">READER · YOUR READING ROOM</div><button class="button subtle page-edit-action" type="button" data-action="edit" aria-label="Edit profile" data-testid="button-edit-profile">${icon("edit")}<span>Edit</span></button></div><h1>Your Reading Room</h1><p class="subtitle">A little corner of the story that’s yours.</p></div></div>
    <div class="reading-room">
      <section class="profile-card" aria-label="Reader profile">
        <div class="identity">
          <span class="avatar" data-golden-avatar role="img" aria-label="Profile portrait"></span>
          <span class="identity-divider" aria-hidden="true"></span>
          <div class="identity-copy"><h2 data-testid="text-display-name"></h2><p class="username" data-testid="text-username"></p></div>
        </div>
      </section>
      <section class="profile-story" aria-labelledby="bio-heading">
        <svg class="parchment-botanical" viewBox="0 0 70 100" aria-hidden="true">
          <path d="M18 87C31 67 39 49 49 14M29 68C17 66 11 58 12 48c11 1 18 7 18 16M37 51c-1-12 5-20 16-23 2 11-3 20-16 23ZM45 31c-8-4-11-11-8-20 9 4 12 10 8 20ZM24 77c-8-1-14-6-17-14 9-1 15 3 17 14Z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M15 50c4 4 8 8 13 13m9-16c5-6 10-12 16-16M40 35c-2-7-3-13-3-21M12 65c4 3 8 7 11 11" fill="none" stroke="currentColor" stroke-width=".8" stroke-linecap="round"/>
        </svg>
        <span class="parchment-divider" aria-hidden="true"></span>
        <div class="parchment-copy">
          <h2 id="bio-heading">Between the Pages</h2>
          <p class="bio-copy" data-testid="text-biography">${SAMPLE_BIO}</p>
        </div>
      </section>
      <section class="genre-block" aria-labelledby="genres-heading">
        <div class="genre-heading"><span id="genres-heading">Favorite Genres</span></div>
        <ul class="genre-list" data-testid="list-genres">${SAMPLE_GENRES.map(([g, i]) => `<li class="genre-tag">${icon(i)}<span>${g}</span></li>`).join("")}</ul>
      </section>
      <section class="reading-feature" aria-labelledby="reading-heading">
        <div class="shelf-display" data-testid="currently-reading-book" hidden>
          <div class="shelf-row" data-testid="shelf-row">
            <img src="${asset("glass-vase-cream-flowers-cutout.png")}" alt="" aria-hidden="true" class="floral-vase" draggable="false">
            <div class="book-cover" style="--cover-color:${SAMPLE_BOOK.color}"><span>${SAMPLE_BOOK.cover}</span></div>
            <div class="book-meta">${bookHeading}<h3 data-testid="text-current-book-title">${SAMPLE_BOOK.title}</h3><p class="book-author" data-testid="text-current-book-author">by ${SAMPLE_BOOK.author}</p><span class="share-status" data-testid="text-current-book-privacy"><i class="status-dot"></i>Private to you</span></div>
          </div>${ledge}
        </div>
        <p class="reading-empty-state" data-testid="currently-reading-empty">Nothing just now.</p>
      </section>
      <section class="friends-card" aria-label="Friends">
        <button class="friends-entry" type="button" disabled aria-disabled="true" data-testid="button-open-friends" aria-label="Friends. Coming soon.">
          <span class="friends-glyph">${icon("people")}</span>
          <span class="friends-divider" aria-hidden="true"></span>
          <span class="friends-entry-copy"><strong>Friends</strong><small><span class="friends-copy-wide">Find readers, tend to requests, keep good company.</span><span class="friends-copy-mobile">Find readers, tend to requests, keep good company.</span></small></span>
          <span class="arrow" aria-hidden="true">›</span>
        </button>
      </section>
      <aside class="privacy-caption"><span>Privacy previews are illustrative only; they do not enforce security.</span><span class="room-demo-status">Reader Release 1</span></aside>
    </div>
    </main>
  </div></div>`;
}

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
function safeProfileImage(value) {
  if (SAFE_DATA_IMAGE.test(String(value || ""))) return true;
  try {
    const url = new URL(String(value), location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => Array.from(p)[0]).join("") || "?").toUpperCase();
}

export async function mountGoldenView(host) {
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  // Fetch the byte-identical text resource: Vite serves .css fetches as JS modules.
  const cssResponse = await fetch(new URL("./approved-room-source.txt", pageBase), {
    cache: "no-store",
  });
  if (!cssResponse.ok) {
    throw new Error(`Approved Reading Room styles could not be loaded (${cssResponse.status}).`);
  }
  const approvedCss = await cssResponse.text();
  if (!approvedCss.trimStart().startsWith(":root")) {
    throw new Error("Approved Reading Room resource is not raw CSS.");
  }
  let cssText = adaptCss(approvedCss);
  // Rewrite relative asset url() paths so they resolve from the candidate folder.
  cssText = cssText.replace(/url\((['"]?)\.\/assets\/([^)'"]+)\1\)/g,
    (_, quote, filename) => `url("${asset(filename)}")`);
  shadow.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = cssText + ADAPTER_CSS;
  const tpl = document.createElement("template");
  tpl.innerHTML = markup();
  shadow.append(style, tpl.content);
  const root = shadow.querySelector(".room-document");
  let callback = null;
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !callback) return;
    const action = button.dataset.action;
    if (action === "edit" || action === "friends") callback(action);
  });

  function setIdentity({ name = "", alias = "", avatar = "", avatarStyle = "", photo = "" } = {}) {
    const nameEl = root.querySelector('[data-testid="text-display-name"]');
    const aliasEl = root.querySelector('[data-testid="text-username"]');
    const shown = String(name || "Reader");
    nameEl.textContent = shown;
    aliasEl.textContent = String(alias || "");
    aliasEl.hidden = !aliasEl.textContent;
    const slot = root.querySelector("[data-golden-avatar]");
    slot.replaceChildren();
    slot.classList.remove("avatar-photo");
    slot.removeAttribute("data-avatar-style");
    slot.style.removeProperty("--reader-avatar-color");
    if (photo && safeProfileImage(photo)) {
      slot.classList.add("avatar-photo");
      slot.setAttribute("aria-label", "Custom profile photo");
      const img = document.createElement("img");
      img.className = "avatar-image"; img.alt = ""; img.src = String(photo);
      slot.append(img);
    } else {
      const style = AVATAR_STYLE_COLORS[avatarStyle] ? avatarStyle : "fern";
      slot.dataset.avatarStyle = style;
      slot.style.setProperty("--reader-avatar-color", AVATAR_STYLE_COLORS[style]);
      const text = String(avatar || "").trim();
      slot.textContent = text && text !== "initials"
        && text !== "photo"
        ? Array.from(text).slice(0, 3).join("")
        : initialsOf(shown);
      slot.setAttribute("aria-label", `Profile portrait for ${shown || "reader"}`);
    }
  }
  function setReaderData({
    profile = {},
    book = null,
    missingBook = false,
    libraryUnavailable = false,
  } = {}) {
    const saved = profileForDisplay(profile);
    root.querySelector('[data-testid="text-biography"]').textContent = saved.biography;

    const genreList = root.querySelector('[data-testid="list-genres"]');
    genreList.replaceChildren();
    for (const id of saved.favoriteGenres) {
      const genre = GENRES_BY_ID.get(id);
      if (!genre) continue;
      const item = document.createElement("li");
      item.className = "genre-tag";
      item.innerHTML = icon(genre.icon);
      const label = document.createElement("span");
      label.textContent = genre.label;
      item.append(label);
      genreList.append(item);
    }

    const shelf = root.querySelector('[data-testid="currently-reading-book"]');
    const empty = root.querySelector('[data-testid="currently-reading-empty"]');
    if (!book || typeof book.title !== "string" || typeof book.author !== "string") {
      shelf.hidden = true;
      empty.hidden = false;
      empty.textContent = libraryUnavailable
        ? "The collection could not be loaded. Your saved selection was not changed."
        : missingBook
          ? "The saved book is no longer in this reader's collection."
          : "Nothing just now.";
      return;
    }
    shelf.hidden = false;
    empty.hidden = true;
    root.querySelector('[data-testid="text-current-book-title"]').textContent = book.title;
    root.querySelector('[data-testid="text-current-book-author"]').textContent = `by ${book.author}`;
    root.querySelector(".book-cover span").textContent = book.title;
    const cover = root.querySelector(".book-cover");
    const localCover = typeof book.image === "string" &&
      /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(book.image)
      ? book.image : "";
    if (localCover) {
      cover.style.backgroundImage =
        `linear-gradient(90deg, rgba(16,10,7,.58) 0 10%, transparent 11%), url("${localCover}") center / cover no-repeat`;
    } else {
      cover.style.removeProperty("background-image");
    }
  }
  setIdentity({});
  return {
    root,
    setIdentity,
    setReaderData,
    onAction(fn) { callback = typeof fn === "function" ? fn : null; },
  };
}
