import init, { random_printable_char } from "./wasm/keyboard.js";
import wasmUrl from "./wasm/keyboard_bg.wasm?url";

let ready: Promise<void> | null = null;

/** Initialize the WASM module exactly once. */
export function ensureWasm(): Promise<void> {
  if (!ready) {
    ready = init({ module_or_path: wasmUrl }).then(() => {});
  }
  return ready;
}

export { random_printable_char };
