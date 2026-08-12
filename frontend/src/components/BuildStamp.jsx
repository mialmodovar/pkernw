/** Which build you are looking at.
 *
 * Deliberately always on screen: without it, telling a stale cached page from a
 * fresh deploy is guesswork, and that guesswork has already cost us a round of
 * chasing a bug that was not there any more.
 */
export default function BuildStamp() {
  return (
    <span
      title="Build this page was served from"
      className="fixed bottom-1 right-2 z-50 pointer-events-none select-none
                 text-[10px] font-mono text-(--color-text-muted) opacity-40"
    >
      {__BUILD_STAMP__}
    </span>
  );
}
