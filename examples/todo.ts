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
    aliases: ["todo:items"],
    onUpdate: [renderList, renderCounter],
  });

  filter = new AspenKey({
    type: String,
    persistent: true,
    default: "all",
    allowed: ["all", "open", "done"],
    onUpdate: [renderList, renderFilterTabs],
  });

  darkMode = new AspenKey({
    type: Boolean,
    persistent: true,
    bootMirror: true,
    default: false,
    onUpdate: [renderTheme],
  });

  draft = new AspenKey({
    type: String,
    persistent: false,
    default: "",
    onUpdate: [renderDraft],
  });
}

const state = await TodoTree.create("https://api.example.com/state");
await state.validateStorage();
state.bootstrap();

function renderTheme(): void {
  switch (state.darkMode) {
    case true:
      document.documentElement.setAttribute("data-theme", "dark");
      break;
    case false:
      document.documentElement.setAttribute("data-theme", "light");
      break;
  }
}

function matchesFilter(todo: Todo): boolean {
  if (state.filter === "open") return todo.done === false;
  if (state.filter === "done") return todo.done === true;
  return true;
}

function renderList(): void {
  LIST.replaceChildren();
  for (const todo of state.todos.filter(matchesFilter)) {
    const item = document.createElement("li");
    item.textContent = todo.title;
    item.setAttribute("data-id", todo.id);
    item.classList.toggle("done", todo.done);
    LIST.append(item);
  }
}

function renderCounter(): void {
  COUNTER.textContent = `${state.todos.filter(isOpen).length} left`;
}

function isOpen(todo: Todo): boolean {
  return todo.done === false;
}

function renderFilterTabs(): void {
  for (const tab of document.querySelectorAll<HTMLElement>("[data-filter]")) {
    tab.classList.toggle(
      "active",
      tab.getAttribute("data-filter") === state.filter,
    );
  }
}

function renderDraft(): void {
  DRAFT_INPUT.value = state.draft;
}

async function addTodo(): Promise<void> {
  if (state.draft === "") return;
  await state.$.todos.update([
    ...state.todos,
    { id: crypto.randomUUID(), title: state.draft, done: false },
  ]);
  await state.$.draft.update("");
}

async function toggleTodo(event: MouseEvent): Promise<void> {
  const item = (event.target as HTMLElement).closest("li");
  if (item === null) return;
  const todos: Todo[] = [];
  for (const todo of state.todos) {
    if (todo.id === item.getAttribute("data-id")) {
      todos.push({ ...todo, done: todo.done === false });
    } else {
      todos.push(todo);
    }
  }
  await state.$.todos.update(todos);
}

async function captureDraft(): Promise<void> {
  await state.$.draft.update(DRAFT_INPUT.value);
}

async function selectFilter(event: MouseEvent): Promise<void> {
  const filter = (event.target as HTMLElement).getAttribute("data-filter");
  if (filter === null) return;
  await state.$.filter.update(filter);
}

async function toggleTheme(): Promise<void> {
  await state.$.darkMode.toggle();
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
