import { useState } from "react";

import api from "../../api/http";
import { EMOJI_CHOICES } from "./clubEmoji";
import { deleteConfirmed, privacyBlurb } from "./clubRoles";

/**
 * Running the club: its name, its face, who can find it, and closing it down.
 *
 * A club used to be a thing you could only make. Everything the server has
 * always allowed — renaming it, making it private, rolling the code, handing it
 * over, deleting it — had no way of being asked for, so a typo in a club name
 * was permanent and a code posted in the wrong chat could not be replaced.
 *
 * Drawn only for somebody who may organise, and the danger zone only for
 * somebody who may own. Both come off the club payload's own can_manage /
 * can_own, so the superuser gets them in a club they are not a member of.
 */
export default function ClubSettings({ club, onSaved, onDeleted }) {
  const [name, setName] = useState(club.name);
  const [emoji, setEmoji] = useState(club.emoji);
  const [description, setDescription] = useState(club.description || "");
  const [isPublic, setIsPublic] = useState(club.is_public);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const dirty = name !== club.name
    || emoji !== club.emoji
    || description !== (club.description || "")
    || isPublic !== club.is_public;

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.patch(`/clubs/${club.slug}/`, {
        name: name.trim(), emoji, description: description.trim(), is_public: isPublic,
      });
      setSaved(true);
      onSaved?.(data);
      // Long enough to be seen, short enough not to sit there as a claim about
      // whatever the form says next.
      setTimeout(() => setSaved(false), 2000);
    } catch (requestError) {
      setError(
        requestError.response?.data?.name?.[0]
        || requestError.response?.data?.error
        || "Those changes did not save.",
      );
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(club.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission: the code is on screen to be read anyway.
    }
  };

  const rollCode = async () => {
    if (!window.confirm("Give the club a new code? The old one stops working — anybody still "
      + "holding it will not be able to join. Members stay members.")) return;
    setError("");
    try {
      const { data } = await api.post(`/clubs/${club.slug}/invite-code/`);
      onSaved?.(data);
    } catch {
      setError("The code could not be changed.");
    }
  };

  const remove = async () => {
    setError("");
    setDeleting(true);
    try {
      // The slug goes in the body as well as being typed here: the server asks
      // for it too, so a request that reaches it by any other route still has to
      // name what it is deleting.
      await api.delete(`/clubs/${club.slug}/`, { data: { confirm: club.slug } });
      onDeleted?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "The club could not be deleted.");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="panel rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
          Club settings
        </h2>

        <label className="block space-y-1">
          <span className="text-xs text-(--color-text-muted)">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input-field w-full rounded px-3 py-2 text-sm transition-colors"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-(--color-text-muted)">
            Description <span className="opacity-70">— one line, shown beside the name</span>
          </span>
          <input
            value={description}
            maxLength={200}
            placeholder="Thursdays at the quinta"
            onChange={(event) => setDescription(event.target.value)}
            className="input-field w-full rounded px-3 py-2 text-sm transition-colors"
          />
        </label>

        <div className="space-y-1">
          <span className="text-xs text-(--color-text-muted)">Face</span>
          <div className="flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setEmoji(choice)}
                aria-pressed={emoji === choice}
                className={`w-9 h-9 rounded text-xl flex items-center justify-center panel-raised
                            transition-transform hover:scale-110 ${
                  emoji === choice ? "ring-2 ring-(--color-highlight)" : ""
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-start justify-between gap-3 text-sm">
          <span className="text-(--color-text-muted)">
            Open to anyone
            <span className="block text-[11px]">{privacyBlurb(isPublic)}</span>
          </span>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
            className="mt-1"
          />
        </label>

        {error && <p className="text-xs text-(--color-accent-link)">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-(--color-highlight-text)">Saved</span>}
          <button
            type="submit"
            disabled={busy || !dirty}
            className="btn-accent px-4 py-1.5 rounded text-sm font-semibold transition-colors
                       disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* The code is how anybody gets in, private club or not, so it is part of
          running one rather than a detail in the header. */}
      {club.invite_code && (
        <div className="panel rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
            Invite code
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="panel-raised rounded px-3 py-1.5 font-mono text-lg text-(--color-highlight-text)">
              {club.invite_code}
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="btn-secondary px-3 py-1.5 rounded text-xs font-semibold transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={rollCode}
              title="Replace it — the old code stops working"
              className="px-3 py-1.5 rounded text-xs font-semibold text-(--color-text-muted)
                         hover:text-(--color-silver) transition-colors"
            >
              New code
            </button>
          </div>
          <p className="text-[11px] text-(--color-text-muted)">
            Anybody with this joins instantly, whether the club is listed or not.
          </p>
        </div>
      )}

      {club.can_own && (
        <div className="panel rounded-lg p-4 space-y-2 border border-(--color-accent-link)/40">
          <h2 className="text-sm font-semibold text-(--color-accent-link) uppercase tracking-wide">
            Delete this club
          </h2>
          <p className="text-xs text-(--color-text-muted) leading-snug">
            The club, its leagues and every season table go, for
            {" "}{club.member_count} member{club.member_count === 1 ? "" : "s"}, and cannot be
            brought back. The nights themselves survive — the hands, the results and who won them
            stay where they are; they simply stop belonging to a club and stop counting for a
            league. Type <span className="font-mono text-(--color-silver)">{club.slug}</span> to
            confirm.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={club.slug}
              aria-label="Type the club's slug to confirm"
              className="input-field rounded px-3 py-1.5 text-sm font-mono transition-colors"
            />
            <button
              type="button"
              onClick={remove}
              disabled={!deleteConfirmed(club, confirmText) || deleting}
              className="px-4 py-1.5 rounded text-sm font-semibold transition-colors
                         bg-(--color-accent-link) text-(--color-accent-text)
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting…" : "Delete club"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
