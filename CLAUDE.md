## Tooling

Bun-only project. No Node, no npm, no yarn. Both linters (Biome and ExplicitJS) are dev dependencies, so `bun install` is the entire toolchain setup; no global installs.

- `bun run build` — bundle `src/index.ts` to `dist/aspen.min.js`
- `bun run test` — run test suite (67 tests across 8 files in `tests/`)
- `bun run lint` — biome check + explicitjs
- `bun run format` — biome auto-fix
- `bun run check` — lint then test

Test helpers are preloaded via `bunfig.toml`, not imported per-file.

## Code style

Must pass both linters before merge:

- **Biome** — formatting + lint rules (config in `biome.json`), pinned as a dev dependency
- **ExplicitJS** — no single-letter vars, no ternaries, no anonymous functions at all, no single-use functions, no optional params. Both opt-in extras (`arrow` and `optional_param`) are enabled via `.explicitrc.json`, which is the strictest configuration the tool offers. Run `bun run lint` (or `bunx explicitjs src/`) to check. Installed as a Bun dev dependency from the `v1beta3` release tarball of github.com/Andrew-Jayne/ExplicitJS (pinned by URL in package.json; no Deno or global install needed).

No arrow functions or `function` expressions anywhere in src/ (the `arrow` extra flags every one). Lookup tables use object method shorthand (`string(value: unknown): string { ... }`), callbacks that need closure state are bound class methods (`this.method.bind(this)`), and stateless handlers are module-level named functions. A module-level function referenced only from inside another function or method is not flagged as single-use; one defined and called in the same scope is.
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
example/        — vanilla JS example app (index.html + app.js), hello-world.html,
                  and the in-depth guides moved out of the README (*.md)
  persistence-server/  FastAPI reference server for remote persistence
dist/           — build output (gitignored)
```

## API

`StateTree` is the main export. Constructed with a namespace, a schema object, and two optional positional args: `storage` (a `StorageBackend`, defaults to localStorage) and `persistenceUrl` (`string | null`, URL for remote push/pull). Six types: `string`, `number`, `boolean`, `list`, `dict`, `json`. Keys are either `persistent` (storage backend) or ephemeral (in-memory Map). `onUpdate` callbacks fire on `set()` and `bootstrap()`. The constructor enforces that each is a named, zero-arg function with no duplicates, and freezes the list (see example/render-functions.md).

`IndexedDBBackend` is a StorageBackend over IndexedDB: `await IndexedDBBackend.open(name)` hydrates an in-memory mirror, reads are sync from the mirror, writes persist in the background (`flush()` awaits them, `close()` flushes then closes).

Public members: `keys` (frozen enum of schema key names), `get()`, `set()`, `bootstrap()`, `validateStorage()`, `exportPersistent()`, `importPersistent()`, `pushPersistent()`, `pullPersistent()`.

Remote persistence: `pushPersistent()` PUTs `exportPersistent()` JSON to the persistence URL; `pullPersistent()` GETs it back (404 → resolves false). FastAPI reference server in `example/persistence-server/main.py`.
