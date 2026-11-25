import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/lexend";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";
import { TrayMenuPopup } from "./components/TrayMenuPopup";

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

const isTrayView =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("view") === "tray";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isTrayView ? <TrayMenuPopup /> : <App />}</StrictMode>
);
