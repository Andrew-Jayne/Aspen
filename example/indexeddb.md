# IndexedDB backend

[← README](../README.md)

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
