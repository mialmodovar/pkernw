import { useState } from "react";

import GoogleButton from "../auth/GoogleButton";
import useAuthStore from "../../store/authStore";

/**
 * Connecting a Google account to this one, and disconnecting it.
 *
 * This is the half of Google sign-in that exists for the accounts that came
 * first. There is no email stored against them, so nothing can match a Google
 * address to an account on anybody's behalf — and matching on something softer,
 * a similar name, would be a way to claim somebody else's seat. So the person
 * says so themselves, from inside the account, which is the only place they can
 * prove they are in both.
 *
 * Drawn as nothing at all where there is no Google project configured: the
 * button asks the server whether there is one, and there is nothing else here
 * worth a heading of its own.
 */
export default function GoogleAccount() {
  const user = useAuthStore((s) => s.user);
  const linkGoogle = useAuthStore((s) => s.linkGoogle);
  const unlinkGoogle = useAuthStore((s) => s.unlinkGoogle);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const connected = user?.profile?.google_email || "";
  // Somebody who signed up through Google has no password, and disconnecting
  // would be the same as locking themselves out. The server refuses it; this
  // says so before they press anything.
  const onlyWayIn = connected && user?.profile?.has_password === false;

  const [moved, setMoved] = useState("");

  const connect = async (credential) => {
    setError("");
    setBusy(true);
    try {
      const result = await linkGoogle(credential);
      // It was on an account that Google sign-in had made by accident — see
      // google_views.py. Worth saying out loud: there is an empty account
      // sitting there with a name they may recognise.
      setMoved(result?.moved_from || "");
    } catch (failure) {
      setError(failure.response?.data?.error || "That Google account could not be connected.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setError("");
    setBusy(true);
    try {
      await unlinkGoogle();
    } catch (failure) {
      setError(failure.response?.data?.error || "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-(--color-border) space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
        Google
      </p>

      {connected ? (
        <>
          <p className="text-xs text-(--color-silver) truncate" title={connected}>
            Connected as {connected}
          </p>
          <p className="text-[11px] text-(--color-text-muted) leading-snug">
            {onlyWayIn
              ? "The only way into this account. Set a password with your recovery "
                + "code before disconnecting it."
              : "A second way in, beside your password."}
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy || onlyWayIn}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold
                       transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="text-[11px] text-(--color-text-muted) leading-snug">
            A second way into this account, so a lost recovery code is not the
            end of it. Nothing is posted anywhere and no email is ever sent.
          </p>
          <GoogleButton onCredential={connect} text="continue_with" onError={setError} />
        </>
      )}

      {moved && (
        <p className="text-[11px] text-(--color-highlight-pale) leading-snug">
          Taken back from “{moved}”, an empty account that Google sign-in had
          made. Nothing was lost — that one had never been played.
        </p>
      )}

      {error && <p className="text-xs text-[#c76b7a]">{error}</p>}
    </div>
  );
}
