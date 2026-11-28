import { grove } from "../grove.ts";
import { find } from "../dom.ts";

const BUTTON_LABELS = { light: "Dark mode", dark: "Light mode" } as const;

export function renderTheme(): void {
  const theme = grove.settings.theme.value;
  document.documentElement.dataset["theme"] = theme;
  find("#theme-btn", HTMLButtonElement).textContent = BUTTON_LABELS[theme];
}

export function initTheme(): void {
  find("#theme-btn", HTMLButtonElement).addEventListener("click", () => {
    const { theme } = grove.settings;
    void theme.update(theme.value === "dark" ? "light" : "dark");
  });
}
