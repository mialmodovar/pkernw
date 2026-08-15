import { useState } from "react";

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
export default function Avatar({ url, emoji, name, className = "", emojiClassName = "text-base" }) {
  // Held as the URL that failed rather than as a flag: somebody replacing a
  // broken picture with a good one should get the good one, not the fallback
  // for the rest of the session.
  const [failedUrl, setFailedUrl] = useState(null);
  const showPicture = Boolean(url) && url !== failedUrl;

  return (
    <span className={`flex items-center justify-center overflow-hidden ${className}`}>
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
}
