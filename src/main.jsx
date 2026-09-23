import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import App from "./App";
import TrayPanel from "./components/TrayPanel";
import AppTheme from "./components/AppTheme";
import "./App.css";
import "./styles/layout.css";
import "./styles/theme.css";

const isTrayPanel = window.location.hash === "#/tray";
if (isTrayPanel) {
  document.documentElement.classList.add("tray-window");
  if (isTauri() && /Mac/.test(navigator.platform)) {
    document.documentElement.classList.add("tray-window-native");
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isTrayPanel ? <TrayPanel /> : <AppTheme><App /></AppTheme>}
  </React.StrictMode>,
);
