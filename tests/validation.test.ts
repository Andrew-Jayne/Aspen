import { describe, expect, test } from "bun:test";
import { StateTree } from "../src/index";

describe("type validation", () => {
  test("rejects string for number key", () => {
    const state = new StateTree("app.", {
      size: { type: "number", persistent: false, default: 16 },
    });
    expect(() => {
      (state as StateTree<Record<string, { type: "number" }>>).set(
        "size" as never,
        "big" as never,
      );
    }).toThrow("Type error");
  });

  test("rejects number for boolean key", () => {
    const state = new StateTree("app.", {
      flag: { type: "boolean", persistent: false, default: false },
    });
    expect(() => {
      (state as StateTree<Record<string, { type: "boolean" }>>).set(
        "flag" as never,
        1 as never,
      );
    }).toThrow("Type error");
  });

  test("rejects NaN for number key", () => {
    const state = new StateTree("app.", {
      size: { type: "number", persistent: false, default: 0 },
    });
    expect(() => {
      state.set("size", NaN);
    }).toThrow("Type error");
  });

  test("rejects non-array for list key", () => {
    const state = new StateTree("app.", {
      items: { type: "list", persistent: false, default: [] },
    });
    expect(() => {
      (state as StateTree<Record<string, { type: "list" }>>).set(
        "items" as never,
        "not a list" as never,
      );
    }).toThrow("Type error");
  });
});

describe("allowed values", () => {
  test("accepts a value in the allowed list", () => {
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        allowed: ["light", "dark", "diy"],
      },
    });
    state.set("theme", "dark");
    expect(state.get("theme")).toBe("dark");
  });

  test("works with Object.values() from an enum-like object", () => {
    const Theme = { LIGHT: "light", DARK: "dark", DIY: "diy" } as const;
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: Theme.LIGHT,
        allowed: Object.values(Theme),
      },
    });
    state.set("theme", Theme.DARK);
    expect(state.get("theme")).toBe("dark");
    expect(() => {
      state.set("theme", "neon" as "light");
    }).toThrow("not allowed");
  });

  test("works with a TS enum", () => {
    enum Mode {
      Edit = "edit",
      View = "view",
    }
    const state = new StateTree("app.", {
      mode: {
        type: "string",
        persistent: false,
        default: Mode.Edit,
        allowed: Object.values(Mode),
      },
    });
    state.set("mode", Mode.View);
    expect(state.get("mode")).toBe("view");
    expect(() => {
      state.set("mode", "preview" as Mode);
    }).toThrow("not allowed");
  });

  test("rejects a value not in the allowed list", () => {
    const state = new StateTree("app.", {
      theme: {
        type: "string",
        persistent: false,
        default: "light",
        allowed: ["light", "dark", "diy"],
      },
    });
    expect(() => {
      state.set("theme", "neon" as "light");
    }).toThrow("not allowed");
  });
});

describe("unregistered key", () => {
  test("get() throws for unknown key", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: false, default: "light" },
    });
    expect(() => {
      (state as StateTree<Record<string, { type: "string" }>>).get(
        "nope" as never,
      );
    }).toThrow('Key not registered: "nope"');
  });

  test("set() throws for unknown key", () => {
    const state = new StateTree("app.", {
      theme: { type: "string", persistent: false, default: "light" },
    });
    expect(() => {
      (state as StateTree<Record<string, { type: "string" }>>).set(
        "nope" as never,
        "val" as never,
      );
    }).toThrow('Key not registered: "nope"');
  });
});
