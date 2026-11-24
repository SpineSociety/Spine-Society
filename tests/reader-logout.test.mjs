import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [html, styles, script] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../reader-host.css", import.meta.url), "utf8"),
  readFile(new URL("../script.js", import.meta.url), "utf8"),
]);

test("signed-in Reader profile exposes Log Out outside approved room markup", () => {
  const hostIndex = html.indexOf('<div id="goldenReaderHost"></div>');
  const accountActionsIndex = html.indexOf('id="readerAccountActions"');
  const editPanelIndex = html.indexOf('id="readerEditPanel"');

  assert.ok(hostIndex >= 0 && accountActionsIndex > hostIndex);
  assert.ok(editPanelIndex > accountActionsIndex);
  assert.match(html.slice(accountActionsIndex, editPanelIndex), /<button[^>]*type="button"[^>]*id="readerLogoutButton"/);
  assert.match(html.slice(accountActionsIndex, editPanelIndex), /aria-label="Log out of The Spine Society"[\s\S]*?Log Out/);
  assert.match(styles, /#readerLogoutButton:focus-visible\s*\{[^}]*outline:/);
  assert.match(styles, /body\.reader-editor-open #readerAccountActions/);
});

test("Log Out calls the existing sign-out cleanup and reports failures", () => {
  const logoutStart = script.indexOf("window.logoutUser = async function ()");
  const logoutEnd = script.indexOf("\n};", logoutStart) + 3;
  const logoutHandler = script.slice(logoutStart, logoutEnd);
  assert.ok(logoutStart >= 0 && logoutEnd > logoutStart);
  assert.match(logoutHandler, /await signOutWithLibraryCleanup\(\)/);
  assert.match(logoutHandler, /showToast\("Unable to log out\. Please try again\."/);
  assert.match(script, /getElementById\("readerLogoutButton"\)\?\.addEventListener\("click"[\s\S]*?window\.logoutUser\(\)/);

  const cleanupStart = script.indexOf("async function signOutWithLibraryCleanup()");
  const cleanupEnd = script.indexOf("\nfunction listenToClubBooks", cleanupStart);
  const cleanup = script.slice(cleanupStart, cleanupEnd);
  assert.match(cleanup, /await signOut\(auth\)/);
  assert.doesNotMatch(cleanup, /\b(deleteUser|remove|update|set)\s*\(/);
});

test("Log Out disables while signing out and reports a failed sign-out", async () => {
  const logoutStart = script.indexOf("window.logoutUser = async function ()");
  const logoutEnd = script.indexOf("\n};", logoutStart) + 3;
  const logoutHandler = script.slice(logoutStart, logoutEnd);
  const button = {
    disabled: false,
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
  };
  const notices = [];
  let signOutCalls = 0;
  const context = {
    window: {},
    document: { getElementById: id => id === "readerLogoutButton" ? button : null },
    signOutWithLibraryCleanup: async () => { signOutCalls++; },
    showToast: (...args) => notices.push(args),
  };
  vm.runInNewContext(logoutHandler, context);

  assert.equal(await context.window.logoutUser(), true);
  assert.equal(signOutCalls, 1);
  assert.equal(button.disabled, false);
  assert.equal(button.attributes.has("aria-busy"), false);

  context.signOutWithLibraryCleanup = async () => { throw new Error("simulated sign-out failure"); };
  assert.equal(await context.window.logoutUser(), false);
  assert.deepEqual(notices[0], ["Unable to log out. Please try again.", "error"]);
  assert.equal(button.disabled, false);
  assert.equal(button.attributes.has("aria-busy"), false);
});

test("Firebase auth state returns signed-out readers to login", () => {
  const authStart = script.indexOf("onAuthStateChanged(auth, async (user) =>");
  const signedOutStart = script.indexOf("if (!user) {", authStart);
  const signedOutEnd = script.indexOf("\n  }", signedOutStart) + 4;
  const signedOut = script.slice(signedOutStart, signedOutEnd);

  assert.ok(authStart >= 0 && signedOutStart > authStart);
  assert.match(signedOut, /currentUser = null/);
  assert.match(signedOut, /authScreen\.style\.display = "block"/);
  assert.match(signedOut, /mainApp\.style\.display = "none"/);
  assert.match(signedOut, /mainNav\.style\.display = "none"/);
});
