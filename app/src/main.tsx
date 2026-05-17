import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// Suppress the WebView2 default context menu (Reload, Save Page, View Source,
// Inspect, …) everywhere except in places where it carries real value, namely
// the CodeMirror editor (paste/cut/select-all), the PDF text layer (copy
// selection), and any plain form fields. Components can opt back in by adding
// the `data-allow-context-menu` attribute to an ancestor element.
window.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement | null;
  if (
    target?.closest(
      ".cm-editor, .pdf-text-layer, input, textarea, [data-allow-context-menu]",
    )
  ) {
    return;
  }
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
