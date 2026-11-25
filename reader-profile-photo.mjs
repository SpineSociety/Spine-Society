export const MAX_PROFILE_PHOTO_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_DATA_URL_LENGTH = 400_000;
export const MAX_PROFILE_PHOTO_DIMENSION = 4096;
export const PROFILE_PHOTO_SIZE = 300;

const ACCEPTED_INPUT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function validateProfilePhotoFile(file) {
  if (!file) return { ok: false, message: "Choose a photo first." };
  if (!ACCEPTED_INPUT_TYPES.has(file.type)) {
    return { ok: false, message: "Choose a PNG, JPEG, GIF, or WebP image." };
  }
  if (!Number.isFinite(file.size) || file.size <= 0 ||
      file.size > MAX_PROFILE_PHOTO_INPUT_BYTES) {
    return { ok: false, message: "Choose an image no larger than 2 MiB." };
  }
  return { ok: true };
}

export function isValidNewProfilePhotoDataUrl(value) {
  return typeof value === "string" &&
    value.length <= MAX_PROFILE_PHOTO_DATA_URL_LENGTH &&
    /^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/u.test(value);
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Photo could not be read."));
    }, { once: true });
    reader.addEventListener("error", () => {
      reject(reader.error || new Error("Photo could not be read."));
    }, { once: true });
    reader.readAsDataURL(blob);
  });
}

async function decodeImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch {
    throw new Error("Photo could not be decoded. Choose a valid image.");
  }
  if (!image.naturalWidth || !image.naturalHeight ||
      image.naturalWidth > MAX_PROFILE_PHOTO_DIMENSION ||
      image.naturalHeight > MAX_PROFILE_PHOTO_DIMENSION) {
    throw new Error("Choose an image no larger than 4096 pixels on either side.");
  }
  return image;
}

export async function loadProfilePhotoForCrop(file) {
  const validation = validateProfilePhotoFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const dataUrl = await readAsDataUrl(file);
  const image = await decodeImage(dataUrl);
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== "image/jpeg") {
        reject(new Error("This browser could not prepare a JPEG photo."));
        return;
      }
      if (blob.size <= 0) {
        reject(new Error("The prepared photo is empty."));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.8);
  });
}

/**
 * Encodes the reader's manually selected CropperJS crop as a bounded JPEG.
 * The caller controls move/zoom before this function is called.
 */
export async function prepareCroppedProfilePhoto(cropper) {
  if (!cropper || typeof cropper.getCroppedCanvas !== "function") {
    throw new Error("Adjust the crop before saving.");
  }
  const canvas = cropper.getCroppedCanvas({
    width: PROFILE_PHOTO_SIZE,
    height: PROFILE_PHOTO_SIZE,
    fillColor: "#ffffff",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  });
  if (!canvas) throw new Error("Crop failed. Try choosing the photo again.");

  const blob = await canvasToJpeg(canvas);
  const dataUrl = await readAsDataUrl(blob);
  if (!isValidNewProfilePhotoDataUrl(dataUrl)) {
    throw new Error("The compressed photo is too large. Choose another image.");
  }
  return { dataUrl, preview: dataUrl, width: PROFILE_PHOTO_SIZE, height: PROFILE_PHOTO_SIZE };
}
