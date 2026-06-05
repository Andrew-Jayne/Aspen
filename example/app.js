import { StateTree } from "https://github.com/Andrew-Jayne/Aspen/releases/latest/download/aspen.min.js";

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
  const theme = State.get("theme");
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("theme-toggle").textContent = theme;
}

function renderEditor() {
  document.getElementById("editor").value = State.get("editorText");
}

function renderWordCount() {
  document.getElementById("word-count").textContent =
    `${State.get("editorText").trim().split(/\s+/).filter(Boolean).length} words`;
}

function renderFontSize() {
  const size = State.get("fontSize");
  document.documentElement.style.setProperty("--font-size", `${size}px`);
  document.getElementById("font-display").textContent = `${size}px`;
  document.getElementById("font-slider").value = String(size);
}

function renderSettings() {
  const open = State.get("settingsOpen");
  if (open === true) {
    document.getElementById("settings-pane").style.display = "block";
  } else {
    document.getElementById("settings-pane").style.display = "none";
  }
  document.getElementById("settings-toggle").classList.toggle("active", open);
}

function toggleTheme() {
  if (State.get("theme") === Theme.LIGHT) {
    State.set("theme", Theme.DARK);
  } else {
    State.set("theme", Theme.LIGHT);
  }
}

function toggleSettings() {
  State.set("settingsOpen", State.get("settingsOpen") === false);
}

function updateEditorText() {
  State.set("editorText", document.getElementById("editor").value);
}

function updateFontSize() {
  State.set(
    "fontSize",
    parseInt(document.getElementById("font-slider").value, 10),
  );
}

window.toggleTheme = toggleTheme;
window.toggleSettings = toggleSettings;
window.updateEditorText = updateEditorText;
window.updateFontSize = updateFontSize;

State.validateStorage();
State.bootstrap();
