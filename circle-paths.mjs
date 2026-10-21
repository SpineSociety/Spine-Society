const CIRCLE_ID_PATTERN = /^v2_[A-Za-z0-9_-]{1,124}$/;

/**
 * New circles live in an isolated namespace. Legacy `/clubs/{id}` paths are
 * deliberately left untouched and remain governed by the legacy deny policy.
 */
export function isVersionedCircleId(circleId) {
  return typeof circleId === "string" && CIRCLE_ID_PATTERN.test(circleId);
}

export function routeCircleDatabasePath(path) {
  if (typeof path !== "string") return path;
  const parts = path.split("/");
  if (parts[0] !== "clubs" || !isVersionedCircleId(parts[1])) return path;
  parts[0] = "readerCirclesV2";
  return parts.join("/");
}
