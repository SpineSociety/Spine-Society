import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const baseline = path => execFileSync("git", ["show", `456dfff:${path}`], {
  cwd: root, encoding: "utf8",
});

test("hotfix leaves protected application code, rules, and original CSS unchanged", async () => {
  for (const path of [
    "index.html", "script.js", "styles.css", "shelf-controls.css", "reader-host.css",
    "personal-shelves.mjs", "library-arrangement-model.mjs", "library-arrangement-session.mjs",
    "reader-profile-editor.mjs", "reader-profile-photo.mjs", "reader-bridge.mjs",
    "rules/reader-release-1-1-2-rtdb-rules.json",
  ]) {
    assert.equal(await readFile(new URL(path, root), "utf8"), baseline(path), `${path} changed`);
  }
  const css = await readFile(new URL("library-restoration.css", root), "utf8");
  const original = baseline("library-restoration.css");
  const start = css.indexOf("/* Mobile Nook hotfix:");
  const end = css.indexOf("@media (prefers-reduced-motion: reduce)", start);
  assert.ok(start >= 0 && end > start);
  assert.equal(css.slice(0, start) + css.slice(end), original);
  const added = css.slice(start, end);
  assert.match(added, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(added, /#collectionScreen|#bookmarksScreen|body|html|\.nav-btn|#profileScreen/);
});
