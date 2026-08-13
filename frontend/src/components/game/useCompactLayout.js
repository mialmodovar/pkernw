import { useEffect, useState } from "react";

// Matches Tailwind's `md` breakpoint. The table geometry is computed in JS, so
// the phone layout can't be expressed with CSS classes alone.
const QUERY = "(max-width: 767px)";

export function useCompactLayout() {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setCompact(e.matches);
    setCompact(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return compact;
}
