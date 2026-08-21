import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import api from "../api/http";

/**
 * Getting back in with a recovery code.
 *
 * No email, no reset link, no waiting — see accounts/recovery.py for why. The
 * code somebody wrote down when they signed up sets a new password, and is
 * replaced by a fresh one in the same breath, because a code that has been used
 * once is a password sitting in whatever they wrote it down in.
 */
export default function RecoverPage() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [newCode, setNewCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/recover/", {
        username: username.trim(),
        recovery_code: code,
        new_password: password,
      });
      setNewCode(data.recovery_code);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error
        || requestError.response?.data?.new_password?.[0]
        || "That did not work.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (newCode) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="panel p-8 rounded-xl w-96 max-w-[92vw] space-y-4 shadow-2xl shadow-black/60">
          <h1 className="text-2xl font-bold text-center text-(--color-silver)">Password changed</h1>
          <p className="text-sm text-(--color-text-muted) leading-snug">
            Your old recovery code has been used up. This is the new one — keep it somewhere you
            will still have it.
          </p>
          <div className="panel-raised rounded-lg p-4 text-center">
            <p className="font-mono text-lg tracking-widest text-(--color-highlight-text) select-all break-all">
              {newCode}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="btn-accent w-full py-2 rounded font-semibold transition-colors"
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={submit} className="panel p-8 rounded-xl w-96 max-w-[92vw] space-y-4
                                         shadow-2xl shadow-black/60">
        <h1 className="text-2xl font-bold text-center text-(--color-silver) tracking-wide">
          Recover your account
        </h1>
        <p className="text-sm text-(--color-text-muted) leading-snug">
          Use the recovery code you were given when you signed up.
        </p>

        {error && <p className="text-red-300 text-sm">{error}</p>}

        <input
          className="input-field w-full px-3 py-2 rounded transition-colors"
          placeholder="Username" value={username} autoFocus
          onChange={(event) => setUsername(event.target.value)} required
        />
        <input
          className="input-field w-full px-3 py-2 rounded font-mono transition-colors"
          placeholder="ABCD-EFGH-JKMN-PQRS" value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())} required
        />
        <input
          className="input-field w-full px-3 py-2 rounded transition-colors"
          type="password" placeholder="New password (min 6 chars)" value={password}
          onChange={(event) => setPassword(event.target.value)} required minLength={6}
        />

        <button
          disabled={busy}
          className="btn-accent w-full py-2 rounded font-semibold transition-colors disabled:opacity-50"
        >
          {busy ? "Checking…" : "Set new password"}
        </button>
        <p className="text-center text-sm text-(--color-text-muted)">
          Remembered it? <Link to="/login" className="link-accent">Log in</Link>
        </p>
      </form>
    </div>
  );
}
