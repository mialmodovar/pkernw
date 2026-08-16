/**
 * Handing somebody a tournament.
 *
 * "It's on the poker thing" is how a game gets half a table. A link is how it
 * gets a full one, and the link has to be the page that tells you what the
 * night is — the tournament lobby, with the structure, the buy-in and who is
 * already in it — rather than the table, which means nothing until it deals.
 */

/** The address of a tournament, as somebody else would open it. */
export function tournamentUrl(id, origin) {
  const base = (origin ?? (typeof window === "undefined" ? "" : window.location.origin))
    .replace(/\/+$/, "");
  return `${base}/tournament/${id}`;
}

/** What to say when handing it over, for the phones that offer a share sheet. */
export function shareText(tournament) {
  const name = tournament?.name || "a tournament";
  const host = tournament?.host_display_name || tournament?.host_name;
  return host ? `${name} — ${host}'s tournament` : name;
}

/**
 * Put text on the clipboard, whatever the browser allows.
 *
 * The modern call needs a secure context, which rules it out on a plain-HTTP
 * LAN address — which is exactly where a home game gets played. The old
 * execCommand path is the fallback, and it needs the textarea to be on the
 * page and selected, hence the theatre.
 */
export async function copyToClipboard(text) {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied, or not a secure context. There is still one way left.
    }
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    // Off-screen rather than hidden: a field with display:none cannot be
    // selected, and an unselected field cannot be copied.
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-1000px";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

/**
 * Share it however this device shares things: the native sheet on a phone,
 * the clipboard everywhere else.
 *
 * Returns what happened, so the button can say "Copied" only when something
 * actually reached the clipboard — a share sheet the player backed out of is
 * not a failure, and telling them it was would be a lie.
 */
export async function shareTournament(tournament, { url, share, copy } = {}) {
  const link = url ?? tournamentUrl(tournament?.id);
  const nativeShare = share ?? (typeof navigator !== "undefined" && navigator.share
    ? navigator.share.bind(navigator)
    : null);

  if (nativeShare) {
    try {
      await nativeShare({ title: shareText(tournament), text: shareText(tournament), url: link });
      return "shared";
    } catch (error) {
      // Backing out of the sheet is a decision, not a problem.
      if (error?.name === "AbortError") return "cancelled";
    }
  }

  const copied = await (copy ?? copyToClipboard)(link);
  return copied ? "copied" : "failed";
}
