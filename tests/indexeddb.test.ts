import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { IndexedDBBackend, StateTree } from "../src/index";

let databaseCounter = 0;

function uniqueDatabaseName(): string {
  databaseCounter++;
  return `aspen-test-${databaseCounter}`;
}

describe("IndexedDBBackend", () => {
  test("getItem returns null for missing keys", async () => {
    const backend = await IndexedDBBackend.open(uniqueDatabaseName());
    expect(backend.getItem("nope")).toBeNull();
    await backend.close();
  });

  test("setItem / getItem round-trip synchronously", async () => {
    const backend = await IndexedDBBackend.open(uniqueDatabaseName());
    backend.setItem("app.theme", "dark");
    expect(backend.getItem("app.theme")).toBe("dark");
    expect(backend.length).toBe(1);
    expect(backend.key(0)).toBe("app.theme");
    await backend.close();
  });

  test("values persist across close and reopen", async () => {
    const databaseName = uniqueDatabaseName();

    const first = await IndexedDBBackend.open(databaseName);
    first.setItem("app.theme", "dark");
    first.setItem("app.size", "24");
    await first.flush();
    await first.close();

    const second = await IndexedDBBackend.open(databaseName);
    expect(second.getItem("app.theme")).toBe("dark");
    expect(second.getItem("app.size")).toBe("24");
    expect(second.length).toBe(2);
    await second.close();
  });

  test("removeItem deletes from the store durably", async () => {
    const databaseName = uniqueDatabaseName();

    const first = await IndexedDBBackend.open(databaseName);
    first.setItem("app.theme", "dark");
    first.removeItem("app.theme");
    expect(first.getItem("app.theme")).toBeNull();
    await first.flush();
    await first.close();

    const second = await IndexedDBBackend.open(databaseName);
    expect(second.getItem("app.theme")).toBeNull();
    expect(second.length).toBe(0);
    await second.close();
  });
});

describe("StateTree with IndexedDBBackend", () => {
  test("persistent keys read and write through the backend", async () => {
    const backend = await IndexedDBBackend.open(uniqueDatabaseName());
    const state = new StateTree(
      "app.",
      {
        theme: { type: "string", persistent: true, default: "light" },
        size: { type: "number", persistent: true, default: 16 },
      },
      backend,
    );

    expect(state.get("theme")).toBe("light");
    state.set("theme", "dark");
    state.set("size", 24);

    expect(state.get("theme")).toBe("dark");
    expect(state.get("size")).toBe(24);
    expect(backend.getItem("app.theme")).toBe("dark");
    expect(backend.getItem("app.size")).toBe("24");
    await backend.close();
  });

  test("state survives a full close and reopen cycle", async () => {
    const databaseName = uniqueDatabaseName();
    const schema = {
      theme: { type: "string", persistent: true, default: "light" },
    } as const;

    const firstBackend = await IndexedDBBackend.open(databaseName);
    const firstTree = new StateTree("app.", schema, firstBackend);
    firstTree.set("theme", "dark");
    await firstBackend.flush();
    await firstBackend.close();

    const secondBackend = await IndexedDBBackend.open(databaseName);
    const secondTree = new StateTree("app.", schema, secondBackend);
    expect(secondTree.get("theme")).toBe("dark");
    await secondBackend.close();
  });

  test("validateStorage removes orphans and heals defaults", async () => {
    const backend = await IndexedDBBackend.open(uniqueDatabaseName());
    backend.setItem("app.oldStuff", "garbage");
    backend.setItem("other.key", "keep");

    const state = new StateTree(
      "app.",
      {
        theme: { type: "string", persistent: true, default: "light" },
      },
      backend,
    );
    state.validateStorage();

    expect(backend.getItem("app.oldStuff")).toBeNull();
    expect(backend.getItem("other.key")).toBe("keep");
    expect(backend.getItem("app.theme")).toBe("light");
    await backend.close();
  });

  test("exportPersistent / importPersistent work through the backend", async () => {
    const backend = await IndexedDBBackend.open(uniqueDatabaseName());
    const state = new StateTree(
      "app.",
      {
        theme: { type: "string", persistent: true, default: "light" },
      },
      backend,
    );
    state.set("theme", "dark");

    expect(state.exportPersistent()).toEqual({ "app.theme": "dark" });

    state.importPersistent({ "app.theme": "light" });
    expect(state.get("theme")).toBe("light");
    await backend.close();
  });
});
