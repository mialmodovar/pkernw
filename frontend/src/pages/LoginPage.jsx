import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import GoogleButton from "../components/auth/GoogleButton";
import useAuthStore from "../store/authStore";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = useAuthStore((s) => s.login);
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  // A brand new account's recovery code, which arrives in the sign-in reply and
  // exists nowhere afterwards. Held here because this is the only moment it can
  // be read, and shown instead of leaving the page.
  const [freshCode, setFreshCode] = useState("");
  const navigate = useNavigate();
  // Where they were trying to get to before being asked who they are — a
  // shared tournament link, usually. Home is the answer for anybody who came
  // to the login page on purpose.
  const wanted = useLocation().state?.from?.pathname || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate(wanted, { replace: true });
    } catch {
      setError("Invalid username or password");
    }
  };

  const handleGoogle = async (credential) => {
    setError("");
    try {
      const account = await googleSignIn(credential);
      if (account?.recovery_code) {
        setFreshCode(account.recovery_code);
        return;
      }
      navigate(wanted, { replace: true });
    } catch (failure) {
      setError(failure.response?.data?.error || "That Google sign-in did not go through.");
    }
  };

  // A first Google sign-in made an account. Its code is shown before anything
  // else happens, because losing the Google account is the one thing this
  // cannot recover from on its own.
  if (freshCode) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="panel p-8 rounded-xl w-96 space-y-4 shadow-2xl shadow-black/60">
          <h1 className="text-xl font-bold text-(--color-silver)">Write this down</h1>
          <p className="text-sm text-(--color-text-muted) leading-snug">
            Your account is made. This is the way back in if you ever lose the
            Google account — it is shown once, here, and it is not stored
            anywhere it can be read again.
          </p>
          <p className="text-center text-lg font-mono font-bold tracking-widest
                        text-(--color-highlight-text) panel-raised rounded py-3">
            {freshCode}
          </p>
          <button
            onClick={() => navigate(wanted, { replace: true })}
            className="btn-accent w-full py-2 rounded font-semibold transition-colors"
          >
            I have written it down
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="panel p-8 rounded-xl w-80 space-y-4 shadow-2xl shadow-black/60">
        <h1 className="text-2xl font-bold text-center text-(--color-silver) tracking-wide">Poker Login</h1>
        {error && <p className="text-red-300 text-sm">{error}</p>}
        <input
          className="input-field w-full px-3 py-2 rounded transition-colors"
          placeholder="Username" value={username}
          onChange={(e) => setUsername(e.target.value)} required
        />
        <input
          className="input-field w-full px-3 py-2 rounded transition-colors"
          type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} required
        />
        <button className="btn-accent w-full py-2 rounded font-semibold transition-colors">
          Log In
        </button>
        {/* Google's own button, and only where this installation has a Google
            project: it draws nothing at all otherwise. Under the password
            fields rather than above them — most people here have a password,
            and the new way in should not push the old one down the page. */}
        <GoogleButton onCredential={handleGoogle} text="continue_with" />

        <p className="text-center text-sm text-(--color-text-muted)">
          {/* Carries the destination across: somebody who followed an
              invitation and needs an account first should still end up at the
              tournament they were invited to. */}
          No account? <Link to="/register" state={{ from: { pathname: wanted } }}
            className="link-accent">Register</Link>
        </p>
        {/* No email is ever sent, so this is the recovery code from sign-up
            rather than a reset link. See accounts/recovery.py. */}
        <p className="text-center text-xs text-(--color-text-muted)">
          <Link to="/recover" className="link-accent">Forgotten your password?</Link>
        </p>
      </form>
    </div>
  );
}
