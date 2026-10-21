export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeImageUrl(value, baseUrl = "https://localhost/") {
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (!candidate) return null;

  if (/^data:/i.test(candidate)) {
    return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(candidate)
      ? candidate
      : null;
  }

  try {
    const url = new URL(candidate, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
