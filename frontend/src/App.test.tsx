import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

const wasm = vi.hoisted(() => ({ queue: [] as string[] }));

vi.mock("./wasm", () => ({
  random_printable_char: () => wasm.queue.shift() ?? "A",
  ensureWasm: () => Promise.resolve(),
}));

// fonts.ts imports the generated @font-face CSS and uses the Font Loading API;
// mock it so component tests run in jsdom without loading real fonts.
vi.mock("./fonts", () => ({
  ensureGlyph: () => Promise.resolve(),
  GLYPH_FONT_STACK: '"AppGlyph"',
}));

import App from "./App";

beforeEach(() => {
  wasm.queue = [];
});

/** Render and wait until the main key is enabled (WASM "ready"). */
async function renderReady() {
  const result = render(() => <App />);
  const key = result.container.querySelector(".key--main") as HTMLButtonElement;
  await waitFor(() => expect(key.disabled).toBe(false));
  const field = result.container.querySelector(".field") as HTMLTextAreaElement;
  const aux = (label: string) =>
    result.container.querySelector(
      `[aria-label="${label}"]`,
    ) as HTMLButtonElement;
  return { ...result, key, field, aux };
}

describe("App", () => {
  it("starts empty with a disabled key before ready", () => {
    const { container } = render(() => <App />);
    expect(
      (container.querySelector(".field") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(container.querySelector(".codepoint")?.textContent).toBe("U+????");
    expect(
      (container.querySelector(".key--main") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("enables the key once WASM is ready", async () => {
    const { key } = await renderReady();
    expect(key.disabled).toBe(false);
    expect(key.querySelector(".key__hint")?.textContent).toBe("PRESS");
  });

  it("types a random character into the field with its codepoint", async () => {
    wasm.queue = ["B"];
    const { container, key, field } = await renderReady();

    fireEvent.click(key);

    await waitFor(() => expect(field.value).toBe("B"));
    expect(container.querySelector(".codepoint")?.textContent).toBe("U+0042");
  });

  it("accumulates characters in typing order", async () => {
    wasm.queue = ["a", "b", "c"];
    const { key, field } = await renderReady();

    fireEvent.click(key);
    fireEvent.click(key);
    fireEvent.click(key);

    await waitFor(() => expect(field.value).toBe("abc"));
  });

  it("ENTER inserts a newline", async () => {
    wasm.queue = ["a"];
    const { key, field, aux } = await renderReady();

    fireEvent.click(key);
    fireEvent.click(aux("enter"));

    await waitFor(() => expect(field.value).toBe("a\n"));
  });

  it("BKSP deletes the last character", async () => {
    wasm.queue = ["a", "b"];
    const { key, field, aux } = await renderReady();

    fireEvent.click(key);
    fireEvent.click(key);
    await waitFor(() => expect(field.value).toBe("ab"));

    fireEvent.click(aux("backspace"));
    await waitFor(() => expect(field.value).toBe("a"));
  });

  it("DEL clears the whole field", async () => {
    wasm.queue = ["a", "b", "c"];
    const { key, field, aux } = await renderReady();

    fireEvent.click(key);
    fireEvent.click(key);
    fireEvent.click(key);
    await waitFor(() => expect(field.value).toBe("abc"));

    fireEvent.click(aux("delete"));
    await waitFor(() => expect(field.value).toBe(""));
  });

  it("types an astral character as one code point and BKSP removes it whole", async () => {
    wasm.queue = ["\u{1D11E}"];
    const { container, key, field, aux } = await renderReady();

    fireEvent.click(key);
    await waitFor(() => expect(field.value).toBe("\u{1D11E}"));
    expect(container.querySelector(".codepoint")?.textContent).toBe("U+1D11E");

    fireEvent.click(aux("backspace"));
    await waitFor(() => expect(field.value).toBe(""));
  });

  it("BKSP and DEL are disabled while the field is empty", async () => {
    const { aux } = await renderReady();
    expect(aux("backspace").disabled).toBe(true);
    expect(aux("delete").disabled).toBe(true);
  });
});
