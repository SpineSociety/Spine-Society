import { mountGoldenView } from "./golden-view.mjs";
import {
  createReaderProfileEditor,
  readerAvatarStyleForValue,
} from "./reader-profile-editor.mjs";
import {
  DEFAULT_READER_PROFILE,
  normalizeReaderLibrary,
} from "./reader-profile-data.mjs";
import { safeImageUrl } from "./security-utils.mjs";

function displayAlias(value) {
  const alias = typeof value === "string" ? value.trim().replace(/^@/u, "") : "";
  const handle = alias.toLowerCase().replace(/\s+/gu, "");
  return handle ? `@${handle}` : "";
}

/** Presentation binding only. Account mutations remain in the historical script. */
export function createReaderBridge({
  subscribe,
  profilePath,
  formatName,
  notify,
  isPermissionDenied,
}) {
  const host = document.getElementById("goldenReaderHost");
  const editor = document.getElementById("readerEditPanel");
  let identity = null;
  let profile = {};
  let libraryBooks = [];
  let libraryStatus = "idle";
  let libraryReady = Promise.resolve();
  let resolveLibraryReady = null;
  let stop = null;
  let generation = 0;
  const ready = mountGoldenView(host);

  async function paint(token = generation, uid = identity) {
    const view = await ready;
    if (!uid || token !== generation || identity !== uid) return;
    const name = formatName(profile.displayName || profile.username);
    const readerProfile = profile.readerProfile || DEFAULT_READER_PROFILE;
    const bookId = readerProfile.currentlyReadingBookId;
    const book = libraryBooks.find(item => item.id === bookId) || null;
    view.setIdentity({
      name,
      alias: displayAlias(profile.username),
      avatar: profile.avatar || "",
      avatarStyle: readerAvatarStyleForValue(profile.avatar, profile.avatarStyle),
      photo: profile.avatar === "photo" &&
        typeof profile.avatarPhoto === "string" &&
        safeImageUrl(profile.avatarPhoto) || "",
    });
    view.setReaderData({
      profile: readerProfile,
      book,
      missingBook: libraryStatus === "ready" && Boolean(bookId && !book),
      libraryUnavailable: libraryStatus === "error",
    });
  }

  const editorController = createReaderProfileEditor({
    host,
    panel: editor,
    getIdentity: () => identity,
    getProfile: () => profile,
    getOwnedBooks: async uid => {
      if (identity !== uid) return { books: [], status: "stale" };
      await libraryReady;
      return identity === uid
        ? { books: libraryBooks, status: libraryStatus }
        : { books: [], status: "stale" };
    },
    saveProfile: async changes => {
      return window.saveReaderProfileDraft(changes);
    },
    onSaved: patch => {
      const { library, ...profilePatch } = patch;
      profile = { ...profile, ...profilePatch };
      if (Array.isArray(library)) {
        libraryBooks = normalizeReaderLibrary(library);
        libraryStatus = "ready";
        resolveLibraryReady?.();
        resolveLibraryReady = null;
      }
      return paint();
    },
  });
  const nav = document.getElementById("mainNav");
  const originalNav = [...nav.children].map(node => node.innerHTML);
  const labels = ["Nook", "Random", "Stacks", "Reflect", "Reader"];
  const icons = [
    '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
    '<path d="m12 3 8 4v10l-8 4-8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
    '<path d="M4 7h16M4 12h16M4 17h12"/><path d="M7 4h10"/>',
    '<path d="m5 19 4-.8L19 8l-3-3L6 15zM14 7l3 3"/>',
    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ];
  let wasActive = false;
  const observer = new MutationObserver(() => {
    const active = document.getElementById("profileScreen").classList.contains("active");
    document.body.classList.toggle("golden-reader-active", active);
    if (active !== wasActive) {
      [...nav.children].forEach((node, i) => {
        node.innerHTML = active
          ? `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[i]}</svg><span>${labels[i]}</span>`
          : originalNav[i];
        if (active) node.setAttribute("aria-current", i === 4 ? "page" : "false");
        else node.removeAttribute("aria-current");
      });
      if (!active) {
        closeEditor();
        window.closeFriendsModal?.({ restoreFocus: false });
      }
      wasActive = active;
    }
  });
  observer.observe(document.getElementById("profileScreen"), { attributes: true, attributeFilter: ["class"] });

  function closeEditor() {
    editorController.close();
  }
  ready.then(view => {
    view.onAction(action => {
      if (action === "edit" && identity) {
        editorController.open();
      } else if (action === "friends") {
        notify("Friends are coming soon.");
      }
    });
  });
  return {
    ready,
    bind(user) {
      this.clear();
      if (!user?.uid || user.emailVerified !== true) return;
      identity = user.uid;
      profile = {};
      libraryBooks = [];
      libraryStatus = "loading";
      const token = generation;
      libraryReady = new Promise(resolve => { resolveLibraryReady = resolve; });
      const unsubscribe = [
        "username",
        "displayName",
        "avatar",
        "avatarStyle",
        "avatarPhoto",
        "readerProfile",
      ].map(field =>
        subscribe(`${profilePath(user.uid)}/${field}`, snapshot => {
          profile[field] = snapshot.val();
          void paint(token, user.uid);
        }, error => {
          if (token !== generation) return;
          if ((field === "displayName" || field === "avatarStyle") &&
              isPermissionDenied?.(error)) {
            profile[field] = null;
            void paint(token, user.uid);
            return;
          }
          this.clear();
          notify("Reader information could not be loaded. No profile changes were made.");
        }));
      unsubscribe.push(subscribe(`${profilePath(user.uid)}/library`, snapshot => {
        if (token !== generation || identity !== user.uid) return;
        libraryBooks = normalizeReaderLibrary(snapshot.val());
        libraryStatus = "ready";
        resolveLibraryReady?.();
        resolveLibraryReady = null;
        void paint(token, user.uid);
      }, () => {
        if (token !== generation) return;
        libraryBooks = [];
        libraryStatus = "error";
        resolveLibraryReady?.();
        resolveLibraryReady = null;
        notify("Your collection could not be verified. Reader profile changes are paused.");
        void paint(token, user.uid);
      }));
      stop = () => unsubscribe.forEach(fn => fn?.());
      void paint(token, user.uid);
    },
    clear() {
      generation++;
      stop?.();
      stop = null;
      resolveLibraryReady?.();
      resolveLibraryReady = null;
      libraryReady = Promise.resolve();
      identity = null;
      profile = {};
      libraryBooks = [];
      libraryStatus = "idle";
      closeEditor();
      ready.then(view => {
        if (!identity) {
          view.setIdentity({
            name: "Reader",
            alias: "No reader signed in",
            avatar: "",
            avatarStyle: "",
            photo: "",
          });
          view.setReaderData({ profile: {}, book: null, missingBook: false });
        }
      });
      document.getElementById("usernameInput").value = "";
      document.getElementById("profileAvatar").removeAttribute("src");
      document.getElementById("profileAvatar").style.display = "none";
      document.getElementById("currentAvatar").textContent = "No avatar loaded";
    },
  };
}
