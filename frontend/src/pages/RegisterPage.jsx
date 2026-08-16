import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useThemeStore from "../store/themeStore";
import { PRESETS, PRESET_NAMES, cardBackImage, resolveTokens } from "../theme/themes";

/** The felt and a card back, in the colours the preset actually paints — the
 *  same miniature the appearance settings use, so what you pick here is what
 *  you get. Nobody chooses a theme from the word "slate". */
function ThemeChoice({ name, selected, onPick }) {
  const tokens = resolveTokens({ preset: name });
  return (
    <button
      type="button"
      onClick={() => onPick(name)}
      aria-pressed={selected}
      title={PRESETS[name].label}
      className={`flex-1 rounded-lg overflow-hidden border-2 transition-colors ${
        selected ? "border-(--color-silver)" : "border-transparent hover:border-(--color-border-strong)"
      }`}
    >
      <span className="block h-12 relative" style={{ background: tokens["--felt-bg"] }}>
        <span
          className="absolute right-1.5 bottom-1.5 w-3 h-4 rounded-[2px] border"
          style={{ backgroundImage: cardBackImage(name), borderColor: tokens["--card-back-edge"] }}
        />
        <span
          className="absolute left-1.5 top-1.5 w-2.5 h-2.5 rounded-full"
          style={{ background: tokens["--color-accent"] }}
        />
      </span>
      <span className="block text-[11px] py-1 text-(--color-silver)">{PRESETS[name].label}</span>
    </button>
  );
}

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [preset, setPreset] = useState(PRESET_NAMES[0]);
  const [error, setError] = useState("");
  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);
  const updateTheme = useThemeStore((s) => s.update);
  const navigate = useNavigate();

  // Painted as you pick, so the choice is made against the thing itself rather
  // than against three swatches. Not saved to an account yet — there is not one
  // until the form is submitted — so this only touches the browser.
  const choose = (name) => {
    setPreset(name);
    updateTheme({ preset: name }, { push: false });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await register(username, password);
      await login(username, password);
      // Now there is an account to keep it on, so it goes up with the rest of
      // the theme and follows them to any browser they log in from.
      updateTheme({ preset });
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.username?.[0] || "Registration failed");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="panel p-8 rounded-xl w-80 space-y-4 shadow-2xl shadow-black/60">
        <h1 className="text-2xl font-bold text-center text-(--color-silver) tracking-wide">Register</h1>
        {error && <p className="text-red-300 text-sm">{error}</p>}
        <input
          className="input-field w-full px-3 py-2 rounded transition-colors"
          placeholder="Username" value={username}
          onChange={(e) => setUsername(e.target.value)} required
        />
        <input
          className="input-field w-full px-3 py-2 rounded transition-colors"
          type="password" placeholder="Password (min 6 chars)" value={password}
          onChange={(e) => setPassword(e.target.value)} required minLength={6}
        />
        <div className="space-y-1.5">
          <p className="text-xs text-(--color-text-muted)">Pick a table</p>
          <div className="flex gap-2">
            {PRESET_NAMES.map((name) => (
              <ThemeChoice key={name} name={name} selected={preset === name} onPick={choose} />
            ))}
          </div>
        </div>

        <button className="btn-accent w-full py-2 rounded font-semibold transition-colors">
          Create Account
        </button>
        <p className="text-center text-sm text-(--color-text-muted)">
          Have an account? <Link to="/login" className="link-accent">Log in</Link>
        </p>
      </form>
    </div>
  );
}
