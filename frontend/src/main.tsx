import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorReporting } from "./errorReporting";
import "./styles/tokens.css";
import "./styles/app.css";

installGlobalErrorReporting(); // cover-error-reporting (JOS-254) — before the first render, so nothing is missed

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
