## Tooling

Bun-only project. No Node, no npm, no yarn.

- `bun run build` — bundle `src/index.ts` to `dist/aspen.min.js`
- `bun run test` — run test suite (51 tests across 7 files in `tests/`)
- `bun run lint` — biome check + explicitjs
- `bun run format` — biome auto-fix
- `bun run check` — lint then test

Test helpers are preloaded via `bunfig.toml`, not imported per-file.

## Code style

Must pass both linters before merge:

- **Biome** — formatting + lint rules (config in `biome.json`)
- **ExplicitJS** — no single-letter vars, no ternaries, no implicit-boolean arrows, no single-use functions. Run `explicitjs src/` to check.

No arrow functions with implicit boolean bodies — use braces and `return`.
No ternaries — use if/else.
Descriptive variable names everywhere, including generic type parameters (`Schema` not `S`, `Key` not `K`).

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
example/        — vanilla JS example app (single HTML file + aspen.min.js)
dist/           — build output (gitignored)
```

## API

`StateTree` is the main export. Constructed with a namespace, a schema object, and an optional `StorageBackend` (defaults to localStorage). Six types: `string`, `number`, `boolean`, `list`, `dict`, `json`. Keys are either `persistent` (storage backend) or ephemeral (in-memory Map). `onUpdate` callbacks fire on `set()` and `bootstrap()`.

`IndexedDBBackend` is a StorageBackend over IndexedDB: `await IndexedDBBackend.open(name)` hydrates an in-memory mirror, reads are sync from the mirror, writes persist in the background (`flush()` awaits them, `close()` flushes then closes).

Public methods: `get()`, `set()`, `bootstrap()`, `validateStorage()`, `exportPersistent()`, `importPersistent()`.
