# Render functions

[← README](../README.md)

Aspen is deliberately pull-based. The schema is the only place that says what reacts to what, and every reaction is a plain function that fetches its own inputs. That keeps the whole update graph readable in one screen, and it means a `set()` costs exactly one storage write plus the functions you listed, with nothing diffed, scanned or observed.

To keep that shape, the constructor enforces a small contract on every function in an `onUpdate` list and throws if one is broken:

| Rule | Why |
|---|---|
| Must be a function | Catches `onUpdate: [renderTheme()]`, which passes the result of a call instead of the function |
| Must be named | Forces `onUpdate: [renderTheme]` so the schema reads as a map of names. Inline arrows are rejected |
| Must take no arguments | Render functions read state through `get()`, so they are equally correct on `bootstrap()`, `set()` and `pullPersistent()` |
| No duplicates in one list | Almost always a copy-paste mistake |

The list is frozen after construction, so it cannot be grown at runtime.

A render function should also be idempotent: calling it twice with the same state must produce the same DOM. `bootstrap()` and `importPersistent()` will call it whenever they like.

The intended flow, end to end, is in [hello-world.html](hello-world.html):

1. Declare the tree. Each key lists the render functions that depend on it.
2. Write render functions that select their own element and call `State.get()`, naming keys through `State.keys`.
3. Event handlers only call `State.set()`. They never touch the DOM.
4. Call `validateStorage()` then `bootstrap()` once the DOM is ready.

```js
const State = new StateTree("hello.", {
  clicks: { type: "number", persistent: true, default: 0, onUpdate: [renderCount] },
});

function renderCount() {
  document.getElementById("count").textContent = String(State.get(State.keys.clicks));
}

document.getElementById("increment").addEventListener("click", function increment() {
  State.set(State.keys.clicks, State.get(State.keys.clicks) + 1);
});

State.validateStorage();
State.bootstrap();
```

> **Bundler note.** The named-function check reads `fn.name` at runtime. Bun's transpiler may inline a `const render = () => {}` that is used only once, which erases the inferred name. Use a `function render() {}` declaration or a named expression such as `const render = function render() {}`. Both carry their own name and survive inlining.
