import { useState } from "react";

import api from "../../api/http";
import useAuthStore from "../../store/authStore";

/**
 * A way back in, for an account that has not got one.
 *
 * Recovery codes arrived after some accounts did, and this app sends no email —
 * so a player who signed up before them has no way to reset a forgotten
 * password at all. This offers one, and then goes away for good.
 *
 * Shown only while the account has no code. It is not a settings panel; it is a
 * gap being closed.
 */
export default function RecoveryCodePanel() {
  const user = useAuthStore((s) => s.user);
  const refresh = useAuthStore((s) => s.init);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Undefined on an older server that does not report it; only a definite
  // "no" puts this on somebody's lobby.
  if (code === "" && user?.profile?.has_recovery_code !== false) return null;

  const make = async () => {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/me/recovery-code/");
      setCode(data.recovery_code);
      // So the panel does not come back on the next page load.
      refresh();
    } catch {
      setError("Could not make a code just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel rounded-lg p-4 space-y-2 shadow-lg shadow-black/40">
      <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">
        Recovery code
      </h2>

      {code ? (
        <>
          <p className="text-xs text-(--color-text-muted) leading-snug">
            Write this down. It is the only way back into your account if you forget your
            password, and it will not be shown again.
          </p>
          <p className="panel-raised rounded p-2 text-center font-mono text-sm
                        text-(--color-highlight-text) select-all break-all">
            {code}
          </p>
        </>
      ) : (
        <>
          <p className="text-xs text-(--color-text-muted) leading-snug">
            Your account has no way back in if you forget your password — no email is ever sent.
            Make a code and keep it somewhere safe.
          </p>
          {error && <p className="text-xs text-(--color-accent-link)">{error}</p>}
          <button
            type="button"
            onClick={make}
            disabled={busy}
            className="btn-accent w-full px-3 py-1.5 rounded text-xs font-semibold transition-colors
                       disabled:opacity-50"
          >
            {busy ? "Making…" : "Make a recovery code"}
          </button>
        </>
      )}
    </div>
  );
}
