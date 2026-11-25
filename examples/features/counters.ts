import { state } from "../tree.ts";
import { find } from "../dom.ts";

export function renderCounters(): void {
  const { persistCount, sessionCount } = state;
  find("#persist-count", HTMLElement).textContent = String(persistCount.value);
  find("#session-count", HTMLElement).textContent = String(sessionCount.value);
}

export function initCounters(): void {
  const { persistCount, sessionCount } = state;
  find("#persist-btn", HTMLButtonElement).addEventListener("click", () => {
    void persistCount.update(persistCount.value + 1);
  });
  find("#session-btn", HTMLButtonElement).addEventListener("click", () => {
    void sessionCount.update(sessionCount.value + 1);
  });
}
