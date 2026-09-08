import { describe, expect, test } from "bun:test";
import { StateTree } from "../src/index";
import { mockStorage } from "./helpers";

describe("onUpdate", () => {
  test("fires 0-arg functions on set()", () => {
    let callCount = 0;
    function countCall() {
      callCount++;
    }
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        onUpdate: [countCall],
      },
    });
    state.set("theme", "dark");
    expect(callCount).toBe(1);
    state.set("theme", "light");
    expect(callCount).toBe(2);
  });

  test("fires multiple onUpdate functions in order", () => {
    const order: string[] = [];
    function pushFirst() {
      order.push("first");
    }
    function pushSecond() {
      order.push("second");
    }
    function pushThird() {
      order.push("third");
    }
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        onUpdate: [pushFirst, pushSecond, pushThird],
      },
    });
    state.set("theme", "dark");
    expect(order).toEqual(["first", "second", "third"]);
  });

  test("onUpdate functions can read state via get()", () => {
    let captured = "";
    function captureTheme() {
      captured = state.get("theme");
    }
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        onUpdate: [captureTheme],
      },
    });
    state.set("theme", "dark");
    expect(captured).toBe("dark");
  });

  test("onUpdate can read multiple keys", () => {
    let result = "";
    function renderSummary() {
      result = `${state.get("mode")}-${state.get("size")}`;
    }
    const state = new StateTree("app.", {
      mode: {
        type: "string",
        persistent: false,
        default: "edit",
        onUpdate: [renderSummary],
      },
      size: {
        type: "number",
        persistent: false,
        default: 16,
        onUpdate: [renderSummary],
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
    function renderTheme() {
      calls.push("theme");
    }
    function renderSize() {
      calls.push("size");
    }
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        onUpdate: [renderTheme],
      },
      size: {
        type: "number",
        persistent: false,
        default: 16,
        onUpdate: [renderSize],
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
    function captureTheme() {
      captured = state.get("theme");
    }
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: true,
        default: "light",
        onUpdate: [captureTheme],
      },
    });
    state.bootstrap();
    expect(captured).toBe("dark");
  });
});

describe("onUpdate contract", () => {
  const base = { type: "string", persistent: false, default: "light" } as const;

  test("rejects a non-array", () => {
    expect(() => {
      new StateTree("app.", {
        theme: { ...base, onUpdate: (() => {}) as unknown as (() => void)[] },
      });
    }).toThrow(/must be an array/);
  });

  test("rejects a called function instead of a reference", () => {
    function renderTheme() {}
    expect(() => {
      new StateTree("app.", {
        theme: {
          ...base,
          onUpdate: [renderTheme() as unknown as () => void],
        },
      });
    }).toThrow(/non-function/);
  });

  test("rejects anonymous functions", () => {
    expect(() => {
      new StateTree("app.", {
        theme: { ...base, onUpdate: [() => {}] },
      });
    }).toThrow(/anonymous/);
  });

  test("rejects functions that declare parameters", () => {
    const renderTheme = (value: string) => value;
    expect(() => {
      new StateTree("app.", {
        theme: { ...base, onUpdate: [renderTheme as unknown as () => void] },
      });
    }).toThrow(/declares parameters/);
  });

  test("rejects the same function listed twice", () => {
    function renderTheme() {}
    expect(() => {
      new StateTree("app.", {
        theme: { ...base, onUpdate: [renderTheme, renderTheme] },
      });
    }).toThrow(/more than once/);
  });

  test("accepts named function declarations and bound methods", () => {
    function renderTheme() {}
    class View {
      render() {}
    }
    const view = new View();
    expect(() => {
      new StateTree("app.", {
        theme: { ...base, onUpdate: [renderTheme, view.render.bind(view)] },
      });
    }).not.toThrow();
  });

  test("freezes the callback list so it cannot grow at runtime", () => {
    function renderTheme() {}
    const callbacks = [renderTheme];
    const state = new StateTree("app.", {
      theme: { ...base, onUpdate: callbacks },
    });
    let extraCalls = 0;
    function sneaky() {
      extraCalls++;
    }
    callbacks.push(sneaky);
    state.set("theme", "dark");
    expect(extraCalls).toBe(0);
  });
});
