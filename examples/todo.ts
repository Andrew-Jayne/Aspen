import { AspenKey, StateTree } from "../src/index.ts";

type Todo = { id: string; title: string; done: boolean };

const LIST = document.querySelector("#todo-list") as HTMLUListElement;
const COUNTER = document.querySelector("#todo-counter") as HTMLSpanElement;
const DRAFT_INPUT = document.querySelector("#todo-draft") as HTMLInputElement;

class TodoTree extends StateTree {
  namespace = "todo:";

  todos = new AspenKey({
    type: Array,
    persistent: true,
    default: [] as Todo[],
    bootMirror: null,
    allowed: null,
    aliases: ["todo:items"],
    onUpdate: [renderList, renderCounter],
    serialize: null,
    deserialize: null,
  });

  filter = new AspenKey({
    type: String,
    persistent: true,
    default: "all",
    bootMirror: null,
    allowed: ["all", "open", "done"],
    aliases: null,
    onUpdate: [renderList, renderFilterTabs],
    serialize: null,
    deserialize: null,
  });

  darkMode = new AspenKey({
    type: Boolean,
    persistent: true,
    bootMirror: true,
    default: false,
    allowed: null,
    aliases: null,
    onUpdate: null,
    serialize: null,
    deserialize: null,
  });

  draft = new AspenKey({
    type: String,
    persistent: false,
    default: "",
    bootMirror: null,
    allowed: null,
    aliases: null,
    onUpdate: null,
    serialize: null,
    deserialize: null,
  });
}

function setupComponent(listeners: (() => void)[]): Disposable {
  return {
    [Symbol.dispose](): void {
      for (const unlisten of listeners) {
        unlisten();
      }
    },
  };
}

const state = await TodoTree.create("https://api.example.com/state");
await state.validateStorage();

export const themeControls = setupComponent([
  state.darkMode.listen(renderTheme),
  state.draft.listen(renderDraft),
]);

state.bootstrap();

function renderTheme(): void {
  switch (state.darkMode.value) {
    case true:
      document.documentElement.setAttribute("data-theme", "dark");
      break;
    case false:
      document.documentElement.setAttribute("data-theme", "light");
      break;
  }
}

function matchesFilter(todo: Todo): boolean {
  if (state.filter.value === "open") return todo.done === false;
  if (state.filter.value === "done") return todo.done === true;
  return true;
}

function renderList(): void {
  LIST.replaceChildren();
  for (const todo of state.todos.value.filter(matchesFilter)) {
    const item = document.createElement("li");
    item.textContent = todo.title;
    item.setAttribute("data-id", todo.id);
    item.classList.toggle("done", todo.done);
    LIST.append(item);
  }
}

function renderCounter(): void {
  COUNTER.textContent = `${state.todos.value.filter(isOpen).length} left`;
}

function isOpen(todo: Todo): boolean {
  return todo.done === false;
}

function renderFilterTabs(): void {
  for (const tab of document.querySelectorAll<HTMLElement>("[data-filter]")) {
    tab.classList.toggle(
      "active",
      tab.getAttribute("data-filter") === state.filter.value,
    );
  }
}

function renderDraft(): void {
  DRAFT_INPUT.value = state.draft.value;
}

async function addTodo(): Promise<void> {
  if (state.draft.value === "") return;
  await state.todos.update([
    ...state.todos.value,
    { id: crypto.randomUUID(), title: state.draft.value, done: false },
  ]);
  await state.draft.update("");
}

async function toggleTodo(event: MouseEvent): Promise<void> {
  const item = (event.target as HTMLElement).closest("li");
  if (item === null) return;
  const todos: Todo[] = [];
  for (const todo of state.todos.value) {
    if (todo.id === item.getAttribute("data-id")) {
      todos.push({ ...todo, done: todo.done === false });
    } else {
      todos.push(todo);
    }
  }
  await state.todos.update(todos);
}

async function captureDraft(): Promise<void> {
  await state.draft.update(DRAFT_INPUT.value);
}

async function selectFilter(event: MouseEvent): Promise<void> {
  const filter = (event.target as HTMLElement).getAttribute("data-filter");
  if (filter === null) return;
  await state.filter.update(filter);
}

async function toggleTheme(): Promise<void> {
  await state.darkMode.toggle();
}

(document.querySelector("#todo-add") as HTMLButtonElement).addEventListener(
  "click",
  addTodo,
);
(document.querySelector("#theme") as HTMLButtonElement).addEventListener(
  "click",
  toggleTheme,
);
(document.querySelector("nav") as HTMLElement).addEventListener(
  "click",
  selectFilter,
);
LIST.addEventListener("click", toggleTodo);
DRAFT_INPUT.addEventListener("input", captureDraft);
