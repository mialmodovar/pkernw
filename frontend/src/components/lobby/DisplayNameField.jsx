import { useState } from "react";

import useAuthStore from "../../store/authStore";

/**
 * The name everybody else reads, and the one thing about your account you can
 * actually change.
 *
 * Not the username. That is what the login form asks for, what the hand
 * history and the ledger are filed under, and what "did I win that one" is
 * answered by — renaming it would quietly rewrite last April. This is only the
 * name on the nameplate, and clearing it puts the username back.
 *
 * It reads as text until you click it, because the common case is looking at
 * it rather than changing it.
 */
export default function DisplayNameField() {
  const user = useAuthStore((s) => s.user);
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);
  const shown = user?.profile?.display_name || user?.username || "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shown);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = () => {
    // The username is the fallback, not a value to edit: starting from it would
    // make "clear this" look like "delete my name".
    setDraft(user?.profile?.display_name === user?.username ? "" : shown);
    setError(null);
    setEditing(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateDisplayName(draft.trim());
      setEditing(false);
    } catch (failure) {
      const detail = failure?.response?.data?.display_name;
      setError(Array.isArray(detail) ? detail[0] : detail || "That could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        title="Change the name other players see"
        className="block max-w-full truncate font-semibold text-(--color-silver)
                   hover:text-white transition-colors"
      >
        {shown}
      </button>
    );
  }

  return (
    <form onSubmit={save} className="space-y-1">
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={draft}
          maxLength={24}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={user?.username}
          aria-label="Display name"
          className="input-field min-w-0 flex-1 rounded px-2 py-1 text-sm transition-colors"
        />
        <button type="submit" disabled={busy}
          className="btn-accent px-2.5 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={busy}
          className="btn-secondary px-2 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50">
          Cancel
        </button>
      </div>
      {error
        ? <p role="alert" className="text-[11px] text-(--color-accent-link)">{error}</p>
        : <p className="text-[11px] text-(--color-text-muted)">
            Empty goes back to {user?.username}. You still log in as {user?.username}.
          </p>}
    </form>
  );
}
