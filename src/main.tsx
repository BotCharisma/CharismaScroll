import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";

// Suppress Edge WebView2 browser context menu and browser-only shortcuts (Refresh, Print, Save, View Source)
window.addEventListener(
  "contextmenu",
  (e) => {
    e.preventDefault();
  },
  { capture: true }
);

window.addEventListener(
  "keydown",
  (e) => {
    const k = e.key.toLowerCase();
    const isBrowserShortcut =
      e.key === "F5" ||
      e.key === "F7" ||
      ((e.ctrlKey || e.metaKey) && (k === "r" || k === "p" || k === "s" || k === "u"));
    if (isBrowserShortcut) {
      e.preventDefault();
    }
  },
  { capture: true }
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
