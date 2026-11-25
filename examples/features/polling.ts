import { state } from "../tree.ts";
import { find } from "../dom.ts";

function showLastSeen(): void {
  const { id, level, message } = state.notification.value;
  if (id === "") return;
  find("#poll-status", HTMLElement).textContent =
    `Last seen: [${level}] ${message}`;
}

async function pollUntil(stopped: Promise<void>): Promise<void> {
  // The listener lives exactly as long as this scope, then is disposed.
  using _listener = state.notification.listen(showLastSeen);
  await stopped;
}

export function initPolling(): void {
  const button = find("#poll-btn", HTMLButtonElement);
  const status = find("#poll-status", HTMLElement);
  let stop: (() => void) | null = null;

  button.addEventListener("click", async () => {
    if (stop !== null) {
      stop();
      return;
    }

    const stopped = new Promise<void>((resolve) => {
      stop = resolve;
    });
    button.textContent = "Stop polling";
    status.textContent = "Polling…";

    await pollUntil(stopped);

    stop = null;
    button.textContent = "Start polling";
    status.textContent = "Stopped.";
  });
}
