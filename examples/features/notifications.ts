import { state } from "../tree.ts";
import { find } from "../dom.ts";
import { LEVELS, type Notification } from "../types.ts";

const TOAST_LIFETIME_MS = 4000;

function buildToast(notification: Notification): HTMLDivElement {
  const toast = document.createElement("div");
  toast.className = `toast toast--${notification.level}`;
  toast.dataset["id"] = notification.id;
  toast.textContent = notification.message;

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => toast.remove());
  toast.append(dismiss);
  return toast;
}

function mountToast(): void {
  const notification = state.notification.value;
  if (notification.id === "") return;

  const zone = find("#toast-zone", HTMLDivElement);
  if (zone.querySelector(`[data-id="${notification.id}"]`) !== null) return;

  const toast = buildToast(notification);
  zone.append(toast);
  setTimeout(() => toast.remove(), TOAST_LIFETIME_MS);
}

export function initNotifications(): void {
  let sent = 0;
  find("#notify-btn", HTMLButtonElement).addEventListener("click", () => {
    sent += 1;
    void state.notification.update({
      id: crypto.randomUUID(),
      message: `Demo notification #${sent}`,
      level: LEVELS[sent % LEVELS.length] ?? "info",
    });
  });

  // Registered after tree creation, which is what "dynamic listen" means.
  state.notification.listen(mountToast);
}
