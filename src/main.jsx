import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppTheme from "./components/AppTheme";
import "./App.css";
import "./styles/layout.css";
import "./styles/theme.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppTheme>
      <App />
    </AppTheme>
  </React.StrictMode>,
);
