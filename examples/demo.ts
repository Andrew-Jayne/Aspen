import { AspenKey, StateTree } from "../src/index.ts";

type Profile = { name: string; bio: string; tags: string[] };
type Notification = { id: string; message: string; level: "info" | "warn" | "error" };
const EMPTY_NOTIFICATION: Notification = { id: "", message: "", level: "info" };

class DemoTree extends StateTree {
  namespace = "demo:";

  theme = new AspenKey({
    type: String,
    persistent: true,
    bootMirror: true,
    default: "light",
    allowed: ["light", "dark"],
    aliases: null,
    onUpdate: [renderTheme],
    serialize: null,
    deserialize: null,
  });

  persistCount = new AspenKey({
    type: Number,
    persistent: true,
    bootMirror: null,
    default: 0,
    allowed: null,
    aliases: null,
    onUpdate: [renderPersistCount],
    serialize: null,
    deserialize: null,
  });

  sessionCount = new AspenKey({
    type: Number,
    persistent: false,
    bootMirror: null,
    default: 0,
    allowed: null,
    aliases: null,
    onUpdate: [renderSessionCount],
    serialize: null,
    deserialize: null,
  });

  profile = new AspenKey({
    type: Object,
    persistent: true,
    bootMirror: null,
    default: { name: "Ada Lovelace", bio: "Mathematician and writer.", tags: ["math", "computing"] } as Profile,
    allowed: null,
    aliases: null,
    onUpdate: [renderProfile],
    serialize: null,
    deserialize: null,
  });

  notification = new AspenKey({
    type: Object,
    persistent: false,
    bootMirror: null,
    default: EMPTY_NOTIFICATION,
    allowed: null,
    aliases: null,
    onUpdate: null,
    serialize: null,
    deserialize: null,
  });
}

const state = await DemoTree.create(null);
await state.validateStorage();

const THEME_BTN = document.querySelector("#theme-btn") as HTMLButtonElement;
const PERSIST_COUNT = document.querySelector("#persist-count") as HTMLSpanElement;
const SESSION_COUNT = document.querySelector("#session-count") as HTMLSpanElement;
const PERSIST_BTN = document.querySelector("#persist-btn") as HTMLButtonElement;
const SESSION_BTN = document.querySelector("#session-btn") as HTMLButtonElement;
const PROFILE_NAME = document.querySelector("#profile-name") as HTMLSpanElement;
const PROFILE_BIO = document.querySelector("#profile-bio") as HTMLParagraphElement;
const PROFILE_TAGS = document.querySelector("#profile-tags") as HTMLUListElement;
const NAME_INPUT = document.querySelector("#name-input") as HTMLInputElement;
const BIO_INPUT = document.querySelector("#bio-input") as HTMLTextAreaElement;
const TAG_INPUT = document.querySelector("#tag-input") as HTMLInputElement;
const TOAST_ZONE = document.querySelector("#toast-zone") as HTMLDivElement;
const NOTIFY_BTN = document.querySelector("#notify-btn") as HTMLButtonElement;
const POLL_BTN = document.querySelector("#poll-btn") as HTMLButtonElement;
const POLL_STATUS = document.querySelector("#poll-status") as HTMLSpanElement;

function renderTheme(): void {
  document.documentElement.dataset.theme = state.theme.value;
  THEME_BTN.textContent = state.theme.value === "dark" ? "Light mode" : "Dark mode";
}

function renderPersistCount(): void {
  PERSIST_COUNT.textContent = String(state.persistCount.value);
}

function renderSessionCount(): void {
  SESSION_COUNT.textContent = String(state.sessionCount.value);
}

function renderProfile(): void {
  const profile = state.profile.value as Profile;
  PROFILE_NAME.textContent = profile.name;
  PROFILE_BIO.textContent = profile.bio;
  PROFILE_TAGS.replaceChildren();
  for (const tag of profile.tags) {
    const li = document.createElement("li");
    li.textContent = tag;
    PROFILE_TAGS.append(li);
  }
  NAME_INPUT.value = profile.name;
  BIO_INPUT.value = profile.bio;
  TAG_INPUT.value = profile.tags.join(", ");
}

state.bootstrap();

THEME_BTN.addEventListener("click", async () => {
  await state.theme.update(state.theme.value === "dark" ? "light" : "dark");
});

PERSIST_BTN.addEventListener("click", async () => {
  await state.persistCount.update((state.persistCount.value as number) + 1);
});

SESSION_BTN.addEventListener("click", async () => {
  await state.sessionCount.update((state.sessionCount.value as number) + 1);
});

async function saveProfile(): Promise<void> {
  const tags = TAG_INPUT.value.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  await state.profile.update({ name: NAME_INPUT.value, bio: BIO_INPUT.value, tags });
}

document.querySelector("#profile-save")!.addEventListener("click", saveProfile);

function buildToast(notification: Notification): HTMLDivElement {
  const toast = document.createElement("div");
  toast.className = `toast toast--${notification.level}`;
  toast.dataset.id = notification.id;
  toast.textContent = notification.message;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => toast.remove());
  toast.append(dismiss);
  return toast;
}

function mountNotificationToast(): void {
  const notification = state.notification.value as Notification;
  if (notification.id === "") return;
  const existing = TOAST_ZONE.querySelector(`[data-id="${notification.id}"]`);
  if (existing !== null) return;
  const toast = buildToast(notification);
  TOAST_ZONE.append(toast);
  setTimeout(() => toast.remove(), 4000);
}

const toastListener = state.notification.listen(mountNotificationToast);

const LEVELS = ["info", "warn", "error"] as const;
let notifyIndex = 0;

NOTIFY_BTN.addEventListener("click", async () => {
  await state.notification.update({
    id: crypto.randomUUID(),
    message: `Demo notification #${++notifyIndex}`,
    level: LEVELS[notifyIndex % LEVELS.length] as "info" | "warn" | "error",
  });
});

let pollActive = false;

async function runPollingSession(): Promise<void> {
  pollActive = true;
  POLL_BTN.textContent = "Stop polling";
  POLL_STATUS.textContent = "Polling…";

  using _notif = state.notification.listen(function onPollNotification() {
    const n = state.notification.value as Notification;
    if (n.id !== "") {
      POLL_STATUS.textContent = `Last seen: [${n.level}] ${n.message}`;
    }
  });

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (pollActive === false) {
        clearInterval(interval);
        resolve();
      }
    }, 200);
  });

  POLL_STATUS.textContent = "Stopped.";
  POLL_BTN.textContent = "Start polling";
}

POLL_BTN.addEventListener("click", () => {
  if (pollActive) {
    pollActive = false;
    return;
  }
  runPollingSession();
});

export { toastListener };
