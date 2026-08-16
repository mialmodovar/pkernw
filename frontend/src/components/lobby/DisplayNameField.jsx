import { useState } from "react";

import useAuthStore from "../../store/authStore";

/**
 * The name everybody else reads.
 *
 * Not the username. That is what the login form asks for, what the hand history
 * and the ledger are filed under, and what "did I win that one" is answered by —
 * renaming it would quietly rewrite last April. This is only the name on the
 * nameplate, and clearing it puts the username back.
 *
 * A plain field rather than something you click to unlock: it lives inside a
 * dialog you opened in order to change how you look, so there is nothing to
 * protect it from.
 */
export default function DisplayNameField() {
  const user = useAuthStore((s) => s.user);
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);
  // The server sends this already resolved, so an unset name arrives as the
  // username. Showing that in the box would make "clear it" look like "delete
  // your name", so the box starts empty and the username sits in the
  // placeholder, which is exactly what it is: what you get if you type nothing.
  const savedName = user?.profile?.display_name === user?.username
    ? ""
    : user?.profile?.display_name || "";
  const [draft, setDraft] = useState(savedName);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = draft.trim() !== savedName;

  const save = async (event) => {
    event.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateDisplayName(draft.trim());
      setJustSaved(true);
    } catch (failure) {
      const detail = failure?.response?.data?.display_name;
      setError(Array.isArray(detail) ? detail[0] : detail || "That could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <label htmlFor="display-name" className="block text-[10px] uppercase tracking-wide text-(--color-text-muted)">
        Display name
      </label>
      <div className="mt-1 flex gap-1.5">
        <input
          id="display-name"
          value={draft}
          maxLength={24}
          placeholder={user?.username}
          onChange={(event) => { setDraft(event.target.value); setError(null); setJustSaved(false); }}
          className="input-field min-w-0 flex-1 rounded px-2 py-1 text-sm transition-colors"
        />
        <button
          type="submit"
          disabled={!dirty || busy}
          className="btn-accent shrink-0 px-2.5 py-1 rounded text-xs font-semibold transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-(--color-accent-link)">{error}</p>
      ) : (
        <p className="mt-1 text-[11px] text-(--color-text-muted)">
          {justSaved ? "Saved." : `Empty means ${user?.username}. You still log in as ${user?.username}.`}
        </p>
      )}
    </form>
  );
}
