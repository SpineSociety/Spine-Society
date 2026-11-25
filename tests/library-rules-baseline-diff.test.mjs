import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const baselineText = execFileSync(
  "git",
  ["show", "04f33e0:rules/reader-release-1-1-2-rtdb-rules.json"],
  { cwd: root, encoding: "utf8" },
);
const candidateText = await readFile(new URL("../rules/reader-release-1-1-2-rtdb-rules.json", import.meta.url), "utf8");
const baseline = JSON.parse(baselineText).rules;
const candidate = JSON.parse(candidateText).rules;

function diff(before, after, path = "", changes = []) {
  if (JSON.stringify(before) === JSON.stringify(after)) return changes;
  if (before && after &&
      typeof before === "object" && typeof after === "object" &&
      !Array.isArray(before) && !Array.isArray(after)) {
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const childPath = path ? `${path}/${key}` : key;
      if (!(key in before)) changes.push(`+ ${childPath}`);
      else if (!(key in after)) changes.push(`- ${childPath}`);
      else diff(before[key], after[key], childPath, changes);
    }
  } else {
    changes.push(`~ ${path}`);
  }
  return changes;
}

test("complete rules candidate adds only the arrangement rules to current main's Reader 1.1.2", () => {
  assert.equal(
    createHash("sha256").update(baselineText).digest("hex"),
    "9f75f9908c7c10031af0aaae62ea91bd0e642a342672c13355e166950b5bf631",
    "the checked-in Reader 1.1.2 baseline commit changed",
  );
  assert.deepEqual(diff(baseline, candidate), ["+ users/$uid/shelfArrangementV1"]);
  assert.deepEqual(candidate.users.$uid.displayName, baseline.users.$uid.displayName);
  assert.deepEqual(candidate.users.$uid.avatarStyle, baseline.users.$uid.avatarStyle);
  assert.deepEqual(candidate.users.$uid.avatarPhoto, baseline.users.$uid.avatarPhoto);
});
