import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { css } from "../styled-system/css";
import { keycap } from "../styled-system/recipes";
import { toLabel } from "./codepoint";
import { ensureGlyph, GLYPH_FONT_STACK } from "./fonts";
import { ensureWasm, random_printable_char } from "./wasm";

const FLICKER_MS = 70;
const POOL_MAX = 64;
const ASCII_SEED = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&".split("");
// Skip the idle animation under Vitest so it never drains the mocked RNG queue.
const isTest = import.meta.env.MODE === "test";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

// ---- styles (Panda) — flat grayscale, no gradients/blur/glow ---------------
const sx = {
  stage: css({
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
  }),
  keyboard: css({
    width: "100%",
    maxWidth: "560px",
    padding: "1rem 1.25rem 1.5rem",
    borderRadius: "16px",
    backgroundColor: "ink",
    border: "1px solid rgba(255,255,255,0.12)",
  }),
  bar: css({
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.1rem 0.4rem 0.9rem",
    fontFamily: "mono",
  }),
  brand: css({ fontWeight: "700", letterSpacing: "0.14em", color: "fg" }),
  sub: css({
    fontSize: "0.62rem",
    letterSpacing: "0.16em",
    color: "muted",
    textTransform: "uppercase",
  }),
  led: css({
    marginLeft: "auto",
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    backgroundColor: "rgba(255,255,255,0.15)",
    transition: "background 0.3s ease",
    _motionReduce: { transition: "none" },
  }),
  ledOn: css({ backgroundColor: "fg" }),
  field: css({
    width: "100%",
    minHeight: "6.5rem",
    maxHeight: "12rem",
    resize: "none",
    overflowY: "auto",
    padding: "0.85rem 1rem",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    backgroundColor: "ink",
    color: "fg",
    fontFamily: "glyph",
    fontSize: "1.9rem",
    lineHeight: "1.45",
    wordBreak: "break-word",
    caretColor: "{colors.fg}",
    outline: "none",
    _placeholder: { color: "muted", fontFamily: "mono", fontSize: "0.9rem" },
  }),
  meta: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "0.45rem 0.2rem 1.1rem",
    fontFamily: "mono",
    fontSize: "0.72rem",
  }),
  count: css({ color: "muted", letterSpacing: "0.06em" }),
  deck: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.9rem",
    padding: "1.1rem",
    borderRadius: "12px",
    backgroundColor: "ink",
    border: "1px solid rgba(255,255,255,0.12)",
  }),
  glyph: css({
    fontFamily: "glyph",
    fontSize: "4.2rem",
    lineHeight: "1",
    color: "fg",
    minHeight: "4.6rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    animationName: "glyphFlicker",
    animationDuration: "0.1s",
    animationTimingFunction: "steps(2)",
    animationIterationCount: "infinite",
    _motionReduce: { animationName: "none" },
  }),
  codepoint: css({
    fontFamily: "mono",
    fontSize: "0.72rem",
    letterSpacing: "0.08em",
    color: "muted",
  }),
  hint: css({
    fontFamily: "mono",
    fontSize: "0.6rem",
    letterSpacing: "0.28em",
    color: "muted",
  }),
  aux: css({
    display: "flex",
    gap: "0.6rem",
    width: "100%",
    maxWidth: "300px",
  }),
};

export default function App() {
  const [field, setField] = createSignal("");
  const [ready, setReady] = createSignal(false);
  const [flicker, setFlicker] = createSignal(ASCII_SEED[0]);

  let fieldRef: HTMLTextAreaElement | undefined;
  const timers: Array<ReturnType<typeof setInterval>> = [];

  onMount(() => {
    // Apply the glyph font-family from a single source of truth (fonts.ts).
    document.documentElement.style.setProperty(
      "--glyph-font",
      GLYPH_FONT_STACK,
    );
    ensureWasm().then(() => {
      setReady(true);
      if (isTest || prefersReducedMotion()) return;
      // Idle "ぐちゃぐちゃ": flicker through REAL random characters spanning the
      // full covered range (same space as the output). We only show glyphs that
      // are already loaded (push to the pool once their woff2 chunk resolves),
      // so the flicker itself never renders as tofu.
      const pool: string[] = [];
      const grow = () => {
        const ch = random_printable_char();
        ensureGlyph(ch).then(() => {
          if (pool.length < POOL_MAX) pool.push(ch);
        });
      };
      for (let i = 0; i < 16; i++) grow();
      timers.push(setInterval(grow, 140));
      timers.push(
        setInterval(() => {
          const src = pool.length > 0 ? pool : ASCII_SEED;
          setFlicker(src[Math.floor(Math.random() * src.length)]);
        }, FLICKER_MS),
      );
    });
  });
  onCleanup(() => {
    for (const t of timers) clearInterval(t);
  });

  // Keep the newest output in view as text accumulates.
  createEffect(() => {
    field();
    if (fieldRef) fieldRef.scrollTop = fieldRef.scrollHeight;
  });

  // last code point currently in the field (for the U+ readout)
  const lastCodePoint = () => {
    const cps = Array.from(field());
    return cps.length > 0 ? cps[cps.length - 1] : null;
  };
  const codepointLabel = () => {
    const c = lastCodePoint();
    return c ? toLabel(c) : "U+????";
  };
  const count = () => Array.from(field()).length;

  const type = () => {
    if (!ready()) return;
    const ch = random_printable_char();
    // Preload this character's woff2 chunk (fire-and-forget). We append
    // synchronously to keep typing order stable regardless of per-chunk load
    // times; the chunk swaps in moments later (font-display: swap).
    ensureGlyph(ch);
    setField((f) => f + ch);
  };

  const newline = () => {
    if (!ready()) return;
    setField((f) => `${f}\n`);
  };

  const backspace = () => {
    if (!ready() || field().length === 0) return;
    const cps = Array.from(field()); // code-point aware (handles astral chars)
    cps.pop();
    setField(cps.join(""));
  };

  const clearAll = () => {
    if (!ready()) return;
    setField("");
  };

  return (
    <main class={sx.stage}>
      <div class={sx.keyboard}>
        <div class={sx.bar}>
          <span class={sx.brand}>UNIKEY·1</span>
          <span class={sx.sub}>RANDOM UNICODE · DEV EDITION</span>
          <span
            class={`kb-led ${sx.led}`}
            classList={{ [sx.ledOn]: ready() }}
            aria-hidden="true"
          />
        </div>

        <textarea
          ref={fieldRef}
          class={`field ${sx.field}`}
          readOnly
          rows={3}
          aria-label="output"
          placeholder="press the key to type a random character…"
          value={field()}
        />
        <div class={sx.meta}>
          <span class={`codepoint ${sx.codepoint}`}>{codepointLabel()}</span>
          <span class={sx.count}>{count()} ch</span>
        </div>

        <div class={sx.deck}>
          <button
            type="button"
            class={`key key--main ${keycap({ size: "main" })}`}
            onClick={type}
            disabled={!ready()}
          >
            <span class={`glyph ${sx.glyph}`}>{flicker()}</span>
            <span class={`key__hint ${sx.hint}`}>
              {ready() ? "PRESS" : "BOOT…"}
            </span>
          </button>

          <div class={sx.aux}>
            <button
              type="button"
              class={`key key--aux ${keycap({ size: "aux" })}`}
              aria-label="backspace"
              onClick={backspace}
              disabled={!ready() || field().length === 0}
            >
              <span class="key__cap">⌫</span>
              <span class="key__legend">BKSP</span>
            </button>
            <button
              type="button"
              class={`key key--aux ${keycap({ size: "aux" })}`}
              aria-label="delete"
              onClick={clearAll}
              disabled={!ready() || field().length === 0}
            >
              <span class="key__cap">⌦</span>
              <span class="key__legend">DEL</span>
            </button>
            <button
              type="button"
              class={`key key--aux ${keycap({ size: "aux", accent: true })}`}
              aria-label="enter"
              onClick={newline}
              disabled={!ready()}
            >
              <span class="key__cap">⏎</span>
              <span class="key__legend">ENTER</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
