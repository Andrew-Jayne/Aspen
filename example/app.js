import { StateTree } from "./aspen.min.js";

const Theme = { LIGHT: "light", DARK: "dark" };

const State = new StateTree("app.", {
  theme: {
    type: "string",
    persistent: true,
    default: Theme.LIGHT,
    allowed: Object.values(Theme),
    onUpdate: [renderTheme],
  },
  editorText: {
    type: "string",
    persistent: true,
    default: "",
    onUpdate: [renderEditor, renderWordCount],
  },
  fontSize: {
    type: "number",
    persistent: true,
    default: 16,
    onUpdate: [renderFontSize],
  },
  settingsOpen: {
    type: "boolean",
    persistent: false,
    default: false,
    onUpdate: [renderSettings],
  },
});

function renderTheme() {
  const theme = State.get(State.keys.theme);
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("theme-toggle").textContent = theme;
}

function renderEditor() {
  document.getElementById("editor").value = State.get(State.keys.editorText);
}

function renderWordCount() {
  document.getElementById("word-count").textContent =
    `${State.get(State.keys.editorText).trim().split(/\s+/).filter(Boolean).length} words`;
}

function renderFontSize() {
  const size = State.get(State.keys.fontSize);
  document.documentElement.style.setProperty("--font-size", `${size}px`);
  document.getElementById("font-display").textContent = `${size}px`;
  document.getElementById("font-slider").value = String(size);
}

function renderSettings() {
  const open = State.get(State.keys.settingsOpen);
  if (open === true) {
    document.getElementById("settings-pane").style.display = "block";
  } else {
    document.getElementById("settings-pane").style.display = "none";
  }
  document.getElementById("settings-toggle").classList.toggle("active", open);
}

function toggleTheme() {
  if (State.get(State.keys.theme) === Theme.LIGHT) {
    State.set(State.keys.theme, Theme.DARK);
  } else {
    State.set(State.keys.theme, Theme.LIGHT);
  }
}

function toggleSettings() {
  State.set(State.keys.settingsOpen, State.get(State.keys.settingsOpen) === false);
}

function updateEditorText() {
  State.set(State.keys.editorText, document.getElementById("editor").value);
}

function updateFontSize() {
  State.set(
    State.keys.fontSize,
    parseInt(document.getElementById("font-slider").value, 10),
  );
}

window.toggleTheme = toggleTheme;
window.toggleSettings = toggleSettings;
window.updateEditorText = updateEditorText;
window.updateFontSize = updateFontSize;

State.validateStorage();
State.bootstrap();
