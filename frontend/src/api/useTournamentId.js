import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "./http";
import { canonicalPath, isNumericKey } from "./tournamentKey";

/**
 * The tournament id behind whatever is in the address bar.
 *
 * A tournament can be opened by its number or by its name, and the rest of the
 * app speaks in numbers: the socket is opened on one, every other endpoint takes
 * one, and the tab bar remembers one. So this is the one place that turns a name
 * into a number, and everything downstream carries on as it was.
 *
 * A number needs no asking and is returned straight away — which is every link
 * ever handed out, and every piece of navigation inside the app. A name costs
 * one request, on arrival, from a link somebody was sent.
 *
 * And if the name is one the tournament used to have, the bar is put right: the
 * old address is kept so the link works at all, and correcting it is what stops
 * the wrong one being copied onwards. Pass `correct: false` on a page whose
 * address is not "/tournament/<name>" — there is nothing there to correct it to.
 */
export function useTournamentId(key, { tail = "", correct = true } = {}) {
  const navigate = useNavigate();
  const numeric = isNumericKey(key);
  const [resolved, setResolved] = useState(() => (numeric ? Number(key) : null));
  const [error, setError] = useState("");

  useEffect(() => {
    if (numeric) {
      setResolved(Number(key));
      return undefined;
    }
    // No key at all: this page is being rendered with no tournament behind it,
    // which is the layout sandbox. Nothing to ask about.
    if (!key) {
      setResolved(null);
      return undefined;
    }
    let dead = false;
    setResolved(null);
    setError("");
    api.get(`/tournaments/by-name/${key}/`)
      .then(({ data }) => {
        if (dead) return;
        setResolved(data.id);
        const bar = correct ? canonicalPath({ key, slug: data.slug, tail }) : null;
        if (bar) navigate(bar, { replace: true });
      })
      .catch(() => { if (!dead) setError("That tournament could not be found."); });
    return () => { dead = true; };
  }, [key, numeric, tail, correct, navigate]);

  return { id: resolved, error };
}
