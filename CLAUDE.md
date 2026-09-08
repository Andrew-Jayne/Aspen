## Tooling

Bun-only project. No Node, no npm, no yarn.

- `bun run build` — bundle `src/index.ts` to `dist/aspen.min.js`
- `bun run test` — run test suite (67 tests across 8 files in `tests/`)
- `bun run lint` — biome check + explicitjs
- `bun run format` — biome auto-fix
- `bun run check` — lint then test

Test helpers are preloaded via `bunfig.toml`, not imported per-file.

## Code style

Must pass both linters before merge:

- **Biome** — formatting + lint rules (config in `biome.json`)
- **ExplicitJS** — no single-letter vars, no ternaries, no implicit-boolean arrows, no single-use functions, no optional params (`arg?:` — strict `optional_param` check opted into via `.explicitrc.json`). Run `explicitjs src/` to check. Installed as a Deno shim pinned to the `v1beta2` tag of github.com/Andrew-Jayne/ExplicitJS.

No arrow functions with implicit boolean bodies — use braces and `return`.
No ternaries — use if/else.
Descriptive variable names everywhere, including generic type parameters (`Schema` not `S`, `Key` not `K`).
No `undefined`, `??`, or `||` in src/ — absence is always `null`. Optional args are `arg: type | null = null` (defaults in the parameter list, not the body); internal fields are `| null`. For fallbacks, declare `let thing: type | null = null` and assign in an explicit `if`. Platform APIs that produce `undefined` are wrapped at the boundary: `Map` reads go through a `has()` check + `as` cast (see `lookupKey()` in stateTree.ts), optional `KeyDef` props are detected with `Object.hasOwn()`. `KeyDef` may keep `?` props for schema-author ergonomics; the constructor normalizes them to `null` immediately.

## Project structure

```
src/          — library source (TS)
  index.ts        re-exports public API
  stateTree.ts    StateTree class
  types.ts        TypeMap, KeyDef, ResolvedKey, AspenType
  storage.ts      StorageBackend interface + IndexedDBBackend
  seralize.ts     built-in serializers/deserializers
  validation.ts   built-in type validators
tests/          — bun test files
  helpers.ts      MockStorage + beforeEach/afterEach (preloaded)
example/        — vanilla JS example app (index.html + app.js) and hello-world.html
  persistence-server/  FastAPI reference server for remote persistence
dist/           — build output (gitignored)
```

## API

`StateTree` is the main export. Constructed with a namespace, a schema object, and two optional positional args: `storage` (a `StorageBackend`, defaults to localStorage) and `persistenceUrl` (`string | null`, URL for remote push/pull). Six types: `string`, `number`, `boolean`, `list`, `dict`, `json`. Keys are either `persistent` (storage backend) or ephemeral (in-memory Map). `onUpdate` callbacks fire on `set()` and `bootstrap()`. The constructor enforces that each is a named, zero-arg function with no duplicates, and freezes the list (see README "Render functions").

`IndexedDBBackend` is a StorageBackend over IndexedDB: `await IndexedDBBackend.open(name)` hydrates an in-memory mirror, reads are sync from the mirror, writes persist in the background (`flush()` awaits them, `close()` flushes then closes).

Public methods: `get()`, `set()`, `bootstrap()`, `validateStorage()`, `exportPersistent()`, `importPersistent()`, `pushPersistent()`, `pullPersistent()`.

Remote persistence: `pushPersistent()` PUTs `exportPersistent()` JSON to the persistence URL; `pullPersistent()` GETs it back (404 → resolves false). FastAPI reference server in `example/persistence-server/main.py`.
