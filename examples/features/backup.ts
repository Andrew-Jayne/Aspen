import { find } from "../dom.ts";
import { grove } from "../grove.ts";

function showExport(): void {
  find("#backup-data", HTMLTextAreaElement).value = JSON.stringify(
    grove.exportPersistent(),
    null,
    2,
  );
}

export function initBackup(): void {
  const status = find("#backup-status", HTMLElement);

  // One call covers every tree in the grove.
  find("#backup-export", HTMLButtonElement).addEventListener("click", () => {
    showExport();
    status.textContent = "Exported every tree's persistent leaves.";
  });

  find("#backup-import", HTMLButtonElement).addEventListener(
    "click",
    async () => {
      let data: unknown;
      try {
        data = JSON.parse(find("#backup-data", HTMLTextAreaElement).value);
      } catch {
        status.textContent = "That isn't valid JSON.";
        return;
      }
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        status.textContent = "Expected a JSON object of storage keys.";
        return;
      }

      // Each tree picks out the keys under its own namespace.
      await grove.importPersistent(data as Record<string, unknown>);
      status.textContent = "Imported into every tree.";
    },
  );
}
