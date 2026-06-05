import { describe, expect, test } from "bun:test";
import { StateTree } from "../src/index";
import { mockStorage } from "./helpers";

describe("validateStorage", () => {
  test("removes orphaned keys in the namespace", () => {
    mockStorage.setItem("app.oldStuff", "garbage");
    mockStorage.setItem("app.theme", "dark");
    mockStorage.setItem("other.key", "keep");

    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
    });
    state.validateStorage();

    expect(mockStorage.getItem("app.oldStuff")).toBeNull();
    expect(mockStorage.getItem("app.theme")).toBe("dark");
    expect(mockStorage.getItem("other.key")).toBe("keep");
  });

  test("migrates aliased keys", () => {
    mockStorage.setItem("tw.theme", "dark");

    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: true,
        default: "light",
        aliases: ["tw.theme"],
      },
    });
    state.validateStorage();

    expect(mockStorage.getItem("app.theme")).toBe("dark");
    expect(mockStorage.getItem("tw.theme")).toBeNull();
  });

  test("does not overwrite current value when alias exists", () => {
    mockStorage.setItem("tw.theme", "old-dark");
    mockStorage.setItem("app.theme", "current-dark");

    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: true,
        default: "light",
        aliases: ["tw.theme"],
      },
    });
    state.validateStorage();

    expect(mockStorage.getItem("app.theme")).toBe("current-dark");
    expect(mockStorage.getItem("tw.theme")).toBeNull();
  });
});

describe("exportPersistent / importPersistent", () => {
  test("exports all persistent keys as storage-key → string", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
      size: { type: "number", persistent: true, default: 16 },
      modal: { type: "boolean", persistent: false, default: false },
    });
    state.set("theme", "dark");
    state.set("size", 24);
    state.set("modal", true);

    const snapshot = state.exportPersistent();
    expect(snapshot).toEqual({
      "app.theme": "dark",
      "app.size": "24",
    });
  });

  test("importPersistent restores state and fires onUpdate", () => {
    let themeCalls = 0;
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: true,
        default: "light",
        onUpdate: [() => themeCalls++],
      },
      size: { type: "number", persistent: true, default: 16 },
    });

    state.importPersistent({
      "app.theme": "dark",
      "app.size": "24",
    });

    expect(state.get("theme")).toBe("dark");
    expect(state.get("size")).toBe(24);
    expect(themeCalls).toBe(1);
  });

  test("importPersistent ignores unknown keys", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
    });
    state.importPersistent({
      "app.theme": "dark",
      "app.unknown": "ignored",
    });
    expect(state.get("theme")).toBe("dark");
  });
});
