import {
  DEFAULT_READER_PROFILE,
  PROFILE_GENRES,
  isSupportedAvatarStyle,
  normalizeReaderLibrary,
  profileForDisplay,
  validateReaderDisplayName,
  validateReaderProfile,
} from "./reader-profile-data.mjs";
import { safeImageUrl } from "./security-utils.mjs";

const PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const GENRE_ID_BY_LABEL = new Map(PROFILE_GENRES.map(({ id, label }) => [label, id]));
const AVATAR_STYLES = {
  fern: { value: "🌿", color: "#586149", label: "Fern green" },
  clay: { value: "🕯️", color: "#815444", label: "Terracotta" },
  ink: { value: "📚", color: "#42545b", label: "Blue ink" },
  plum: { value: "🌙", color: "#69545f", label: "Dried plum" },
};
const VALUE_TO_STYLE = new Map([
  ["🌿", "fern"], ["🕯️", "clay"], ["📚", "ink"], ["🌙", "plum"],
  ["☕", "clay"], ["🦉", "ink"], ["🖋️", "plum"],
]);

export function readerAvatarStyleForValue(value, savedStyle) {
  return isSupportedAvatarStyle(savedStyle)
    ? savedStyle
    : VALUE_TO_STYLE.get(value) || "fern";
}

export function validateReaderAlias(value) {
  const alias = typeof value === "string" ? value.trim() : "";
  if (!alias) return { ok: false, message: "Enter a Reader Alias." };
  if (/@.*[.]/u.test(alias)) return { ok: false, message: "Choose a Reader Alias that is not an email address." };
  if (alias.length > 80) return { ok: false, message: "Keep your Reader Alias to 80 characters or fewer." };
  return { ok: true, value: alias };
}

export function validateProfilePhoto(file) {
  if (!file) return { ok: false, message: "Choose a photo first." };
  if (!PHOTO_TYPES.has(file.type)) return { ok: false, message: "Choose a PNG, JPEG, GIF, or WebP image." };
  if (file.size <= 0 || file.size > MAX_PROFILE_PHOTO_BYTES) {
    return { ok: false, message: "Choose an image smaller than 2 MiB." };
  }
  return { ok: true };
}

function safeProfileImage(value) {
  return typeof value === "string" && Boolean(safeImageUrl(value));
}

function initialsFor(value) {
  const words = String(value || "").trim().split(/\s+/u).filter(Boolean);
  return words.slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase() || "R";
}

function displayNameFromAlias(value) {
  const alias = typeof value === "string" ? value.trim() : "";
  return alias && !/@.*[.]/u.test(alias) ? alias : "Reader";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(reader.error || new Error("Photo could not be read.")), { once: true });
    reader.readAsDataURL(file);
  });
}

async function verifyImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch {
    throw new Error("Photo could not be decoded. Choose a valid image.");
  }
  if (!image.naturalWidth || !image.naturalHeight ||
      image.naturalWidth > 4096 || image.naturalHeight > 4096) {
    throw new Error("Choose a readable image no larger than 4096 pixels on either side.");
  }
}

function defaultPreviewSettings(uid, profile) {
  return {
    uid,
    displayName: typeof profile.displayName === "string" && profile.displayName.trim()
      ? profile.displayName.trim()
      : displayNameFromAlias(profile.username),
    shareCurrentlyReading: false,
    bioPrivacy: "friends",
    genrePrivacy: "friends",
  };
}

export function createReaderProfileEditor({
  host,
  panel,
  getIdentity,
  getProfile,
  getOwnedBooks,
  saveProfile,
  onSaved,
}) {
  const form = document.getElementById("readerEditForm");
  const aliasInput = document.getElementById("readerUsername");
  const displayNameInput = document.getElementById("readerDisplayName");
  const photoInput = document.getElementById("readerPhotoInput");
  const photoPreview = document.getElementById("readerPhotoPreview");
  const avatarPreview = document.getElementById("readerAvatarPreview");
  const avatarValue = document.getElementById("readerAvatarValue");
  const caption = document.getElementById("readerPortraitCaption");
  const avatarChoices = document.getElementById("readerAvatarChoices");
  const aliasError = document.getElementById("readerUsernameError");
  const displayNameError = document.getElementById("readerDisplayNameError");
  const genreError = document.getElementById("readerGenresError");
  const editStatus = document.getElementById("readerEditStatus");
  const photoStatus = document.getElementById("readerPhotoStatus");
  const bookHelp = document.getElementById("readerBookHelp");
  const previewSettingsByUid = new Map();
  const releaseStatus = document.getElementById("readerReleaseStatus");
  const releaseStatusText = Array.from(releaseStatus?.childNodes || [])
    .find(node => node.nodeType === Node.TEXT_NODE);
  if (releaseStatusText) {
    releaseStatusText.textContent = "Reader Release 1";
  }
  let photoDraft = "";
  let savedPhoto = "";
  let currentMode = "preset";
  let currentStyle = "fern";
  let portraitTouched = false;
  let sessionGeneration = 0;
  let photoGeneration = 0;
  let saveInProgress = false;
  let libraryStatus = "idle";

  const savedProfile = () => getProfile?.() || {};
  const identity = () => getIdentity?.() || null;

  function setPortrait({ name = displayNameInput.value, mode = currentMode, style = currentStyle, photo = "" } = {}) {
    avatarPreview.dataset.mode = mode;
    avatarPreview.textContent = initialsFor(name);
    avatarPreview.style.setProperty("--reader-edit-avatar-color", AVATAR_STYLES[style]?.color || AVATAR_STYLES.fern.color);
    avatarPreview.hidden = mode === "photo" && Boolean(photo);
    photoPreview.src = mode === "photo" ? photo : "";
    photoPreview.hidden = mode !== "photo" || !photo;
    caption.textContent = mode === "photo"
      ? (photoDraft ? "Photo preview · new photo saving disabled" : "Saved photo")
      : mode === "initials" ? `Initials · ${initialsFor(name)}`
        : `${AVATAR_STYLES[style]?.label || AVATAR_STYLES.fern.label} avatar`;
    document.getElementById("readerUploadPhoto").setAttribute("aria-pressed", String(mode === "photo"));
    document.getElementById("readerChooseAvatar").setAttribute("aria-pressed", String(mode === "preset"));
    document.getElementById("readerUseInitials").setAttribute("aria-pressed", String(mode === "initials"));
    avatarChoices.hidden = mode !== "preset" && mode !== "initials";
    avatarChoices.querySelectorAll("button[data-style]").forEach(button => {
      button.textContent = initialsFor(name);
      button.setAttribute("aria-pressed", String(
        (mode === "preset" || mode === "initials") && button.dataset.style === style,
      ));
      button.setAttribute(
        "aria-label",
        `${AVATAR_STYLES[button.dataset.style]?.label || "Avatar"} ${mode === "initials" ? "initials color" : "avatar"}`,
      );
    });
  }

  function clearPhotoDraft() {
    photoDraft = "";
    photoInput.value = "";
    photoGeneration++;
  }

  function populateBooks(books, savedBookId = "") {
    const select = document.getElementById("readerCurrentBook");
    select.querySelectorAll('option:not([value=""])').forEach(option => option.remove());
    const normalizedBooks = normalizeReaderLibrary(books);
    for (const book of normalizedBooks) {
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = `${book.title} — ${book.author || "Unknown author"}`;
      select.append(option);
    }
    if (savedBookId && !normalizedBooks.some(book => book.id === savedBookId)) {
      const unavailable = document.createElement("option");
      unavailable.value = savedBookId;
      unavailable.textContent = libraryStatus === "ready"
        ? "Previously saved book is unavailable"
        : "Saved book selection could not be verified";
      unavailable.disabled = true;
      unavailable.dataset.unavailable = "true";
      select.append(unavailable);
    }
    select.disabled = libraryStatus !== "ready";
    return normalizedBooks;
  }

  function loadProfile(books = [], state = "ready") {
    const uid = identity();
    if (!uid) return;
    libraryStatus = state;
    const profile = savedProfile();
    let previewSettings = previewSettingsByUid.get(uid);
    if (!previewSettings) {
      previewSettings = defaultPreviewSettings(uid, profile);
      previewSettingsByUid.set(uid, previewSettings);
    }
    const storedDisplayName = typeof profile.displayName === "string"
      ? validateReaderDisplayName(profile.displayName) : { ok: false };
    if (storedDisplayName.ok) previewSettings.displayName = storedDisplayName.value;
    const savedReaderProfile = profileForDisplay(
      profile.readerProfile || DEFAULT_READER_PROFILE,
    );
    const normalizedBooks = normalizeReaderLibrary(books);
    const ownedIds = new Set(normalizedBooks.map(book => book.id));
    const savedBookId = savedReaderProfile.currentlyReadingBookId;
    const selectedBookId = savedBookId || "";
    displayNameInput.value = previewSettings.displayName;
    aliasInput.value = typeof profile.username === "string" ? profile.username : "";
    document.getElementById("readerBio").value = savedReaderProfile.biography;
    document.getElementById("readerBioCount").textContent = String(savedReaderProfile.biography.length);
    populateBooks(normalizedBooks, savedBookId);
    form.querySelectorAll('input[name="genre"]').forEach(input => {
      input.checked = savedReaderProfile.favoriteGenres.includes(GENRE_ID_BY_LABEL.get(input.value));
    });
    document.getElementById("readerCurrentBook").value =
      ownedIds.has(selectedBookId) || selectedBookId ? selectedBookId : "";
    bookHelp.textContent = libraryStatus !== "ready"
      ? "Your collection could not be verified. Profile changes will not be saved until it loads."
      : savedBookId && !ownedIds.has(savedBookId)
        ? "The saved book is unavailable. Choose another book or select Nothing just now before saving."
        : "Choose only from books in this account's collection.";
    document.getElementById("readerShareBook").checked = Boolean(previewSettings.shareCurrentlyReading);
    document.getElementById("readerBioPrivacy").value = previewSettings.bioPrivacy;
    document.getElementById("readerGenrePrivacy").value = previewSettings.genrePrivacy;

    savedPhoto = profile.avatar === "photo" && safeProfileImage(profile.avatarPhoto)
      ? profile.avatarPhoto : "";
    currentStyle = readerAvatarStyleForValue(profile.avatar, profile.avatarStyle);
    currentMode = savedPhoto ? "photo" : !profile.avatar || profile.avatar === "initials" ||
      /^[A-Z]{1,3}$/u.test(profile.avatar)
      ? "initials" : "preset";
    portraitTouched = false;
    avatarValue.value = AVATAR_STYLES[currentStyle].value;
    const initialButton = avatarChoices.querySelector(`[data-style="${currentStyle}"]`);
    if (AVATAR_STYLES[currentStyle] && initialButton) {
      avatarValue.value = AVATAR_STYLES[currentStyle].value;
      if (Object.values(AVATAR_STYLES).some(option => option.value === profile.avatar)) {
        avatarValue.value = profile.avatar;
      } else if (["☕", "🦉", "🖋️"].includes(profile.avatar)) {
        avatarValue.value = profile.avatar;
      }
    }
    setPortrait({ name: displayNameInput.value, mode: currentMode, style: currentStyle, photo: savedPhoto });
    aliasError.textContent = "";
    displayNameError.textContent = "";
    genreError.textContent = "";
    displayNameInput.removeAttribute("aria-invalid");
    editStatus.textContent = "";
    photoStatus.textContent =
      "New profile photo writes are disabled. Existing legacy photos remain unchanged.";
  }

  function close({ restoreFocus = true } = {}) {
    if (saveInProgress) return false;
    sessionGeneration++;
    clearPhotoDraft();
    if (panel.contains(document.activeElement)) document.activeElement.blur();
    panel.hidden = true;
    host.hidden = false;
    document.body.classList.remove("reader-editor-open");
    if (restoreFocus) host.shadowRoot?.querySelector('[data-action="edit"]')?.focus({ preventScroll: true });
    return true;
  }

  async function open() {
    const uid = identity();
    if (!uid) return;
    const token = ++sessionGeneration;
    let ownedBooksResult = [];
    try {
      ownedBooksResult = await Promise.resolve(getOwnedBooks?.(uid) || []);
    } catch {
      ownedBooksResult = { books: [], status: "error" };
    }
    if (token !== sessionGeneration || uid !== identity()) return;
    const books = Array.isArray(ownedBooksResult)
      ? ownedBooksResult
      : Array.isArray(ownedBooksResult?.books) ? ownedBooksResult.books : [];
    const state = Array.isArray(ownedBooksResult)
      ? "ready"
      : ownedBooksResult?.status || "ready";
    loadProfile(books, state);
    host.hidden = true;
    panel.hidden = false;
    document.body.classList.add("reader-editor-open");
    document.getElementById("readerEditHeading").focus({ preventScroll: true });
    panel.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function cancel() {
    if (saveInProgress) {
      editStatus.textContent = "Your changes are being saved. The editor will close when saving finishes.";
      return;
    }
    close();
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateProfilePhoto(file);
    if (!validation.ok) {
      clearPhotoDraft();
      currentMode = savedPhoto ? "photo" : "preset";
      photoStatus.textContent = validation.message;
      setPortrait({ mode: currentMode, style: currentStyle, photo: savedPhoto });
      return;
    }
    const uid = identity();
    const session = sessionGeneration;
    const request = ++photoGeneration;
    try {
      const dataUrl = await readAsDataUrl(file);
      if (session !== sessionGeneration || request !== photoGeneration || uid !== identity()) return;
      await verifyImage(dataUrl);
      if (session !== sessionGeneration || request !== photoGeneration || uid !== identity()) return;
      photoDraft = dataUrl;
      currentMode = "photo";
      portraitTouched = true;
      photoStatus.textContent =
        "Photo preview only. New profile photo writes are disabled; choose a preset to save other changes.";
      setPortrait({ mode: "photo", style: currentStyle, photo: photoDraft });
    } catch (error) {
      if (session !== sessionGeneration || request !== photoGeneration || uid !== identity()) return;
      clearPhotoDraft();
      currentMode = savedPhoto ? "photo" : "preset";
      photoStatus.textContent = error?.message || "Photo preview could not be loaded.";
      setPortrait({ mode: currentMode, style: currentStyle, photo: savedPhoto });
    }
  }

  async function submit(event) {
    event.preventDefault();
    aliasError.textContent = "";
    displayNameError.textContent = "";
    genreError.textContent = "";
    editStatus.textContent = "";
    const alias = validateReaderAlias(aliasInput.value);
    if (!alias.ok) {
      aliasError.textContent = alias.message;
      aliasInput.setAttribute("aria-invalid", "true");
      aliasInput.focus();
      return;
    }
    aliasInput.removeAttribute("aria-invalid");
    const displayNameResult = validateReaderDisplayName(
      displayNameInput.value.trim() || alias.value,
    );
    if (!displayNameResult.ok) {
      displayNameError.textContent = displayNameResult.message;
      displayNameInput.setAttribute("aria-invalid", "true");
      displayNameInput.focus();
      return;
    }
    displayNameInput.removeAttribute("aria-invalid");
    const displayName = displayNameResult.value;
    if (libraryStatus !== "ready") {
      editStatus.textContent = "Your collection is unavailable. Nothing was saved; reload and try again.";
      return;
    }
    if (portraitTouched && currentMode === "photo" && photoDraft && photoDraft !== savedPhoto) {
      photoStatus.textContent =
        "This photo is preview-only and cannot be saved. Choose a preset avatar or cancel the photo preview.";
      return;
    }
    const selectedGenreIds = [...form.querySelectorAll('input[name="genre"]:checked')]
      .map(input => GENRE_ID_BY_LABEL.get(input.value));
    if (selectedGenreIds.length > 3 || selectedGenreIds.some(value => !value)) {
      genreError.textContent = "Choose up to three listed genres.";
      return;
    }
    const uid = identity();
    const token = sessionGeneration;
    if (!uid) {
      editStatus.textContent = "The signed-in account changed. Reopen the editor.";
      return;
    }
    const old = savedProfile();
    let ownedBooksResult;
    try {
      ownedBooksResult = await Promise.resolve(getOwnedBooks?.(uid) || []);
    } catch {
      ownedBooksResult = { books: [], status: "error" };
    }
    if (token !== sessionGeneration || uid !== identity()) return;
    const ownedBooksState = Array.isArray(ownedBooksResult)
      ? "ready"
      : ownedBooksResult?.status || "ready";
    if (ownedBooksState !== "ready") {
      libraryStatus = ownedBooksState;
      bookHelp.textContent = "Your collection could not be verified. Nothing was saved; reload and try again.";
      document.getElementById("readerCurrentBook").disabled = true;
      editStatus.textContent = "Your collection is unavailable. Nothing was saved; reload and try again.";
      return;
    }
    const ownedBooks = normalizeReaderLibrary(
      Array.isArray(ownedBooksResult) ? ownedBooksResult : ownedBooksResult?.books,
    );
    const profileResult = validateReaderProfile({
      biography: document.getElementById("readerBio").value,
      favoriteGenres: selectedGenreIds,
      currentlyReadingBookId: document.getElementById("readerCurrentBook").value,
    }, new Set(ownedBooks.map(book => book.id)));
    if (!profileResult.ok) {
      editStatus.textContent = profileResult.message;
      return;
    }
    const readerProfile = profileResult.value;
    const oldAvatarStyle = readerAvatarStyleForValue(old.avatar, old.avatarStyle);
    const avatarToSave = portraitTouched && currentMode === "initials"
      ? "initials"
      : portraitTouched && currentMode === "preset"
        ? avatarValue.value : (old.avatar || "");
    const avatarStyleToSave = currentMode === "initials" || currentMode === "preset"
      ? currentStyle : oldAvatarStyle;
    const updateAvatarStyle = portraitTouched &&
      (currentMode === "preset" || currentMode === "initials") &&
      (avatarStyleToSave !== oldAvatarStyle ||
        (currentMode === "initials" && !isSupportedAvatarStyle(old.avatarStyle)));
    const updateAvatar = portraitTouched &&
      (currentMode === "preset" || currentMode === "initials") &&
      (avatarToSave !== (old.avatar || "") || updateAvatarStyle);
    const oldDisplayName = validateReaderDisplayName(old.displayName);
    const previousDisplayName = oldDisplayName.ok
      ? oldDisplayName.value
      : displayNameFromAlias(old.username);
    const displayNameChanged = displayName !== previousDisplayName;
    const changed = alias.value !== (old.username || "") ||
      displayNameChanged ||
      updateAvatar ||
      JSON.stringify(readerProfile) !== JSON.stringify(profileForDisplay(
        old.readerProfile || DEFAULT_READER_PROFILE,
      ));

    let saveResult;
    if (changed) {
      saveInProgress = true;
      form.setAttribute("aria-busy", "true");
      const cancelButtons = [document.getElementById("readerEditBack"), document.getElementById("readerCancelAll")];
      cancelButtons.forEach(button => { button.disabled = true; });
      try {
        saveResult = await saveProfile?.({
          expectedUid: uid,
          username: alias.value,
          displayName,
          updateDisplayName: displayNameChanged,
          avatar: avatarToSave,
          avatarStyle: avatarStyleToSave,
          updateAvatarStyle,
          updateAvatar,
          readerProfile,
        });
        if (token !== sessionGeneration || uid !== identity()) return;
        if (saveResult?.ok === false) {
          editStatus.textContent = saveResult.message || "Profile changes were not saved.";
          return;
        }
      } catch (error) {
        editStatus.textContent = error?.message || "Profile changes were not saved. Try again.";
        return;
      } finally {
        saveInProgress = false;
        form.removeAttribute("aria-busy");
        cancelButtons.forEach(button => { button.disabled = false; });
      }
    }

    const previewSettings = {
      ...(previewSettingsByUid.get(uid) || { uid }),
      displayName,
      shareCurrentlyReading: document.getElementById("readerShareBook").checked &&
        Boolean(document.getElementById("readerCurrentBook").value),
      bioPrivacy: document.getElementById("readerBioPrivacy").value,
      genrePrivacy: document.getElementById("readerGenrePrivacy").value,
    };
    previewSettingsByUid.set(uid, previewSettings);
    await onSaved?.({
      username: saveResult?.username || alias.value,
      displayName: saveResult?.displayName || displayName,
      avatar: saveResult?.avatar || avatarToSave,
      avatarStyle: saveResult?.avatarStyle || avatarStyleToSave,
      avatarPhoto: saveResult?.avatarPhoto ?? savedPhoto,
      readerProfile: saveResult?.readerProfile || readerProfile,
      library: saveResult?.library,
    });
    if (token !== sessionGeneration || uid !== identity()) return;
    close();
  }

  document.getElementById("readerEditBack").addEventListener("click", cancel);
  document.getElementById("readerCancelAll").addEventListener("click", cancel);
  document.getElementById("readerUploadPhoto").addEventListener("click", () => photoInput.click());
  document.getElementById("readerChooseAvatar").addEventListener("click", () => {
    if (currentMode !== "preset") portraitTouched = true;
    currentMode = "preset";
    setPortrait({ mode: currentMode, style: currentStyle });
  });
  document.getElementById("readerUseInitials").addEventListener("click", () => {
    currentMode = "initials";
    portraitTouched = true;
    setPortrait({ mode: currentMode, style: currentStyle });
  });
  avatarChoices.addEventListener("click", event => {
    const button = event.target.closest("button[data-style]");
    if (!button) return;
    if (currentMode !== "initials") currentMode = "preset";
    currentStyle = button.dataset.style;
    avatarValue.value = button.dataset.value;
    portraitTouched = true;
    setPortrait({ mode: currentMode, style: currentStyle });
  });
  photoInput.addEventListener("change", selectPhoto);
  document.getElementById("readerBio").addEventListener("input", event => {
    document.getElementById("readerBioCount").textContent = String(event.target.value.length);
  });
  form.querySelectorAll('input[name="genre"]').forEach(input => {
    input.addEventListener("change", () => {
      const selected = form.querySelectorAll('input[name="genre"]:checked');
      if (selected.length > 3) {
        input.checked = false;
        genreError.textContent = "Choose up to three listed genres.";
      } else genreError.textContent = "";
    });
  });
  document.getElementById("readerCurrentBook").addEventListener("change", event => {
    if (!event.target.value) document.getElementById("readerShareBook").checked = false;
  });
  displayNameInput.addEventListener("input", () => {
    if (currentMode !== "photo") {
      if (currentMode === "initials") portraitTouched = true;
      setPortrait({ mode: currentMode, style: currentStyle });
    }
  });
  form.addEventListener("submit", submit);

  return {
    open,
    close: () => close({ restoreFocus: false }),
    dispose() {
      sessionGeneration++;
      clearPhotoDraft();
      photoInput.removeEventListener("change", selectPhoto);
      form.removeEventListener("submit", submit);
    },
  };
}
