/**
 * Surfaces the websocket state. Without this the table simply freezes: actions
 * sent while the socket is down are silently dropped and the server times you
 * out into a check or fold.
 */
export default function ConnectionBanner({ status, onRetry }) {
  if (status === "open" || status === "connecting") return null;

  const failed = status === "failed";

  return (
    <div
      role="status"
      className={`px-4 py-2 text-sm flex items-center justify-center gap-3 border-b ${
        failed
          ? "bg-[#3a1016] border-[rgba(196,178,165,0.25)] text-[#e3cdd1]"
          : "bg-[#3d2f0b] border-[rgba(224,198,107,0.3)] text-[#e6d9a8]"
      }`}
    >
      {failed ? (
        <>
          <span>Lost connection to the table.</span>
          <button
            onClick={onRetry}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-[#d9c07a] animate-pulse" />
          <span>Reconnecting…</span>
        </>
      )}
    </div>
  );
}
