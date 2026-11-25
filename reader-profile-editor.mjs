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
import {
  loadProfilePhotoForCrop,
  prepareCroppedProfilePhoto,
  validateProfilePhotoFile,
} from "./reader-profile-photo.mjs";

export { MAX_PROFILE_PHOTO_INPUT_BYTES } from "./reader-profile-photo.mjs";
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
  return validateProfilePhotoFile(file);
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
  const cropDialog = document.getElementById("readerPhotoCropDialog");
  const cropImage = document.getElementById("readerPhotoCropImage");
  const cropSaveButton = document.getElementById("readerPhotoCropSave");
  const cropCancelButton = document.getElementById("readerPhotoCropCancel");
  const cropStatus = document.getElementById("readerPhotoCropStatus");
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
  let photoDraftDataUrl = "";
  let cropper = null;
  let cropSaveInProgress = false;
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
      ? (photoDraft ? "Photo preview · ready to save" : "Saved photo")
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
    photoDraftDataUrl = "";
    photoInput.value = "";
    photoGeneration++;
  }

  function destroyCropper() {
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    cropImage.removeAttribute("src");
  }

  function closeCropDialog({ restoreFocus = true } = {}) {
    if (cropSaveInProgress) return false;
    const wasOpen = !cropDialog.hidden;
    destroyCropper();
    cropDialog.hidden = true;
    cropSaveButton.disabled = true;
    photoInput.value = "";
    document.removeEventListener("keydown", handleCropKeydown);
    if (restoreFocus && wasOpen) {
      document.getElementById("readerUploadPhoto").focus({ preventScroll: true });
    }
    return true;
  }

  function handleCropKeydown(event) {
    if (cropDialog.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCropDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...cropDialog.querySelectorAll("button:not(:disabled)")];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openCropDialog(source) {
    const CropperConstructor = window.Cropper;
    if (typeof CropperConstructor !== "function") {
      throw new Error("The photo crop tool is unavailable. Reload and try again.");
    }
    destroyCropper();
    cropDialog.hidden = false;
    cropSaveButton.disabled = true;
    cropStatus.textContent = "Move and zoom the photo, then choose Use This Crop.";
    cropImage.src = source;
    document.addEventListener("keydown", handleCropKeydown);
    cropCancelButton.focus({ preventScroll: true });
    try {
      cropper = new CropperConstructor(cropImage, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 1,
        movable: true,
        zoomable: true,
        scalable: false,
        rotatable: false,
        responsive: true,
        background: false,
        guides: true,
        cropBoxMovable: false,
        cropBoxResizable: false,
        toggleDragModeOnDblclick: false,
        ready() {
          if (!cropDialog.hidden && cropper) cropSaveButton.disabled = false;
        },
      });
    } catch (error) {
      closeCropDialog({ restoreFocus: false });
      throw error;
    }
  }

  async function savePhotoCrop() {
    if (!cropper || cropSaveInProgress) return;
    const uid = identity();
    const session = sessionGeneration;
    const request = photoGeneration;
    cropSaveInProgress = true;
    cropSaveButton.disabled = true;
    cropCancelButton.disabled = true;
    cropStatus.textContent = "Preparing your cropped photo…";
    try {
      const prepared = await prepareCroppedProfilePhoto(cropper);
      if (session !== sessionGeneration || request !== photoGeneration || uid !== identity()) return;
      photoDraft = prepared.preview;
      photoDraftDataUrl = prepared.dataUrl;
      currentMode = "photo";
      portraitTouched = true;
      photoStatus.textContent =
        "Manual crop ready · 300 × 300 · shared with verified readers.";
      setPortrait({ mode: "photo", style: currentStyle, photo: photoDraft });
      cropSaveInProgress = false;
      cropCancelButton.disabled = false;
      closeCropDialog();
    } catch (error) {
      cropStatus.textContent = error?.message || "The photo could not be prepared.";
      cropSaveButton.disabled = false;
      cropCancelButton.disabled = false;
    } finally {
      cropSaveInProgress = false;
      if (!cropDialog.hidden) cropSaveButton.disabled = false;
    }
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
    cropSaveInProgress = false;
    closeCropDialog({ restoreFocus: false });
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

    clearPhotoDraft();
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
      "Profile photos are visible to signed-in, verified readers.";
  }

  function close({ restoreFocus = true } = {}) {
    if (saveInProgress) return false;
    sessionGeneration++;
    cropSaveInProgress = false;
    closeCropDialog({ restoreFocus: false });
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
    photoInput.value = "";
    const validation = validateProfilePhoto(file);
    if (!validation.ok) {
      photoStatus.textContent = validation.message;
      return;
    }
    const uid = identity();
    const session = sessionGeneration;
    const request = ++photoGeneration;
    try {
      const loaded = await loadProfilePhotoForCrop(file);
      if (session !== sessionGeneration || request !== photoGeneration || uid !== identity()) return;
      openCropDialog(loaded.dataUrl);
    } catch (error) {
      if (session !== sessionGeneration || request !== photoGeneration || uid !== identity()) return;
      photoStatus.textContent = error?.message || "Photo preview could not be loaded.";
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
    const photoToUpload = portraitTouched && currentMode === "photo"
      ? photoDraftDataUrl : "";
    if (portraitTouched && currentMode === "photo" && !photoToUpload && !savedPhoto) {
      photoStatus.textContent = "Choose a photo before saving.";
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
    const avatarToSave = portraitTouched && currentMode === "photo" && photoToUpload
      ? "photo"
      : portraitTouched && currentMode === "initials"
        ? "initials"
        : portraitTouched && currentMode === "preset"
          ? avatarValue.value : (old.avatar || "");
    const avatarStyleToSave = currentMode === "initials" || currentMode === "preset"
      ? currentStyle : oldAvatarStyle;
    const updateAvatarStyle = portraitTouched &&
      (currentMode === "preset" || currentMode === "initials") &&
      (avatarStyleToSave !== oldAvatarStyle ||
        (currentMode === "initials" && !isSupportedAvatarStyle(old.avatarStyle)));
    const updateAvatar = Boolean(photoToUpload) || (portraitTouched &&
      (currentMode === "preset" || currentMode === "initials") &&
      (avatarToSave !== (old.avatar || "") || updateAvatarStyle));
    const oldDisplayName = validateReaderDisplayName(old.displayName);
    const previousDisplayName = oldDisplayName.ok
      ? oldDisplayName.value
      : displayNameFromAlias(old.username);
    const displayNameChanged = displayName !== previousDisplayName;
    const changed = alias.value !== (old.username || "") ||
      displayNameChanged ||
      updateAvatar ||
      Boolean(photoToUpload) ||
      JSON.stringify(readerProfile) !== JSON.stringify(profileForDisplay(
        old.readerProfile || DEFAULT_READER_PROFILE,
      ));

    let saveResult;
    if (changed) {
      saveInProgress = true;
      form.setAttribute("aria-busy", "true");
      const busyControls = [
        document.getElementById("readerEditBack"),
        document.getElementById("readerCancelAll"),
        document.getElementById("readerSaveChanges"),
        document.getElementById("readerUploadPhoto"),
      ];
      busyControls.forEach(button => { button.disabled = true; });
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
          photoDataUrl: photoToUpload,
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
        busyControls.forEach(button => { button.disabled = false; });
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
      avatarPhoto: saveResult?.avatarPhoto ??
        (updateAvatar && avatarToSave !== "photo" ? "" : savedPhoto),
      readerProfile: saveResult?.readerProfile || readerProfile,
      library: saveResult?.library,
    });
    if (token !== sessionGeneration || uid !== identity()) return;
    close();
  }

  document.getElementById("readerEditBack").addEventListener("click", cancel);
  document.getElementById("readerCancelAll").addEventListener("click", cancel);
  document.getElementById("readerUploadPhoto").addEventListener("click", () => photoInput.click());
  document.getElementById("readerPhotoZoomOut").addEventListener("click", () => cropper?.zoom(-0.1));
  document.getElementById("readerPhotoZoomIn").addEventListener("click", () => cropper?.zoom(0.1));
  document.getElementById("readerPhotoMoveUp").addEventListener("click", () => cropper?.move(0, -16));
  document.getElementById("readerPhotoMoveDown").addEventListener("click", () => cropper?.move(0, 16));
  document.getElementById("readerPhotoMoveLeft").addEventListener("click", () => cropper?.move(-16, 0));
  document.getElementById("readerPhotoMoveRight").addEventListener("click", () => cropper?.move(16, 0));
  cropSaveButton.addEventListener("click", savePhotoCrop);
  cropCancelButton.addEventListener("click", () => closeCropDialog());
  cropDialog.addEventListener("click", event => {
    if (event.target === cropDialog) closeCropDialog();
  });
  document.getElementById("readerChooseAvatar").addEventListener("click", () => {
    if (currentMode !== "preset") portraitTouched = true;
    clearPhotoDraft();
    currentMode = "preset";
    setPortrait({ mode: currentMode, style: currentStyle });
  });
  document.getElementById("readerUseInitials").addEventListener("click", () => {
    clearPhotoDraft();
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
      cropSaveInProgress = false;
      closeCropDialog({ restoreFocus: false });
      clearPhotoDraft();
      photoInput.removeEventListener("change", selectPhoto);
      form.removeEventListener("submit", submit);
    },
  };
}
