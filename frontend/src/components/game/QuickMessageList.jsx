import { QUICK_MESSAGES, REACTIONS } from "./quickMessages";

/**
 * The eight things, or the twelve faces, as one panel of chips.
 *
 * One component so that wherever it opens — beside your seat, out of the chat —
 * it is the identical thing: the same words, the same size, the same shape, and
 * only the corner it is hung on differs.
 */
export default function QuickMessageList({ kind = "words", onPick, className = "" }) {
  const shell = "flex flex-wrap gap-1 p-1.5 rounded-lg panel-raised panel-solid " +
                "shadow-xl shadow-black/60 animate-fade-in";

  if (kind === "reactions") {
    return (
      <div className={`${shell} w-36 ${className}`}>
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            aria-label={`React ${emoji}`}
            className="w-7 h-7 flex items-center justify-center rounded text-lg
                       hover:bg-white/10 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`${shell} w-44 ${className}`}>
      {QUICK_MESSAGES.map((quick) => (
        <button
          key={quick.text}
          type="button"
          title={quick.hint}
          onClick={() => onPick(quick.text)}
          className="btn-secondary px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors"
        >
          {quick.text}
        </button>
      ))}
    </div>
  );
}
