/**
 * The Google sign-in button, and the one thing it hands back.
 *
 * Google's own script draws the button and does the whole conversation with
 * Google; what comes out the other end is an ID token, which is the only thing
 * this app ever sees. The token is verified on the server against Google's
 * published keys — a token the browser says is fine means nothing.
 *
 * Loaded on demand and once. It is a third-party script on the critical path of
 * a login page, so it is not fetched at all until something asks for a button,
 * and never twice however many buttons there are.
 */

const SCRIPT = "https://accounts.google.com/gsi/client";

let loading = null;

/** Google's identity library, loaded once. Rejects if it will not load. */
export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = SCRIPT;
    tag.async = true;
    tag.defer = true;
    tag.onload = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error("Google's sign-in library loaded but is not there."));
    };
    tag.onerror = () => {
      // So a second attempt is a second attempt rather than the same failure
      // handed back forever.
      loading = null;
      reject(new Error("Google's sign-in library could not be loaded."));
    };
    document.head.appendChild(tag);
  });
  return loading;
}

/**
 * Draw Google's button into `element`, and call `onCredential` with the token.
 *
 * `text` is Google's own wording key — "signin_with", "continue_with" — because
 * the button has to be Google's button. Its appearance is not ours to design:
 * a hand-drawn one is against their terms and, more to the point, is the thing
 * people have learned to recognise.
 */
export async function renderGoogleButton(element, { clientId, onCredential, text = "continue_with" }) {
  if (!element || !clientId) return false;
  const identity = await loadGoogleIdentity();

  identity.initialize({
    client_id: clientId,
    callback: (response) => {
      if (response?.credential) onCredential(response.credential);
    },
  });
  identity.renderButton(element, {
    theme: "filled_black",
    size: "large",
    text,
    shape: "pill",
    logo_alignment: "center",
    width: element.clientWidth || undefined,
  });
  return true;
}
