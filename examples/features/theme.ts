import { state } from "../tree.ts";
import { find } from "../dom.ts";

const BUTTON_LABELS = { light: "Dark mode", dark: "Light mode" } as const;

export function renderTheme(): void {
  const theme = state.theme.value;
  document.documentElement.dataset["theme"] = theme;
  find("#theme-btn", HTMLButtonElement).textContent = BUTTON_LABELS[theme];
}

export function initTheme(): void {
  find("#theme-btn", HTMLButtonElement).addEventListener("click", () => {
    const { theme } = state;
    void theme.update(theme.value === "dark" ? "light" : "dark");
  });
}
