# Aspen

**Application State Persistence Event Network** — a lightweight state manager for frameworkless browser apps. Schema-driven, type-validated, localStorage-backed, with zero dependencies.

Aspen trees look like individuals, separate trunks, separate branches, but underground they share a single root network, one organism keeping every tree in sync. Aspen the library works the same way: your components look independent, but they all draw from one shared, persisted store that propagates changes the moment something shifts.


## Install

**Drop-in JS** — grab `dist/aspen.min.js` (4KB) and load it with a script tag:

```html
<script type="module" src="aspen.min.js"></script>
```

**Drop-in TS** — grab `dist/aspen.ts` (single file, 353 lines, full types) and import it directly:

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

### `new StateTree(namespace, schema)`

Creates a state tree. The namespace prefixes all localStorage keys (e.g. `"app."` produces `"app.theme"`). The schema is a plain object where each key defines:

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"string" \| "number" \| "boolean" \| "list" \| "dict" \| "json"` | yes | Concrete type — validated on every `set()` |
| `persistent` | `boolean` | yes | `true` = localStorage, `false` = in-memory only |
| `default` | matching type | yes | Initial value, must pass type + allowed validation |
| `allowed` | `array` | no | Restrict values to this list |
| `aliases` | `string[]` | no | Old storage keys to migrate from |
| `onUpdate` | `(() => void)[]` | no | Callbacks fired after `set()` and during `bootstrap()` |

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

## Development

```sh
bun run build     # bundle to dist/aspen.min.js
bun run test      # 37 tests across 6 files
bun run lint      # biome + explicitjs
bun run check     # lint then test
```

## License

AGPL-3.0
