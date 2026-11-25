import { state } from "../tree.ts";
import { find } from "../dom.ts";

export function renderProfile(): void {
  const profile = state.profile.value;
  find("#profile-name", HTMLElement).textContent = profile.name;
  find("#profile-bio", HTMLElement).textContent = profile.bio;
  find("#profile-tags", HTMLUListElement).replaceChildren(
    ...profile.tags.map((tag) => {
      const item = document.createElement("li");
      item.textContent = tag;
      return item;
    }),
  );
  find("#name-input", HTMLInputElement).value = profile.name;
  find("#bio-input", HTMLTextAreaElement).value = profile.bio;
  find("#tag-input", HTMLInputElement).value = profile.tags.join(", ");
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function initProfile(): void {
  find("#profile-save", HTMLButtonElement).addEventListener("click", () => {
    void state.profile.update({
      name: find("#name-input", HTMLInputElement).value,
      bio: find("#bio-input", HTMLTextAreaElement).value,
      tags: parseTags(find("#tag-input", HTMLInputElement).value),
    });
  });
}
