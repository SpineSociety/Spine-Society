import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, script, shelves, css, model, rules, screenshotFixture, screenshotRunner] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../personal-shelves.mjs", import.meta.url), "utf8"),
  readFile(new URL("../library-restoration.css", import.meta.url), "utf8"),
  readFile(new URL("../library-arrangement-model.mjs", import.meta.url), "utf8"),
  readFile(new URL("../rules/reader-release-1-1-2-rtdb-rules.json", import.meta.url), "utf8"),
  readFile(new URL("./library-screenshot-fixture.mjs", import.meta.url), "utf8"),
  readFile(new URL("./capture-library-screenshots.mjs", import.meta.url), "utf8"),
]);

test("Nook restores the approved order without a separate Dog-Eared card", () => {
  const nook = html.slice(html.indexOf('id="nookScreen"'), html.indexOf('id="collectionScreen"'));
  const order = [
    "phase4b1-brandbar",
    "phase4b1-nook-intro",
    "phase4b1-nook-home",
    "nook-circles-section",
    "phase4b1-page-footer",
  ].map((marker) => nook.indexOf(marker));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.match(nook, /From Your Shelves/);
  assert.match(nook, /A little room<br>for what stays\./);
  assert.match(nook, /id="nookCollectionShelf"/);
  assert.match(nook, /class="phase4b1-info-icon" role="img" aria-label="Information"/);
  assert.match(css, /grid-template-columns: max-content minmax\(0, 1fr\) 32px/);
  assert.match(css, /transform: scaleX\(1\.28\) !important/);
  assert.match(css, /#nookCollectionShelf \.personal-shelf-track \{[^}]*gap: 13px/s);
  assert.match(css, /\.nook-circles-section \{[^}]*overflow: visible;[^}]*min-height: 280px;/s);
  assert.doesNotMatch(nook, /nookDogEaredShelf|Dog-Eared Pages/);
});

test("My Collection and Dog-Eared Pages use two shared library tabs", () => {
  const tabNavigations = [...html.matchAll(/<nav class="phase3g-collection-tabs"[\s\S]*?<\/nav>/g)]
    .map(([navigation]) => navigation);
  assert.equal(tabNavigations.length, 2);
  for (const navigation of tabNavigations) {
    assert.equal((navigation.match(/data-library-view=/g) || []).length, 2);
    assert.match(navigation, /My Collection/);
    assert.match(navigation, /Dog-Eared Pages/);
  }
  assert.match(html, /Books you’ve saved from other readers’ profiles, kept apart from your own shelves\./);
  assert.match(html, /id="phase3g-bookmark-count" class="phase3g-count-pill"/);
  assert.match(script, /bookmarkCount\.textContent = `\$\{bookmarkIds\.length\} SAVED`/);
  assert.match(html, /id="phase3g-book-count" class="phase3g-count-pill"/);
  assert.match(script, /totalCount\.textContent = `\$\{currentLibraryBooks\.length\}/);
  assert.match(html, /id="librarySearchInput"[^>]*type="search"/);
  assert.match(html, /data-filter="In Progress"/);
  assert.match(html, /data-filter="Completed"/);
  assert.match(script, /window\.showLibraryView/);
});

test("Browse and Arrange expose accessible, persistent orientation and stack controls", () => {
  assert.match(shelves, /modeGroup\.setAttribute\("role", "group"\)/);
  assert.match(shelves, /browse\.textContent = "Browse"/);
  assert.match(shelves, /arrange\.textContent = "Arrange"/);
  assert.match(shelves, /saveArrangement\(capturedUid, next, capturedSession\)/);
  assert.match(shelves, /Math\.min\(currentScene\.shelves\.length \* SHELF_ROW_HEIGHT, 320\)/);
  assert.match(shelves, /view\.viewport\.scrollTop = Math\.max\(0, view\.viewport\.scrollHeight - view\.viewport\.clientHeight\)/);
  assert.match(shelves, /Lean left/);
  assert.match(shelves, /Stack selected/);
  assert.match(shelves, /pointermove/);
  assert.match(shelves, /ArrowUp/);
  assert.match(model, /MAX_STACK_BOOKS = 3/);
  assert.match(model, /orientation: "horizontal"/);
  assert.match(script, /users\/\$\{owner\}\/shelfArrangementV1/);
  const rulesObject = JSON.parse(rules);
  assert.match(rulesObject.rules.users.$uid.shelfArrangementV1[".read"], /auth\.uid === \$uid/);
  assert.match(rulesObject.rules.users.$uid.shelfArrangementV1[".write"], /email_verified === true/);
  assert.match(css, /\.personal-shelf-mode-group/);
  assert.match(css, /\.personal-shelf-mode-group \{[^}]*width: 100%;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(screenshotRunner, /"nook-lower"/);
  assert.match(screenshotRunner, /"collection-shelf"/);
  assert.match(screenshotRunner, /"collection-shelf-next"/);
  assert.match(screenshotFixture, /phase4b1-nook-room-card/);
  assert.match(screenshotFixture, /target\.getBoundingClientRect\(\)\.top/);
  assert.match(screenshotFixture, /viewport\.scrollTop = Math\.max\(0, viewport\.scrollHeight - viewport\.clientHeight\)/);
  assert.match(screenshotFixture, /viewport\.scrollLeft = Math\.min\(maxScroll, viewport\.clientWidth\)/);
  assert.match(css, /--shelf-walnut|#68452c/);
});

test("Phone layouts keep the dock outside content and Dog-Eared titles face forward", () => {
  assert.match(css, /#bookmarksScreen #bookmarksList \.library-spine-title/);
  assert.match(css, /#bookmarksScreen #bookmarksList \.library-spine-author/);
  assert.match(css, /text-align: center/);
  assert.match(css, /writing-mode: horizontal-tb/);
  assert.match(css, /\.phone-frame:has\(#mainApp\[style\*="block"\] #nookScreen\.active\)/);
  assert.match(css, /position: relative !important/);
  assert.match(css, /padding: 0 16px !important/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("long bookshelf titles stay on their covers and remain complete in book details", () => {
  assert.match(script, /Array\.from\(String\(book\.title \|\| ""\)\)\.length > 22/);
  assert.match(script, /class="library-spine-title\$\{titleClass\}"/);
  assert.match(css, /#collectionScreen \.library-spine-title--long \{[^}]*width: calc\(var\(--book-height, 196px\) - 24px\);[^}]*font-size: 9px;/s);
  assert.match(script, /onclick="openBookModal\(\$\{escapeInlineJson\(book\.id\)\}, \$\{escapeInlineJson\(source\)\}\)"/);
  assert.match(script, /<h2>\$\{escapeHTML\(book\.title \|\| "Untitled Book"\)\}<\/h2>/);
});
