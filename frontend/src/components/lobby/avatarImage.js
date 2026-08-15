/**
 * Turning whatever a player picked off their phone into an avatar.
 *
 * A photo out of a camera is several megabytes of rectangle, and the table
 * draws avatars as small circles. Cropping and re-encoding here rather than on
 * the server means the upload is a few tens of kilobytes instead of several
 * megabytes, the circle is never a squashed rectangle, and whatever metadata
 * the original carried — the location it was taken, most of all — is left
 * behind in the browser: the canvas only ever hands back pixels.
 */

// What the biggest avatar on screen needs, doubled for retina screens.
export const AVATAR_PIXELS = 256;

// The server's own ceiling (accounts/avatars.py). Nothing this file produces
// comes close, so hitting it means something went wrong rather than "your photo
// was too big", but it is checked before the upload rather than after it.
export const AVATAR_MAX_BYTES = 512 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That file could not be read as an image."));
    };
    image.src = objectUrl;
  });
}

function encode(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * A square, avatar-sized image from the middle of whatever was picked.
 *
 * Centre-cropped rather than squashed: a face off-centre is better than a face
 * stretched. Resolves to a Blob ready to upload, and rejects with a message
 * meant to be shown to the player.
 */
export async function squareAvatarBlob(file, size = AVATAR_PIXELS) {
  const image = await loadImage(file);
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (!side) throw new Error("That image appears to be empty.");

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side,
    0, 0, size, size,
  );

  // WebP first: it keeps transparency, which matters because these are drawn as
  // circles and a transparent corner turned black would show as a dark wedge.
  let blob = await encode(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") {
    // No WebP encoder. JPEG has no alpha, so paint white behind what was drawn
    // rather than letting the transparent parts come out black.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    blob = await encode(canvas, "image/jpeg", 0.85);
  }

  if (!blob) throw new Error("That image could not be prepared for upload.");
  if (blob.size > AVATAR_MAX_BYTES) throw new Error("That image is too large to use as an avatar.");
  return blob;
}
