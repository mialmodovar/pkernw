import { useEffect, useRef, useState } from "react";

import api from "../../api/http";
import { renderGoogleButton } from "../../api/googleSignIn";

// The configured client, asked for once per page load rather than baked into
// the bundle: one copy of the setting, on the server, and no second one to fall
// out of step with it. Held here so five buttons are one request.
let configured = null;

function googleClientId() {
  if (!configured) {
    configured = api.get("/auth/google/config/")
      .then(({ data }) => data.client_id || "")
      // Not set up, or the server is not answering. Either way there is no
      // button, which is a page that works rather than a page with a hole.
      .catch(() => "");
  }
  return configured;
}

/**
 * Google's own button, when this installation has a Google project.
 *
 * Draws nothing at all when it has not — which is every checkout without the
 * environment variable, including the first run of anybody's.
 */
export default function GoogleButton({ onCredential, text, onError }) {
  const slot = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    googleClientId().then(async (clientId) => {
      if (dead || !clientId || !slot.current) return;
      try {
        await renderGoogleButton(slot.current, { clientId, onCredential, text });
        if (!dead) setReady(true);
      } catch (error) {
        if (!dead) onError?.(error.message);
      }
    });
    return () => { dead = true; };
    // onCredential is a fresh closure on every render and re-rendering
    // Google's button would flicker it; the callback it captured is fine
    // because it only ever posts the token it is given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={slot}
      // No height until Google has drawn something into it, so a page with no
      // button configured has no gap where one would have been.
      className={ready ? "flex justify-center" : ""}
    />
  );
}
