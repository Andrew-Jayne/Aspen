import { describe, expect, test } from "bun:test";
import { StateTree } from "../src/index";
import { mockStorage } from "./helpers";

describe("persistence", () => {
  test("persistent keys write to localStorage", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
    });
    state.set("theme", "dark");
    expect(mockStorage.getItem("app.theme")).toBe("dark");
  });

  test("persistent keys read from localStorage", () => {
    mockStorage.setItem("app.theme", "dark");
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: true, default: "light" },
    });
    expect(state.get("theme")).toBe("dark");
  });

  test("ephemeral keys do not touch localStorage", () => {
    const state = new StateTree("app.", {
      modal: { type: "boolean", persistent: false, default: false },
    });
    state.set("modal", true);
    expect(mockStorage.getItem("app.modal")).toBeNull();
    expect(state.get("modal")).toBe(true);
  });

  test("number round-trips through localStorage correctly", () => {
    const state = new StateTree("app.", {
      size: { type: "number", persistent: true, default: 16 },
    });
    state.set("size", 24);
    expect(mockStorage.getItem("app.size")).toBe("24");
    expect(state.get("size")).toBe(24);
    expect(typeof state.get("size")).toBe("number");
  });

  test("boolean round-trips through localStorage correctly", () => {
    const state = new StateTree("app.", {
      flag: { type: "boolean", persistent: true, default: false },
    });
    state.set("flag", true);
    expect(mockStorage.getItem("app.flag")).toBe("true");
    expect(state.get("flag")).toBe(true);
    expect(typeof state.get("flag")).toBe("boolean");
  });
});
