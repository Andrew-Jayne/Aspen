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

describe("validateStorage self-healing", () => {
  test("writes serialized defaults for missing persistent keys", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
      size: { type: "number", persistent: true, default: 16 },
    });
    state.validateStorage();

    expect(mockStorage.getItem("app.theme")).toBe("light");
    expect(mockStorage.getItem("app.size")).toBe("16");
  });

  test("resets tampered values that fail deserialization", () => {
    mockStorage.setItem("app.size", "banana");

    const state = new StateTree("app.", {
      size: { type: "number", persistent: true, default: 16 },
    });
    state.validateStorage();

    expect(mockStorage.getItem("app.size")).toBe("16");
    expect(state.get("size")).toBe(16);
  });

  test("resets values that parse but do not match the declared type", () => {
    mockStorage.setItem("app.prefs", "5");

    const state = new StateTree("app.", {
      prefs: { type: "dict", persistent: true, default: { open: true } },
    });
    state.validateStorage();

    expect(state.get("prefs")).toEqual({ open: true });
  });

  test("resets values outside the allowed list", () => {
    mockStorage.setItem("app.theme", "hotdog-stand");

    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: true,
        default: "light",
        allowed: ["light", "dark"],
      },
    });
    state.validateStorage();

    expect(mockStorage.getItem("app.theme")).toBe("light");
  });

  test("leaves valid stored values untouched", () => {
    mockStorage.setItem("app.theme", "dark");

    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: true,
        default: "light",
        allowed: ["light", "dark"],
      },
    });
    state.validateStorage();

    expect(mockStorage.getItem("app.theme")).toBe("dark");
  });

  test("heals invalid values arriving via alias migration", () => {
    mockStorage.setItem("tw.size", "not-a-number");

    const state = new StateTree("app.", {
      size: {
        type: "number",
        persistent: true,
        default: 16,
        aliases: ["tw.size"],
      },
    });
    state.validateStorage();

    expect(mockStorage.getItem("app.size")).toBe("16");
    expect(mockStorage.getItem("tw.size")).toBeNull();
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
    function countTheme() {
      themeCalls++;
    }
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: true,
        default: "light",
        onUpdate: [countTheme],
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
