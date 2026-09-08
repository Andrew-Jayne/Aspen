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
  document.documentElement.setAttribute("data-theme", State.get(State.keys.theme));
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
| `onUpdate` | `(() => void)[]` | no | Named, zero-argument render functions fired after `set()` and during `bootstrap()`. See [render functions](example/render-functions.md) |

### `State.keys`

A frozen enum of every schema key, each mapped to its own name (`State.keys.theme === "theme"`). Prefer it over string literals: `State.get(State.keys.theme)`. In TypeScript a misspelled member is a compile error; in JS it is `undefined`, which `get()`/`set()` reject. See [enums](example/enums.md).

### `State.get(key)`

Returns the current value. Persistent keys read from localStorage; ephemeral keys read from an in-memory Map. Falls back to the default. `key` is a schema key name, ideally via `State.keys`.

### `State.set(key, value)`

Validates type and allowed list, writes to storage, then fires all `onUpdate` callbacks for that key.

### `State.bootstrap()`

Fires every key's `onUpdate` callbacks. Call once after DOM is ready to sync the UI with stored/default state.

### `State.validateStorage()`

Cleans up localStorage: migrates aliased keys, removes orphaned keys in the namespace, logs defaults. Call before `bootstrap()`.

### `State.exportPersistent()` / `State.importPersistent(data)`

Snapshot and restore all persistent keys as a `Record<string, string>`. Useful for backup/sync.

### `State.pushPersistent(url?)` / `State.pullPersistent(url?)`

Async remote persistence over HTTP — see [remote persistence](example/remote-persistence.md). Both use the constructor's `persistenceUrl` argument unless a URL is passed directly.

## Render functions

Aspen is pull-based: the schema is the only place that says what reacts to what, and every reaction is a named, zero-argument function that reads its own inputs through `get()`. The constructor enforces that contract and throws on anything else. The full rules, the intended wiring flow and a bundler caveat are in [example/render-functions.md](example/render-functions.md); the runnable version is [example/hello-world.html](example/hello-world.html).

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

`IndexedDBBackend` ships as an alternative with a larger quota and non-blocking writes. See [example/indexeddb.md](example/indexeddb.md).

## Remote persistence

Pass a `persistenceUrl` as the fourth constructor argument and `pushPersistent()` / `pullPersistent()` will PUT and GET the persistent state as JSON, so a user's state follows them across devices. Protocol details and a FastAPI reference server are in [example/remote-persistence.md](example/remote-persistence.md).

## Enums

Key names are covered by `State.keys`; values by a frozen object passed to `allowed`. Both patterns are worked through in [example/enums.md](example/enums.md).

## Examples

Everything in [example/](example/) runs from a static file server (`bun run example`):

| File | What it shows |
|---|---|
| [hello-world.html](example/hello-world.html) | The smallest complete app: schema, render functions, handlers, bootstrap |
| [index.html](example/index.html) + [app.js](example/app.js) | A themed editor with persistent settings and an ephemeral panel |
| [render-functions.md](example/render-functions.md) | The render-function contract and wiring flow |
| [enums.md](example/enums.md) | `State.keys` and value enums instead of magic strings |
| [indexeddb.md](example/indexeddb.md) | Swapping localStorage for `IndexedDBBackend` |
| [remote-persistence.md](example/remote-persistence.md) | Push/pull over HTTP, with a FastAPI reference server |

## Built with Aspen

- [Typewriter](https://github.com/Andrew-Jayne/Typewriter) — a simple, focused, and flexible tool for writing and reading with built-in markdown rendering

Using Aspen in a public project? Open a PR to add it here.

## Development

```sh
bun run build     # bundle to dist/aspen.min.js
bun run test      # 71 tests across 8 files
bun run lint      # biome + explicitjs
bun run check     # lint then test
```

## License

AGPL-3.0
