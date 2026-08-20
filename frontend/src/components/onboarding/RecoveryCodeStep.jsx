import { useState } from "react";

/**
 * The recovery code, shown once.
 *
 * This app sends no email, so this code is the whole of "forgot my password".
 * It is shown exactly once — only its hash is kept — which makes the tick box
 * below the point of the screen rather than a formality: somebody who clicks
 * past this without writing it down has no way back into their account except
 * asking whoever runs the game.
 */
export default function RecoveryCodeStep({ code, onDone }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission — it is on screen to be written down anyway.
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--color-text-muted) leading-snug">
        Forgot your password? There is no email to send you one — this code is how you get back
        in. Keep it somewhere you will still have it.
      </p>

      <div className="panel-raised rounded-lg p-4 text-center">
        <p className="font-mono text-lg tracking-widest text-(--color-highlight-text) select-all break-all">
          {code}
        </p>
      </div>

      <button
        type="button"
        onClick={copy}
        className="btn-secondary w-full py-2 rounded text-sm font-semibold transition-colors"
      >
        {copied ? "Copied" : "Copy code"}
      </button>

      <label className="flex items-start gap-2 text-sm text-(--color-silver)">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="mt-1"
        />
        <span>
          I have written it down
          <span className="block text-xs text-(--color-text-muted)">
            You will not be shown this code again.
          </span>
        </span>
      </label>

      <button
        type="button"
        disabled={!saved}
        onClick={onDone}
        className="btn-accent w-full py-2 rounded font-semibold transition-colors disabled:opacity-40
                   disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}
