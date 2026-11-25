import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  MAX_PROFILE_PHOTO_DATA_URL_LENGTH,
  MAX_PROFILE_PHOTO_INPUT_BYTES,
  PROFILE_PHOTO_SIZE,
  isValidNewProfilePhotoDataUrl,
  loadProfilePhotoForCrop,
  prepareCroppedProfilePhoto,
  validateProfilePhotoFile,
} from "../reader-profile-photo.mjs";
import { safeImageUrl } from "../security-utils.mjs";

test("file input accepts supported image formats within the size cap", () => {
  assert.deepEqual(
    validateProfilePhotoFile({ type: "image/png", size: MAX_PROFILE_PHOTO_INPUT_BYTES }),
    { ok: true },
  );
  assert.equal(validateProfilePhotoFile({ type: "image/jpeg", size: 1 }).ok, true);
  assert.equal(validateProfilePhotoFile({ type: "image/gif", size: 1 }).ok, true);
  assert.equal(validateProfilePhotoFile({ type: "image/webp", size: 1 }).ok, true);
});

test("file input rejects unsupported, empty, and oversized files", () => {
  assert.equal(validateProfilePhotoFile(null).ok, false);
  assert.equal(validateProfilePhotoFile({ type: "image/png", size: 0 }).ok, false);
  assert.equal(
    validateProfilePhotoFile({ type: "image/png", size: MAX_PROFILE_PHOTO_INPUT_BYTES + 1 }).ok,
    false,
  );
  assert.equal(validateProfilePhotoFile({ type: "image/svg+xml", size: 5 }).ok, false);
});

test("new database values must be bounded JPEG data URLs", () => {
  assert.equal(isValidNewProfilePhotoDataUrl("data:image/jpeg;base64,AA=="), true);
  assert.equal(isValidNewProfilePhotoDataUrl("data:image/jpeg;base64,A==="), false);
  assert.equal(isValidNewProfilePhotoDataUrl("data:image/png;base64,AA=="), false);
  assert.equal(isValidNewProfilePhotoDataUrl("https://images.example.test/photo.jpg"), false);
  assert.equal(
    isValidNewProfilePhotoDataUrl(`data:image/jpeg;base64,${"A".repeat(MAX_PROFILE_PHOTO_DATA_URL_LENGTH)}`),
    false,
  );
});

test("legacy inline image formats and HTTPS references remain renderable", () => {
  assert.match(safeImageUrl("data:image/png;base64,AA=="), /^data:image\/png/u);
  assert.equal(
    safeImageUrl("https://images.example.test/legacy-photo.jpg"),
    "https://images.example.test/legacy-photo.jpg",
  );
});

test("manual crop export uses the selected 300-square crop and compresses it as JPEG", async () => {
  const originals = {
    FileReader: globalThis.FileReader,
    Image: globalThis.Image,
  };
  let encodedType;
  let encodedQuality;
  let canvasOptions;
  class MockFileReader {
    addEventListener(type, callback) {
      this[type] = callback;
    }
    readAsDataURL(blob) {
      this.result = blob?.type === "image/jpeg"
        ? "data:image/jpeg;base64,AA=="
        : "data:image/png;base64,AA==";
      queueMicrotask(() => this.load?.());
    }
  }
  class MockImage {
    naturalWidth = 400;
    naturalHeight = 300;
    async decode() {}
    set src(value) { this.source = value; }
  }
  const canvas = {
    width: PROFILE_PHOTO_SIZE,
    height: PROFILE_PHOTO_SIZE,
    toBlob(callback, type, quality) {
      encodedType = type;
      encodedQuality = quality;
      callback(new Blob(["jpeg"], { type }));
    },
  };
  globalThis.FileReader = MockFileReader;
  globalThis.Image = MockImage;
  try {
    const source = await loadProfilePhotoForCrop({ type: "image/png", size: 100 });
    assert.equal(source.width, 400);
    assert.equal(source.height, 300);
    const result = await prepareCroppedProfilePhoto({
      getCroppedCanvas(options) {
        canvasOptions = options;
        return canvas;
      },
    });
    assert.deepEqual(canvasOptions, {
      width: 300,
      height: 300,
      fillColor: "#ffffff",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });
    assert.equal(encodedType, "image/jpeg");
    assert.equal(encodedQuality, 0.8);
    assert.equal(result.width, PROFILE_PHOTO_SIZE);
    assert.equal(result.height, PROFILE_PHOTO_SIZE);
    assert.equal(result.dataUrl, "data:image/jpeg;base64,AA==");
  } finally {
    globalThis.FileReader = originals.FileReader;
    globalThis.Image = originals.Image;
  }
});

test("profile editor exposes manual move/zoom crop controls and keyboard-operable buttons", async () => {
  const editor = await readFile(new URL("../reader-profile-editor.mjs", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /cropperjs@1\.6\.2\/dist\/cropper\.min\.js/u);
  assert.match(html, /cropperjs@1\.6\.2\/dist\/cropper\.min\.css/u);
  assert.match(editor, /dragMode: "move"/u);
  assert.match(editor, /movable: true/u);
  assert.match(editor, /zoomable: true/u);
  assert.match(editor, /cropper\?\.move\(/u);
  assert.match(editor, /cropper\?\.zoom\(/u);
  assert.match(editor, /Escape/u);
  for (const control of ["ZoomOut", "ZoomIn", "MoveUp", "MoveDown", "MoveLeft", "MoveRight", "CropCancel", "CropSave"]) {
    assert.match(html, new RegExp(`id="readerPhoto${control}"`, "u"));
  }
  assert.match(html, /aria-modal="true"/u);
});

test("app saves photos atomically to the owner's RTDB profile and does not copy them into new discussion rows", async () => {
  const appSource = await readFile(new URL("../script.js", import.meta.url), "utf8");
  assert.match(appSource, /patch\.avatarPhoto = avatar === "photo" \? photoDataUrl : null/u);
  assert.match(appSource, /await update\(ref\(database, "users\/" \+ expectedUid\), patch\)/u);
  assert.doesNotMatch(appSource, /\b(uploadBytes|deleteObject|getBlob|getDownloadURL)\s*\(/u);
  assert.doesNotMatch(appSource, /authorAvatarPhoto:\s*userData\./u);
  assert.match(appSource, /get\(ref\(database, `users\/\$\{uid\}\/avatarPhoto`\)\)/u);
});

test("candidate rules preserve verified-reader reads and restrict new photo writes", async () => {
  const baselineText = await readFile(
    new URL("../rules/reader-release-1-1-baseline-rtdb-rules.json", import.meta.url),
    "utf8",
  );
  const baseline = JSON.parse(baselineText);
  const candidate = JSON.parse(
    await readFile(new URL("../rules/reader-release-1-1-2-rtdb-rules.json", import.meta.url), "utf8"),
  );
  assert.equal(
    createHash("sha256").update(baselineText).digest("hex"),
    "fea084d8c73d177062eb27bb236ac20522c4783d8688c4ca1863df7895e1fcf8",
    "Rules comparison must use the verified Reader 1.1 baseline.",
  );
  const expected = structuredClone(baseline);
  expected.rules.users.$uid.avatar[".validate"] =
    candidate.rules.users.$uid.avatar[".validate"];
  expected.rules.users.$uid.avatarPhoto[".write"] =
    candidate.rules.users.$uid.avatarPhoto[".write"];
  expected.rules.users.$uid.avatarPhoto[".validate"] =
    candidate.rules.users.$uid.avatarPhoto[".validate"];
  assert.deepEqual(candidate, expected, "Only the three approved avatar/photo rule leaves may differ.");
  assert.deepEqual(
    candidate.rules.users.$uid.displayName,
    baseline.rules.users.$uid.displayName,
    "Display Name privacy rules must stay identical to Reader 1.1.",
  );
  assert.deepEqual(
    candidate.rules.users.$uid.avatarStyle,
    baseline.rules.users.$uid.avatarStyle,
    "Avatar color rules must stay identical to Reader 1.1.",
  );
  const photoRules = candidate.rules.users.$uid.avatarPhoto;
  assert.match(photoRules[".read"], /auth\.token\.email_verified === true/u);
  assert.match(photoRules[".write"], /auth\.uid === \$uid/u);
  assert.match(photoRules[".write"], /auth\.token\.email_verified === true/u);
  assert.match(photoRules[".write"], /!newData\.exists\(\)/u);
  assert.match(photoRules[".write"], /data\.exists\(\) && newData\.val\(\) === data\.val\(\)/u);
  assert.match(photoRules[".write"], /newData\.val\(\)\.length <= 400000/u);
  assert.ok(photoRules[".write"].includes("data:image\\/jpeg;base64,"));
  assert.doesNotMatch(photoRules[".write"], /Storage|storage/u);
});
