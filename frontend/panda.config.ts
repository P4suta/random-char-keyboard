import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  // Only the base utilities/conditions — drop Panda's default theme so the
  // generated CSS carries our tokens only (no emerald/sky/etc.).
  presets: ["@pandacss/preset-base"],
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  outdir: "styled-system",

  theme: {
    extend: {
      // Three values only: black, white, one gray. Borders/press tints are
      // white at low opacity (still just black & white). No gradients/shadows.
      tokens: {
        colors: {
          ink: { value: "#000000" },
          fg: { value: "#f5f5f5" },
          muted: { value: "#6b6b6b" },
        },
        fonts: {
          mono: { value: "ui-monospace, Menlo, Consolas, monospace" },
          glyph: { value: "var(--glyph-font)" },
        },
      },
      keyframes: {
        glyphFlicker: {
          "0%": { opacity: "0.5" },
          "100%": { opacity: "1" },
        },
      },
      recipes: {
        // A flat key: black fill, thin hairline border, no shadow. `size` shapes
        // it; `accent` (Enter) just gets a brighter border.
        keycap: {
          className: "keycap",
          base: {
            appearance: "none",
            cursor: "pointer",
            color: "fg",
            font: "inherit",
            borderRadius: "10px",
            backgroundColor: "ink",
            border: "1px solid rgba(255,255,255,0.14)",
            transition: "background 0.06s ease, transform 0.06s ease",
            "&:active:not(:disabled)": {
              transform: "translateY(1px)",
              backgroundColor: "rgba(255,255,255,0.08)",
            },
            "&:disabled": { cursor: "default", opacity: "0.4" },
            _motionReduce: { transition: "none" },
          },
          variants: {
            size: {
              main: {
                width: "100%",
                maxWidth: "280px",
                minHeight: "150px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "1rem",
                borderRadius: "14px",
              },
              aux: {
                flex: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.15rem",
                padding: "0.55rem 0.4rem",
                "& .key__cap": { fontSize: "1.1rem", lineHeight: "1" },
                "& .key__legend": {
                  fontFamily: "mono",
                  fontSize: "0.58rem",
                  letterSpacing: "0.12em",
                  color: "muted",
                },
              },
            },
            accent: {
              true: {
                flex: "1.4",
                borderColor: "rgba(255,255,255,0.4)",
                "& .key__cap, & .key__legend": { color: "fg" },
              },
            },
          },
          defaultVariants: { size: "aux" },
        },
      },
    },
  },

  globalCss: {
    ":root": {
      // Overridden at runtime by App with the bundled-font stack (fonts.ts).
      "--glyph-font": "sans-serif",
      // Grayscale the text-selection highlight (preflight defaults it to blue).
      "--global-color-selection": "rgba(255,255,255,0.2)",
      colorScheme: "dark",
    },
    body: {
      margin: "0",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      backgroundColor: "ink",
      color: "fg",
      minHeight: "100vh",
    },
  },
});
