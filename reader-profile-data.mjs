export const PROFILE_GENRES = Object.freeze([
  { id: "literary-fiction", label: "Literary fiction", icon: "literary" },
  { id: "historical-fiction", label: "Historical fiction", icon: "historical" },
  { id: "mystery", label: "Mystery", icon: "literary" },
  { id: "poetry", label: "Poetry", icon: "poetry" },
  { id: "fantasy", label: "Fantasy", icon: "historical" },
  { id: "memoir", label: "Memoir", icon: "literary" },
  { id: "romance", label: "Romance", icon: "poetry" },
  { id: "nature-writing", label: "Nature writing", icon: "poetry" },
]);

export const DEFAULT_READER_PROFILE = Object.freeze({
  biography: "",
  favoriteGenres: Object.freeze([]),
  currentlyReadingBookId: "",
});

export const READER_AVATAR_STYLES = Object.freeze([
  "fern",
  "clay",
  "ink",
  "plum",
]);

const AVATAR_STYLE_IDS = new Set(READER_AVATAR_STYLES);
const AVATAR_VALUES = new Set(["🌿", "🕯️", "📚", "🌙", "☕", "🦉", "🖋️", "initials"]);
const EMAIL_SHAPE = /@.*[.]/u;
const FIELD_NAMES = new Set([
  "biography",
  "favoriteGenres",
  "currentlyReadingBookId",
]);
const GENRE_IDS = new Set(PROFILE_GENRES.map(({ id }) => id));

export function validateReaderDisplayName(value) {
  if (typeof value !== "string") {
    return { ok: false, message: "Enter a display name." };
  }
  const displayName = value.trim();
  if (!displayName || displayName.length > 80) {
    return { ok: false, message: "Use a display name between 1 and 80 characters." };
  }
  if (EMAIL_SHAPE.test(displayName)) {
    return { ok: false, message: "Display names cannot be email addresses." };
  }
  return { ok: true, value: displayName };
}

export function isSupportedAvatarStyle(value) {
  return typeof value === "string" && AVATAR_STYLE_IDS.has(value);
}

export function isSupportedReaderAvatar(value) {
  return typeof value === "string" &&
    (AVATAR_VALUES.has(value) || /^[A-Z]{1,3}$/.test(value));
}

export function normalizeReaderLibrary(value) {
  if (!value || typeof value !== "object") return [];
  const entries = Array.isArray(value)
    ? value.map(record => [record?.id, record])
    : Object.entries(value);
  const seenIds = new Set();
  return entries
    .flatMap(([id, record]) => {
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
          seenIds.has(id) ||
          !record || typeof record !== "object" || Array.isArray(record) ||
          (record.id != null && record.id !== id)) {
        return [];
      }
      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!title) return [];
      seenIds.add(id);
      return [{
        ...record,
        id,
        title,
        author: typeof record.author === "string" && record.author.trim()
          ? record.author.trim()
          : "Unknown author",
      }];
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function validateReaderProfile(value, ownedBookIds) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    return { ok: false, message: "Profile data must be a plain object." };
  }
  if (Object.keys(value).some(key => !FIELD_NAMES.has(key))) {
    return { ok: false, message: "Profile data contains an unsupported field." };
  }
  if (typeof value.biography !== "string" || value.biography.length > 160) {
    return { ok: false, message: "Keep Between the Pages to 160 characters." };
  }
  if (!Array.isArray(value.favoriteGenres)) {
    return { ok: false, message: "Choose from the supported favorite genres." };
  }
  const genres = value.favoriteGenres;
  if (genres.length > 3 ||
      genres.some(id => typeof id !== "string" || !GENRE_IDS.has(id)) ||
      new Set(genres).size !== genres.length) {
    return { ok: false, message: "Choose up to three supported genres." };
  }
  const bookId = value.currentlyReadingBookId;
  if (typeof bookId !== "string") {
    return { ok: false, message: "Choose a book from this reader's collection." };
  }
  if (bookId && ownedBookIds && !ownedBookIds.has(bookId)) {
    return { ok: false, message: "Choose a book from this reader's collection." };
  }
  return {
    ok: true,
    value: {
      biography: value.biography,
      favoriteGenres: [...genres],
      currentlyReadingBookId: bookId,
    },
  };
}

export function profileForDisplay(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      biography: "",
      favoriteGenres: [],
      currentlyReadingBookId: "",
    };
  }
  const normalized = {
    biography: typeof value.biography === "string" ? value.biography : "",
    favoriteGenres: value.favoriteGenres == null ? [] : value.favoriteGenres,
    currentlyReadingBookId: typeof value.currentlyReadingBookId === "string"
      ? value.currentlyReadingBookId : "",
  };
  const checked = validateReaderProfile(normalized);
  return checked.ok ? checked.value : {
    biography: "",
    favoriteGenres: [],
    currentlyReadingBookId: "",
  };
}
