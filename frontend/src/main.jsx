import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { applyTheme } from "./theme/themes";
import { readStoredTheme } from "./store/themeStore";
import { watchForCrashes } from "./errors/crashLog";
import { startBlackBox } from "./errors/blackBox";
import { mediaVitals } from "./media/peerConnections";

// From the first line, so that anything thrown on the way up is written down
// too. An error boundary only sees a render; this sees the rest — a websocket
// handler, a WebRTC event, a promise nobody awaited.
watchForCrashes();

// And the recorder, which is the only thing that says anything at all when the
// browser kills the tab outright: an error boundary never runs, the console
// goes with the process, and sessionStorage is what is left. See blackBox.js.
startBlackBox({ media: mediaVitals });

// Before the first paint, not in an effect: the cached theme is what stops the
// app appearing in default burgundy and then re-skinning itself a frame later.
// The account copy reconciles this once /auth/me/ answers.
applyTheme(readStoredTheme());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
