import { useState } from "react";

import { borderFor, ringStyle } from "./borders";

/**
 * A player's face: the picture they uploaded, or the emoji they picked.
 *
 * The emoji is not only for players who never uploaded anything — it is also
 * what a picture that fails to load falls back to, so a seat is never blank
 * because one request went missing.
 *
 * The caller owns the size and the shape (this is a round frame at the table
 * and a rounded square in the lobby), so all that is fixed here is that the
 * picture fills whatever box it is given without stretching.
 */
export default function Avatar({
  url, emoji, name, className = "", emojiClassName = "text-base",
  border = "", ringWidth = 2,
}) {
  // Held as the URL that failed rather than as a flag: somebody replacing a
  // broken picture with a good one should get the good one, not the fallback
  // for the rest of the session.
  const [failedUrl, setFailedUrl] = useState(null);
  const showPicture = Boolean(url) && url !== failedUrl;
  // A ring somebody bought, if they are wearing one. Drawn as a padded box with
  // the gradient behind the face rather than as a border: a border cannot be a
  // gradient, and border-image cannot be round.
  const ring = ringStyle(border, ringWidth);

  const face = (
    <span className={`flex items-center justify-center overflow-hidden
                      ${ring ? "w-full h-full rounded-full" : className}`}>
      {showPicture ? (
        <img
          src={url}
          alt={name ? `${name}'s avatar` : ""}
          draggable="false"
          onError={() => setFailedUrl(url)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className={`leading-none ${emojiClassName}`}>{emoji || "\u{1F0CF}"}</span>
      )}
    </span>
  );

  if (!ring) return face;

  // The ring is round, and says so itself.
  //
  // It used to take its shape from the caller's className, which is right for
  // the callers that put `rounded-full` there and wrong for the ones whose
  // frame does the rounding from outside — a picture in the lobby's profile
  // card, and every seat at the table. Those got a square ring inside a round
  // frame, and the frame clipped its corners off: the picture looked cut.
  // Every face this is drawn around is a circle, so it is one.
  return (
    <span
      className={`box-border shrink-0 rounded-full ${className} ${
        borderFor(border)?.spins ? "animate-ring-turn" : ""}`}
      style={ring}
      title={`${name || "This player"} — ${borderFor(border)?.label} border`}
    >
      {face}
    </span>
  );
}
