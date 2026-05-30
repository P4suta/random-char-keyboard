import { render } from "solid-js/web";
import App from "./App";
import "./index.css";

// Render the UI immediately. App gates the button on WASM init + font loading
// (the bundled fonts are large), so the page is interactive-looking right away
// and the button enables once everything needed to render without tofu is ready.
render(() => <App />, document.getElementById("root")!);
