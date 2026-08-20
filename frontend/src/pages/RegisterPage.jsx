import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import ClubsStep from "../components/onboarding/ClubsStep";
import ModesStep from "../components/onboarding/ModesStep";
import RecoveryCodeStep from "../components/onboarding/RecoveryCodeStep";
import WatchStep from "../components/onboarding/WatchStep";
import { STEPS, nextStep, progress, stepTitle } from "../components/onboarding/steps";
import useAuthStore from "../store/authStore";
import useGameStore from "../store/gameStore";
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

/** Chips or big blinds — asked here because it is a habit, and somebody who has
 *  one already knows which they want before their first hand. */
function StackUnits({ showBB, onPick }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-(--color-text-muted)">Show stacks as</p>
      <div className="flex gap-2">
        {[["Chips", false, "12,400"], ["Big blinds", true, "31.0 BB"]].map(([label, value, sample]) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(value)}
            aria-pressed={showBB === value}
            className={`flex-1 rounded-lg border-2 py-2 transition-colors ${
              showBB === value
                ? "border-(--color-silver) panel-raised"
                : "border-transparent panel-raised hover:border-(--color-border-strong)"
            }`}
          >
            <span className="block text-sm font-semibold text-(--color-silver) tabular-nums">{sample}</span>
            <span className="block text-[11px] text-(--color-text-muted)">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Signing up, and the four things that make the app worth opening again.
 *
 * It used to be a username, a password and a table colour, which left somebody
 * standing in an empty lobby with no club, nobody to watch and no idea that two
 * of the three game modes existed. Everything after the account is skippable
 * and takes about a minute.
 */
export default function RegisterPage() {
  const [step, setStep] = useState("account");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [preset, setPreset] = useState(PRESET_NAMES[0]);
  const [showBB, setShowBB] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);
  const updateTheme = useThemeStore((s) => s.update);
  const saveShowBB = useGameStore((s) => s.setShowBB);
  const navigate = useNavigate();
  // Where they were trying to get to before being asked who they are — a
  // shared tournament link, usually. Home is the answer for anybody who came
  // to the register page on purpose.
  const wanted = useLocation().state?.from?.pathname || "/";

  // Painted as you pick, so the choice is made against the thing itself rather
  // than against three swatches. Not saved to an account yet — there is not one
  // until the form is submitted — so this only touches the browser.
  const choose = (name) => {
    setPreset(name);
    updateTheme({ preset: name }, { push: false });
  };

  const advance = () => {
    const next = nextStep(step);
    if (next) setStep(next);
    else navigate(wanted, { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const account = await register(username, password);
      await login(username, password);
      // Now there is an account to keep them on, so both preferences go up and
      // follow this player to any browser they log in from.
      updateTheme({ preset });
      saveShowBB(showBB);
      setRecoveryCode(account?.recovery_code || "");
      // An account with no code to show — an older server — has nothing to say
      // on that step, so it is stepped over rather than shown empty.
      setStep(account?.recovery_code ? "recovery" : "clubs");
    } catch (err) {
      setError(err.response?.data?.username?.[0] || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const { current, total } = progress(step);

  return (
    <div className="flex items-center justify-center min-h-screen py-8">
      <div className="panel p-8 rounded-xl w-96 max-w-[92vw] space-y-4 shadow-2xl shadow-black/60">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-center text-(--color-silver) tracking-wide">
            {step === "account" ? "Register" : stepTitle(step)}
          </h1>
          {/* Where you are in the walk. Dots rather than "step 3 of 5": the
              point is that there are not many left. */}
          <div className="flex justify-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
            {STEPS.map((one, index) => (
              <span
                key={one.key}
                className={`h-1 rounded-full transition-all ${
                  index < current ? "w-6 bg-(--color-highlight-text)" : "w-3 bg-(--color-border-strong)"
                }`}
              />
            ))}
          </div>
        </div>

        {step === "account" && (
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <StackUnits showBB={showBB} onPick={setShowBB} />

            <button
              disabled={busy}
              className="btn-accent w-full py-2 rounded font-semibold transition-colors disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create Account"}
            </button>
            <p className="text-center text-sm text-(--color-text-muted)">
              Have an account? <Link to="/login" state={{ from: { pathname: wanted } }}
                className="link-accent">Log in</Link>
            </p>
          </form>
        )}

        {step === "recovery" && <RecoveryCodeStep code={recoveryCode} onDone={advance} />}
        {step === "clubs" && <ClubsStep onDone={advance} onSkip={advance} />}
        {step === "watch" && <WatchStep onDone={advance} onSkip={advance} />}
        {step === "modes" && <ModesStep onDone={advance} />}
      </div>
    </div>
  );
}
