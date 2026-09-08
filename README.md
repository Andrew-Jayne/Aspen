# Aspen

**Application State Persistence Event Network** — a lightweight state manager for frameworkless browser apps. Schema-driven, type-validated, localStorage-backed, with zero dependencies.

Aspen trees look like individuals, separate trunks, separate branches, but underground they share a single root network, one organism keeping every tree in sync. Aspen the library works the same way: your components look independent, but they all draw from one shared, persisted store that propagates changes the moment something shifts.


## Install

**Drop-in JS** — grab `dist/aspen.min.js` (8KB minified, 2.6KB gzipped) and load it with a script tag:

```html
<script type="module" src="aspen.min.js"></script>
```

**Drop-in TS** — grab `dist/aspen.ts` (single file, full types) and import it directly:

```ts
import { StateTree } from "./aspen.ts";
```

**Install from GitHub** — works with Bun, npm, yarn, pnpm:

```sh
bun add github:Andrew-Jayne/Aspen
```

```ts
import { StateTree } from "aspen";
```

## Quick start

```js
import { StateTree } from "aspen";

const State = new StateTree("app.", {
  theme: {
    type: "string",
    persistent: true,
    default: "light",
    allowed: ["light", "dark"],
    onUpdate: [renderTheme],
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
  document.documentElement.setAttribute("data-theme", State.get("theme"));
}

// wire up events, then boot
State.validateStorage();
State.bootstrap();
```

## API

### `new StateTree(namespace, schema, storage?, persistenceUrl?)`

Creates a state tree. The namespace prefixes all storage keys (e.g. `"app."` produces `"app.theme"`).

| Argument | Type | Default | Description |
|---|---|---|---|
| `namespace` | `string` | required | Prefix for all storage keys |
| `schema` | object | required | Key definitions (see below) |
| `storage` | `StorageBackend` | `localStorage` | Backend for persistent keys |
| `persistenceUrl` | `string \| null` | `null` | Relative or absolute URL for remote push/pull |

The schema is a plain object where each key defines:

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"string" \| "number" \| "boolean" \| "list" \| "dict" \| "json"` | yes | Concrete type — validated on every `set()` |
| `persistent` | `boolean` | yes | `true` = localStorage, `false` = in-memory only |
| `default` | matching type | yes | Initial value, must pass type + allowed validation |
| `allowed` | `array` | no | Restrict values to this list |
| `aliases` | `string[]` | no | Old storage keys to migrate from |
| `onUpdate` | `(() => void)[]` | no | Named, zero-argument render functions fired after `set()` and during `bootstrap()`. See [Render functions](#render-functions) |

### `State.get(key)`

Returns the current value. Persistent keys read from localStorage; ephemeral keys read from an in-memory Map. Falls back to the default.

### `State.set(key, value)`

Validates type and allowed list, writes to storage, then fires all `onUpdate` callbacks for that key.

### `State.bootstrap()`

Fires every key's `onUpdate` callbacks. Call once after DOM is ready to sync the UI with stored/default state.

### `State.validateStorage()`

Cleans up localStorage: migrates aliased keys, removes orphaned keys in the namespace, logs defaults. Call before `bootstrap()`.

### `State.exportPersistent()` / `State.importPersistent(data)`

Snapshot and restore all persistent keys as a `Record<string, string>`. Useful for backup/sync.

### `State.pushPersistent(url?)` / `State.pullPersistent(url?)`

Async remote persistence over HTTP — see [Remote persistence](#remote-persistence). Both use the constructor's `persistenceUrl` argument unless a URL is passed directly.

## Render functions

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

The intended flow, end to end, is in [example/hello-world.html](example/hello-world.html):

1. Declare the tree. Each key lists the render functions that depend on it.
2. Write render functions that select their own element and call `State.get()`.
3. Event handlers only call `State.set()`. They never touch the DOM.
4. Call `validateStorage()` then `bootstrap()` once the DOM is ready.

```js
const State = new StateTree("hello.", {
  clicks: { type: "number", persistent: true, default: 0, onUpdate: [renderCount] },
});

function renderCount() {
  document.getElementById("count").textContent = String(State.get("clicks"));
}

document.getElementById("increment").addEventListener("click", function increment() {
  State.set("clicks", State.get("clicks") + 1);
});

State.validateStorage();
State.bootstrap();
```

> **Bundler note.** The named-function check reads `fn.name` at runtime. Bun's transpiler may inline a `const render = () => {}` that is used only once, which erases the inferred name. Use a `function render() {}` declaration or a named expression such as `const render = function render() {}`. Both carry their own name and survive inlining.

## Types

Six concrete types with built-in serialize/deserialize/validate:

| Type | JS type | Storage format |
|---|---|---|
| `string` | `string` | as-is |
| `number` | `number` | `String()` / `parseFloat()` |
| `boolean` | `boolean` | `"true"` / `"false"` |
| `list` | `unknown[]` | JSON |
| `dict` | `Record<string, unknown>` | JSON |
| `json` | `unknown` | JSON |

Custom `serialize` and `deserialize` functions can be provided per-key to override the defaults.

## Storage backends

By default, persistent keys live in localStorage. Any object implementing the `StorageBackend` interface (`getItem`, `setItem`, `removeItem`, `key`, `length` — the same shape as localStorage) can be passed as the third constructor argument.

### IndexedDB

`IndexedDBBackend` stores state in IndexedDB, which has a far larger quota than localStorage and does not block the main thread on writes. IndexedDB is async-only, so the backend keeps a full in-memory mirror: `open()` loads everything once, reads are served synchronously from the mirror, and writes are persisted in the background.

```js
import { IndexedDBBackend, StateTree } from "aspen";

const backend = await IndexedDBBackend.open("my-app");

const State = new StateTree("app.", {
  theme: { type: "string", persistent: true, default: "light" },
}, backend);

State.validateStorage();
State.bootstrap();
```

- `IndexedDBBackend.open(databaseName)` — async factory; resolves once existing state is loaded.
- `backend.flush()` — resolves once every write issued so far has been persisted.
- `backend.close()` — waits for pending writes, then closes the database.

Writes are eventually consistent: `set()` returns immediately and the IndexedDB write completes in the background. Call `flush()` if you need a durability guarantee (e.g. in a `beforeunload`/`pagehide` handler).

## Remote persistence

Pass a `persistenceUrl` (relative or absolute) as the fourth constructor argument and Aspen can push its persistent state to a server and pull it back — so a user's app state follows them across devices.

```js
const State = new StateTree("app.", {
  theme: { type: "string", persistent: true, default: "light" },
}, localStorage, `/state/${userId}`);

// on load: prefer remote state if the server has any
State.validateStorage();
const hadRemoteState = await State.pullPersistent();
State.bootstrap();

// on change (or on an interval / before unload): save to the server
await State.pushPersistent();
```

The protocol is two endpoints on the same URL:

- **`PUT <persistenceUrl>`** — `pushPersistent()` sends `exportPersistent()` as a JSON object of `{storageKey: serializedValue}`. Any 2xx response is success.
- **`GET <persistenceUrl>`** — `pullPersistent()` expects that same JSON object back and feeds it through `importPersistent()` (firing `onUpdate` callbacks). A 404 means "no saved state yet": `pullPersistent()` resolves `false` and leaves local state untouched. Any other non-2xx status throws.

Both methods accept a URL argument that overrides the configured one. Identify the user in the URL (e.g. `/state/123`) or via cookies/headers on your server — and authenticate requests in production; the reference implementation trusts the URL for brevity.

A ready-to-copy FastAPI reference server lives in [`example/persistence-server/main.py`](example/persistence-server/main.py):

```sh
pip install fastapi uvicorn
uvicorn main:app --reload
```

## Enum support

Use a frozen object + `Object.values()`:

```js
const Theme = { LIGHT: "light", DARK: "dark" };

const State = new StateTree("app.", {
  theme: {
    type: "string",
    persistent: true,
    default: Theme.LIGHT,
    allowed: Object.values(Theme),
    onUpdate: [renderTheme],
  },
});
```

## Built with Aspen

- [Typewriter](https://github.com/Andrew-Jayne/Typewriter) — a simple, focused, and flexible tool for writing and reading with built-in markdown rendering

Using Aspen in a public project? Open a PR to add it here.

## Development

```sh
bun run build     # bundle to dist/aspen.min.js
bun run test      # 60 tests across 8 files
bun run lint      # biome + explicitjs
bun run check     # lint then test
```

## License

AGPL-3.0
