import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// base must match the GitHub Pages repo name so the ?url-imported .wasm path
// (and all assets) resolve under https://<user>.github.io/random-char-keyboard/
export default defineConfig({
  base: "/random-char-keyboard/",
  plugins: [solid()],
  build: {
    // Never inline fonts as base64: keep every woff2 glyph chunk a separate
    // file so the browser lazily fetches only the unicode-range it needs.
    assetsInlineLimit: 0,
  },
});
