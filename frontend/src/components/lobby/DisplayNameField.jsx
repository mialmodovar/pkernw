import { useState } from "react";
import Icon from "../icons/Icon";

import useAuthStore from "../../store/authStore";

/** Whitespace is not a name.
 *
 * Spaces at the ends go, runs of them inside collapse to one, and a box holding
 * nothing but spaces is an empty box — which is how a player puts their display
 * name down and goes back to their username. The server does this too; doing it
 * here as well is what stops "  " looking like a change worth saving.
 */
const tidy = (value) => value.trim().replace(/\s+/g, " ");

/**
 * The name everybody else reads.
 *
 * Not the username. That is what the login form asks for, what the hand history
 * and the ledger are filed under, and what "did I win that one" is answered by —
 * renaming it would quietly rewrite last April. This is only the name on the
 * nameplate, and clearing it puts the username back.
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

  const dirty = tidy(draft) !== savedName;

  const save = async (event) => {
    event.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateDisplayName(tidy(draft));
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
        <div className="relative min-w-0 flex-1">
          <input
            id="display-name"
            value={draft}
            maxLength={24}
            placeholder={user?.username}
            onChange={(event) => { setDraft(event.target.value); setError(null); }}
            className="input-field w-full rounded pl-2 pr-7 py-1 text-sm transition-colors"
          />
          {/* Emptying it is the way back to your username, so it is worth one
              tap rather than a held backspace. Gone when there is nothing to
              clear, so it never reads as a button that does nothing. */}
          {draft && (
            <button
              type="button"
              onClick={() => { setDraft(""); setError(null); }}
              title="Clear"
              aria-label="Clear display name"
              className="absolute inset-y-0 right-1 my-auto w-5 h-5 flex items-center justify-center
                         rounded text-xs leading-none text-(--color-text-muted)
                         hover:text-(--color-silver) hover:bg-white/10 transition-colors"
            >
              <Icon name="close" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
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
          You still log in as {user?.username}.
        </p>
      )}
    </form>
  );
}
