/**
 * Turning whatever a player picked off their phone into an avatar.
 *
 * A photo out of a camera is several megabytes of rectangle, and the table
 * draws avatars as small circles. Cropping and re-encoding here rather than on
 * the server means the upload is a few tens of kilobytes instead of several
 * megabytes, the circle is never a squashed rectangle, and whatever metadata
 * the original carried — the location it was taken, most of all — is left
 * behind in the browser: the canvas only ever hands back pixels.
 *
 * Which square gets cut out is the player's decision — see AvatarCropper.
 */

// What the biggest avatar on screen needs, doubled for retina screens.
export const AVATAR_PIXELS = 256;

// The server's own ceiling (accounts/avatars.py). Nothing this file produces
// comes close, so hitting it means something went wrong rather than "your photo
// was too big", but it is checked before the upload rather than after it.
export const AVATAR_MAX_BYTES = 512 * 1024;

function encode(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The square the player chose, as an avatar-sized Blob ready to upload.
 *
 * `rect` is in the image's own pixels: where the square starts and how big it
 * is. The cropper works in screen pixels and converts, which keeps this
 * function honest about one thing only — turning a square of an image into an
 * avatar. Rejects with a message meant to be shown to the player.
 */
export async function cropToBlob(image, rect, size = AVATAR_PIXELS) {
  const side = Math.max(1, Math.round(rect.side));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, rect.sx, rect.sy, side, side, 0, 0, size, size);

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

