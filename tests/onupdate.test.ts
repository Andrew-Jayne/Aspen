import { describe, expect, test } from "bun:test";
import { StateTree } from "../src/index";
import { mockStorage } from "./helpers";

describe("onUpdate", () => {
  test("fires 0-arg functions on set()", () => {
    let callCount = 0;
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        onUpdate: [() => callCount++],
      },
    });
    state.set("theme", "dark");
    expect(callCount).toBe(1);
    state.set("theme", "light");
    expect(callCount).toBe(2);
  });

  test("fires multiple onUpdate functions in order", () => {
    const order: string[] = [];
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        onUpdate: [
          () => order.push("first"),
          () => order.push("second"),
          () => order.push("third"),
        ],
      },
    });
    state.set("theme", "dark");
    expect(order).toEqual(["first", "second", "third"]);
  });

  test("onUpdate functions can read state via get()", () => {
    let captured = "";
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        onUpdate: [
          () => {
            captured = state.get("theme");
          },
        ],
      },
    });
    state.set("theme", "dark");
    expect(captured).toBe("dark");
  });

  test("onUpdate can read multiple keys", () => {
    let result = "";
    const state = new StateTree("app.", {
      mode: {
        type: "string",
        persistent: false,
        default: "edit",
        onUpdate: [
          () => {
            result = `${state.get("mode")}-${state.get("size")}`;
          },
        ],
      },
      size: {
        type: "number",
        persistent: false,
        default: 16,
        onUpdate: [
          () => {
            result = `${state.get("mode")}-${state.get("size")}`;
          },
        ],
      },
    });
    state.set("mode", "view");
    expect(result).toBe("view-16");
    state.set("size", 24);
    expect(result).toBe("view-24");
  });
});

describe("bootstrap", () => {
  test("fires all onUpdate functions", () => {
    const calls: string[] = [];
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        onUpdate: [() => calls.push("theme")],
      },
      size: {
        type: "number",
        persistent: false,
        default: 16,
        onUpdate: [() => calls.push("size")],
      },
      modal: {
        type: "boolean",
        persistent: false,
        default: false,
      },
    });
    state.bootstrap();
    expect(calls).toContain("theme");
    expect(calls).toContain("size");
  });

  test("onUpdate reads current stored values during bootstrap", () => {
    mockStorage.setItem("app.theme", "dark");
    let captured = "";
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: true,
        default: "light",
        onUpdate: [
          () => {
            captured = state.get("theme");
          },
        ],
      },
    });
    state.bootstrap();
    expect(captured).toBe("dark");
  });
});
