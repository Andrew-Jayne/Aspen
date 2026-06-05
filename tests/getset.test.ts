import { describe, expect, test } from "bun:test";
import { StateTree } from "../src/index";

describe("get and set — primitives", () => {
  test("string: returns default, then set value", () => {
    const state = new StateTree("app.", {
      name: { type: "string", persistent: false, default: "anon" },
    });
    expect(state.get("name")).toBe("anon");
    state.set("name", "alice");
    expect(state.get("name")).toBe("alice");
  });

  test("number: returns default, then set value", () => {
    const state = new StateTree("app.", {
      size: { type: "number", persistent: false, default: 16 },
    });
    expect(state.get("size")).toBe(16);
    state.set("size", 24);
    expect(state.get("size")).toBe(24);
  });

  test("boolean: returns default, then set value", () => {
    const state = new StateTree("app.", {
      open: { type: "boolean", persistent: false, default: false },
    });
    expect(state.get("open")).toBe(false);
    state.set("open", true);
    expect(state.get("open")).toBe(true);
  });
});

describe("get and set — collections", () => {
  test("list: round-trips through storage", () => {
    const state = new StateTree("app.", {
      items: { type: "list", persistent: true, default: [] },
    });
    state.set("items", [1, 2, 3]);
    expect(state.get("items")).toEqual([1, 2, 3]);
  });

  test("dict: round-trips through storage", () => {
    const state = new StateTree("app.", {
      prefs: { type: "dict", persistent: true, default: {} },
    });
    state.set("prefs", { color: "red", count: 5 });
    expect(state.get("prefs")).toEqual({ color: "red", count: 5 });
  });

  test("json: round-trips through storage", () => {
    const state = new StateTree("app.", {
      payload: { type: "json", persistent: true, default: null },
    });
    const data = { nested: { list: [1, "two", true] } };
    state.set("payload", data);
    expect(state.get("payload")).toEqual(data);
  });
});
