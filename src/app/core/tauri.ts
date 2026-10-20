/** True when running inside the Tauri webview (false for plain `ng serve`). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
