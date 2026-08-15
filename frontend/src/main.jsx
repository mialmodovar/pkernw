import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { applyTheme } from "./theme/themes";
import { readStoredTheme } from "./store/themeStore";

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
